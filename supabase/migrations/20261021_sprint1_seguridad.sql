-- =====================================================================
-- SPRINT 1 · SEGURIDAD · ERP COMBOY VID
-- Base: docs/AUDITORIA-COMPLETA-COMBOY-VID.md (problemas #1 a #6).
-- Estado de partida leído de pg_policies / role_table_grants / storage el 2026-10-21.
--
-- NO se borra ninguna tabla ni dato: solo funciones, policies, grants y buckets.
-- Antes de aplicar: correr supabase/backups/backup_previo_sprint1.sql.
-- Para volver atrás: supabase/backups/rollback_sprint1.sql.
-- Pruebas: docs/PRUEBA-SPRINT1.md.
--
-- Roles reales en perfiles: creador, gerencia, tesoreria, almacen, planilla.
-- Las policies de reemplazo siguen lo que hace hoy el código (lib/storage.ts DESTINOS,
-- lib/ventas.ts, lib/adelantos.ts) y los roles que ya exige siguiente_numero().
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- TAREA 1 · mi_rol() desde perfiles, sin 'creador' por defecto
-- (ya aplicada el 2026-10-21 con supabase/mi_rol_seguro.sql; se repite para dejarla versionada)
-- ---------------------------------------------------------------------
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select rol from public.perfiles where id = auth.uid() limit 1), 'sin_rol');
$$;

-- EXECUTE viene de PUBLIC por defecto: revocar solo a anon no alcanza.
revoke execute on function public.mi_rol() from public, anon;
grant execute on function public.mi_rol() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- TAREA 2 · Borrar policies "permitir todo" (using/check = true)
-- ---------------------------------------------------------------------
drop policy if exists "permitir todo select" on public.planilla;
drop policy if exists "permitir todo insert" on public.planilla;
drop policy if exists "permitir todo update" on public.planilla;
drop policy if exists "planilla_leer" on public.planilla;            -- authenticated using true: cualquier usuario leía la planilla
drop policy if exists "permitir todo" on public.planilla_historial;
drop policy if exists "permitir todo" on public.planilla_historial_detalle;
drop policy if exists "permitir todo" on public.ventas;
drop policy if exists "Allow all" on public.almacen;
drop policy if exists "Allow all" on public.movimientos_almacen;
drop policy if exists "gastos por empresa" on public.gastos;
drop policy if exists "permitir todo" on public.condiciones_pago;
drop policy if exists "permitir todo select" on public.asistencia_creador;
drop policy if exists "permitir todo insert" on public.asistencia_creador;
drop policy if exists "permitir todo update" on public.asistencia_creador;
drop policy if exists "permitir todo delete" on public.asistencia_creador;
drop policy if exists "cajas_select" on public.cajas;               -- authenticated using true

-- Quedan vivas (no se tocan): planilla_select, planilla_escribir, planilla_historial_select,
-- planilla_historial_detalle_select, almacen_select, almacen_escribir, compras_*, contable_*,
-- cajas_escribir, observaciones_*, user_preferences_*.
-- planilla_historial(_detalle) solo se escriben con cerrar_planilla() (security definer).

-- Reemplazos para tablas que se quedarían SIN ninguna policy (si no, el ERP se rompe):

-- ventas: hoy solo tenía "permitir todo". Lectura: Ventas y Contable (asientos de venta)
-- más los roles del dashboard. Escritura: los roles que siguiente_numero() deja emitir NP/F001/B001/OD.
create policy ventas_select on public.ventas for select to authenticated
  using (public.puede_ver('/dashboard/ventas') or public.puede_ver('/dashboard/contable')
         or public.mi_rol() in ('creador', 'gerencia', 'tesoreria'));
create policy ventas_escribir on public.ventas for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria'))
  with check (public.mi_rol() in ('creador', 'tesoreria'));

-- condiciones_pago: catálogo que lee Ventas; lo edita Configuración de Ventas.
create policy condiciones_pago_select on public.condiciones_pago for select to authenticated
  using (public.mi_rol() <> 'sin_rol');
create policy condiciones_pago_escribir on public.condiciones_pago for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria'))
  with check (public.mi_rol() in ('creador', 'tesoreria'));

-- cajas: el selector de caja lo usan varios módulos; se exige un perfil válido.
create policy cajas_select on public.cajas for select to authenticated
  using (public.mi_rol() <> 'sin_rol');

-- movimientos_almacen (0 filas, el código usa almacen tipo MOVIMIENTO_ALMACEN): mismos roles que almacen.
create policy movimientos_almacen_select on public.movimientos_almacen for select to authenticated
  using (public.puede_ver('/dashboard/almacen') or public.puede_ver('/dashboard/compras'));
create policy movimientos_almacen_escribir on public.movimientos_almacen for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria', 'almacen'))
  with check (public.mi_rol() in ('creador', 'tesoreria', 'almacen'));

-- gastos (0 filas, el código guarda gastos en compras): Tesorería.
create policy gastos_tesoreria on public.gastos for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria'))
  with check (public.mi_rol() in ('creador', 'tesoreria'));

-- asistencia_creador: se escribe con editar_asistencia_creador() (security definer).
create policy asistencia_creador_select on public.asistencia_creador for select to authenticated
  using (public.mi_rol() in ('creador', 'gerencia'));
create policy asistencia_creador_escribir on public.asistencia_creador for all to authenticated
  using (public.mi_rol() = 'creador')
  with check (public.mi_rol() = 'creador');

-- ---------------------------------------------------------------------
-- TAREA 3 · Cerrar anon
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;      -- incluye las vistas v_kardex y v_equipos_terminados
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on schema public from anon;
-- Que las tablas nuevas no vuelvan a nacer abiertas a anon
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

grant usage on schema public to authenticated;
-- service_role no se toca.

-- ---------------------------------------------------------------------
-- TAREA 4 · perfiles: cortar la escalada de privilegios
-- ---------------------------------------------------------------------
drop policy if exists "perfiles_all_auth" on public.perfiles;
drop policy if exists "perfiles_select_all" on public.perfiles;
drop policy if exists "perfiles_select" on public.perfiles;   -- reemplazada por perfiles_select_own

-- mi_rol() es security definer: leer perfiles dentro de la policy no entra en bucle.
create policy perfiles_select_own on public.perfiles for select to authenticated
  using (id = auth.uid() or public.mi_rol() in ('creador', 'gerencia'));
create policy perfiles_update_creador on public.perfiles for update to authenticated
  using (public.mi_rol() = 'creador')
  with check (public.mi_rol() = 'creador');
create policy perfiles_insert_creador on public.perfiles for insert to authenticated
  with check (public.mi_rol() = 'creador');
-- Sin policy de DELETE: nadie borra perfiles desde la app.

-- ---------------------------------------------------------------------
-- TAREA 5 · RLS en tablas que no lo tenían
-- ---------------------------------------------------------------------
alter table public.adelantos enable row level security;
alter table public.contadores enable row level security;
alter table public.manual_ediciones_asistencia enable row level security;

drop policy if exists "adelantos todo" on public.adelantos;
-- 'planilla' se agrega a lo pedido: ese rol registra y descuenta adelantos
-- (/dashboard/planilla/adelantos y lib/adelantos.ts). Sin él, Planilla deja de funcionar.
create policy adelantos_acceso on public.adelantos for all to authenticated
  using (public.mi_rol() in ('creador', 'gerencia', 'tesoreria', 'planilla'))
  with check (public.mi_rol() in ('creador', 'gerencia', 'tesoreria', 'planilla'));

-- contadores y manual_ediciones_asistencia: el código no los lee directo; los usan
-- siguiente_numero() y editar_asistencia_creador() (security definer, no dependen de RLS).
create policy contadores_acceso on public.contadores for all to authenticated
  using (public.mi_rol() in ('creador', 'gerencia', 'tesoreria'))
  with check (public.mi_rol() in ('creador', 'gerencia', 'tesoreria'));
create policy manual_ediciones_asistencia_acceso on public.manual_ediciones_asistencia for all to authenticated
  using (public.mi_rol() in ('creador', 'gerencia', 'tesoreria'))
  with check (public.mi_rol() in ('creador', 'gerencia', 'tesoreria'));

-- ---------------------------------------------------------------------
-- TAREA 6 · Buckets privados con límites
-- El código solo usa el bucket 'tesoreria' con createSignedUrl (lib/storage.ts:977-1010),
-- que funciona con bucket privado. 'vouchers' y 'bauchers' están vacíos.
-- ---------------------------------------------------------------------
update storage.buckets
   set public = false,
       file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']
 where id in ('tesoreria', 'vouchers', 'bauchers');

drop policy if exists "Permitir actualizar bauchers" on storage.objects;
drop policy if exists "Permitir actualizar vouchers" on storage.objects;
drop policy if exists "Permitir eliminar bauchers" on storage.objects;
drop policy if exists "Permitir eliminar vouchers" on storage.objects;
drop policy if exists "Permitir lectura publica bauchers" on storage.objects;
drop policy if exists "Permitir lectura publica vouchers" on storage.objects;
drop policy if exists "Permitir subir bauchers" on storage.objects;
drop policy if exists "Permitir subir vouchers" on storage.objects;
drop policy if exists "delete tesoreria" on storage.objects;
drop policy if exists "permitir todo en bauchers" on storage.objects;
drop policy if exists "permitir todo en tesoreria" on storage.objects;
drop policy if exists "public read tesoreria" on storage.objects;
drop policy if exists "update tesoreria" on storage.objects;
drop policy if exists "upload tesoreria" on storage.objects;

create policy bauchers_leer on storage.objects for select to authenticated
  using (bucket_id in ('tesoreria', 'vouchers', 'bauchers') and public.mi_rol() in ('creador', 'gerencia', 'tesoreria'));
create policy bauchers_subir on storage.objects for insert to authenticated
  with check (bucket_id in ('tesoreria', 'vouchers', 'bauchers') and public.mi_rol() in ('creador', 'tesoreria'));
create policy bauchers_actualizar on storage.objects for update to authenticated
  using (bucket_id in ('tesoreria', 'vouchers', 'bauchers') and public.mi_rol() in ('creador', 'tesoreria'))
  with check (bucket_id in ('tesoreria', 'vouchers', 'bauchers') and public.mi_rol() in ('creador', 'tesoreria'));
create policy bauchers_borrar on storage.objects for delete to authenticated
  using (bucket_id in ('tesoreria', 'vouchers', 'bauchers') and public.mi_rol() in ('creador', 'tesoreria'));

commit;

-- =====================================================================
-- VERIFICACIÓN (correr después de aplicar)
-- =====================================================================
-- 1) Policies de las tablas clave
--    select tablename, policyname, roles, cmd, qual, with_check from pg_policies
--     where tablename in ('planilla','ventas','almacen','perfiles') order by 1,2;
-- 2) anon sin privilegios -> 0 filas
--    select grantee, table_name, privilege_type from information_schema.role_table_grants
--     where grantee = 'anon' and table_schema = 'public';
-- 3) Ninguna policy abierta (using/check true) para public -> 0 filas
--    select tablename, policyname from pg_policies
--     where schemaname in ('public','storage') and 'public' = any(roles)
--       and coalesce(qual,'true') = 'true' and coalesce(with_check,'true') = 'true';
-- 4) RLS activo en todas las tablas -> 0 filas
--    select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- 5) Buckets privados
--    select id, public, file_size_limit, allowed_mime_types from storage.buckets;
-- 6) Datos intactos -> planilla 84, planilla_historial 7, planilla_historial_detalle 25
--    select (select count(*) from planilla), (select count(*) from planilla_historial), (select count(*) from planilla_historial_detalle);
