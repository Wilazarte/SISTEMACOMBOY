-- =====================================================================
-- Boletas de pago: numeración correlativa BOL-xxx-AAAA (revisión 2026-11-19).
--
-- 1) siguiente_numero: 20261218_series_f005_b005.sql y 20261219_serie_t005_guias.sql recrearon la función
--    con BOL / BOL_AAAA solo para ('creador', 'planilla'), y Tesorería (que paga y cierra la planilla)
--    perdió el permiso que le dio 20261021_tesoreria_edita_planilla.sql: al descargar la boleta salía
--    "Su usuario no puede emitir boletas…" y no se numeraba. Se recrea igual que 20261219 + tesoreria/admin.
-- 2) El contador del año (BOL_2026…) nunca queda por debajo de la última boleta ya emitida (no repite números).
-- 3) Las boletas que ya salieron repetidas pierden su N° (se conserva la primera) para que reciban uno nuevo.
--
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- =====================================================================

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
  elsif (serie in ('BOL', 'RCT') or serie ~ '^BOL_[0-9]{4}$') and rol not in ('creador', 'planilla', 'tesoreria', 'admin') then
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

revoke all on function public.siguiente_numero(text) from public, anon;
grant execute on function public.siguiente_numero(text) to authenticated;

-- 2) Contador por año >= mayor correlativo emitido ese año (solo sube, nunca baja)
update public.compras c
   set data = c.data || m.ajuste
  from (
    select jsonb_object_agg('BOL_' || anio, mx) as ajuste
      from (
        select (b.data ->> 'anio')::int as anio, max((b.data ->> 'correlativo')::int) as mx
          from public.planilla b
         where b.tipo = 'boleta' and b.data ->> 'anio' ~ '^[0-9]{4}$' and b.data ->> 'correlativo' ~ '^[0-9]+$'
           and coalesce(b.data ->> 'codigo', '') !~ '-SEC-'   -- las de Secocha usan su propio contador
         group by 1
      ) x
      join public.compras k on k.tipo = 'contador' and k.id = '00000000-0000-0000-0000-000000000001'
     where coalesce((k.data ->> ('BOL_' || x.anio))::int, 0) < x.mx
  ) m
 where c.tipo = 'contador' and c.id = '00000000-0000-0000-0000-000000000001' and m.ajuste is not null;

-- 3) Boletas que ya salieron con un N° repetido (ej. la de Darwin con el N° de la anterior): se conserva la más
--    antigua y a las siguientes se les quita el N° (respaldo en planilla_respaldo_boletas_dup). Al volver a
--    descargar esa boleta en el ERP (F5 antes), recibe un N° nuevo que ya no se repite.
create table if not exists public.planilla_respaldo_boletas_dup as select * from public.planilla where false;
with dup as (
  select b.ctid as fila, row_number() over (partition by b.data ->> 'codigo' order by b.data ->> 'fecha', b.id) as orden
    from public.planilla b
   where b.tipo = 'boleta' and coalesce(b.data ->> 'codigo', '') <> ''
), quitar as (
  select fila from dup where orden > 1
), resp as (
  insert into public.planilla_respaldo_boletas_dup select p.* from public.planilla p where p.ctid in (select fila from quitar)
  returning 1
)
delete from public.planilla p where p.ctid in (select fila from quitar);

notify pgrst, 'reload schema';

-- Verificación 1: contadores BOL por año
select key, value from public.compras, jsonb_each(data) where tipo = 'contador' and key like 'BOL%';
-- Verificación 2: códigos de boleta repetidos (debe salir vacío)
select data ->> 'codigo' as codigo, count(*) as veces, string_agg(data ->> 'nombre' || ' · ' || (data ->> 'periodo'), ' | ') as boletas
  from public.planilla where tipo = 'boleta' group by 1 having count(*) > 1;
