-- Adelantos: medio de pago (Efectivo, Yape, Transferencia BCP…) para el detalle de la boleta.
-- Opcional: sin esta columna el adelanto se guarda igual y la boleta muestra fecha y motivo.
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces. No modifica datos existentes.
alter table public.adelantos add column if not exists medio_pago text;
notify pgrst, 'reload schema';
