-- =====================================================================
-- ROLLBACK del Sprint 1 de seguridad: deja policies, grants y buckets
-- como estaban el 2026-10-21 (leído de pg_policies antes del cambio).
-- Solo usar si el ERP deja de funcionar y no hay un arreglo puntual.
-- mi_rol() NO se revierte (la versión vieja daba 'creador' a todos).
-- =====================================================================
begin;

-- Policies nuevas del Sprint 1
drop policy if exists ventas_select on public.ventas;
drop policy if exists ventas_escribir on public.ventas;
drop policy if exists condiciones_pago_select on public.condiciones_pago;
drop policy if exists condiciones_pago_escribir on public.condiciones_pago;
drop policy if exists cajas_select on public.cajas;
drop policy if exists movimientos_almacen_select on public.movimientos_almacen;
drop policy if exists movimientos_almacen_escribir on public.movimientos_almacen;
drop policy if exists gastos_tesoreria on public.gastos;
drop policy if exists asistencia_creador_select on public.asistencia_creador;
drop policy if exists asistencia_creador_escribir on public.asistencia_creador;
drop policy if exists perfiles_select_own on public.perfiles;
drop policy if exists perfiles_update_creador on public.perfiles;
drop policy if exists perfiles_insert_creador on public.perfiles;
drop policy if exists adelantos_acceso on public.adelantos;
drop policy if exists contadores_acceso on public.contadores;
drop policy if exists manual_ediciones_asistencia_acceso on public.manual_ediciones_asistencia;
drop policy if exists bauchers_leer on storage.objects;
drop policy if exists bauchers_subir on storage.objects;
drop policy if exists bauchers_actualizar on storage.objects;
drop policy if exists bauchers_borrar on storage.objects;

-- Policies originales
create policy "permitir todo select" on public.planilla for select using (true);
create policy "permitir todo insert" on public.planilla for insert with check (true);
create policy "permitir todo update" on public.planilla for update using (true) with check (true);
create policy "planilla_leer" on public.planilla for select to authenticated using (true);
create policy "permitir todo" on public.planilla_historial for all using (true) with check (true);
create policy "permitir todo" on public.planilla_historial_detalle for all using (true) with check (true);
create policy "permitir todo" on public.ventas for all using (true) with check (true);
create policy "Allow all" on public.almacen for all using (true) with check (true);
create policy "Allow all" on public.movimientos_almacen for all using (true) with check (true);
create policy "gastos por empresa" on public.gastos for all using (true) with check (true);
create policy "permitir todo" on public.condiciones_pago for all using (true) with check (true);
create policy "permitir todo select" on public.asistencia_creador for select using (true);
create policy "permitir todo insert" on public.asistencia_creador for insert with check (true);
create policy "permitir todo update" on public.asistencia_creador for update using (true) with check (true);
create policy "permitir todo delete" on public.asistencia_creador for delete using (true);
create policy "cajas_select" on public.cajas for select to authenticated using (true);
create policy "perfiles_all_auth" on public.perfiles for all using (true) with check (true);
create policy "perfiles_select_all" on public.perfiles for select using (true);
create policy "perfiles_select" on public.perfiles for select to authenticated using (id = auth.uid());
create policy "adelantos todo" on public.adelantos for all using (true) with check (true);

alter table public.adelantos disable row level security;
alter table public.contadores disable row level security;
alter table public.manual_ediciones_asistencia disable row level security;

-- Grants de anon (los que tenía)
grant usage on schema public to anon;
grant all on public.adelantos, public.asistencia_creador, public.condiciones_pago, public.contadores,
  public.gastos, public.manual_ediciones_asistencia, public.movimientos_almacen, public.planilla,
  public.v_equipos_terminados, public.v_kardex, public.ventas to anon;
grant execute on function public.mi_rol() to public;

-- Buckets y storage
update storage.buckets set public = true, file_size_limit = null, allowed_mime_types = null
 where id in ('tesoreria', 'vouchers', 'bauchers');
create policy "permitir todo en tesoreria" on storage.objects for all using (bucket_id = 'tesoreria') with check (bucket_id = 'tesoreria');
create policy "permitir todo en bauchers" on storage.objects for all using (bucket_id = 'bauchers') with check (bucket_id = 'bauchers');
create policy "Permitir lectura publica vouchers" on storage.objects for select using (bucket_id = 'vouchers');
create policy "Permitir subir vouchers" on storage.objects for insert with check (bucket_id = 'vouchers');
create policy "Permitir actualizar vouchers" on storage.objects for update using (bucket_id = 'vouchers');
create policy "Permitir eliminar vouchers" on storage.objects for delete using (bucket_id = 'vouchers');

commit;
