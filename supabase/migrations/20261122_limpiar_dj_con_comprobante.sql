-- =====================================================================
-- LIMPIEZA: DJ AUTOMÁTICAS EN GASTOS QUE SÍ TIENEN COMPROBANTE (Williams 2026-11-13)
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
--
-- El PR #81 generó una declaración jurada (data.djNumero, DJ-0042) a todo gasto sin OC ni OS, también
-- a los que tienen factura, boleta, recibo u otro comprobante, y también de forma retroactiva al abrir
-- Registro de gastos. Regla corregida: la DJ automática SOLO va en gastos marcados "Sin comprobante".
--
-- Este script quita djNumero y djEstado de los gastos con comprobante (no toca los gastos "Sin
-- comprobante", ni los registrados con comprobante DJ, ni las DJ de OC). Antes guarda un respaldo en
-- public.compras_respaldo_dj_20261113. El historial del gasto conserva la línea "Declaración jurada
-- generada" como rastro. Los N° DJ usados quedan como saltos en el correlativo (no se reutilizan).
--
-- La app ya ignora esas DJ (no aparecen en Declaraciones) aunque no se corra este script.
-- =====================================================================

-- 1) VISTA PREVIA (correr sola primero para ver qué gastos se limpian)
select id,
       data->>'codigo'           as gasto,
       data->>'fecha'            as fecha,
       data->>'comprobanteGasto' as comprobante,
       data->>'numero'           as n_comprobante,
       data->>'djNumero'         as dj_a_quitar,
       data->>'djEstado'         as estado_dj,
       data->>'total'            as importe
from public.compras
where tipo = 'factura'
  and coalesce(data->>'djNumero', '') <> ''
  and coalesce(data->>'comprobanteGasto', '') not in ('SIN_COMPROBANTE', 'DJ')
  and coalesce(data->>'tipo', '') <> 'DECLARACION_JURADA'
order by data->>'fecha', data->>'codigo';

-- 2) RESPALDO + LIMPIEZA
create table if not exists public.compras_respaldo_dj_20261113 as
  select * from public.compras where false;

insert into public.compras_respaldo_dj_20261113
select c.* from public.compras c
where c.tipo = 'factura'
  and coalesce(c.data->>'djNumero', '') <> ''
  and coalesce(c.data->>'comprobanteGasto', '') not in ('SIN_COMPROBANTE', 'DJ')
  and coalesce(c.data->>'tipo', '') <> 'DECLARACION_JURADA'
  and not exists (select 1 from public.compras_respaldo_dj_20261113 r where r.id = c.id);

update public.compras
set data = data - 'djNumero' - 'djEstado'
where tipo = 'factura'
  and coalesce(data->>'djNumero', '') <> ''
  and coalesce(data->>'comprobanteGasto', '') not in ('SIN_COMPROBANTE', 'DJ')
  and coalesce(data->>'tipo', '') <> 'DECLARACION_JURADA';

-- 3) VERIFICAR: debe devolver 0
select count(*) as dj_en_gastos_con_comprobante
from public.compras
where tipo = 'factura'
  and coalesce(data->>'djNumero', '') <> ''
  and coalesce(data->>'comprobanteGasto', '') not in ('SIN_COMPROBANTE', 'DJ')
  and coalesce(data->>'tipo', '') <> 'DECLARACION_JURADA';
