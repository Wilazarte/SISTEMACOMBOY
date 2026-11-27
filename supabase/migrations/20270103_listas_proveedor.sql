-- =====================================================================
-- Listas de pedido por proveedor (Williams 2026-11-26)
--
-- Los REQ de Almacén se juntan por proveedor en documentos compras tipo 'lista_proveedor'
-- (SC-001-2026). Tesorería las revisa, pide cotización por WhatsApp / correo y registra la cotización.
--
-- Este SQL es OPCIONAL y se puede correr más de una vez: solo AGREGA permisos para ese tipo de documento
-- (si su base ya deja a Tesorería escribir en compras, todo funciona sin correrlo). No borra ni cambia datos.
-- El aislamiento por sede (política restrictiva sede_isolation) sigue igual: Arequipa y Secocha
-- tienen listas separadas.
-- =====================================================================

begin;

-- Leer: Tesorería / Finanzas, Logística, Almacén (ve en qué lista quedó su REQ), Gerencia, Secocha y soporte
drop policy if exists compras_listas_proveedor_select on public.compras;
create policy compras_listas_proveedor_select on public.compras for select to authenticated
  using (tipo = 'lista_proveedor'
         and public.mi_rol() in ('creador', 'admin', 'soporte', 'tesoreria', 'finanzas', 'compras', 'logistica', 'almacen', 'gerencia', 'sucursal'));

-- Escribir (las arma y edita Tesorería): Tesorería / Finanzas, compras, Secocha y soporte
drop policy if exists compras_listas_proveedor_escribir on public.compras;
create policy compras_listas_proveedor_escribir on public.compras for all to authenticated
  using (tipo = 'lista_proveedor' and public.mi_rol() in ('creador', 'admin', 'soporte', 'tesoreria', 'finanzas', 'compras', 'sucursal'))
  with check (tipo = 'lista_proveedor' and public.mi_rol() in ('creador', 'admin', 'soporte', 'tesoreria', 'finanzas', 'compras', 'sucursal'));

commit;

-- Revisión (opcional): listas guardadas por sede y estado
-- select sede_id, data->>'estado' estado, count(*) from public.compras where tipo = 'lista_proveedor' group by 1, 2 order by 1, 2;
