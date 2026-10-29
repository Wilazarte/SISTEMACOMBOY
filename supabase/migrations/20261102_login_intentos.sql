-- =====================================================================
-- Bloqueo por intentos fallidos en el login (ERP y Secocha).
-- 5 contraseñas incorrectas seguidas -> usuario bloqueado 15 minutos.
-- Solo AGREGA una tabla y 3 funciones: no toca datos existentes.
-- Se puede correr varias veces.
-- =====================================================================

create table if not exists public.login_intentos (
  usuario text primary key,               -- correo en minúsculas (tesoreria@comboyvid.local)
  fallos int not null default 0,
  bloqueado_hasta timestamptz,
  ultimo_intento timestamptz not null default now()
);

-- Nadie la lee ni la escribe directo: solo las funciones de abajo
alter table public.login_intentos enable row level security;
revoke all on public.login_intentos from anon, authenticated;

-- Segundos que le faltan al bloqueo (0 = puede intentar)
create or replace function public.login_bloqueo(p_usuario text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select greatest(0, ceil(extract(epoch from (bloqueado_hasta - now()))))::int
                   from public.login_intentos where usuario = lower(trim(p_usuario))), 0)
$$;

-- Registra una contraseña incorrecta; devuelve los segundos de bloqueo (0 si aún no se bloquea)
create or replace function public.login_fallido(p_usuario text) returns int
language plpgsql security definer set search_path = public as $$
declare
  u text := lower(trim(p_usuario));
  r public.login_intentos;
begin
  if u = '' or length(u) > 200 then return 0; end if;
  insert into public.login_intentos as li (usuario, fallos, ultimo_intento)
  values (u, 1, now())
  on conflict (usuario) do update set
    -- Tras 30 min sin fallos se vuelve a contar desde cero
    fallos = case when li.ultimo_intento < now() - interval '30 minutes' or li.bloqueado_hasta < now() then 1 else li.fallos + 1 end,
    bloqueado_hasta = case when li.bloqueado_hasta < now() then null else li.bloqueado_hasta end,
    ultimo_intento = now()
  returning * into r;
  if r.fallos >= 5 then
    update public.login_intentos set bloqueado_hasta = now() + interval '15 minutes', fallos = 0 where usuario = u;
    return 900;
  end if;
  return 0;
end $$;

-- Login correcto: borra el contador del propio usuario (solo el suyo)
create or replace function public.login_exitoso() returns void
language sql security definer set search_path = public as $$
  delete from public.login_intentos where usuario = lower(auth.jwt() ->> 'email')
$$;

revoke execute on function public.login_bloqueo(text), public.login_fallido(text), public.login_exitoso() from public;
grant execute on function public.login_bloqueo(text), public.login_fallido(text) to anon, authenticated;
grant execute on function public.login_exitoso() to authenticated;

-- Desbloquear a mano (administrador, SQL Editor):
-- delete from public.login_intentos where usuario = 'tesoreria@comboyvid.local';
