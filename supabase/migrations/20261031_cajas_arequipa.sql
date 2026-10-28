-- =====================================================================
-- Cajas de Arequipa: CAJA CHICA (solo efectivo), CAJA GENERAL (Interbank Negocios, soles y dólares)
-- y FONDO DE RESERVA (efectivo e inyección de accionistas).
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- Requiere supabase/cajas.sql (tabla public.cajas).
--
-- No borra nada ni cambia ningún pago: los pagos guardan el NOMBRE de la caja, así que los que salieron de
-- cajas viejas (YAPE EMPRESA, BCP EMPRESA - CTA 123…) se siguen leyendo igual. Esas cajas solo pasan a
-- INACTIVAS y dejan de salir en el selector. Las cajas de otras sedes (Secocha) no se tocan.
-- =====================================================================

do $$
begin
  if to_regclass('public.cajas') is null then
    raise exception 'Falta la tabla public.cajas: ejecute primero supabase/cajas.sql';
  end if;
end $$;

alter table public.cajas add column if not exists descripcion text;
alter table public.cajas add column if not exists cuentas_bancarias jsonb not null default '[]'::jsonb;

-- Las 3 cajas (si ya existen se actualizan; su id y sus pagos se conservan)
insert into public.cajas (nombre, tipo, descripcion, cuentas_bancarias, estado, orden) values
  ('CAJA CHICA', 'EFECTIVO', 'Solo efectivo', '[]'::jsonb, 'ACTIVA', 10),
  ('CAJA GENERAL', 'INTERBANK', 'Interbank Negocios (soles y dólares)',
   '[{"banco":"Interbank","producto":"Cuenta Negocios","moneda":"PEN","numero":"3003008986156","cci":"00330000300898615618"},
     {"banco":"Interbank","producto":"Cuenta Negocios","moneda":"USD","numero":"3003008986163","cci":"00330000300898616314"}]'::jsonb,
   'ACTIVA', 20),
  ('FONDO DE RESERVA', 'EFECTIVO', 'Efectivo e inyección de accionistas', '[]'::jsonb, 'ACTIVA', 30)
on conflict ((upper(btrim(nombre)))) do update
  set tipo = excluded.tipo,
      descripcion = excluded.descripcion,
      cuentas_bancarias = excluded.cuentas_bancarias,
      estado = 'ACTIVA',
      orden = excluded.orden;

-- Cualquier otra caja de Arequipa queda INACTIVA (no se borra)
do $$
declare
  con_sede boolean := exists (select 1 from information_schema.columns
                               where table_schema = 'public' and table_name = 'cajas' and column_name = 'sede_id');
begin
  if con_sede and to_regprocedure('public.sede_central()') is not null then
    update public.cajas set estado = 'INACTIVA'
     where upper(btrim(nombre)) not in ('CAJA CHICA', 'CAJA GENERAL', 'FONDO DE RESERVA')
       and coalesce(upper(estado), 'ACTIVA') <> 'INACTIVA'
       and (sede_id is null or sede_id = public.sede_central());
  else
    update public.cajas set estado = 'INACTIVA'
     where upper(btrim(nombre)) not in ('CAJA CHICA', 'CAJA GENERAL', 'FONDO DE RESERVA')
       and coalesce(upper(estado), 'ACTIVA') <> 'INACTIVA';
  end if;
end $$;

notify pgrst, 'reload schema';

-- Verificación: deben salir CAJA CHICA, CAJA GENERAL y FONDO DE RESERVA como ACTIVA
select nombre, tipo, estado, orden, descripcion, cuentas_bancarias from public.cajas order by estado, orden, nombre;
