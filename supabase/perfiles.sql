-- Perfiles - Creador control total
-- Correr en Supabase → SQL Editor DESPUÉS de: node --env-file=.env.local scripts/crear-usuarios.mjs
-- Se puede ejecutar varias veces.

delete from public.perfiles where rol = 'redes' or usuario ilike '%redes%';
-- Perfiles huérfanos (de usuarios ya borrados en Auth): chocarían con el índice único de "usuario"
delete from public.perfiles p where not exists (select 1 from auth.users u where u.id = p.id);

alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('creador','tesoreria','almacen','planilla','gerencia','admin','compras','editor')) not valid;

insert into public.perfiles (id, usuario, rol, nombre, modulos, solo_lectura)
select u.id, v.usuario, v.rol, v.nombre, v.modulos, v.solo_lectura from (values
  ('creador','creador','Creador (admin)',array['*'],false),
  ('tesoreria','tesoreria','Tesorería',array['/dashboard/compras','/dashboard/tesoreria','/dashboard/ventas'],false),
  ('almacen','almacen','Almacén',array['/dashboard/almacen'],false),
  ('planilla','planilla','Planilla',array['/dashboard/planilla'],false),
  ('gerencia','gerencia','Gerencia',array['*'],true)
) as v(usuario, rol, nombre, modulos, solo_lectura)
join auth.users u on lower(u.email) = v.usuario || '@comboyvid.local'
on conflict (id) do update set usuario=excluded.usuario, rol=excluded.rol, nombre=excluded.nombre, modulos=excluded.modulos, solo_lectura=excluded.solo_lectura;

-- RLS: el usuario logueado puede leer perfiles (el login lee su rol y módulos)
alter table public.perfiles enable row level security;
grant select on public.perfiles to authenticated;
drop policy if exists "allow_select" on public.perfiles;
create policy "allow_select" on public.perfiles for select to authenticated using (true);

-- Verificación: deben salir 5 filas
select u.email, u.email_confirmed_at is not null as confirmado, p.rol, p.modulos, p.solo_lectura
from auth.users u left join public.perfiles p on p.id = u.id
where u.email like '%comboyvid%' order by u.email;
