-- Prueba LOCAL (no correr en Supabase): crea en un Postgres vacío lo mínimo de Supabase (auth, perfiles, notificaciones, storage).
-- Uso: psql -d prueba -f gestion_documentaria_stub.sql -f ../migrations/20261204_gestion_documentaria.sql -f gestion_documentaria_test.sql
do $$ begin create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; exception when others then null; end $$;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated, service_role, anon; grant execute on function auth.uid() to authenticated, anon, service_role;
create table public.perfiles(id uuid primary key, usuario text, nombre text, rol text, activo boolean default true, modulos text[], es_admin boolean default false, nombre_completo text);
create table public.notificaciones(id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), modulo text, tipo text, titulo text, mensaje text, asignado_a uuid, href text, datos jsonb default '{}', leida boolean default false);
create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
create publication supabase_realtime;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, anon, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000000005');
insert into public.perfiles values
 ('00000000-0000-0000-0000-000000000001','almacen','Jose Ortiz','almacen',true,'{/almacen}'),
 ('00000000-0000-0000-0000-000000000002','gerencia','Gerencia General','gerencia',true,'{*}'),
 ('00000000-0000-0000-0000-000000000003','creador','Soporte','creador',true,'{*}'),
 ('00000000-0000-0000-0000-000000000004','ventas','Ventas','ventas',true,'{/ventas}'),
 ('00000000-0000-0000-0000-000000000005','tesoreria','Lizbeth Cahuana','tesoreria',true,'{/finanzas}');
