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
  add column if not exists updated_by uuid default auth.uid(),
  add column if not exists planilla_id uuid,          -- planilla_historial.id donde se descontó
  add column if not exists descontado_en timestamptz;

-- Estado sin importar mayúsculas ('pendiente' o 'PENDIENTE')
alter table public.adelantos drop constraint if exists adelantos_valores_check;
alter table public.adelantos add constraint adelantos_valores_check
  check (coalesce(btrim(trabajador_nombre), '') <> '' and monto > 0 and upper(estado) in ('PENDIENTE', 'DESCONTADO', 'ANULADO')
         and (dni is null or dni = '' or dni ~ '^\d{8}$')) not valid;

do $$
begin
  -- planilla_id -> planilla_historial (si el historial ya existe)
  if to_regclass('public.planilla_historial') is not null
     and not exists (select 1 from pg_constraint where conname = 'adelantos_planilla_id_fkey') then
    alter table public.adelantos add constraint adelantos_planilla_id_fkey
      foreign key (planilla_id) references public.planilla_historial (id) on delete set null not valid;
  end if;
end $$;
create index if not exists adelantos_pendientes_idx on public.adelantos (upper(estado), trabajador_nombre);
create index if not exists adelantos_fecha_idx on public.adelantos (fecha desc);

-- updated_at / updated_by al editar. Un adelanto DESCONTADO ya se pagó en una planilla: no se edita ni se borra.
create or replace function public.adelantos_actualizado() returns trigger
language plpgsql as $$
begin
  if upper(old.estado) = 'DESCONTADO' then
    raise exception 'El adelanto ya fue descontado en planilla: no se puede % ', case when tg_op = 'DELETE' then 'eliminar' else 'modificar' end
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  -- DESCONTADO solo lo pone el cierre de planilla (con planilla_id)
  if upper(new.estado) = 'DESCONTADO' and new.planilla_id is null then
    raise exception 'Un adelanto solo se marca DESCONTADO al pagar la planilla' using errcode = '55000';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists adelantos_actualizado on public.adelantos;
create trigger adelantos_actualizado before update or delete on public.adelantos
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
select fecha, trabajador_nombre, dni, monto, estado, planilla_id from public.adelantos order by fecha desc limit 10;
