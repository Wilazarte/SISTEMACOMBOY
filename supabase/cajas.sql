-- =====================================================================
-- Cajas: de dónde sale el dinero de cada pago (planilla, adelantos, contratistas, OC, facturas).
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces. No modifica pagos existentes.
-- Requiere public.mi_rol() (supabase_tables.sql).
-- =====================================================================

create table if not exists public.cajas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,              -- CAJA CHICA, CAJA GENERAL, FONDO DE RESERVA
  tipo text not null,                -- EFECTIVO | YAPE | BCP | BBVA | INTERBANK
  saldo_actual numeric(10,2) default 0,
  responsable text,
  estado text default 'ACTIVA',      -- ACTIVA | INACTIVA
  orden integer default 100,         -- orden en el selector "¿De qué cuenta se realiza el pago?"
  created_at timestamptz default now()
);
alter table public.cajas add column if not exists orden integer default 100;
create unique index if not exists cajas_nombre_key on public.cajas (upper(btrim(nombre)));

-- Las 3 cajas de Arequipa (datos Interbank y cajas viejas inactivas: migrations/20261031_cajas_arequipa.sql)
insert into public.cajas (nombre, tipo, orden) values
  ('CAJA CHICA', 'EFECTIVO', 10),
  ('CAJA GENERAL', 'INTERBANK', 20),
  ('FONDO DE RESERVA', 'EFECTIVO', 30)
on conflict do nothing;

-- RLS: todos los usuarios ven las cajas; las administran creador, tesorería y admin
alter table public.cajas enable row level security;
drop policy if exists cajas_select on public.cajas;
drop policy if exists cajas_escribir on public.cajas;
create policy cajas_select on public.cajas for select to authenticated using (true);
create policy cajas_escribir on public.cajas for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria', 'admin'))
  with check (public.mi_rol() in ('creador', 'tesoreria', 'admin'));
revoke all on public.cajas from anon;
grant select, insert, update, delete on public.cajas to authenticated;

-- Caja de salida en los pagos que viven en tablas propias (el resto se guarda en el JSON del documento)
alter table public.adelantos add column if not exists caja_nombre text;
alter table public.planilla_historial add column if not exists caja_nombre text;

-- El historial de planilla no se edita (solo lectura para los usuarios): la caja se fija una sola vez,
-- justo después de pagar, con esta función. No cambia montos.
create or replace function public.fijar_caja_planilla(p_id uuid, p_caja text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.mi_rol() not in ('creador', 'planilla', 'tesoreria', 'admin') then
    raise exception 'Su usuario no puede pagar planillas' using errcode = '42501';
  end if;
  if coalesce(btrim(p_caja), '') = '' then
    raise exception 'Indique la caja' using errcode = '22023';
  end if;
  update public.planilla_historial set caja_nombre = btrim(p_caja) where id = p_id and caja_nombre is null;
end $$;
revoke all on function public.fijar_caja_planilla(uuid, text) from public, anon;
grant execute on function public.fijar_caja_planilla(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Verificación
select nombre, tipo, estado, orden from public.cajas order by orden, nombre;
