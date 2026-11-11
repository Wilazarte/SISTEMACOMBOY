-- =====================================================================
-- COTIZACIÓN DEL PROVEEDOR EN "REGISTRAR GASTO" (Tesorería)
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
--
-- El gasto ya se guarda en public.compras (tipo 'factura', data jsonb): el N° de la cotización
-- del proveedor va dentro de data (cotizacionProveedor) y no necesita columnas nuevas.
-- Este script solo agrega el correlativo para cuando el proveedor NO entregó cotización:
--   COT-PROV-0001-2026, COT-PROV-0002-2026… (contador COTPROV_2026, se reinicia cada año),
-- en la misma fila de contadores que usan las OS (siguiente_numero_os), sin tocar siguiente_numero().
-- =====================================================================

create or replace function public.siguiente_numero_cot_prov() returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  clave text := 'COTPROV_' || to_char(now() at time zone 'America/Lima', 'YYYY');
  n integer;
begin
  if rol is null or rol not in ('creador', 'soporte', 'tesoreria', 'finanzas') then
    raise exception 'Su usuario no puede generar códigos de cotización de gastos' using errcode = '42501';
  end if;

  insert into public.compras (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(clave, 1))
  on conflict (tipo, id) do update
    set data = public.compras.data || jsonb_build_object(clave, coalesce((public.compras.data ->> clave)::integer, 0) + 1)
  returning (data ->> clave)::integer into n;
  return n;
end $$;

revoke all on function public.siguiente_numero_cot_prov() from public, anon;
grant execute on function public.siguiente_numero_cot_prov() to authenticated;
