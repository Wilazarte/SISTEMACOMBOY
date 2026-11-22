-- =====================================================================
-- Temas de color del ERP (Williams 2026-11-22)
-- Guarda qué tema usa todo el ERP, cada módulo y cada usuario, para que la elección
-- siga a la persona en cualquier PC. Sin este SQL los temas igual funcionan, pero
-- se guardan solo en el navegador de cada equipo (localStorage).
--
--   ambito   | clave                         | ejemplo
--   ---------+-------------------------------+---------------------------------
--   global   | ''                            | todo el ERP en "claro"
--   modulo   | ventas, almacen, secocha…     | Ventas en "oscuro"
--   usuario  | perfiles.usuario (minúsculas) | jose@comboyvid.com en "rosas"
--
-- Prioridad (la aplica el navegador, lib/temas.ts): módulo > usuario > global > COMBOY VID.
-- Temas válidos: comboy, oscuro, claro, rosas, cielo, menta.
--
-- Quién puede cambiar qué:
--   * Cada usuario: su propio tema.
--   * SOPORTE (rol creador o soporte): el global, el de cada módulo y el de cualquier usuario.
-- Todos los usuarios con sesión pueden LEER la tabla (la necesitan para pintar su pantalla).
-- Se puede ejecutar varias veces.
-- =====================================================================

create table if not exists public.preferencias_tema (
  ambito text not null check (ambito in ('global', 'modulo', 'usuario')),
  clave text not null default '',
  tema text not null check (tema in ('comboy', 'oscuro', 'claro', 'rosas', 'cielo', 'menta')),
  actualizado_por uuid default auth.uid(),
  actualizado_en timestamptz not null default now(),
  primary key (ambito, clave),
  constraint preferencias_tema_global_sin_clave check (ambito <> 'global' or clave = '')
);

comment on table public.preferencias_tema is 'Temas de color del ERP: global, por módulo y por usuario (prioridad módulo > usuario > global).';

alter table public.preferencias_tema enable row level security;

grant select, insert, update, delete on public.preferencias_tema to authenticated;
revoke all on public.preferencias_tema from anon;

-- ¿El usuario actual es SOPORTE? (mismos roles que esSoporteReal en lib/permisosPlanta.ts)
create or replace function public.es_soporte_tema()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('creador', 'soporte') from public.perfiles where id = auth.uid() limit 1), false);
$$;

-- ¿La fila es el tema del propio usuario?
create or replace function public.es_mi_tema(p_ambito text, p_clave text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_ambito = 'usuario'
     and p_clave = coalesce((select lower(usuario) from public.perfiles where id = auth.uid() limit 1), '#');
$$;

drop policy if exists "preferencias_tema_leer" on public.preferencias_tema;
create policy "preferencias_tema_leer" on public.preferencias_tema
  for select to authenticated using (true);

drop policy if exists "preferencias_tema_crear" on public.preferencias_tema;
create policy "preferencias_tema_crear" on public.preferencias_tema
  for insert to authenticated with check (public.es_soporte_tema() or public.es_mi_tema(ambito, clave));

drop policy if exists "preferencias_tema_cambiar" on public.preferencias_tema;
create policy "preferencias_tema_cambiar" on public.preferencias_tema
  for update to authenticated
  using (public.es_soporte_tema() or public.es_mi_tema(ambito, clave))
  with check (public.es_soporte_tema() or public.es_mi_tema(ambito, clave));

drop policy if exists "preferencias_tema_quitar" on public.preferencias_tema;
create policy "preferencias_tema_quitar" on public.preferencias_tema
  for delete to authenticated using (public.es_soporte_tema() or public.es_mi_tema(ambito, clave));

-- Quien cambió y cuándo (no se confía en lo que manda el navegador)
create or replace function public.preferencias_tema_sello()
returns trigger language plpgsql as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists preferencias_tema_sello on public.preferencias_tema;
create trigger preferencias_tema_sello before insert or update on public.preferencias_tema
  for each row execute function public.preferencias_tema_sello();

-- Prueba rápida (opcional): select * from public.preferencias_tema;
