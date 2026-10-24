-- =====================================================================
-- Fix: aprobar solicitudes de productos · ERP COMBOY VID
-- Error en producción al dar "Aprobar" (Ventas › Catálogo › Solicitudes):
--   column "estado" of relation "productos_maestro" does not exist
-- Algo en la base de producción (una versión anterior de la función de aprobación o un trigger)
-- escribe productos_maestro.estado, columna que el catálogo nunca tuvo (usa "activo" boolean).
--
-- Este script (sin BEGIN/COMMIT; se puede repetir):
--   1. Añade productos_maestro.estado ('ACTIVO' / 'INACTIVO'), default 'ACTIVO', y la rellena desde "activo"
--   2. Mantiene estado y activo sincronizados con un trigger (la app sigue usando "activo")
--   3. Vuelve a crear aprobar_solicitud_producto() con la versión correcta: el producto nuevo queda
--      ACTIVO y el estado de la solicitud (productos_solicitudes.estado) pasa a APROBADA
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 20261026_aprobar_solicitud.sql.
-- =====================================================================

-- 1. Columna estado del producto maestro
alter table public.productos_maestro add column if not exists estado varchar not null default 'ACTIVO';
alter table public.productos_maestro alter column estado set default 'ACTIVO';
update public.productos_maestro
   set estado = case when activo then 'ACTIVO' else 'INACTIVO' end
 where estado is distinct from case when activo then 'ACTIVO' else 'INACTIVO' end;

-- 2. estado <-> activo: 'INACTIVO' / 'ANULADO' / 'RECHAZADO' desactivan; cualquier otro valor deja el producto activo
create or replace function public.productos_maestro_sync_estado() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.activo := coalesce(new.activo, true) and coalesce(upper(new.estado), 'ACTIVO') not in ('INACTIVO', 'ANULADO', 'ANULADA', 'RECHAZADO', 'RECHAZADA');
  elsif new.estado is distinct from old.estado and new.activo is not distinct from old.activo then
    -- cambió solo "estado": activo lo sigue
    new.activo := coalesce(upper(new.estado), 'ACTIVO') not in ('INACTIVO', 'ANULADO', 'ANULADA', 'RECHAZADO', 'RECHAZADA');
  end if;
  -- cambió "activo" (desde la app) o ambos: estado sigue a activo
  new.estado := case when new.activo then 'ACTIVO' else 'INACTIVO' end;
  return new;
end $$;

drop trigger if exists trg_productos_maestro_estado on public.productos_maestro;
create trigger trg_productos_maestro_estado before insert or update on public.productos_maestro
  for each row execute function public.productos_maestro_sync_estado();

-- 3. Función de aprobación (reemplaza cualquier versión anterior que haya en la base)
drop function if exists public.aprobar_solicitud_producto(uuid);

alter table public.productos_solicitudes add column if not exists producto_maestro_id uuid;

create or replace function public.aprobar_solicitud_producto(p_solicitud_id uuid) returns public.productos_maestro
language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  v_nombre text;
  v_norm text;
  v_unidad text;
  v_marca text;
  v_categoria text;
  n bigint;
  v_sku text;
  p public.productos_maestro;
begin
  if not public.es_admin_productos() then
    raise exception 'Solo el administrador (creador) aprueba productos nuevos.' using errcode = '42501';
  end if;

  select to_jsonb(x) into s from public.productos_solicitudes x where x.id = p_solicitud_id for update;
  if s is null then
    raise exception 'Solicitud no encontrada.' using errcode = '22023';
  end if;
  if upper(coalesce(s->>'estado', 'PENDIENTE')) <> 'PENDIENTE' then
    raise exception 'La solicitud ya fue %.', lower(s->>'estado') using errcode = '22023';
  end if;

  v_nombre := btrim(regexp_replace(coalesce(nullif(s->>'nombre_solicitado', ''), s->>'nombre', ''), '[\s ]+', ' ', 'g'));
  v_norm := public.normalizar_producto(v_nombre);
  if v_norm = '' then
    raise exception 'La solicitud no tiene nombre de producto.' using errcode = '22023';
  end if;
  v_unidad := coalesce(nullif(btrim(s->>'unidad'), ''), 'UND');
  v_marca := nullif(btrim(s->>'marca'), '');
  v_categoria := nullif(btrim(coalesce(s->>'categoria_sugerida', s->>'categoria')), '');

  -- Ya existe (mismo nombre o alias): se usa ese producto
  select * into p from public.productos_maestro where id = public.producto_de_nombre(v_norm);
  if not found then
    loop
      n := nextval('public.productos_sku_seq');
      v_sku := 'PROD-' || lpad(n::text, 4, '0');
      exit when not exists (select 1 from public.productos_maestro where sku = v_sku);
    end loop;
    insert into public.productos_maestro (sku, nombre_normalizado, nombre_display, unidad, marca, categoria, activo, estado)
    values (v_sku, v_norm, v_nombre, v_unidad, v_marca, v_categoria, true, 'ACTIVO')
    returning * into p;
  end if;

  update public.productos_solicitudes
     set estado = 'APROBADA', producto_maestro_id = p.id, producto_id = p.id, resuelto_at = now(),
         respuesta = case when p.sku = v_sku then 'Creado como ' || p.sku else 'Ya existía como ' || p.nombre_display || ' (' || p.sku || ')' end
   where id = p_solicitud_id;
  return p;
end $$;

revoke execute on function public.aprobar_solicitud_producto(uuid) from public, anon;
grant execute on function public.aprobar_solicitud_producto(uuid) to authenticated;

-- Recarga el esquema de la API para que la app vea la columna nueva
notify pgrst, 'reload schema';
