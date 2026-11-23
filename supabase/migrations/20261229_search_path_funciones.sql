-- =====================================================================
-- Security Advisor: "Function Search Path Mutable" (2026-11-23)
-- Fija search_path = public, extensions en TODAS las funciones del esquema public que no lo tienen.
-- No cambia lo que hacen las funciones: solo dónde buscan tablas y funciones (public primero,
-- luego extensions; pg_catalog siempre va incluido). No toca funciones de extensiones (pg_trgm).
-- Una transacción: si algo falla no se aplica nada. Para deshacer: 20261229_search_path_funciones_rollback.sql
-- =====================================================================
begin;

-- Lista de las que se van a cambiar (para el rollback queda en esta tabla, solo lectura para postgres)
create table if not exists public.zz_search_path_cambiadas (firma text primary key, fecha timestamptz default now());
alter table public.zz_search_path_cambiadas enable row level security;
revoke all on public.zz_search_path_cambiadas from anon, authenticated;

do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure::text as firma
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter routine %s set search_path = public, extensions', r.firma);
    insert into public.zz_search_path_cambiadas (firma) values (r.firma) on conflict do nothing;
    n := n + 1;
  end loop;
  raise notice 'Funciones con search_path fijado: %', n;
end $$;

commit;

-- Verificación: debe salir 0
select count(*) as funciones_sin_search_path
from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public' and p.prokind in ('f', 'p')
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
