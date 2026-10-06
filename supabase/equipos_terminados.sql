-- =====================================================================
-- ALMACÉN › EQUIPOS TERMINADOS: correlativo atómico EQ-2026-0001 (serie EQ en siguiente_numero).
-- Los equipos se guardan en public.almacen (tipo = 'EQUIPO_TERMINADO'); no hace falta tabla nueva.
-- Sin este parche el ERP igual numera (por el mayor existente), pero dos PCs a la vez podrían chocar.
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- =====================================================================

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

-- Únicos también en la base (serie de motor y chasis), por si se edita fuera del ERP
create unique index if not exists almacen_eq_serie_motor_uidx
  on public.almacen (upper(replace(data->>'serie_motor', ' ', ''))) where tipo = 'EQUIPO_TERMINADO';
create unique index if not exists almacen_eq_chasis_uidx
  on public.almacen (upper(replace(data->>'codigo_chasis', ' ', ''))) where tipo = 'EQUIPO_TERMINADO';

-- Vista de consulta (se recrea: si ya existía con otras columnas, CREATE OR REPLACE no puede cambiarlas)
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

select id, chasis, sede, estado from public.v_equipos_terminados order by id;
