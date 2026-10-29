-- =====================================================================
-- Chat grupal de la planta (panel derecho de Logística, Almacén, Finanzas
-- y Producción). SOLO AGREGA: una tabla nueva, sus políticas y Realtime.
-- No modifica ni borra nada existente. Se puede correr más de una vez.
-- =====================================================================

create table if not exists public.chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  user_id uuid not null default auth.uid(),
  usuario text not null,
  nombre text,
  modulo text,
  texto text not null check (char_length(texto) between 1 and 1000)
);

create index if not exists chat_mensajes_creado_idx on public.chat_mensajes (creado desc);

alter table public.chat_mensajes enable row level security;

-- Leer: cualquier usuario con sesión. Escribir: solo a su nombre. No se edita ni se borra desde la app.
drop policy if exists chat_leer on public.chat_mensajes;
create policy chat_leer on public.chat_mensajes for select to authenticated using (true);

drop policy if exists chat_escribir on public.chat_mensajes;
create policy chat_escribir on public.chat_mensajes for insert to authenticated with check (user_id = auth.uid());

-- Mensajes en vivo
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_mensajes') then
    alter publication supabase_realtime add table public.chat_mensajes;
  end if;
end $$;
