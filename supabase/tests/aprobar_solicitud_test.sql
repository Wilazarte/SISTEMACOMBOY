-- =====================================================================
-- Prueba: aprobar "LIMA PLANA 1" TRUPER" y luego crear un Requerimiento de Compra con ese producto.
-- Ejecutar en Supabase › SQL Editor. Todo corre dentro de una transacción y termina en ROLLBACK:
-- no deja datos. Si algo falla, el error dice qué paso falló; si todo pasa, muestra "OK".
-- =====================================================================
begin;

do $$
declare
  creador uuid := (select id from public.perfiles where rol = 'creador' order by id limit 1);
  sol uuid;
  p public.productos_maestro;
  req jsonb;
begin
  if creador is null then raise exception 'FALLA: no hay usuario con rol creador en perfiles'; end if;
  -- Actúa como el creador (como lo hace la app con su sesión)
  perform set_config('request.jwt.claim.sub', creador::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', creador, 'role', 'authenticated')::text, true);

  -- 1. La solicitud pendiente de LIMA PLANA 1" TRUPER (si no existe, se crea una para la prueba)
  select id into sol from public.productos_solicitudes
   where public.normalizar_producto(coalesce(nombre_solicitado, nombre)) = public.normalizar_producto('LIMA PLANA 1" TRUPER')
     and upper(estado) = 'PENDIENTE' limit 1;
  if sol is null then
    insert into public.productos_solicitudes (nombre_solicitado, nombre_norm, unidad, marca, estado, solicitante_id, solicitado_por)
    values ('LIMA PLANA 1" TRUPER', public.normalizar_producto('LIMA PLANA 1" TRUPER'), 'UND', 'TRUPER', 'PENDIENTE', creador, creador)
    returning id into sol;
  end if;

  -- 2. Aprobar
  p := public.aprobar_solicitud_producto(sol);
  if p.sku !~ '^PROD-\d{4,}$' then raise exception 'FALLA: SKU inválido %', p.sku; end if;
  if p.nombre_display not like '%1"%' then raise exception 'FALLA: nombre_display perdió las comillas: %', p.nombre_display; end if;
  if p.nombre_normalizado <> public.normalizar_producto('LIMA PLANA 1" TRUPER') then raise exception 'FALLA: nombre_normalizado %', p.nombre_normalizado; end if;
  if not exists (select 1 from public.productos_solicitudes where id = sol and estado = 'APROBADA' and producto_maestro_id = p.id) then
    raise exception 'FALLA: la solicitud no quedó APROBADA con producto_maestro_id';
  end if;

  -- 3. El Requerimiento de Compra encuentra el producto (lo mismo que hace el selector / canonizar en la app)
  if public.producto_de_nombre('lima plana 1" truper') is distinct from p.id then
    raise exception 'FALLA: el catálogo no resuelve "lima plana 1\" truper" al producto aprobado';
  end if;

  -- 4. Crear el Requerimiento de Compra (tabla compras de documentos, tipo req_pendiente)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'compras' and column_name = 'data') then
    req := jsonb_build_object('numero', 'REQ-PRUEBA', 'items', jsonb_build_array(
             jsonb_build_object('nombre', p.nombre_normalizado, 'productoId', p.id, 'sku', p.sku, 'unidad', p.unidad, 'cantidad', 2)));
    execute 'insert into public.compras (tipo, id, data) values (''req_pendiente'', ''req-prueba-aprobar'', $1)' using req;
    if not exists (select 1 from public.compras where tipo = 'req_pendiente' and id = 'req-prueba-aprobar' and data->'items'->0->>'sku' = p.sku) then
      raise exception 'FALLA: no se pudo guardar el Requerimiento de Compra';
    end if;
  end if;

  raise notice 'OK: % (%) aprobado y usado en un Requerimiento de Compra', p.nombre_display, p.sku;
end $$;

select 'OK' as resultado;
rollback;
