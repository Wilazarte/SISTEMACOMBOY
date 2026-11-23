-- Deshace 20261228_arreglos_seguridad.sql (deja los permisos como estaban el 2026-11-23).
-- Correr SOLO si después de los arreglos algo del ERP dejó de funcionar.
begin;

do $$
declare t text;
begin
  foreach t in array array[
    'almacen_respaldo_20261117', 'almacen_respaldo_gst088', 'almacen_respaldo_os056',
    'compras_respaldo_gst088', 'compras_respaldo_os056',
    'contable_respaldo_gst088', 'contable_respaldo_os056',
    'notificaciones_respaldo_gst088', 'notificaciones_respaldo_oc080', 'notificaciones_respaldo_os056',
    'planilla_respaldo_boletas_dup',
    'productos_alias_respaldo_20261117', 'productos_maestro_respaldo_20261117'
  ] loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('alter table public.%I disable row level security', t);
      execute format('grant all on public.%I to anon, authenticated', t);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regprocedure('public.importar_asistencia(text, uuid, integer, integer)') is not null then
    alter function public.importar_asistencia(text, uuid, integer, integer) reset search_path;
    grant execute on function public.importar_asistencia(text, uuid, integer, integer) to public, anon, authenticated;
  end if;
  if to_regclass('public.stock_almacenes') is not null then
    alter view public.stock_almacenes reset (security_invoker);
  end if;
  if to_regclass('public.v_equipos_terminados') is not null then
    alter view public.v_equipos_terminados reset (security_invoker);
  end if;
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
      and p.proname in (
        'almacen_producto_id', 'crear_producto_maestro', 'editar_asistencia_creador', 'es_admin_productos',
        'es_planta', 'generate_codigo_expediente', 'mi_sala_chat', 'mi_sede', 'producto_de_nombre',
        'productos_similares', 'puede_ver', 'puede_ver_sede', 'sede_central', 'sede_usuario',
        'siguiente_numero_sucursal', 'soltar_bloqueo', 'tiene_permiso', 'tomar_bloqueo', 'unificar_productos')
  loop
    execute format('grant execute on function %s to public, anon', r.firma);
  end loop;
end $$;

alter default privileges for role postgres in schema public grant execute on functions to public, anon;

commit;
