-- =====================================================================
-- CATÁLOGO MAESTRO ÚNICO DE PRODUCTOS · ERP COMBOY VID
-- Ejecutar en Supabase › SQL Editor (se puede repetir sin duplicar nada).
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
-- El stock sigue viviendo donde ya está (almacen tipo stock / sucursal tipo stock): no se crea
-- una segunda tabla de cantidades que pueda descuadrarse. v_stock_almacenes lo muestra por producto_id.
-- =====================================================================

begin;

create extension if not exists pg_trgm with schema extensions;

-- 1. Normalización única (la misma que lib/productos-modelos.ts normalizarNombre):
--    MAYÚSCULAS, sin espacios al inicio/fin, sin espacios dobles, "A / B" -> "A/B"
create or replace function public.normalizar_producto(nombre text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(upper(btrim(coalesce(nombre, ''))), '\s+', ' ', 'g'), '\s*/\s*', '/', 'g')
$$;

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
create index if not exists idx_productos_trgm on public.productos_maestro using gin (nombre_normalizado extensions.gin_trgm_ops);

-- Variantes que ya existían con otro nombre (o que se unificaron): apuntan al producto oficial
create table if not exists public.productos_alias (
  alias_normalizado text primary key,
  producto_id uuid not null references public.productos_maestro(id) on delete cascade,
  created_at timestamptz not null default now()
);
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
create policy productos_sol_select on public.productos_solicitudes for select to authenticated using (solicitado_por = auth.uid() or public.es_admin_productos());
create policy productos_sol_insert on public.productos_solicitudes for insert to authenticated
  with check (solicitado_por = auth.uid() and estado = 'pendiente' and public.mi_rol() <> 'sin_rol');
create policy productos_sol_admin on public.productos_solicitudes for update to authenticated using (public.es_admin_productos()) with check (public.es_admin_productos());

grant select on public.productos_maestro, public.productos_alias to authenticated;
grant insert, update, delete on public.productos_maestro, public.productos_alias to authenticated;
grant select, insert, update on public.productos_solicitudes to authenticated;
grant usage on sequence public.productos_sku_seq to authenticated;
revoke all on public.productos_maestro, public.productos_alias, public.productos_solicitudes from anon;

-- 4. Búsqueda y similitud (pg_trgm): "¿Quisiste decir TEMPLE BLANCO PATO 25KG?"
create or replace function public.productos_similares(nombre text, umbral real default 0.8)
returns table (id uuid, sku text, nombre_display text, nombre_normalizado text, unidad text, similitud real)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.sku, p.nombre_display, p.nombre_normalizado, p.unidad,
         greatest(similarity(p.nombre_normalizado, public.normalizar_producto(nombre)),
                  coalesce((select max(similarity(a.alias_normalizado, public.normalizar_producto(nombre))) from public.productos_alias a where a.producto_id = p.id), 0))::real as similitud
    from public.productos_maestro p
   where p.activo
     and (p.nombre_normalizado % public.normalizar_producto(nombre)
          or exists (select 1 from public.productos_alias a where a.producto_id = p.id and a.alias_normalizado % public.normalizar_producto(nombre))
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
    (select producto_id from public.productos_alias where alias_normalizado = public.normalizar_producto(nombre)))
$$;
grant execute on function public.producto_de_nombre(text) to authenticated;

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
  movidos integer := 0;
begin
  if not public.es_admin_productos() then
    raise exception 'Solo el administrador unifica productos.' using errcode = '42501';
  end if;
  if p_origen = p_destino then raise exception 'Elija dos productos distintos.' using errcode = '22023'; end if;
  select * into o from public.productos_maestro where id = p_origen;
  select * into d from public.productos_maestro where id = p_destino;
  if o.id is null or d.id is null then raise exception 'Producto no encontrado.' using errcode = '22023'; end if;

  nombres := array(select o.nombre_normalizado union select alias_normalizado from public.productos_alias where producto_id = o.id);

  -- Stock de almacén (tabla almacen, tipo stock): por sede + unidad
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
    movidos := movidos + 1;
  end loop;

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
  update public.productos_alias set producto_id = d.id where producto_id = o.id;
  insert into public.productos_alias (alias_normalizado, producto_id) values (o.nombre_normalizado, d.id)
  on conflict (alias_normalizado) do update set producto_id = excluded.producto_id;
  update public.productos_solicitudes set producto_id = d.id where producto_id = o.id;
  delete from public.productos_maestro where id = o.id;

  return jsonb_build_object('destino', d.sku, 'origen', o.sku, 'filas_stock', movidos);
end $$;
grant execute on function public.unificar_productos(uuid, uuid) to authenticated;

-- 7. Carga inicial: todos los nombres que ya usa el ERP, agrupados por nombre normalizado
--    (stock de almacén, REQ, cotizaciones, OC, compras directas y stock de la sucursal)
create temporary table tmp_nombres (nombre text, unidad text, marca text) on commit drop;

insert into tmp_nombres
select data->>'nombre', data->>'unidad', null from public.almacen where tipo = 'stock' and coalesce(data->>'nombre', '') <> '';

insert into tmp_nombres
select i->>'nombre', i->>'unidad', nullif(i->>'marca', '')
  from public.compras c, jsonb_array_elements(case when jsonb_typeof(c.data->'items') = 'array' then c.data->'items' else '[]'::jsonb end) i
 where c.tipo in ('req_pendiente', 'req_procesado', 'cotizacion', 'orden', 'compra_directa') and coalesce(i->>'nombre', '') <> '';

do $$
begin
  if to_regclass('public.sucursal') is not null then
    execute 'insert into tmp_nombres select data->>''producto'', data->>''unidad'', null from public.sucursal where tipo = ''stock'' and coalesce(data->>''producto'', '''') <> ''''';
  end if;
end $$;

insert into public.productos_maestro (nombre_normalizado, nombre_display, unidad, marca)
select public.normalizar_producto(nombre),
       min(btrim(regexp_replace(nombre, '\s+', ' ', 'g'))),
       coalesce(mode() within group (order by nullif(unidad, '')), 'UND'),
       mode() within group (order by marca)
  from tmp_nombres
 where public.normalizar_producto(nombre) <> ''
   and public.producto_de_nombre(nombre) is null
 group by 1
 order by 1
on conflict (nombre_normalizado) do nothing;

-- 8. El stock existente queda con el nombre oficial y su productoId / SKU
update public.almacen a
   set data = a.data || jsonb_build_object('nombre', p.nombre_normalizado, 'productoId', p.id, 'sku', p.sku)
  from public.productos_maestro p
 where a.tipo = 'stock' and p.id = public.producto_de_nombre(a.data->>'nombre')
   and (a.data->>'productoId' is distinct from p.id::text or a.data->>'nombre' is distinct from p.nombre_normalizado);

do $$
begin
  if to_regclass('public.sucursal') is not null then
    execute $q$
      update public.sucursal s
         set data = s.data || jsonb_build_object('producto', p.nombre_normalizado, 'productoMaestroId', p.id, 'sku', p.sku)
        from public.productos_maestro p
       where s.tipo = 'stock' and p.id = public.producto_de_nombre(s.data->>'producto')
         and (s.data->>'productoMaestroId' is distinct from p.id::text or s.data->>'producto' is distinct from p.nombre_normalizado)
    $q$;
  end if;
end $$;

-- 8b. Si al normalizar quedaron dos filas del mismo producto en la misma sede y unidad, se suman en una
do $$
declare g record;
begin
  for g in
    select data->>'sede' sede, coalesce(data->>'unidad', '') unidad, data->>'nombre' nombre,
           array_agg(id order by created_at) ids, sum(coalesce((data->>'cantidad')::numeric, 0)) total
      from public.almacen where tipo = 'stock' group by 1, 2, 3 having count(*) > 1
  loop
    update public.almacen set data = data || jsonb_build_object('cantidad', g.total, 'actualizado', now()) where tipo = 'stock' and id = g.ids[1];
    delete from public.almacen where tipo = 'stock' and id = any (g.ids[2:]);
  end loop;
end $$;

-- 9. Regla en la base: el stock solo acepta productos del catálogo (mismo nombre en todos los almacenes)
create or replace function public.exigir_producto_maestro() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  campo text := case when tg_table_name = 'sucursal' then 'producto' else 'nombre' end;
  campo_id text := case when tg_table_name = 'sucursal' then 'productoMaestroId' else 'productoId' end;
  pid uuid;
  p public.productos_maestro;
begin
  if new.tipo <> 'stock' then return new; end if;
  pid := public.producto_de_nombre(new.data->>campo);
  if pid is null then
    raise exception 'PRODUCTO_NO_CATALOGADO: "%" no está en el catálogo maestro. Elija un producto del catálogo o solicite uno nuevo.', new.data->>campo using errcode = '23514';
  end if;
  select * into p from public.productos_maestro where id = pid;
  -- Siempre con el nombre oficial (un alias se guarda como el producto oficial)
  new.data := new.data || jsonb_build_object(campo, p.nombre_normalizado, campo_id, p.id, 'sku', p.sku);
  return new;
end $$;

drop trigger if exists almacen_stock_maestro on public.almacen;
create trigger almacen_stock_maestro before insert or update on public.almacen
  for each row when (new.tipo = 'stock') execute function public.exigir_producto_maestro();

do $$
begin
  if to_regclass('public.sucursal') is not null then
    execute 'drop trigger if exists sucursal_stock_maestro on public.sucursal';
    execute 'create trigger sucursal_stock_maestro before insert or update on public.sucursal
               for each row when (new.tipo = ''stock'') execute function public.exigir_producto_maestro()';
  end if;
end $$;

-- 10. Stock por almacén y producto_id (todos usan el mismo producto)
do $$
begin
  if to_regclass('public.sucursal') is not null then
    execute $v$
      create or replace view public.v_stock_almacenes with (security_invoker = true) as
      select p.id as producto_id, p.sku, p.nombre_display, a.data->>'sede' as almacen_id,
             coalesce((a.data->>'cantidad')::numeric, 0) as cantidad, 0::numeric as minimo
        from public.almacen a join public.productos_maestro p on p.id = public.producto_de_nombre(a.data->>'nombre')
       where a.tipo = 'stock'
      union all
      select p.id, p.sku, p.nombre_display, 'SUCURSAL_' || upper(replace(coalesce(s.data->>'sucursalId', 'SUC'), '-', '_')),
             coalesce((s.data->>'stock')::numeric, 0), coalesce((s.data->>'minimo')::numeric, 0)
        from public.sucursal s join public.productos_maestro p on p.id = public.producto_de_nombre(s.data->>'producto')
       where s.tipo = 'stock'
    $v$;
  else
    execute $v$
      create or replace view public.v_stock_almacenes with (security_invoker = true) as
      select p.id as producto_id, p.sku, p.nombre_display, a.data->>'sede' as almacen_id,
             coalesce((a.data->>'cantidad')::numeric, 0) as cantidad, 0::numeric as minimo
        from public.almacen a join public.productos_maestro p on p.id = public.producto_de_nombre(a.data->>'nombre')
       where a.tipo = 'stock'
    $v$;
  end if;
end $$;
grant select on public.v_stock_almacenes to authenticated;

-- 11. Realtime: un producto nuevo o unificado llega al instante a todas las PCs
do $$
declare t text;
begin
  foreach t in array array['productos_maestro', 'productos_alias', 'productos_solicitudes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;

-- 12. Revisión después de correr: posibles duplicados con distinto nombre (para "Unificar" en Catálogo de productos)
-- select a.sku, a.nombre_normalizado, b.sku, b.nombre_normalizado, round(extensions.similarity(a.nombre_normalizado, b.nombre_normalizado)::numeric, 2) sim
--   from public.productos_maestro a join public.productos_maestro b on a.id < b.id and a.nombre_normalizado operator(extensions.%) b.nombre_normalizado
--  order by sim desc limit 100;
