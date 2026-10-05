-- =====================================================================
-- Pasa a TODOS los trabajadores con AFP u ONP a 10 % de descuento.
-- "Sin descuento" (afpTipo = 'SIN') se queda en 0 %. Solo cambia afpPorcentaje.
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- =====================================================================

update public.planilla
set data = jsonb_set(data, '{afpPorcentaje}', '10'::jsonb)
where tipo = 'trabajador'
  and coalesce(data->>'afpTipo', 'AFP_INTEGRA') <> 'SIN'
  and coalesce(data->>'afpPorcentaje', '') <> '10';

-- Verificación: debe mostrar solo 0 (SIN) y 10
select data->>'afpTipo' as afp, data->>'afpPorcentaje' as porcentaje, count(*)
from public.planilla
where tipo = 'trabajador'
group by 1, 2
order by 1;
