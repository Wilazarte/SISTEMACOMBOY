-- Guías de Remisión (Ventas): serie T005 con correlativo atómico en siguiente_numero.
-- Mismos roles que facturas y boletas (ventas, creador, tesoreria). Secocha numera con siguiente_numero_sede (T002).

create or replace function public.siguiente_numero(serie text) returns integer
language plpgsql security definer set search_path to 'public' as $function$
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
  elsif serie in ('NP', 'F001', 'B001', 'F005', 'B005', 'T005', 'OD') and rol not in ('ventas', 'creador', 'tesoreria') then
    raise exception 'Su usuario no puede emitir documentos de venta' using errcode = '42501';
  elsif serie = 'GST' and rol not in ('creador', 'tesoreria') then
    raise exception 'Su usuario no puede codificar gastos' using errcode = '42501';
  elsif (serie in ('BOL', 'RCT') or serie ~ '^BOL_[0-9]{4}$') and rol not in ('creador', 'planilla') then
    raise exception 'Su usuario no puede emitir boletas ni requerimientos de contratista' using errcode = '42501';
  elsif serie in ('EQ', 'OP', 'VPI') and rol not in ('creador', 'almacen') then
    raise exception 'Su usuario no puede registrar producción ni equipos terminados' using errcode = '42501';
  elsif (serie not in ('REQ', 'OC', 'DJ', 'NP', 'F001', 'B001', 'F005', 'B005', 'T005', 'OD', 'BOL', 'GST', 'RCT', 'EQ', 'OP', 'VPI') and serie !~ '^BOL_[0-9]{4}$') or rol is null then
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;

  insert into public.compras (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(serie, 1))
  on conflict (tipo, id) do update
    set data = public.compras.data || jsonb_build_object(serie, coalesce((public.compras.data ->> serie)::integer, 0) + 1)
  returning (data ->> serie)::integer into n;
  return n;
end $function$;
