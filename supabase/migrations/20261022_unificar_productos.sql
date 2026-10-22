-- =====================================================================
-- CATÁLOGO MAESTRO ÚNICO DE PRODUCTOS · ERP COMBOY VID
-- Ejecutar en Supabase › SQL Editor (se puede repetir sin duplicar nada). Sin BEGIN/COMMIT: el SQL Editor
-- ya corre el script completo y CREATE EXTENSION falla dentro de un bloque de transacción explícito.
-- pg_trgm vive en el schema public (no extensions): public.similarity, public.gin_trgm_ops, operator(public.%).
-- Si usa la Sucursal Beta, ejecute antes supabase/migrations/20261022_sucursal_beta.sql.
--
-- Problema: cada almacén escribía el producto a mano ("TEMPLE BLANCO PATO 25KG",
-- "Temple Blanco 25kg", "PATO TEMPLE") -> stock separado, REQ y OT que no coinciden.
--
-- Solución:
--   productos_maestro      un producto = una fila (SKU PROD-0001, nombre_normalizado UNIQUE)
--   productos_alias        nombres antiguos / variantes que apuntan al producto oficial
--   productos_solicitudes  pedidos de producto nuevo (los aprueba el administrador)
--   v_stock_almacenes      stock por almacén y producto_id (Taller, sedes y sucursal)
--   triggers               el stock (almacen / sucursal) solo acepta productos del catálogo
--
-- El stock sigue viviendo donde ya está (almacen / sucursal tipo stock): no se crea
-- una segunda tabla de cantidades que pueda descuadrarse. v_stock_almacenes lo muestra por producto_id.
--
-- public.almacen puede ser de dos formas y el script sirve para ambas:
--   documentos  (tipo, id, data jsonb)   data->>'nombre', data->>'sede', data->>'cantidad'
--   relacional  producto (PK, PROD-0001), sku, nombre_display | nombre, cantidad, almacen_id, sede_id
-- Las funciones almacen_* leen la fila como jsonb (to_jsonb), así nunca se nombra una columna que no existe.
-- =====================================================================

create extension if not exists pg_trgm with schema public;

-- 0. Revisión previa: el catálogo usa id uuid (si ya existía con otro tipo, se avisa en vez de romper a medias)
do $$
declare tipo text;
begin
  select data_type into tipo from information_schema.columns
   where table_schema = 'public' and table_name = 'productos_maestro' and column_name = 'id';
  if tipo is not null and tipo <> 'uuid' then
    raise exception 'productos_maestro.id es %, se esperaba uuid. Envíe a soporte: select column_name, data_type from information_schema.columns where table_name in (''productos_maestro'', ''productos_alias'', ''almacen'');', tipo;
  end if;
end $$;

-- 1. Normalización única (la misma que lib/productos-modelos.ts normalizarNombre):
--    MAYÚSCULAS, sin espacios al inicio/fin (también tabs y espacio duro), sin espacios dobles, "A / B" -> "A/B"
--    Si la función ya existe con otro nombre de parámetro (p. ej. "t"), se conserva ese nombre:
--    así no hace falta DROP ... CASCADE (que borraría el check de productos_maestro).
do $$
declare arg text;
begin
  select p.proargnames[1] into arg from pg_proc p where p.oid = to_regprocedure('public.normalizar_producto(text)');
  execute format($f$
    create or replace function public.normalizar_producto(%I text) returns text
    language sql immutable as $b$
      select btrim(regexp_replace(regexp_replace(upper(coalesce($1, '')), '[\s\u00a0]+', ' ', 'g'), '\s*/\s*', '/', 'g'))
    $b$ $f$, coalesce(nullif(arg, ''), 'nombre'));
end $$;

-- Funciones de este script creadas antes a mano con otros nombres de parámetro: se reemplazan
-- (CREATE OR REPLACE no puede renombrar parámetros). Las vistas que dependan se recrean más abajo.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure sig
      from (values ('public.producto_de_nombre(text)', array['nombre']),
                   ('public.productos_similares(text,real)', array['nombre', 'umbral']),
                   ('public.crear_producto_maestro(text,text,text,text,text,uuid)', array['p_nombre', 'p_unidad', 'p_marca', 'p_categoria', 'p_descripcion', 'p_solicitud']),
                   ('public.unificar_productos(uuid,uuid)', array['p_origen', 'p_destino'])) e(sig, nombres)
      join pg_proc p on p.oid = to_regprocedure(e.sig)
     where p.proargnames is distinct from e.nombres::text[]
  loop
    execute format('drop function %s cascade', f.sig);
  end loop;
end $$;

-- 2. Catálogo maestro
create sequence if not exists public.productos_sku_seq;

create table if not exists public.productos_maestro (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null default ('PROD-' || lpad(nextval('public.productos_sku_seq')::text, 4, '0')),
  nombre_normalizado text unique not null,
  nombre_display text not null,
  descripcion text,
  marca text,
  unidad text not null default 'UND',
  categoria text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint productos_nombre_norm_chk check (nombre_normalizado = public.normalizar_producto(nombre_normalizado) and nombre_normalizado <> '')
);
create index if not exists idx_productos_busqueda on public.productos_maestro using gin (to_tsvector('spanish', nombre_display));
-- Si productos_maestro ya existía con otras columnas, se completan (no se borra nada)
alter table public.productos_maestro add column if not exists sku text default ('PROD-' || lpad(nextval('public.productos_sku_seq')::text, 4, '0'));
alter table public.productos_maestro add column if not exists nombre_normalizado text;
alter table public.productos_maestro add column if not exists nombre_display text;
alter table public.productos_maestro add column if not exists descripcion text;
alter table public.productos_maestro add column if not exists marca text;
alter table public.productos_maestro add column if not exists unidad text not null default 'UND';
alter table public.productos_maestro add column if not exists categoria text;
alter table public.productos_maestro add column if not exists activo boolean not null default true;
alter table public.productos_maestro add column if not exists created_at timestamptz not null default now();
alter table public.productos_maestro add column if not exists created_by uuid default auth.uid();
create unique index if not exists productos_maestro_nombre_normalizado_uq on public.productos_maestro (nombre_normalizado);
create unique index if not exists productos_maestro_sku_uq on public.productos_maestro (sku);

-- Filas antiguas sin nombre_normalizado / nombre_display: se completan una con la otra (o con "nombre").
-- Si dos filas antiguas dan el mismo nombre normalizado, solo la más antigua lo recibe (unifique la otra en Catálogo).
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos_maestro' and column_name = 'nombre') then
    execute 'update public.productos_maestro set nombre_display = btrim(nombre) where coalesce(nombre_display, '''') = '''' and coalesce(btrim(nombre), '''') <> ''''';
  end if;
  update public.productos_maestro set nombre_display = nombre_normalizado where coalesce(nombre_display, '') = '' and coalesce(nombre_normalizado, '') <> '';
  update public.productos_maestro m set nombre_normalizado = x.norm
    from (select distinct on (public.normalizar_producto(nombre_display)) id, public.normalizar_producto(nombre_display) norm
            from public.productos_maestro
           where coalesce(nombre_normalizado, '') = '' and public.normalizar_producto(nombre_display) <> ''
           order by public.normalizar_producto(nombre_display), created_at, id) x
   where m.id = x.id
     and not exists (select 1 from public.productos_maestro o where o.nombre_normalizado = x.norm);

  -- Nombres guardados en minúsculas o con espacios dobles -> forma normalizada (si no choca con otro producto)
  update public.productos_maestro m set nombre_normalizado = x.norm
    from (select distinct on (public.normalizar_producto(nombre_normalizado)) id, public.normalizar_producto(nombre_normalizado) norm
            from public.productos_maestro
           where nombre_normalizado is distinct from public.normalizar_producto(nombre_normalizado) and public.normalizar_producto(nombre_normalizado) <> ''
           order by public.normalizar_producto(nombre_normalizado), created_at, id) x
   where m.id = x.id
     and not exists (select 1 from public.productos_maestro o where o.nombre_normalizado = x.norm);

  -- El check de nombre normalizado (pudo borrarse con un DROP FUNCTION ... CASCADE): se vuelve a poner.
  -- NOT VALID si quedan filas antiguas sin normalizar (las nuevas sí se revisan).
  if not exists (select 1 from pg_constraint where conrelid = 'public.productos_maestro'::regclass and conname = 'productos_nombre_norm_chk') then
    alter table public.productos_maestro add constraint productos_nombre_norm_chk
      check (nombre_normalizado = public.normalizar_producto(nombre_normalizado) and nombre_normalizado <> '') not valid;
  end if;
  begin
    alter table public.productos_maestro validate constraint productos_nombre_norm_chk;
  exception when check_violation then
    raise notice 'Hay productos con nombre sin normalizar repetido; unifíquelos en Catálogo de productos.';
  end;

  -- El SKU sigue después del mayor PROD-#### que ya exista
  perform setval('public.productos_sku_seq', greatest(coalesce(max(substring(sku from '^PROD-(\d+)$')::bigint), 0), 1),
                 coalesce(max(substring(sku from '^PROD-(\d+)$')::bigint), 0) > 0)
     from public.productos_maestro;
end $$;

create index if not exists idx_productos_trgm on public.productos_maestro using gin (nombre_normalizado public.gin_trgm_ops);

-- Variantes que ya existían con otro nombre (o que se unificaron): apuntan al producto oficial
create table if not exists public.productos_alias (
  alias_normalizado text primary key,
  producto_id uuid not null references public.productos_maestro(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- productos_alias de producción (id, producto_id, nombre_alias, nombre_alias_norm, created_at)
-- -> alias_normalizado text primary key. Ver 20261022_fix_productos_alias.sql (mismo bloque; se puede repetir).
do $$
declare
  pk text;
  pk_cols text[];
begin
  if to_regclass('public.productos_alias') is null then return; end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos_alias' and column_name = 'nombre_alias_norm')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos_alias' and column_name = 'alias_normalizado') then
    alter table public.productos_alias rename column nombre_alias_norm to alias_normalizado;
  end if;
  alter table public.productos_alias add column if not exists alias_normalizado text;
  alter table public.productos_alias add column if not exists created_at timestamptz not null default now();

  -- Alias vacío: se toma del nombre original; todos quedan normalizados igual que normalizar_producto()
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos_alias' and column_name = 'nombre_alias') then
    execute 'update public.productos_alias set alias_normalizado = nombre_alias where coalesce(alias_normalizado, '''') = ''''';
    execute 'alter table public.productos_alias alter column nombre_alias drop not null';
  end if;
  update public.productos_alias set alias_normalizado = public.normalizar_producto(alias_normalizado)
   where alias_normalizado is distinct from public.normalizar_producto(alias_normalizado);
  delete from public.productos_alias where coalesce(alias_normalizado, '') = '';

  -- Un alias, un producto: se queda el más antiguo
  delete from public.productos_alias where ctid in (
    select ctid from (select ctid, row_number() over (partition by alias_normalizado order by created_at, ctid) rn from public.productos_alias) x where rn > 1);

  -- Clave primaria = alias_normalizado (la antigua sobre id deja de serlo; id queda como columna opcional)
  select c.conname, array(select a.attname::text from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
    into pk, pk_cols
    from pg_constraint c where c.conrelid = 'public.productos_alias'::regclass and c.contype = 'p';
  if pk is not null and pk_cols <> array['alias_normalizado'] then
    execute format('alter table public.productos_alias drop constraint %I', pk);
    pk := null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos_alias' and column_name = 'id') then
    execute 'alter table public.productos_alias alter column id drop not null';
  end if;
  if pk is null then
    alter table public.productos_alias add constraint productos_alias_pkey primary key (alias_normalizado);
  end if;
end $$;

create index if not exists idx_productos_alias_producto on public.productos_alias (producto_id);

-- Pedidos de producto nuevo: cualquier usuario los pide, solo el administrador los aprueba
create table if not exists public.productos_solicitudes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  unidad text not null default 'UND',
  marca text,
  categoria text,
  motivo text,
  modulo text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  producto_id uuid references public.productos_maestro(id) on delete set null,
  respuesta text,
  solicitado_por uuid not null default auth.uid(),
  solicitado_usuario text,
  created_at timestamptz not null default now(),
  resuelto_at timestamptz
);

-- productos_solicitudes creada antes con otras columnas: se completan (solicitado_por puede ser text o uuid)
alter table public.productos_solicitudes add column if not exists nombre text;
alter table public.productos_solicitudes add column if not exists unidad text default 'UND';
alter table public.productos_solicitudes add column if not exists marca text;
alter table public.productos_solicitudes add column if not exists categoria text;
alter table public.productos_solicitudes add column if not exists motivo text;
alter table public.productos_solicitudes add column if not exists modulo text;
alter table public.productos_solicitudes add column if not exists estado text not null default 'pendiente';
alter table public.productos_solicitudes add column if not exists producto_id uuid;
alter table public.productos_solicitudes add column if not exists respuesta text;
alter table public.productos_solicitudes add column if not exists solicitado_por uuid default auth.uid();
alter table public.productos_solicitudes add column if not exists solicitado_usuario text;
alter table public.productos_solicitudes add column if not exists created_at timestamptz not null default now();
alter table public.productos_solicitudes add column if not exists resuelto_at timestamptz;

-- 3. Permisos: todos leen; solo el administrador (creador / admin) crea, edita y unifica (con las funciones de abajo)
create or replace function public.es_admin_productos() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mi_rol() in ('creador', 'admin')
$$;

alter table public.productos_maestro enable row level security;
alter table public.productos_alias enable row level security;
alter table public.productos_solicitudes enable row level security;

drop policy if exists productos_select on public.productos_maestro;
drop policy if exists productos_admin on public.productos_maestro;
drop policy if exists productos_alias_select on public.productos_alias;
drop policy if exists productos_alias_admin on public.productos_alias;
drop policy if exists productos_sol_select on public.productos_solicitudes;
drop policy if exists productos_sol_insert on public.productos_solicitudes;
drop policy if exists productos_sol_admin on public.productos_solicitudes;

create policy productos_select on public.productos_maestro for select to authenticated using (public.mi_rol() <> 'sin_rol');
create policy productos_admin on public.productos_maestro for all to authenticated using (public.es_admin_productos()) with check (public.es_admin_productos());
create policy productos_alias_select on public.productos_alias for select to authenticated using (public.mi_rol() <> 'sin_rol');
create policy productos_alias_admin on public.productos_alias for all to authenticated using (public.es_admin_productos()) with check (public.es_admin_productos());
create policy productos_sol_select on public.productos_solicitudes for select to authenticated using (solicitado_por::text = auth.uid()::text or public.es_admin_productos());
create policy productos_sol_insert on public.productos_solicitudes for insert to authenticated
  with check (solicitado_por::text = auth.uid()::text and estado = 'pendiente' and public.mi_rol() <> 'sin_rol');
create policy productos_sol_admin on public.productos_solicitudes for update to authenticated using (public.es_admin_productos()) with check (public.es_admin_productos());

grant select on public.productos_maestro, public.productos_alias to authenticated;
grant insert, update, delete on public.productos_maestro, public.productos_alias to authenticated;
grant select, insert, update on public.productos_solicitudes to authenticated;
grant usage on sequence public.productos_sku_seq to authenticated;
revoke all on public.productos_maestro, public.productos_alias, public.productos_solicitudes from anon;

-- 4. Búsqueda y similitud (pg_trgm): "¿Quisiste decir TEMPLE BLANCO PATO 25KG?"
create or replace function public.productos_similares(nombre text, umbral real default 0.8)
returns table (id uuid, sku text, nombre_display text, nombre_normalizado text, unidad text, similitud real)
language sql stable security definer set search_path = public as $$
  select p.id, p.sku, p.nombre_display, p.nombre_normalizado, p.unidad,
         greatest(public.similarity(p.nombre_normalizado, public.normalizar_producto(nombre)),
                  coalesce((select max(public.similarity(a.alias_normalizado, public.normalizar_producto(nombre))) from public.productos_alias a where a.producto_id::text = p.id::text), 0))::real as similitud
    from public.productos_maestro p
   where p.activo
     and (p.nombre_normalizado operator(public.%) public.normalizar_producto(nombre)
          or exists (select 1 from public.productos_alias a where a.producto_id::text = p.id::text and a.alias_normalizado operator(public.%) public.normalizar_producto(nombre))
          or p.nombre_normalizado = public.normalizar_producto(nombre))
   order by 6 desc
   limit 5
$$;
-- La lista de arriba usa el umbral por defecto de pg_trgm (0.3); quien llama filtra por "umbral"
grant execute on function public.productos_similares(text, real) to authenticated;

-- Producto oficial de un nombre (exacto o alias); null si no está en el catálogo
create or replace function public.producto_de_nombre(nombre text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.productos_maestro where nombre_normalizado = public.normalizar_producto(nombre)),
    (select p.id from public.productos_alias a join public.productos_maestro p on p.id::text = a.producto_id::text
      where a.alias_normalizado = public.normalizar_producto(nombre) limit 1))
$$;
grant execute on function public.producto_de_nombre(text) to authenticated;

-- Lectura de una fila de almacen sin importar su forma (r = to_jsonb(fila)).
-- Nombre: data->>'nombre' (documentos) o nombre_display / nombre / descripcion (relacional).
-- La columna producto solo se usa como nombre si no es un código PROD-0001.
create or replace function public.almacen_nombre(r jsonb) returns text
language sql immutable as $$
  select coalesce(nullif(btrim(r->'data'->>'nombre'), ''), nullif(btrim(r->>'nombre_display'), ''), nullif(btrim(r->>'nombre'), ''),
                  nullif(btrim(r->>'descripcion'), ''),
                  case when btrim(r->>'producto') !~* '^PROD-\d+$' then nullif(btrim(r->>'producto'), '') end)
$$;

create or replace function public.almacen_sku(r jsonb) returns text
language sql immutable as $$
  select coalesce(nullif(btrim(r->'data'->>'sku'), ''), nullif(btrim(r->>'sku'), ''),
                  case when btrim(r->>'producto') ~* '^PROD-\d+$' then upper(btrim(r->>'producto')) end)
$$;

create or replace function public.almacen_cantidad(r jsonb) returns numeric
language sql immutable as $$
  select case when x ~ '^\s*-?\d+(\.\d+)?\s*$' then x::numeric else 0 end
    from (select coalesce(r->'data'->>'cantidad', r->>'cantidad', r->>'stock_actual', r->>'stock') x) s
$$;

-- Almacén / ubicación dentro de la sede (data->>'sede' en documentos, almacen_id en relacional)
create or replace function public.almacen_ubicacion(r jsonb) returns text
language sql immutable as $$
  select coalesce(r->'data'->>'sede', r->>'almacen_id', r->>'almacen', r->>'ubicacion')
$$;

-- En documentos solo las filas tipo 'stock' son stock; en relacional todas lo son
create or replace function public.almacen_es_stock(r jsonb) returns boolean
language sql immutable as $$
  select coalesce(r->>'tipo', 'stock') = 'stock'
$$;

create or replace function public.almacen_unidad(r jsonb) returns text
language sql immutable as $$
  select coalesce(nullif(r->'data'->>'unidad', ''), nullif(r->>'unidad', ''))
$$;

-- Producto del catálogo de una fila: por nombre (o alias) y, si no tiene nombre, por SKU
create or replace function public.almacen_producto_id(r jsonb) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(public.producto_de_nombre(public.almacen_nombre(r)),
                  (select p.id from public.productos_maestro p where public.almacen_nombre(r) is null and p.sku = public.almacen_sku(r)))
$$;

grant execute on function public.almacen_nombre(jsonb), public.almacen_sku(jsonb), public.almacen_cantidad(jsonb),
  public.almacen_ubicacion(jsonb), public.almacen_es_stock(jsonb), public.almacen_unidad(jsonb), public.almacen_producto_id(jsonb) to authenticated;

-- almacen relacional: deja la fila (ctid) con el nombre oficial del producto (y producto_id si existe la columna),
-- solo si algo cambia. El código propio del almacén (producto / sku) no se toca: el SKU del catálogo sale en las vistas.
create or replace function public.almacen_enlazar(p_fila tid, p_producto uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.productos_maestro;
  cols text[];
  sets text[] := '{}';
  difs text[] := '{}';
begin
  select * into p from public.productos_maestro where id = p_producto;
  if not found then return; end if;
  cols := array(select column_name::text from information_schema.columns where table_schema = 'public' and table_name = 'almacen');
  if 'data' = any (cols) then return; end if;
  if 'nombre_display' = any (cols) then
    sets := sets || format('nombre_display = %L', p.nombre_display);
    difs := difs || format('nombre_display is distinct from %L', p.nombre_display);
  end if;
  if 'nombre' = any (cols) then
    sets := sets || format('nombre = %L', p.nombre_normalizado);
    difs := difs || format('nombre is distinct from %L', p.nombre_normalizado);
  end if;
  if 'producto_id' = any (cols) then
    sets := sets || format('producto_id = %L', p.id);
    difs := difs || format('producto_id::text is distinct from %L', p.id);
  end if;
  if cardinality(sets) > 0 then
    execute format('update public.almacen set %s where ctid = $1 and (%s)', array_to_string(sets, ', '), array_to_string(difs, ' or ')) using p_fila;
  end if;
end $$;
revoke execute on function public.almacen_enlazar(tid, uuid) from public, anon, authenticated;

-- El SKU automático sigue después del mayor PROD-#### del catálogo
create or replace function public.ajustar_secuencia_sku() returns void
language sql set search_path = public as $$
  select setval('public.productos_sku_seq', greatest(m, 1), m > 0)
    from (select coalesce(max(substring(sku from '^PROD-(\d+)$')::bigint), 0) m from public.productos_maestro) s
$$;

-- Carga del catálogo con todos los nombres que ya usa el ERP (stock de almacén de cualquier forma, REQ / cotizaciones /
-- OC / compras directas y stock de la sucursal), agrupados por nombre normalizado. No toca lo que ya está.
-- Un producto de almacén relacional conserva su SKU (PROD-0001) si el catálogo no lo usa; si no, recibe el siguiente libre.
create or replace function public.sembrar_productos() returns integer
language plpgsql set search_path = public as $$
declare
  fuentes text[] := array[$q$select public.almacen_nombre(j) nombre, public.almacen_unidad(j) unidad, null::text marca, public.almacen_sku(j) sku
                               from (select to_jsonb(a) j from public.almacen a) x where public.almacen_es_stock(j)$q$];
  consulta text;
  g record;
  libre text;
  n bigint;
  total integer := 0;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'compras' and column_name = 'data' and data_type = 'jsonb')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'compras' and column_name = 'tipo') then
    fuentes := array_append(fuentes, $q$select i->>'nombre', i->>'unidad', nullif(i->>'marca', ''), null::text
                               from public.compras c, jsonb_array_elements(case when jsonb_typeof(c.data->'items') = 'array' then c.data->'items' else '[]'::jsonb end) i
                              where c.tipo in ('req_pendiente', 'req_procesado', 'cotizacion', 'orden', 'compra_directa')$q$);
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sucursal' and column_name = 'data' and data_type = 'jsonb') then
    fuentes := array_append(fuentes, $q$select data->>'producto', data->>'unidad', null::text, null::text from public.sucursal where tipo = 'stock'$q$);
  end if;
  consulta := format($q$
    select public.normalizar_producto(nombre) norm, min(btrim(regexp_replace(nombre, '\s+', ' ', 'g'))) disp,
           coalesce(mode() within group (order by nullif(unidad, '')), 'UND') unidad, mode() within group (order by marca) marca,
           array_agg(distinct upper(btrim(sku)) order by upper(btrim(sku))) filter (where nullif(btrim(sku), '') is not null) skus
      from (%s) f
     where public.normalizar_producto(nombre) <> '' and public.producto_de_nombre(nombre) is null
     group by 1 order by 1$q$, array_to_string(fuentes, ' union all '));

  -- 1ª pasada: los que traen un SKU libre lo conservan (el primero libre de los códigos que usa ese nombre)
  for g in execute consulta loop
    select c into libre from unnest(g.skus) c where not exists (select 1 from public.productos_maestro where sku = c) limit 1;
    continue when libre is null;
    begin
      insert into public.productos_maestro (nombre_normalizado, nombre_display, unidad, marca, sku)
      values (g.norm, g.disp, g.unidad, g.marca, libre) on conflict (nombre_normalizado) do nothing;
      if found then total := total + 1; end if;
    exception when unique_violation then null;
    end;
  end loop;
  perform public.ajustar_secuencia_sku();

  -- 2ª pasada: el resto recibe el siguiente PROD-#### libre
  for g in execute consulta loop
    loop
      n := nextval('public.productos_sku_seq');
      exit when not exists (select 1 from public.productos_maestro where sku = 'PROD-' || lpad(n::text, 4, '0'));
    end loop;
    insert into public.productos_maestro (nombre_normalizado, nombre_display, unidad, marca, sku)
    values (g.norm, g.disp, g.unidad, g.marca, 'PROD-' || lpad(n::text, 4, '0')) on conflict (nombre_normalizado) do nothing;
    if found then total := total + 1; end if;
  end loop;
  perform public.ajustar_secuencia_sku();
  return total;
end $$;

-- Cada fila de stock queda con el nombre oficial y su productoId / SKU (almacen de cualquier forma y sucursal)
create or replace function public.enlazar_stock() returns integer
language plpgsql set search_path = public as $$
declare
  r record;
  n integer := 0;
  k integer;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'almacen' and column_name = 'data') then
    update public.almacen a
       set data = a.data || jsonb_build_object('nombre', p.nombre_normalizado, 'productoId', p.id, 'sku', p.sku)
      from public.productos_maestro p
     where a.tipo = 'stock' and p.id = public.producto_de_nombre(a.data->>'nombre')
       and (a.data->>'productoId' is distinct from p.id::text or a.data->>'sku' is distinct from p.sku
            or a.data->>'nombre' is distinct from p.nombre_normalizado);
    get diagnostics n = row_count;
  else
    for r in select a.ctid fila, public.almacen_producto_id(to_jsonb(a)) pid from public.almacen a where public.almacen_es_stock(to_jsonb(a)) loop
      continue when r.pid is null;
      perform public.almacen_enlazar(r.fila, r.pid);
      n := n + 1;
    end loop;
  end if;

  if to_regclass('public.sucursal') is not null then
    execute $q$
      update public.sucursal s
         set data = s.data || jsonb_build_object('producto', p.nombre_normalizado, 'productoMaestroId', p.id, 'sku', p.sku)
        from public.productos_maestro p
       where s.tipo = 'stock' and p.id = public.producto_de_nombre(s.data->>'producto')
         and (s.data->>'productoMaestroId' is distinct from p.id::text or s.data->>'producto' is distinct from p.nombre_normalizado)
    $q$;
    get diagnostics k = row_count;
    n := n + k;
  end if;
  return n;
end $$;
revoke execute on function public.ajustar_secuencia_sku(), public.sembrar_productos(), public.enlazar_stock() from public, anon, authenticated;

-- 5. Alta de producto (solo administrador). Rechaza el mismo nombre normalizado o un alias existente.
create or replace function public.crear_producto_maestro(
  p_nombre text, p_unidad text default 'UND', p_marca text default null, p_categoria text default null,
  p_descripcion text default null, p_solicitud uuid default null
) returns public.productos_maestro
language plpgsql security definer set search_path = public as $$
declare
  norm text := public.normalizar_producto(p_nombre);
  existente public.productos_maestro;
  nuevo public.productos_maestro;
begin
  if not public.es_admin_productos() then
    raise exception 'Solo el administrador crea productos en el catálogo maestro. Use "Solicitar nuevo producto".' using errcode = '42501';
  end if;
  if norm = '' then
    raise exception 'Ingrese el nombre del producto.' using errcode = '22023';
  end if;
  select p.* into existente from public.productos_maestro p where p.id = public.producto_de_nombre(norm);
  if found then
    raise exception 'PRODUCTO_YA_EXISTE: Ya existe como % (%). Use ese producto para todos los almacenes.', existente.nombre_display, existente.sku using errcode = '23505';
  end if;
  insert into public.productos_maestro (nombre_normalizado, nombre_display, unidad, marca, categoria, descripcion)
  values (norm, btrim(regexp_replace(p_nombre, '\s+', ' ', 'g')), coalesce(nullif(btrim(p_unidad), ''), 'UND'),
          nullif(btrim(p_marca), ''), nullif(btrim(p_categoria), ''), nullif(btrim(p_descripcion), ''))
  returning * into nuevo;
  if p_solicitud is not null then
    update public.productos_solicitudes set estado = 'aprobada', producto_id = nuevo.id, resuelto_at = now() where id = p_solicitud;
  end if;
  return nuevo;
end $$;
grant execute on function public.crear_producto_maestro(text, text, text, text, text, uuid) to authenticated;

-- 6. Unificar duplicados: "origen" pasa a ser alias de "destino"; el stock de cada almacén se suma
--    en el producto oficial (con el nombre oficial). Los documentos históricos (REQ, OC, kardex) no se tocan.
create or replace function public.unificar_productos(p_origen uuid, p_destino uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.productos_maestro;
  d public.productos_maestro;
  nombres text[];
  r record;
  dest record;
  col_cant text;
  movidos integer := 0;
begin
  if not public.es_admin_productos() then
    raise exception 'Solo el administrador unifica productos.' using errcode = '42501';
  end if;
  if p_origen = p_destino then raise exception 'Elija dos productos distintos.' using errcode = '22023'; end if;
  select * into o from public.productos_maestro where id = p_origen;
  select * into d from public.productos_maestro where id = p_destino;
  if o.id is null or d.id is null then raise exception 'Producto no encontrado.' using errcode = '22023'; end if;

  nombres := array(select o.nombre_normalizado union select alias_normalizado from public.productos_alias where producto_id::text = o.id::text);

  -- almacen relacional (sin columna data): por almacen_id + sede_id; la cantidad se suma en la fila del destino
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'almacen' and column_name = 'data') then
    col_cant := (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'almacen'
                  and column_name in ('cantidad', 'stock_actual', 'stock') order by array_position(array['cantidad', 'stock_actual', 'stock'], column_name::text) limit 1);
    for r in select a.ctid fila, to_jsonb(a) j from public.almacen a
              where public.almacen_es_stock(to_jsonb(a)) and public.almacen_producto_id(to_jsonb(a)) = o.id loop
      select a.ctid fila, to_jsonb(a) j into dest from public.almacen a
       where a.ctid <> r.fila and public.almacen_producto_id(to_jsonb(a)) = d.id
         and public.almacen_ubicacion(to_jsonb(a)) is not distinct from public.almacen_ubicacion(r.j)
         and to_jsonb(a)->>'sede_id' is not distinct from r.j->>'sede_id'
       limit 1;
      if found and col_cant is not null then
        execute format('update public.almacen set %1$I = coalesce(%1$I, 0) + $1 where ctid = $2', col_cant)
          using public.almacen_cantidad(r.j), dest.fila;
        delete from public.almacen where ctid = r.fila;
      else
        perform public.almacen_enlazar(r.fila, d.id);
      end if;
      dest := null;
      movidos := movidos + 1;
    end loop;
  else
    -- Stock de almacén en documentos (tipo stock): por sede + unidad
    for r in select id, data from public.almacen where tipo = 'stock' and public.normalizar_producto(data->>'nombre') = any (nombres) loop
      select id, data into dest from public.almacen
       where tipo = 'stock' and id <> r.id and data->>'sede' = r.data->>'sede' and coalesce(data->>'unidad', '') = coalesce(r.data->>'unidad', '')
         and public.normalizar_producto(data->>'nombre') = d.nombre_normalizado limit 1;
      if found then
        update public.almacen set data = data || jsonb_build_object('cantidad', coalesce((data->>'cantidad')::numeric, 0) + coalesce((r.data->>'cantidad')::numeric, 0), 'actualizado', now())
         where tipo = 'stock' and id = dest.id;
        delete from public.almacen where tipo = 'stock' and id = r.id;
      else
        update public.almacen set data = data || jsonb_build_object('nombre', d.nombre_normalizado, 'productoId', d.id, 'sku', d.sku) where tipo = 'stock' and id = r.id;
      end if;
      dest := null;
      movidos := movidos + 1;
    end loop;
  end if;

  -- Stock local de la sucursal (si existe la tabla)
  if to_regclass('public.sucursal') is not null then
    for r in execute 'select id, data from public.sucursal where tipo = ''stock'' and public.normalizar_producto(data->>''producto'') = any ($1)' using nombres loop
      execute 'select id, data from public.sucursal where tipo = ''stock'' and id <> $1 and coalesce(data->>''sucursalId'', '''') = coalesce($2, '''')
                 and public.normalizar_producto(data->>''producto'') = $3 limit 1'
        into dest using r.id, r.data->>'sucursalId', d.nombre_normalizado;
      if dest.id is not null then
        execute 'update public.sucursal set data = data || jsonb_build_object(''stock'', coalesce((data->>''stock'')::numeric, 0) + $2) where tipo = ''stock'' and id = $1'
          using dest.id, coalesce((r.data->>'stock')::numeric, 0);
        execute 'delete from public.sucursal where tipo = ''stock'' and id = $1' using r.id;
      else
        execute 'update public.sucursal set data = data || jsonb_build_object(''producto'', $2::text, ''productoMaestroId'', $3::text, ''sku'', $4::text) where tipo = ''stock'' and id = $1'
          using r.id, d.nombre_normalizado, d.id::text, d.sku;
      end if;
      dest := null;
      movidos := movidos + 1;
    end loop;
  end if;

  -- Alias: todos los nombres del origen apuntan ahora al destino
  update public.productos_alias set producto_id = d.id where producto_id::text = o.id::text;
  insert into public.productos_alias (alias_normalizado, producto_id) values (o.nombre_normalizado, d.id)
  on conflict (alias_normalizado) do update set producto_id = excluded.producto_id;
  update public.productos_solicitudes set producto_id = d.id where producto_id::text = o.id::text;
  delete from public.productos_maestro where id = o.id;

  return jsonb_build_object('destino', d.sku, 'origen', o.sku, 'filas_stock', movidos);
end $$;
grant execute on function public.unificar_productos(uuid, uuid) to authenticated;

-- 7. Carga inicial del catálogo y 8. stock enlazado al producto oficial (ver sembrar_productos / enlazar_stock)
select public.sembrar_productos() as productos_nuevos;
select public.enlazar_stock() as filas_enlazadas;

-- 8b. Documentos: si al normalizar quedaron dos filas del mismo producto en la misma sede y unidad, se suman en una.
--     (almacen relacional: cada fila es su propio producto/código; los duplicados se juntan con "Unificar")
do $$
declare g record;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'almacen' and column_name = 'data') then
    return;
  end if;
  for g in
    select data->>'sede' sede, coalesce(data->>'unidad', '') unidad, data->>'nombre' nombre,
           array_agg(id order by created_at) ids, sum(coalesce((data->>'cantidad')::numeric, 0)) total
      from public.almacen where tipo = 'stock' group by 1, 2, 3 having count(*) > 1
  loop
    update public.almacen set data = data || jsonb_build_object('cantidad', g.total, 'actualizado', now()) where tipo = 'stock' and id = g.ids[1];
    delete from public.almacen where tipo = 'stock' and id = any (g.ids[2:]);
  end loop;
end $$;

-- 9. Regla en la base: el stock solo acepta productos del catálogo (mismo nombre en todos los almacenes).
--    Una fila antigua cuyo producto no está en el catálogo se puede seguir editando (cantidad, etc.)
--    mientras no cambie de producto; un alta o un cambio de producto sí debe ser del catálogo.
create or replace function public.exigir_producto_maestro() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(new);
  documento boolean := r ? 'data';
  campo text := case when tg_table_name = 'sucursal' then 'producto' else 'nombre' end;
  campo_id text := case when tg_table_name = 'sucursal' then 'productoMaestroId' else 'productoId' end;
  nombre text;
  antes text;
  pid uuid;
  p public.productos_maestro;
begin
  if coalesce(r->>'tipo', 'stock') <> 'stock' then return new; end if;
  if documento then
    nombre := r->'data'->>campo;
    pid := public.producto_de_nombre(nombre);
    if tg_op = 'UPDATE' then antes := to_jsonb(old)->'data'->>campo; end if;
  else
    nombre := coalesce(public.almacen_nombre(r), public.almacen_sku(r));
    pid := public.almacen_producto_id(r);
    if tg_op = 'UPDATE' then antes := coalesce(public.almacen_nombre(to_jsonb(old)), public.almacen_sku(to_jsonb(old))); end if;
  end if;
  if pid is null then
    if tg_op = 'UPDATE' and public.normalizar_producto(antes) = public.normalizar_producto(nombre) then return new; end if;
    raise exception 'PRODUCTO_NO_CATALOGADO: "%" no está en el catálogo maestro. Elija un producto del catálogo o solicite uno nuevo.', nombre using errcode = '23514';
  end if;
  select * into p from public.productos_maestro where id = pid;
  -- Siempre con el nombre oficial (un alias se guarda como el producto oficial)
  if documento then
    new.data := new.data || jsonb_build_object(campo, p.nombre_normalizado, campo_id, p.id, 'sku', p.sku);
  else
    -- jsonb_populate_record solo usa las claves que son columnas; producto (PK) y sku no se tocan
    new := jsonb_populate_record(new, jsonb_build_object('nombre_display', p.nombre_display, 'nombre', p.nombre_normalizado, 'producto_id', p.id));
  end if;
  return new;
end $$;

do $$
begin
  execute 'drop trigger if exists almacen_stock_maestro on public.almacen';
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'almacen' and column_name = 'tipo') then
    execute 'create trigger almacen_stock_maestro before insert or update on public.almacen
               for each row when (new.tipo = ''stock'') execute function public.exigir_producto_maestro()';
  else
    execute 'create trigger almacen_stock_maestro before insert or update on public.almacen
               for each row execute function public.exigir_producto_maestro()';
  end if;
  if to_regclass('public.sucursal') is not null then
    execute 'drop trigger if exists sucursal_stock_maestro on public.sucursal';
    execute 'create trigger sucursal_stock_maestro before insert or update on public.sucursal
               for each row when (new.tipo = ''stock'') execute function public.exigir_producto_maestro()';
  end if;
end $$;

-- 10. Stock por almacén y producto_id (todos usan el mismo producto), con sede_id si ya hay sedes.
--     security_invoker: respeta RLS y sede_isolation. 20261023_sedes_multisede.sql también la llama.
create or replace function public.crear_vista_stock_almacenes() returns void
language plpgsql set search_path = public as $$
declare
  consulta text := $v$
    select p.id as producto_id, p.sku, p.nombre_display, public.almacen_ubicacion(x.j) as almacen_id,
           public.almacen_cantidad(x.j) as cantidad, 0::numeric as minimo, (x.j->>'sede_id')::uuid as sede_id
      from (select to_jsonb(a) j from public.almacen a) x
      join public.productos_maestro p on p.id = public.almacen_producto_id(x.j)
     where public.almacen_es_stock(x.j)$v$;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sucursal' and column_name = 'data' and data_type = 'jsonb') then
    consulta := consulta || $v$
    union all
    select p.id, p.sku, p.nombre_display, 'SUCURSAL_' || upper(replace(coalesce(s.data->>'sucursalId', 'SUC'), '-', '_')),
           coalesce((s.data->>'stock')::numeric, 0), coalesce((s.data->>'minimo')::numeric, 0), (to_jsonb(s)->>'sede_id')::uuid
      from public.sucursal s join public.productos_maestro p on p.id = public.producto_de_nombre(s.data->>'producto')
     where s.tipo = 'stock'$v$;
  end if;
  drop view if exists public.v_stock_almacenes;
  execute 'create view public.v_stock_almacenes with (security_invoker = true) as ' || consulta;
  grant select on public.v_stock_almacenes to authenticated;
end $$;
revoke execute on function public.crear_vista_stock_almacenes() from public, anon, authenticated;
select public.crear_vista_stock_almacenes();

-- 11. Realtime: un producto nuevo o unificado llega al instante a todas las PCs (si ya está publicada, se omite)
do $$
declare t text;
begin
  foreach t in array array['productos_maestro', 'productos_alias', 'productos_solicitudes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object or undefined_object then null;
    end;
  end loop;
end $$;

-- 12. Revisión después de correr: posibles duplicados con distinto nombre (para "Unificar" en Catálogo de productos)
-- select a.sku, a.nombre_normalizado, b.sku, b.nombre_normalizado, round(public.similarity(a.nombre_normalizado, b.nombre_normalizado)::numeric, 2) sim
--   from public.productos_maestro a join public.productos_maestro b on a.id < b.id and a.nombre_normalizado operator(public.%) b.nombre_normalizado
--  order by sim desc limit 100;
