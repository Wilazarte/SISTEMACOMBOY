-- =====================================================================
-- PERFILES ERP - ASIGNACIÓN DEFINITIVA (pedido de Williams, 2026-10-30)
-- 5 perfiles: Adm (SOPORTE), Lizbeth (FINANZAS), Jose (ALMACEN), Williams (LOGISTICA), Manuel (PRODUCCION).
--
-- SOLO AGREGA. No borra usuarios ni perfiles (no hay "DELETE FROM usuarios"): se usa la tabla perfiles,
-- ya enlazada con Supabase Auth, y las contraseñas las guarda Supabase Auth (no hay password_hash propio).
-- "usuarios" queda como vista de perfiles con las columnas del pedido.
-- Se puede correr más de una vez. Correr DESPUÉS de crear los usuarios de Auth que falten:
--   CLAVE_INICIAL='una-clave-larga' node --env-file=.env.local scripts/crear-usuarios.mjs
-- (crea logistica@comboyvid.local y produccion@comboyvid.local si no existen).
-- =====================================================================

-- 1. Columnas nuevas de perfiles
alter table public.perfiles
  add column if not exists nombre_completo text,
  add column if not exists cargo text,
  add column if not exists email text,
  add column if not exists avatar_iniciales text,
  add column if not exists modulo_asignado text,
  add column if not exists es_admin boolean not null default false,
  add column if not exists activo boolean not null default true;

-- 2. Roles: se agregan soporte, logistica, finanzas y produccion (los anteriores siguen válidos)
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('creador', 'tesoreria', 'almacen', 'planilla', 'gerencia', 'admin', 'compras', 'editor', 'sucursal',
                 'soporte', 'logistica', 'finanzas', 'produccion')) not valid;

-- 3. Asignación de los 5 perfiles. Los usuarios que ya tienen perfil conservan su rol y sus módulos
--    (Adm = creador, Lizbeth = tesoreria, Jose = almacen); a los nuevos se les crea con su rol y módulos.
with asignacion (email, usuario, rol, nombre_completo, modulo_asignado, avatar_iniciales, es_admin, modulos) as (
  values
    ('creador@comboyvid.local',    'creador',    'creador',    'Adm',                     'TODOS',      'AD', true,  array['*']),
    ('tesoreria@comboyvid.local',  'tesoreria',  'tesoreria',  'Lizbeth Cahuana Apfata',  'FINANZAS',   'LC', false, array['/finanzas', '/dashboard/compras', '/dashboard/planilla', '/dashboard/contable']),
    ('almacen@comboyvid.local',    'almacen',    'almacen',    'Jose Ortiz Arapa',        'ALMACEN',    'JO', false, array['/almacen', '/dashboard/almacen']),
    ('logistica@comboyvid.local',  'logistica',  'logistica',  'Williams Lazarte Colque', 'LOGISTICA',  'WL', false, array['/logistica', '/dashboard/compras', '/dashboard/ventas', '/dashboard/almacen']),
    ('produccion@comboyvid.local', 'produccion', 'produccion', 'Manuel Cornejo Apaza',    'PRODUCCION', 'MC', false, array['/produccion', '/dashboard/produccion', '/dashboard/almacen'])
)
insert into public.perfiles as p (id, usuario, rol, nombre, modulos, solo_lectura, nombre_completo, email, modulo_asignado, avatar_iniciales, es_admin, activo)
select u.id, a.usuario, a.rol, a.nombre_completo, a.modulos, false, a.nombre_completo, a.email, a.modulo_asignado, a.avatar_iniciales, a.es_admin, true
from asignacion a
join auth.users u on lower(u.email) = a.email
on conflict (id) do update set
  nombre_completo  = excluded.nombre_completo,
  email            = excluded.email,
  modulo_asignado  = excluded.modulo_asignado,
  avatar_iniciales = excluded.avatar_iniciales,
  es_admin         = excluded.es_admin,
  activo           = true;

-- Correo de los demás perfiles (para la vista usuarios y el login por correo)
update public.perfiles p set email = lower(u.email) from auth.users u where u.id = p.id and p.email is null;

-- 4. Vista usuarios (las columnas del pedido; sin contraseñas: esas las guarda Supabase Auth)
create or replace view public.usuarios with (security_invoker = true) as
select id,
       coalesce(nombre_completo, nombre) as nombre_completo,
       case when es_admin then 'SOPORTE' else modulo_asignado end as perfil,
       email,
       avatar_iniciales,
       modulo_asignado,
       es_admin,
       activo,
       created_at
from public.perfiles;
grant select on public.usuarios to authenticated;

-- 5. SOPORTE edita usuarios (nombre, módulo, activo…). Los demás solo leen perfiles, como antes.
grant update on public.perfiles to authenticated;
drop policy if exists perfiles_soporte_editar on public.perfiles;
create policy perfiles_soporte_editar on public.perfiles for update to authenticated
  using (public.mi_rol() in ('creador', 'soporte'))
  with check (public.mi_rol() in ('creador', 'soporte'));

-- 6. Login con nombre completo, usuario o correo: devuelve el correo de Auth (o null). No revela nada más.
create or replace function public.email_de_login(p_texto text) returns text
language sql stable security definer set search_path = public as $$
  with t as (select translate(lower(trim(p_texto)), 'áéíóúüñ', 'aeiouun') as v)
  select lower(u.email)
  from public.perfiles p
  join auth.users u on u.id = p.id, t
  where p.activo is distinct from false
    and t.v <> ''
    and (lower(p.usuario) = t.v
         or lower(u.email) = t.v
         or translate(lower(coalesce(p.nombre_completo, '')), 'áéíóúüñ', 'aeiouun') = t.v)
  limit 1
$$;
revoke execute on function public.email_de_login(text) from public;
grant execute on function public.email_de_login(text) to anon, authenticated;

-- 7. Escritura de los perfiles nuevos (políticas ADICIONALES: las existentes no cambian)
-- LOGISTICA es dueño de Ventas
drop policy if exists ventas_escribir_logistica on public.ventas;
create policy ventas_escribir_logistica on public.ventas for all to authenticated
  using (public.mi_rol() = 'logistica') with check (public.mi_rol() = 'logistica');
-- PRODUCCION: órdenes de producción, QC (dentro de la OT), vales de MP, equipos terminados y su kárdex
drop policy if exists almacen_escribir_produccion on public.almacen;
create policy almacen_escribir_produccion on public.almacen for all to authenticated
  using (public.mi_rol() = 'produccion' and tipo in ('ORDEN_PRODUCCION', 'VALE_PRODUCCION', 'EQUIPO_TERMINADO', 'MOVIMIENTO_ALMACEN', 'KARDEX'))
  with check (public.mi_rol() = 'produccion' and tipo in ('ORDEN_PRODUCCION', 'VALE_PRODUCCION', 'EQUIPO_TERMINADO', 'MOVIMIENTO_ALMACEN', 'KARDEX'));

-- 8. Chat por módulo: cada modulador lee solo el grupo de su módulo; SOPORTE y GERENCIA leen todos.
create or replace function public.mi_sala_chat() returns text
language sql stable security definer set search_path = public as $$
  select case
    when rol = 'logistica' or upper(modulo_asignado) = 'LOGISTICA' then 'Logística'
    when rol = 'almacen' or upper(modulo_asignado) = 'ALMACEN' then 'Almacén'
    when rol in ('tesoreria', 'planilla', 'finanzas') or upper(modulo_asignado) = 'FINANZAS' then 'Finanzas'
    when rol = 'produccion' or upper(modulo_asignado) = 'PRODUCCION' then 'Producción'
  end
  from public.perfiles where id = auth.uid()
$$;
grant execute on function public.mi_sala_chat() to authenticated;

do $$
begin
  -- Solo si ya se corrió 20261104_chat_grupal.sql
  if to_regclass('public.chat_mensajes') is not null then
    execute 'drop policy if exists chat_leer on public.chat_mensajes';
    execute $p$create policy chat_leer on public.chat_mensajes for select to authenticated
      using (public.mi_rol() in ('creador', 'soporte', 'gerencia') or modulo is null or modulo = public.mi_sala_chat())$p$;
  end if;
end $$;

-- Revisar:
-- select * from public.usuarios order by es_admin desc, modulo_asignado;
