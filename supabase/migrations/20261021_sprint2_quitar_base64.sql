-- =====================================================================
-- SPRINT 2 · Quitar base64 de las filas — NO aplicar hasta que:
--   1) la subida nueva a Storage funcione en producción (subirBaucher en lib/storage.ts), y
--   2) scripts/mover-adjuntos-a-storage.mjs haya movido los adjuntos antiguos (modo --aplicar).
-- =====================================================================

-- 0) Dónde está el base64 hoy (medido el 2026-10-21):
--    compras tipo guia   : 5 filas, 542 kB  (data->>'archivoDataUrl')
--    almacen tipo despacho: 3 filas, 1.6 MB (fotoGuia / firmaCliente dentro de data)
--    compras.voucher_data_url (columna): vacía en las 129 filas
select 'compras' tabla, tipo, count(*) filas, pg_size_pretty(sum(octet_length(data::text))::bigint) peso
  from public.compras where data::text like '%data:%;base64,%' group by tipo
union all
select 'almacen', tipo, count(*), pg_size_pretty(sum(octet_length(data::text))::bigint)
  from public.almacen where data::text like '%data:%;base64,%' group by tipo;

-- 1) Pedido en la tarea. Hoy afecta 0 filas: ninguna fila tiene la clave voucher_data_url dentro de data.
update public.compras set data = data - 'voucher_data_url' where data ? 'voucher_data_url';

-- 2) Limpieza real: NO hace falta un DELETE de base64. El script reemplaza cada "data:...;base64,..."
--    por "sb:tesoreria/<ruta>" en la misma clave, así el documento sigue mostrando su archivo.
--    Después de correrlo, la consulta 0) debe devolver 0 filas.
