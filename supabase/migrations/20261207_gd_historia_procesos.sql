-- =====================================================================
-- Gestión Documentaria · Historia de procesos (historia clínica por proceso)
-- Correr DESPUÉS de 20261204_gestion_documentaria.sql. Idempotente: se puede correr varias veces.
--
-- No toca ninguna tabla de Almacén, Tesorería, Ventas ni Producción: la historia se arma leyendo
-- lo que cada módulo ya guarda. Lo único que agrega es la huella de auditoría: cada vez que alguien
-- abre o imprime la historia de un proceso queda en audit_log (acción CONSULTAR_HISTORIA) con
-- usuario, fecha, hora, IP y dispositivo, en la misma cadena de hashes.
-- =====================================================================

-- 1) Nueva acción permitida en audit_log (se reemplaza el CHECK de la columna accion)
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.audit_log'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%accion%'
  loop
    execute format('alter table public.audit_log drop constraint %I', c);
  end loop;
  alter table public.audit_log add constraint audit_log_accion_check check (accion in (
    'CREAR', 'VER', 'DESCARGAR', 'SUBIR_VERSION', 'APROBAR', 'RECHAZAR', 'EDITAR_PERMISO', 'ELIMINAR_LOGICA', 'RESTAURAR_VERSION',
    'ENVIAR_REVISION', 'EDITAR_DATOS', 'RESTAURAR_ARCHIVO', 'ACCESO_DENEGADO', 'DESCARGA_BLOQUEADA',
    'ALERTA_INTEGRIDAD', 'VERIFICAR_INTEGRIDAD', 'VENCER', 'CONSULTAR_AUDITORIA', 'EXPORTAR_REPORTE',
    'CONSULTAR_HISTORIA'));
end $$;

-- 2) gd_registrar_evento acepta CONSULTAR_HISTORIA (cualquier rol del módulo; document_id null,
--    el código del proceso va en el detalle y en valor_nuevo)
create or replace function public.gd_registrar_evento(p_doc uuid, p_accion text, p_detalle text, p_valor jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r text := public.gd_rol_de(auth.uid());
begin
  if r is null then return jsonb_build_object('ok', false, 'error', 'Sin rol.'); end if;
  if p_accion = 'VER' then
    if p_doc is null or public.gd_nivel(p_doc, uid) < 1 then
      perform public.gd_log(p_doc, uid, 'ACCESO_DENEGADO', 'Intentó abrir la ficha sin permiso', null, null);
      return jsonb_build_object('ok', false, 'error', 'Sin permiso.');
    end if;
  elsif p_accion = 'EXPORTAR_REPORTE' then
    if r not in ('Gerencia', 'Soporte') then return jsonb_build_object('ok', false, 'error', 'Solo Gerencia.'); end if;
  elsif p_accion = 'CONSULTAR_HISTORIA' then
    if coalesce(p_valor ->> 'proceso', '') = '' then return jsonb_build_object('ok', false, 'error', 'Falta el código del proceso.'); end if;
    p_doc := null;
  else
    raise exception 'Evento no permitido: %', p_accion;
  end if;
  -- AUDITORÍA: VER (ficha) / EXPORTAR_REPORTE (hash del reporte) / CONSULTAR_HISTORIA (proceso abierto o impreso)
  perform public.gd_log(p_doc, uid, p_accion, left(coalesce(p_detalle, ''), 500), null, p_valor);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.gd_registrar_evento(uuid, text, text, jsonb) from public, anon;
grant execute on function public.gd_registrar_evento(uuid, text, text, jsonb) to authenticated;
