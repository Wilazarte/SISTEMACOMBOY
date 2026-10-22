-- =====================================================================
-- Aprobar solicitud de producto nuevo · ERP COMBOY VID
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 20261025_productos_solicitudes_mapping.sql.
-- Sin BEGIN/COMMIT; se puede repetir.
--
-- public.aprobar_solicitud_producto(p_solicitud_id uuid) -> productos_maestro
--   Solo creador / admin (es_admin_productos). SECURITY DEFINER: no depende de las políticas RLS.
--   1. Lee nombre, unidad, marca y categoría de la solicitud (nombre_solicitado / nombre, categoria_sugerida / categoria)
--   2. Si el producto ya existe (mismo nombre normalizado o alias) no lo duplica: enlaza la solicitud a ese producto
--   3. Si no, lo crea con el siguiente SKU PROD-#### libre, nombre_display tal cual (con comillas, p. ej. LIMA PLANA 1" TRUPER)
--      y nombre_normalizado = normalizar_producto(nombre)
--   4. La solicitud queda APROBADA con producto_maestro_id (y producto_id) del producto
-- =====================================================================

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
    insert into public.productos_maestro (sku, nombre_normalizado, nombre_display, unidad, marca, categoria)
    values (v_sku, v_norm, v_nombre, v_unidad, v_marca, v_categoria)
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
