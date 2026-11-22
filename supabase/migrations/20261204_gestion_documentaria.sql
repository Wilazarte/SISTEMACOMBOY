-- =====================================================================
-- GESTIÓN DOCUMENTARIA AUDITADA (pedido de Williams, 2026-11-17)
--
-- Módulo independiente: tablas propias (documents, document_versions, document_permissions,
-- audit_log, approval_workflow) y ruta /documentos. NO modifica ninguna tabla existente; solo
-- escribe avisos en public.notificaciones (si existe) para la campana.
-- Se conecta con los demás módulos por código: documents.referencia_externa guarda el código del
-- documento del otro módulo (REQ-045-2026, OC-080, NP-012…) sin tocar su tabla.
--
-- Reglas que la BASE hace cumplir (no el navegador):
--   * Nada se borra: DELETE prohibido por trigger en las 5 tablas. Eliminar = Archivado (lógico).
--   * Nada se sobrescribe: document_versions no admite UPDATE; cada archivo es una versión nueva.
--   * audit_log es SOLO INSERCIÓN: UPDATE, DELETE y TRUNCATE prohibidos por trigger, y cada registro
--     lleva el hash SHA-256 del anterior (cadena): si alguien con acceso de dueño de la base borra o
--     cambia una fila saltándose los triggers, gd_verificar_cadena() lo detecta.
--   * Nadie escribe directo en las tablas: todo pasa por funciones gd_* que validan el permiso y
--     escriben audit_log en la MISMA transacción (si la auditoría falla, la acción no ocurre).
--   * Por defecto nadie ve nada: solo el dueño, SOPORTE y los roles con permiso explícito.
--   * Los archivos van a un bucket PRIVADO (gestion-documental) sin políticas para usuarios:
--     solo la Edge Function gestion-documental (service role) lo lee y escribe, después de pedir
--     permiso a la base (gd_autorizar_archivo), que es la que registra VER / DESCARGAR.
--
-- Idempotente: se puede correr más de una vez. Requiere perfiles (rol en minúscula).
-- Orden: correr este SQL y después desplegar la Edge Function supabase/functions/gestion-documental.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Protección: si ya existiera otra tabla audit_log con otra estructura, no se toca.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'audit_log')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'audit_log' and column_name = 'document_id') then
    raise exception 'Ya existe public.audit_log con otra estructura. No se modifica: avise a soporte antes de continuar.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- Correlativos de códigos (PLN-0012, POL-0008, REQ-00452, EST-0021…)
create table if not exists public.gd_correlativos (
  prefijo text primary key,
  ultimo integer not null default 0
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  codigo_unico text not null unique,
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text,
  modulo text not null check (modulo in ('Almacen', 'Tesoreria', 'Produccion', 'Ventas', 'Gerencia', 'Logistica')),
  categoria text not null check (categoria in ('Plano', 'Politica', 'Estrategia Comercial', 'Contrato', 'Requerimiento', 'Cotizacion', 'Factura')),
  estado text not null default 'Borrador' check (estado in ('Borrador', 'En Revision', 'Pendiente', 'Aprobado', 'Rechazado', 'Archivado', 'Vencido')),
  version_actual text not null default 'v1.0',
  dueno_id uuid not null references auth.users (id) on delete restrict, -- "dueño_id" (sin ñ: nombre de columna seguro)
  fecha_creacion timestamptz not null default now(),
  fecha_vencimiento date,
  archivo_url text not null,               -- ruta dentro del bucket privado (nunca una URL pública)
  hash_sha256 text not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  es_confidencial boolean not null default false,
  -- Complementos
  referencia_externa text,                 -- código del documento en otro módulo (REQ-045-2026, OC-080…)
  sede text not null default 'AREQUIPA' check (sede in ('AREQUIPA', 'SECOCHA')),
  archivo_nombre text,
  archivo_tipo text,
  archivo_bytes bigint,
  integridad text not null default 'SIN_VERIFICAR' check (integridad in ('OK', 'ALERTA', 'SIN_VERIFICAR')),
  integridad_verificada_at timestamptz,
  motivo_archivo text,
  archivado_por uuid,
  fecha_archivo timestamptz,
  estado_antes_archivo text,
  actualizado_at timestamptz not null default now()
);
create index if not exists documents_estado_idx on public.documents (estado);
create index if not exists documents_modulo_idx on public.documents (modulo);
create index if not exists documents_referencia_idx on public.documents (upper(referencia_externa));
create index if not exists documents_vence_idx on public.documents (fecha_vencimiento) where fecha_vencimiento is not null;

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  version text not null check (version ~ '^v[0-9]+\.[0-9]+$'),
  archivo_url text not null,
  hash_sha256 text not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  cambiado_por uuid not null references auth.users (id) on delete restrict,
  motivo_cambio text not null check (length(trim(motivo_cambio)) > 0),
  fecha timestamptz not null default now(),
  archivo_nombre text,
  archivo_tipo text,
  archivo_bytes bigint,
  restaurada_de text,                       -- RESTAURAR_VERSION: versión de la que se copió el archivo
  unique (document_id, version)
);

create table if not exists public.document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  rol text not null check (rol in ('Gerencia', 'Ingenieria', 'Produccion', 'Almacen', 'Tesoreria', 'Ventas', 'Logistica', 'Secocha')),
  permiso text not null default 'Sin Acceso' check (permiso in ('Sin Acceso', 'Solo Lectura', 'Lectura y Descarga', 'Edicion', 'Aprobacion', 'Control Total')),
  otorgado_por uuid,
  actualizado_at timestamptz not null default now(),
  unique (document_id, rol)
);

create table if not exists public.approval_workflow (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  version text not null,                    -- versión que se aprueba (cada versión nueva abre otra ronda)
  paso integer not null check (paso >= 1),
  aprobador_rol text not null check (aprobador_rol in ('Gerencia', 'Ingenieria', 'Produccion', 'Almacen', 'Tesoreria', 'Ventas', 'Logistica', 'Secocha')),
  aprobador_id uuid,                        -- quién aprobó / rechazó (se llena al resolver)
  estado text not null default 'En Espera' check (estado in ('En Espera', 'Pendiente', 'Aprobado', 'Rechazado', 'Anulado')),
  comentario_obligatorio_si_rechaza text,
  fecha_aprobacion timestamptz,
  creado_at timestamptz not null default now(),
  -- Rechazar sin comentario es imposible también a nivel de tabla
  constraint approval_rechazo_con_comentario check (estado <> 'Rechazado' or length(trim(coalesce(comentario_obligatorio_si_rechaza, ''))) >= 5),
  unique (document_id, version, paso)
);

-- AUDIT_LOG: la tabla más importante. Solo inserción, encadenada por hash.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  document_id uuid references public.documents (id) on delete restrict, -- null = acción general (exportar reporte…)
  usuario_id uuid,
  usuario_nombre text,
  accion text not null check (accion in (
    'CREAR', 'VER', 'DESCARGAR', 'SUBIR_VERSION', 'APROBAR', 'RECHAZAR', 'EDITAR_PERMISO', 'ELIMINAR_LOGICA', 'RESTAURAR_VERSION',
    -- Controles agregados (ver PR): toda acción deja huella, también los intentos fallidos
    'ENVIAR_REVISION', 'EDITAR_DATOS', 'RESTAURAR_ARCHIVO', 'ACCESO_DENEGADO', 'DESCARGA_BLOQUEADA',
    'ALERTA_INTEGRIDAD', 'VERIFICAR_INTEGRIDAD', 'VENCER', 'CONSULTAR_AUDITORIA', 'EXPORTAR_REPORTE')),
  fecha_hora timestamptz not null default now(),
  ip text,
  dispositivo text,
  detalle text,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  -- Copia del documento al momento de la acción (los reportes no dependen de que el lector vea el documento)
  version text,
  codigo_documento text,
  nombre_documento text,
  confidencial boolean not null default false,
  -- Cadena de integridad
  secuencia bigint unique,
  hash_anterior_registro text,
  hash_registro text
);
create index if not exists audit_log_doc_idx on public.audit_log (document_id, fecha_hora desc);
create index if not exists audit_log_usuario_idx on public.audit_log (usuario_id, accion, fecha_hora desc);
create index if not exists audit_log_fecha_idx on public.audit_log (fecha_hora desc);

-- ---------------------------------------------------------------------
-- 2. INMUTABILIDAD (triggers): valen incluso para el service role.
-- ---------------------------------------------------------------------
create or replace function public.gd_prohibir_cambio()
returns trigger language plpgsql as $$
begin
  raise exception 'GESTION DOCUMENTARIA: % prohibido en % (sistema auditado: nada se borra ni se sobrescribe)', tg_op, tg_table_name
    using errcode = 'P0001';
end $$;

-- audit_log: ni UPDATE, ni DELETE, ni TRUNCATE
drop trigger if exists audit_log_inmutable on public.audit_log;
create trigger audit_log_inmutable before update or delete on public.audit_log for each row execute function public.gd_prohibir_cambio();
drop trigger if exists audit_log_sin_truncate on public.audit_log;
create trigger audit_log_sin_truncate before truncate on public.audit_log for each statement execute function public.gd_prohibir_cambio();

-- document_versions: ni UPDATE, ni DELETE (la versión anterior queda intacta y recuperable)
drop trigger if exists document_versions_inmutable on public.document_versions;
create trigger document_versions_inmutable before update or delete on public.document_versions for each row execute function public.gd_prohibir_cambio();
drop trigger if exists document_versions_sin_truncate on public.document_versions;
create trigger document_versions_sin_truncate before truncate on public.document_versions for each statement execute function public.gd_prohibir_cambio();

-- documents, permisos y flujo: nunca DELETE (solo eliminación lógica)
drop trigger if exists documents_sin_delete on public.documents;
create trigger documents_sin_delete before delete on public.documents for each row execute function public.gd_prohibir_cambio();
drop trigger if exists documents_sin_truncate on public.documents;
create trigger documents_sin_truncate before truncate on public.documents for each statement execute function public.gd_prohibir_cambio();
drop trigger if exists document_permissions_sin_delete on public.document_permissions;
create trigger document_permissions_sin_delete before delete on public.document_permissions for each row execute function public.gd_prohibir_cambio();
drop trigger if exists approval_workflow_sin_delete on public.approval_workflow;
create trigger approval_workflow_sin_delete before delete on public.approval_workflow for each row execute function public.gd_prohibir_cambio();

-- documents: código, dueño y fecha de creación no cambian nunca
create or replace function public.gd_documents_campos_fijos()
returns trigger language plpgsql as $$
begin
  if new.codigo_unico is distinct from old.codigo_unico or new.dueno_id is distinct from old.dueno_id or new.fecha_creacion is distinct from old.fecha_creacion then
    raise exception 'GESTION DOCUMENTARIA: el código, el dueño y la fecha de creación no se pueden cambiar' using errcode = 'P0001';
  end if;
  new.actualizado_at := now();
  return new;
end $$;
drop trigger if exists documents_campos_fijos on public.documents;
create trigger documents_campos_fijos before update on public.documents for each row execute function public.gd_documents_campos_fijos();

-- ---------------------------------------------------------------------
-- 3. CADENA DE HASH DEL AUDIT_LOG (AUDITORÍA: cada registro sella al anterior)
-- ---------------------------------------------------------------------
create or replace function public.gd_audit_hash(a public.audit_log)
returns text language sql immutable as $$
  select encode(sha256(convert_to(concat_ws('|',
    a.hash_anterior_registro, a.secuencia, a.document_id, a.usuario_id, a.usuario_nombre, a.accion,
    to_char(a.fecha_hora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), a.ip, a.dispositivo, a.detalle,
    a.valor_anterior::text, a.valor_nuevo::text, a.version, a.codigo_documento, a.nombre_documento, a.confidencial::text), 'UTF8')), 'hex');
$$;

create or replace function public.gd_audit_encadenar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prev record;
begin
  -- Un registro a la vez: la secuencia y el hash anterior no se cruzan entre transacciones
  perform pg_advisory_xact_lock(hashtext('gd_audit_log_cadena'));
  new.fecha_hora := clock_timestamp(); -- la hora la pone la base, no el cliente
  select secuencia, hash_registro into v_prev from public.audit_log order by secuencia desc nulls last limit 1;
  new.secuencia := coalesce(v_prev.secuencia, 0) + 1;
  new.hash_anterior_registro := coalesce(v_prev.hash_registro, repeat('0', 64));
  new.hash_registro := public.gd_audit_hash(new);
  return new;
end $$;
drop trigger if exists audit_log_encadenar on public.audit_log;
create trigger audit_log_encadenar before insert on public.audit_log for each row execute function public.gd_audit_encadenar();

-- ---------------------------------------------------------------------
-- 4. AYUDANTES: rol, nivel de permiso, IP y dispositivo
-- ---------------------------------------------------------------------

-- Rol de Gestión Documentaria según perfiles.rol (minúscula). SOPORTE = administrador del sistema.
create or replace function public.gd_rol_de(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.rol in ('creador', 'soporte') then 'Soporte'
    when p.rol = 'gerencia' then 'Gerencia'
    when p.rol = 'ingenieria' then 'Ingenieria'
    when p.rol = 'produccion' then 'Produccion'
    when p.rol = 'almacen' then 'Almacen'
    when p.rol in ('tesoreria', 'finanzas', 'planilla') then 'Tesoreria'
    when p.rol = 'ventas' then 'Ventas'
    when p.rol = 'logistica' then 'Logistica'
    when p.rol = 'sucursal' then 'Secocha'
    else null
  end
  from public.perfiles p
  where p.id = p_uid and coalesce((to_jsonb(p) ->> 'activo')::boolean, true);
$$;

create or replace function public.gd_nombre_de(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(to_jsonb(p) ->> 'nombre_completo'), ''), nullif(trim(p.nombre), ''), p.usuario)
  from public.perfiles p where p.id = p_uid;
$$;

create or replace function public.gd_nivel_permiso(p text)
returns integer language sql immutable as $$
  select case p when 'Solo Lectura' then 1 when 'Lectura y Descarga' then 2 when 'Edicion' then 3
                when 'Aprobacion' then 4 when 'Control Total' then 5 else 0 end;
$$;

/**
 * Nivel de acceso del usuario a un documento (0 = sin acceso … 5 = control total).
 * - SOPORTE: 5 (administrador). Dueño: 5.
 * - Los demás: SOLO el permiso explícito de su rol en document_permissions (por defecto nadie ve nada).
 * - Archivado: visible solo para Gerencia (al menos lectura) y SOPORTE; el dueño y los demás ya no lo ven.
 */
create or replace function public.gd_nivel(p_doc uuid, p_uid uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  r text := public.gd_rol_de(p_uid);
  d record;
  n integer;
begin
  if p_uid is null or r is null then return 0; end if;
  select estado, dueno_id into d from public.documents where id = p_doc;
  if not found then return 0; end if;
  select public.gd_nivel_permiso(permiso) into n from public.document_permissions where document_id = p_doc and rol = r;
  n := coalesce(n, 0);
  if d.estado = 'Archivado' then
    return case when r = 'Soporte' then 5 when r = 'Gerencia' then greatest(n, 1) else 0 end;
  end if;
  if r = 'Soporte' or d.dueno_id = p_uid then return 5; end if;
  return n;
end $$;

-- IP real del cliente (Supabase / Cloudflare la ponen en las cabeceras de la petición; el navegador no la elige)
create or replace function public.gd_ip_cliente()
returns text language plpgsql stable as $$
declare h json;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  if h is null then return null; end if;
  return coalesce(nullif(h ->> 'cf-connecting-ip', ''), nullif(h ->> 'x-real-ip', ''), nullif(trim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''));
end $$;

create or replace function public.gd_dispositivo_cliente()
returns text language plpgsql stable as $$
declare h json;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  if h is null then return null; end if;
  return left(concat_ws(' · ', nullif(h ->> 'x-gd-dispositivo', ''), nullif(h ->> 'user-agent', '')), 400);
end $$;

-- ---------------------------------------------------------------------
-- 5. AUDITORÍA: único punto de escritura del audit_log
-- ---------------------------------------------------------------------
create or replace function public.gd_log(
  p_doc uuid, p_usuario uuid, p_accion text, p_detalle text,
  p_anterior jsonb default null, p_nuevo jsonb default null,
  p_ip text default null, p_dispositivo text default null, p_version text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_codigo text;
  v_nombre text;
  v_conf boolean;
  v_ver text;
  v_id bigint;
begin
  if p_doc is not null then
    select codigo_unico, nombre, es_confidencial, version_actual into v_codigo, v_nombre, v_conf, v_ver from public.documents where id = p_doc;
  end if;
  insert into public.audit_log (document_id, usuario_id, usuario_nombre, accion, ip, dispositivo, detalle, valor_anterior, valor_nuevo,
                                version, codigo_documento, nombre_documento, confidencial)
  values (p_doc, p_usuario, coalesce(public.gd_nombre_de(p_usuario), case when p_usuario is null then 'SISTEMA' end), p_accion,
          coalesce(p_ip, public.gd_ip_cliente()), coalesce(p_dispositivo, public.gd_dispositivo_cliente()), p_detalle, p_anterior, p_nuevo,
          coalesce(p_version, v_ver), v_codigo, v_nombre, coalesce(v_conf, false))
  returning id into v_id;
  return v_id;
end $$;

-- Foto de un documento para valor_anterior / valor_nuevo
create or replace function public.gd_foto(p_doc uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('estado', estado, 'version', version_actual, 'hash_sha256', hash_sha256, 'nombre', nombre, 'descripcion', descripcion,
                            'fecha_vencimiento', fecha_vencimiento, 'es_confidencial', es_confidencial, 'referencia_externa', referencia_externa,
                            'archivo', archivo_nombre)
  from public.documents where id = p_doc;
$$;

-- ---------------------------------------------------------------------
-- 6. AVISOS (campana: public.notificaciones). Un fallo aquí nunca bloquea la acción.
-- ---------------------------------------------------------------------
create or replace function public.gd_notificar_usuario(p_uid uuid, p_tipo text, p_titulo text, p_mensaje text, p_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if p_uid is null then return; end if;
  select codigo_unico into c from public.documents where id = p_doc;
  execute 'insert into public.notificaciones (modulo, tipo, titulo, mensaje, asignado_a, href, datos) values ($1, $2, $3, $4, $5, $6, $7)'
    using 'DOCUMENTOS', p_tipo, p_titulo, p_mensaje, p_uid, '/documentos?doc=' || coalesce(c, ''),
          jsonb_build_object('document_id', p_doc, 'codigo', c);
exception when others then
  raise warning 'gd_notificar_usuario(%): %', p_tipo, sqlerrm;
end $$;

create or replace function public.gd_notificar_rol(p_rol text, p_tipo text, p_titulo text, p_mensaje text, p_doc uuid, p_excepto uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select p.id from public.perfiles p where public.gd_rol_de(p.id) = p_rol and p.id is distinct from p_excepto loop
    perform public.gd_notificar_usuario(u, p_tipo, p_titulo, p_mensaje, p_doc);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. CÓDIGO AUTOMÁTICO
-- ---------------------------------------------------------------------
create or replace function public.gd_prefijo(p_categoria text)
returns text language sql immutable as $$
  select case p_categoria when 'Plano' then 'PLN' when 'Politica' then 'POL' when 'Estrategia Comercial' then 'EST'
                          when 'Contrato' then 'CTR' when 'Requerimiento' then 'REQ' when 'Cotizacion' then 'COT'
                          when 'Factura' then 'FAC' else 'DOC' end;
$$;

create or replace function public.gd_siguiente_codigo(p_categoria text)
returns text language plpgsql security definer set search_path = public as $$
declare
  p text := public.gd_prefijo(p_categoria);
  n integer;
begin
  insert into public.gd_correlativos (prefijo, ultimo) values (p, 1)
  on conflict (prefijo) do update set ultimo = public.gd_correlativos.ultimo + 1
  returning ultimo into n;
  -- REQ con 5 dígitos (REQ-00452), el resto con 4 (PLN-0012)
  return p || '-' || lpad(n::text, case when p = 'REQ' then 5 else 4 end, '0');
end $$;

-- Módulos donde cada rol puede subir (moduladores: solo el suyo; Gerencia, Soporte y Secocha: todos)
create or replace function public.gd_puede_subir_en(p_rol text, p_modulo text)
returns boolean language sql immutable as $$
  select case
    when p_rol in ('Soporte', 'Gerencia', 'Secocha') then true
    when p_rol = 'Ingenieria' then p_modulo in ('Produccion')
    else p_rol = p_modulo
  end;
$$;

-- Crea la ronda de aprobación de una versión: paso 1 Pendiente, el resto En Espera.
create or replace function public.gd_crear_ronda(p_doc uuid, p_version text, p_aprobadores text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  i integer;
begin
  if coalesce(array_length(p_aprobadores, 1), 0) = 0 then p_aprobadores := array['Gerencia']; end if;
  for i in 1 .. array_length(p_aprobadores, 1) loop
    insert into public.approval_workflow (document_id, version, paso, aprobador_rol, estado)
    values (p_doc, p_version, i, p_aprobadores[i], case when i = 1 then 'Pendiente' else 'En Espera' end);
  end loop;
end $$;

-- Asegura que cada rol aprobador tenga al menos "Aprobacion" (si no, no podría aprobar)
create or replace function public.gd_asegurar_aprobadores(p_doc uuid, p_aprobadores text[], p_por uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r text;
  ant text;
  cambios jsonb := '[]'::jsonb;
begin
  foreach r in array coalesce(p_aprobadores, array[]::text[]) loop
    select permiso into ant from public.document_permissions where document_id = p_doc and rol = r;
    if ant is null then
      insert into public.document_permissions (document_id, rol, permiso, otorgado_por) values (p_doc, r, 'Aprobacion', p_por);
      cambios := cambios || jsonb_build_object('rol', r, 'anterior', 'Sin Acceso', 'nuevo', 'Aprobacion');
    elsif public.gd_nivel_permiso(ant) < 4 then
      update public.document_permissions set permiso = 'Aprobacion', otorgado_por = p_por, actualizado_at = now() where document_id = p_doc and rol = r;
      cambios := cambios || jsonb_build_object('rol', r, 'anterior', ant, 'nuevo', 'Aprobacion');
    end if;
  end loop;
  return cambios;
end $$;

-- =====================================================================
-- 8. FUNCIONES QUE LLAMA LA EDGE FUNCTION (service role). Reciben el usuario ya verificado
--    por la Edge Function (JWT) y la IP / dispositivo de la petición original.
-- =====================================================================

-- FLUJO 1 · Subir documento: código automático + hash + v1.0 + En Revision + audit_log + aviso al aprobador
create or replace function public.gd_registrar_documento(
  p_id uuid, p_usuario uuid, p_ip text, p_dispositivo text,
  p_nombre text, p_descripcion text, p_modulo text, p_categoria text, p_fecha_vencimiento date,
  p_confidencial boolean, p_referencia text,
  p_archivo_url text, p_hash text, p_archivo_nombre text, p_archivo_tipo text, p_archivo_bytes bigint,
  p_permisos jsonb, p_aprobadores text[], p_enviar boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r text := public.gd_rol_de(p_usuario);
  v_codigo text;
  v_sede text := case when r = 'Secocha' then 'SECOCHA' else 'AREQUIPA' end;
  v_perm jsonb;
  v_aprob jsonb;
  v_estado text := case when coalesce(p_enviar, true) then 'En Revision' else 'Borrador' end;
  x jsonb;
begin
  if r is null then
    return jsonb_build_object('ok', false, 'error', 'Su usuario no tiene un rol habilitado para Gestión Documentaria.');
  end if;
  if not public.gd_puede_subir_en(r, p_modulo) then
    -- AUDITORÍA: intento de subir en un módulo ajeno
    perform public.gd_log(null, p_usuario, 'ACCESO_DENEGADO', 'Intentó subir un documento al módulo ' || p_modulo || ' (su rol: ' || r || ')',
                          null, jsonb_build_object('modulo', p_modulo, 'nombre', p_nombre), p_ip, p_dispositivo, null);
    return jsonb_build_object('ok', false, 'error', 'Solo puede subir documentos de su propio módulo (' || r || ').');
  end if;
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Hash SHA-256 inválido'; end if;

  v_codigo := public.gd_siguiente_codigo(p_categoria);
  insert into public.documents (id, codigo_unico, nombre, descripcion, modulo, categoria, estado, version_actual, dueno_id, fecha_vencimiento,
                                archivo_url, hash_sha256, es_confidencial, referencia_externa, sede, archivo_nombre, archivo_tipo, archivo_bytes)
  values (p_id, v_codigo, trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''), p_modulo, p_categoria, v_estado, 'v1.0', p_usuario, p_fecha_vencimiento,
          p_archivo_url, p_hash, coalesce(p_confidencial, false), nullif(upper(trim(coalesce(p_referencia, ''))), ''), v_sede, p_archivo_nombre, p_archivo_tipo, p_archivo_bytes);

  insert into public.document_versions (document_id, version, archivo_url, hash_sha256, cambiado_por, motivo_cambio, archivo_nombre, archivo_tipo, archivo_bytes)
  values (p_id, 'v1.0', p_archivo_url, p_hash, p_usuario, 'Versión inicial', p_archivo_nombre, p_archivo_tipo, p_archivo_bytes);

  -- Permisos explícitos elegidos al subir (los no listados = Sin Acceso)
  for x in select * from jsonb_array_elements(coalesce(p_permisos, '[]'::jsonb)) loop
    if coalesce(x ->> 'permiso', 'Sin Acceso') <> 'Sin Acceso' then
      insert into public.document_permissions (document_id, rol, permiso, otorgado_por)
      values (p_id, x ->> 'rol', x ->> 'permiso', p_usuario)
      on conflict (document_id, rol) do update set permiso = excluded.permiso;
    end if;
  end loop;
  v_aprob := public.gd_asegurar_aprobadores(p_id, p_aprobadores, p_usuario);
  select coalesce(jsonb_agg(jsonb_build_object('rol', rol, 'permiso', permiso) order by rol), '[]'::jsonb) into v_perm
    from public.document_permissions where document_id = p_id;

  -- AUDITORÍA: CREAR (valor_nuevo = documento completo, permisos y ruta de aprobación)
  perform public.gd_log(p_id, p_usuario, 'CREAR', 'Subió ' || coalesce(p_archivo_nombre, 'archivo') || ' como ' || v_codigo || ' v1.0',
                        null, public.gd_foto(p_id) || jsonb_build_object('permisos', v_perm, 'aprobadores', to_jsonb(p_aprobadores), 'permisos_por_aprobacion', v_aprob, 'sede', v_sede),
                        p_ip, p_dispositivo, 'v1.0');

  if v_estado = 'En Revision' then
    perform public.gd_crear_ronda(p_id, 'v1.0', p_aprobadores);
    -- AUDITORÍA: ENVIAR_REVISION
    perform public.gd_log(p_id, p_usuario, 'ENVIAR_REVISION', 'Enviado a revisión: ' || array_to_string(coalesce(p_aprobadores, array['Gerencia']), ' → '),
                          jsonb_build_object('estado', 'Borrador'), jsonb_build_object('estado', 'En Revision'), p_ip, p_dispositivo, 'v1.0');
    perform public.gd_notificar_rol(coalesce(p_aprobadores[1], 'Gerencia'), 'GD_POR_APROBAR', v_codigo || ' · documento por aprobar',
                                    trim(p_nombre) || ' · subido por ' || coalesce(public.gd_nombre_de(p_usuario), ''), p_id, p_usuario);
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'codigo', v_codigo, 'estado', v_estado);
end $$;

-- FLUJO 3 · Nueva versión: nunca borra la anterior, motivo obligatorio, hash anterior y nuevo en audit_log
create or replace function public.gd_registrar_version(
  p_doc uuid, p_usuario uuid, p_ip text, p_dispositivo text, p_tipo_cambio text, p_motivo text,
  p_archivo_url text, p_hash text, p_archivo_nombre text, p_archivo_tipo text, p_archivo_bytes bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d record;
  v_mayor integer;
  v_menor integer;
  v_nueva text;
  v_aprob text[];
  v_antes jsonb;
begin
  select * into d from public.documents where id = p_doc for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Documento no encontrado.'); end if;
  if public.gd_nivel(p_doc, p_usuario) < 3 then
    -- AUDITORÍA: intento de subir versión sin permiso de edición
    perform public.gd_log(p_doc, p_usuario, 'ACCESO_DENEGADO', 'Intentó subir una nueva versión sin permiso de Edición', null, null, p_ip, p_dispositivo, null);
    return jsonb_build_object('ok', false, 'error', 'No tiene permiso de Edición sobre este documento.');
  end if;
  if d.estado = 'Archivado' then return jsonb_build_object('ok', false, 'error', 'El documento está archivado: primero debe restaurarlo Gerencia.'); end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'El motivo del cambio es obligatorio (mínimo 5 caracteres).'; end if;
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Hash SHA-256 inválido'; end if;
  if p_hash = d.hash_sha256 then return jsonb_build_object('ok', false, 'error', 'El archivo es idéntico a la versión actual (mismo hash SHA-256).'); end if;

  v_mayor := split_part(substr(d.version_actual, 2), '.', 1)::integer;
  v_menor := split_part(substr(d.version_actual, 2), '.', 2)::integer;
  v_nueva := case when p_tipo_cambio = 'mayor' then 'v' || (v_mayor + 1) || '.0' else 'v' || v_mayor || '.' || (v_menor + 1) end;
  v_antes := public.gd_foto(p_doc);

  insert into public.document_versions (document_id, version, archivo_url, hash_sha256, cambiado_por, motivo_cambio, archivo_nombre, archivo_tipo, archivo_bytes)
  values (p_doc, v_nueva, p_archivo_url, p_hash, p_usuario, trim(p_motivo), p_archivo_nombre, p_archivo_tipo, p_archivo_bytes);

  -- La ronda pendiente de la versión anterior queda anulada; la nueva versión se vuelve a aprobar con la misma ruta
  update public.approval_workflow set estado = 'Anulado' where document_id = p_doc and estado in ('Pendiente', 'En Espera');
  select array_agg(aprobador_rol order by paso) into v_aprob from public.approval_workflow
   where document_id = p_doc and version = (select version from public.approval_workflow where document_id = p_doc order by creado_at desc, paso limit 1);

  update public.documents
     set version_actual = v_nueva, archivo_url = p_archivo_url, hash_sha256 = p_hash, archivo_nombre = p_archivo_nombre,
         archivo_tipo = p_archivo_tipo, archivo_bytes = p_archivo_bytes, integridad = 'SIN_VERIFICAR', integridad_verificada_at = null,
         estado = 'En Revision'
   where id = p_doc;
  perform public.gd_crear_ronda(p_doc, v_nueva, coalesce(v_aprob, array['Gerencia']));

  -- AUDITORÍA: SUBIR_VERSION con hash anterior y nuevo
  perform public.gd_log(p_doc, p_usuario, 'SUBIR_VERSION', d.version_actual || ' → ' || v_nueva || ' · ' || trim(p_motivo),
                        v_antes, public.gd_foto(p_doc) || jsonb_build_object('motivo', trim(p_motivo)), p_ip, p_dispositivo, v_nueva);
  perform public.gd_notificar_rol(coalesce(v_aprob[1], 'Gerencia'), 'GD_POR_APROBAR', d.codigo_unico || ' ' || v_nueva || ' · nueva versión por aprobar', trim(p_motivo), p_doc, p_usuario);
  return jsonb_build_object('ok', true, 'version', v_nueva);
end $$;

-- FLUJO 4 · Ver / Descargar: la base decide y registra ANTES de que la Edge Function entregue el archivo
create or replace function public.gd_autorizar_archivo(
  p_doc uuid, p_usuario uuid, p_ip text, p_dispositivo text, p_accion text, p_version text default null, p_confirmaciones integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d record;
  v record;
  n integer := public.gd_nivel(p_doc, p_usuario);
  r text := public.gd_rol_de(p_usuario);
  v_descargas integer;
  v_ya_alertado boolean;
begin
  select * into d from public.documents where id = p_doc;
  if not found then return jsonb_build_object('ok', false, 'error', 'Documento no encontrado.'); end if;
  select * into v from public.document_versions where document_id = p_doc and version = coalesce(p_version, d.version_actual);
  if not found then return jsonb_build_object('ok', false, 'error', 'Versión no encontrada.'); end if;

  if p_accion = 'VER' then
    if n < 1 then
      -- AUDITORÍA: intento de ver sin permiso
      perform public.gd_log(p_doc, p_usuario, 'ACCESO_DENEGADO', 'Intentó ver ' || v.version || ' sin permiso', null, null, p_ip, p_dispositivo, v.version);
      return jsonb_build_object('ok', false, 'error', 'No tiene permiso para ver este documento.');
    end if;
    -- AUDITORÍA: VER (vista previa en el navegador)
    perform public.gd_log(p_doc, p_usuario, 'VER', 'Vista previa de ' || v.version, null, jsonb_build_object('version', v.version, 'hash_sha256', v.hash_sha256), p_ip, p_dispositivo, v.version);

  elsif p_accion = 'DESCARGAR' then
    if n < 2 then
      -- AUDITORÍA: intento de descarga sin permiso "Lectura y Descarga"
      perform public.gd_log(p_doc, p_usuario, 'ACCESO_DENEGADO', 'Intentó descargar ' || v.version || ' sin permiso de descarga', null, null, p_ip, p_dispositivo, v.version);
      return jsonb_build_object('ok', false, 'error', 'Su permiso no incluye descargar (necesita "Lectura y Descarga" o superior).');
    end if;
    -- Bloqueo de descarga masiva: máximo 5 descargas por hora por usuario
    perform pg_advisory_xact_lock(hashtext('gd_descargas:' || p_usuario::text));
    select count(*) into v_descargas from public.audit_log
     where usuario_id = p_usuario and accion = 'DESCARGAR' and fecha_hora > now() - interval '1 hour';
    if v_descargas >= 5 then
      select exists (select 1 from public.audit_log where usuario_id = p_usuario and accion = 'DESCARGA_BLOQUEADA' and fecha_hora > now() - interval '1 hour') into v_ya_alertado;
      -- AUDITORÍA: DESCARGA_BLOQUEADA (y aviso a Gerencia una vez por hora)
      perform public.gd_log(p_doc, p_usuario, 'DESCARGA_BLOQUEADA', 'Superó 5 descargas en la última hora (' || v_descargas || '). Bloqueado.',
                            null, jsonb_build_object('descargas_ultima_hora', v_descargas), p_ip, p_dispositivo, v.version);
      if not v_ya_alertado then
        perform public.gd_notificar_rol('Gerencia', 'GD_DESCARGA_MASIVA', 'ALERTA · descarga masiva bloqueada',
                                        coalesce(public.gd_nombre_de(p_usuario), 'Usuario') || ' intentó más de 5 descargas en una hora (último: ' || d.codigo_unico || ').', p_doc);
      end if;
      return jsonb_build_object('ok', false, 'error', 'Límite alcanzado: máximo 5 descargas por hora. Se avisó a Gerencia.', 'bloqueado', true);
    end if;
    -- Confidencial: doble confirmación obligatoria
    if d.es_confidencial and coalesce(p_confirmaciones, 0) < 2 then
      return jsonb_build_object('ok', false, 'error', 'Documento confidencial: confirme dos veces la descarga.', 'confirmar', true);
    end if;
    -- AUDITORÍA: DESCARGAR (quién, cuándo, qué versión, IP)
    perform public.gd_log(p_doc, p_usuario, 'DESCARGAR', 'Descargó ' || v.version || case when d.es_confidencial then ' (confidencial, con marca de agua)' else '' end,
                          null, jsonb_build_object('version', v.version, 'hash_sha256', v.hash_sha256, 'confirmaciones', p_confirmaciones), p_ip, p_dispositivo, v.version);
  else
    raise exception 'Acción no válida: %', p_accion;
  end if;

  return jsonb_build_object('ok', true, 'archivo_url', v.archivo_url, 'hash_sha256', v.hash_sha256, 'version', v.version,
                            'archivo_nombre', v.archivo_nombre, 'archivo_tipo', v.archivo_tipo, 'codigo', d.codigo_unico,
                            'confidencial', d.es_confidencial, 'usuario_nombre', public.gd_nombre_de(p_usuario), 'nivel', n, 'rol', r);
end $$;

-- Integridad: la Edge Function recalcula el SHA-256 del archivo guardado y lo compara
create or replace function public.gd_registrar_integridad(
  p_doc uuid, p_usuario uuid, p_ip text, p_dispositivo text, p_version text, p_hash_real text, p_origen text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d record;
  v record;
  ok boolean;
begin
  select * into d from public.documents where id = p_doc;
  select * into v from public.document_versions where document_id = p_doc and version = p_version;
  if not found then return jsonb_build_object('ok', false, 'error', 'Versión no encontrada.'); end if;
  ok := (p_hash_real = v.hash_sha256);
  if not ok then
    -- AUDITORÍA: ALERTA_INTEGRIDAD (el archivo cambió fuera del sistema)
    perform public.gd_log(p_doc, p_usuario, 'ALERTA_INTEGRIDAD', 'El archivo de ' || p_version || ' NO coincide con su hash (' || p_origen || ')',
                          jsonb_build_object('hash_registrado', v.hash_sha256), jsonb_build_object('hash_actual', coalesce(p_hash_real, 'ARCHIVO NO ENCONTRADO')),
                          p_ip, p_dispositivo, p_version);
    update public.documents set integridad = 'ALERTA', integridad_verificada_at = now() where id = p_doc;
    perform public.gd_notificar_rol('Gerencia', 'GD_INTEGRIDAD', 'ALERTA DE INTEGRIDAD · ' || d.codigo_unico || ' ' || p_version,
                                    'El archivo guardado no coincide con su hash SHA-256: pudo ser modificado fuera del sistema.', p_doc);
    perform public.gd_notificar_usuario(d.dueno_id, 'GD_INTEGRIDAD', 'ALERTA DE INTEGRIDAD · ' || d.codigo_unico || ' ' || p_version,
                                        'El archivo guardado no coincide con su hash SHA-256.', p_doc);
  elsif p_origen = 'VERIFICACION' then
    -- AUDITORÍA: VERIFICAR_INTEGRIDAD (verificación manual correcta)
    perform public.gd_log(p_doc, p_usuario, 'VERIFICAR_INTEGRIDAD', p_version || ' íntegra: el hash coincide', null,
                          jsonb_build_object('hash_sha256', p_hash_real), p_ip, p_dispositivo, p_version);
    if p_version = d.version_actual and d.integridad <> 'ALERTA' then
      update public.documents set integridad = 'OK', integridad_verificada_at = now() where id = p_doc;
    end if;
  end if;
  return jsonb_build_object('ok', ok);
end $$;

-- =====================================================================
-- 9. FUNCIONES PARA EL USUARIO CONECTADO (navegador). IP y dispositivo salen de las cabeceras.
-- =====================================================================

-- FLUJO 2 · Aprobar / Rechazar
create or replace function public.gd_resolver(p_doc uuid, p_decision text, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r text := public.gd_rol_de(auth.uid());
  d record;
  w record;
  sig record;
  v_estado text;
begin
  select * into d from public.documents where id = p_doc for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Documento no encontrado.'); end if;
  if d.estado not in ('En Revision', 'Pendiente') then
    return jsonb_build_object('ok', false, 'error', 'El documento no está esperando aprobación (estado ' || d.estado || ').');
  end if;
  select * into w from public.approval_workflow
   where document_id = p_doc and version = d.version_actual and estado = 'Pendiente' order by paso limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'No hay un paso de aprobación pendiente.'); end if;

  if r is null or (r <> 'Soporte' and r <> w.aprobador_rol) or public.gd_nivel(p_doc, uid) < 4 then
    -- AUDITORÍA: intento de aprobar/rechazar sin ser el aprobador del paso
    perform public.gd_log(p_doc, uid, 'ACCESO_DENEGADO', 'Intentó ' || lower(p_decision) || ' sin ser el aprobador del paso ' || w.paso || ' (' || w.aprobador_rol || ')',
                          null, null, null, null, d.version_actual);
    return jsonb_build_object('ok', false, 'error', 'Este paso lo aprueba ' || w.aprobador_rol || '.');
  end if;
  if d.dueno_id = uid then
    -- Segregación de funciones: nadie aprueba su propio documento
    perform public.gd_log(p_doc, uid, 'ACCESO_DENEGADO', 'Intentó ' || lower(p_decision) || ' su propio documento', null, null, null, null, d.version_actual);
    return jsonb_build_object('ok', false, 'error', 'No puede aprobar ni rechazar un documento propio (segregación de funciones).');
  end if;

  if p_decision = 'RECHAZAR' then
    if length(trim(coalesce(p_comentario, ''))) < 5 then raise exception 'Para rechazar el comentario es obligatorio (mínimo 5 caracteres).'; end if;
    update public.approval_workflow set estado = 'Rechazado', aprobador_id = uid, comentario_obligatorio_si_rechaza = trim(p_comentario), fecha_aprobacion = now() where id = w.id;
    update public.approval_workflow set estado = 'Anulado' where document_id = p_doc and version = d.version_actual and estado = 'En Espera';
    v_estado := 'Rechazado';
  elsif p_decision = 'APROBAR' then
    update public.approval_workflow set estado = 'Aprobado', aprobador_id = uid, comentario_obligatorio_si_rechaza = nullif(trim(coalesce(p_comentario, '')), ''), fecha_aprobacion = now() where id = w.id;
    select * into sig from public.approval_workflow where document_id = p_doc and version = d.version_actual and estado = 'En Espera' order by paso limit 1;
    if found then
      update public.approval_workflow set estado = 'Pendiente' where id = sig.id;
      v_estado := 'Pendiente';
    else
      v_estado := 'Aprobado';
    end if;
  else
    raise exception 'Decisión no válida: %', p_decision;
  end if;

  update public.documents set estado = v_estado where id = p_doc;
  -- AUDITORÍA: APROBAR / RECHAZAR (quién, cuándo, IP, estado anterior y nuevo)
  perform public.gd_log(p_doc, uid, case when p_decision = 'RECHAZAR' then 'RECHAZAR' else 'APROBAR' end,
                        'Paso ' || w.paso || ' (' || w.aprobador_rol || ')' || coalesce(' · ' || nullif(trim(coalesce(p_comentario, '')), ''), ''),
                        jsonb_build_object('estado', d.estado, 'paso', w.paso),
                        jsonb_build_object('estado', v_estado, 'paso', w.paso, 'comentario', nullif(trim(coalesce(p_comentario, '')), '')),
                        null, null, d.version_actual);

  perform public.gd_notificar_usuario(d.dueno_id, case when v_estado = 'Rechazado' then 'GD_RECHAZADO' else 'GD_APROBADO' end,
                                      d.codigo_unico || ' ' || d.version_actual || ' · ' || case when v_estado = 'Rechazado' then 'RECHAZADO' when v_estado = 'Aprobado' then 'APROBADO' else 'aprobado paso ' || w.paso end,
                                      coalesce(public.gd_nombre_de(uid), '') || coalesce(': ' || nullif(trim(coalesce(p_comentario, '')), ''), ''), p_doc);
  if v_estado = 'Pendiente' then
    perform public.gd_notificar_rol(sig.aprobador_rol, 'GD_POR_APROBAR', d.codigo_unico || ' · documento por aprobar (paso ' || sig.paso || ')', d.nombre, p_doc, d.dueno_id);
  end if;
  return jsonb_build_object('ok', true, 'estado', v_estado);
end $$;

-- Enviar un Borrador a revisión
create or replace function public.gd_enviar_revision(p_doc uuid, p_aprobadores text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d record;
  v_aprob jsonb;
begin
  select * into d from public.documents where id = p_doc for update;
  if not found or public.gd_nivel(p_doc, uid) < 3 then
    perform public.gd_log(case when found then p_doc end, uid, 'ACCESO_DENEGADO', 'Intentó enviar a revisión sin permiso de Edición', null, null);
    return jsonb_build_object('ok', false, 'error', 'No tiene permiso de Edición sobre este documento.');
  end if;
  if d.estado <> 'Borrador' then return jsonb_build_object('ok', false, 'error', 'Solo un Borrador se envía a revisión.'); end if;
  v_aprob := public.gd_asegurar_aprobadores(p_doc, p_aprobadores, uid);
  perform public.gd_crear_ronda(p_doc, d.version_actual, p_aprobadores);
  update public.documents set estado = 'En Revision' where id = p_doc;
  -- AUDITORÍA: ENVIAR_REVISION
  perform public.gd_log(p_doc, uid, 'ENVIAR_REVISION', 'Enviado a revisión: ' || array_to_string(coalesce(p_aprobadores, array['Gerencia']), ' → '),
                        jsonb_build_object('estado', 'Borrador'), jsonb_build_object('estado', 'En Revision', 'aprobadores', to_jsonb(p_aprobadores), 'permisos_por_aprobacion', v_aprob));
  perform public.gd_notificar_rol(coalesce(p_aprobadores[1], 'Gerencia'), 'GD_POR_APROBAR', d.codigo_unico || ' · documento por aprobar', d.nombre, p_doc, d.dueno_id);
  return jsonb_build_object('ok', true);
end $$;

-- Permisos de acceso: solo quien tiene Control Total. Registra permiso anterior y nuevo.
create or replace function public.gd_set_permiso(p_doc uuid, p_rol text, p_permiso text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ant text;
begin
  if public.gd_nivel(p_doc, uid) < 5 then
    -- AUDITORÍA: intento de cambiar permisos sin Control Total
    perform public.gd_log(p_doc, uid, 'ACCESO_DENEGADO', 'Intentó cambiar el permiso de ' || p_rol || ' sin Control Total', null, jsonb_build_object('rol', p_rol, 'permiso', p_permiso));
    return jsonb_build_object('ok', false, 'error', 'Solo el dueño, quien tiene Control Total o SOPORTE cambia permisos.');
  end if;
  select permiso into ant from public.document_permissions where document_id = p_doc and rol = p_rol;
  if coalesce(ant, 'Sin Acceso') = p_permiso then return jsonb_build_object('ok', true, 'sin_cambio', true); end if;
  insert into public.document_permissions (document_id, rol, permiso, otorgado_por) values (p_doc, p_rol, p_permiso, uid)
  on conflict (document_id, rol) do update set permiso = excluded.permiso, otorgado_por = excluded.otorgado_por, actualizado_at = now();
  -- AUDITORÍA: EDITAR_PERMISO con valor anterior y nuevo
  perform public.gd_log(p_doc, uid, 'EDITAR_PERMISO', p_rol || ': ' || coalesce(ant, 'Sin Acceso') || ' → ' || p_permiso || coalesce(' · ' || nullif(trim(coalesce(p_motivo, '')), ''), ''),
                        jsonb_build_object('rol', p_rol, 'permiso', coalesce(ant, 'Sin Acceso')), jsonb_build_object('rol', p_rol, 'permiso', p_permiso));
  return jsonb_build_object('ok', true);
end $$;

-- Editar datos (nombre, descripción, vencimiento, referencia, confidencialidad). Nunca el archivo.
create or replace function public.gd_editar_datos(p_doc uuid, p_nombre text, p_descripcion text, p_fecha_vencimiento date, p_referencia text, p_confidencial boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n integer := public.gd_nivel(p_doc, uid);
  d record;
  v_antes jsonb;
begin
  select * into d from public.documents where id = p_doc for update;
  if not found or n < 3 or d.estado = 'Archivado' then
    perform public.gd_log(case when found then p_doc end, uid, 'ACCESO_DENEGADO', 'Intentó editar los datos sin permiso de Edición', null, null);
    return jsonb_build_object('ok', false, 'error', 'No tiene permiso de Edición sobre este documento.');
  end if;
  if coalesce(p_confidencial, d.es_confidencial) <> d.es_confidencial and n < 5 then
    return jsonb_build_object('ok', false, 'error', 'Cambiar la confidencialidad exige Control Total.');
  end if;
  v_antes := public.gd_foto(p_doc);
  update public.documents
     set nombre = coalesce(nullif(trim(coalesce(p_nombre, '')), ''), nombre),
         descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
         fecha_vencimiento = p_fecha_vencimiento,
         referencia_externa = nullif(upper(trim(coalesce(p_referencia, ''))), ''),
         es_confidencial = coalesce(p_confidencial, es_confidencial),
         estado = case when estado = 'Vencido' and (p_fecha_vencimiento is null or p_fecha_vencimiento >= current_date) then 'Aprobado' else estado end
   where id = p_doc;
  -- AUDITORÍA: EDITAR_DATOS con valor anterior y nuevo
  perform public.gd_log(p_doc, uid, 'EDITAR_DATOS', 'Editó los datos del documento', v_antes, public.gd_foto(p_doc));
  return jsonb_build_object('ok', true);
end $$;

-- FLUJO 5 · Eliminar = Archivado (lógico). El archivo y su historial quedan.
create or replace function public.gd_archivar(p_doc uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r text := public.gd_rol_de(auth.uid());
  d record;
begin
  select * into d from public.documents where id = p_doc for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Documento no encontrado.'); end if;
  if public.gd_nivel(p_doc, uid) < 5 and not (r = 'Gerencia' and public.gd_nivel(p_doc, uid) >= 1) then
    perform public.gd_log(p_doc, uid, 'ACCESO_DENEGADO', 'Intentó eliminar (archivar) sin Control Total', null, null);
    return jsonb_build_object('ok', false, 'error', 'Solo el dueño, Control Total, Gerencia o SOPORTE pueden archivar.');
  end if;
  if d.estado = 'Archivado' then return jsonb_build_object('ok', false, 'error', 'Ya está archivado.'); end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'El motivo es obligatorio (mínimo 5 caracteres).'; end if;
  update public.approval_workflow set estado = 'Anulado' where document_id = p_doc and estado in ('Pendiente', 'En Espera');
  update public.documents set estado = 'Archivado', estado_antes_archivo = d.estado, motivo_archivo = trim(p_motivo), archivado_por = uid, fecha_archivo = now() where id = p_doc;
  -- AUDITORÍA: ELIMINAR_LOGICA (nunca DELETE físico)
  perform public.gd_log(p_doc, uid, 'ELIMINAR_LOGICA', 'Archivado: ' || trim(p_motivo), jsonb_build_object('estado', d.estado), jsonb_build_object('estado', 'Archivado', 'motivo', trim(p_motivo)));
  perform public.gd_notificar_usuario(d.dueno_id, 'GD_ARCHIVADO', d.codigo_unico || ' · archivado', trim(p_motivo), p_doc);
  return jsonb_build_object('ok', true);
end $$;

-- Gerencia / SOPORTE devuelven un archivado a su estado anterior
create or replace function public.gd_restaurar_archivo(p_doc uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r text := public.gd_rol_de(auth.uid());
  d record;
  v_estado text;
begin
  select * into d from public.documents where id = p_doc for update;
  if not found or d.estado <> 'Archivado' then return jsonb_build_object('ok', false, 'error', 'El documento no está archivado.'); end if;
  if r not in ('Gerencia', 'Soporte') then
    perform public.gd_log(p_doc, uid, 'ACCESO_DENEGADO', 'Intentó restaurar un archivado', null, null);
    return jsonb_build_object('ok', false, 'error', 'Solo Gerencia o SOPORTE restauran archivados.');
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'El motivo es obligatorio (mínimo 5 caracteres).'; end if;
  -- Lo que estaba en revisión vuelve a Borrador (su ronda se anuló al archivar)
  v_estado := case when coalesce(d.estado_antes_archivo, 'Borrador') in ('En Revision', 'Pendiente') then 'Borrador' else coalesce(d.estado_antes_archivo, 'Borrador') end;
  update public.documents set estado = v_estado where id = p_doc;
  -- AUDITORÍA: RESTAURAR_ARCHIVO
  perform public.gd_log(p_doc, uid, 'RESTAURAR_ARCHIVO', 'Restaurado del archivo: ' || trim(p_motivo), jsonb_build_object('estado', 'Archivado'), jsonb_build_object('estado', v_estado, 'motivo', trim(p_motivo)));
  return jsonb_build_object('ok', true, 'estado', v_estado);
end $$;

-- Restaurar una versión anterior: crea una versión NUEVA con ese archivo (no se reescribe el historial)
create or replace function public.gd_restaurar_version(p_doc uuid, p_version text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d record;
  v record;
  v_nueva text;
  v_aprob text[];
  v_antes jsonb;
begin
  select * into d from public.documents where id = p_doc for update;
  if not found or public.gd_nivel(p_doc, uid) < 3 or d.estado = 'Archivado' then
    perform public.gd_log(case when found then p_doc end, uid, 'ACCESO_DENEGADO', 'Intentó restaurar la versión ' || coalesce(p_version, '') || ' sin permiso de Edición', null, null);
    return jsonb_build_object('ok', false, 'error', 'No tiene permiso de Edición sobre este documento.');
  end if;
  select * into v from public.document_versions where document_id = p_doc and version = p_version;
  if not found then return jsonb_build_object('ok', false, 'error', 'Versión no encontrada.'); end if;
  if v.version = d.version_actual then return jsonb_build_object('ok', false, 'error', 'Esa ya es la versión actual.'); end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'El motivo es obligatorio (mínimo 5 caracteres).'; end if;

  v_nueva := 'v' || split_part(substr(d.version_actual, 2), '.', 1) || '.' || (split_part(substr(d.version_actual, 2), '.', 2)::integer + 1);
  v_antes := public.gd_foto(p_doc);
  insert into public.document_versions (document_id, version, archivo_url, hash_sha256, cambiado_por, motivo_cambio, archivo_nombre, archivo_tipo, archivo_bytes, restaurada_de)
  values (p_doc, v_nueva, v.archivo_url, v.hash_sha256, uid, 'Restaurada desde ' || v.version || ': ' || trim(p_motivo), v.archivo_nombre, v.archivo_tipo, v.archivo_bytes, v.version);
  update public.approval_workflow set estado = 'Anulado' where document_id = p_doc and estado in ('Pendiente', 'En Espera');
  select array_agg(aprobador_rol order by paso) into v_aprob from public.approval_workflow
   where document_id = p_doc and version = (select version from public.approval_workflow where document_id = p_doc order by creado_at desc, paso limit 1);
  update public.documents set version_actual = v_nueva, archivo_url = v.archivo_url, hash_sha256 = v.hash_sha256, archivo_nombre = v.archivo_nombre,
                              archivo_tipo = v.archivo_tipo, archivo_bytes = v.archivo_bytes, integridad = 'SIN_VERIFICAR', estado = 'En Revision'
   where id = p_doc;
  perform public.gd_crear_ronda(p_doc, v_nueva, coalesce(v_aprob, array['Gerencia']));
  -- AUDITORÍA: RESTAURAR_VERSION con hash anterior y nuevo
  perform public.gd_log(p_doc, uid, 'RESTAURAR_VERSION', d.version_actual || ' → ' || v_nueva || ' (copia de ' || v.version || ') · ' || trim(p_motivo),
                        v_antes, public.gd_foto(p_doc) || jsonb_build_object('restaurada_de', v.version), null, null, v_nueva);
  perform public.gd_notificar_rol(coalesce(v_aprob[1], 'Gerencia'), 'GD_POR_APROBAR', d.codigo_unico || ' ' || v_nueva || ' · versión restaurada por aprobar', trim(p_motivo), p_doc, uid);
  return jsonb_build_object('ok', true, 'version', v_nueva);
end $$;

-- Registro de eventos de pantalla que no pasan por otra función (abrir ficha, exportar reporte)
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
  else
    raise exception 'Evento no permitido: %', p_accion;
  end if;
  -- AUDITORÍA: VER (ficha) / EXPORTAR_REPORTE (con el hash del reporte en valor_nuevo)
  perform public.gd_log(p_doc, uid, p_accion, left(coalesce(p_detalle, ''), 500), null, p_valor);
  return jsonb_build_object('ok', true);
end $$;

-- Vencidos: Aprobado con fecha de vencimiento pasada → Vencido (lo puede disparar cualquier pantalla o pg_cron)
create or replace function public.gd_marcar_vencidos()
returns integer language plpgsql security definer set search_path = public as $$
declare
  d record;
  n integer := 0;
begin
  for d in select * from public.documents where estado = 'Aprobado' and fecha_vencimiento is not null and fecha_vencimiento < (now() at time zone 'America/Lima')::date for update skip locked loop
    update public.documents set estado = 'Vencido' where id = d.id;
    -- AUDITORÍA: VENCER (usuario SISTEMA)
    perform public.gd_log(d.id, null, 'VENCER', 'Venció el ' || to_char(d.fecha_vencimiento, 'DD/MM/YYYY'), jsonb_build_object('estado', 'Aprobado'), jsonb_build_object('estado', 'Vencido'), 'sistema', 'gd_marcar_vencidos');
    perform public.gd_notificar_usuario(d.dueno_id, 'GD_VENCIDO', d.codigo_unico || ' · documento vencido', d.nombre || ' venció el ' || to_char(d.fecha_vencimiento, 'DD/MM/YYYY'), d.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- =====================================================================
-- 10. LECTURAS PARA LA PANTALLA (validan el nivel; nunca devuelven la ruta del archivo)
-- =====================================================================

create or replace function public.gd_listar()
returns table (id uuid, codigo_unico text, nombre text, descripcion text, modulo text, categoria text, estado text, version_actual text,
               dueno_id uuid, dueno_nombre text, fecha_creacion timestamptz, fecha_vencimiento date, hash_sha256 text, es_confidencial boolean,
               referencia_externa text, sede text, archivo_nombre text, archivo_tipo text, archivo_bytes bigint, integridad text, nivel integer,
               motivo_archivo text, actualizado_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.codigo_unico, d.nombre, d.descripcion, d.modulo, d.categoria, d.estado, d.version_actual, d.dueno_id, public.gd_nombre_de(d.dueno_id),
         d.fecha_creacion, d.fecha_vencimiento, d.hash_sha256, d.es_confidencial, d.referencia_externa, d.sede, d.archivo_nombre, d.archivo_tipo,
         d.archivo_bytes, d.integridad, public.gd_nivel(d.id, auth.uid()), d.motivo_archivo, d.actualizado_at
  from public.documents d
  where public.gd_nivel(d.id, auth.uid()) >= 1
  order by d.fecha_creacion desc;
$$;

create or replace function public.gd_detalle(p_doc uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n integer := public.gd_nivel(p_doc, auth.uid());
  r text := public.gd_rol_de(auth.uid());
  w record;
begin
  if n < 1 then return null; end if;
  select * into w from public.approval_workflow wf
   where wf.document_id = p_doc and wf.estado = 'Pendiente' and wf.version = (select version_actual from public.documents where id = p_doc) order by paso limit 1;
  return jsonb_build_object(
    'nivel', n,
    'rol', r,
    'puede_resolver', w.id is not null and (r = 'Soporte' or r = w.aprobador_rol) and n >= 4 and (select dueno_id from public.documents where id = p_doc) <> uid,
    'paso_pendiente', case when w.id is not null then jsonb_build_object('paso', w.paso, 'aprobador_rol', w.aprobador_rol) end,
    'versiones', (select coalesce(jsonb_agg(jsonb_build_object('version', v.version, 'hash_sha256', v.hash_sha256, 'cambiado_por', public.gd_nombre_de(v.cambiado_por),
                    'motivo_cambio', v.motivo_cambio, 'fecha', v.fecha, 'archivo_nombre', v.archivo_nombre, 'archivo_bytes', v.archivo_bytes, 'restaurada_de', v.restaurada_de) order by v.fecha), '[]'::jsonb)
                  from public.document_versions v where v.document_id = p_doc),
    'permisos', (select coalesce(jsonb_agg(jsonb_build_object('rol', p.rol, 'permiso', p.permiso, 'otorgado_por', public.gd_nombre_de(p.otorgado_por), 'actualizado_at', p.actualizado_at) order by p.rol), '[]'::jsonb)
                  from public.document_permissions p where p.document_id = p_doc),
    'flujo', (select coalesce(jsonb_agg(jsonb_build_object('version', a.version, 'paso', a.paso, 'aprobador_rol', a.aprobador_rol, 'aprobador', public.gd_nombre_de(a.aprobador_id),
                    'estado', a.estado, 'comentario', a.comentario_obligatorio_si_rechaza, 'fecha_aprobacion', a.fecha_aprobacion) order by a.creado_at, a.paso), '[]'::jsonb)
                  from public.approval_workflow a where a.document_id = p_doc)
  );
end $$;

-- Pestaña Auditoría de un documento: Control Total, Gerencia o SOPORTE. Consultarla también queda registrado.
create or replace function public.gd_auditoria_documento(p_doc uuid)
returns setof public.audit_log language plpgsql security definer set search_path = public as $$
declare
  r text := public.gd_rol_de(auth.uid());
begin
  if not (r in ('Gerencia', 'Soporte') or public.gd_nivel(p_doc, auth.uid()) >= 5) then
    raise exception 'Solo el dueño, Control Total, Gerencia o SOPORTE ven la auditoría.';
  end if;
  -- AUDITORÍA: consultar la auditoría también deja huella
  perform public.gd_log(p_doc, auth.uid(), 'CONSULTAR_AUDITORIA', 'Abrió la pestaña Auditoría', null, null);
  return query select * from public.audit_log where document_id = p_doc order by secuencia desc;
end $$;

-- Panel Gerencia: ¿Quién descargó qué? / reportes. Filtros por usuario, documento y fechas.
create or replace function public.gd_auditoria_buscar(p_usuario text default null, p_documento text default null, p_desde date default null, p_hasta date default null,
                                                      p_acciones text[] default null, p_solo_confidencial boolean default false, p_limite integer default 2000)
returns setof public.audit_log language plpgsql stable security definer set search_path = public as $$
begin
  if public.gd_rol_de(auth.uid()) not in ('Gerencia', 'Soporte') then raise exception 'Solo Gerencia o SOPORTE.'; end if;
  return query
    select * from public.audit_log a
     where (p_usuario is null or a.usuario_nombre ilike '%' || p_usuario || '%')
       and (p_documento is null or a.codigo_documento ilike '%' || p_documento || '%' or a.nombre_documento ilike '%' || p_documento || '%')
       and (p_desde is null or (a.fecha_hora at time zone 'America/Lima')::date >= p_desde)
       and (p_hasta is null or (a.fecha_hora at time zone 'America/Lima')::date <= p_hasta)
       and (p_acciones is null or a.accion = any (p_acciones))
       and (not coalesce(p_solo_confidencial, false) or a.confidencial)
     order by a.secuencia desc
     limit greatest(1, least(coalesce(p_limite, 2000), 10000));
end $$;

-- Reporte de vencimientos (por defecto Políticas que vencen en los próximos 30 días)
create or replace function public.gd_reporte_vencimientos(p_dias integer default 30, p_categoria text default 'Politica')
returns table (codigo_unico text, nombre text, categoria text, modulo text, estado text, version_actual text, dueno_nombre text, fecha_vencimiento date, dias_restantes integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.gd_rol_de(auth.uid()) not in ('Gerencia', 'Soporte') then raise exception 'Solo Gerencia o SOPORTE.'; end if;
  return query
    select d.codigo_unico, d.nombre, d.categoria, d.modulo, d.estado, d.version_actual, public.gd_nombre_de(d.dueno_id), d.fecha_vencimiento,
           (d.fecha_vencimiento - (now() at time zone 'America/Lima')::date)::integer
      from public.documents d
     where d.fecha_vencimiento is not null and d.estado <> 'Archivado'
       and d.fecha_vencimiento <= (now() at time zone 'America/Lima')::date + coalesce(p_dias, 30)
       and (p_categoria is null or d.categoria = p_categoria)
     order by d.fecha_vencimiento;
end $$;

-- Barra estática: documentos que esperan MI aprobación
create or replace function public.gd_mis_pendientes()
returns table (id uuid, codigo_unico text, nombre text, version text, paso integer, aprobador_rol text, desde timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.codigo_unico, d.nombre, d.version_actual, w.paso, w.aprobador_rol, coalesce(w.creado_at, d.actualizado_at)
    from public.documents d
    join public.approval_workflow w on w.document_id = d.id and w.version = d.version_actual and w.estado = 'Pendiente'
   where d.estado in ('En Revision', 'Pendiente')
     and d.dueno_id <> auth.uid()
     and (public.gd_rol_de(auth.uid()) = 'Soporte' or w.aprobador_rol = public.gd_rol_de(auth.uid()))
     and public.gd_nivel(d.id, auth.uid()) >= 4
   order by w.creado_at;
$$;

-- Verificación de la cadena de hash del audit_log (detecta filas borradas o alteradas)
create or replace function public.gd_verificar_cadena()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a public.audit_log;
  prev text := repeat('0', 64);
  esperado_seq bigint := 1;
  total bigint := 0;
begin
  if public.gd_rol_de(auth.uid()) not in ('Gerencia', 'Soporte') then raise exception 'Solo Gerencia o SOPORTE.'; end if;
  for a in select * from public.audit_log order by secuencia loop
    total := total + 1;
    if a.secuencia <> esperado_seq then
      return jsonb_build_object('ok', false, 'total', total, 'secuencia', esperado_seq, 'error', 'Falta el registro N° ' || esperado_seq || ' (fue borrado)');
    end if;
    if a.hash_anterior_registro <> prev or a.hash_registro <> public.gd_audit_hash(a) then
      return jsonb_build_object('ok', false, 'total', total, 'secuencia', a.secuencia, 'error', 'El registro N° ' || a.secuencia || ' fue alterado');
    end if;
    prev := a.hash_registro;
    esperado_seq := esperado_seq + 1;
  end loop;
  return jsonb_build_object('ok', true, 'total', total, 'ultimo_hash', prev);
end $$;

-- =====================================================================
-- 11. SEGURIDAD: RLS y permisos de ejecución
-- =====================================================================
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_permissions enable row level security;
alter table public.approval_workflow enable row level security;
alter table public.audit_log enable row level security;
alter table public.gd_correlativos enable row level security;

-- Nadie escribe directo: solo lectura filtrada (las escrituras pasan por las funciones gd_*)
revoke insert, update, delete, truncate on public.documents, public.document_versions, public.document_permissions,
  public.approval_workflow, public.audit_log, public.gd_correlativos from anon, authenticated;
revoke all on public.documents, public.document_versions, public.document_permissions, public.approval_workflow, public.audit_log, public.gd_correlativos from anon;
grant select on public.documents, public.document_versions, public.document_permissions, public.approval_workflow, public.audit_log to authenticated;

drop policy if exists gd_documents_ver on public.documents;
create policy gd_documents_ver on public.documents for select to authenticated using (public.gd_nivel(id, auth.uid()) >= 1);
drop policy if exists gd_versions_ver on public.document_versions;
create policy gd_versions_ver on public.document_versions for select to authenticated using (public.gd_nivel(document_id, auth.uid()) >= 1);
drop policy if exists gd_permisos_ver on public.document_permissions;
create policy gd_permisos_ver on public.document_permissions for select to authenticated using (public.gd_nivel(document_id, auth.uid()) >= 1);
drop policy if exists gd_workflow_ver on public.approval_workflow;
create policy gd_workflow_ver on public.approval_workflow for select to authenticated using (public.gd_nivel(document_id, auth.uid()) >= 1);
drop policy if exists gd_audit_ver on public.audit_log;
create policy gd_audit_ver on public.audit_log for select to authenticated
  using (public.gd_rol_de(auth.uid()) in ('Gerencia', 'Soporte') or (document_id is not null and public.gd_nivel(document_id, auth.uid()) >= 5));

-- Funciones internas: nadie las llama desde el navegador
do $$
declare f text;
begin
  foreach f in array array[
    'gd_prohibir_cambio()', 'gd_documents_campos_fijos()', 'gd_audit_encadenar()',
    'gd_log(uuid, uuid, text, text, jsonb, jsonb, text, text, text)', 'gd_foto(uuid)',
    'gd_notificar_usuario(uuid, text, text, text, uuid)', 'gd_notificar_rol(text, text, text, text, uuid, uuid)',
    'gd_siguiente_codigo(text)', 'gd_crear_ronda(uuid, text, text[])', 'gd_asegurar_aprobadores(uuid, text[], uuid)',
    'gd_rol_de(uuid)', 'gd_nombre_de(uuid)', 'gd_nivel(uuid, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  -- Solo la Edge Function (service role)
  foreach f in array array[
    'gd_registrar_documento(uuid, uuid, text, text, text, text, text, text, date, boolean, text, text, text, text, text, bigint, jsonb, text[], boolean)',
    'gd_registrar_version(uuid, uuid, text, text, text, text, text, text, text, text, bigint)',
    'gd_autorizar_archivo(uuid, uuid, text, text, text, text, integer)',
    'gd_registrar_integridad(uuid, uuid, text, text, text, text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- Usuario conectado
  foreach f in array array[
    'gd_resolver(uuid, text, text)', 'gd_enviar_revision(uuid, text[])', 'gd_set_permiso(uuid, text, text, text)',
    'gd_editar_datos(uuid, text, text, date, text, boolean)', 'gd_archivar(uuid, text)', 'gd_restaurar_archivo(uuid, text)',
    'gd_restaurar_version(uuid, text, text)', 'gd_registrar_evento(uuid, text, text, jsonb)', 'gd_marcar_vencidos()',
    'gd_listar()', 'gd_detalle(uuid)', 'gd_auditoria_documento(uuid)',
    'gd_auditoria_buscar(text, text, date, date, text[], boolean, integer)', 'gd_reporte_vencimientos(integer, text)',
    'gd_mis_pendientes()', 'gd_verificar_cadena()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- RLS usa gd_nivel / gd_rol_de: el rol authenticated debe poder ejecutarlas dentro de las políticas
  execute 'grant execute on function public.gd_nivel(uuid, uuid) to authenticated, service_role';
  execute 'grant execute on function public.gd_rol_de(uuid) to authenticated, service_role';
end $$;

-- ---------------------------------------------------------------------
-- 12. BUCKET PRIVADO DE ARCHIVOS (sin políticas: solo la Edge Function con service role)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('gestion-documental', 'gestion-documental', false, 26214400) -- 25 MB
    on conflict (id) do update set public = false;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 13. (Opcional) marcar vencidos cada día a las 00:10 de Lima si pg_cron está activo
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('gd-marcar-vencidos', '10 5 * * *', 'select public.gd_marcar_vencidos()');
  end if;
exception when others then
  raise notice 'pg_cron no disponible: la pantalla marca los vencidos al abrirse.';
end $$;

-- Realtime de la barra de pendientes (opcional, si la publicación existe)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'approval_workflow') then
    alter publication supabase_realtime add table public.approval_workflow;
  end if;
end $$;

-- Prueba rápida (como SOPORTE, en el editor SQL no hay auth.uid(): use la pantalla /documentos)
-- select public.gd_prefijo('Plano');  -- PLN
-- select count(*) from public.audit_log;
