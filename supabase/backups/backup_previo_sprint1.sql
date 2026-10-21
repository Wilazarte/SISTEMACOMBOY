-- =====================================================================
-- Backup previo al Sprint 1 de seguridad (ERP COMBOY VID)
-- Exporta con COPY las tablas críticas a CSV + el estado de policies,
-- grants, buckets y funciones, para poder comparar o volver atrás.
--
-- Cómo correrlo (desde la raíz del repo, con la cadena de conexión de
-- Supabase › Project Settings › Database › Connection string › URI):
--
--   psql "postgresql://postgres:<CLAVE>@db.wfhoczkoixmobxbwrfva.supabase.co:5432/postgres" \
--        -f supabase/backups/backup_previo_sprint1.sql
--
-- Usa \copy (lado cliente): los CSV quedan en supabase/backups/ de esta PC.
-- Los CSV tienen DNIs y sueldos: NO se suben a git (.gitignore).
-- No modifica nada en la base de datos.
-- =====================================================================

\echo 'Conteos antes del Sprint 1'
select 'planilla' tabla, count(*) from public.planilla
union all select 'planilla_historial', count(*) from public.planilla_historial
union all select 'planilla_historial_detalle', count(*) from public.planilla_historial_detalle
union all select 'ventas', count(*) from public.ventas
union all select 'almacen', count(*) from public.almacen
union all select 'compras', count(*) from public.compras
union all select 'perfiles', count(*) from public.perfiles
union all select 'adelantos', count(*) from public.adelantos;

-- Tablas críticas
\copy (select * from public.planilla) to 'supabase/backups/planilla.csv' with (format csv, header)
\copy (select * from public.planilla_historial) to 'supabase/backups/planilla_historial.csv' with (format csv, header)
\copy (select * from public.planilla_historial_detalle) to 'supabase/backups/planilla_historial_detalle.csv' with (format csv, header)
\copy (select * from public.ventas) to 'supabase/backups/ventas.csv' with (format csv, header)
\copy (select * from public.almacen) to 'supabase/backups/almacen.csv' with (format csv, header)
\copy (select * from public.compras) to 'supabase/backups/compras.csv' with (format csv, header)
\copy (select * from public.perfiles) to 'supabase/backups/perfiles.csv' with (format csv, header)
\copy (select * from public.adelantos) to 'supabase/backups/adelantos.csv' with (format csv, header)

-- Estado de seguridad (para comparar después de la migración)
\copy (select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname in ('public','storage') order by 1,2,3) to 'supabase/backups/policies_antes.csv' with (format csv, header)
\copy (select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated') order by 1,2,3) to 'supabase/backups/grants_antes.csv' with (format csv, header)
\copy (select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1) to 'supabase/backups/rls_antes.csv' with (format csv, header)
\copy (select id, public, file_size_limit, allowed_mime_types from storage.buckets order by 1) to 'supabase/backups/buckets_antes.csv' with (format csv, header)
\copy (select p.proname, pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' order by 1) to 'supabase/backups/funciones_antes.csv' with (format csv, header)

\echo 'Backup listo en supabase/backups/*.csv'
