-- =====================================================================
-- productos_solicitudes: columnas reales de producción · ERP COMBOY VID
-- Ejecutar en Supabase › SQL Editor (se puede repetir). Sin BEGIN/COMMIT.
--
-- "Solicitar nuevo producto maestro" ahora inserta nombre_solicitado, nombre_norm, categoria_sugerida,
-- estado 'PENDIENTE' y solicitante_id (columnas NOT NULL en producción). Este script:
--   1. borra los triggers temporales fix_solicitud_producto (ya no hacen falta)
--   2. crea esas columnas si faltan (instalaciones nuevas) y deja nombre opcional
--   3. acepta estado en MAYÚSCULAS en el check y en las políticas
--   4. productos nuevos con SKU PROD-#### aunque la tabla no tuviera default
--   5. crear_producto_maestro marca la solicitud como 'APROBADA'
-- =====================================================================

-- 1. Triggers temporales fix_solicitud_producto (en cualquier tabla) y su función
do $$
declare r record;
begin
  for r in select t.tgname, c.oid::regclass tabla from pg_trigger t join pg_class c on c.oid = t.tgrelid
            where not t.tgisinternal and t.tgname ilike 'fix_solicitud_producto%' loop
    execute format('drop trigger if exists %I on %s', r.tgname, r.tabla);
  end loop;
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname ilike 'fix_solicitud_producto%' loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

-- 2. Columnas
alter table public.productos_solicitudes add column if not exists nombre_solicitado text;
alter table public.productos_solicitudes add column if not exists nombre_norm text;
alter table public.productos_solicitudes add column if not exists categoria_sugerida text;
alter table public.productos_solicitudes add column if not exists solicitante_id uuid default auth.uid();
alter table public.productos_solicitudes add column if not exists solicitado_por uuid default auth.uid();
alter table public.productos_solicitudes add column if not exists estado text default 'PENDIENTE';
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos_solicitudes' and column_name = 'nombre') then
    alter table public.productos_solicitudes alter column nombre drop not null;
  end if;
end $$;
-- Filas antiguas (columna nombre) -> nombre_solicitado / nombre_norm
update public.productos_solicitudes
   set nombre_solicitado = coalesce(nombre_solicitado, upper(btrim(nombre))),
       nombre_norm = coalesce(nombre_norm, public.normalizar_producto(nombre))
 where (nombre_solicitado is null or nombre_norm is null) and nombre is not null;

-- 3. Estado en MAYÚSCULAS (PENDIENTE / APROBADA / RECHAZADA); el check en minúsculas de la versión anterior se reemplaza
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.productos_solicitudes'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%estado%' and pg_get_constraintdef(oid) like '%''pendiente''%' loop
    execute format('alter table public.productos_solicitudes drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.productos_solicitudes'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) ilike '%estado%') then
    alter table public.productos_solicitudes add constraint productos_solicitudes_estado_check
      check (upper(estado) in ('PENDIENTE', 'APROBADA', 'RECHAZADA')) not valid;
  end if;
end $$;
alter table public.productos_solicitudes alter column estado set default 'PENDIENTE';
update public.productos_solicitudes set estado = upper(estado) where estado <> upper(estado);

drop policy if exists productos_sol_select on public.productos_solicitudes;
drop policy if exists productos_sol_insert on public.productos_solicitudes;
create policy productos_sol_select on public.productos_solicitudes for select to authenticated
  using (solicitado_por::text = auth.uid()::text or solicitante_id::text = auth.uid()::text or public.es_admin_productos());
create policy productos_sol_insert on public.productos_solicitudes for insert to authenticated
  with check ((solicitado_por::text = auth.uid()::text or solicitante_id::text = auth.uid()::text)
              and upper(estado) = 'PENDIENTE' and public.mi_rol() <> 'sin_rol');

-- 4. productos_maestro creada antes sin default de SKU: los productos nuevos reciben el siguiente PROD-####
--    (y los que quedaron sin SKU también)
alter table public.productos_maestro alter column sku set default ('PROD-' || lpad(nextval('public.productos_sku_seq')::text, 4, '0'));
select setval('public.productos_sku_seq', greatest(m, 1), m > 0)
  from (select coalesce(max(substring(sku from '^PROD-(\d+)$')::bigint), 0) m from public.productos_maestro) s;
update public.productos_maestro set sku = default where sku is null or btrim(sku) = '';

-- 5. Alta desde una solicitud: queda APROBADA
create or replace function public.crear_producto_maestro(
  p_nombre text, p_unidad text default 'UND', p_marca text default null, p_categoria text default null,
  p_descripcion text default null, p_solicitud uuid default null
) returns public.productos_maestro
language plpgsql security definer set search_path = public as $$
declare
  norm text := public.normalizar_producto(p_nombre);
  existente public.productos_maestro;
  nuevo public.productos_maestro;
begin
  if not public.es_admin_productos() then
    raise exception 'Solo el administrador crea productos en el catálogo maestro. Use "Solicitar nuevo producto".' using errcode = '42501';
  end if;
  if norm = '' then
    raise exception 'Ingrese el nombre del producto.' using errcode = '22023';
  end if;
  select p.* into existente from public.productos_maestro p where p.id = public.producto_de_nombre(norm);
  if found then
    raise exception 'PRODUCTO_YA_EXISTE: Ya existe como % (%). Use ese producto para todos los almacenes.', existente.nombre_display, existente.sku using errcode = '23505';
  end if;
  insert into public.productos_maestro (nombre_normalizado, nombre_display, unidad, marca, categoria, descripcion)
  values (norm, btrim(regexp_replace(p_nombre, '\s+', ' ', 'g')), coalesce(nullif(btrim(p_unidad), ''), 'UND'),
          nullif(btrim(p_marca), ''), nullif(btrim(p_categoria), ''), nullif(btrim(p_descripcion), ''))
  returning * into nuevo;
  if p_solicitud is not null then
    update public.productos_solicitudes set estado = 'APROBADA', producto_id = nuevo.id, resuelto_at = now() where id = p_solicitud;
  end if;
  return nuevo;
end $$;
grant execute on function public.crear_producto_maestro(text, text, text, text, text, uuid) to authenticated;
