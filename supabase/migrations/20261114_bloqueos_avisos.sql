-- =====================================================================
-- Fase 3: varios equipos a la vez (5 PCs + 3 celulares) sin pisarse.
--   1. locks: bloqueo por N° de serie / documento mientras alguien lo edita.
--      tomar_bloqueo() usa SELECT ... FOR UPDATE: dos equipos a la vez nunca
--      obtienen el mismo bloqueo. Caduca a los 10 min si el equipo se apaga.
--   2. Realtime de locks y conflictos (las pantallas se enteran al instante).
--   3. perfiles.telefono_whatsapp para los avisos de observaciones de Gerencia
--      (Edge Function notificar-observacion).
-- Requiere 20261112_offline_sync.sql. Se puede volver a correr.
-- =====================================================================

create table if not exists public.locks (
  serie_id text primary key,          -- N° de serie, OC-2026-0012, etc.
  tabla text not null default 'oc',   -- oc, kardex, equipo...
  locked_by text not null,            -- usuario (perfiles.usuario)
  locked_by_uid uuid not null default auth.uid(),
  etiqueta text,                      -- "Logística", "Almacén"... (lo que ven los demás)
  dispositivo text,
  locked_at timestamptz not null default now(),
  expira_en timestamptz not null default now() + interval '10 minutes'
);

alter table public.locks enable row level security;
revoke all on public.locks from anon;
grant select on public.locks to authenticated;
drop policy if exists locks_ver on public.locks;
create policy locks_ver on public.locks for select to authenticated using (true);
-- Escribir solo con las funciones de abajo (security definer)

create or replace function public.tomar_bloqueo(p_serie text, p_tabla text default 'oc', p_etiqueta text default null, p_dispositivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.locks;
  yo text;
begin
  if auth.uid() is null then raise exception 'Inicie sesión' using errcode = '42501'; end if;
  if coalesce((select solo_lectura from public.perfiles where id = auth.uid()), true) then
    raise exception 'Usuario de solo lectura: no puede editar' using errcode = '42501';
  end if;
  select usuario into yo from public.perfiles where id = auth.uid();

  insert into public.locks (serie_id, tabla, locked_by, locked_by_uid, etiqueta, dispositivo, locked_at, expira_en)
  values (p_serie, p_tabla, yo, auth.uid(), p_etiqueta, p_dispositivo, now(), now() + interval '10 minutes')
  on conflict (serie_id) do nothing;

  -- Fila bloqueada hasta el fin de la transacción: dos equipos no pueden tomarla a la vez
  select * into l from public.locks where serie_id = p_serie for update;

  if l.locked_by_uid <> auth.uid() and l.expira_en > now() then
    return jsonb_build_object('ok', false, 'locked_by', l.locked_by, 'etiqueta', l.etiqueta, 'locked_at', l.locked_at, 'dispositivo', l.dispositivo);
  end if;

  update public.locks
     set locked_by = yo, locked_by_uid = auth.uid(), etiqueta = p_etiqueta, dispositivo = p_dispositivo, tabla = p_tabla,
         locked_at = case when l.locked_by_uid = auth.uid() and l.expira_en > now() then l.locked_at else now() end,
         expira_en = now() + interval '10 minutes'
   where serie_id = p_serie
  returning * into l;
  return jsonb_build_object('ok', true, 'locked_by', l.locked_by, 'etiqueta', l.etiqueta, 'locked_at', l.locked_at);
end $$;

create or replace function public.soltar_bloqueo(p_serie text)
returns void language sql security definer set search_path = public as $$
  delete from public.locks
   where serie_id = p_serie
     and (locked_by_uid = auth.uid() or public.mi_rol() in ('creador', 'soporte'));
$$;

grant execute on function public.tomar_bloqueo(text, text, text, text) to authenticated;
grant execute on function public.soltar_bloqueo(text) to authenticated;

-- Realtime: bloqueos y conflictos (las demás tablas del ERP ya están publicadas)
do $$
begin
  begin alter publication supabase_realtime add table public.locks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.conflictos; exception when duplicate_object then null; when undefined_table then null; end;
end $$;

-- Avisos por WhatsApp (formato internacional sin "+", ej. 51987654321)
alter table public.perfiles add column if not exists telefono_whatsapp text;
