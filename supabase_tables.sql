-- =====================================================================
-- ERP COMBOY VID — Tablas, seguridad (RLS) y Realtime en Supabase
-- Ejecutar en: Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede ejecutar varias veces sin romper nada.
--
-- ANTES: crear los 5 usuarios en Authentication → Users → Add user →
-- "Create new user" (marcar "Auto Confirm User"):
--   creador@comboyvid.local    tesoreria@comboyvid.local   almacen@comboyvid.local
--   planilla@comboyvid.local   gerencia@comboyvid.local
-- (en el login se escribe solo "creador", "tesoreria", etc.)
-- Si se crean después, volver a ejecutar este archivo para generar sus perfiles.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PERFILES: rol y módulos permitidos de cada usuario de Supabase Auth
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  usuario text not null unique,
  rol text not null check (rol in ('creador', 'tesoreria', 'almacen', 'planilla', 'gerencia')),
  nombre text not null,
  modulos text[] not null default '{}',
  solo_lectura boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- DOCUMENTOS. Cada fila es un documento del ERP guardado como JSON:
--   compras  -> tipo: req_pendiente, req_procesado, cotizacion, orden, factura,
--               guia, proveedor, compra_directa, contador
--   almacen  -> tipo: stock
--   planilla -> tipo: trabajador
-- ---------------------------------------------------------------------
create table if not exists public.compras (
  tipo text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (tipo, id)
);

create table if not exists public.almacen (
  tipo text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (tipo, id)
);

create table if not exists public.planilla (
  tipo text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (tipo, id)
);

create table if not exists public.observaciones (
  id text primary key,
  modulo text not null,
  texto text not null,
  usuario text not null,
  fecha timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists observaciones_modulo_idx on public.observaciones (modulo);

-- updated_at automático
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
-- Funciones de permisos (security definer: leen perfiles sin pasar por RLS)
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
-- RLS
-- ---------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.compras enable row level security;
alter table public.almacen enable row level security;
alter table public.planilla enable row level security;
alter table public.observaciones enable row level security;

-- perfiles: cada usuario lee solo el suyo
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated using (id = auth.uid());

-- compras: la ven Compras y Almacén (Almacén necesita REQ, OC, facturas y guías para el V°B°)
drop policy if exists compras_select on public.compras;
create policy compras_select on public.compras for select to authenticated
  using (public.puede_ver('/dashboard/compras') or public.puede_ver('/dashboard/almacen'));

-- escriben: creador y tesorería todo; almacén solo sus documentos (REQ, V°B° de OC/guía).
-- La numeración (tipo 'contador') no se escribe directo: solo con siguiente_numero() (ver abajo).
drop policy if exists compras_escribir on public.compras;
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
drop policy if exists almacen_select on public.almacen;
create policy almacen_select on public.almacen for select to authenticated
  using (public.puede_ver('/dashboard/almacen') or public.puede_ver('/dashboard/compras'));

drop policy if exists almacen_escribir on public.almacen;
create policy almacen_escribir on public.almacen for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria', 'almacen'))
  with check (public.mi_rol() in ('creador', 'tesoreria', 'almacen'));

-- planilla: la ven quienes tienen el módulo; la editan creador y planilla
drop policy if exists planilla_select on public.planilla;
create policy planilla_select on public.planilla for select to authenticated
  using (public.puede_ver('/dashboard/planilla'));

drop policy if exists planilla_escribir on public.planilla;
create policy planilla_escribir on public.planilla for all to authenticated
  using (public.mi_rol() in ('creador', 'planilla'))
  with check (public.mi_rol() in ('creador', 'planilla'));

-- observaciones: las leen todos; las escribe gerencia (y el creador, que administra todo); las borran gerencia y creador
drop policy if exists observaciones_select on public.observaciones;
create policy observaciones_select on public.observaciones for select to authenticated
  using (public.mi_rol() is not null);

drop policy if exists observaciones_insert on public.observaciones;
create policy observaciones_insert on public.observaciones for insert to authenticated
  with check (public.mi_rol() in ('gerencia', 'creador'));

drop policy if exists observaciones_update on public.observaciones;
create policy observaciones_update on public.observaciones for update to authenticated
  using (public.mi_rol() in ('gerencia', 'creador')) with check (public.mi_rol() in ('gerencia', 'creador'));

drop policy if exists observaciones_delete on public.observaciones;
create policy observaciones_delete on public.observaciones for delete to authenticated
  using (public.mi_rol() in ('gerencia', 'creador'));

-- ---------------------------------------------------------------------
-- NUMERACIÓN atómica (REQ-ALM-001, OC-2026-0001, DJ-001)
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
  values ('contador', 'principal', jsonb_build_object(serie, 1))
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
  values ('contador', 'principal', jsonb_build_object(serie, greatest(minimo, 0)))
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
-- REALTIME: los cambios de una PC llegan al instante a las demás
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
-- PERFILES de los 5 usuarios (deben existir en Authentication → Users)
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
select usuario, rol, modulos, solo_lectura from public.perfiles order by usuario;
