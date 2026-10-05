-- =====================================================================
-- ÓRDENES DE DESPACHO: diagnóstico y vista SQL
-- El ERP guarda cada OD como documento en public.almacen (tipo = 'despacho'), con Realtime
-- igual que el stock. NO hace falta una tabla aparte: esta vista permite consultarlas como tabla.
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- =====================================================================

-- 1) ¿Cuántas OD hay guardadas?
select count(*) as ordenes_despacho from public.almacen where tipo = 'despacho';

-- 2) Notas de pedido APROBADAS / FACTURADAS y si tienen OD (odId vacío = sin orden de despacho)
select data->>'numero' as np, data->>'estado' as estado, data->>'odNumero' as od
from public.ventas
where tipo = 'nota_pedido' and data->>'estado' in ('APROBADA', 'FACTURADA')
order by data->>'numero';

-- 3) Permisos: Ventas (tesoreria) y Almacén deben poder escribir en almacen
select policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'almacen';

-- 4) Si las políticas no existen (la consulta 3 sale vacía), se crean:
alter table public.almacen enable row level security;
drop policy if exists almacen_select on public.almacen;
create policy almacen_select on public.almacen for select to authenticated
  using (public.puede_ver('/dashboard/almacen') or public.puede_ver('/dashboard/compras') or public.puede_ver('/dashboard/ventas'));
drop policy if exists almacen_escribir on public.almacen;
create policy almacen_escribir on public.almacen for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria', 'almacen'))
  with check (public.mi_rol() in ('creador', 'tesoreria', 'almacen'));

-- 5) Vista de solo lectura v_ordenes_despacho (una fila por OD, columnas como tabla)
create or replace view public.v_ordenes_despacho with (security_invoker = true) as
select
  'OD-' || lpad(substring(data->>'numero' from '(\d+)$')::int::text, 3, '0') || '-' || left(data->>'fecha', 4) as codigo,
  data->>'numero' as numero,
  (data->>'fecha')::date as fecha,
  data->>'npNumero' as nota_pedido_codigo,
  data->>'comprobanteNumero' as comprobante_numero,
  data->>'cliente' as cliente_nombre,
  data->>'clienteDoc' as cliente_dni_ruc,
  data->>'vendedor' as vendedor,
  data->'items' as items,
  data->>'lugar' as lugar_entrega,
  data->>'agenciaNombre' as agencia_nombre,
  data->>'guiaNro' as guia_nro,
  nullif(data->>'costoEnvio', '')::numeric as costo_envio,
  data->>'estado' as estado,
  data->>'observacion' as observacion,
  data->>'atendidoPor' as atendido_por,
  id as od_id
from public.almacen
where tipo = 'despacho';

grant select on public.v_ordenes_despacho to authenticated;

select * from public.v_ordenes_despacho order by numero desc limit 5;
