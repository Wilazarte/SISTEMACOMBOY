-- =====================================================================
-- Boletas de pago: el correlativo se REINICIA cada año (BOL-001-2026 ... BOL-001-2027).
-- Contador por año dentro del contador de numeración (compras, tipo 'contador'): BOL_2026, BOL_2027, ...
-- Un año nuevo no tiene su llave -> empieza en 0 y la primera boleta sale 001.
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
  elsif (serie in ('BOL', 'RCT') or serie ~ '^BOL_[0-9]{4}$') and rol not in ('creador', 'planilla') then
    raise exception 'Su usuario no puede emitir boletas ni requerimientos de contratista' using errcode = '42501';
  elsif serie in ('EQ', 'OP') and rol not in ('creador', 'almacen') then
    raise exception 'Su usuario no puede registrar producción ni equipos terminados' using errcode = '42501';
  elsif (serie not in ('REQ', 'OC', 'DJ', 'NP', 'F001', 'B001', 'OD', 'BOL', 'GST', 'RCT', 'EQ', 'OP') and serie !~ '^BOL_[0-9]{4}$') or rol is null then
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

-- Continuidad: las boletas ya emitidas este año usaron el contador global BOL.
-- El contador del año actual arranca desde ahí (solo si aún no existe), para no repetir códigos.
update public.compras
   set data = data || jsonb_build_object('BOL_' || extract(year from now())::int, (data ->> 'BOL')::int)
 where tipo = 'contador'
   and id = '00000000-0000-0000-0000-000000000001'
   and data ? 'BOL'
   and not data ? ('BOL_' || extract(year from now())::int);

notify pgrst, 'reload schema';

-- Verificación: contadores BOL por año
select key, value from public.compras, jsonb_each(data) where tipo = 'contador' and key like 'BOL%';
