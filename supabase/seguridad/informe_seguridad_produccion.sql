-- =====================================================================
-- INFORME DE SEGURIDAD · BASE DE PRODUCCIÓN · ERP COMBOY VID
-- Generado 2026-11-23 desde el repo Wilazarte/SISTEMACOMBOY (rama main).
--
-- SOLO LECTURA: es un único SELECT. No crea, no cambia ni borra nada.
-- No muestra contraseñas, claves ni datos de clientes; solo nombres de
-- tablas, políticas, funciones, buckets y correos de usuarios del ERP.
--
-- Cómo correrlo:
--   1. Supabase → proyecto de PRODUCCIÓN → SQL Editor → New query.
--   2. Pegar TODO este archivo y pulsar Run.
--   3. Si arriba del resultado hay un selector de filas ("100 rows"),
--      ponerlo en "No limit" (o 1000) y volver a correr.
--   4. Export → Download CSV (o Copy as markdown) y pegar/enviar el resultado.
--
-- Columnas del resultado:
--   severidad  CRITICO > ALTO > MEDIO > BAJO > INFO > OK
--   seccion    qué se revisó
--   objeto     tabla / política / función / bucket / migración / usuario
--   detalle    qué se encontró
--   que_hacer  arreglo sugerido (NO correr nada sin revisarlo antes)
-- =====================================================================

with
-- ---------------------------------------------------------------------
-- Objetos que crean las migraciones del repo (supabase/migrations).
-- Solo se cuentan objetos NUEVOS de cada migración (no los que ya existían
-- antes), y no los que una migración posterior borra.
-- ---------------------------------------------------------------------
esperado(migracion, tipo, objeto, detalle) as (values
    ('20261021_correlativo_dj','funcion','next_correlativo',''),
    ('20261021_correlativo_dj','rls','correlativos',''),
    ('20261021_correlativo_dj','tabla','correlativos',''),
    ('20261021_sprint1_seguridad','politica','adelantos_acceso','public.adelantos'),
    ('20261021_sprint1_seguridad','politica','asistencia_creador_escribir','public.asistencia_creador'),
    ('20261021_sprint1_seguridad','politica','asistencia_creador_select','public.asistencia_creador'),
    ('20261021_sprint1_seguridad','politica','bauchers_actualizar','storage.objects'),
    ('20261021_sprint1_seguridad','politica','bauchers_borrar','storage.objects'),
    ('20261021_sprint1_seguridad','politica','bauchers_leer','storage.objects'),
    ('20261021_sprint1_seguridad','politica','bauchers_subir','storage.objects'),
    ('20261021_sprint1_seguridad','politica','contadores_acceso','public.contadores'),
    ('20261021_sprint1_seguridad','politica','gastos_tesoreria','public.gastos'),
    ('20261021_sprint1_seguridad','politica','manual_ediciones_asistencia_acceso','public.manual_ediciones_asistencia'),
    ('20261021_sprint1_seguridad','politica','movimientos_almacen_escribir','public.movimientos_almacen'),
    ('20261021_sprint1_seguridad','politica','movimientos_almacen_select','public.movimientos_almacen'),
    ('20261021_sprint1_seguridad','politica','perfiles_insert_creador','public.perfiles'),
    ('20261021_sprint1_seguridad','politica','perfiles_select_own','public.perfiles'),
    ('20261021_sprint1_seguridad','politica','perfiles_update_creador','public.perfiles'),
    ('20261021_sprint1_seguridad','rls','contadores',''),
    ('20261021_sprint1_seguridad','rls','manual_ediciones_asistencia',''),
    ('20261022_fix_productos_alias','columna','productos_alias','alias_normalizado'),
    ('20261022_fix_productos_alias','columna','productos_alias','created_at'),
    ('20261022_fix_productos_alias','funcion','normalizar_producto',''),
    ('20261022_sucursal_beta','politica','compras_req_sucursal','public.compras'),
    ('20261022_sucursal_beta','politica','compras_select_sucursal','public.compras'),
    ('20261022_sucursal_beta','rls','sucursal',''),
    ('20261022_sucursal_beta','tabla','sucursal',''),
    ('20261022_sucursal_beta','vista','v_sucursal_traslados',''),
    ('20261022_sucursal_beta','vista','v_sucursal_ventas',''),
    ('20261022_unificar_productos','columna','productos_maestro','activo'),
    ('20261022_unificar_productos','columna','productos_maestro','categoria'),
    ('20261022_unificar_productos','columna','productos_maestro','created_at'),
    ('20261022_unificar_productos','columna','productos_maestro','created_by'),
    ('20261022_unificar_productos','columna','productos_maestro','descripcion'),
    ('20261022_unificar_productos','columna','productos_maestro','marca'),
    ('20261022_unificar_productos','columna','productos_maestro','nombre_display'),
    ('20261022_unificar_productos','columna','productos_maestro','nombre_normalizado'),
    ('20261022_unificar_productos','columna','productos_maestro','sku'),
    ('20261022_unificar_productos','columna','productos_maestro','unidad'),
    ('20261022_unificar_productos','columna','productos_solicitudes','categoria'),
    ('20261022_unificar_productos','columna','productos_solicitudes','categoria_sugerida'),
    ('20261022_unificar_productos','columna','productos_solicitudes','created_at'),
    ('20261022_unificar_productos','columna','productos_solicitudes','estado'),
    ('20261022_unificar_productos','columna','productos_solicitudes','marca'),
    ('20261022_unificar_productos','columna','productos_solicitudes','modulo'),
    ('20261022_unificar_productos','columna','productos_solicitudes','motivo'),
    ('20261022_unificar_productos','columna','productos_solicitudes','nombre'),
    ('20261022_unificar_productos','columna','productos_solicitudes','nombre_norm'),
    ('20261022_unificar_productos','columna','productos_solicitudes','nombre_solicitado'),
    ('20261022_unificar_productos','columna','productos_solicitudes','producto_id'),
    ('20261022_unificar_productos','columna','productos_solicitudes','respuesta'),
    ('20261022_unificar_productos','columna','productos_solicitudes','resuelto_at'),
    ('20261022_unificar_productos','columna','productos_solicitudes','solicitado_por'),
    ('20261022_unificar_productos','columna','productos_solicitudes','solicitado_usuario'),
    ('20261022_unificar_productos','columna','productos_solicitudes','solicitante_id'),
    ('20261022_unificar_productos','columna','productos_solicitudes','unidad'),
    ('20261022_unificar_productos','funcion','ajustar_secuencia_sku',''),
    ('20261022_unificar_productos','funcion','almacen_cantidad',''),
    ('20261022_unificar_productos','funcion','almacen_enlazar',''),
    ('20261022_unificar_productos','funcion','almacen_es_stock',''),
    ('20261022_unificar_productos','funcion','almacen_nombre',''),
    ('20261022_unificar_productos','funcion','almacen_producto_id',''),
    ('20261022_unificar_productos','funcion','almacen_sku',''),
    ('20261022_unificar_productos','funcion','almacen_ubicacion',''),
    ('20261022_unificar_productos','funcion','almacen_unidad',''),
    ('20261022_unificar_productos','funcion','crear_producto_maestro',''),
    ('20261022_unificar_productos','funcion','crear_vista_stock_almacenes',''),
    ('20261022_unificar_productos','funcion','enlazar_stock',''),
    ('20261022_unificar_productos','funcion','es_admin_productos',''),
    ('20261022_unificar_productos','funcion','exigir_producto_maestro',''),
    ('20261022_unificar_productos','funcion','producto_de_nombre',''),
    ('20261022_unificar_productos','funcion','productos_similares',''),
    ('20261022_unificar_productos','funcion','sembrar_productos',''),
    ('20261022_unificar_productos','funcion','unificar_productos',''),
    ('20261022_unificar_productos','politica','productos_admin','public.productos_maestro'),
    ('20261022_unificar_productos','politica','productos_alias_admin','public.productos_alias'),
    ('20261022_unificar_productos','politica','productos_alias_select','public.productos_alias'),
    ('20261022_unificar_productos','politica','productos_select','public.productos_maestro'),
    ('20261022_unificar_productos','politica','productos_sol_admin','public.productos_solicitudes'),
    ('20261022_unificar_productos','rls','productos_alias',''),
    ('20261022_unificar_productos','rls','productos_maestro',''),
    ('20261022_unificar_productos','rls','productos_solicitudes',''),
    ('20261022_unificar_productos','tabla','productos_alias',''),
    ('20261022_unificar_productos','tabla','productos_maestro',''),
    ('20261022_unificar_productos','tabla','productos_solicitudes',''),
    ('20261022_unificar_productos','vista','v_stock_almacenes',''),
    ('20261023_sedes_multisede','funcion','asignar_sede',''),
    ('20261023_sedes_multisede','funcion','mi_sede',''),
    ('20261023_sedes_multisede','funcion','puede_ver_sede',''),
    ('20261023_sedes_multisede','funcion','sede_central',''),
    ('20261023_sedes_multisede','funcion','sede_usuario',''),
    ('20261023_sedes_multisede','politica','sede_acceso','public.public'),
    ('20261023_sedes_multisede','politica','sede_isolation','public.public'),
    ('20261023_sedes_multisede','politica','sedes_admin','public.sedes'),
    ('20261023_sedes_multisede','politica','sedes_select','public.sedes'),
    ('20261023_sedes_multisede','politica','usuarios_sedes_admin','public.usuarios_sedes'),
    ('20261023_sedes_multisede','politica','usuarios_sedes_select','public.usuarios_sedes'),
    ('20261023_sedes_multisede','rls','sedes',''),
    ('20261023_sedes_multisede','rls','usuarios_sedes',''),
    ('20261023_sedes_multisede','tabla','sedes',''),
    ('20261023_sedes_multisede','tabla','usuarios_sedes',''),
    ('20261024_productos_espejo_almacen','vista','v_productos_stock',''),
    ('20261026_aprobar_solicitud','columna','productos_solicitudes','producto_maestro_id'),
    ('20261027_secocha_planta_principal','columna','sedes','tipo'),
    ('20261029_productos_maestro_estado','columna','productos_maestro','estado'),
    ('20261029_productos_maestro_estado','funcion','productos_maestro_sync_estado',''),
    ('20261030_orden_servicio','funcion','siguiente_numero_os',''),
    ('20261031_cajas_arequipa','columna','cajas','cuentas_bancarias'),
    ('20261031_cajas_arequipa','columna','cajas','descripcion'),
    ('20261102_login_intentos','funcion','login_bloqueo',''),
    ('20261102_login_intentos','funcion','login_exitoso',''),
    ('20261102_login_intentos','funcion','login_fallido',''),
    ('20261102_login_intentos','rls','login_intentos',''),
    ('20261102_login_intentos','tabla','login_intentos',''),
    ('20261104_chat_grupal','rls','chat_mensajes',''),
    ('20261104_chat_grupal','tabla','chat_mensajes',''),
    ('20261105_expedientes_26w','bucket','cotizaciones',''),
    ('20261105_expedientes_26w','funcion','cotizaciones_proteger_validacion',''),
    ('20261105_expedientes_26w','funcion','es_planta',''),
    ('20261105_expedientes_26w','funcion','expedientes_touch',''),
    ('20261105_expedientes_26w','funcion','generate_codigo_expediente',''),
    ('20261105_expedientes_26w','funcion','ordenes_compra_desde_cotizacion',''),
    ('20261105_expedientes_26w','politica','cotizaciones_archivos_leer','storage.objects'),
    ('20261105_expedientes_26w','politica','cotizaciones_archivos_subir','storage.objects'),
    ('20261105_expedientes_26w','politica','cotizaciones_editar','public.cotizaciones'),
    ('20261105_expedientes_26w','politica','cotizaciones_escribir','public.cotizaciones'),
    ('20261105_expedientes_26w','politica','cotizaciones_leer','public.cotizaciones'),
    ('20261105_expedientes_26w','politica','expedientes_editar','public.expedientes'),
    ('20261105_expedientes_26w','politica','expedientes_leer','public.expedientes'),
    ('20261105_expedientes_26w','politica','ordenes_compra_crear','public.ordenes_compra'),
    ('20261105_expedientes_26w','politica','ordenes_compra_editar','public.ordenes_compra'),
    ('20261105_expedientes_26w','politica','ordenes_compra_leer','public.ordenes_compra'),
    ('20261105_expedientes_26w','politica','validacion_log_leer','public.proveedor_validacion_log'),
    ('20261105_expedientes_26w','rls','cotizaciones',''),
    ('20261105_expedientes_26w','rls','expedientes',''),
    ('20261105_expedientes_26w','rls','ordenes_compra',''),
    ('20261105_expedientes_26w','rls','proveedor_validacion_log',''),
    ('20261105_expedientes_26w','tabla','cotizaciones',''),
    ('20261105_expedientes_26w','tabla','expedientes',''),
    ('20261105_expedientes_26w','tabla','ordenes_compra',''),
    ('20261105_expedientes_26w','tabla','proveedor_validacion_log',''),
    ('20261106_perfiles_asignacion','columna','perfiles','activo'),
    ('20261106_perfiles_asignacion','columna','perfiles','avatar_iniciales'),
    ('20261106_perfiles_asignacion','columna','perfiles','email'),
    ('20261106_perfiles_asignacion','columna','perfiles','es_admin'),
    ('20261106_perfiles_asignacion','columna','perfiles','modulo_asignado'),
    ('20261106_perfiles_asignacion','funcion','email_de_login',''),
    ('20261106_perfiles_asignacion','funcion','mi_sala_chat',''),
    ('20261106_perfiles_asignacion','politica','almacen_escribir_produccion','public.almacen'),
    ('20261106_perfiles_asignacion','politica','perfiles_soporte_editar','public.perfiles'),
    ('20261106_perfiles_asignacion','vista','usuarios',''),
    ('20261107_notificaciones_flujo','columna','notificaciones','asignado_a'),
    ('20261107_notificaciones_flujo','columna','notificaciones','codigo_expediente'),
    ('20261107_notificaciones_flujo','columna','notificaciones','datos'),
    ('20261107_notificaciones_flujo','columna','notificaciones','expediente_id'),
    ('20261107_notificaciones_flujo','columna','notificaciones','fase'),
    ('20261107_notificaciones_flujo','columna','notificaciones','href'),
    ('20261107_notificaciones_flujo','columna','notificaciones','leida'),
    ('20261107_notificaciones_flujo','columna','notificaciones','leida_at'),
    ('20261107_notificaciones_flujo','columna','notificaciones','leida_por'),
    ('20261107_notificaciones_flujo','columna','notificaciones','mensaje'),
    ('20261107_notificaciones_flujo','columna','notificaciones','modulo'),
    ('20261107_notificaciones_flujo','columna','notificaciones','tipo'),
    ('20261107_notificaciones_flujo','columna','notificaciones','titulo'),
    ('20261107_notificaciones_flujo','funcion','expedientes_notificar',''),
    ('20261107_notificaciones_flujo','funcion','marcar_notificaciones_leidas',''),
    ('20261107_notificaciones_flujo','funcion','mi_modulo_notif',''),
    ('20261107_notificaciones_flujo','funcion','notificar_flujo',''),
    ('20261107_notificaciones_flujo','funcion','ordenes_compra_notificar',''),
    ('20261107_notificaciones_flujo','politica','notificaciones_ver_flujo','public.notificaciones'),
    ('20261107_notificaciones_flujo','rls','notificaciones',''),
    ('20261107_notificaciones_flujo','tabla','notificaciones',''),
    ('20261108_op_lote_mixto','columna','expedientes','almacen_destino'),
    ('20261108_op_lote_mixto','columna','expedientes','es_lote_mixto'),
    ('20261108_op_lote_mixto','columna','expedientes','total_unidades'),
    ('20261108_op_lote_mixto','funcion','crear_op_lote',''),
    ('20261108_op_lote_mixto','funcion','op_detalles_total',''),
    ('20261108_op_lote_mixto','politica','bom_escribir','public.bom_modelos'),
    ('20261108_op_lote_mixto','politica','bom_leer','public.bom_modelos'),
    ('20261108_op_lote_mixto','politica','op_detalles_editar','public.orden_produccion_detalles'),
    ('20261108_op_lote_mixto','politica','op_detalles_leer','public.orden_produccion_detalles'),
    ('20261108_op_lote_mixto','rls','bom_modelos',''),
    ('20261108_op_lote_mixto','rls','orden_produccion_detalles',''),
    ('20261108_op_lote_mixto','tabla','bom_modelos',''),
    ('20261108_op_lote_mixto','tabla','orden_produccion_detalles',''),
    ('20261109_rbac_op_gerencia','politica','expedientes_leer_gerencia','public.expedientes'),
    ('20261109_rbac_op_gerencia','politica','op_detalles_leer_gerencia','public.orden_produccion_detalles'),
    ('20261111_ruc_validados','politica','ruc_validados_leer','public.ruc_validados'),
    ('20261111_ruc_validados','rls','ruc_validados',''),
    ('20261111_ruc_validados','tabla','ruc_validados',''),
    ('20261112_offline_sync','politica','conflictos_registrar','public.conflictos'),
    ('20261112_offline_sync','politica','conflictos_resolver','public.conflictos'),
    ('20261112_offline_sync','politica','conflictos_ver','public.conflictos'),
    ('20261112_offline_sync','rls','conflictos',''),
    ('20261112_offline_sync','tabla','conflictos',''),
    ('20261113_bucket_guias','bucket','guias',''),
    ('20261113_bucket_guias','politica','guias_reemplazar','storage.objects'),
    ('20261113_bucket_guias','politica','guias_subir','storage.objects'),
    ('20261113_bucket_guias','politica','guias_ver','storage.objects'),
    ('20261114_bloqueos_avisos','columna','perfiles','telefono_whatsapp'),
    ('20261114_bloqueos_avisos','funcion','soltar_bloqueo',''),
    ('20261114_bloqueos_avisos','funcion','tomar_bloqueo',''),
    ('20261114_bloqueos_avisos','politica','locks_ver','public.locks'),
    ('20261114_bloqueos_avisos','rls','locks',''),
    ('20261114_bloqueos_avisos','tabla','locks',''),
    ('20261117_notificaciones_req_almacen','funcion','compras_req_notificar',''),
    ('20261118_cotizacion_proveedor_gasto','funcion','siguiente_numero_cot_prov',''),
    ('20261125_sunat_cpe','columna','sunat_cpe','enlace_cdr'),
    ('20261125_sunat_cpe','columna','sunat_cpe','enlace_pdf'),
    ('20261125_sunat_cpe','columna','sunat_cpe','enlace_xml'),
    ('20261125_sunat_cpe','columna','sunat_cpe','pse'),
    ('20261125_sunat_cpe','funcion','siguiente_numero_cpe',''),
    ('20261125_sunat_cpe','politica','sunat_cpe_select','public.sunat_cpe'),
    ('20261125_sunat_cpe','politica','sunat_envios_select','public.sunat_envios'),
    ('20261125_sunat_cpe','rls','sunat_cpe',''),
    ('20261125_sunat_cpe','rls','sunat_envios',''),
    ('20261125_sunat_cpe','tabla','sunat_cpe',''),
    ('20261125_sunat_cpe','tabla','sunat_envios',''),
    ('20261127_modulo_ventas','politica','almacen_escribir_ventas','public.almacen'),
    ('20261127_modulo_ventas','politica','condiciones_pago_escribir_ventas','public.condiciones_pago'),
    ('20261127_modulo_ventas','politica','ventas_escribir_ventas','public.ventas'),
    ('20261128_chat_global','bucket','chat-adjuntos',''),
    ('20261128_chat_global','columna','chat_mensajes','adjunto_bytes'),
    ('20261128_chat_global','columna','chat_mensajes','adjunto_mime'),
    ('20261128_chat_global','columna','chat_mensajes','adjunto_nombre'),
    ('20261128_chat_global','columna','chat_mensajes','adjunto_path'),
    ('20261128_chat_global','columna','chat_mensajes','fijado'),
    ('20261128_chat_global','columna','chat_mensajes','fijado_en'),
    ('20261128_chat_global','columna','chat_mensajes','fijado_por'),
    ('20261128_chat_global','columna','chat_mensajes','tipo'),
    ('20261128_chat_global','funcion','chat_fijar',''),
    ('20261128_chat_global','politica','chat_adjuntos_leer','storage.objects'),
    ('20261128_chat_global','politica','chat_adjuntos_subir','storage.objects'),
    ('20261128_chat_global','politica','chat_leidos_propio','public.chat_leidos'),
    ('20261128_chat_global','rls','chat_leidos',''),
    ('20261128_chat_global','tabla','chat_leidos',''),
    ('20261129_secocha_submodulos','funcion','siguiente_numero_sede',''),
    ('20261129_secocha_submodulos','politica','contadores_sede_select','public.contadores_sede'),
    ('20261129_secocha_submodulos','politica','sucursal_escribir_sede','public.sucursal'),
    ('20261129_secocha_submodulos','politica','sucursal_select_sede','public.sucursal'),
    ('20261129_secocha_submodulos','rls','contadores_sede',''),
    ('20261129_secocha_submodulos','tabla','contadores_sede',''),
    ('20261201_secocha_fase2','columna','notificaciones','sede_id'),
    ('20261201_secocha_fase2','politica','sede_isolation','public.notificaciones'),
    ('20261202_secocha_sunat','politica','sede_isolation','public.sunat_cpe'),
    ('20261202_secocha_sunat','politica','sede_isolation','public.sunat_envios'),
    ('20261203_activos_empresa','vista','v_activos_fijos',''),
    ('20261203_base_proveedores_clientes','funcion','conservar_sede_base',''),
    ('20261203_base_proveedores_clientes','politica','compras_base_proveedores_escribir','public.compras'),
    ('20261203_base_proveedores_clientes','politica','compras_base_proveedores_select','public.compras'),
    ('20261203_base_proveedores_clientes','politica','sede_isolation','public.compras'),
    ('20261203_base_proveedores_clientes','politica','sede_isolation','public.ventas'),
    ('20261203_base_proveedores_clientes','politica','ventas_base_clientes_escribir','public.ventas'),
    ('20261203_base_proveedores_clientes','politica','ventas_base_clientes_select','public.ventas'),
    ('20261203_categorias_productos','columna','productos_categorias','clave'),
    ('20261203_categorias_productos','funcion','categoria_sugerida',''),
    ('20261203_categorias_productos','funcion','categoria_texto',''),
    ('20261203_categorias_productos','funcion','productos_categorias_renombrar',''),
    ('20261203_categorias_productos','funcion','productos_maestro_categoria',''),
    ('20261203_categorias_productos','politica','productos_categorias_admin','public.productos_categorias'),
    ('20261203_categorias_productos','politica','productos_categorias_select','public.productos_categorias'),
    ('20261203_categorias_productos','rls','productos_categorias',''),
    ('20261203_categorias_productos','tabla','productos_categorias',''),
    ('20261204_costo_produccion','funcion','pc_anular_item',''),
    ('20261204_costo_produccion','funcion','pc_audit_encadenar',''),
    ('20261204_costo_produccion','funcion','pc_audit_texto',''),
    ('20261204_costo_produccion','funcion','pc_auditar',''),
    ('20261204_costo_produccion','funcion','pc_catalogo_maquinas',''),
    ('20261204_costo_produccion','funcion','pc_catalogo_stock',''),
    ('20261204_costo_produccion','funcion','pc_catalogo_trabajadores',''),
    ('20261204_costo_produccion','funcion','pc_costo_hora',''),
    ('20261204_costo_produccion','funcion','pc_crear_orden',''),
    ('20261204_costo_produccion','funcion','pc_dep_hora',''),
    ('20261204_costo_produccion','funcion','pc_exigir',''),
    ('20261204_costo_produccion','funcion','pc_flujo',''),
    ('20261204_costo_produccion','funcion','pc_guardar',''),
    ('20261204_costo_produccion','funcion','pc_guardar_config',''),
    ('20261204_costo_produccion','funcion','pc_hash_costo',''),
    ('20261204_costo_produccion','funcion','pc_hash_item',''),
    ('20261204_costo_produccion','funcion','pc_inmutable',''),
    ('20261204_costo_produccion','funcion','pc_ip',''),
    ('20261204_costo_produccion','funcion','pc_item_json',''),
    ('20261204_costo_produccion','funcion','pc_notificar',''),
    ('20261204_costo_produccion','funcion','pc_nueva_version',''),
    ('20261204_costo_produccion','funcion','pc_ops_disponibles',''),
    ('20261204_costo_produccion','funcion','pc_puede_facturar',''),
    ('20261204_costo_produccion','funcion','pc_puede_leer',''),
    ('20261204_costo_produccion','funcion','pc_recalcular',''),
    ('20261204_costo_produccion','funcion','pc_registrar_pdf',''),
    ('20261204_costo_produccion','funcion','pc_sha256',''),
    ('20261204_costo_produccion','funcion','pc_sincronizar',''),
    ('20261204_costo_produccion','funcion','pc_sincronizar_todas',''),
    ('20261204_costo_produccion','funcion','pc_snapshot_precio',''),
    ('20261204_costo_produccion','funcion','pc_solo_rpc',''),
    ('20261204_costo_produccion','funcion','pc_stock',''),
    ('20261204_costo_produccion','funcion','pc_ultimo_ingreso',''),
    ('20261204_costo_produccion','funcion','pc_verificar',''),
    ('20261204_costo_produccion','funcion','pc_yo',''),
    ('20261204_costo_produccion','tabla','production_cost_approvals',''),
    ('20261204_costo_produccion','tabla','production_cost_audit_log',''),
    ('20261204_costo_produccion','tabla','production_cost_config',''),
    ('20261204_costo_produccion','tabla','production_cost_items',''),
    ('20261204_costo_produccion','tabla','production_cost_versions',''),
    ('20261204_costo_produccion','tabla','production_costs',''),
    ('20261204_costo_produccion','tabla','production_material_prices',''),
    ('20261204_costo_produccion','tabla','production_orders',''),
    ('20261204_gestion_documentaria','bucket','gestion-documental',''),
    ('20261204_gestion_documentaria','funcion','gd_archivar',''),
    ('20261204_gestion_documentaria','funcion','gd_asegurar_aprobadores',''),
    ('20261204_gestion_documentaria','funcion','gd_audit_encadenar',''),
    ('20261204_gestion_documentaria','funcion','gd_audit_hash',''),
    ('20261204_gestion_documentaria','funcion','gd_auditoria_buscar',''),
    ('20261204_gestion_documentaria','funcion','gd_auditoria_documento',''),
    ('20261204_gestion_documentaria','funcion','gd_autorizar_archivo',''),
    ('20261204_gestion_documentaria','funcion','gd_crear_ronda',''),
    ('20261204_gestion_documentaria','funcion','gd_detalle',''),
    ('20261204_gestion_documentaria','funcion','gd_dispositivo_cliente',''),
    ('20261204_gestion_documentaria','funcion','gd_documents_campos_fijos',''),
    ('20261204_gestion_documentaria','funcion','gd_editar_datos',''),
    ('20261204_gestion_documentaria','funcion','gd_enviar_revision',''),
    ('20261204_gestion_documentaria','funcion','gd_foto',''),
    ('20261204_gestion_documentaria','funcion','gd_ip_cliente',''),
    ('20261204_gestion_documentaria','funcion','gd_listar',''),
    ('20261204_gestion_documentaria','funcion','gd_log',''),
    ('20261204_gestion_documentaria','funcion','gd_marcar_vencidos',''),
    ('20261204_gestion_documentaria','funcion','gd_mis_pendientes',''),
    ('20261204_gestion_documentaria','funcion','gd_nivel',''),
    ('20261204_gestion_documentaria','funcion','gd_nivel_permiso',''),
    ('20261204_gestion_documentaria','funcion','gd_nombre_de',''),
    ('20261204_gestion_documentaria','funcion','gd_notificar_rol',''),
    ('20261204_gestion_documentaria','funcion','gd_notificar_usuario',''),
    ('20261204_gestion_documentaria','funcion','gd_prefijo',''),
    ('20261204_gestion_documentaria','funcion','gd_prohibir_cambio',''),
    ('20261204_gestion_documentaria','funcion','gd_puede_subir_en',''),
    ('20261204_gestion_documentaria','funcion','gd_registrar_documento',''),
    ('20261204_gestion_documentaria','funcion','gd_registrar_evento',''),
    ('20261204_gestion_documentaria','funcion','gd_registrar_integridad',''),
    ('20261204_gestion_documentaria','funcion','gd_registrar_version',''),
    ('20261204_gestion_documentaria','funcion','gd_reporte_vencimientos',''),
    ('20261204_gestion_documentaria','funcion','gd_resolver',''),
    ('20261204_gestion_documentaria','funcion','gd_restaurar_archivo',''),
    ('20261204_gestion_documentaria','funcion','gd_restaurar_version',''),
    ('20261204_gestion_documentaria','funcion','gd_rol_de',''),
    ('20261204_gestion_documentaria','funcion','gd_set_permiso',''),
    ('20261204_gestion_documentaria','funcion','gd_siguiente_codigo',''),
    ('20261204_gestion_documentaria','funcion','gd_verificar_cadena',''),
    ('20261204_gestion_documentaria','politica','gd_audit_ver','public.audit_log'),
    ('20261204_gestion_documentaria','politica','gd_documents_ver','public.documents'),
    ('20261204_gestion_documentaria','politica','gd_permisos_ver','public.document_permissions'),
    ('20261204_gestion_documentaria','politica','gd_versions_ver','public.document_versions'),
    ('20261204_gestion_documentaria','politica','gd_workflow_ver','public.approval_workflow'),
    ('20261204_gestion_documentaria','rls','approval_workflow',''),
    ('20261204_gestion_documentaria','rls','audit_log',''),
    ('20261204_gestion_documentaria','rls','document_permissions',''),
    ('20261204_gestion_documentaria','rls','document_versions',''),
    ('20261204_gestion_documentaria','rls','documents',''),
    ('20261204_gestion_documentaria','rls','gd_correlativos',''),
    ('20261204_gestion_documentaria','tabla','approval_workflow',''),
    ('20261204_gestion_documentaria','tabla','audit_log',''),
    ('20261204_gestion_documentaria','tabla','document_permissions',''),
    ('20261204_gestion_documentaria','tabla','document_versions',''),
    ('20261204_gestion_documentaria','tabla','documents',''),
    ('20261204_gestion_documentaria','tabla','gd_correlativos',''),
    ('20261205_costo_por_modelo','funcion','pc_modelo_familia',''),
    ('20261205_costo_por_modelo','funcion','pc_modelos_disponibles',''),
    ('20261206_permiso_editar_req_lizbeth','columna','perfiles','permisos'),
    ('20261206_permiso_editar_req_lizbeth','funcion','compras_req_permiso_editar',''),
    ('20261206_permiso_editar_req_lizbeth','funcion','compras_req_zz_auditar_edicion',''),
    ('20261206_permiso_editar_req_lizbeth','funcion','req_contenido',''),
    ('20261206_permiso_editar_req_lizbeth','funcion','tiene_permiso',''),
    ('20261206_permiso_editar_req_lizbeth','politica','req_ediciones_select','public.req_ediciones'),
    ('20261206_permiso_editar_req_lizbeth','rls','req_ediciones',''),
    ('20261206_permiso_editar_req_lizbeth','tabla','req_ediciones',''),
    ('20261222_sunat_homologacion','funcion','cpe_items_fiscales',''),
    ('20261222_sunat_homologacion','funcion','cpe_solo_insercion',''),
    ('20261222_sunat_homologacion','funcion','proteger_comprobante',''),
    ('20261222_sunat_homologacion','funcion','sunat_cpe_no_borrar',''),
    ('20261222_sunat_homologacion','politica','cpe_auditoria_select','public.cpe_auditoria'),
    ('20261222_sunat_homologacion','rls','cpe_auditoria',''),
    ('20261222_sunat_homologacion','tabla','cpe_auditoria',''),
    ('20261224_dni_validados','politica','dni_validados_leer','public.dni_validados'),
    ('20261224_dni_validados','rls','dni_validados',''),
    ('20261224_dni_validados','tabla','dni_validados',''),
    ('20261225_precios_venta','funcion','pv_antes',''),
    ('20261225_precios_venta','funcion','pv_costos_modelos',''),
    ('20261225_precios_venta','funcion','pv_historial',''),
    ('20261225_precios_venta','funcion','pv_historial_inmutable',''),
    ('20261225_precios_venta','funcion','pv_puede_editar',''),
    ('20261225_precios_venta','funcion','pv_usuario',''),
    ('20261225_precios_venta','politica','precios_venta_editar','public.precios_venta'),
    ('20261225_precios_venta','politica','precios_venta_historial_leer','public.precios_venta_historial'),
    ('20261225_precios_venta','politica','precios_venta_insertar','public.precios_venta'),
    ('20261225_precios_venta','politica','precios_venta_leer','public.precios_venta'),
    ('20261225_precios_venta','rls','precios_venta',''),
    ('20261225_precios_venta','rls','precios_venta_historial',''),
    ('20261225_precios_venta','tabla','precios_venta',''),
    ('20261225_precios_venta','tabla','precios_venta_historial','')
),
-- Migraciones que solo modifican funciones/políticas existentes: se reconocen
-- por un texto que dejan dentro de la función o política.
firmas(migracion, tipo, objeto, patron) as (values
    ('20261021_tesoreria_edita_planilla', 'politica', 'planilla.planilla_escribir', 'tesoreria'),
    ('20261101_tesoreria_cierra_planilla', 'funcion', 'cerrar_planilla', 'tesoreria'),
    ('20261109_retiro_motivo_produccion', 'funcion', 'retiro_produccion', 'motivo_produccion_libre'),
    ('20261130_secocha_erp_completo', 'funcion', 'siguiente_numero_sede', 'siguiente_numero_sede'),
    ('20261207_gd_historia_procesos', 'funcion', 'gd_registrar_evento', 'CONSULTAR_HISTORIA'),
    ('20261218_series_f005_b005', 'funcion', 'siguiente_numero', 'F005'),
    ('20261219_serie_t005_guias', 'funcion', 'siguiente_numero', 'T005'),
    ('20261220_boletas_numeracion', 'funcion', 'siguiente_numero', '^BOL_'),
    ('20261223_series_006', 'funcion', 'siguiente_numero', 'F006')
),
-- Migraciones que tocan permisos/seguridad: si faltan, la severidad sube.
migr_seguridad(migracion) as (values
    ('20261021_sprint1_seguridad'), ('20261102_login_intentos'), ('20261023_sedes_multisede'),
    ('20261106_perfiles_asignacion'), ('20261109_rbac_op_gerencia'), ('20261113_bucket_guias'),
    ('20261127_modulo_ventas'), ('20261222_sunat_homologacion'), ('20261204_gestion_documentaria'),
    ('20261206_permiso_editar_req_lizbeth'), ('20261111_ruc_validados'), ('20261224_dni_validados')
),
-- Políticas "permitir todo" que borró 20261021_sprint1_seguridad: no deberían existir.
politicas_prohibidas(tabla, politica) as (values
    ('planilla', 'permitir todo select'), ('planilla', 'permitir todo insert'), ('planilla', 'permitir todo update'),
    ('planilla', 'planilla_leer'), ('planilla_historial', 'permitir todo'), ('planilla_historial_detalle', 'permitir todo'),
    ('ventas', 'permitir todo'), ('almacen', 'Allow all'), ('movimientos_almacen', 'Allow all'),
    ('gastos', 'gastos por empresa'), ('condiciones_pago', 'permitir todo'),
    ('asistencia_creador', 'permitir todo select'), ('asistencia_creador', 'permitir todo insert'),
    ('asistencia_creador', 'permitir todo update'), ('asistencia_creador', 'permitir todo delete'),
    ('perfiles', 'perfiles_all_auth'), ('perfiles', 'perfiles_select_all'), ('perfiles', 'perfiles_select'),
    ('adelantos', 'adelantos todo')
),
-- Tablas con datos sensibles: una lectura abierta aquí pesa más.
sensibles(tabla) as (values
    ('planilla'), ('planilla_historial'), ('planilla_historial_detalle'), ('perfiles'), ('adelantos'),
    ('gastos'), ('ventas'), ('cajas'), ('contable'), ('compras'), ('asistencia_creador'), ('login_intentos'),
    ('sunat_cpe'), ('sunat_envios'), ('cpe_auditoria'), ('audit_log'), ('documents'), ('document_versions'),
    ('production_costs'), ('production_cost_items'), ('precios_venta'), ('usuarios_sedes')
),
buckets_privados(id) as (values
    ('tesoreria'), ('cotizaciones'), ('guias'), ('chat-adjuntos'), ('gestion-documental'), ('gastos-comprobantes')
),
roles_validos(rol) as (values
    ('creador'), ('soporte'), ('tesoreria'), ('almacen'), ('logistica'), ('produccion'), ('gerencia'),
    ('planilla'), ('sucursal'), ('ventas'), ('admin_sede'), ('finanzas'), ('ingenieria')
),

-- ---------------------------------------------------------------------
-- Datos base
-- ---------------------------------------------------------------------
tablas as (
  select c.oid, c.relname as tabla, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forzado,
         has_table_privilege('anon', c.oid, 'SELECT') as anon_lee,
         (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
           or has_table_privilege('anon', c.oid, 'DELETE')) as anon_escribe,
         has_table_privilege('authenticated', c.oid, 'SELECT') as auth_lee,
         (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE')
           or has_table_privilege('authenticated', c.oid, 'DELETE')) as auth_escribe,
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as n_politicas
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
),
pol as (
  select p.*,
         (p.roles && array['anon', 'public']::name[]) as abre_anon,
         (p.roles && array['authenticated']::name[]) as abre_auth,
         lower(regexp_replace(coalesce(p.qual, ''), '[\s()]', '', 'g')) = 'true' as using_true,
         lower(regexp_replace(coalesce(p.with_check, ''), '[\s()]', '', 'g')) = 'true' as check_true
  from pg_policies p
  where p.schemaname in ('public', 'storage') and p.permissive = 'PERMISSIVE'
),
funcs as (
  select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '') as config,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ejecuta,
         p.prorettype = 'trigger'::regtype as es_trigger
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
estado_esperado as (
  select e.*,
    case e.tipo
      when 'tabla'    then to_regclass('public.' || quote_ident(e.objeto)) is not null
      when 'vista'    then to_regclass('public.' || quote_ident(e.objeto)) is not null
      when 'funcion'  then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'public' and p.proname = e.objeto)
      when 'politica' then exists (select 1 from pg_policies p where p.schemaname = split_part(e.detalle, '.', 1)
                                   and p.tablename = split_part(e.detalle, '.', 2) and p.policyname = e.objeto)
      when 'columna'  then exists (select 1 from information_schema.columns c where c.table_schema = 'public'
                                   and c.table_name = e.objeto and c.column_name = e.detalle)
      when 'bucket'   then exists (select 1 from storage.buckets b where b.id = e.objeto)
      when 'rls'      then coalesce((select c.relrowsecurity from pg_class c
                                     where c.oid = to_regclass('public.' || quote_ident(e.objeto))), false)
    end as existe
  from esperado e
  union all
  select f.migracion, 'firma', f.objeto, f.patron,
    case f.tipo
      when 'funcion' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname = 'public' and p.proname = f.objeto
                                    and strpos(pg_get_functiondef(p.oid), f.patron) > 0)
      when 'politica' then exists (select 1 from pg_policies p where p.schemaname = 'public'
                                   and p.tablename = split_part(f.objeto, '.', 1) and p.policyname = split_part(f.objeto, '.', 2)
                                   and strpos(coalesce(p.qual, '') || coalesce(p.with_check, ''), f.patron) > 0)
    end
  from firmas f
),
por_migracion as (
  select migracion, count(*) as total, count(*) filter (where existe) as hay,
         string_agg(case when not existe then tipo || ' ' || objeto || case when detalle <> '' then ' (' || detalle || ')' else '' end end,
                    ', ' order by tipo, objeto) as faltan
  from estado_esperado group by migracion
),
perf as (
  select to_jsonb(p) as j, p.id from public.perfiles p
),
usuarios as (
  select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
         to_jsonb(u) ->> 'is_anonymous' as es_anonimo, u.banned_until
  from auth.users u
),

-- ---------------------------------------------------------------------
-- Hallazgos
-- ---------------------------------------------------------------------
hallazgos(severidad, seccion, objeto, detalle, que_hacer) as (

  -- 1. Tablas sin RLS
  select case when t.anon_lee or t.anon_escribe then 'CRITICO'
              when t.auth_lee or t.auth_escribe then 'ALTO' else 'BAJO' end,
         '1. Tabla sin RLS', 'public.' || t.tabla,
         'RLS apagado. ' ||
         case when t.anon_lee or t.anon_escribe
              then 'Cualquiera con la clave pública (la que va en la web) puede ' ||
                   case when t.anon_escribe then 'LEER y MODIFICAR' else 'LEER' end || ' esta tabla sin iniciar sesión.'
              when t.auth_lee or t.auth_escribe then 'Cualquier usuario logueado del ERP la puede leer/modificar entera.'
              else 'Sin permisos para anon/authenticated (no expuesta por la API).' end ||
         case when t.tabla ~ 'respaldo|backup|_bak|_old' then ' Parece una copia de respaldo.' else '' end,
         case when t.tabla ~ 'respaldo|backup|_bak|_old'
              then 'Si ya no se usa: revoke all on public.' || quote_ident(t.tabla) || ' from anon, authenticated; (o borrarla).'
              else 'Activar RLS CON sus políticas (si solo se activa, el ERP deja de ver la tabla). Enviar este resultado y se prepara el SQL.' end
  from tablas t where not t.rls

  -- 2. RLS activo pero sin ninguna política (bloqueada para la app)
  union all
  select 'INFO', '2. RLS sin políticas', 'public.' || t.tabla,
         'RLS activo y 0 políticas: la app no la puede leer ni escribir directo (solo funciones SECURITY DEFINER).',
         'Normal en login_intentos y tablas internas. Si una pantalla del ERP sale vacía, es por esto.'
  from tablas t where t.rls and t.n_politicas = 0

  -- 3. Políticas permisivas
  union all
  select case when p.abre_anon and (p.using_true or p.check_true) then 'CRITICO'
              when p.abre_auth and (p.using_true or p.check_true) and p.cmd <> 'SELECT' then 'ALTO'
              when p.abre_auth and p.using_true and (p.tablename in (select tabla from sensibles) or p.schemaname = 'storage') then 'ALTO'
              when p.abre_auth and p.using_true then 'MEDIO'
              else 'BAJO' end,
         '3. Política permisiva', p.schemaname || '.' || p.tablename || ' · "' || p.policyname || '"',
         p.cmd || ' para ' || array_to_string(p.roles, ',') ||
         case when p.using_true then ' · USING (true)' else '' end ||
         case when p.check_true then ' · WITH CHECK (true)' else '' end ||
         case when not (p.using_true or p.check_true) then ' · aplica también a visitantes sin sesión: ' || left(coalesce(p.qual, p.with_check, ''), 120) else '' end,
         case when p.abre_anon and (p.using_true or p.check_true)
              then 'Abierta a Internet. Cambiar a "to authenticated" con una condición de rol (mi_rol()/puede_ver()).'
              when p.using_true or p.check_true
              then 'Cualquier usuario logueado pasa. Reemplazar (true) por la condición de rol del módulo.'
              else 'Mejor "to authenticated" en vez de public/anon (revisar que la condición use auth.uid() o mi_rol()).' end
  from pol p
  where (p.abre_anon or ((p.using_true or p.check_true) and p.abre_auth))
    and not (p.abre_anon and not (p.using_true or p.check_true)
             and coalesce(p.qual, '') || coalesce(p.with_check, '') ~ '(auth\.uid|auth\.jwt|mi_rol|puede_ver|auth\.role)')

  -- 3b. Políticas "permitir todo" que el Sprint 1 debía haber borrado
  union all
  select 'CRITICO', '3b. Política vieja que debía estar borrada', 'public.' || pp.tabla || ' · "' || pp.politica || '"',
         'Sigue existiendo una política que 20261021_sprint1_seguridad.sql borra (abría la tabla a todos).',
         'drop policy if exists "' || pp.politica || '" on public.' || quote_ident(pp.tabla) || ';  (antes, confirmar que la tabla tiene sus políticas nuevas)'
  from politicas_prohibidas pp
  where exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = pp.tabla and p.policyname = pp.politica)

  -- 3c. perfiles: ¿un usuario puede cambiarse el rol?
  union all
  select case when p.abre_anon or p.using_true or p.check_true
                   or coalesce(p.qual, '') || coalesce(p.with_check, '') !~ '(mi_rol|creador|soporte)' then 'CRITICO' else 'INFO' end,
         '3c. Escritura en perfiles', 'public.perfiles · "' || p.policyname || '"',
         p.cmd || ' para ' || array_to_string(p.roles, ',') || ' · USING ' || coalesce(p.qual, '-') || ' · CHECK ' || coalesce(p.with_check, '-'),
         'Solo Soporte/creador debe poder escribir perfiles; si un usuario puede editar su propia fila, se puede subir el rol a creador.'
  from pol p
  where p.schemaname = 'public' and p.tablename = 'perfiles' and p.cmd in ('ALL', 'INSERT', 'UPDATE')

  -- 4. Funciones SECURITY DEFINER sin search_path fijo
  union all
  select 'ALTO', '4. SECURITY DEFINER sin search_path', 'public.' || f.proname || '(' || f.args || ')',
         'Corre con permisos del dueño y sin search_path fijo: se puede secuestrar con objetos en otro esquema.',
         'alter function public.' || quote_ident(f.proname) || '(' || f.args || ') set search_path = public;'
  from funcs f where f.prosecdef and f.config not like '%search_path=%'

  -- 5. Funciones SECURITY DEFINER que puede ejecutar un visitante sin sesión
  union all
  select 'OK', '5. SECURITY DEFINER ejecutable sin sesión', 'public.' || f.proname || '(' || f.args || ')',
         'Esperado: el login la usa antes de iniciar sesión (no revela datos).', '-'
  from funcs f where f.prosecdef and f.anon_ejecuta and f.proname in ('login_bloqueo', 'login_fallido', 'email_de_login')
  union all
  select 'MEDIO', '5. SECURITY DEFINER ejecutable sin sesión', count(*) || ' funciones',
         string_agg(f.proname || '(' || f.args || ')', ', ' order by f.proname),
         'Un visitante con la clave pública puede llamarlas por /rpc y saltan el RLS (si adentro no validan mi_rol()). ' ||
         'Revocar a anon y public las que no sean del login: revoke execute on function public.NOMBRE(args) from public, anon;'
  from funcs f where f.prosecdef and f.anon_ejecuta and not f.es_trigger and f.proname not in ('login_bloqueo', 'login_fallido', 'email_de_login')
  having count(*) > 0

  -- 6. mi_rol() no debe devolver 'creador' por defecto
  union all
  select case when strpos(pg_get_functiondef(f.oid), 'sin_rol') > 0 then 'OK' else 'CRITICO' end,
         '6. mi_rol()', 'public.mi_rol()',
         case when strpos(pg_get_functiondef(f.oid), 'sin_rol') > 0 then 'Usuario sin perfil = sin_rol (correcto).'
              else 'mi_rol() no usa sin_rol: un usuario sin perfil podría quedar como creador (admin).' end,
         case when strpos(pg_get_functiondef(f.oid), 'sin_rol') > 0 then '-'
              else 'Correr la TAREA 1 de supabase/migrations/20261021_sprint1_seguridad.sql.' end
  from funcs f where f.proname = 'mi_rol' and f.args = ''
  union all
  select 'CRITICO', '6. mi_rol()', 'public.mi_rol()', 'No existe la función mi_rol(): las políticas por rol no pueden funcionar.',
         'Correr supabase/mi_rol_seguro.sql y luego 20261021_sprint1_seguridad.sql.'
  where not exists (select 1 from funcs f where f.proname = 'mi_rol')
  union all
  select 'ALTO', '6. mi_rol()', 'public.mi_rol()', 'Un visitante sin sesión puede ejecutar mi_rol().',
         'revoke execute on function public.mi_rol() from public, anon;'
  from funcs f where f.proname = 'mi_rol' and f.args = '' and f.anon_ejecuta

  -- 7. Vistas que saltan el RLS
  union all
  select case when has_table_privilege('anon', c.oid, 'SELECT') then 'CRITICO' else 'ALTO' end,
         '7. Vista sin security_invoker', 'public.' || c.relname,
         'La vista corre con permisos del dueño (postgres) y NO respeta el RLS de sus tablas. ' ||
         case when has_table_privilege('anon', c.oid, 'SELECT') then 'Visible sin iniciar sesión.' else 'Cualquier usuario logueado ve todo.' end,
         'alter view public.' || quote_ident(c.relname) || ' set (security_invoker = true);'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce(c.reloptions::text[] && array['security_invoker=true', 'security_invoker=on', 'security_invoker=1'], false)
    and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  union all
  select 'MEDIO', '7. Vista materializada expuesta', 'public.' || c.relname,
         'Las vistas materializadas no tienen RLS y la API las expone.',
         'revoke select on public.' || quote_ident(c.relname) || ' from anon, authenticated;'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'm'
    and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))

  -- 8. Storage
  union all
  select case when b.id in (select id from buckets_privados) then 'CRITICO' else 'ALTO' end,
         '8. Bucket público', 'storage.buckets · ' || b.id,
         'Bucket PÚBLICO: cualquiera con el enlace descarga los archivos sin iniciar sesión.',
         'update storage.buckets set public = false where id = ''' || b.id || ''';  (revisar antes que la web no use enlaces públicos)'
  from storage.buckets b where b.public
  union all
  select 'BAJO', '8. Bucket sin límite de tamaño', 'storage.buckets · ' || b.id,
         'Sin file_size_limit: se pueden subir archivos de cualquier tamaño.',
         'update storage.buckets set file_size_limit = 26214400 where id = ''' || b.id || ''';  (25 MB)'
  from storage.buckets b where b.file_size_limit is null
  union all
  select 'OK', '8. Buckets', count(*) || ' buckets',
         string_agg(b.id || case when b.public then ' (PÚBLICO)' else ' (privado)' end, ', ' order by b.id), '-'
  from storage.buckets b

  -- 9. Privilegios de roles de la API
  union all
  select 'CRITICO', '9. Rol de la API salta RLS', r.rolname::text, 'El rol ' || r.rolname || ' tiene BYPASSRLS o es superusuario.',
         'alter role ' || r.rolname || ' nobypassrls;'
  from pg_roles r where r.rolname in ('anon', 'authenticated') and (r.rolbypassrls or r.rolsuper)
  union all
  select 'BAJO', '9. Rol de base de datos no estándar', r.rolname::text,
         'Rol con LOGIN que no es de Supabase' || case when r.rolbypassrls then ' y con BYPASSRLS' else '' end || '.',
         '¿Lo creó alguien a propósito? Si no se usa: alter role ' || quote_ident(r.rolname) || ' nologin;'
  from pg_roles r
  where r.rolcanlogin and r.rolname !~ '^(supabase|pg_|pgsodium|cli_login_)'
    and r.rolname not in ('postgres', 'authenticator', 'pgbouncer', 'dashboard_user', 'service_role', 'anon', 'authenticated')
  union all
  select 'INFO', '9. Permisos de anon en tablas',
         count(*) filter (where t.anon_lee or t.anon_escribe) || ' de ' || count(*) || ' tablas',
         'Tablas donde el rol anon (sin sesión) tiene permiso. Es lo normal en Supabase: lo que protege es el RLS (sección 1).',
         'Opcional, más estricto: revoke all on all tables in schema public from anon;  (probar el login antes)'
  from tablas t

  -- 10. Extensiones en el esquema public
  union all
  select 'BAJO', '10. Extensión en public', e.extname::text, 'Extensión instalada en el esquema public (Security Advisor lo marca).',
         'Moverla a "extensions" desde Database → Extensions (no urgente).'
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where n.nspname = 'public' and e.extname <> 'plpgsql'

  -- 11. Migraciones del repo aplicadas o no
  union all
  select case when m.hay = m.total then 'OK'
              when m.migracion in (select migracion from migr_seguridad) then 'ALTO'
              else 'MEDIO' end,
         '11. Migración del repo', m.migracion,
         case when m.hay = m.total then 'Aplicada (' || m.hay || '/' || m.total || ' objetos).'
              when m.hay = 0 then 'NO aplicada (0/' || m.total || '). Faltan: ' || left(m.faltan, 400)
              else 'Parcial (' || m.hay || '/' || m.total || '). Faltan: ' || left(m.faltan, 400) end,
         case when m.hay = m.total then '-'
              else 'Correr supabase/migrations/' || m.migracion || '.sql (de main) en el SQL Editor, en orden de fecha.' end
  from por_migracion m
  union all
  select 'INFO', '11. Migración del repo', x.m,
         'No se puede comprobar desde la base (solo cambia datos, índices o funciones ya existentes).', 'Confirmar en el historial si se corrió.'
  from (values ('20261021_sprint2_quitar_base64'), ('20261021_sprint2_velocidad'), ('20261025_productos_solicitudes_mapping'),
               ('20261028_ventas_secocha'), ('20261121_fuentes_pago'), ('20261122_limpiar_dj_con_comprobante')) x(m)

  -- 12. Usuarios y perfiles
  union all
  select 'MEDIO', '12. Rol desconocido', coalesce(p.j ->> 'usuario', p.id::text),
         'perfiles.rol = "' || coalesce(p.j ->> 'rol', '(vacío)') || '": no es un rol del ERP (tampoco en minúscula).',
         'Corregir el rol en minúscula (creador, tesoreria, almacen, logistica, produccion, gerencia, planilla, ventas, sucursal...).'
  from perf p where coalesce(p.j ->> 'rol', '') not in (select rol from roles_validos)
  union all
  select case when coalesce(p.j ->> 'rol', '') in ('creador', 'soporte') or upper(coalesce(p.j ->> 'modulo_asignado', '')) = 'SECOCHA'
              then 'INFO' else 'ALTO' end,
         '12. Acceso total (modulos *)', coalesce(p.j ->> 'usuario', p.id::text),
         'rol ' || coalesce(p.j ->> 'rol', '-') || ' con modulos = * y ' ||
         case when coalesce((p.j ->> 'solo_lectura')::boolean, false) then 'solo lectura' else 'PUEDE EDITAR' end ||
         coalesce(' · modulo_asignado ' || (p.j ->> 'modulo_asignado'), ''),
         case when coalesce(p.j ->> 'rol', '') in ('creador', 'soporte') then 'Esperado: Soporte es el único administrador.'
              when upper(coalesce(p.j ->> 'modulo_asignado', '')) = 'SECOCHA' then 'Esperado para el administrador de Secocha (limitado a su sede por RLS).'
              else 'Regla RBAC: solo Soporte es admin. Dejarle solo la ruta de su módulo.' end
  from perf p
  where p.j -> 'modulos' ? '*' and not (coalesce((p.j ->> 'solo_lectura')::boolean, false) and p.j ->> 'rol' = 'gerencia')
  union all
  select 'BAJO', '12. Usuario sin perfil', u.email::text,
         'Existe en Auth pero no en perfiles: entra como sin_rol (no ve nada). Último ingreso: ' || coalesce(u.last_sign_in_at::date::text, 'nunca') || '.',
         'Crearle su perfil o borrarlo en Authentication → Users si no se usa.'
  from usuarios u where not exists (select 1 from perf p where p.id = u.id)
  union all
  select 'BAJO', '12. Perfil sin usuario', coalesce(p.j ->> 'usuario', p.id::text),
         'Fila en perfiles cuyo usuario ya no existe en Auth.', 'Se puede borrar esa fila de perfiles.'
  from perf p where not exists (select 1 from usuarios u where u.id = p.id)
  union all
  select 'ALTO', '12. Usuario anónimo', coalesce(u.email, u.id::text),
         'Usuario creado con "Anonymous sign-in": cualquiera puede obtener sesión sin cuenta.',
         'Desactivar Anonymous sign-ins en Authentication → Sign In / Providers y borrar estos usuarios.'
  from usuarios u where u.es_anonimo = 'true'
  union all
  select 'MEDIO', '12. Correo fuera de la empresa', u.email,
         'Usuario del ERP con correo que no es @comboyvid.local / @comboyvid.com. Último ingreso: ' || coalesce(u.last_sign_in_at::date::text, 'nunca') || '.',
         '¿Lo reconoces? Si no, bórralo en Authentication → Users.'
  from usuarios u where coalesce(u.es_anonimo, 'false') <> 'true' and u.email !~* '@comboyvid\.(local|com)$'
  union all
  select 'INFO', '12. Usuario inactivo', u.email,
         'Sin ingresar desde ' || coalesce(u.last_sign_in_at::date::text, 'nunca') || '.',
         'Si ya no trabaja aquí: Authentication → Users → Ban user o borrar.'
  from usuarios u
  where (u.last_sign_in_at is null or u.last_sign_in_at < now() - interval '90 days')
    and (u.banned_until is null or u.banned_until < now())
  union all
  select 'INFO', '12. Usuarios del ERP', count(*) || ' usuarios',
         string_agg(coalesce(u.email, '?') || ' [' || coalesce(p.j ->> 'rol', 'sin perfil') || ']', ', ' order by u.email), '-'
  from usuarios u left join perf p on p.id = u.id

  -- 13. Tabla de bloqueo de login
  union all
  select 'CRITICO', '13. login_intentos legible', 'public.login_intentos',
         'Un visitante o usuario puede leer la tabla de intentos fallidos.',
         'revoke all on public.login_intentos from anon, authenticated;'
  from tablas t where t.tabla = 'login_intentos' and (t.anon_lee or t.auth_lee)
)

select row_number() over (order by
         array_position(array['CRITICO', 'ALTO', 'MEDIO', 'BAJO', 'INFO', 'OK'], h.severidad),
         substring(h.seccion from '^[0-9]+')::int, h.seccion, h.objeto) as n,
       h.severidad, h.seccion, h.objeto, h.detalle, h.que_hacer
from hallazgos h
order by n;
