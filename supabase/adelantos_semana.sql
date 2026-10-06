-- Adelantos registrados desde la planilla (columna ADELANTOS): trabajador, semana y sede.
-- Opcional: sin estas columnas el adelanto se guarda igual (nombre, DNI, fecha, monto, concepto).
alter table public.adelantos add column if not exists trabajador_id text;
alter table public.adelantos add column if not exists semana text;
alter table public.adelantos add column if not exists sede text;
notify pgrst, 'reload schema';
