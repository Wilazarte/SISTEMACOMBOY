-- =====================================================================
-- Parche: DÍAS / TARD. de Planilla solo editables con Importar asistencia o el Módulo Creador.
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- (Ya incluido en supabase_tables.sql; este archivo sirve para no volver a correr todo.)
-- =====================================================================

-- Escritura directa de tipo 'asistencia' bloqueada (42501)
drop policy if exists planilla_escribir on public.planilla;
create policy planilla_escribir on public.planilla for all to authenticated
  using (tipo <> 'asistencia' and public.mi_rol() in ('creador', 'planilla'))
  with check (tipo <> 'asistencia' and public.mi_rol() in ('creador', 'planilla'));

-- ---------------------------------------------------------------------
-- 7b. ASISTENCIA por periodo (DÍAS / TARD. de la planilla)
-- Documentos tipo 'asistencia' en public.planilla, id = '<PERIODO>|<N° huella>', con
-- data.origen_edicion ('RELOJ' | 'CREADOR' | 'SISTEMA') y data.updated_by_creator_id.
-- ---------------------------------------------------------------------

-- Importar asistencia (Excel del reloj): planilla, creador o admin. origen_edicion = 'RELOJ'.
create or replace function public.importar_asistencia(p_periodo text, p_filas jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  per text := upper(regexp_replace(btrim(coalesce(p_periodo, '')), '\s+', ' ', 'g'));
  f jsonb;
  trab text;
  d integer;
  t integer;
  n integer := 0;
begin
  if rol is null or rol not in ('creador', 'planilla', 'admin') then
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
    if trab is null or trab = '' or d is null or t is null or d < 0 or d > 31 or t < 0 or t > d then
      raise exception 'Fila de asistencia inválida: %', f using errcode = '22023';
    end if;
    insert into public.planilla (tipo, id, data)
    values ('asistencia', per || '|' || trab, jsonb_build_object(
      'id', per || '|' || trab, 'periodo', per, 'trabajador', trab, 'dias', d, 'tardanzas', t,
      'origen_edicion', 'RELOJ', 'updated_by', auth.uid(), 'updated_by_creator_id', null, 'fecha', now()))
    on conflict (tipo, id) do update set data = excluded.data;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Módulo Creador: edición manual. Solo creador / admin (permiso editar_asistencia_creador).
create or replace function public.editar_asistencia_creador(p_periodo text, p_trabajador text, p_dias integer, p_tardanzas integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  per text := upper(regexp_replace(btrim(coalesce(p_periodo, '')), '\s+', ' ', 'g'));
  trab text := btrim(coalesce(p_trabajador, ''));
begin
  if public.mi_rol() is null or public.mi_rol() not in ('creador', 'admin') then
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
  on conflict (tipo, id) do update set data = excluded.data;
end $$;

revoke all on function public.importar_asistencia(text, jsonb) from public, anon;
revoke all on function public.editar_asistencia_creador(text, text, integer, integer) from public, anon;
grant execute on function public.importar_asistencia(text, jsonb) to authenticated;
grant execute on function public.editar_asistencia_creador(text, text, integer, integer) to authenticated;

-- Verificación: las dos funciones y la política
select proname from pg_proc where proname in ('importar_asistencia', 'editar_asistencia_creador');
select policyname, qual from pg_policies where tablename = 'planilla';
