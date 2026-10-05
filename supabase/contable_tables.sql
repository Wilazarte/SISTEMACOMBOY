-- =====================================================================
-- MÓDULO CONTABLE: tabla contable (tipo + id + data jsonb), igual que ventas / almacen.
-- tipo: ASIENTO_DIARIO, PLAN_CUENTAS, CIERRE_MENSUAL
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- =====================================================================

create table if not exists public.contable (tipo text not null, id text not null, primary key (tipo, id));
alter table public.contable
  add column if not exists tipo text,
  add column if not exists id text,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid default auth.uid();

create unique index if not exists contable_tipo_id_uidx on public.contable (tipo, id);
create index if not exists contable_periodo_idx on public.contable ((data->>'periodo')) where tipo = 'ASIENTO_DIARIO';

drop trigger if exists contable_updated_at on public.contable;
create trigger contable_updated_at before update on public.contable for each row execute function public.tocar_updated_at();

-- Permisos: ven el módulo Contable (creador / gerencia / perfiles con /dashboard/contable) y quienes
-- generan asientos automáticos (tesorería: NP y OC; planilla: pago de planilla).
grant select, insert, update, delete on public.contable to authenticated;
revoke all on public.contable from anon;
alter table public.contable enable row level security;
drop policy if exists contable_select on public.contable;
create policy contable_select on public.contable for select to authenticated
  using (public.puede_ver('/dashboard/contable') or public.mi_rol() in ('creador', 'tesoreria', 'planilla'));
drop policy if exists contable_escribir on public.contable;
create policy contable_escribir on public.contable for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria', 'planilla'))
  with check (public.mi_rol() in ('creador', 'tesoreria', 'planilla'));

-- Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contable') then
    alter publication supabase_realtime add table public.contable;
  end if;
end $$;

-- Gerencia ve todos los módulos ("*"); para dar Contable a otro usuario:
-- update public.perfiles set modulos = array_append(modulos, '/dashboard/contable') where usuario = 'contador';

-- Verificación
select tipo, count(*) from public.contable group by tipo order by tipo;
