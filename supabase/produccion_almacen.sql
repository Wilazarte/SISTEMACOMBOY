-- =====================================================================
-- PRODUCCIÓN -> ALMACÉN -> VENTA / DESPACHO (trazabilidad de equipos terminados)
-- Todo vive en public.almacen (tipo + id + data), igual que el stock:
--   ORDEN_PRODUCCION   órdenes de producción (OP-2026-0001)
--   EQUIPO_TERMINADO   equipos (EQ-2026-0001), estado DISPONIBLE / EN_QC / VENDIDO
--   MOVIMIENTO_ALMACEN ingresos, transferencias y salidas (vista movimientos_almacen)
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- =====================================================================

-- 1) La vista depende de almacen: se quita antes de tocar la columna id
drop view if exists public.v_equipos_terminados;
drop view if exists public.movimientos_almacen;

-- 2) id de almacen como TEXT (EQ-2026-0004, OP-2026-0001...) sin default
do $$
declare t text;
begin
  select data_type into t from information_schema.columns where table_schema = 'public' and table_name = 'almacen' and column_name = 'id';
  if t not in ('text', 'character varying') then
    execute 'alter table public.almacen alter column id type text using id::text';
  end if;
  execute 'alter table public.almacen alter column id drop default';
end $$;

-- 3) Equipos con sede solo en "sede": se copia a ubicacion_sede
update public.almacen set data = data || jsonb_build_object('ubicacion_sede', data->>'sede')
where tipo = 'EQUIPO_TERMINADO' and data->>'ubicacion_sede' is null and data->>'sede' is not null;

-- 4) Vistas
drop view if exists public.v_equipos_terminados;
create view public.v_equipos_terminados with (security_invoker = true) as
select
  id,
  data->>'codigo_chasis' as chasis,
  coalesce(data->>'ubicacion_sede', data->>'sede') as sede,
  data->>'estado' as estado,
  data,
  data->>'tipo_equipo' as tipo_equipo,
  data->>'modelo' as modelo,
  data->>'marca_motor' as marca_motor,
  data->>'serie_motor' as serie_motor,
  data->>'origen' as origen,
  data->>'op_id' as op_id,
  data->>'qc_supervisor' as qc_supervisor,
  data->>'fecha_ingreso' as fecha_ingreso,
  data->>'cliente' as cliente,
  data->>'vendido_od' as od,
  data->>'fecha_salida' as fecha_salida
from public.almacen
where tipo = 'EQUIPO_TERMINADO';
grant select on public.v_equipos_terminados to authenticated;

create view public.movimientos_almacen with (security_invoker = true) as
select
  id,
  data->>'tipo' as tipo,
  data->>'chasis' as chasis,
  data->>'equipo_id' as equipo_id,
  data->>'producto' as producto,
  (data->>'cantidad')::numeric as cantidad,
  data->>'de_sede' as de_sede,
  data->>'a_sede' as a_sede,
  data->>'a_cliente' as a_cliente,
  data->>'od' as od,
  data->>'op' as op,
  (data->>'fecha')::timestamptz as fecha,
  data->>'usuario' as usuario
from public.almacen
where tipo = 'MOVIMIENTO_ALMACEN';
grant select on public.movimientos_almacen to authenticated;

-- 5) Chasis único entre equipos terminados
create unique index if not exists almacen_eq_chasis_uidx
  on public.almacen (upper(replace(data->>'codigo_chasis', ' ', ''))) where tipo = 'EQUIPO_TERMINADO';

-- 6) Correlativos atómicos EQ y OP (creador y almacén)
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
  elsif serie in ('BOL', 'RCT') and rol not in ('creador', 'planilla') then
    raise exception 'Su usuario no puede emitir boletas ni requerimientos de contratista' using errcode = '42501';
  elsif serie in ('EQ', 'OP') and rol not in ('creador', 'almacen') then
    raise exception 'Su usuario no puede registrar producción ni equipos terminados' using errcode = '42501';
  elsif serie not in ('REQ', 'OC', 'DJ', 'NP', 'F001', 'B001', 'OD', 'BOL', 'GST', 'RCT', 'EQ', 'OP') or rol is null then
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

-- Verificación
select id, chasis, sede, estado, origen, op_id from public.v_equipos_terminados order by id;
