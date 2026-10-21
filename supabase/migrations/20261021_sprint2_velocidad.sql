-- =====================================================================
-- SPRINT 2 · VELOCIDAD · ERP COMBOY VID — índices (NO aplicado todavía)
-- Solo crea índices: no toca datos, policies ni grants.
-- =====================================================================

-- Pedidos en la tarea (búsquedas por periodo / fecha dentro de data)
create index if not exists idx_planilla_periodo on public.planilla ((data->>'periodo'));
create index if not exists idx_compras_fecha on public.compras ((data->>'fecha'));
-- Nota: almacen ya tiene almacen_tipo_id_uidx (tipo, id), que sirve para filtrar por tipo;
-- este índice queda redundante, se deja porque fue pedido.
create index if not exists idx_almacen_tipo on public.almacen (tipo);

-- Los que usa la carga del ERP (lib/storage.ts descargar): where tipo = ? order by created_at desc
create index if not exists idx_compras_tipo_creado on public.compras (tipo, created_at desc);
create index if not exists idx_almacen_tipo_creado on public.almacen (tipo, created_at desc);
create index if not exists idx_planilla_tipo_creado on public.planilla (tipo, created_at desc);
create index if not exists idx_ventas_tipo_creado on public.ventas (tipo, created_at desc);
create index if not exists idx_contable_tipo_creado on public.contable (tipo, created_at desc);

analyze public.compras, public.almacen, public.planilla, public.ventas, public.contable;

-- Verificación:
-- select tablename, indexname from pg_indexes where schemaname = 'public' and indexname like 'idx_%' order by 1, 2;
