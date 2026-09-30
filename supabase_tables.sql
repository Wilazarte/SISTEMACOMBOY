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

do $$
declare
  t text;
  col record;
begin
  foreach t in array array['compras', 'almacen', 'planilla'] loop
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
      and table_name in ('perfiles', 'compras', 'almacen', 'planilla', 'observaciones')
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
  foreach t in array array['compras', 'almacen', 'planilla'] loop
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
grant select, insert, update, delete on public.compras, public.almacen, public.planilla, public.observaciones to authenticated;
-- Sin sesión (anon) no se accede a nada
revoke all on public.perfiles, public.compras, public.almacen, public.planilla, public.observaciones from anon;

-- ---------------------------------------------------------------------
-- 6. RLS. Se eliminan las políticas que hubiera en estas 5 tablas (por
--    ejemplo un "permitir todo" antiguo) y se crean las del ERP.
-- ---------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.compras enable row level security;
alter table public.almacen enable row level security;
alter table public.planilla enable row level security;
alter table public.observaciones enable row level security;

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('perfiles', 'compras', 'almacen', 'planilla', 'observaciones')
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

-- almacen (stock): lo ven Almacén y Compras; lo mueven compras directas (tesorería) y V°B° (almacén)
create policy almacen_select on public.almacen for select to authenticated
  using (public.puede_ver('/dashboard/almacen') or public.puede_ver('/dashboard/compras'));

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
  elsif serie not in ('REQ', 'OC', 'DJ') or rol is null then
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

-- ---------------------------------------------------------------------
-- 8. REALTIME: los cambios de una PC llegan al instante a las demás
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['compras', 'almacen', 'planilla', 'observaciones'] loop
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
    ('tesoreria', 'tesoreria', 'Tesorería / Compras',     array['/dashboard/compras', '/dashboard/tesoreria'], false),
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
