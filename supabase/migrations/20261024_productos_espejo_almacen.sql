-- =====================================================================
-- productos_maestro como espejo del ALMACÉN · ERP COMBOY VID
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 20261022_unificar_productos.sql y
-- 20261023_sedes_multisede.sql. Sin BEGIN/COMMIT; se puede repetir.
--
-- La tabla almacen guarda documentos (tipo, id, data jsonb): el stock es tipo = 'stock' con
-- data->>'nombre', data->>'sede', data->>'cantidad', data->>'productoId', data->>'sku'.
-- No tiene columnas producto_id / sku / nombre_display / cantidad, por eso aquí se leen de data.
--
-- No se hace TRUNCATE productos_maestro CASCADE: borraría también productos_alias y
-- productos_solicitudes (tienen FK al catálogo) y dejaría el stock con productoId que ya no existen.
-- En su lugar se agrega al catálogo todo lo que está en almacén y aún no figura, sin borrar nada.
-- =====================================================================

-- 1. Todo producto del stock de almacén existe en el catálogo (nombre normalizado = MAYÚSCULAS,
--    como exige productos_nombre_norm_chk; un alias cuenta como ya existente)
insert into public.productos_maestro (nombre_normalizado, nombre_display, unidad)
select public.normalizar_producto(data->>'nombre'),
       min(btrim(regexp_replace(data->>'nombre', '\s+', ' ', 'g'))),
       coalesce(mode() within group (order by nullif(data->>'unidad', '')), 'UND')
  from public.almacen
 where tipo = 'stock'
   and public.normalizar_producto(data->>'nombre') <> ''
   and public.producto_de_nombre(data->>'nombre') is null
 group by 1
on conflict (nombre_normalizado) do nothing;

-- 2. Cada fila de stock queda enlazada a su producto (nombre oficial, productoId y SKU)
update public.almacen a
   set data = a.data || jsonb_build_object('nombre', p.nombre_normalizado, 'productoId', p.id, 'sku', p.sku)
  from public.productos_maestro p
 where a.tipo = 'stock' and p.id = public.producto_de_nombre(a.data->>'nombre')
   and (a.data->>'productoId' is distinct from p.id::text or a.data->>'sku' is distinct from p.sku
        or a.data->>'nombre' is distinct from p.nombre_normalizado);

-- 3. Vista pedida: productos con su stock por almacén (security_invoker: respeta RLS y sede_isolation)
drop view if exists public.v_productos_stock;
create view public.v_productos_stock with (security_invoker = true) as
select p.id,
       p.sku,
       p.nombre_display,
       p.nombre_normalizado,
       a.data->>'sede'                                   as almacen_id,
       coalesce((a.data->>'cantidad')::numeric, 0)       as stock_actual,
       coalesce((a.data->>'cantidad')::numeric, 0) > 0   as tiene_stock,
       a.sede_id
  from public.almacen a
  join public.productos_maestro p on p.id = public.producto_de_nombre(a.data->>'nombre')
 where a.tipo = 'stock';
grant select on public.v_productos_stock to authenticated;

-- Revisión:
-- select * from public.v_productos_stock order by nombre_display;
