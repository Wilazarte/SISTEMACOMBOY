-- =====================================================================
-- ÓRDENES DE SERVICIO (OS-001-2026)
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
--
-- Las OS se guardan en la misma tabla public.compras (tipo 'orden_servicio', data jsonb),
-- igual que las OC (tipo 'orden'): no hace falta tabla nueva y la política compras_escribir
-- ya deja escribir a creador y tesorería. Este script solo agrega:
--   1) el correlativo propio de las OS, por año (contador OS_2026, OS_2027…), sin tocar
--      siguiente_numero() ni la numeración de las OC;
--   2) un índice para listar las OS por fecha.
-- =====================================================================

-- 1) Numeración: OS-001-2026 (solo creador y tesorería, como las OC)
create or replace function public.siguiente_numero_os() returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  clave text := 'OS_' || to_char(now() at time zone 'America/Lima', 'YYYY');
  n integer;
begin
  if rol is null or rol not in ('creador', 'tesoreria') then
    raise exception 'Su usuario no puede emitir órdenes de servicio' using errcode = '42501';
  end if;

  insert into public.compras (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(clave, 1))
  on conflict (tipo, id) do update
    set data = public.compras.data || jsonb_build_object(clave, coalesce((public.compras.data ->> clave)::integer, 0) + 1)
  returning (data ->> clave)::integer into n;
  return n;
end $$;

revoke all on function public.siguiente_numero_os() from public, anon;
grant execute on function public.siguiente_numero_os() to authenticated;

-- 2) Listado de OS por fecha
create index if not exists idx_compras_orden_servicio_fecha
  on public.compras ((data ->> 'fecha'))
  where tipo = 'orden_servicio';
