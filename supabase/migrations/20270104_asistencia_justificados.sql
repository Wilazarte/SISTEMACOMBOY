-- =====================================================================
-- Planilla › Asistencia importada: detalle por día + días JUSTIFICADOS
-- (pedido de Williams 2026-11-27)
--
-- 1. importar_asistencia: además de DÍAS / HORAS / TARD. guarda el detalle del reloj por día
--    (data.detalle = { "2026-10-05": ["08:14:41|E", "14:04:42|S"], ... }) y CONSERVA los días
--    justificados que ya tenía el trabajador en ese periodo (data.justificados).
-- 2. editar_asistencia_creador: igual que antes, pero ya no borra el detalle ni los justificados.
-- 3. justificar_asistencia (NUEVA): agrega días justificados. Pide la contraseña de edición,
--    solo AGREGA (nunca quita) y no acepta un día que el reloj ya marcó como asistido.
--    En el cálculo del sueldo cada día justificado cuenta como día asistido.
--
-- Pegar en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- Roles: los mismos de antes (creador, sucursal, planilla, tesoreria, admin) + soporte.
-- =====================================================================

begin;

-- 1. Importar asistencia (Excel del reloj) con detalle por día
create or replace function public.importar_asistencia(p_periodo text, p_filas jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  per text := upper(regexp_replace(btrim(coalesce(p_periodo, '')), '\s+', ' ', 'g'));
  f jsonb;
  trab text;
  d integer;
  t integer;
  hr numeric;
  det jsonb;
  n integer := 0;
begin
  if rol is null or rol not in ('creador', 'sucursal', 'planilla', 'tesoreria', 'admin', 'soporte') then
    raise exception 'Su usuario no puede importar asistencia' using errcode = '42501';
  end if;
  if per = '' then
    raise exception 'Indique el periodo' using errcode = '22023';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Formato de asistencia inválido' using errcode = '22023';
  end if;
  for f in select value from jsonb_array_elements(p_filas) loop
    trab := btrim(f ->> 'trabajador');
    d := (f ->> 'dias')::integer;
    t := (f ->> 'tardanzas')::integer;
    hr := nullif(f ->> 'horas', '')::numeric; -- opcional: horas trabajadas según el reloj
    det := case when jsonb_typeof(f -> 'detalle') = 'object' then f -> 'detalle' else null end; -- opcional: marcas por día
    if trab is null or trab = '' or d is null or t is null or d < 0 or d > 31 or t < 0 or t > d
       or (hr is not null and (hr < 0 or hr > d * 24)) then
      raise exception 'Fila de asistencia inválida: %', f using errcode = '22023';
    end if;
    insert into public.planilla (tipo, id, data)
    values ('asistencia', per || '|' || trab, jsonb_build_object(
      'id', per || '|' || trab, 'periodo', per, 'trabajador', trab, 'dias', d, 'horas', hr, 'tardanzas', t,
      'detalle', det, 'justificados', '[]'::jsonb,
      'origen_edicion', 'RELOJ', 'updated_by', auth.uid(), 'updated_by_creator_id', null, 'fecha', now()))
    on conflict (tipo, id) do update set data = excluded.data
      || jsonb_build_object('justificados', coalesce(public.planilla.data -> 'justificados', '[]'::jsonb));
    n := n + 1;
  end loop;
  return n;
end $$;

-- 2. Módulo Creador: edición manual (conserva detalle y justificados)
create or replace function public.editar_asistencia_creador(p_periodo text, p_trabajador text, p_dias integer, p_tardanzas integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  per text := upper(regexp_replace(btrim(coalesce(p_periodo, '')), '\s+', ' ', 'g'));
  trab text := btrim(coalesce(p_trabajador, ''));
begin
  if public.mi_rol() is null or public.mi_rol() not in ('creador', 'sucursal', 'admin', 'soporte') then
    raise exception 'Edición no permitida fuera del módulo creador' using errcode = '42501';
  end if;
  if per = '' or trab = '' then
    raise exception 'Indique periodo y trabajador' using errcode = '22023';
  end if;
  if p_dias is null or p_dias < 0 or p_dias > 31 or p_tardanzas is null or p_tardanzas < 0 or p_tardanzas > p_dias then
    raise exception 'Días entre 0 y 31; tardanzas entre 0 y los días' using errcode = '22023';
  end if;
  if not exists (select 1 from public.planilla where tipo = 'trabajador' and id::text = trab) then
    raise exception 'El trabajador N° % no existe', trab using errcode = '22023';
  end if;
  insert into public.planilla (tipo, id, data)
  values ('asistencia', per || '|' || trab, jsonb_build_object(
    'id', per || '|' || trab, 'periodo', per, 'trabajador', trab, 'dias', p_dias, 'tardanzas', p_tardanzas,
    'origen_edicion', 'CREADOR', 'updated_by', auth.uid(), 'updated_by_creator_id', auth.uid(), 'fecha', now()))
  on conflict (tipo, id) do update set data = public.planilla.data || excluded.data;
end $$;

-- 3. Justificar días (solo agrega). Contraseña de edición validada aquí (se guarda solo su huella SHA-256).
create or replace function public.justificar_asistencia(p_periodo text, p_trabajador text, p_fechas text[], p_motivo text, p_clave text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  per text := upper(regexp_replace(btrim(coalesce(p_periodo, '')), '\s+', ' ', 'g'));
  trab text := btrim(coalesce(p_trabajador, ''));
  mot text := upper(btrim(coalesce(p_motivo, '')));
  fila jsonb;
  just jsonb;
  dias_reloj integer;
  fe text;
  n integer := 0;
begin
  if rol is null or rol not in ('creador', 'sucursal', 'planilla', 'tesoreria', 'admin', 'soporte') then
    raise exception 'Su usuario no puede justificar asistencia' using errcode = '42501';
  end if;
  if encode(sha256(convert_to(coalesce(p_clave, ''), 'UTF8')), 'hex') <> '7302e610807f159aa4aa5316969eea08200862e462c639d4a795aa2649eb5c77' then
    raise exception 'Contraseña de edición incorrecta' using errcode = '28P01';
  end if;
  if per = '' or trab = '' then
    raise exception 'Indique periodo y trabajador' using errcode = '22023';
  end if;
  if mot = '' then
    raise exception 'Escriba el motivo de la justificación' using errcode = '22023';
  end if;
  if p_fechas is null or array_length(p_fechas, 1) is null then
    raise exception 'Marque al menos un día' using errcode = '22023';
  end if;

  select data into fila from public.planilla where tipo = 'asistencia' and id = per || '|' || trab for update;
  if fila is null then
    if not exists (select 1 from public.planilla where tipo = 'trabajador' and id::text = trab) then
      raise exception 'El trabajador N° % no existe', trab using errcode = '22023';
    end if;
    fila := jsonb_build_object(
      'id', per || '|' || trab, 'periodo', per, 'trabajador', trab, 'dias', 0, 'horas', 0, 'tardanzas', 0,
      'detalle', '{}'::jsonb, 'origen_edicion', 'SISTEMA', 'updated_by', auth.uid(), 'updated_by_creator_id', null, 'fecha', now());
  end if;
  just := coalesce(fila -> 'justificados', '[]'::jsonb);
  dias_reloj := coalesce((fila ->> 'dias')::integer, 0);

  foreach fe in array p_fechas loop
    fe := btrim(fe);
    if fe !~ '^\d{4}-\d{2}-\d{2}$' or to_char(to_date(fe, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> fe then
      raise exception 'Fecha inválida: %', fe using errcode = '22023';
    end if;
    if coalesce(fila -> 'detalle', '{}'::jsonb) ? fe then
      raise exception 'El % ya figura como asistido en el reloj', to_char(to_date(fe, 'YYYY-MM-DD'), 'DD/MM/YYYY') using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(just) j where j ->> 'fecha' = fe) then
      continue; -- ya justificado: no se duplica
    end if;
    just := just || jsonb_build_array(jsonb_build_object('fecha', fe, 'motivo', mot, 'usuario', auth.uid(), 'en', now()));
    n := n + 1;
  end loop;

  if dias_reloj + jsonb_array_length(just) > 31 then
    raise exception 'Días asistidos + justificados no pueden pasar de 31' using errcode = '22023';
  end if;

  insert into public.planilla (tipo, id, data)
  values ('asistencia', per || '|' || trab, fila || jsonb_build_object('justificados', just))
  on conflict (tipo, id) do update set data = public.planilla.data || jsonb_build_object('justificados', just);
  return n;
end $$;

revoke all on function public.importar_asistencia(text, jsonb) from public, anon;
revoke all on function public.editar_asistencia_creador(text, text, integer, integer) from public, anon;
revoke all on function public.justificar_asistencia(text, text, text[], text, text) from public, anon;
grant execute on function public.importar_asistencia(text, jsonb) to authenticated;
grant execute on function public.editar_asistencia_creador(text, text, integer, integer) to authenticated;
grant execute on function public.justificar_asistencia(text, text, text[], text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Verificación: deben salir las 3 funciones
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('importar_asistencia', 'editar_asistencia_creador', 'justificar_asistencia');
