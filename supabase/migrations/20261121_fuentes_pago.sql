-- =====================================================================
-- Fuentes de pago de Arequipa (selector "¿De qué cuenta se realiza el pago?"), en este orden:
--   1. CAJA GENERAL (transferencias, Interbank Negocios)   2. CAJA CHICA (efectivo)
--   3. FONDO DE RESERVA                                     4. PRÉSTAMO (pide quién hizo el préstamo)
--   5. CRÉDITO                                              6. OTROS (pide el detalle)
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- Requiere supabase/cajas.sql y supabase/migrations/20261031_cajas_arequipa.sql.
--
-- No borra nada ni cambia ningún pago. El dato de quién prestó / el detalle de OTROS se guarda en el mismo texto
-- de la caja del pago ("PRÉSTAMO — Préstamo de: Juan Pérez"), así que no hacen falta columnas nuevas.
-- El sistema ya muestra las 6 fuentes aunque este SQL no se haya ejecutado; el SQL las deja registradas en la tabla.
-- =====================================================================

do $$
begin
  if to_regclass('public.cajas') is null then
    raise exception 'Falta la tabla public.cajas: ejecute primero supabase/cajas.sql';
  end if;
end $$;

alter table public.cajas add column if not exists descripcion text;
alter table public.cajas add column if not exists cuentas_bancarias jsonb not null default '[]'::jsonb;

-- Orden y descripción de las 3 cajas que ya existen (no se tocan sus cuentas bancarias)
update public.cajas set orden = 10, descripcion = 'Transferencias · Interbank Negocios (soles y dólares)', estado = 'ACTIVA' where upper(btrim(nombre)) = 'CAJA GENERAL';
update public.cajas set orden = 20, descripcion = 'Solo efectivo', estado = 'ACTIVA' where upper(btrim(nombre)) = 'CAJA CHICA';
update public.cajas set orden = 30, estado = 'ACTIVA' where upper(btrim(nombre)) = 'FONDO DE RESERVA';

-- Las 3 fuentes nuevas
insert into public.cajas (nombre, tipo, descripcion, cuentas_bancarias, estado, orden) values
  ('PRÉSTAMO', 'PRESTAMO', 'Dinero prestado (se indica quién hizo el préstamo)', '[]'::jsonb, 'ACTIVA', 40),
  ('CRÉDITO', 'CREDITO', 'Pago a crédito (queda como deuda con el proveedor)', '[]'::jsonb, 'ACTIVA', 50),
  ('OTROS', 'OTROS', 'Otra fuente de pago (se llena el detalle)', '[]'::jsonb, 'ACTIVA', 60)
on conflict ((upper(btrim(nombre)))) do update
  set tipo = excluded.tipo,
      descripcion = excluded.descripcion,
      estado = 'ACTIVA',
      orden = excluded.orden;

notify pgrst, 'reload schema';

-- Verificación: deben salir las 6 fuentes ACTIVAS en orden 10…60
select nombre, tipo, estado, orden, descripcion from public.cajas where estado = 'ACTIVA' order by orden, nombre;
