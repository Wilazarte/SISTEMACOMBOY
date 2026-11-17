-- Prueba LOCAL de la Gestión Documentaria (no correr en Supabase): ver gestion_documentaria_stub.sql.
-- Recorre los 5 flujos, el límite de 5 descargas, archivado, inmutabilidad y la cadena de hash.
\set ON_ERROR_STOP 1
\set ALM '00000000-0000-0000-0000-000000000001'
\set GER '00000000-0000-0000-0000-000000000002'
\set SOP '00000000-0000-0000-0000-000000000003'
\set VEN '00000000-0000-0000-0000-000000000004'
-- Flujo 1 (service role, como la Edge Function)
set role service_role;
select public.gd_registrar_documento('11111111-1111-1111-1111-111111111111', :'ALM', '190.12.1.5', 'Windows · Chrome',
  'Política de seguridad del almacén', 'desc', 'Almacen', 'Politica', current_date + 10, true, 'req-045-2026',
  '11111111-1111-1111-1111-111111111111/v1.0-a.pdf', repeat('a',64), 'politica.pdf', 'application/pdf', 1000,
  '[{"rol":"Ventas","permiso":"Solo Lectura"},{"rol":"Tesoreria","permiso":"Sin Acceso"}]', array['Gerencia'], true);
select public.gd_registrar_documento('22222222-2222-2222-2222-222222222222', :'ALM', '1.1.1.1', 'x', 'Plano bomba', null, 'Ventas', 'Plano', null, false, null,
  'p', repeat('b',64), 'a.pdf','application/pdf',1,'[]', array['Gerencia'], true);
reset role;
-- Ventas: lectura sí, descarga no
set role service_role;
select public.gd_autorizar_archivo('11111111-1111-1111-1111-111111111111', :'VEN', '2.2.2.2','ua','VER');
select public.gd_autorizar_archivo('11111111-1111-1111-1111-111111111111', :'VEN', '2.2.2.2','ua','DESCARGAR');
-- tesoreria sin acceso
select public.gd_autorizar_archivo('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000005', '2.2.2.2','ua','VER');
reset role;
-- RLS: ventas ve 1 doc, tesorería 0
set role authenticated; set request.jwt.claim.sub = :'VEN';
select codigo_unico, estado, nivel from public.gd_listar();
select count(*) as docs_rls_ventas from public.documents;
-- Ventas intenta aprobar
select public.gd_resolver('11111111-1111-1111-1111-111111111111','APROBAR');
-- inserción directa prohibida
\set ON_ERROR_STOP 0
insert into public.audit_log(accion) values ('VER');
update public.documents set estado='Aprobado';
\set ON_ERROR_STOP 1
reset role;
-- Gerencia: barra estática y aprobar; rechazo sin comentario
set role authenticated; set request.jwt.claim.sub = :'GER';
select codigo_unico, aprobador_rol from public.gd_mis_pendientes();
\set ON_ERROR_STOP 0
select public.gd_resolver('11111111-1111-1111-1111-111111111111','RECHAZAR','no');
\set ON_ERROR_STOP 1
select public.gd_resolver('11111111-1111-1111-1111-111111111111','APROBAR','Conforme');
reset role;
-- Flujo 3 nueva versión
set role service_role;
select public.gd_registrar_version('11111111-1111-1111-1111-111111111111', :'ALM','1.1.1.1','x','mayor','Actualización anual de la política','path2', repeat('c',64),'p2.pdf','application/pdf',2000);
select public.gd_registrar_version('11111111-1111-1111-1111-111111111111', :'ALM','1.1.1.1','x','menor','Mismo archivo otra vez','path2', repeat('c',64),'p2.pdf','application/pdf',2000);
reset role;
set role authenticated; set request.jwt.claim.sub = :'GER';
select public.gd_resolver('11111111-1111-1111-1111-111111111111','RECHAZAR','Falta la firma del jefe de almacén');
reset role;
set role authenticated; set request.jwt.claim.sub = :'ALM';
select public.gd_restaurar_version('11111111-1111-1111-1111-111111111111','v1.0','Volver a la política aprobada');
select public.gd_set_permiso('11111111-1111-1111-1111-111111111111','Ventas','Lectura y Descarga','Necesita copia');
select public.gd_detalle('11111111-1111-1111-1111-111111111111') -> 'versiones';
reset role;
-- Flujo 4: límite de descargas (ventas, confidencial)
set role service_role;
select (public.gd_autorizar_archivo('11111111-1111-1111-1111-111111111111', :'VEN','3.3.3.3','ua','DESCARGAR',null,0))->>'error' as sin_confirmar;
select i, (public.gd_autorizar_archivo('11111111-1111-1111-1111-111111111111', :'VEN','3.3.3.3','ua','DESCARGAR',null,2))->>'ok' from generate_series(1,7) i;
select public.gd_registrar_integridad('11111111-1111-1111-1111-111111111111', :'SOP','x','x','v1.0', repeat('d',64),'VISTA');
reset role;
-- Flujo 5 archivar: dueño archiva; ventas ya no ve; gerencia sí
set role authenticated; set request.jwt.claim.sub = :'ALM';
select public.gd_archivar('11111111-1111-1111-1111-111111111111','Reemplazada por nueva política');
select count(*) dueno_ve_archivado from public.gd_listar() where estado='Archivado';
set request.jwt.claim.sub = :'VEN';
select count(*) ventas_ve from public.gd_listar();
set request.jwt.claim.sub = :'GER';
select codigo_unico, estado from public.gd_listar();
select public.gd_verificar_cadena();
select accion, count(*) from public.gd_auditoria_buscar() group by 1 order by 1;
select * from public.gd_reporte_vencimientos(30, null);
select tipo, count(*) from public.notificaciones group by 1;
reset role;
-- Inmutabilidad incluso para el dueño de la base
\set ON_ERROR_STOP 0
delete from public.audit_log where secuencia = 3;
update public.audit_log set detalle='x' where secuencia = 3;
truncate public.audit_log;
delete from public.documents;
update public.document_versions set hash_sha256 = repeat('e',64);
\set ON_ERROR_STOP 1
-- Saltando triggers (superusuario malicioso): la cadena lo detecta
alter table public.audit_log disable trigger audit_log_inmutable;
update public.audit_log set detalle='MANIPULADO' where secuencia = 4;
alter table public.audit_log enable trigger audit_log_inmutable;
set role authenticated; set request.jwt.claim.sub = :'GER';
select public.gd_verificar_cadena();
