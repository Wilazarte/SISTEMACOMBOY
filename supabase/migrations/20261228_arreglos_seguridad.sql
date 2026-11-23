-- =====================================================================
-- ARREGLOS DE SEGURIDAD · producción · 2026-11-23
-- Sale del informe informe_seguridad_produccion.sql que corrió Williams el 2026-11-23.
--
-- NO borra tablas, filas ni funciones. Solo cambia permisos:
--   1. Copias de respaldo (*_respaldo_*): nadie del ERP las puede leer ni modificar (los datos quedan).
--   2. importar_asistencia VIEJA (uuid, dias, tardanzas): la app ya no la usa; se cierra.
--      La que usa la app es importar_asistencia(text, jsonb) y NO se toca.
--   3. Vistas stock_almacenes y v_equipos_terminados: pasan a respetar el RLS (la app no las usa).
--   4. 19 funciones que se podían llamar SIN iniciar sesión: solo usuarios logueados.
--      Las 3 del login (email_de_login, login_bloqueo, login_fallido) siguen abiertas.
--   5. Funciones futuras: ya no nacen abiertas a visitantes sin sesión.
--
-- Todo va en una transacción: si algo falla, no se aplica nada.
-- Para volver atrás: 20261228_arreglos_seguridad_rollback.sql
-- Después: volver a correr informe_seguridad_produccion.sql (deben desaparecer esos ALTO/MEDIO).
-- =====================================================================

begin;

-- 1. Copias de respaldo: RLS activo y sin permisos para la API (solo postgres / SQL Editor las ve)
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
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
      raise notice 'Respaldo cerrado: %', t;
    end if;
  end loop;
end $$;

-- 2. importar_asistencia vieja (4 parámetros): search_path fijo y sin permiso para nadie de la API
do $$
begin
  if to_regprocedure('public.importar_asistencia(text, uuid, integer, integer)') is not null then
    alter function public.importar_asistencia(text, uuid, integer, integer) set search_path = public;
    revoke execute on function public.importar_asistencia(text, uuid, integer, integer) from public, anon, authenticated;
    raise notice 'importar_asistencia vieja cerrada';
  end if;
end $$;

-- 3. Vistas que se saltaban el RLS
do $$
begin
  if to_regclass('public.stock_almacenes') is not null then
    alter view public.stock_almacenes set (security_invoker = true);
  end if;
  if to_regclass('public.v_equipos_terminados') is not null then
    alter view public.v_equipos_terminados set (security_invoker = true);
  end if;
end $$;

-- 4. Funciones SECURITY DEFINER: fuera visitantes sin sesión, se mantienen los usuarios logueados
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
    execute format('revoke execute on function %s from public, anon', r.firma);
    execute format('grant execute on function %s to authenticated, service_role', r.firma);
    raise notice 'Solo logueados: %', r.firma;
  end loop;
end $$;

-- 5. Funciones nuevas que cree postgres en public: sin visitantes por defecto
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;

commit;

-- Verificación rápida: debe salir 0 en las dos columnas
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname not in ('email_de_login', 'login_bloqueo', 'login_fallido')) as funciones_abiertas_sin_sesion,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) as tablas_sin_rls;
