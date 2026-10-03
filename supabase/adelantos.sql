-- =====================================================================
-- Planilla › Adelantos: adelantos de sueldo (luego se descuentan en planilla).
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- Requiere public.mi_rol() y public.puede_ver() (supabase_tables.sql).
-- (También incluido en supabase_tables.sql, sección 7g.)
-- =====================================================================

create table if not exists public.adelantos (
  id uuid primary key default gen_random_uuid()
);
alter table public.adelantos
  add column if not exists trabajador_nombre text,
  add column if not exists dni text,
  add column if not exists fecha date not null default current_date,
  add column if not exists monto numeric(10,2) not null default 0,
  add column if not exists motivo text,
  add column if not exists estado text not null default 'PENDIENTE', -- PENDIENTE | DESCONTADO | ANULADO
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid default auth.uid();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'adelantos_valores_check') then
    alter table public.adelantos add constraint adelantos_valores_check
      check (coalesce(btrim(trabajador_nombre), '') <> '' and monto > 0 and estado in ('PENDIENTE', 'DESCONTADO', 'ANULADO')
             and (dni is null or dni = '' or dni ~ '^\d{8}$')) not valid;
  end if;
end $$;
create index if not exists adelantos_fecha_idx on public.adelantos (fecha desc);

-- updated_at / updated_by al editar
create or replace function public.adelantos_actualizado() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists adelantos_actualizado on public.adelantos;
create trigger adelantos_actualizado before update on public.adelantos
  for each row execute function public.adelantos_actualizado();

-- RLS: lo ven quienes entran a Planilla (incluida gerencia); lo editan planilla y creador
alter table public.adelantos enable row level security;
drop policy if exists adelantos_select on public.adelantos;
drop policy if exists adelantos_escribir on public.adelantos;
create policy adelantos_select on public.adelantos for select to authenticated
  using (public.puede_ver('/dashboard/planilla'));
create policy adelantos_escribir on public.adelantos for all to authenticated
  using (public.mi_rol() in ('creador', 'planilla', 'admin'))
  with check (public.mi_rol() in ('creador', 'planilla', 'admin'));
revoke all on public.adelantos from anon;
grant select, insert, update, delete on public.adelantos to authenticated;

-- Realtime: un adelanto registrado en una PC aparece al instante en las demás
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adelantos') then
    alter publication supabase_realtime add table public.adelantos;
  end if;
end $$;

-- Verificación
select fecha, trabajador_nombre, dni, monto, estado from public.adelantos order by fecha desc limit 10;
