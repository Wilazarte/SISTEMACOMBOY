-- =====================================================================
-- Chat grupal ÚNICO de la empresa (pedido de Williams, 2026-11-16).
-- Barra fija a la derecha en TODOS los módulos (Logística, Almacén, Finanzas, Producción, Ventas, Soporte,
-- Gerencia, Expedientes) y en Secocha. Un solo grupo para todos, tipo WhatsApp:
--   · texto, documentos y multimedia (bucket privado "chat-adjuntos", hasta 50 MB por archivo)
--   · mensajes fijados (cualquiera fija / desfija; se guarda quién y cuándo)
--   · avisos de videollamada (Jitsi Meet) con botón "Unirse"
--   · "sin leer" por usuario (tabla chat_leidos), igual en PC y celular
--
-- SOLO AGREGA: columnas nuevas a chat_mensajes, la tabla chat_leidos, la función chat_fijar, el bucket y
-- sus políticas. No borra mensajes. Reemplaza la política chat_leer (antes cada módulo veía solo su grupo,
-- 20261106_perfiles_asignacion.sql §8): ahora todos los usuarios con sesión ven el único chat.
-- Se puede correr más de una vez. Si nunca se corrió 20261104_chat_grupal.sql, este archivo crea la tabla.
-- =====================================================================

-- 1. Tabla de mensajes (la misma de 20261104) + columnas nuevas
create table if not exists public.chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  user_id uuid not null default auth.uid(),
  usuario text not null,
  nombre text,
  modulo text,
  texto text not null default ''
);

alter table public.chat_mensajes add column if not exists tipo text not null default 'texto';
alter table public.chat_mensajes add column if not exists adjunto_path text;
alter table public.chat_mensajes add column if not exists adjunto_nombre text;
alter table public.chat_mensajes add column if not exists adjunto_mime text;
alter table public.chat_mensajes add column if not exists adjunto_bytes bigint;
alter table public.chat_mensajes add column if not exists fijado boolean not null default false;
alter table public.chat_mensajes add column if not exists fijado_por text;
alter table public.chat_mensajes add column if not exists fijado_en timestamptz;
alter table public.chat_mensajes alter column texto set default '';

-- El texto ya puede ir vacío cuando el mensaje es solo un archivo.
alter table public.chat_mensajes drop constraint if exists chat_mensajes_texto_check;
alter table public.chat_mensajes drop constraint if exists chat_mensajes_contenido_chk;
alter table public.chat_mensajes add constraint chat_mensajes_contenido_chk check (
  char_length(texto) <= 2000
  and (char_length(btrim(texto)) > 0 or adjunto_path is not null)
);
alter table public.chat_mensajes drop constraint if exists chat_mensajes_tipo_chk;
alter table public.chat_mensajes add constraint chat_mensajes_tipo_chk check (tipo in ('texto', 'archivo', 'llamada'));

create index if not exists chat_mensajes_creado_idx on public.chat_mensajes (creado desc);
create index if not exists chat_mensajes_fijado_idx on public.chat_mensajes (fijado_en desc) where fijado;

alter table public.chat_mensajes enable row level security;

-- Leer: TODOS los usuarios con sesión (incluido Secocha). Escribir: solo a su nombre y sin fijar.
drop policy if exists chat_leer on public.chat_mensajes;
create policy chat_leer on public.chat_mensajes for select to authenticated using (true);

drop policy if exists chat_escribir on public.chat_mensajes;
create policy chat_escribir on public.chat_mensajes for insert to authenticated
  with check (user_id = auth.uid() and fijado = false);
-- Sin políticas de UPDATE ni DELETE: fijar va por la función chat_fijar (abajo).

-- 2. Fijar / desfijar un mensaje (cualquier usuario del chat). Solo toca las columnas de fijado.
create or replace function public.chat_fijar(p_id uuid, p_fijar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  quien text;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  select coalesce(nullif(p.nombre_completo, ''), p.nombre, p.email, auth.uid()::text) into quien
    from (select (to_jsonb(x) ->> 'nombre_completo') as nombre_completo, (to_jsonb(x) ->> 'nombre') as nombre, (to_jsonb(x) ->> 'email') as email
            from public.perfiles x where x.id = auth.uid()) p;
  update public.chat_mensajes
     set fijado = p_fijar,
         fijado_por = case when p_fijar then coalesce(quien, auth.uid()::text) end,
         fijado_en = case when p_fijar then now() end
   where id = p_id;
end $$;
revoke all on function public.chat_fijar(uuid, boolean) from public;
grant execute on function public.chat_fijar(uuid, boolean) to authenticated;

-- 3. Última lectura de cada usuario: el parpadeo de "sin leer" sale de aquí (mismo dato en PC y celular).
create table if not exists public.chat_leidos (
  user_id uuid primary key default auth.uid(),
  leido_hasta timestamptz not null default now()
);
alter table public.chat_leidos enable row level security;
drop policy if exists chat_leidos_propio on public.chat_leidos;
create policy chat_leidos_propio on public.chat_leidos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. Mensajes en vivo (INSERT y UPDATE de fijados)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_mensajes') then
    alter publication supabase_realtime add table public.chat_mensajes;
  end if;
end $$;

-- 5. Bucket privado de adjuntos (documentos, fotos, videos, audios). Se ven con enlaces firmados de 1 hora.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-adjuntos', 'chat-adjuntos', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists chat_adjuntos_leer on storage.objects;
create policy chat_adjuntos_leer on storage.objects for select to authenticated
  using (bucket_id = 'chat-adjuntos');

drop policy if exists chat_adjuntos_subir on storage.objects;
create policy chat_adjuntos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-adjuntos' and (storage.foldername(name))[1] = auth.uid()::text);
