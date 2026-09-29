-- =====================================================================
-- ERP COMBOY VID — 5 usuarios (Auth) + perfiles. Pegar en Supabase → SQL Editor → Run.
-- Requiere haber ejecutado antes supabase_tables.sql (tablas y columnas de perfiles).
-- Se puede ejecutar varias veces: no duplica usuarios ni cambia contraseñas existentes.
-- ⚠ Contraseña inicial 123456 para los 5: cambiarla en Authentication → Users.
-- =====================================================================

-- 0) Quitar el perfil y el usuario "redes" (ERP con 5 perfiles)
delete from public.perfiles where rol = 'redes' or usuario in ('redes', 'redes@comboyvid.local');
delete from auth.users where email = 'redes@comboyvid.local';

-- 1) Regla de roles
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('creador', 'tesoreria', 'almacen', 'planilla', 'gerencia', 'admin', 'compras', 'editor')) not valid;

-- 2) Usuarios en auth.users (si no existen), correo confirmado y contraseña 123456 (bcrypt)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  v.email, extensions.crypt('123456', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
from (
  values ('creador@comboyvid.local'), ('tesoreria@comboyvid.local'), ('almacen@comboyvid.local'),
         ('planilla@comboyvid.local'), ('gerencia@comboyvid.local')
) as v (email)
where not exists (select 1 from auth.users u where lower(u.email) = v.email);

-- Identidad "email" de cada usuario (sin ella Supabase rechaza el login)
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       now(), now(), now()
from auth.users u
where u.email like '%@comboyvid.local'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- 3) Perfiles con el id real de auth.users
--    (se borran antes perfiles viejos con el mismo usuario pero otro id, que chocarían con el índice único)
delete from public.perfiles p
using auth.users u
where lower(u.email) = split_part(p.usuario, '@', 1) || '@comboyvid.local'
  and split_part(p.usuario, '@', 1) in ('creador', 'tesoreria', 'almacen', 'planilla', 'gerencia')
  and p.id <> u.id;

insert into public.perfiles (id, usuario, rol, nombre, modulos, solo_lectura)
select u.id, v.usuario, v.rol, v.nombre, v.modulos, v.solo_lectura
from (
  values
    ('creador',   'creador',   'Creador (admin)', array['*'],                                          false),
    ('tesoreria', 'tesoreria', 'Tesorería',       array['/dashboard/compras', '/dashboard/tesoreria'], false),
    ('almacen',   'almacen',   'Almacén',         array['/dashboard/almacen'],                         false),
    ('planilla',  'planilla',  'Planilla',        array['/dashboard/planilla'],                        false),
    ('gerencia',  'gerencia',  'Gerencia',        array['*'],                                          true)
) as v (usuario, rol, nombre, modulos, solo_lectura)
join auth.users u on lower(u.email) = v.usuario || '@comboyvid.local'
on conflict (id) do update
  set usuario = excluded.usuario,
      rol = excluded.rol,
      nombre = excluded.nombre,
      modulos = excluded.modulos,
      solo_lectura = excluded.solo_lectura;

-- 4) Verificación: 5 filas, con email_confirmado = true, tiene_identidad = true y perfil completo
select u.email,
       u.email_confirmed_at is not null as email_confirmado,
       exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email') as tiene_identidad,
       p.rol, p.nombre, p.modulos, p.solo_lectura
from auth.users u
left join public.perfiles p on p.id = u.id
where u.email like '%comboyvid%'
order by u.email;
