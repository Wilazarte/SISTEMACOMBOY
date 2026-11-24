-- =====================================================================
-- Ingresos de stock que quedaron en el KARDEX pero NO en el STOCK
-- (error "duplicate key ... idx_almacen_stock_producto_sede_unico").
--
-- Qué pasó: al registrar una compra / ingreso, si la unidad de la factura
-- (ej. NIU, PZA) era distinta a la del stock (UND), el sistema intentaba
-- crear una SEGUNDA fila del mismo producto en el mismo almacén. La base
-- la rechazó (bien hecho: no hay filas duplicadas), pero el movimiento del
-- kardex SÍ se guardó. Resultado posible: el kardex dice que entró y el
-- stock no subió. Desde el PR de este arreglo ya no vuelve a pasar.
--
-- NO hay filas duplicadas que borrar: el índice único lo impidió.
-- Correr en Supabase > SQL Editor, POR PASOS. PASO 1 y 2 no cambian nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 · Movimientos del kardex cuya fila de stock NO existe
--   (el ingreso que fue rechazado). "fila_stock_real" es la fila del
--   mismo producto y almacén a la que debió sumarse.
-- ---------------------------------------------------------------------
with st as (
  select id,
         data->>'nombre' as producto,
         data->>'unidad' as unidad,
         coalesce(nullif(data->>'cantidad','')::numeric, 0) as cantidad,
         lower(trim(regexp_replace(data->>'nombre', '\s+', ' ', 'g'))) as clave,
         case when data->>'sede' ilike '%aqp%' or data->>'sede' ilike '%arequipa%' then 'Taller Principal Aqp'
              when data->>'sede' ilike '%secocha%' then 'Sucursal Secocha'
              else trim(data->>'sede') end as almacen
  from public.almacen where tipo = 'stock'
), k as (
  select id as kardex_id,
         data->>'stock_id' as stock_id,
         data->>'fecha' as fecha,
         data->>'usuario' as usuario,
         data->>'tipo_movimiento' as movimiento,
         data->>'documento' as documento,
         data->>'producto' as producto,
         data->>'unidad' as unidad,
         coalesce(nullif(data->>'cantidad','')::numeric, 0) as cantidad,
         lower(trim(regexp_replace(data->>'producto', '\s+', ' ', 'g'))) as clave,
         case when data->>'sede' ilike '%aqp%' or data->>'sede' ilike '%arequipa%' then 'Taller Principal Aqp'
              when data->>'sede' ilike '%secocha%' then 'Sucursal Secocha'
              else trim(data->>'sede') end as almacen
  from public.almacen where tipo = 'KARDEX'
)
select k.fecha, k.usuario, k.movimiento, k.documento, k.almacen, k.producto,
       k.cantidad, k.unidad as unidad_kardex,
       r.id as fila_stock_real, r.unidad as unidad_stock, r.cantidad as stock_actual,
       r.cantidad + k.cantidad as stock_si_se_suma
from k
left join st s on s.id = k.stock_id
left join st r on r.clave = k.clave and r.almacen = k.almacen
where s.id is null
order by k.fecha desc;


-- ---------------------------------------------------------------------
-- PASO 2 · Filas de stock cuyo ÚLTIMO movimiento del kardex dice otro
--   saldo (otros productos de la misma compra que tampoco se sumaron,
--   porque la base rechaza todo el guardado de una vez).
--   Revise cada una: puede haber diferencias viejas por limpiezas manuales.
-- ---------------------------------------------------------------------
with ult as (
  select distinct on (data->>'stock_id')
         data->>'stock_id' as stock_id,
         data->>'fecha' as fecha,
         data->>'tipo_movimiento' as movimiento,
         data->>'documento' as documento,
         coalesce(nullif(data->>'saldo','')::numeric, 0) as saldo_kardex
  from public.almacen
  where tipo = 'KARDEX' and data->>'saldo' is not null
  order by data->>'stock_id', data->>'fecha' desc
)
select s.data->>'sede' as almacen, s.data->>'nombre' as producto, s.data->>'unidad' as unidad,
       coalesce(nullif(s.data->>'cantidad','')::numeric, 0) as stock_actual,
       u.saldo_kardex, u.fecha as fecha_ultimo_mov, u.movimiento, u.documento, s.id as fila_stock
from public.almacen s
join ult u on u.stock_id = s.id
where s.tipo = 'stock'
  and coalesce(nullif(s.data->>'cantidad','')::numeric, 0) <> u.saldo_kardex
order by u.fecha desc;


-- ---------------------------------------------------------------------
-- PASO 3 · RESPALDO (antes de corregir)
-- ---------------------------------------------------------------------
create table if not exists public.almacen_respaldo_20261124 as
select * from public.almacen;

select count(*) as filas_respaldadas from public.almacen_respaldo_20261124;


-- ---------------------------------------------------------------------
-- PASO 4 · CORREGIR lo del PASO 1 (solo ingresos de compras / OC):
--   suma la cantidad a la fila real del producto y reapunta el kardex.
--   Si el producto no tenía fila en ese almacén, la crea con el id del kardex.
--   Corra el PASO 1 otra vez después: debe salir vacío (o solo movimientos
--   que no son INGRESO, que se revisan a mano).
-- ---------------------------------------------------------------------
do $$
declare
  m record;
  real_id text;
  n int := 0;
begin
  for m in
    select k.id as kardex_id, k.data as kd,
           lower(trim(regexp_replace(k.data->>'producto', '\s+', ' ', 'g'))) as clave,
           case when k.data->>'sede' ilike '%aqp%' or k.data->>'sede' ilike '%arequipa%' then 'Taller Principal Aqp'
                when k.data->>'sede' ilike '%secocha%' then 'Sucursal Secocha'
                else trim(k.data->>'sede') end as almacen
    from public.almacen k
    where k.tipo = 'KARDEX'
      and k.data->>'tipo_movimiento' = 'INGRESO'
      and not exists (select 1 from public.almacen s where s.tipo = 'stock' and s.id = k.data->>'stock_id')
    order by k.data->>'fecha'
  loop
    select s.id into real_id
    from public.almacen s
    where s.tipo = 'stock'
      and lower(trim(regexp_replace(s.data->>'nombre', '\s+', ' ', 'g'))) = m.clave
      and (case when s.data->>'sede' ilike '%aqp%' or s.data->>'sede' ilike '%arequipa%' then 'Taller Principal Aqp'
                when s.data->>'sede' ilike '%secocha%' then 'Sucursal Secocha'
                else trim(s.data->>'sede') end) = m.almacen
    limit 1;

    if real_id is not null then
      update public.almacen
         set data = data
                    || jsonb_build_object('cantidad', round(coalesce(nullif(data->>'cantidad','')::numeric, 0)
                                                            + coalesce(nullif(m.kd->>'cantidad','')::numeric, 0), 2))
                    || jsonb_build_object('actualizado', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       where tipo = 'stock' and id = real_id;
    else
      real_id := m.kd->>'stock_id';
      insert into public.almacen (tipo, id, data)
      values ('stock', real_id, jsonb_build_object(
        'id', real_id, 'sede', m.almacen, 'nombre', m.kd->>'producto', 'unidad', m.kd->>'unidad',
        'cantidad', coalesce(nullif(m.kd->>'cantidad','')::numeric, 0), 'costoUnit', 0,
        'actualizado', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    end if;

    update public.almacen
       set data = data || jsonb_build_object(
             'stock_id', real_id,
             'saldo', (select coalesce(nullif(s.data->>'cantidad','')::numeric, 0) from public.almacen s where s.tipo = 'stock' and s.id = real_id))
     where tipo = 'KARDEX' and id = m.kardex_id;
    n := n + 1;
  end loop;
  raise notice 'Ingresos corregidos: %', n;
end $$;


-- ---------------------------------------------------------------------
-- PASO 5 · DESHACER (solo si algo salió mal)
-- ---------------------------------------------------------------------
-- begin;
-- delete from public.almacen;
-- insert into public.almacen select * from public.almacen_respaldo_20261124;
-- commit;
