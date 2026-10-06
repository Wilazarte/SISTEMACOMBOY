-- =====================================================================
-- ALMACÉN › KARDEX y RETIRO PARA PRODUCCIÓN (Vale de Producción Interno VPI-000001)
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
--
-- Datos (tabla almacen, columnas tipo / id / data):
--   tipo 'stock'            -> productos (sede, nombre, unidad, cantidad, costoUnit, actualizado)
--   tipo 'KARDEX'           -> movimientos: tipo_movimiento = SALDO_INICIAL | INGRESO | SALIDA-VENTA |
--                              SALIDA-PRODUCCION | TRANSFERENCIA | AJUSTE, documento, chasis, cantidad (+/-), saldo, usuario
--   tipo 'VALE_PRODUCCION'  -> vales VPI-000001 (con chasis = costo del equipo; chasis NULL = consumo general de taller)
-- =====================================================================

-- 1) Numeración: serie VPI (Almacén y creador)
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
  elsif serie in ('EQ', 'OP', 'VPI') and rol not in ('creador', 'almacen') then
    raise exception 'Su usuario no puede registrar producción ni equipos terminados' using errcode = '42501';
  elsif (serie not in ('REQ', 'OC', 'DJ', 'NP', 'F001', 'B001', 'OD', 'BOL', 'GST', 'RCT', 'EQ', 'OP', 'VPI') and serie !~ '^BOL_[0-9]{4}$') or rol is null then
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;

  insert into public.compras (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(serie, 1))
  on conflict (tipo, id) do update
    set data = public.compras.data || jsonb_build_object(serie, coalesce((public.compras.data ->> serie)::integer, 0) + 1)
  returning (data ->> serie)::integer into n;
  return n;
end $$;

revoke all on function public.siguiente_numero(text) from public, anon;
grant execute on function public.siguiente_numero(text) to authenticated;

-- 2) tipo_movimiento válido en el kardex
alter table public.almacen drop constraint if exists almacen_kardex_tipo_movimiento_check;
alter table public.almacen add constraint almacen_kardex_tipo_movimiento_check
  check (tipo <> 'KARDEX' or data ->> 'tipo_movimiento' in ('SALDO_INICIAL', 'INGRESO', 'SALIDA-VENTA', 'SALIDA-PRODUCCION', 'TRANSFERENCIA', 'AJUSTE')) not valid;

-- 3) Vista del kardex (para consultas / reportes)
drop view if exists public.v_kardex;
create view public.v_kardex with (security_invoker = true) as
select id,
       (data ->> 'fecha')::timestamptz        as fecha,
       data ->> 'sede'                         as sede,
       data ->> 'producto'                     as producto,
       data ->> 'unidad'                       as unidad,
       data ->> 'tipo_movimiento'              as tipo_movimiento,
       data ->> 'documento'                    as documento,
       -- sin chasis = gasto general de taller (herramientas, insumos de soldadura, oficina…)
       case when data ->> 'tipo_movimiento' = 'SALIDA-PRODUCCION' and coalesce(data ->> 'chasis', '') = '' then 'CONSUMO GENERAL'
            else data ->> 'chasis' end         as chasis,
       data ->> 'motivo'                       as motivo,
       (data ->> 'cantidad')::numeric          as cantidad,
       (data ->> 'saldo')::numeric             as saldo,
       data ->> 'usuario'                      as usuario,
       data ->> 'stock_id'                     as stock_id
  from public.almacen
 where tipo = 'KARDEX';

-- 4) Retiro para producción: todo o nada (bloquea la fila del producto: dos PCs no pueden dejar el stock en negativo)
create or replace function public.retiro_produccion(
  p_stock_id text, p_cantidad numeric,
  p_chasis text,  -- NULL permitido (consumo general de taller, herramientas, insumos, oficina)
  p_motivo text, p_solicitante text, p_autoriza text,
  p_op_id text default null, p_equipo_id text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  st record;
  disp numeric;
  saldo numeric;
  n integer;
  vpi text;
  ahora text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  quien text;
  chasis text;
begin
  if rol is null or rol not in ('creador', 'almacen') then
    raise exception 'Su usuario no puede retirar stock de almacén' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'Indique la cantidad a retirar' using errcode = '22023';
  end if;
  if p_motivo is null or p_motivo not in ('PRODUCCION - PLUS 4000', 'PRODUCCION - ECO MINE', 'PRODUCCION - COCHE MINERO', 'MANTENIMIENTO EQUIPO',
                                          'CONSUMO GENERAL TALLER', 'HERRAMIENTAS', 'INSUMOS SOLDADURA', 'USO OFICINA / LIMPIEZA') then
    raise exception 'Motivo inválido' using errcode = '22023';
  end if;
  -- Chasis: obligatorio solo si el retiro va al costo de un equipo; en los demás motivos es NULL (consumo general de taller)
  chasis := nullif(upper(btrim(coalesce(p_chasis, ''))), '');
  -- PRODUCCION - PLUS 4000 / ECO MINE / COCHE MINERO y MANTENIMIENTO EQUIPO van al costo del equipo
  if chasis is null and (p_motivo like 'PRODUCCION%' or p_motivo like 'MANTENIMIENTO EQUIPO%') then
    raise exception 'Indique el chasis u OT' using errcode = '22023';
  end if;
  if coalesce(btrim(p_solicitante), '') = '' or coalesce(btrim(p_autoriza), '') = '' then
    raise exception 'Indique solicitante y quién autoriza' using errcode = '22023';
  end if;

  select * into st from public.almacen where tipo = 'stock' and id::text = p_stock_id for update;
  if not found then
    raise exception 'Producto no encontrado en stock' using errcode = '22023';
  end if;
  disp := coalesce((st.data ->> 'cantidad')::numeric, 0);
  if p_cantidad > disp then
    raise exception 'Stock insuficiente de %: hay %, se pide %', st.data ->> 'nombre', trim_scale(disp), trim_scale(p_cantidad) using errcode = '23514';
  end if;
  saldo := trim_scale(round(disp - p_cantidad, 2));

  n := public.siguiente_numero('VPI');
  vpi := 'VPI-' || lpad(n::text, 6, '0');
  select usuario into quien from public.perfiles where id = auth.uid();

  update public.almacen
     set data = data || jsonb_build_object('cantidad', saldo, 'actualizado', ahora)
   where tipo = 'stock' and id::text = p_stock_id;

  insert into public.almacen (tipo, id, data)
  values ('KARDEX', gen_random_uuid()::text, jsonb_build_object(
    'fecha', ahora, 'sede', st.data ->> 'sede', 'stock_id', p_stock_id, 'producto', st.data ->> 'nombre', 'unidad', st.data ->> 'unidad',
    'tipo_movimiento', 'SALIDA-PRODUCCION', 'documento', vpi, 'chasis', chasis, 'motivo', p_motivo,
    'cantidad', -p_cantidad, 'saldo', saldo, 'usuario', coalesce(quien, 'almacen')));

  insert into public.almacen (tipo, id, data)
  values ('VALE_PRODUCCION', vpi, jsonb_build_object(
    'id', vpi, 'fecha', ahora, 'stock_id', p_stock_id, 'sede', st.data ->> 'sede', 'producto', st.data ->> 'nombre', 'unidad', st.data ->> 'unidad',
    'cantidad', p_cantidad, 'chasis_ot', chasis, 'op_id', case when chasis is null then null else p_op_id end, 'equipo_id', case when chasis is null then null else p_equipo_id end, 'motivo', p_motivo,
    'solicitante', btrim(p_solicitante), 'autoriza', btrim(p_autoriza), 'usuario', coalesce(quien, 'almacen'), 'saldo', saldo));

  return jsonb_build_object('vpi', vpi, 'saldo', saldo);
end $$;

revoke all on function public.retiro_produccion(text, numeric, text, text, text, text, text, text) from public, anon;
grant execute on function public.retiro_produccion(text, numeric, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Verificación
select tipo_movimiento, count(*) from public.v_kardex group by 1;
