-- =====================================================================
-- ERP COMBOY VID — Tablas, seguridad (RLS), numeración y Realtime en Supabase
-- Ejecutar en: Supabase → SQL Editor → New query → pegar todo → Run.
--
-- Se puede ejecutar varias veces seguidas sin error. Si alguna tabla ya
-- existía con otra estructura, se le AGREGAN las columnas que faltan (no se
-- borran datos ni columnas existentes).
--
-- USUARIOS: después de ejecutar este archivo:
--   1. node --env-file=.env.local scripts/crear-usuarios.mjs   (crea los 5 usuarios con la Admin API)
--   2. supabase/perfiles.sql en el SQL Editor                   (crea sus perfiles)
-- NUNCA crear usuarios con INSERT directo en auth.users.
-- (en el login se escribe solo "creador", "tesoreria", etc.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFILES: rol y módulos permitidos de cada usuario de Supabase Auth
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade
);

alter table public.perfiles
  add column if not exists id uuid,
  add column if not exists usuario text,
  add column if not exists rol text,
  add column if not exists nombre text,
  add column if not exists modulos text[] not null default '{}',
  add column if not exists solo_lectura boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists perfiles_id_uidx on public.perfiles (id);
create unique index if not exists perfiles_usuario_uidx on public.perfiles (usuario);

-- Roles permitidos (si la tabla ya tenía otra regla sobre "rol", se reemplaza).
-- creador/tesoreria/almacen/planilla/gerencia: roles del ERP.
-- admin/compras/editor: roles antiguos que pudiera tener la tabla; el ERP los trata como solo lectura.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where con.conrelid = 'public.perfiles'::regclass and con.contype = 'c' and a.attname = 'rol'
  loop
    execute format('alter table public.perfiles drop constraint %I', c.conname);
  end loop;
  alter table public.perfiles
    add constraint perfiles_rol_check
    check (rol in ('creador', 'tesoreria', 'almacen', 'planilla', 'gerencia', 'admin', 'compras', 'editor')) not valid;
end $$;

-- ---------------------------------------------------------------------
-- 2. DOCUMENTOS. Cada fila es un documento del ERP guardado como JSON:
--   compras  -> tipo: req_pendiente, req_procesado, cotizacion, orden, factura,
--               guia, proveedor, compra_directa, contador
--   almacen  -> tipo: stock
--   planilla -> tipo: trabajador
-- ---------------------------------------------------------------------
create table if not exists public.compras (tipo text not null, id text not null, primary key (tipo, id));
create table if not exists public.almacen (tipo text not null, id text not null, primary key (tipo, id));
create table if not exists public.planilla (tipo text not null, id text not null, primary key (tipo, id));
-- ventas -> tipo: cliente, condicion_pago, nota_pedido, comprobante, cobro, asiento
-- (si la tabla ventas ya existía con otra estructura, se le agregan las columnas; sus filas se conservan)
create table if not exists public.ventas (tipo text not null, id text not null, primary key (tipo, id));

do $$
declare
  t text;
  col record;
begin
  foreach t in array array['compras', 'almacen', 'planilla', 'ventas'] loop
    execute format(
      'alter table public.%I
         add column if not exists tipo text,
         add column if not exists id text,
         add column if not exists data jsonb not null default ''{}''::jsonb,
         add column if not exists created_at timestamptz not null default now(),
         add column if not exists updated_at timestamptz not null default now(),
         add column if not exists updated_by uuid default auth.uid()', t);

    -- Los ids del ERP son texto ("7", uuid...): si la tabla tenía id numérico o uuid, se pasa a texto
    select c.data_type, c.is_identity into col
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t and c.column_name = 'id';
    if col.data_type not in ('text', 'character varying') then
      if col.is_identity = 'YES' then
        execute format('alter table public.%I alter column id drop identity if exists', t);
      end if;
      execute format('alter table public.%I alter column id drop default', t);
      execute format('alter table public.%I alter column id type text using id::text', t);
    end if;

    -- Columnas antiguas obligatorias que el ERP no llena (fecha, producto, cantidad...) -> opcionales
    for col in
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = t and is_nullable = 'NO' and column_default is null
        and is_identity = 'NO' and column_name not in ('id', 'tipo', 'data', 'created_at', 'updated_at')
        and column_name not in (
          select kcu.column_name from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
          where tc.table_schema = 'public' and tc.table_name = t and tc.constraint_type = 'PRIMARY KEY')
    loop
      execute format('alter table public.%I alter column %I drop not null', t, col.column_name);
    end loop;

    -- Clave usada al guardar (upsert por tipo + id)
    execute format('create unique index if not exists %I on public.%I (tipo, id)', t || '_tipo_id_uidx', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. OBSERVACIONES de gerencia por módulo
-- ---------------------------------------------------------------------
create table if not exists public.observaciones (id text primary key);

alter table public.observaciones
  add column if not exists id text,
  add column if not exists modulo text,
  add column if not exists texto text,
  add column if not exists usuario text,
  add column if not exists fecha timestamptz not null default now(),
  add column if not exists created_by uuid default auth.uid();

do $$
declare col record;
begin
  select c.data_type, c.is_identity into col
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'observaciones' and c.column_name = 'id';
  if col.data_type not in ('text', 'character varying') then
    if col.is_identity = 'YES' then
      alter table public.observaciones alter column id drop identity if exists;
    end if;
    alter table public.observaciones alter column id drop default;
    alter table public.observaciones alter column id type text using id::text;
  end if;
end $$;

create unique index if not exists observaciones_id_uidx on public.observaciones (id);
create index if not exists observaciones_modulo_idx on public.observaciones (modulo);

-- ---------------------------------------------------------------------
-- 4. Columnas antiguas obligatorias: si una tabla ya existía con columnas
--    NOT NULL que el ERP no usa, se vuelven opcionales para poder guardar.
-- ---------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('perfiles', 'compras', 'almacen', 'planilla', 'ventas', 'observaciones')
      and is_nullable = 'NO'
      and column_default is null
      and is_identity = 'NO'
      and column_name not in ('id', 'tipo', 'data', 'modulos', 'solo_lectura', 'created_at', 'updated_at', 'fecha')
      and (table_name, column_name) not in (
        select tc.table_name, kcu.column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
        where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY'
      )
  loop
    execute format('alter table public.%I alter column %I drop not null', c.table_name, c.column_name);
  end loop;
end $$;

-- updated_at / updated_by automáticos
create or replace function public.tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['compras', 'almacen', 'planilla', 'ventas'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Funciones de permisos (security definer: leen perfiles sin pasar por RLS)
-- ---------------------------------------------------------------------
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid()
$$;

create or replace function public.puede_ver(modulo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and ('*' = any (modulos) or modulo = any (modulos))
  )
$$;

grant usage on schema public to authenticated;
grant execute on function public.mi_rol() to authenticated;
grant execute on function public.puede_ver(text) to authenticated;
grant select on public.perfiles to authenticated;
grant select, insert, update, delete on public.compras, public.almacen, public.planilla, public.ventas, public.observaciones to authenticated;
-- Sin sesión (anon) no se accede a nada
revoke all on public.perfiles, public.compras, public.almacen, public.planilla, public.ventas, public.observaciones from anon;

-- ---------------------------------------------------------------------
-- 6. RLS. Se eliminan las políticas que hubiera en estas 5 tablas (por
--    ejemplo un "permitir todo" antiguo) y se crean las del ERP.
-- ---------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.compras enable row level security;
alter table public.almacen enable row level security;
alter table public.planilla enable row level security;
alter table public.ventas enable row level security;
alter table public.observaciones enable row level security;

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('perfiles', 'compras', 'almacen', 'planilla', 'ventas', 'observaciones')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- perfiles: el usuario logueado puede leer perfiles (el login lee su rol y módulos)
create policy "allow_select" on public.perfiles for select to authenticated using (true);

-- compras: la ven Compras y Almacén (Almacén necesita REQ, OC, facturas y guías para el V°B°)
create policy compras_select on public.compras for select to authenticated
  using (public.puede_ver('/dashboard/compras') or public.puede_ver('/dashboard/almacen'));

-- escriben: creador y tesorería todo; almacén solo sus documentos (REQ, V°B° de OC/guía).
-- La numeración (tipo 'contador') no se escribe directo: solo con siguiente_numero() (ver abajo).
create policy compras_escribir on public.compras for all to authenticated
  using (
    tipo <> 'contador' and (
      public.mi_rol() in ('creador', 'tesoreria')
      or (public.mi_rol() = 'almacen' and tipo in ('req_pendiente', 'req_procesado', 'orden', 'guia'))
    )
  )
  with check (
    tipo <> 'contador' and (
      public.mi_rol() in ('creador', 'tesoreria')
      or (public.mi_rol() = 'almacen' and tipo in ('req_pendiente', 'req_procesado', 'orden', 'guia'))
    )
  );

-- Planilla: solo el EGRESO por pago de planilla semanal (ver supabase/egreso_planilla.sql)
create policy compras_egreso_planilla on public.compras for all to authenticated
  using (public.mi_rol() = 'planilla' and tipo = 'factura' and data->>'tipoGasto' = 'PLANILLA')
  with check (public.mi_rol() = 'planilla' and tipo = 'factura' and data->>'tipoGasto' = 'PLANILLA');

-- almacen (stock y órdenes de despacho): lo ven Almacén, Compras y Ventas; lo mueven compras directas y
-- ventas (tesorería: crea la orden de despacho al emitir) y V°B° / despachos (almacén)
create policy almacen_select on public.almacen for select to authenticated
  using (public.puede_ver('/dashboard/almacen') or public.puede_ver('/dashboard/compras') or public.puede_ver('/dashboard/ventas'));

create policy almacen_escribir on public.almacen for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria', 'almacen'))
  with check (public.mi_rol() in ('creador', 'tesoreria', 'almacen'));

-- planilla: la ven quienes tienen el módulo; la editan creador y planilla
create policy planilla_select on public.planilla for select to authenticated
  using (public.puede_ver('/dashboard/planilla'));

-- DÍAS / TARD. (tipo 'asistencia') NO se escriben directo: solo con importar_asistencia()
-- y editar_asistencia_creador() (sección 7b). Cualquier otro intento -> error 42501 (prohibido).
create policy planilla_escribir on public.planilla for all to authenticated
  using (tipo <> 'asistencia' and public.mi_rol() in ('creador', 'planilla'))
  with check (tipo <> 'asistencia' and public.mi_rol() in ('creador', 'planilla'));

-- ventas: la ven quienes tienen el módulo Ventas; la editan creador y tesorería (la numeración va por siguiente_numero)
create policy ventas_select on public.ventas for select to authenticated
  using (public.puede_ver('/dashboard/ventas'));

create policy ventas_escribir on public.ventas for all to authenticated
  using (tipo <> 'contador' and public.mi_rol() in ('creador', 'tesoreria'))
  with check (tipo <> 'contador' and public.mi_rol() in ('creador', 'tesoreria'));

-- observaciones: las leen todos; las escribe gerencia (y el creador, que administra todo); las borran gerencia y creador
create policy observaciones_select on public.observaciones for select to authenticated
  using (public.mi_rol() is not null);

create policy observaciones_insert on public.observaciones for insert to authenticated
  with check (public.mi_rol() in ('gerencia', 'creador'));

create policy observaciones_update on public.observaciones for update to authenticated
  using (public.mi_rol() in ('gerencia', 'creador')) with check (public.mi_rol() in ('gerencia', 'creador'));

create policy observaciones_delete on public.observaciones for delete to authenticated
  using (public.mi_rol() in ('gerencia', 'creador'));

-- ---------------------------------------------------------------------
-- 7. NUMERACIÓN atómica (REQ-ALM-001, OC-2026-0001, DJ-001)
-- El contador vive en compras (tipo 'contador', id '00000000-0000-0000-0000-000000000001':
-- un UUID fijo para que sirva aunque compras.id sea de tipo uuid).
-- Si existe el contador antiguo con id 'principal', se une al nuevo (conserva el número más alto).
do $$
declare viejo jsonb;
begin
  select data into viejo from public.compras where tipo = 'contador' and id::text = 'principal';
  if viejo is not null then
    insert into public.compras (tipo, id, data)
    values ('contador', '00000000-0000-0000-0000-000000000001', viejo)
    on conflict (tipo, id) do update
      set data = (
        select coalesce(jsonb_object_agg(k, greatest(coalesce((public.compras.data ->> k)::integer, 0), coalesce((viejo ->> k)::integer, 0))), '{}'::jsonb)
        from (select jsonb_object_keys(public.compras.data) as k union select jsonb_object_keys(viejo)) claves
      );
    delete from public.compras where tipo = 'contador' and id::text = 'principal';
  end if;
end $$;

-- El UPDATE bloquea la fila del contador: si dos PCs piden número a la vez,
-- la segunda espera a la primera y nunca se repite un correlativo.
-- ---------------------------------------------------------------------
create or replace function public.siguiente_numero(serie text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  n integer;
begin
  if serie = 'REQ' and rol not in ('creador', 'almacen') then
    raise exception 'Su usuario no puede emitir requerimientos' using errcode = '42501';
  elsif serie = 'OC' and rol not in ('creador', 'tesoreria') then
    raise exception 'Su usuario no puede emitir órdenes de compra' using errcode = '42501';
  elsif serie = 'DJ' and rol is distinct from 'creador' then
    raise exception 'Su usuario no puede aprobar declaraciones juradas' using errcode = '42501';
  elsif serie in ('NP', 'F001', 'B001', 'OD') and rol not in ('creador', 'tesoreria') then
    raise exception 'Su usuario no puede emitir documentos de venta' using errcode = '42501';
  elsif serie = 'GST' and rol not in ('creador', 'tesoreria') then
    raise exception 'Su usuario no puede codificar gastos' using errcode = '42501';
  elsif (serie in ('BOL', 'RCT') or serie ~ '^BOL_[0-9]{4}$') and rol not in ('creador', 'planilla') then
    raise exception 'Su usuario no puede emitir boletas ni requerimientos de contratista' using errcode = '42501';
  elsif serie in ('EQ', 'OP') and rol not in ('creador', 'almacen') then
    raise exception 'Su usuario no puede registrar producción ni equipos terminados' using errcode = '42501';
  elsif (serie not in ('REQ', 'OC', 'DJ', 'NP', 'F001', 'B001', 'OD', 'BOL', 'GST', 'RCT', 'EQ', 'OP') and serie !~ '^BOL_[0-9]{4}$') or rol is null then
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;

  insert into public.compras (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(serie, 1))
  on conflict (tipo, id) do update
    set data = public.compras.data || jsonb_build_object(serie, coalesce((public.compras.data ->> serie)::integer, 0) + 1)
  returning (data ->> serie)::integer into n;
  return n;
end $$;

-- Migración: sube el contador a "minimo" si está por debajo (nunca lo baja). Solo el creador.
create or replace function public.asegurar_numero_minimo(serie text, minimo integer) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.mi_rol() is distinct from 'creador' then
    raise exception 'Solo el creador puede ajustar la numeración' using errcode = '42501';
  end if;
  if serie not in ('REQ', 'OC', 'DJ') then
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;
  insert into public.compras (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(serie, greatest(minimo, 0)))
  on conflict (tipo, id) do update
    set data = public.compras.data || jsonb_build_object(serie, greatest(coalesce((public.compras.data ->> serie)::integer, 0), minimo))
  returning (data ->> serie)::integer into n;
  return n;
end $$;

revoke all on function public.siguiente_numero(text) from public, anon;
revoke all on function public.asegurar_numero_minimo(text, integer) from public, anon;
grant execute on function public.siguiente_numero(text) to authenticated;
grant execute on function public.asegurar_numero_minimo(text, integer) to authenticated;

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
  hr numeric;
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
    hr := nullif(f ->> 'horas', '')::numeric; -- opcional: horas trabajadas según el reloj
    if trab is null or trab = '' or d is null or t is null or d < 0 or d > 31 or t < 0 or t > d
       or (hr is not null and (hr < 0 or hr > d * 24)) then
      raise exception 'Fila de asistencia inválida: %', f using errcode = '22023';
    end if;
    insert into public.planilla (tipo, id, data)
    values ('asistencia', per || '|' || trab, jsonb_build_object(
      'id', per || '|' || trab, 'periodo', per, 'trabajador', trab, 'dias', d, 'horas', hr, 'tardanzas', t,
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
  -- conserva las horas importadas del reloj (personal por hora): solo cambia días / tardanzas
  on conflict (tipo, id) do update set data = public.planilla.data || excluded.data;
end $$;

revoke all on function public.importar_asistencia(text, jsonb) from public, anon;
revoke all on function public.editar_asistencia_creador(text, text, integer, integer) from public, anon;
grant execute on function public.importar_asistencia(text, jsonb) to authenticated;
grant execute on function public.editar_asistencia_creador(text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 7c. VENTAS: condiciones de pago iniciales (editables en Ventas › Condiciones de pago)
-- ids fijos: se pueden ejecutar varias veces sin duplicar
-- ---------------------------------------------------------------------
insert into public.ventas (tipo, id, data)
select 'condicion_pago', v.id, jsonb_build_object(
  'id', v.id, 'codigo', v.codigo, 'nombre', v.nombre, 'dias', v.dias,
  'porcentajeInicial', v.inicial, 'contraentrega', v.contraentrega, 'activo', true)
from (
  values
    ('c0000000-0000-4000-8000-000000000001', 'CONTADO',   'Contado',                           0,  0,  false),
    ('c0000000-0000-4000-8000-000000000007', 'CRED07',    'Crédito 7 días',                    7,  0,  false),
    ('c0000000-0000-4000-8000-000000000015', 'CRED15',    'Crédito 15 días',                   15, 0,  false),
    ('c0000000-0000-4000-8000-000000000030', 'CRED30',    'Crédito 30 días',                   30, 0,  false),
    ('c0000000-0000-4000-8000-000000000045', 'CRED45',    'Crédito 45 días',                   45, 0,  false),
    ('c0000000-0000-4000-8000-000000000060', 'CRED60',    'Crédito 60 días',                   60, 0,  false),
    ('c0000000-0000-4000-8000-000000000100', 'CONTRAENT', 'Contraentrega',                     0,  0,  true),
    ('c0000000-0000-4000-8000-000000000050', 'ADEL50',    '50% adelanto · 50% contraentrega',  0,  50, true)
) as v (id, codigo, nombre, dias, inicial, contraentrega)
on conflict (tipo, id) do nothing;

-- ---------------------------------------------------------------------
-- 7d. BAUCHERS de pago de las órdenes de compra (Compras › Órdenes de compra)
--     Bucket privado "tesoreria", carpeta vouchers/ (JPG, PNG, PDF · máx. 5 MB).
--     Lo ven quienes ven las OC; solo Tesorería y Creador suben o borran.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tesoreria', 'tesoreria', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tesoreria_vouchers_select on storage.objects;
drop policy if exists tesoreria_vouchers_insert on storage.objects;
drop policy if exists tesoreria_vouchers_delete on storage.objects;

create policy tesoreria_vouchers_select on storage.objects for select to authenticated
  using (bucket_id = 'tesoreria' and (public.puede_ver('/dashboard/compras') or public.puede_ver('/dashboard/almacen')));

create policy tesoreria_vouchers_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tesoreria' and name like 'vouchers/%' and public.mi_rol() in ('creador', 'tesoreria'));

create policy tesoreria_vouchers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tesoreria' and name like 'vouchers/%' and public.mi_rol() in ('creador', 'tesoreria'));

-- ---------------------------------------------------------------------
-- 7e. HISTORIAL DE PLANILLA: snapshots permanentes por periodo (Planilla › Historial)
--     Copia (no referencia) de la planilla al "Cerrar semana"; ver supabase/historial_planilla.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 7f. CONDICIONES DE PAGO (tabla propia; ver supabase/condiciones_pago.sql)
-- ---------------------------------------------------------------------

create table if not exists public.condiciones_pago (
  id text primary key default gen_random_uuid()::text
);
alter table public.condiciones_pago
  add column if not exists codigo text,
  add column if not exists nombre text,
  add column if not exists tipo text not null default 'CONTADO',     -- CONTADO | CREDITO | PERSONALIZADO
  add column if not exists medio text,                                -- EFECTIVO, TRANSFERENCIA, DEPOSITO, YAPE, PLIN, TARJETA
  add column if not exists dias integer not null default 0,           -- días de crédito por defecto
  add column if not exists porcentaje_inicial numeric(5,2) not null default 0,
  add column if not exists contraentrega boolean not null default false,
  add column if not exists activo boolean not null default true,
  add column if not exists orden integer not null default 100,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid default auth.uid();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'condiciones_pago_codigo_key') then
    alter table public.condiciones_pago add constraint condiciones_pago_codigo_key unique (codigo);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'condiciones_pago_tipo_check') then
    alter table public.condiciones_pago add constraint condiciones_pago_tipo_check check (tipo in ('CONTADO', 'CREDITO', 'PERSONALIZADO')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'condiciones_pago_valores_check') then
    alter table public.condiciones_pago add constraint condiciones_pago_valores_check
      check (dias between 0 and 365 and porcentaje_inicial between 0 and 100 and (tipo <> 'CREDITO' or dias > 0)) not valid;
  end if;
end $$;

-- RLS: la ven quienes entran a Ventas; la editan creador y tesorería (igual que el resto de Ventas)
alter table public.condiciones_pago enable row level security;
drop policy if exists condiciones_pago_select on public.condiciones_pago;
drop policy if exists condiciones_pago_escribir on public.condiciones_pago;
create policy condiciones_pago_select on public.condiciones_pago for select to authenticated
  using (public.puede_ver('/dashboard/ventas'));
create policy condiciones_pago_escribir on public.condiciones_pago for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria'))
  with check (public.mi_rol() in ('creador', 'tesoreria'));
revoke all on public.condiciones_pago from anon;
grant select, insert, update, delete on public.condiciones_pago to authenticated;

-- Condiciones que ya existían en public.ventas (versión anterior): se copian con el mismo id
-- para que las notas de pedido, comprobantes y clientes que las usan sigan apuntando bien.
do $$
begin
  if to_regclass('public.ventas') is not null then
    insert into public.condiciones_pago (id, codigo, nombre, tipo, dias, porcentaje_inicial, contraentrega, activo, orden)
    select v.id,
           upper(coalesce(nullif(v.data ->> 'codigo', ''), v.id)),
           coalesce(nullif(v.data ->> 'nombre', ''), v.id),
           case when coalesce((v.data ->> 'dias')::int, 0) > 0 then 'CREDITO' else 'CONTADO' end,
           coalesce((v.data ->> 'dias')::int, 0),
           coalesce((v.data ->> 'porcentajeInicial')::numeric, 0),
           coalesce((v.data ->> 'contraentrega')::boolean, false),
           coalesce((v.data ->> 'activo')::boolean, true),
           50
    from public.ventas v
    where v.tipo = 'condicion_pago'
    on conflict do nothing;
  end if;
end $$;

-- Condiciones iniciales (ids fijos; los créditos usan los mismos ids de la versión anterior)
insert into public.condiciones_pago (id, codigo, nombre, tipo, medio, dias, orden)
values
  ('c0000000-0000-4000-8000-000000000201', 'EFECTIVO', 'Efectivo',               'CONTADO',       'EFECTIVO',      0,  1),
  ('c0000000-0000-4000-8000-000000000202', 'TRANSF',   'Transferencia bancaria', 'CONTADO',       'TRANSFERENCIA', 0,  2),
  ('c0000000-0000-4000-8000-000000000203', 'DEPOSITO', 'Depósito',               'CONTADO',       'DEPOSITO',      0,  3),
  ('c0000000-0000-4000-8000-000000000204', 'YAPE',     'Yape',                   'CONTADO',       'YAPE',          0,  4),
  ('c0000000-0000-4000-8000-000000000205', 'PLIN',     'Plin',                   'CONTADO',       'PLIN',          0,  5),
  ('c0000000-0000-4000-8000-000000000206', 'TARJETA',  'Tarjeta',                'CONTADO',       'TARJETA',       0,  6),
  ('c0000000-0000-4000-8000-000000000007', 'CRED07',   'Crédito 7 días',         'CREDITO',       null,            7,  7),
  ('c0000000-0000-4000-8000-000000000015', 'CRED15',   'Crédito 15 días',        'CREDITO',       null,            15, 8),
  ('c0000000-0000-4000-8000-000000000030', 'CRED30',   'Crédito 30 días',        'CREDITO',       null,            30, 9),
  ('c0000000-0000-4000-8000-000000000045', 'CRED45',   'Crédito 45 días',        'CREDITO',       null,            45, 10),
  ('c0000000-0000-4000-8000-000000000060', 'CRED60',   'Crédito 60 días',        'CREDITO',       null,            60, 11),
  ('c0000000-0000-4000-8000-000000000299', 'PERSONAL', 'Personalizado',          'PERSONALIZADO', null,            0,  12)
on conflict do nothing;

-- Realtime: una condición nueva aparece al instante en las otras PCs
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'condiciones_pago') then
    alter publication supabase_realtime add table public.condiciones_pago;
  end if;
end $$;

-- 7f (cont.) columnas de condición de pago en public.ventas
-- Columnas reales en public.ventas (numero_np, ruc, cliente_nombre, condicion_pago_id, condicion_pago_nombre,
-- dias_credito, fecha_vencimiento): se llenan solas con un trigger desde data; la app no cambia.
create or replace function public.ventas_columnas_pago() returns trigger
language plpgsql as $$
begin
  if new.tipo = 'cliente' then
    -- El cliente vive en la misma tabla ventas
    new.ruc := nullif(new.data ->> 'numDoc', '');
    new.cliente_nombre := nullif(new.data ->> 'razonSocial', '');
  elsif new.tipo in ('nota_pedido', 'comprobante') then
    new.ruc := nullif(regexp_replace(coalesce(new.data ->> 'clienteDoc', ''), '^\S+\s+', ''), '');
    new.cliente_nombre := nullif(new.data ->> 'cliente', '');
    new.condicion_pago_id := nullif(new.data ->> 'condPagoId', '');
    new.condicion_pago_nombre := nullif(new.data ->> 'condPagoNombre', '');
    new.dias_credito := round(coalesce(nullif(new.data ->> 'diasCredito', '')::numeric, 0))::int;
    new.fecha_vencimiento := nullif(coalesce(new.data ->> 'fechaVencimiento', new.data ->> 'fechaVenc'), '')::date;
    -- numero_np solo en la fila de la nota de pedido (el comprobante no lo repite: índice único)
    new.numero_np := case when new.tipo = 'nota_pedido' then nullif(new.data ->> 'numero', '') end;
  end if;
  return new;
end $$;

do $$
begin
  if to_regclass('public.ventas') is not null then
    alter table public.ventas
      add column if not exists tipo text,
      add column if not exists data jsonb not null default '{}'::jsonb,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now(),
      add column if not exists updated_by uuid default auth.uid(),
      add column if not exists condicion_pago_id text,
      add column if not exists condicion_pago_nombre text,
      add column if not exists dias_credito integer,
      add column if not exists fecha_vencimiento date,
      add column if not exists numero_np text,
      add column if not exists ruc text,
      add column if not exists cliente_nombre text;
    -- Las filas de clientes, cobros, asientos... no tienen N° de NP ni RUC
    alter table public.ventas alter column numero_np drop not null, alter column ruc drop not null, alter column cliente_nombre drop not null;
    -- Índice único del ERP (tipo, id): el guardado usa ON CONFLICT (tipo, id)
    if not exists (select 1 from public.ventas group by tipo, id having count(*) > 1) then
      create unique index if not exists ventas_tipo_id_uidx on public.ventas (tipo, id);
    end if;
    -- N° de nota de pedido único (las filas sin N° no chocan)
    if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'ventas' and indexdef ilike '%unique%(numero_np)%')
       and not exists (select 1 from public.ventas where numero_np is not null group by numero_np having count(*) > 1) then
      create unique index ventas_numero_np_uidx on public.ventas (numero_np);
    end if;
    drop trigger if exists ventas_columnas_pago on public.ventas;
    create trigger ventas_columnas_pago before insert or update on public.ventas
      for each row execute function public.ventas_columnas_pago();
    -- Filas que ya existían
    update public.ventas set data = data where tipo in ('cliente', 'nota_pedido', 'comprobante');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7g. ADELANTOS de sueldo (Planilla › Adelantos; ver supabase/adelantos.sql)
-- ---------------------------------------------------------------------

create table if not exists public.adelantos (
  id uuid primary key default gen_random_uuid()
);
alter table public.adelantos
  add column if not exists trabajador_nombre text,
  add column if not exists dni text,
  add column if not exists fecha date not null default current_date,
  add column if not exists monto numeric(10,2) not null default 0,
  add column if not exists motivo text,
  add column if not exists estado text not null default 'PENDIENTE', -- PENDIENTE | DESCONTADO | ANULADO
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid default auth.uid(),
  add column if not exists planilla_id uuid,          -- planilla_historial.id donde se descontó
  add column if not exists descontado_en timestamptz;

-- Estado sin importar mayúsculas ('pendiente' o 'PENDIENTE')
alter table public.adelantos drop constraint if exists adelantos_valores_check;
alter table public.adelantos add constraint adelantos_valores_check
  check (coalesce(btrim(trabajador_nombre), '') <> '' and monto > 0 and upper(estado) in ('PENDIENTE', 'DESCONTADO', 'ANULADO')
         and (dni is null or dni = '' or dni ~ '^\d{8}$')) not valid;

do $$
begin
  -- planilla_id -> planilla_historial (si el historial ya existe)
  if to_regclass('public.planilla_historial') is not null
     and not exists (select 1 from pg_constraint where conname = 'adelantos_planilla_id_fkey') then
    alter table public.adelantos add constraint adelantos_planilla_id_fkey
      foreign key (planilla_id) references public.planilla_historial (id) on delete set null not valid;
  end if;
end $$;
create index if not exists adelantos_pendientes_idx on public.adelantos (upper(estado), trabajador_nombre);
create index if not exists adelantos_fecha_idx on public.adelantos (fecha desc);

-- updated_at / updated_by al editar. Un adelanto DESCONTADO ya se pagó en una planilla: no se edita ni se borra.
create or replace function public.adelantos_actualizado() returns trigger
language plpgsql as $$
begin
  if upper(old.estado) = 'DESCONTADO' then
    raise exception 'El adelanto ya fue descontado en planilla: no se puede % ', case when tg_op = 'DELETE' then 'eliminar' else 'modificar' end
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  -- DESCONTADO solo lo pone el cierre de planilla (con planilla_id)
  if upper(new.estado) = 'DESCONTADO' and new.planilla_id is null then
    raise exception 'Un adelanto solo se marca DESCONTADO al pagar la planilla' using errcode = '55000';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists adelantos_actualizado on public.adelantos;
create trigger adelantos_actualizado before update or delete on public.adelantos
  for each row execute function public.adelantos_actualizado();

-- RLS: lo ven quienes entran a Planilla (incluida gerencia); lo editan planilla y creador
alter table public.adelantos enable row level security;
drop policy if exists adelantos_select on public.adelantos;
drop policy if exists adelantos_escribir on public.adelantos;
create policy adelantos_select on public.adelantos for select to authenticated
  using (public.puede_ver('/dashboard/planilla'));
create policy adelantos_escribir on public.adelantos for all to authenticated
  using (public.mi_rol() in ('creador', 'planilla', 'admin'))
  with check (public.mi_rol() in ('creador', 'planilla', 'admin'));
revoke all on public.adelantos from anon;
grant select, insert, update, delete on public.adelantos to authenticated;

-- Realtime: un adelanto registrado en una PC aparece al instante en las demás
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adelantos') then
    alter publication supabase_realtime add table public.adelantos;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 8. REALTIME: los cambios de una PC llegan al instante a las demás
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['compras', 'almacen', 'planilla', 'ventas', 'observaciones'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. PERFILES de los 5 usuarios (deben existir en Authentication → Users)
-- ---------------------------------------------------------------------
insert into public.perfiles (id, usuario, rol, nombre, modulos, solo_lectura)
select u.id, v.usuario, v.rol, v.nombre, v.modulos, v.solo_lectura
from (
  values
    ('creador',   'creador',   'Creador (administrador)', array['*'],                                          false),
    ('tesoreria', 'tesoreria', 'Tesorería / Compras',     array['/dashboard/compras', '/dashboard/tesoreria', '/dashboard/ventas'], false),
    ('almacen',   'almacen',   'Almacén',                 array['/dashboard/almacen'],                         false),
    ('planilla',  'planilla',  'Planilla',                array['/dashboard/planilla'],                        false),
    ('gerencia',  'gerencia',  'Gerencia (solo lectura)', array['*'],                                          true)
) as v (usuario, rol, nombre, modulos, solo_lectura)
join auth.users u on lower(u.email) = v.usuario || '@comboyvid.local'
on conflict (id) do update
  set usuario = excluded.usuario,
      rol = excluded.rol,
      nombre = excluded.nombre,
      modulos = excluded.modulos,
      solo_lectura = excluded.solo_lectura;

-- Verificación: debe listar los 5 usuarios
select p.usuario, p.rol, p.modulos, p.solo_lectura
from public.perfiles p
where p.usuario in ('creador', 'tesoreria', 'almacen', 'planilla', 'gerencia')
order by p.usuario;

-- =====================================================================
-- MÓDULO CONTABLE (también en supabase/contable_tables.sql)
-- =====================================================================
create table if not exists public.contable (tipo text not null, id text not null, primary key (tipo, id));
alter table public.contable
  add column if not exists tipo text,
  add column if not exists id text,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid default auth.uid();

create unique index if not exists contable_tipo_id_uidx on public.contable (tipo, id);
create index if not exists contable_periodo_idx on public.contable ((data->>'periodo')) where tipo = 'ASIENTO_DIARIO';

drop trigger if exists contable_updated_at on public.contable;
create trigger contable_updated_at before update on public.contable for each row execute function public.tocar_updated_at();

-- Permisos: ven el módulo Contable (creador / gerencia / perfiles con /dashboard/contable) y quienes
-- generan asientos automáticos (tesorería: NP y OC; planilla: pago de planilla).
grant select, insert, update, delete on public.contable to authenticated;
revoke all on public.contable from anon;
alter table public.contable enable row level security;
drop policy if exists contable_select on public.contable;
create policy contable_select on public.contable for select to authenticated
  using (public.puede_ver('/dashboard/contable') or public.mi_rol() in ('creador', 'tesoreria', 'planilla'));
drop policy if exists contable_escribir on public.contable;
create policy contable_escribir on public.contable for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria', 'planilla'))
  with check (public.mi_rol() in ('creador', 'tesoreria', 'planilla'));

-- Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contable') then
    alter publication supabase_realtime add table public.contable;
  end if;
end $$;
