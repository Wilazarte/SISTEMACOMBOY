-- =====================================================================
-- Buscador público de repuestos (comboyvid.com/#repuestos) · ERP COMBOY VID
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 20261022_unificar_productos.sql
-- (usa sus funciones almacen_*). Solo agrega una función: no borra ni cambia datos.
-- Sin BEGIN/COMMIT; se puede repetir.
--
-- La web pública (sin sesión, rol anon) solo puede llamar a esta función, nunca leer
-- la tabla almacen: devuelve nombre, código, unidad, sede y si hay stock. No devuelve
-- costos, cantidades exactas, proveedores, OC ni clientes.
-- =====================================================================

create or replace function public.buscar_repuestos_publico(p_q text)
returns table (tipo text, codigo text, nombre text, unidad text, sede text, disponible boolean)
language sql stable security definer set search_path = public as $$
  with q as (
    select '%' || replace(replace(upper(btrim(left(coalesce(p_q, ''), 60))), '%', ''), '_', '') || '%' as patron
  ),
  stock as (
    -- Repuestos e insumos: una fila por producto y sede (suma de todos sus registros)
    select 'REPUESTO'::text                                       as tipo,
           max(public.almacen_sku(x.j))                           as codigo,
           public.almacen_nombre(x.j)                             as nombre,
           max(public.almacen_unidad(x.j))                        as unidad,
           public.almacen_ubicacion(x.j)                          as sede,
           sum(public.almacen_cantidad(x.j)) > 0                  as disponible
      from (select to_jsonb(a) j from public.almacen a) x
     where public.almacen_es_stock(x.j) and public.almacen_nombre(x.j) is not null
     group by public.almacen_nombre(x.j), public.almacen_ubicacion(x.j)
  ),
  equipos as (
    -- Equipos terminados (PT): tipo + modelo + motor, disponibles = DISPONIBLE y con QC aprobado
    select 'EQUIPO'::text                                         as tipo,
           max(x.j->'data'->>'modelo')                            as codigo,
           btrim(concat_ws(' ', x.j->'data'->>'tipo_equipo', x.j->'data'->>'modelo',
                 case when coalesce(x.j->'data'->>'marca_motor', '') <> '' then '· motor ' || (x.j->'data'->>'marca_motor') end)) as nombre,
           'UND'::text                                            as unidad,
           x.j->'data'->>'sede'                                   as sede,
           bool_or(x.j->'data'->>'estado' = 'DISPONIBLE' and coalesce(x.j->'data'->>'qc_aprobado', 'true') = 'true') as disponible
      from (select to_jsonb(a) j from public.almacen a) x
     where x.j->>'tipo' = 'EQUIPO_TERMINADO' and coalesce(x.j->'data'->>'estado', '') <> 'VENDIDO'
     group by 3, 5
  )
  select r.tipo, r.codigo, r.nombre, r.unidad, r.sede, r.disponible
    from (select * from stock union all select * from equipos) r, q
   where length(btrim(coalesce(p_q, ''))) >= 2
     and (upper(r.nombre) like q.patron or upper(coalesce(r.codigo, '')) like q.patron)
   order by r.disponible desc, r.nombre
   limit 25
$$;

revoke execute on function public.buscar_repuestos_publico(text) from public;
grant execute on function public.buscar_repuestos_publico(text) to anon, authenticated;

-- Prueba:
-- select * from public.buscar_repuestos_publico('yuchai');
-- select * from public.buscar_repuestos_publico('remolcador');
