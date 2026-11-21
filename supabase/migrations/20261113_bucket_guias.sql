-- =====================================================================
-- Fotos de guías de remisión tomadas con la app Android (Fase 2).
-- Bucket privado "guias": <ocId>/<fecha>.jpg. Lo usa lib/movil/fotosGuia.ts.
-- Suben fotos los usuarios que pueden escribir (no solo lectura); las ven los que
-- ven Compras o Almacén (mismas reglas que las OC). No se borran desde la app.
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guias', 'guias', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists guias_subir on storage.objects;
create policy guias_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'guias'
    and exists (select 1 from public.perfiles p where p.id = auth.uid() and not coalesce(p.solo_lectura, false))
  );

-- upsert de la misma foto (reintento tras un corte de señal)
drop policy if exists guias_reemplazar on storage.objects;
create policy guias_reemplazar on storage.objects for update to authenticated
  using (bucket_id = 'guias' and owner = auth.uid())
  with check (bucket_id = 'guias' and owner = auth.uid());

drop policy if exists guias_ver on storage.objects;
create policy guias_ver on storage.objects for select to authenticated
  using (
    bucket_id = 'guias'
    and (public.puede_ver('/dashboard/compras') or public.puede_ver('/dashboard/almacen') or public.mi_rol() in ('creador', 'soporte', 'logistica'))
  );
