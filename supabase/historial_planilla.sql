-- =====================================================================
-- Historial de planilla: snapshots permanentes por periodo (Planilla › Historial).
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- Requiere public.mi_rol(), public.puede_ver() y public.perfiles (supabase_tables.sql).
-- (También incluido en supabase_tables.sql, sección 7e.)
--
-- Es una COPIA: no referencia a la asistencia ni a los trabajadores. Si después se
-- borra o cambia la asistencia, el historial queda igual.
-- =====================================================================

create table if not exists public.planilla_historial (
  id uuid primary key default gen_random_uuid(),
  periodo text unique not null, -- ej: "SEMANA 14 - ABRIL 2026"
  fecha_cierre timestamptz default now(),
  total_neto numeric(10,2),
  total_bruto numeric(10,2),
  cantidad_trabajadores int,
  creado_por text
);
alter table public.planilla_historial
  add column if not exists total_descuento numeric(10,2),
  add column if not exists total_adelantos numeric(10,2) default 0, -- adelantos descontados en este pago
  add column if not exists total_pagar numeric(10,2),                -- total_neto - total_adelantos
  add column if not exists total_horas numeric(10,2),
  add column if not exists creado_por_id uuid,
  add column if not exists asistencia_desde date, -- rango del Excel del reloj (si se importó)
  add column if not exists asistencia_hasta date;

create table if not exists public.planilla_historial_detalle (
  id uuid primary key default gen_random_uuid(),
  historial_id uuid references public.planilla_historial(id) on delete cascade,
  trabajador_id text,
  nombre text,
  dias numeric(10,2),
  horas numeric(10,2),
  tardanzas numeric(10,2),
  sueldo numeric(10,2),
  bruto numeric(10,2),
  neto numeric(10,2)
);
-- Columnas extra para ver la planilla "exactamente como se vio" ese día
alter table public.planilla_historial_detalle
  add column if not exists dni text,
  add column if not exists cargo text,
  add column if not exists fecha_ingreso date,
  add column if not exists tipo_sueldo text,
  add column if not exists pension text,
  add column if not exists afp_porcentaje numeric(6,2),
  add column if not exists valor_hora numeric(12,4),
  add column if not exists descuento_afp numeric(10,2),
  add column if not exists origen text,
  add column if not exists orden int,
  add column if not exists adelantos numeric(10,2) default 0, -- adelantos descontados al trabajador
  add column if not exists total_pagar numeric(10,2);         -- neto - adelantos
create index if not exists planilla_historial_detalle_historial on public.planilla_historial_detalle (historial_id);

-- RLS: leen quienes ven Planilla (planilla, creador, gerencia). Nadie escribe directo:
-- solo con cerrar_planilla(). Sin UPDATE ni DELETE: el historial es permanente.
alter table public.planilla_historial enable row level security;
alter table public.planilla_historial_detalle enable row level security;
drop policy if exists "all" on public.planilla_historial;
drop policy if exists "all" on public.planilla_historial_detalle;
drop policy if exists planilla_historial_select on public.planilla_historial;
drop policy if exists planilla_historial_detalle_select on public.planilla_historial_detalle;
create policy planilla_historial_select on public.planilla_historial for select to authenticated
  using (public.puede_ver('/dashboard/planilla'));
create policy planilla_historial_detalle_select on public.planilla_historial_detalle for select to authenticated
  using (public.puede_ver('/dashboard/planilla'));
revoke all on public.planilla_historial, public.planilla_historial_detalle from anon;
revoke insert, update, delete on public.planilla_historial, public.planilla_historial_detalle from authenticated;
grant select on public.planilla_historial, public.planilla_historial_detalle to authenticated;

-- Cerrar semana: copia la planilla del periodo (cabecera + detalle) en UNA transacción.
-- p_filas: [{trabajador_id, nombre, dni, cargo, fecha_ingreso, tipo_sueldo, pension, afp_porcentaje,
--            sueldo, dias, horas, tardanzas, valor_hora, bruto, descuento_afp, neto, origen}]
-- Si algo falla no queda nada a medias. Un periodo solo se cierra una vez.
create or replace function public.cerrar_planilla(p_periodo text, p_filas jsonb, p_desde date default null, p_hasta date default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  per text := upper(regexp_replace(btrim(coalesce(p_periodo, '')), '\s+', ' ', 'g'));
  hid uuid;
  malas int;
begin
  if rol is null or rol not in ('creador', 'planilla', 'admin') then
    raise exception 'Su usuario no puede cerrar la planilla' using errcode = '42501';
  end if;
  if per = '' then
    raise exception 'Indique el periodo' using errcode = '22023';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay trabajadores para guardar' using errcode = '22023';
  end if;
  if exists (select 1 from public.planilla_historial where periodo = per) then
    raise exception 'El periodo % ya está cerrado en el historial', per using errcode = '23505';
  end if;

  select count(*) into malas
  from jsonb_to_recordset(p_filas) as f(trabajador_id text, dias numeric, horas numeric, tardanzas numeric, bruto numeric, descuento_afp numeric, neto numeric,
                                        adelantos numeric, total_pagar numeric)
  where coalesce(btrim(f.trabajador_id), '') = ''
     or coalesce(f.dias, -1) < 0 or coalesce(f.horas, -1) < 0 or coalesce(f.tardanzas, -1) < 0
     or coalesce(f.bruto, -1) < 0 or coalesce(f.descuento_afp, -1) < 0
     or abs(coalesce(f.neto, 0) - (coalesce(f.bruto, 0) - coalesce(f.descuento_afp, 0))) > 0.01
     or coalesce(f.adelantos, 0) < 0 or coalesce(f.adelantos, 0) > coalesce(f.neto, 0) + 0.01
     or (f.total_pagar is not null and abs(f.total_pagar - (coalesce(f.neto, 0) - coalesce(f.adelantos, 0))) > 0.01);
  if malas > 0 then
    raise exception 'Hay % fila(s) de planilla inválidas', malas using errcode = '22023';
  end if;

  -- Adelantos a descontar: deben seguir PENDIENTES y sumar lo que se descuenta en cada fila.
  -- Se bloquean hasta terminar para que otra PC no los edite ni los descuente dos veces.
  if exists (select 1 from jsonb_array_elements(p_filas) x(fila) where jsonb_array_length(coalesce(x.fila -> 'adelanto_ids', '[]'::jsonb)) > 0) then
    if to_regclass('public.adelantos') is null then
      raise exception 'Falta la tabla adelantos: ejecute supabase/adelantos.sql' using errcode = '42P01';
    end if;
    perform 1 from public.adelantos a
    where a.id::text in (select jsonb_array_elements_text(coalesce(x.fila -> 'adelanto_ids', '[]'::jsonb)) from jsonb_array_elements(p_filas) x(fila))
    for update;
    select count(*) into malas
    from jsonb_array_elements(p_filas) as x(fila)
    cross join lateral (
      select count(*) as pedidos,
             count(a.id) filter (where upper(a.estado) = 'PENDIENTE') as pendientes,
             coalesce(sum(a.monto) filter (where upper(a.estado) = 'PENDIENTE'), 0) as suma
      from jsonb_array_elements_text(coalesce(x.fila -> 'adelanto_ids', '[]'::jsonb)) as i(id)
      left join public.adelantos a on a.id::text = i.id
    ) r
    where r.pedidos <> r.pendientes or abs(r.suma - coalesce((x.fila ->> 'adelantos')::numeric, 0)) > 0.01;
    if malas > 0 then
      raise exception 'Los adelantos cambiaron mientras se preparaba la planilla (ya descontados, editados o eliminados). Vuelva a intentarlo.'
        using errcode = '40001';
    end if;
  end if;

  insert into public.planilla_historial (periodo, total_neto, total_bruto, total_descuento, total_horas, total_adelantos, total_pagar,
                                         cantidad_trabajadores, creado_por, creado_por_id, asistencia_desde, asistencia_hasta)
  select per, sum(f.neto), sum(f.bruto), sum(f.descuento_afp), sum(f.horas), sum(coalesce(f.adelantos, 0)), sum(f.neto - coalesce(f.adelantos, 0)), count(*),
         (select coalesce(nullif(p.nombre, ''), p.usuario) from public.perfiles p where p.id = auth.uid()), auth.uid(), p_desde, p_hasta
  from jsonb_to_recordset(p_filas) as f(neto numeric, bruto numeric, descuento_afp numeric, horas numeric, adelantos numeric)
  returning id into hid;

  insert into public.planilla_historial_detalle (historial_id, orden, trabajador_id, nombre, dni, cargo, fecha_ingreso, tipo_sueldo, pension, afp_porcentaje,
                                                 sueldo, dias, horas, tardanzas, valor_hora, bruto, descuento_afp, neto, adelantos, total_pagar, origen)
  select hid, (x.ord)::int, btrim(f.trabajador_id), f.nombre, f.dni, f.cargo, nullif(f.fecha_ingreso, '')::date, f.tipo_sueldo, f.pension, f.afp_porcentaje,
         f.sueldo, f.dias, f.horas, f.tardanzas, f.valor_hora, f.bruto, f.descuento_afp, f.neto, coalesce(f.adelantos, 0), f.neto - coalesce(f.adelantos, 0), f.origen
  from jsonb_array_elements(p_filas) with ordinality as x(fila, ord)
  cross join lateral jsonb_to_record(x.fila) as f(trabajador_id text, nombre text, dni text, cargo text, fecha_ingreso text, tipo_sueldo text, pension text,
                                                   afp_porcentaje numeric, sueldo numeric, dias numeric, horas numeric, tardanzas numeric,
                                                   valor_hora numeric, bruto numeric, descuento_afp numeric, neto numeric, adelantos numeric, origen text);

  -- Adelantos pagados en esta planilla: PENDIENTE -> DESCONTADO con planilla_id
  if to_regclass('public.adelantos') is not null then
    update public.adelantos a set estado = 'DESCONTADO', planilla_id = hid, descontado_en = now()
    where a.id::text in (select jsonb_array_elements_text(coalesce(x.fila -> 'adelanto_ids', '[]'::jsonb)) from jsonb_array_elements(p_filas) x(fila));
  end if;
  return hid;
end $$;

revoke all on function public.cerrar_planilla(text, jsonb, date, date) from public, anon;
grant execute on function public.cerrar_planilla(text, jsonb, date, date) to authenticated;

-- adelantos.planilla_id -> planilla_historial (si adelantos.sql se ejecutó antes que este archivo)
do $$
begin
  if to_regclass('public.adelantos') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'adelantos' and column_name = 'planilla_id')
     and not exists (select 1 from pg_constraint where conname = 'adelantos_planilla_id_fkey') then
    alter table public.adelantos add constraint adelantos_planilla_id_fkey
      foreign key (planilla_id) references public.planilla_historial (id) on delete set null not valid;
  end if;
end $$;

-- Realtime: un cierre hecho en la PC aparece al instante en el celular
do $$
declare t text;
begin
  foreach t in array array['planilla_historial', 'planilla_historial_detalle'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Verificación
select periodo, fecha_cierre, cantidad_trabajadores, total_neto from public.planilla_historial order by fecha_cierre desc limit 5;
