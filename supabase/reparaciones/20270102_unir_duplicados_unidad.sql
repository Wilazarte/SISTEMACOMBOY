-- =====================================================================
-- Unir productos repetidos por UNIDAD DE MEDIDA (Williams, 2026-11-25)
--   Ej.: CATALIZADOR 20 UND y CATALIZADOR 4 PZA en el mismo almacén.
--   Regla: queda UNA fila por producto y almacén.
--     · Queda la fila en UND; si no hay UND, la de la unidad del catálogo;
--       si tampoco, la de más cantidad.
--     · Las cantidades de las otras filas SE SUMAN a la que queda.
--     · Kardex y demás documentos que apuntaban a las filas borradas
--       pasan a apuntar a la que queda (no se pierde historial).
--   Almacenes: "Taller Principal", "Adm Aqp", "Almacen Aqp"... = Taller Principal Aqp;
--              todo lo que diga Secocha = Sucursal Secocha.
--   Cubre el stock del almacén (tabla almacen) y el stock de Secocha (tabla sucursal).
--
-- Correr en Supabase > SQL Editor, POR PASOS. PASO 1 no cambia nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 · VISTA PREVIA (no cambia nada)
-- ---------------------------------------------------------------------
with s as (
  select 'almacen' as tabla, a.id,
         a.data->>'nombre' as producto,
         a.data->>'sede' as sede_original,
         upper(trim(coalesce(a.data->>'unidad', ''))) as unidad,
         coalesce(nullif(a.data->>'cantidad','')::numeric, 0) as cantidad,
         lower(trim(regexp_replace(a.data->>'nombre', '\s+', ' ', 'g'))) as clave,
         case when a.data->>'sede' ilike '%aqp%' or a.data->>'sede' ilike '%arequipa%' or a.data->>'sede' ilike '%taller principal%' then 'Taller Principal Aqp'
              when a.data->>'sede' ilike '%secocha%' then 'Sucursal Secocha'
              else trim(a.data->>'sede') end as almacen
  from public.almacen a where a.tipo = 'stock'
  union all
  select 'sucursal', x.id,
         x.data->>'producto',
         coalesce(x.data->>'sedeId', x.data->>'sucursalId'),
         upper(trim(coalesce(x.data->>'unidad', ''))),
         coalesce(nullif(x.data->>'stock','')::numeric, 0),
         lower(trim(regexp_replace(x.data->>'producto', '\s+', ' ', 'g'))),
         'Secocha · ' || coalesce(x.data->>'sedeId', x.data->>'sucursalId', '')
  from public.sucursal x where x.tipo = 'stock'
), c as (
  select s.*, upper(trim(p.unidad)) as unidad_catalogo
  from s left join public.productos_maestro p on lower(p.nombre_normalizado) = s.clave
), g as (
  select *,
         count(*) over (partition by tabla, clave, almacen) as filas,
         row_number() over (partition by tabla, clave, almacen
           order by (unidad = 'UND') desc, (unidad = unidad_catalogo) desc, cantidad desc, id) as rk,
         sum(cantidad) over (partition by tabla, clave, almacen) as total
  from c
)
select tabla, almacen, producto, unidad, cantidad, sede_original, unidad_catalogo,
       case when rk = 1 then 'QUEDA' else 'SE UNE A LA QUE QUEDA' end as accion,
       case when rk = 1 then total end as cantidad_final,
       id
from g
where filas > 1
order by tabla, almacen, clave, rk;


-- ---------------------------------------------------------------------
-- PASO 2 · RESPALDO
-- ---------------------------------------------------------------------
create table if not exists public.almacen_respaldo_20261125 as select * from public.almacen;
create table if not exists public.sucursal_respaldo_20261125 as select * from public.sucursal;
select (select count(*) from public.almacen_respaldo_20261125) as almacen_respaldado,
       (select count(*) from public.sucursal_respaldo_20261125) as sucursal_respaldado;


-- ---------------------------------------------------------------------
-- PASO 3 · UNIR (todo o nada)
-- ---------------------------------------------------------------------
do $$
declare
  r        record;
  n_grupos int := 0;
  n_borr   int := 0;
  n_refs   int := 0;
  n_tmp    int;
begin
  if to_regclass('public.almacen_respaldo_20261125') is null or to_regclass('public.sucursal_respaldo_20261125') is null then
    raise exception 'Falta el respaldo: corra primero el PASO 2.';
  end if;

  -- El índice viejo no reconoce "Taller Principal" como Taller Principal Aqp: se quita y se crea de nuevo en el PASO 4
  drop index if exists public.idx_almacen_stock_producto_sede_unico;

  for r in
    with s as (
      select 'almacen' as tabla, a.id,
             upper(trim(coalesce(a.data->>'unidad', ''))) as unidad,
             coalesce(nullif(a.data->>'cantidad','')::numeric, 0) as cantidad,
             lower(trim(regexp_replace(a.data->>'nombre', '\s+', ' ', 'g'))) as clave,
             case when a.data->>'sede' ilike '%aqp%' or a.data->>'sede' ilike '%arequipa%' or a.data->>'sede' ilike '%taller principal%' then 'Taller Principal Aqp'
                  when a.data->>'sede' ilike '%secocha%' then 'Sucursal Secocha'
                  else trim(a.data->>'sede') end as almacen
      from public.almacen a where a.tipo = 'stock'
      union all
      select 'sucursal', x.id,
             upper(trim(coalesce(x.data->>'unidad', ''))),
             coalesce(nullif(x.data->>'stock','')::numeric, 0),
             lower(trim(regexp_replace(x.data->>'producto', '\s+', ' ', 'g'))),
             coalesce(x.data->>'sedeId', x.data->>'sucursalId', '')
      from public.sucursal x where x.tipo = 'stock'
    ), c as (
      select s.*, upper(trim(p.unidad)) as unidad_catalogo
      from s left join public.productos_maestro p on lower(p.nombre_normalizado) = s.clave
    ), g as (
      select *,
             count(*) over (partition by tabla, clave, almacen) as filas,
             row_number() over (partition by tabla, clave, almacen
               order by (unidad = 'UND') desc, (unidad = unidad_catalogo) desc, cantidad desc, id) as rk
      from c
    )
    select q.tabla, q.id as queda, q.almacen, q.unidad,
           array_agg(b.id) as borrar,
           sum(b.cantidad) as sumar
    from g q
    join g b on b.tabla = q.tabla and b.clave = q.clave and b.almacen = q.almacen and b.rk > 1
    where q.rk = 1 and q.filas > 1
    group by q.tabla, q.id, q.almacen, q.unidad
  loop
    n_grupos := n_grupos + 1;

    -- Kardex, vales, despachos… que apuntaban a las filas que se unen -> a la que queda
    for i in 1 .. array_length(r.borrar, 1) loop
      if r.tabla = 'almacen' then
        update public.almacen set data = replace(data::text, r.borrar[i], r.queda)::jsonb
        where tipo <> 'stock' and data::text like '%' || r.borrar[i] || '%';
      else
        update public.sucursal set data = replace(data::text, r.borrar[i], r.queda)::jsonb
        where tipo <> 'stock' and data::text like '%' || r.borrar[i] || '%';
      end if;
      get diagnostics n_tmp = row_count; n_refs := n_refs + n_tmp;
    end loop;

    if r.tabla = 'almacen' then
      delete from public.almacen where tipo = 'stock' and id = any(r.borrar);
      get diagnostics n_tmp = row_count; n_borr := n_borr + n_tmp;
      update public.almacen
      set data = data || jsonb_build_object(
                   'cantidad', round(coalesce(nullif(data->>'cantidad','')::numeric, 0) + r.sumar, 2),
                   'sede', r.almacen,
                   'unidad', r.unidad,
                   'actualizado', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      where tipo = 'stock' and id = r.queda;
    else
      delete from public.sucursal where tipo = 'stock' and id = any(r.borrar);
      get diagnostics n_tmp = row_count; n_borr := n_borr + n_tmp;
      update public.sucursal
      set data = data || jsonb_build_object(
                   'stock', round(coalesce(nullif(data->>'stock','')::numeric, 0) + r.sumar, 2),
                   'unidad', r.unidad)
      where tipo = 'stock' and id = r.queda;
    end if;
  end loop;

  raise notice 'Listo: % producto(s) unidos, % fila(s) quitadas, % documento(s) reapuntados.', n_grupos, n_borr, n_refs;
end $$;


-- ---------------------------------------------------------------------
-- PASO 4 · Índice único otra vez (ahora "Taller Principal" = Taller Principal Aqp)
--   Una sola fila por producto y almacén, sin importar la unidad.
-- ---------------------------------------------------------------------
create unique index if not exists idx_almacen_stock_producto_sede_unico
  on public.almacen (
    (lower(trim(regexp_replace(data->>'nombre', '\s+', ' ', 'g')))),
    (case when data->>'sede' ilike '%aqp%' or data->>'sede' ilike '%arequipa%' or data->>'sede' ilike '%taller principal%' then 'Taller Principal Aqp'
          when data->>'sede' ilike '%secocha%' then 'Sucursal Secocha'
          else trim(data->>'sede') end)
  )
  where tipo = 'stock';


-- ---------------------------------------------------------------------
-- PASO 5 · VERIFICACIÓN
--   a) Debe salir vacío (sin repetidos).
-- ---------------------------------------------------------------------
select 'almacen' as tabla, lower(trim(regexp_replace(data->>'nombre', '\s+', ' ', 'g'))) as producto, count(*) as filas
from public.almacen where tipo = 'stock'
group by 2, (case when data->>'sede' ilike '%aqp%' or data->>'sede' ilike '%arequipa%' or data->>'sede' ilike '%taller principal%' then 'Taller Principal Aqp'
                  when data->>'sede' ilike '%secocha%' then 'Sucursal Secocha' else trim(data->>'sede') end)
having count(*) > 1
union all
select 'sucursal', lower(trim(regexp_replace(data->>'producto', '\s+', ' ', 'g'))), count(*)
from public.sucursal where tipo = 'stock'
group by 2, coalesce(data->>'sedeId', data->>'sucursalId')
having count(*) > 1;

--   b) Productos cuyo stock quedó en una unidad distinta a la del catálogo
--      (el ERP ya usa la del catálogo en cada ingreso nuevo; revise si el catálogo debe decir UND).
select p.sku, p.nombre_normalizado, p.unidad as unidad_catalogo, a.data->>'unidad' as unidad_stock, a.data->>'sede' as almacen
from public.almacen a
join public.productos_maestro p on lower(p.nombre_normalizado) = lower(trim(regexp_replace(a.data->>'nombre', '\s+', ' ', 'g')))
where a.tipo = 'stock' and upper(trim(p.unidad)) <> upper(trim(a.data->>'unidad'))
order by p.nombre_normalizado;

--   c) (Opcional) Si en b) el catálogo debe quedar en UND, descomente y corra:
-- update public.productos_maestro p set unidad = 'UND'
-- where exists (select 1 from public.almacen a
--               where a.tipo = 'stock' and upper(trim(a.data->>'unidad')) = 'UND'
--                 and lower(trim(regexp_replace(a.data->>'nombre', '\s+', ' ', 'g'))) = lower(p.nombre_normalizado))
--   and upper(trim(p.unidad)) <> 'UND';


-- ---------------------------------------------------------------------
-- PASO 6 · DESHACER (solo si algo salió mal)
-- ---------------------------------------------------------------------
-- begin;
-- delete from public.almacen;  insert into public.almacen  select * from public.almacen_respaldo_20261125;
-- delete from public.sucursal; insert into public.sucursal select * from public.sucursal_respaldo_20261125;
-- commit;
