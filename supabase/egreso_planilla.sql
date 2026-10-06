-- Planilla › "Pagar semana filtrada": el usuario de Planilla registra el EGRESO en Tesorería
-- (tabla compras, tipo 'factura', gasto de Tesorería con tipoGasto = 'PLANILLA').
-- Solo puede ver / escribir esos egresos; el resto de compras sigue siendo de Tesorería.
drop policy if exists compras_egreso_planilla on public.compras;
create policy compras_egreso_planilla on public.compras for all to authenticated
  using (public.mi_rol() = 'planilla' and tipo = 'factura' and data->>'tipoGasto' = 'PLANILLA')
  with check (public.mi_rol() = 'planilla' and tipo = 'factura' and data->>'tipoGasto' = 'PLANILLA');
