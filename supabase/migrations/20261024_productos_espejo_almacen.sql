-- =====================================================================
-- productos_maestro como espejo del ALMACÉN · ERP COMBOY VID
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 20261022_unificar_productos.sql y
-- 20261023_sedes_multisede.sql. Sin BEGIN/COMMIT; se puede repetir.
--
-- Sirve para public.almacen de cualquier forma (ver almacen_* en 20261022_unificar_productos.sql):
--   relacional  producto (PK, PROD-0001), sku, nombre_display | nombre, cantidad, almacen_id, sede_id
--   documentos  (tipo, id, data jsonb) con data->>'nombre', data->>'sede', data->>'cantidad'
--
-- No se hace TRUNCATE productos_maestro CASCADE: borraría también productos_alias y
-- productos_solicitudes (tienen FK al catálogo) y dejaría el stock apuntando a productos que ya no existen.
-- En su lugar se agrega al catálogo todo lo que está en almacén y aún no figura, sin borrar nada.
-- =====================================================================

-- 1. Todo producto del almacén existe en el catálogo (un alias cuenta como ya existente).
--    Si la fila trae SKU (PROD-0001) y el catálogo no lo usa, el producto conserva ese SKU.
select public.sembrar_productos() as productos_nuevos;

-- 2. Cada fila de stock queda enlazada a su producto (nombre oficial y SKU)
select public.enlazar_stock() as filas_enlazadas;

-- 3. Vista pedida: productos con su stock por almacén (security_invoker: respeta RLS y sede_isolation).
--    id = código del almacén (columna producto) o, si no tiene, el id del catálogo.
--    Una fila cuyo producto aún no está en el catálogo también sale (producto_id vacío).
drop view if exists public.v_productos_stock;
create view public.v_productos_stock with (security_invoker = true) as
select coalesce(x.j->>'producto', p.id::text)                                as id,
       p.id                                                                  as producto_id,
       coalesce(p.sku, public.almacen_sku(x.j))                              as sku,
       coalesce(p.nombre_display, public.almacen_nombre(x.j), x.j->>'producto') as nombre_display,
       p.nombre_normalizado,
       public.almacen_ubicacion(x.j)                                         as almacen_id,
       public.almacen_cantidad(x.j)                                          as stock_actual,
       public.almacen_cantidad(x.j) > 0                                      as tiene_stock,
       (x.j->>'sede_id')::uuid                                               as sede_id
  from (select to_jsonb(a) j from public.almacen a) x
  left join public.productos_maestro p on p.id = public.almacen_producto_id(x.j)
 where public.almacen_es_stock(x.j);
grant select on public.v_productos_stock to authenticated;

-- 4. v_stock_almacenes con la misma lectura
select public.crear_vista_stock_almacenes();

-- Revisión:
-- select * from public.v_productos_stock order by nombre_display;
-- select * from public.v_productos_stock where producto_id is null;   -- filas sin producto en el catálogo
