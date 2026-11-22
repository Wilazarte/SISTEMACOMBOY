-- =====================================================================
-- Bucket privado "gastos-comprobantes": imagen / PDF de la factura escaneada con OCR
-- en Finanzas › Registrar gasto (botón "Escanear factura", components/compras/EscanearGasto.tsx).
-- Ruta: <AAAA-MM>/<id>.<ext>. El gasto guarda "sb:gastos-comprobantes/<ruta>" en data.archivos (tipo FACTURA).
-- Sin este SQL el escaneo funciona igual: la imagen se guarda en el bucket "tesoreria" como antes.
-- Suben los usuarios que pueden escribir (no solo lectura); ven los que ven Compras / Tesorería.
-- No se borran desde la app (sustento contable).
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gastos-comprobantes', 'gastos-comprobantes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gastos_comprobantes_subir on storage.objects;
create policy gastos_comprobantes_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gastos-comprobantes'
    and exists (select 1 from public.perfiles p where p.id = auth.uid() and not coalesce(p.solo_lectura, false))
  );

drop policy if exists gastos_comprobantes_ver on storage.objects;
create policy gastos_comprobantes_ver on storage.objects for select to authenticated
  using (
    bucket_id = 'gastos-comprobantes'
    and (public.puede_ver('/dashboard/compras') or public.mi_rol() in ('creador', 'soporte', 'tesoreria', 'finanzas', 'gerencia'))
  );
