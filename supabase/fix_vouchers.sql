-- =====================================================================
-- Parche: bauchers de pago de las órdenes de compra (bucket privado
-- "tesoreria/vouchers" en Supabase Storage + permisos).
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- Requiere las funciones public.mi_rol() y public.puede_ver() de supabase_tables.sql.
-- (Ya incluido en supabase_tables.sql; este archivo evita volver a correr todo.)
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tesoreria', 'tesoreria', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tesoreria_vouchers_select on storage.objects;
drop policy if exists tesoreria_vouchers_insert on storage.objects;
drop policy if exists tesoreria_vouchers_delete on storage.objects;

create policy tesoreria_vouchers_select on storage.objects for select to authenticated
  using (bucket_id = 'tesoreria' and (public.puede_ver('/dashboard/compras') or public.puede_ver('/dashboard/almacen')));

create policy tesoreria_vouchers_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tesoreria' and name like 'vouchers/%' and public.mi_rol() in ('creador', 'tesoreria'));

create policy tesoreria_vouchers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tesoreria' and name like 'vouchers/%' and public.mi_rol() in ('creador', 'tesoreria'));

