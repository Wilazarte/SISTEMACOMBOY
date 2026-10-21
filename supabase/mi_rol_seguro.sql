-- Sprint 1 · Seguridad (docs/AUDITORIA-COMPLETA-COMBOY-VID.md, problema #1)
-- mi_rol() lee el rol desde perfiles con auth.uid(); sin sesión o sin perfil devuelve 'sin_rol'.
-- Antes: select coalesce(auth.jwt()->>'rol','creador')  -> todos pasaban como creador en la BD.
-- Aplicado en Supabase el 2026-10-21.
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rol from public.perfiles where id = auth.uid() limit 1),
    'sin_rol'
  );
$$;

-- Volver atrás (no recomendado):
-- create or replace function public.mi_rol() returns text language sql stable as $$
--   select coalesce(auth.jwt()->>'rol','creador')
-- $$;
