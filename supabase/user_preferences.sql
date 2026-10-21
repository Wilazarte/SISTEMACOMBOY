-- Preferencias de interfaz por usuario (rediseño UI): orden de tarjetas del Dashboard,
-- tema claro/oscuro, menú lateral plegado / estilo y notificaciones vistas.
-- Una fila por usuario; cada uno solo lee y escribe la suya (también los de solo lectura:
-- son preferencias visuales, no datos del negocio). Se puede ejecutar varias veces.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

grant select, insert, update on public.user_preferences to authenticated;
revoke all on public.user_preferences from anon;

drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own" on public.user_preferences
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "user_preferences_insert_own" on public.user_preferences;
create policy "user_preferences_insert_own" on public.user_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own" on public.user_preferences
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
