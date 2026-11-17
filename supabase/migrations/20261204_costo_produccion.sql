-- =====================================================================
-- PRODUCCIÓN › COSTO DE PRODUCCIÓN (pedido de Williams 2026-11-17)
-- Sistema AUDITADO y HOMOLOGADO: costo real por cada equipo fabricado, versiones que nunca se sobrescriben,
-- bitácora encadenada con SHA-256 y flujo Operario → Jefe de Producción → Tesorería → Gerencia.
--
-- REGLA DE ORO: no modifica ninguna tabla existente. Crea tablas nuevas y solo LEE de:
--   almacen   (tipo 'stock' = último costo, 'KARDEX' = documento de ingreso, 'ORDEN_PRODUCCION' = OP individual)
--   compras   (tipo 'orden' = OC → REQ y proveedor del último ingreso)
--   planilla  (tipo 'trabajador' = sueldo → costo por hora)
--   contable  (tipo 'ACTIVO_FIJO' = depreciación de la máquina)
--   expedientes / orden_produccion_detalles / bom_modelos (OP de lote 26W y lista de materiales)
-- Se enlaza por código: orden_produccion_id (OP-2026-0001 / 26W-003), equipo_id, requerimiento_id (REQ-…).
--
-- Tablas nuevas:
--   production_cost_config      parámetros (margen mínimo, merma máxima, tarifa kWh…)
--   production_orders           una hoja de costo por equipo a fabricar (CP-2026-0001), enlazada a la OP
--   production_costs            totales vigentes de la hoja (los calcula SOLO la base)
--   production_cost_items       líneas: MATERIAL, MANO_OBRA, CIF, ADICIONAL (nunca se borran: se anulan)
--   production_cost_versions    v0.x borrador, v1.0 Estimado, v1.x Real en proceso, v2.0 Costo Final Real
--   production_cost_audit_log   bitácora inmutable con hash encadenado (cada cambio, aunque sea S/ 0.10)
--   production_cost_approvals   firmas del flujo (sello SHA-256 + firma dibujada)
--   production_material_prices  historial de costos de cada material (alerta de alza > 10 %)
--
-- Nadie escribe directo en estas tablas: solo con las funciones pc_* (security definer), que validan el perfil,
-- calculan y dejan auditoría. UPDATE/DELETE directos quedan bloqueados por triggers.
-- Aditivo y re-ejecutable. No requiere extensiones (usa sha256() nativo de PostgreSQL 11+).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Tablas
-- ---------------------------------------------------------------------
create table if not exists public.production_cost_config (
  id smallint primary key default 1 check (id = 1),
  margen_minimo numeric(6, 4) not null default 0.20,      -- 20 %: por debajo, ALERTA y exige aprobación expresa de Gerencia
  margen_deseado numeric(6, 4) not null default 0.30,     -- margen por defecto para el precio de venta sugerido
  merma_maxima numeric(6, 4) not null default 0.05,       -- 5 %: por encima, exige justificación y plan de mejora
  alza_material numeric(6, 4) not null default 0.10,      -- 10 %: alerta de material más caro que la compra anterior
  horas_jornada numeric(5, 2) not null default 8,         -- jornada para el costo por hora del trabajador
  horas_maquina_mes numeric(7, 2) not null default 208,   -- horas de uso de una máquina al mes (26 días × 8 h)
  tarifa_kwh numeric(10, 4) not null default 0,           -- S/ por kWh (del recibo de luz): 0 = falta configurar
  cargas_sociales numeric(6, 4) not null default 0,       -- recargo sobre el costo hora (ej. 0.09 EsSalud)
  updated_at timestamptz not null default now(),
  updated_by text
);
do $$
begin
  perform set_config('pc.rpc', 'on', true);   -- en una re-ejecución el trigger pc_solo_rpc ya existe
  insert into public.production_cost_config (id) values (1) on conflict (id) do nothing;
end $$;

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,                             -- CP-2026-0001 (hoja de costo)
  origen text not null check (origen in ('OP', 'LOTE')),   -- OP individual (almacen) o equipo de un lote 26W
  orden_produccion_id text not null,                        -- OP-2026-0001 / 26W-003
  equipo_id text,                                           -- orden_produccion_detalles.id (lote) o equipo terminado
  requerimiento_ids text[] not null default '{}',
  tipo_equipo text not null,
  modelo text,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  cliente_proyecto text,
  responsable text,
  fecha_inicio date,
  fecha_fin_estimada date,
  estado text not null default 'BORRADOR'
    check (estado in ('BORRADOR', 'EN_REVISION', 'REVISADO', 'VALIDADO', 'APROBADO', 'CERRADO', 'RECHAZADO', 'ANULADO')),
  enviado_por uuid, enviado_usuario text, enviado_at timestamptz,
  revisado_por uuid, revisado_usuario text, revisado_at timestamptz,
  validado_por uuid, validado_usuario text, validado_at timestamptz,
  aprobado_por uuid, aprobado_usuario text, aprobado_at timestamptz,
  cerrado_por uuid, cerrado_usuario text, cerrado_at timestamptz,
  motivo_estado text,
  created_by uuid default auth.uid(),
  created_usuario text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists production_orders_op_uidx
  on public.production_orders (orden_produccion_id, coalesce(equipo_id, '')) where estado <> 'ANULADO';
create index if not exists production_orders_tipo_idx on public.production_orders (tipo_equipo, estado);

create table if not exists public.production_costs (
  orden_id uuid primary key references public.production_orders (id),
  materiales numeric(14, 2) not null default 0,
  mano_obra numeric(14, 2) not null default 0,
  cif numeric(14, 2) not null default 0,
  transporte numeric(14, 2) not null default 0,
  tercerizacion numeric(14, 2) not null default 0,
  merma_pct numeric(6, 4) not null default 0,
  merma_monto numeric(14, 2) not null default 0,
  adicionales numeric(14, 2) not null default 0,
  costo_total numeric(14, 2) not null default 0,
  costo_unitario numeric(14, 2) not null default 0,
  margen_deseado numeric(6, 4) not null default 0.30,
  margen_minimo numeric(6, 4) not null default 0.20,
  merma_maxima numeric(6, 4) not null default 0.05,
  precio_venta numeric(14, 2) not null default 0,          -- precio de venta UNITARIO sin IGV
  precio_sugerido numeric(14, 2) not null default 0,
  margen_real numeric(8, 4),
  alerta_margen boolean not null default false,
  alerta_merma boolean not null default false,
  justificacion_merma text,
  plan_mejora text,
  costo_estimado numeric(14, 2),                            -- total de la v1.0
  costo_estimado_unitario numeric(14, 2),
  version_actual text,
  hash text,
  updated_at timestamptz not null default now(),
  updated_usuario text
);

create table if not exists public.production_cost_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.production_orders (id),
  seccion text not null check (seccion in ('MATERIAL', 'MANO_OBRA', 'CIF', 'ADICIONAL')),
  subtipo text check (subtipo is null or subtipo in ('ENERGIA', 'DEPRECIACION', 'MANTENIMIENTO', 'OTROS', 'TRANSPORTE', 'TERCERIZACION')),
  codigo text,
  descripcion text not null,
  unidad text,
  stock_id text,
  requerimiento_id text,
  documento_origen text,
  trabajador_id text,
  activo_id text,
  proveedor text,
  cantidad numeric(14, 4) not null check (cantidad >= 0),   -- cantidad / horas / horas máquina
  costo_unitario numeric(14, 4) not null check (costo_unitario >= 0), -- costo u. / costo hora / tarifa kWh
  potencia_kw numeric(10, 3),
  subtotal numeric(14, 2) generated always as (round(cantidad * costo_unitario * coalesce(potencia_kw, 1), 2)) stored,
  costo_origen numeric(14, 4),                               -- lo que dice Almacén / Planilla / Activos
  origen_costo text not null check (origen_costo in ('ALMACEN', 'PLANILLA', 'ACTIVO', 'CONFIG', 'MANUAL')),
  manual boolean not null default false,
  motivo_manual text,
  justificacion text,
  estado text not null default 'ACTIVO' check (estado in ('ACTIVO', 'ANULADO')),
  motivo_anulacion text,
  anulado_usuario text,
  anulado_at timestamptz,
  hash text not null,
  orden smallint not null default 0,
  created_usuario text,
  created_at timestamptz not null default now(),
  updated_usuario text,
  updated_at timestamptz not null default now()
);
create index if not exists production_cost_items_orden_idx on public.production_cost_items (orden_id, seccion);
create index if not exists production_cost_items_stock_idx on public.production_cost_items (stock_id) where stock_id is not null;

create table if not exists public.production_cost_versions (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.production_orders (id),
  version text not null,
  mayor smallint not null,
  menor smallint not null,
  tipo text not null check (tipo in ('BORRADOR', 'ESTIMADO', 'REAL_EN_PROCESO', 'FINAL_REAL')),
  motivo text,
  snapshot jsonb not null,
  costo_total numeric(14, 2) not null,
  costo_unitario numeric(14, 2) not null,
  margen_real numeric(8, 4),
  hash_anterior text,
  hash text not null,
  usuario text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (orden_id, mayor, menor)
);

create table if not exists public.production_cost_audit_log (
  id bigint generated always as identity primary key,
  orden_produccion_id uuid references public.production_orders (id),  -- hoja de costo
  codigo_op text,                                                      -- OP-2026-0001 / 26W-003 (código de la OP enlazada)
  codigo_hoja text,
  item_id uuid,
  usuario text,
  usuario_id uuid,
  accion text not null check (accion in ('CREAR', 'EDITAR_COSTO', 'APROBAR', 'RECHAZAR', 'CAMBIAR_PROVEEDOR', 'CERRAR_ORDEN',
                                         'ANULAR', 'ACTUALIZACION_AUTOMATICA', 'FIJAR_ESTIMADO', 'ENVIAR_APROBACION', 'EXPORTAR_PDF', 'CONFIGURAR')),
  fecha_hora timestamptz not null default clock_timestamp(),
  ip text,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  motivo text,
  hash_anterior text,
  hash_registro text
);
create index if not exists production_cost_audit_orden_idx on public.production_cost_audit_log (orden_produccion_id, id);

create table if not exists public.production_cost_approvals (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.production_orders (id),
  etapa text not null check (etapa in ('JEFE_PRODUCCION', 'TESORERIA', 'GERENCIA')),
  decision text not null check (decision in ('APROBADO', 'RECHAZADO')),
  usuario text,
  usuario_id uuid,
  nombre text,
  cargo text,
  version text,
  version_hash text,
  motivo text,
  firma text,                 -- imagen de la firma dibujada (data:image/png)
  sello text not null,        -- SHA-256(version_hash | usuario | etapa | decisión | fecha): firma digital
  created_at timestamptz not null default now()
);
create index if not exists production_cost_approvals_orden_idx on public.production_cost_approvals (orden_id, created_at);

create table if not exists public.production_material_prices (
  id bigint generated always as identity primary key,
  stock_id text not null,
  producto text,
  costo numeric(14, 4) not null,
  documento text,
  requerimiento_id text,
  proveedor text,
  orden_id uuid,
  fecha timestamptz not null default now()
);
create index if not exists production_material_prices_stock_idx on public.production_material_prices (stock_id, id desc);

-- ---------------------------------------------------------------------
-- 1. Inmutabilidad: bitácora, versiones, firmas e historial de precios solo aceptan INSERT.
--    Hojas, totales y líneas solo cambian dentro de las funciones pc_* (bandera pc.rpc) y nunca se borran.
-- ---------------------------------------------------------------------
create or replace function public.pc_inmutable() returns trigger language plpgsql as $$
begin
  raise exception 'COMBOY VID · % es un registro de auditoría: no se puede %. Solo se agregan registros nuevos.', tg_table_name, lower(tg_op)
    using errcode = '42501';
end $$;

create or replace function public.pc_solo_rpc() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'COMBOY VID · No existe "eliminar costo": use "Anular con motivo" (queda en auditoría).' using errcode = '42501';
  end if;
  if coalesce(current_setting('pc.rpc', true), '') <> 'on' then
    raise exception 'COMBOY VID · % solo se modifica desde Costo de Producción (funciones pc_*), con auditoría.', tg_table_name using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['production_cost_audit_log', 'production_cost_versions', 'production_cost_approvals', 'production_material_prices'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_inmutable', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.pc_inmutable()', t || '_inmutable', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.pc_inmutable()', t || '_no_truncate', t);
  end loop;
  foreach t in array array['production_orders', 'production_costs', 'production_cost_items', 'production_cost_config'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_solo_rpc', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.pc_solo_rpc()', t || '_solo_rpc', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.pc_inmutable()', t || '_no_truncate', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Hash SHA-256 y bitácora encadenada
-- ---------------------------------------------------------------------
create or replace function public.pc_sha256(t text) returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(t, ''), 'UTF8')), 'hex');
$$;

-- Texto canónico de un registro de la bitácora (jsonb ordena las claves: siempre el mismo texto).
create or replace function public.pc_audit_texto(r public.production_cost_audit_log) returns text language sql immutable as $$
  select concat_ws('|', r.hash_anterior, r.id::text, coalesce(r.orden_produccion_id::text, ''), coalesce(r.codigo_op, ''), coalesce(r.codigo_hoja, ''),
                   coalesce(r.item_id::text, ''), coalesce(r.usuario, ''), r.accion,
                   to_char(r.fecha_hora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), coalesce(r.ip, ''),
                   coalesce(r.valor_anterior::text, ''), coalesce(r.valor_nuevo::text, ''), coalesce(r.motivo, ''));
$$;

create or replace function public.pc_audit_encadenar() returns trigger language plpgsql as $$
declare prev text;
begin
  perform pg_advisory_xact_lock(77100421);                -- una sola cadena: los registros quedan en fila
  select hash_registro into prev from public.production_cost_audit_log order by id desc limit 1;
  new.fecha_hora := clock_timestamp();
  new.hash_anterior := coalesce(prev, repeat('0', 64));
  new.hash_registro := public.pc_sha256(public.pc_audit_texto(new));
  return new;
end $$;
drop trigger if exists production_cost_audit_log_hash on public.production_cost_audit_log;
create trigger production_cost_audit_log_hash before insert on public.production_cost_audit_log
  for each row execute function public.pc_audit_encadenar();

-- ---------------------------------------------------------------------
-- 3. Usuario, perfil e IP
-- ---------------------------------------------------------------------
create or replace function public.pc_yo() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j jsonb; perfil text; rol text; mod text;
begin
  select to_jsonb(p) into j from public.perfiles p where p.id = auth.uid();
  if j is null then return jsonb_build_object('perfil', 'OTRO'); end if;
  rol := coalesce(j ->> 'rol', '');
  mod := upper(coalesce(j ->> 'modulo_asignado', ''));
  perfil := case
    when rol = 'sucursal' then 'OTRO'                                      -- Secocha no fabrica
    when rol in ('creador', 'soporte') or coalesce((j ->> 'es_admin')::boolean, false) then 'SOPORTE'
    when rol = 'gerencia' then 'GERENCIA'
    when rol = 'produccion' or mod = 'PRODUCCION' then 'PRODUCCION'
    when rol in ('tesoreria', 'finanzas') or (mod = 'FINANZAS' and rol <> 'planilla') then 'FINANZAS'
    when rol = 'logistica' or mod = 'LOGISTICA' then 'LOGISTICA'
    when rol = 'almacen' or mod = 'ALMACEN' then 'ALMACEN'
    else 'OTRO' end;
  return jsonb_build_object(
    'id', auth.uid(),
    'usuario', coalesce(j ->> 'usuario', ''),
    'nombre', coalesce(nullif(j ->> 'nombre_completo', ''), nullif(j ->> 'nombre', ''), j ->> 'usuario', ''),
    'cargo', coalesce(j ->> 'cargo', ''),
    'perfil', perfil,
    'solo_lectura', coalesce((j ->> 'solo_lectura')::boolean, false));
end $$;

create or replace function public.pc_puede_leer() returns boolean language sql stable security definer set search_path = public as $$
  select public.pc_yo() ->> 'perfil' in ('SOPORTE', 'PRODUCCION', 'FINANZAS', 'GERENCIA', 'LOGISTICA');
$$;

create or replace function public.pc_ip() returns text language plpgsql stable as $$
declare h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then h := null;
  end;
  return coalesce(nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''), h ->> 'cf-connecting-ip', h ->> 'x-real-ip', host(inet_client_addr()), 'desconocida');
end $$;

-- Exige un perfil (lista) y que no sea solo lectura (salvo Gerencia, que en este submódulo sí aprueba).
create or replace function public.pc_exigir(perfiles text[]) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare yo jsonb := public.pc_yo();
begin
  if auth.uid() is null then raise exception 'Sesión no válida.' using errcode = '42501'; end if;
  if not (yo ->> 'perfil' = any (perfiles)) then
    raise exception 'Su perfil (%) no puede hacer esta acción en Costo de Producción.', yo ->> 'perfil' using errcode = '42501';
  end if;
  if (yo ->> 'solo_lectura')::boolean and yo ->> 'perfil' <> 'GERENCIA' then
    raise exception 'Su usuario es de solo lectura.' using errcode = '42501';
  end if;
  return yo;
end $$;

create or replace function public.pc_auditar(p_orden uuid, p_item uuid, p_accion text, p_anterior jsonb, p_nuevo jsonb, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare yo jsonb := public.pc_yo(); o record;
begin
  select codigo, orden_produccion_id into o from public.production_orders where id = p_orden;
  insert into public.production_cost_audit_log (orden_produccion_id, codigo_op, codigo_hoja, item_id, usuario, usuario_id, accion, ip, valor_anterior, valor_nuevo, motivo)
  values (p_orden, o.orden_produccion_id, o.codigo, p_item, coalesce(nullif(yo ->> 'usuario', ''), 'sistema'), auth.uid(), p_accion, public.pc_ip(), p_anterior, p_nuevo, nullif(trim(coalesce(p_motivo, '')), ''));
end $$;

-- Aviso en la campana (tabla notificaciones de 20261107). Gerencia: un aviso por usuario de gerencia.
create or replace function public.pc_notificar(p_modulo text, p_titulo text, p_mensaje text, p_orden uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o record; href text; u record;
begin
  if to_regclass('public.notificaciones') is null then return; end if;
  select codigo, orden_produccion_id into o from public.production_orders where id = p_orden;
  href := case p_modulo when 'FINANZAS' then '/finanzas/costos-produccion' when 'GERENCIA' then '/gerencia/costos-produccion' else '/produccion/costos' end
          || '?hoja=' || o.codigo;
  if p_modulo = 'GERENCIA' then
    for u in select id from public.perfiles where rol = 'gerencia' loop
      insert into public.notificaciones (modulo, tipo, titulo, mensaje, asignado_a, href, datos)
      values ('GERENCIA', 'COSTO_PRODUCCION', p_titulo, p_mensaje, u.id, href, jsonb_build_object('hoja', o.codigo, 'op', o.orden_produccion_id));
    end loop;
  else
    insert into public.notificaciones (modulo, tipo, titulo, mensaje, href, datos)
    values (p_modulo, 'COSTO_PRODUCCION', p_titulo, p_mensaje, href, jsonb_build_object('hoja', o.codigo, 'op', o.orden_produccion_id));
  end if;
exception when others then
  raise warning 'pc_notificar: %', sqlerrm;   -- un aviso nunca bloquea el flujo
end $$;

-- ---------------------------------------------------------------------
-- 4. Lecturas de los módulos actuales (solo lectura)
-- ---------------------------------------------------------------------
-- Último costo del producto en Almacén (almacen tipo 'stock').
create or replace function public.pc_stock(p_stock_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if p_stock_id is null or to_regclass('public.almacen') is null then return null; end if;
  select a.data || jsonb_build_object('id', a.id) into r from public.almacen a where a.tipo = 'stock' and (a.id = p_stock_id or a.data ->> 'id' = p_stock_id) limit 1;
  return r;
end $$;

-- Documento del último ingreso del producto (kardex) y, si fue por OC, su REQ y proveedor.
create or replace function public.pc_ultimo_ingreso(p_stock_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare doc text; oc text; c jsonb;
begin
  if p_stock_id is null or to_regclass('public.almacen') is null then return '{}'::jsonb; end if;
  select a.data ->> 'documento' into doc from public.almacen a
   where a.tipo = 'KARDEX' and a.data ->> 'stock_id' = p_stock_id and a.data ->> 'tipo_movimiento' in ('INGRESO', 'SALDO_INICIAL', 'TRANSFERENCIA')
   order by a.data ->> 'fecha' desc limit 1;
  if doc is null then return '{}'::jsonb; end if;
  oc := trim(split_part(doc, '·', 1));
  if to_regclass('public.compras') is not null then
    select x.data into c from public.compras x where x.tipo = 'orden' and x.data ->> 'numero' = oc limit 1;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('documento', doc, 'oc', case when c is not null then oc end,
                                              'req', c ->> 'reqNumero', 'proveedor', c ->> 'proveedor'));
end $$;

-- Costo por hora del trabajador (planilla tipo 'trabajador'): misma regla de la planilla
-- (diario = sueldo / divisor del tipo de sueldo; mensual con pago mensual = 27 días) ÷ horas de la jornada.
create or replace function public.pc_costo_hora(p_trabajador text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d jsonb; cfg public.production_cost_config; sueldo numeric; tipo text; div numeric; hora numeric;
begin
  if p_trabajador is null or to_regclass('public.planilla') is null then return null; end if;
  select p.data || jsonb_build_object('id', p.id) into d from public.planilla p where p.tipo = 'trabajador' and (p.id = p_trabajador or p.data ->> 'id' = p_trabajador) limit 1;
  if d is null then return null; end if;
  select * into cfg from public.production_cost_config where id = 1;
  sueldo := coalesce(nullif(d ->> 'sueldo', '')::numeric, 0);
  tipo := coalesce(d ->> 'tipoSueldo', 'DIARIO');
  if tipo = 'POR_HORA' then
    hora := sueldo;
  else
    div := case tipo when 'SEMANAL' then 6 when 'QUINCENAL' then 13 when 'POR_CONTRATO' then 30
                     when 'MENSUAL' then case when d ->> 'frecuenciaPago' = 'MENSUAL' then 27 else 26 end else 1 end;
    hora := sueldo / div / nullif(cfg.horas_jornada, 0);
  end if;
  hora := round(coalesce(hora, 0) * (1 + cfg.cargas_sociales), 4);
  return jsonb_build_object('id', d ->> 'id', 'nombre', d ->> 'nombre', 'cargo', d ->> 'cargo', 'activo', coalesce((d ->> 'activo')::boolean, true), 'costo_hora', hora);
end $$;

-- Depreciación por hora de una máquina (contable tipo 'ACTIVO_FIJO', lineal como lib/activos.ts):
-- mensual = (costo − valor residual) × tasa / 1200; por hora = mensual / horas de uso al mes.
create or replace function public.pc_dep_hora(p_activo text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d jsonb; cfg public.production_cost_config; mensual numeric;
begin
  if p_activo is null or to_regclass('public.contable') is null then return null; end if;
  select c.data || jsonb_build_object('id', c.id) into d from public.contable c
   where c.tipo = 'ACTIVO_FIJO' and (c.id = p_activo or c.data ->> 'id' = p_activo or c.data ->> 'codigo' = p_activo) limit 1;
  if d is null then return null; end if;
  select * into cfg from public.production_cost_config where id = 1;
  mensual := greatest(coalesce(nullif(d ->> 'costo', '')::numeric, 0) - coalesce(nullif(d ->> 'valorResidual', '')::numeric, 0), 0)
             * coalesce(nullif(d ->> 'tasaAnual', '')::numeric, 10) / 1200;
  return jsonb_build_object('id', d ->> 'id', 'codigo', d ->> 'codigo', 'nombre', d ->> 'nombre', 'categoria', d ->> 'categoria',
                            'dep_mensual', round(mensual, 2), 'dep_hora', round(mensual / nullif(cfg.horas_maquina_mes, 0), 4));
end $$;

-- Catálogos para el formulario (devuelven solo lo necesario: nadie ve sueldos, solo el costo por hora).
create or replace function public.pc_catalogo_stock(p_q text default '') returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pc_puede_leer() or to_regclass('public.almacen') is null then return; end if;
  return query
    select jsonb_build_object('id', a.id, 'nombre', a.data ->> 'nombre', 'unidad', a.data ->> 'unidad', 'sede', a.data ->> 'sede',
                              'sku', a.data ->> 'sku', 'cantidad', coalesce(nullif(a.data ->> 'cantidad', '')::numeric, 0),
                              'costo', coalesce(nullif(a.data ->> 'costoUnit', '')::numeric, 0))
      from public.almacen a
     where a.tipo = 'stock' and (coalesce(p_q, '') = '' or (a.data ->> 'nombre') ilike '%' || p_q || '%' or (a.data ->> 'sku') ilike '%' || p_q || '%')
     order by a.data ->> 'nombre' limit 400;
end $$;

create or replace function public.pc_catalogo_trabajadores() returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pc_puede_leer() or to_regclass('public.planilla') is null then return; end if;
  return query
    select public.pc_costo_hora(p.id) from public.planilla p
     where p.tipo = 'trabajador' and coalesce((p.data ->> 'activo')::boolean, true)
     order by p.data ->> 'nombre';
end $$;

create or replace function public.pc_catalogo_maquinas() returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pc_puede_leer() or to_regclass('public.contable') is null then return; end if;
  return query
    select public.pc_dep_hora(c.id) from public.contable c
     where c.tipo = 'ACTIVO_FIJO' and coalesce(c.data ->> 'estado', 'OPERATIVO') <> 'BAJA'
     order by (c.data ->> 'categoria') <> 'MAQUINARIA', c.data ->> 'nombre';
end $$;

-- OP existentes a las que se les puede abrir hoja de costo (OP individual + equipos de cada lote 26W).
create or replace function public.pc_ops_disponibles() returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pc_puede_leer() then return; end if;
  if to_regclass('public.almacen') is not null then
    return query
      select jsonb_build_object('origen', 'OP', 'codigo', coalesce(a.data ->> 'id', a.id), 'equipo_id', null,
                                'tipo_equipo', a.data ->> 'tipo_equipo', 'modelo', a.data ->> 'modelo', 'cantidad', 1,
                                'fecha', a.data ->> 'fecha', 'estado', a.data ->> 'estado', 'cliente', null,
                                'detalle', concat_ws(' · ', a.data ->> 'codigo_chasis', a.data ->> 'marca_motor'))
        from public.almacen a
       where a.tipo = 'ORDEN_PRODUCCION' and coalesce(a.data ->> 'estado', '') <> 'ANULADA';
  end if;
  if to_regclass('public.expedientes') is not null and to_regclass('public.orden_produccion_detalles') is not null then
    return query
      select jsonb_build_object('origen', 'LOTE', 'codigo', e.codigo_expediente, 'equipo_id', d.id::text,
                                'tipo_equipo', d.tipo_equipo, 'modelo', d.modelo, 'cantidad', d.cantidad,
                                'fecha', e.created_at::date, 'estado', e.estado, 'cliente', e.datos #>> '{legal,cliente}',
                                'detalle', concat_ws(' · ', d.marca_motor, e.lote))
        from public.expedientes e join public.orden_produccion_detalles d on d.orden_id = e.id
       where e.estado <> 'ANULADO';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Cálculo (único lugar donde se calcula el costo: PROHIBIDO calcular a mano)
-- ---------------------------------------------------------------------
create or replace function public.pc_hash_item(i public.production_cost_items) returns text language sql immutable as $$
  select public.pc_sha256(concat_ws('|', i.id::text, i.orden_id::text, i.seccion, coalesce(i.subtipo, ''), coalesce(i.codigo, ''), i.descripcion,
         coalesce(i.unidad, ''), coalesce(i.stock_id, ''), coalesce(i.requerimiento_id, ''), coalesce(i.trabajador_id, ''), coalesce(i.activo_id, ''),
         coalesce(i.proveedor, ''), i.cantidad::numeric(14, 4)::text, i.costo_unitario::numeric(14, 4)::text, coalesce(i.potencia_kw::numeric(10, 3)::text, ''),
         round(i.cantidad * i.costo_unitario * coalesce(i.potencia_kw, 1), 2)::numeric(14, 2)::text,
         i.origen_costo, i.manual::text, coalesce(i.motivo_manual, ''), i.estado, coalesce(i.motivo_anulacion, '')));
$$;

create or replace function public.pc_item_json(i public.production_cost_items) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('seccion', i.seccion, 'subtipo', i.subtipo, 'codigo', i.codigo, 'descripcion', i.descripcion,
         'cantidad', i.cantidad, 'costo_unitario', i.costo_unitario, 'potencia_kw', i.potencia_kw,
         'subtotal', round(i.cantidad * i.costo_unitario * coalesce(i.potencia_kw, 1), 2),
         'proveedor', i.proveedor, 'requerimiento_id', i.requerimiento_id, 'origen_costo', i.origen_costo, 'manual', i.manual,
         'motivo_manual', i.motivo_manual, 'estado', i.estado, 'hash', i.hash));
$$;

create or replace function public.pc_hash_costo(c public.production_costs) returns text language sql immutable as $$
  select public.pc_sha256(concat_ws('|', c.orden_id::text, c.materiales::numeric(14, 2)::text, c.mano_obra::numeric(14, 2)::text, c.cif::numeric(14, 2)::text,
         c.transporte::numeric(14, 2)::text, c.tercerizacion::numeric(14, 2)::text, c.merma_pct::numeric(6, 4)::text, c.merma_monto::numeric(14, 2)::text,
         c.adicionales::numeric(14, 2)::text, c.costo_total::numeric(14, 2)::text, c.costo_unitario::numeric(14, 2)::text, c.margen_deseado::numeric(6, 4)::text,
         c.precio_venta::numeric(14, 2)::text, c.precio_sugerido::numeric(14, 2)::text, coalesce(c.margen_real::numeric(8, 4)::text, ''), coalesce(c.version_actual, '')));
$$;

create or replace function public.pc_recalcular(p_orden uuid) returns public.production_costs language plpgsql security definer set search_path = public as $$
declare c public.production_costs; cant numeric; s record;
begin
  perform set_config('pc.rpc', 'on', true);
  select cantidad into cant from public.production_orders where id = p_orden;
  select
    coalesce(sum(subtotal) filter (where seccion = 'MATERIAL'), 0) as mat,
    coalesce(sum(subtotal) filter (where seccion = 'MANO_OBRA'), 0) as mo,
    coalesce(sum(subtotal) filter (where seccion = 'CIF'), 0) as cif,
    coalesce(sum(subtotal) filter (where seccion = 'ADICIONAL' and subtipo = 'TRANSPORTE'), 0) as tr,
    coalesce(sum(subtotal) filter (where seccion = 'ADICIONAL' and coalesce(subtipo, 'TERCERIZACION') <> 'TRANSPORTE'), 0) as te
  into s from public.production_cost_items where orden_id = p_orden and estado = 'ACTIVO';
  select * into c from public.production_costs where orden_id = p_orden for update;
  c.materiales := s.mat;
  c.mano_obra := s.mo;
  c.cif := s.cif;
  c.transporte := s.tr;
  c.tercerizacion := s.te;
  c.merma_monto := round(s.mat * c.merma_pct, 2);                 -- merma sobre la materia prima
  c.adicionales := round(s.tr + s.te + c.merma_monto, 2);
  c.costo_total := round(c.materiales + c.mano_obra + c.cif + c.adicionales, 2);
  c.costo_unitario := round(c.costo_total / cant, 2);
  c.precio_sugerido := case when c.margen_deseado < 1 then round(c.costo_unitario / (1 - c.margen_deseado), 2) else 0 end;
  c.margen_real := case when c.precio_venta > 0 then round((c.precio_venta - c.costo_unitario) / c.precio_venta, 4) end;
  c.alerta_margen := c.margen_real is not null and c.margen_real < c.margen_minimo;
  c.alerta_merma := c.merma_pct > c.merma_maxima;
  c.hash := public.pc_hash_costo(c);
  c.updated_at := now();
  c.updated_usuario := public.pc_yo() ->> 'usuario';
  update public.production_costs set
    materiales = c.materiales, mano_obra = c.mano_obra, cif = c.cif, transporte = c.transporte, tercerizacion = c.tercerizacion,
    merma_monto = c.merma_monto, adicionales = c.adicionales, costo_total = c.costo_total, costo_unitario = c.costo_unitario,
    precio_sugerido = c.precio_sugerido, margen_real = c.margen_real, alerta_margen = c.alerta_margen, alerta_merma = c.alerta_merma,
    hash = c.hash, updated_at = c.updated_at, updated_usuario = c.updated_usuario
  where orden_id = p_orden;
  return c;
end $$;

-- Nueva versión (nunca se sobrescribe la anterior). p_tipo: null = la que corresponde.
create or replace function public.pc_nueva_version(p_orden uuid, p_tipo text, p_motivo text) returns public.production_cost_versions
language plpgsql security definer set search_path = public as $$
declare v public.production_cost_versions; ult public.production_cost_versions; c public.production_costs; snap jsonb; tipo text; may smallint; men smallint;
begin
  perform set_config('pc.rpc', 'on', true);
  perform pg_advisory_xact_lock(hashtext('pc_version_' || p_orden::text));
  select * into ult from public.production_cost_versions where orden_id = p_orden order by mayor desc, menor desc limit 1;
  tipo := coalesce(p_tipo, case when ult.id is null or ult.mayor = 0 then 'BORRADOR' else 'REAL_EN_PROCESO' end);
  if tipo = 'BORRADOR' then may := 0; men := coalesce(case when ult.mayor = 0 then ult.menor end, 0) + 1;
  elsif tipo = 'ESTIMADO' then may := 1; men := 0;
  elsif tipo = 'REAL_EN_PROCESO' then may := 1; men := coalesce(case when ult.mayor = 1 then ult.menor end, 0) + 1;
  else may := 2; men := 0;
  end if;
  -- la versión lleva el nombre que tendrá: se fija antes de calcular el hash de los totales
  update public.production_costs set version_actual = may || '.' || men where orden_id = p_orden;
  c := public.pc_recalcular(p_orden);
  snap := jsonb_build_object(
    'hoja', (select to_jsonb(o) - 'updated_at' from public.production_orders o where o.id = p_orden),
    'costos', to_jsonb(c) - 'updated_at',
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'updated_at' - 'created_at' order by i.seccion, i.orden, i.created_at)
                         from public.production_cost_items i where i.orden_id = p_orden), '[]'::jsonb));
  v.id := gen_random_uuid();
  v.orden_id := p_orden;
  v.mayor := may;
  v.menor := men;
  v.version := may || '.' || men;
  v.tipo := tipo;
  v.motivo := p_motivo;
  v.snapshot := snap;
  v.costo_total := c.costo_total;
  v.costo_unitario := c.costo_unitario;
  v.margen_real := c.margen_real;
  v.hash_anterior := coalesce(ult.hash, repeat('0', 64));
  v.hash := public.pc_sha256(concat_ws('|', v.hash_anterior, p_orden::text, v.version, tipo, snap::text));
  v.usuario := public.pc_yo() ->> 'usuario';
  v.created_by := auth.uid();
  v.created_at := now();
  insert into public.production_cost_versions select v.*;
  if tipo = 'ESTIMADO' then
    update public.production_costs set costo_estimado = c.costo_total, costo_estimado_unitario = c.costo_unitario where orden_id = p_orden;
  end if;
  return v;
end $$;

create or replace function public.pc_snapshot_precio(p_stock_id text, p_producto text, p_costo numeric, p_orden uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ult numeric; ing jsonb;
begin
  if p_stock_id is null then return; end if;
  select costo into ult from public.production_material_prices where stock_id = p_stock_id order by id desc limit 1;
  if ult is not null and ult = p_costo then return; end if;
  ing := public.pc_ultimo_ingreso(p_stock_id);
  insert into public.production_material_prices (stock_id, producto, costo, documento, requerimiento_id, proveedor, orden_id)
  values (p_stock_id, p_producto, p_costo, ing ->> 'documento', ing ->> 'req', ing ->> 'proveedor', p_orden);
end $$;

-- ---------------------------------------------------------------------
-- 6. Crear hoja de costo (desde una OP existente)
-- ---------------------------------------------------------------------
create or replace function public.pc_crear_orden(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare yo jsonb; op jsonb; cfg public.production_cost_config; o public.production_orders; n int; cant numeric; b record; st jsonb; ing jsonb; it public.production_cost_items; k int := 0;
begin
  yo := public.pc_exigir(array['PRODUCCION', 'SOPORTE', 'LOGISTICA']);
  perform set_config('pc.rpc', 'on', true);
  select x into op from public.pc_ops_disponibles() x
   where x ->> 'codigo' = p ->> 'orden_produccion_id' and coalesce(x ->> 'equipo_id', '') = coalesce(p ->> 'equipo_id', '') limit 1;
  if op is null then raise exception 'La OP % no existe o está anulada: la hoja de costo debe enlazarse a una OP real.', p ->> 'orden_produccion_id'; end if;
  if exists (select 1 from public.production_orders where orden_produccion_id = op ->> 'codigo' and coalesce(equipo_id, '') = coalesce(op ->> 'equipo_id', '') and estado <> 'ANULADO') then
    raise exception 'La OP % ya tiene hoja de costo.', op ->> 'codigo';
  end if;
  cant := coalesce(nullif(p ->> 'cantidad', '')::numeric, (op ->> 'cantidad')::numeric, 1);
  if cant <= 0 then raise exception 'La cantidad debe ser mayor a 0.'; end if;
  if coalesce(trim(p ->> 'tipo_equipo'), '') = '' and coalesce(op ->> 'tipo_equipo', '') = '' then raise exception 'Seleccione el equipo a fabricar.'; end if;
  select * into cfg from public.production_cost_config where id = 1;
  perform pg_advisory_xact_lock(77100422);
  select coalesce(max(nullif(regexp_replace(codigo, '^CP-\d{4}-', ''), '')::int), 0) + 1 into n
    from public.production_orders where codigo like 'CP-' || to_char(now(), 'YYYY') || '-%';
  insert into public.production_orders (codigo, origen, orden_produccion_id, equipo_id, tipo_equipo, modelo, cantidad, cliente_proyecto, responsable,
                                        fecha_inicio, fecha_fin_estimada, created_by, created_usuario)
  values ('CP-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0'), op ->> 'origen', op ->> 'codigo', op ->> 'equipo_id',
          upper(coalesce(nullif(trim(p ->> 'tipo_equipo'), ''), op ->> 'tipo_equipo')), upper(coalesce(nullif(trim(p ->> 'modelo'), ''), op ->> 'modelo')), cant,
          coalesce(nullif(trim(p ->> 'cliente_proyecto'), ''), op ->> 'cliente'), nullif(trim(p ->> 'responsable'), ''),
          nullif(p ->> 'fecha_inicio', '')::date, nullif(p ->> 'fecha_fin_estimada', '')::date, auth.uid(), yo ->> 'usuario')
  returning * into o;
  insert into public.production_costs (orden_id, margen_deseado, margen_minimo, merma_maxima, precio_venta)
  values (o.id, coalesce(nullif(p ->> 'margen_deseado', '')::numeric, cfg.margen_deseado), cfg.margen_minimo, cfg.merma_maxima,
          coalesce(nullif(p ->> 'precio_venta', '')::numeric, 0));
  perform public.pc_auditar(o.id, null, 'CREAR', null, to_jsonb(o) - 'updated_at', 'Hoja de costo abierta para ' || o.orden_produccion_id);

  -- Materiales de la lista (BOM) del modelo × cantidad, con el último costo de Almacén
  if to_regclass('public.bom_modelos') is not null and o.modelo is not null then
    for b in select * from public.bom_modelos where modelo = o.modelo order by material loop
      st := coalesce(public.pc_stock(b.stock_id),
                     (select x from public.pc_catalogo_stock(b.material) x where upper(x ->> 'nombre') = upper(b.material) limit 1));
      ing := public.pc_ultimo_ingreso(st ->> 'id');
      k := k + 1;
      it := null;
      it.id := gen_random_uuid(); it.orden_id := o.id; it.seccion := 'MATERIAL'; it.codigo := st ->> 'sku'; it.descripcion := b.material; it.unidad := b.unidad;
      it.stock_id := st ->> 'id'; it.requerimiento_id := ing ->> 'req'; it.documento_origen := ing ->> 'documento'; it.proveedor := ing ->> 'proveedor';
      it.cantidad := b.cantidad * cant; it.costo_origen := coalesce((st ->> 'costo')::numeric, (st ->> 'costoUnit')::numeric);
      it.costo_unitario := coalesce(it.costo_origen, 0); it.origen_costo := case when st is null then 'MANUAL' else 'ALMACEN' end;
      it.manual := false; it.motivo_manual := case when st is null then 'Material de la BOM sin stock en Almacén: costo pendiente' end;
      it.estado := 'ACTIVO'; it.orden := k; it.created_usuario := yo ->> 'usuario'; it.created_at := now(); it.updated_at := now();
      it.hash := public.pc_hash_item(it);
      insert into public.production_cost_items (id, orden_id, seccion, codigo, descripcion, unidad, stock_id, requerimiento_id, documento_origen, proveedor,
             cantidad, costo_unitario, costo_origen, origen_costo, manual, motivo_manual, estado, orden, created_usuario, hash)
      values (it.id, it.orden_id, it.seccion, it.codigo, it.descripcion, it.unidad, it.stock_id, it.requerimiento_id, it.documento_origen, it.proveedor,
             it.cantidad, it.costo_unitario, it.costo_origen, it.origen_costo, it.manual, it.motivo_manual, it.estado, it.orden, it.created_usuario, it.hash);
      perform public.pc_auditar(o.id, it.id, 'EDITAR_COSTO', null, public.pc_item_json(it), 'Línea cargada de la lista de materiales (BOM) del modelo ' || o.modelo);
      perform public.pc_snapshot_precio(it.stock_id, it.descripcion, it.costo_unitario, o.id);
    end loop;
  end if;
  perform public.pc_nueva_version(o.id, 'BORRADOR', 'Hoja creada');
  perform public.pc_notificar('PRODUCCION', 'Hoja de costo ' || o.codigo, 'Se abrió la hoja de costo de ' || o.orden_produccion_id || ' (' || o.tipo_equipo || ').', o.id);
  return jsonb_build_object('id', o.id, 'codigo', o.codigo, 'materiales_bom', k);
end $$;

-- ---------------------------------------------------------------------
-- 7. Guardar borrador: cabecera + líneas (diferencias), cada cambio auditado y nueva versión
-- ---------------------------------------------------------------------
create or replace function public.pc_guardar(p_orden uuid, p_cabecera jsonb, p_items jsonb, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  yo jsonb; o public.production_orders; c public.production_costs; cfg public.production_cost_config;
  x jsonb; it public.production_cost_items; ant public.production_cost_items; antj jsonb; nuevoj jsonb;
  st jsonb; ing jsonb; tr jsonb; ac jsonb; costo numeric; cambios int := 0; accion text; campo text; va text; vn text; k int;
  v public.production_cost_versions; motivo_item text;
begin
  yo := public.pc_exigir(array['PRODUCCION', 'SOPORTE']);
  perform set_config('pc.rpc', 'on', true);
  select * into o from public.production_orders where id = p_orden for update;
  if o.id is null then raise exception 'Hoja de costo no encontrada.'; end if;
  if o.estado not in ('BORRADOR', 'RECHAZADO') then
    raise exception 'La hoja % está %: solo se edita en BORRADOR o RECHAZADO (pida que la rechacen con motivo para corregirla).', o.codigo, o.estado;
  end if;
  select * into c from public.production_costs where orden_id = p_orden;
  select * into cfg from public.production_cost_config where id = 1;

  -- Cabecera: cada campo que cambia queda en la bitácora
  for campo in select unnest(array['cliente_proyecto', 'responsable', 'fecha_inicio', 'fecha_fin_estimada', 'cantidad', 'tipo_equipo', 'modelo',
                                   'margen_deseado', 'precio_venta', 'merma_pct', 'justificacion_merma', 'plan_mejora']) loop
    continue when p_cabecera is null or not (p_cabecera ? campo);
    va := case when campo in ('margen_deseado', 'precio_venta', 'merma_pct', 'justificacion_merma', 'plan_mejora') then to_jsonb(c) ->> campo else to_jsonb(o) ->> campo end;
    vn := nullif(trim(p_cabecera ->> campo), '');
    if campo in ('cantidad', 'margen_deseado', 'precio_venta', 'merma_pct') then
      vn := coalesce(vn, '0');
      if vn::numeric < 0 then raise exception 'El campo % no puede ser negativo.', campo; end if;
      continue when va is not null and va::numeric = vn::numeric;
    else
      continue when coalesce(va, '') = coalesce(vn, '');
    end if;
    if campo = 'cantidad' and vn::numeric <= 0 then raise exception 'La cantidad debe ser mayor a 0.'; end if;
    if campo in ('margen_deseado', 'merma_pct') and vn::numeric >= 1 then raise exception 'El % se ingresa como fracción menor a 1 (30 %% = 0.30).', campo; end if;
    case campo
      when 'cliente_proyecto' then update public.production_orders set cliente_proyecto = vn, updated_at = now() where id = p_orden;
      when 'responsable' then update public.production_orders set responsable = vn, updated_at = now() where id = p_orden;
      when 'fecha_inicio' then update public.production_orders set fecha_inicio = vn::date, updated_at = now() where id = p_orden;
      when 'fecha_fin_estimada' then update public.production_orders set fecha_fin_estimada = vn::date, updated_at = now() where id = p_orden;
      when 'cantidad' then update public.production_orders set cantidad = vn::numeric, updated_at = now() where id = p_orden;
      when 'tipo_equipo' then update public.production_orders set tipo_equipo = upper(coalesce(vn, o.tipo_equipo)), updated_at = now() where id = p_orden;
      when 'modelo' then update public.production_orders set modelo = upper(vn), updated_at = now() where id = p_orden;
      when 'margen_deseado' then update public.production_costs set margen_deseado = vn::numeric where orden_id = p_orden;
      when 'precio_venta' then update public.production_costs set precio_venta = vn::numeric where orden_id = p_orden;
      when 'merma_pct' then update public.production_costs set merma_pct = vn::numeric where orden_id = p_orden;
      when 'justificacion_merma' then update public.production_costs set justificacion_merma = vn where orden_id = p_orden;
      when 'plan_mejora' then update public.production_costs set plan_mejora = vn where orden_id = p_orden;
    end case;
    perform public.pc_auditar(p_orden, null, 'EDITAR_COSTO', jsonb_build_object(campo, va), jsonb_build_object(campo, vn), coalesce(p_motivo, 'Cabecera: ' || campo));
    cambios := cambios + 1;
  end loop;
  select * into c from public.production_costs where orden_id = p_orden;
  if c.merma_pct > c.merma_maxima and length(coalesce(c.justificacion_merma, '')) < 15 then
    raise exception 'MERMA ALTA (% %% > % %%): escriba la justificación de la merma (mínimo 15 caracteres).', round(c.merma_pct * 100, 2), round(c.merma_maxima * 100, 2);
  end if;

  -- Líneas
  select coalesce(max(orden), 0) into k from public.production_cost_items where orden_id = p_orden;
  for x in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    ant := null;
    if nullif(x ->> 'id', '') is not null then
      select * into ant from public.production_cost_items where id = (x ->> 'id')::uuid and orden_id = p_orden for update;
      if ant.id is null then raise exception 'Línea % no pertenece a esta hoja.', x ->> 'id'; end if;
      continue when ant.estado = 'ANULADO';
    end if;
    it := ant;
    if ant.id is null then
      k := k + 1;
      it.id := gen_random_uuid(); it.orden_id := p_orden; it.orden := k; it.estado := 'ACTIVO'; it.created_usuario := yo ->> 'usuario'; it.created_at := now();
      it.seccion := upper(x ->> 'seccion');
    end if;
    if it.seccion not in ('MATERIAL', 'MANO_OBRA', 'CIF', 'ADICIONAL') then raise exception 'Sección inválida: %', x ->> 'seccion'; end if;
    it.subtipo := nullif(upper(coalesce(x ->> 'subtipo', '')), '');
    it.codigo := nullif(trim(x ->> 'codigo'), '');
    it.descripcion := nullif(trim(x ->> 'descripcion'), '');
    it.unidad := nullif(trim(x ->> 'unidad'), '');
    it.proveedor := nullif(trim(x ->> 'proveedor'), '');
    it.justificacion := nullif(trim(x ->> 'justificacion'), '');
    it.cantidad := coalesce(nullif(x ->> 'cantidad', '')::numeric, 0);
    it.potencia_kw := null;
    motivo_item := nullif(trim(coalesce(x ->> 'motivo_manual', '')), '');
    if it.cantidad < 0 then raise exception 'Cantidad negativa en "%".', it.descripcion; end if;
    costo := nullif(x ->> 'costo_unitario', '')::numeric;   -- null = el costo de Almacén / Planilla / Activos
    if costo < 0 then raise exception 'Costo negativo en "%".', it.descripcion; end if;

    if it.seccion = 'MATERIAL' then
      it.subtipo := null;
      it.stock_id := nullif(x ->> 'stock_id', '');
      st := public.pc_stock(it.stock_id);
      if it.stock_id is not null and st is null then raise exception 'El material % no existe en Almacén.', coalesce(it.descripcion, it.stock_id); end if;
      if st is not null then
        it.descripcion := coalesce(it.descripcion, st ->> 'nombre'); it.unidad := coalesce(it.unidad, st ->> 'unidad'); it.codigo := coalesce(it.codigo, st ->> 'sku');
        it.costo_origen := coalesce(nullif(st ->> 'costoUnit', '')::numeric, 0); it.origen_costo := 'ALMACEN';
        ing := public.pc_ultimo_ingreso(it.stock_id);
        it.documento_origen := ing ->> 'documento';
        it.requerimiento_id := coalesce(nullif(trim(x ->> 'requerimiento_id'), ''), ing ->> 'req', it.requerimiento_id);
        if it.proveedor is null then it.proveedor := ing ->> 'proveedor'; end if;
        if costo is null or round(costo, 4) = round(it.costo_origen, 4) then
          it.costo_unitario := it.costo_origen; it.manual := false; it.motivo_manual := null;
        elsif ant.id is not null and ant.manual and round(costo, 4) = round(ant.costo_unitario, 4) then
          it.costo_unitario := ant.costo_unitario; it.manual := true; it.motivo_manual := coalesce(motivo_item, ant.motivo_manual);
        else
          if length(coalesce(motivo_item, '')) < 10 then
            raise exception 'El costo de "%" viene de Almacén (S/ %). Para cambiarlo a S/ % escriba el MOTIVO (mínimo 10 caracteres).', it.descripcion, round(it.costo_origen, 2), round(costo, 2);
          end if;
          it.costo_unitario := costo; it.manual := true; it.motivo_manual := motivo_item;
        end if;
      else
        it.requerimiento_id := nullif(trim(x ->> 'requerimiento_id'), '');
        costo := coalesce(costo, 0);
        it.costo_origen := null; it.origen_costo := 'MANUAL'; it.costo_unitario := costo; it.manual := true;
        if (ant.id is null or round(costo, 4) <> round(ant.costo_unitario, 4)) and length(coalesce(motivo_item, '')) < 10 then
          raise exception '"%" no está en Almacén: escriba el MOTIVO del costo manual (mínimo 10 caracteres, ej. cotización del proveedor).', coalesce(it.descripcion, 'Material');
        end if;
        it.motivo_manual := coalesce(motivo_item, ant.motivo_manual);
      end if;
    elsif it.seccion = 'MANO_OBRA' then
      it.subtipo := null;
      it.trabajador_id := nullif(x ->> 'trabajador_id', '');
      tr := public.pc_costo_hora(it.trabajador_id);
      if tr is null then raise exception 'Seleccione un trabajador de la planilla (el costo por hora no se escribe a mano).'; end if;
      it.descripcion := tr ->> 'nombre'; it.codigo := tr ->> 'id'; it.unidad := 'HORA';
      it.costo_origen := (tr ->> 'costo_hora')::numeric; it.costo_unitario := it.costo_origen; it.origen_costo := 'PLANILLA'; it.manual := false; it.motivo_manual := null;
    elsif it.seccion = 'CIF' then
      if it.subtipo not in ('ENERGIA', 'DEPRECIACION', 'MANTENIMIENTO', 'OTROS') then raise exception 'CIF: tipo inválido.'; end if;
      it.activo_id := nullif(x ->> 'activo_id', '');
      if it.subtipo = 'ENERGIA' then
        if cfg.tarifa_kwh <= 0 then raise exception 'Configure la tarifa de energía (S/ por kWh) en Parámetros antes de cargar energía.'; end if;
        it.potencia_kw := nullif(x ->> 'potencia_kw', '')::numeric;
        if coalesce(it.potencia_kw, 0) <= 0 then raise exception 'Energía: indique la potencia de la máquina en kW.'; end if;
        ac := public.pc_dep_hora(it.activo_id);
        it.descripcion := coalesce(it.descripcion, 'Energía ' || coalesce(ac ->> 'nombre', 'máquina'));
        it.unidad := 'H-MAQ'; it.costo_origen := cfg.tarifa_kwh; it.costo_unitario := cfg.tarifa_kwh; it.origen_costo := 'CONFIG'; it.manual := false; it.motivo_manual := null;
      elsif it.subtipo = 'DEPRECIACION' then
        ac := public.pc_dep_hora(it.activo_id);
        if ac is null then raise exception 'Depreciación: seleccione la máquina (activo de Finanzas › Activos).'; end if;
        it.descripcion := 'Depreciación ' || (ac ->> 'nombre'); it.codigo := ac ->> 'codigo'; it.unidad := 'H-MAQ';
        it.costo_origen := (ac ->> 'dep_hora')::numeric; it.costo_unitario := it.costo_origen; it.origen_costo := 'ACTIVO'; it.manual := false; it.motivo_manual := null;
      else
        it.cantidad := 1; it.unidad := 'GLB'; it.costo_origen := null; it.costo_unitario := coalesce(costo, 0); it.origen_costo := 'MANUAL'; it.manual := true;
        it.descripcion := coalesce(it.descripcion, initcap(lower(it.subtipo)));
        if it.subtipo = 'OTROS' and length(coalesce(it.justificacion, '')) < 10 then raise exception 'Otros indirectos: escriba la justificación (mínimo 10 caracteres).'; end if;
        it.motivo_manual := coalesce(it.justificacion, 'Monto de mantenimiento');
      end if;
    else -- ADICIONAL
      if it.subtipo not in ('TRANSPORTE', 'TERCERIZACION') then raise exception 'Costos adicionales: tipo inválido.'; end if;
      it.cantidad := 1; it.unidad := 'GLB'; it.costo_origen := null; it.costo_unitario := coalesce(costo, 0); it.origen_costo := 'MANUAL'; it.manual := true;
      it.descripcion := coalesce(it.descripcion, case it.subtipo when 'TRANSPORTE' then 'Transporte / Flete' else 'Servicio externo' end);
      it.motivo_manual := coalesce(it.justificacion, it.proveedor, 'Monto según comprobante');
    end if;
    if it.descripcion is null then raise exception 'Falta la descripción de una línea de %.', it.seccion; end if;

    it.hash := public.pc_hash_item(it);
    nuevoj := public.pc_item_json(it);
    if ant.id is null then
      insert into public.production_cost_items (id, orden_id, seccion, subtipo, codigo, descripcion, unidad, stock_id, requerimiento_id, documento_origen,
             trabajador_id, activo_id, proveedor, cantidad, costo_unitario, potencia_kw, costo_origen, origen_costo, manual, motivo_manual, justificacion,
             estado, orden, created_usuario, hash)
      values (it.id, it.orden_id, it.seccion, it.subtipo, it.codigo, it.descripcion, it.unidad, it.stock_id, it.requerimiento_id, it.documento_origen,
             it.trabajador_id, it.activo_id, it.proveedor, it.cantidad, it.costo_unitario, it.potencia_kw, it.costo_origen, it.origen_costo, it.manual,
             it.motivo_manual, it.justificacion, 'ACTIVO', it.orden, it.created_usuario, it.hash);
      perform public.pc_auditar(p_orden, it.id, 'EDITAR_COSTO', null, nuevoj, coalesce(it.motivo_manual, p_motivo, 'Línea agregada'));
      cambios := cambios + 1;
    elsif it.hash <> ant.hash then
      antj := public.pc_item_json(ant);
      accion := case when coalesce(ant.proveedor, '') <> coalesce(it.proveedor, '') then 'CAMBIAR_PROVEEDOR' else 'EDITAR_COSTO' end;
      update public.production_cost_items set subtipo = it.subtipo, codigo = it.codigo, descripcion = it.descripcion, unidad = it.unidad, stock_id = it.stock_id,
             requerimiento_id = it.requerimiento_id, documento_origen = it.documento_origen, trabajador_id = it.trabajador_id, activo_id = it.activo_id,
             proveedor = it.proveedor, cantidad = it.cantidad, costo_unitario = it.costo_unitario, potencia_kw = it.potencia_kw, costo_origen = it.costo_origen,
             origen_costo = it.origen_costo, manual = it.manual, motivo_manual = it.motivo_manual, justificacion = it.justificacion,
             hash = it.hash, updated_usuario = yo ->> 'usuario', updated_at = now()
       where id = it.id;
      perform public.pc_auditar(p_orden, it.id, accion, antj, nuevoj, coalesce(motivo_item, p_motivo, 'Línea editada'));
      cambios := cambios + 1;
    end if;
    if it.seccion = 'MATERIAL' and it.stock_id is not null then perform public.pc_snapshot_precio(it.stock_id, it.descripcion, it.costo_origen, p_orden); end if;
  end loop;

  if o.estado = 'RECHAZADO' and cambios > 0 then
    update public.production_orders set estado = 'BORRADOR', updated_at = now() where id = p_orden;
  end if;
  if cambios > 0 then
    v := public.pc_nueva_version(p_orden, null, coalesce(p_motivo, 'Guardar borrador'));
  else
    perform public.pc_recalcular(p_orden);
  end if;
  return jsonb_build_object('cambios', cambios, 'version', v.version, 'costos', (select to_jsonb(pc) from public.production_costs pc where pc.orden_id = p_orden));
end $$;

-- Anular una línea (no existe eliminar)
create or replace function public.pc_anular_item(p_item uuid, p_motivo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare yo jsonb; it public.production_cost_items; ant jsonb; o public.production_orders; v public.production_cost_versions;
begin
  yo := public.pc_exigir(array['PRODUCCION', 'SOPORTE']);
  perform set_config('pc.rpc', 'on', true);
  if length(trim(coalesce(p_motivo, ''))) < 10 then raise exception 'Escriba el motivo de la anulación (mínimo 10 caracteres).'; end if;
  select * into it from public.production_cost_items where id = p_item for update;
  if it.id is null then raise exception 'Línea no encontrada.'; end if;
  if it.estado = 'ANULADO' then raise exception 'La línea ya está anulada.'; end if;
  select * into o from public.production_orders where id = it.orden_id for update;
  if o.estado not in ('BORRADOR', 'RECHAZADO') then raise exception 'La hoja % está %: no se puede anular líneas.', o.codigo, o.estado; end if;
  ant := public.pc_item_json(it);
  it.estado := 'ANULADO'; it.motivo_anulacion := trim(p_motivo);
  it.hash := public.pc_hash_item(it);
  update public.production_cost_items set estado = 'ANULADO', motivo_anulacion = it.motivo_anulacion, anulado_usuario = yo ->> 'usuario', anulado_at = now(),
         hash = it.hash, updated_usuario = yo ->> 'usuario', updated_at = now() where id = p_item;
  perform public.pc_auditar(o.id, p_item, 'ANULAR', ant, public.pc_item_json(it), trim(p_motivo));
  v := public.pc_nueva_version(o.id, null, 'Línea anulada: ' || it.descripcion);
  return jsonb_build_object('version', v.version);
end $$;

-- ---------------------------------------------------------------------
-- 8. Actualización automática: costo de Almacén, costo hora de planilla, depreciación, tarifa
--    "Costo actualizado de S/ 450.00 a S/ 520.00 por REQ-00452"
-- ---------------------------------------------------------------------
create or replace function public.pc_sincronizar(p_orden uuid) returns integer language plpgsql security definer set search_path = public as $$
declare o public.production_orders; it public.production_cost_items; ant jsonb; nuevo numeric; ref text; ing jsonb; n int := 0; cfg public.production_cost_config; msg text;
begin
  if not public.pc_puede_leer() then return 0; end if;
  perform set_config('pc.rpc', 'on', true);
  select * into o from public.production_orders where id = p_orden;
  if o.id is null or o.estado not in ('BORRADOR', 'RECHAZADO') then return 0; end if;
  if not pg_try_advisory_xact_lock(hashtext('pc_sync_' || p_orden::text)) then return 0; end if;
  select * into cfg from public.production_cost_config where id = 1;
  for it in select * from public.production_cost_items where orden_id = p_orden and estado = 'ACTIVO' and not manual and origen_costo <> 'MANUAL' for update loop
    nuevo := null; ref := null; ing := null;
    if it.origen_costo = 'ALMACEN' then
      nuevo := nullif((public.pc_stock(it.stock_id)) ->> 'costoUnit', '')::numeric;
      ing := public.pc_ultimo_ingreso(it.stock_id);
      ref := coalesce(ing ->> 'req', it.requerimiento_id, ing ->> 'documento', 'Almacén');
      if ing ->> 'oc' is not null and ing ->> 'req' is not null then ref := ref || ' (' || (ing ->> 'oc') || ')'; end if;
    elsif it.origen_costo = 'PLANILLA' then
      nuevo := ((public.pc_costo_hora(it.trabajador_id)) ->> 'costo_hora')::numeric; ref := 'planilla (sueldo del trabajador)';
    elsif it.origen_costo = 'ACTIVO' then
      nuevo := ((public.pc_dep_hora(it.activo_id)) ->> 'dep_hora')::numeric; ref := 'Activos (depreciación de la máquina)';
    elsif it.origen_costo = 'CONFIG' then
      nuevo := cfg.tarifa_kwh; ref := 'tarifa de energía (Parámetros)';
    end if;
    continue when nuevo is null or round(nuevo, 4) = round(it.costo_unitario, 4);
    ant := public.pc_item_json(it);
    msg := 'Costo actualizado de S/ ' || to_char(it.costo_unitario, 'FM999G999G990D00') || ' a S/ ' || to_char(nuevo, 'FM999G999G990D00') || ' por ' || ref;
    it.costo_origen := nuevo; it.costo_unitario := nuevo;
    if ing is not null then
      it.requerimiento_id := coalesce(ing ->> 'req', it.requerimiento_id); it.documento_origen := coalesce(ing ->> 'documento', it.documento_origen);
      it.proveedor := coalesce(ing ->> 'proveedor', it.proveedor);
    end if;
    it.hash := public.pc_hash_item(it);
    update public.production_cost_items set costo_origen = nuevo, costo_unitario = nuevo, requerimiento_id = it.requerimiento_id,
           documento_origen = it.documento_origen, proveedor = it.proveedor, hash = it.hash, updated_usuario = 'sistema', updated_at = now()
     where id = it.id;
    perform public.pc_auditar(p_orden, it.id, 'ACTUALIZACION_AUTOMATICA', ant, public.pc_item_json(it), msg);
    if it.seccion = 'MATERIAL' then perform public.pc_snapshot_precio(it.stock_id, it.descripcion, nuevo, p_orden); end if;
    n := n + 1;
  end loop;
  if n > 0 then perform public.pc_nueva_version(p_orden, null, 'Actualización automática de ' || n || ' costo(s)'); end if;
  return n;
end $$;

create or replace function public.pc_sincronizar_todas() returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not public.pc_puede_leer() then return 0; end if;
  for r in select id from public.production_orders where estado in ('BORRADOR', 'RECHAZADO') loop
    n := n + public.pc_sincronizar(r.id);
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 9. Flujo de aprobación: Operario registra → Jefe de Producción revisa → Tesorería valida → Gerencia aprueba → cierre
--    Segregación de funciones: quien aprueba una etapa no puede ser quien registró ni quien aprobó otra etapa.
-- ---------------------------------------------------------------------
create or replace function public.pc_flujo(p_orden uuid, p_accion text, p_motivo text default null, p_firma text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  yo jsonb; o public.production_orders; c public.production_costs; v public.production_cost_versions; etapa text; nuevo text; sello text;
  ultima public.production_cost_versions; motivo text := nullif(trim(coalesce(p_motivo, '')), ''); perfil text; ahora timestamptz := now();
begin
  yo := public.pc_yo();
  perfil := yo ->> 'perfil';
  perform set_config('pc.rpc', 'on', true);
  select * into o from public.production_orders where id = p_orden for update;
  if o.id is null then raise exception 'Hoja de costo no encontrada.'; end if;
  select * into c from public.production_costs where orden_id = p_orden;
  select * into ultima from public.production_cost_versions where orden_id = p_orden order by mayor desc, menor desc limit 1;
  p_accion := upper(p_accion);

  if p_accion = 'FIJAR_ESTIMADO' then
    perform public.pc_exigir(array['PRODUCCION', 'SOPORTE']);
    if o.estado not in ('BORRADOR', 'RECHAZADO') then raise exception 'Solo en borrador.'; end if;
    if exists (select 1 from public.production_cost_versions where orden_id = p_orden and mayor >= 1) then raise exception 'El costo estimado v1.0 ya está fijado y no se puede cambiar.'; end if;
    if c.costo_total <= 0 then raise exception 'Cargue los costos antes de fijar el estimado.'; end if;
    v := public.pc_nueva_version(p_orden, 'ESTIMADO', coalesce(motivo, 'Costo estimado fijado'));
    perform public.pc_auditar(p_orden, null, 'FIJAR_ESTIMADO', null, jsonb_build_object('version', v.version, 'costo_total', v.costo_total, 'hash', v.hash), coalesce(motivo, 'Costo estimado v1.0'));
    return jsonb_build_object('estado', o.estado, 'version', v.version);

  elsif p_accion = 'ENVIAR' then
    perform public.pc_exigir(array['PRODUCCION', 'SOPORTE']);
    if o.estado not in ('BORRADOR', 'RECHAZADO') then raise exception 'La hoja ya está %.', o.estado; end if;
    if ultima.mayor is null or ultima.mayor < 1 then raise exception 'Primero fije el costo estimado (v1.0): sin estimado no hay comparación Estimado vs Real.'; end if;
    perform public.pc_sincronizar(p_orden);
    select * into c from public.production_costs where orden_id = p_orden;
    if c.precio_venta <= 0 then raise exception 'Indique el precio de venta unitario: sin él no se calcula el margen real.'; end if;
    if c.alerta_merma and length(coalesce(c.plan_mejora, '')) < 20 then
      raise exception 'MERMA ALTA (% %%): el cierre queda bloqueado hasta registrar el PLAN DE MEJORA (mínimo 20 caracteres).', round(c.merma_pct * 100, 2);
    end if;
    nuevo := 'EN_REVISION';
    update public.production_orders set estado = nuevo, enviado_por = auth.uid(), enviado_usuario = yo ->> 'usuario', enviado_at = ahora,
           revisado_por = null, revisado_usuario = null, revisado_at = null, validado_por = null, validado_usuario = null, validado_at = null,
           motivo_estado = motivo, updated_at = ahora where id = p_orden;
    perform public.pc_auditar(p_orden, null, 'ENVIAR_APROBACION', jsonb_build_object('estado', o.estado), jsonb_build_object('estado', nuevo, 'version', c.version_actual, 'costo_total', c.costo_total), coalesce(motivo, 'Enviado a aprobación'));
    perform public.pc_notificar('PRODUCCION', 'Revisar costo ' || o.codigo, o.orden_produccion_id || ': costo S/ ' || to_char(c.costo_total, 'FM999G999G990D00') || ' por revisar (Jefe de Producción).', p_orden);
    return jsonb_build_object('estado', nuevo);

  elsif p_accion in ('APROBAR', 'RECHAZAR') then
    if o.estado = 'EN_REVISION' then etapa := 'JEFE_PRODUCCION'; perform public.pc_exigir(array['PRODUCCION', 'SOPORTE']);
    elsif o.estado = 'REVISADO' then etapa := 'TESORERIA'; perform public.pc_exigir(array['FINANZAS', 'SOPORTE']);
    elsif o.estado = 'VALIDADO' then etapa := 'GERENCIA'; perform public.pc_exigir(array['GERENCIA', 'SOPORTE']);
    else raise exception 'La hoja % está %: no hay nada que aprobar.', o.codigo, o.estado;
    end if;
    if auth.uid() in (o.enviado_por, o.revisado_por, o.validado_por) then
      raise exception 'Segregación de funciones: usted ya intervino en esta hoja (registró o aprobó otra etapa). Debe aprobar otra persona.';
    end if;
    if p_accion = 'RECHAZAR' and length(coalesce(motivo, '')) < 10 then raise exception 'Escriba el motivo del rechazo (mínimo 10 caracteres).'; end if;
    if p_accion = 'APROBAR' and etapa = 'GERENCIA' then
      if c.alerta_margen and length(coalesce(motivo, '')) < 15 then
        raise exception 'COSTO ELEVADO - REQUIERE APROBACIÓN DE GERENCIA: margen real % %% < mínimo % %%. Escriba el motivo de la aprobación (mínimo 15 caracteres).',
          round(c.margen_real * 100, 2), round(c.margen_minimo * 100, 2);
      end if;
      if coalesce(p_firma, '') = '' then raise exception 'Gerencia debe firmar para aprobar el cierre.'; end if;
    end if;
    if p_accion = 'APROBAR' then
      if etapa = 'GERENCIA' then
        v := public.pc_nueva_version(p_orden, 'FINAL_REAL', coalesce(motivo, 'Costo final aprobado por Gerencia'));
      else
        v := ultima;
      end if;
    else
      v := ultima;
    end if;
    sello := public.pc_sha256(concat_ws('|', v.hash, yo ->> 'usuario', etapa, p_accion, to_char(ahora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
    insert into public.production_cost_approvals (orden_id, etapa, decision, usuario, usuario_id, nombre, cargo, version, version_hash, motivo, firma, sello, created_at)
    values (p_orden, etapa, case when p_accion = 'APROBAR' then 'APROBADO' else 'RECHAZADO' end, yo ->> 'usuario', auth.uid(), yo ->> 'nombre', yo ->> 'cargo',
            v.version, v.hash, motivo, nullif(p_firma, ''), sello, ahora);
    if p_accion = 'RECHAZAR' then
      nuevo := 'RECHAZADO';
      update public.production_orders set estado = nuevo, motivo_estado = motivo, updated_at = ahora where id = p_orden;
      perform public.pc_notificar('PRODUCCION', 'Costo rechazado ' || o.codigo, o.orden_produccion_id || ': ' || motivo, p_orden);
    elsif etapa = 'JEFE_PRODUCCION' then
      nuevo := 'REVISADO';
      update public.production_orders set estado = nuevo, revisado_por = auth.uid(), revisado_usuario = yo ->> 'usuario', revisado_at = ahora, updated_at = ahora where id = p_orden;
      perform public.pc_notificar('FINANZAS', 'Validar costo ' || o.codigo, o.orden_produccion_id || ': revisado por Producción, falta validación de Tesorería.', p_orden);
    elsif etapa = 'TESORERIA' then
      nuevo := 'VALIDADO';
      update public.production_orders set estado = nuevo, validado_por = auth.uid(), validado_usuario = yo ->> 'usuario', validado_at = ahora, updated_at = ahora where id = p_orden;
      perform public.pc_notificar('GERENCIA', 'Aprobar cierre ' || o.codigo, o.orden_produccion_id || ': costo validado por Tesorería'
        || case when c.alerta_margen then ' · COSTO ELEVADO, margen ' || round(c.margen_real * 100, 1) || ' %' else '' end, p_orden);
    else
      nuevo := 'APROBADO';
      update public.production_orders set estado = nuevo, aprobado_por = auth.uid(), aprobado_usuario = yo ->> 'usuario', aprobado_at = ahora, motivo_estado = motivo, updated_at = ahora where id = p_orden;
      perform public.pc_notificar('PRODUCCION', 'Costo aprobado ' || o.codigo, o.orden_produccion_id || ': Gerencia aprobó el costo final v' || v.version || '. Ya puede cerrar la OP.', p_orden);
    end if;
    perform public.pc_auditar(p_orden, null, p_accion, jsonb_build_object('estado', o.estado),
      jsonb_build_object('estado', nuevo, 'etapa', etapa, 'version', v.version, 'version_hash', v.hash, 'sello', sello, 'margen_real', c.margen_real, 'alerta_margen', c.alerta_margen),
      coalesce(motivo, etapa || ' ' || lower(p_accion)));
    return jsonb_build_object('estado', nuevo, 'version', v.version, 'sello', sello);

  elsif p_accion = 'CERRAR' then
    perform public.pc_exigir(array['PRODUCCION', 'SOPORTE', 'GERENCIA']);
    if o.estado <> 'APROBADO' then raise exception 'Sin aprobación de Gerencia no se puede cerrar la OP (estado actual: %).', o.estado; end if;
    if c.alerta_merma and length(coalesce(c.plan_mejora, '')) < 20 then raise exception 'Merma alta: falta el plan de mejora.'; end if;
    update public.production_orders set estado = 'CERRADO', cerrado_por = auth.uid(), cerrado_usuario = yo ->> 'usuario', cerrado_at = ahora, updated_at = ahora where id = p_orden;
    perform public.pc_auditar(p_orden, null, 'CERRAR_ORDEN', jsonb_build_object('estado', o.estado), jsonb_build_object('estado', 'CERRADO', 'version', c.version_actual, 'costo_total', c.costo_total, 'hash', c.hash), coalesce(motivo, 'OP cerrada con costo final aprobado'));
    return jsonb_build_object('estado', 'CERRADO');

  elsif p_accion = 'ANULAR' then
    perform public.pc_exigir(array['PRODUCCION', 'SOPORTE']);
    if o.estado in ('CERRADO', 'ANULADO') then raise exception 'La hoja % está %: no se puede anular.', o.codigo, o.estado; end if;
    if length(coalesce(motivo, '')) < 10 then raise exception 'Escriba el motivo de la anulación (mínimo 10 caracteres).'; end if;
    update public.production_orders set estado = 'ANULADO', motivo_estado = motivo, updated_at = ahora where id = p_orden;
    perform public.pc_auditar(p_orden, null, 'ANULAR', jsonb_build_object('estado', o.estado), jsonb_build_object('estado', 'ANULADO'), motivo);
    return jsonb_build_object('estado', 'ANULADO');
  end if;
  raise exception 'Acción desconocida: %', p_accion;
end $$;

-- Parámetros (margen mínimo, merma, tarifa kWh…): SOPORTE y Finanzas, con auditoría.
create or replace function public.pc_guardar_config(p jsonb, p_motivo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare yo jsonb; ant public.production_cost_config; nuevo public.production_cost_config;
begin
  yo := public.pc_exigir(array['SOPORTE', 'FINANZAS']);
  if length(trim(coalesce(p_motivo, ''))) < 10 then raise exception 'Escriba el motivo del cambio de parámetros (mínimo 10 caracteres).'; end if;
  perform set_config('pc.rpc', 'on', true);
  select * into ant from public.production_cost_config where id = 1;
  nuevo := ant;
  nuevo.margen_minimo := coalesce(nullif(p ->> 'margen_minimo', '')::numeric, ant.margen_minimo);
  nuevo.margen_deseado := coalesce(nullif(p ->> 'margen_deseado', '')::numeric, ant.margen_deseado);
  nuevo.merma_maxima := coalesce(nullif(p ->> 'merma_maxima', '')::numeric, ant.merma_maxima);
  nuevo.alza_material := coalesce(nullif(p ->> 'alza_material', '')::numeric, ant.alza_material);
  nuevo.horas_jornada := coalesce(nullif(p ->> 'horas_jornada', '')::numeric, ant.horas_jornada);
  nuevo.horas_maquina_mes := coalesce(nullif(p ->> 'horas_maquina_mes', '')::numeric, ant.horas_maquina_mes);
  nuevo.tarifa_kwh := coalesce(nullif(p ->> 'tarifa_kwh', '')::numeric, ant.tarifa_kwh);
  nuevo.cargas_sociales := coalesce(nullif(p ->> 'cargas_sociales', '')::numeric, ant.cargas_sociales);
  if nuevo.margen_minimo not between 0 and 0.95 or nuevo.margen_deseado not between 0 and 0.95 or nuevo.merma_maxima not between 0 and 0.95
     or nuevo.alza_material not between 0 and 5 or nuevo.horas_jornada <= 0 or nuevo.horas_maquina_mes <= 0 or nuevo.tarifa_kwh < 0 or nuevo.cargas_sociales not between 0 and 1 then
    raise exception 'Parámetros fuera de rango (los porcentajes van como fracción: 20 %% = 0.20).';
  end if;
  update public.production_cost_config set margen_minimo = nuevo.margen_minimo, margen_deseado = nuevo.margen_deseado, merma_maxima = nuevo.merma_maxima,
         alza_material = nuevo.alza_material, horas_jornada = nuevo.horas_jornada, horas_maquina_mes = nuevo.horas_maquina_mes, tarifa_kwh = nuevo.tarifa_kwh,
         cargas_sociales = nuevo.cargas_sociales, updated_at = now(), updated_by = yo ->> 'usuario' where id = 1;
  -- Las hojas en borrador toman el nuevo margen mínimo / merma máxima (las enviadas conservan el suyo)
  update public.production_costs pc set margen_minimo = nuevo.margen_minimo, merma_maxima = nuevo.merma_maxima
    from public.production_orders o where o.id = pc.orden_id and o.estado in ('BORRADOR', 'RECHAZADO');
  perform public.pc_auditar(null, null, 'CONFIGURAR', to_jsonb(ant) - 'updated_at' - 'updated_by', to_jsonb(nuevo) - 'updated_at' - 'updated_by', trim(p_motivo));
  return to_jsonb(nuevo);
end $$;

-- PDF homologado: registra la exportación y devuelve la versión, su hash y las firmas.
create or replace function public.pc_registrar_pdf(p_orden uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.production_cost_versions; c public.production_costs;
begin
  if not public.pc_puede_leer() then raise exception 'Sin acceso.' using errcode = '42501'; end if;
  select * into v from public.production_cost_versions where orden_id = p_orden order by mayor desc, menor desc limit 1;
  select * into c from public.production_costs where orden_id = p_orden;
  perform public.pc_auditar(p_orden, null, 'EXPORTAR_PDF', null, jsonb_build_object('version', v.version, 'hash', v.hash), 'Ficha de costo homologada exportada');
  return jsonb_build_object('version', v.version, 'tipo', v.tipo, 'hash', v.hash, 'fecha', v.created_at, 'costo_hash', c.hash,
    'estimado', (select jsonb_build_object('version', e.version, 'hash', e.hash, 'costo_total', e.costo_total) from public.production_cost_versions e where e.orden_id = p_orden and e.mayor = 1 and e.menor = 0),
    'firmas', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.production_cost_approvals a where a.orden_id = p_orden), '[]'::jsonb),
    'integridad', public.pc_verificar(p_orden));
end $$;

-- ---------------------------------------------------------------------
-- 10. Verificación de integridad (para auditoría externa / SUNAT / cliente)
-- ---------------------------------------------------------------------
create or replace function public.pc_verificar(p_orden uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; it public.production_cost_items; prev text := repeat('0', 64); errores jsonb := '[]'::jsonb; nreg int := 0; nit int := 0; nver int := 0; vprev text := repeat('0', 64); c public.production_costs; ultimo jsonb;
begin
  if not public.pc_puede_leer() then raise exception 'Sin acceso.' using errcode = '42501'; end if;
  -- a) Bitácora: la cadena completa (un registro borrado o cambiado rompe todos los siguientes)
  for r in select l.*, public.pc_audit_texto(l) as txt from public.production_cost_audit_log l order by l.id loop
    if r.hash_anterior <> prev then errores := errores || jsonb_build_object('tipo', 'BITACORA', 'id', r.id, 'error', 'Cadena rota: falta o se alteró el registro anterior'); end if;
    if public.pc_sha256(r.txt) <> r.hash_registro then errores := errores || jsonb_build_object('tipo', 'BITACORA', 'id', r.id, 'error', 'Registro alterado (hash no coincide)'); end if;
    prev := r.hash_registro;
    if r.orden_produccion_id = p_orden then nreg := nreg + 1; end if;
  end loop;
  -- b) Líneas: hash propio y el que quedó en la bitácora en su último cambio
  for it in select i.* from public.production_cost_items i where i.orden_id = p_orden loop
    nit := nit + 1;
    if public.pc_hash_item(it) <> it.hash then
      errores := errores || jsonb_build_object('tipo', 'LINEA', 'id', it.id, 'descripcion', it.descripcion, 'error', 'Línea modificada por fuera del sistema');
    end if;
    select l.valor_nuevo into ultimo from public.production_cost_audit_log l where l.item_id = it.id order by l.id desc limit 1;
    if ultimo is null or ultimo ->> 'hash' is distinct from it.hash then
      errores := errores || jsonb_build_object('tipo', 'LINEA', 'id', it.id, 'descripcion', it.descripcion, 'error', 'El valor actual no coincide con la bitácora');
    end if;
  end loop;
  -- c) Versiones encadenadas
  for r in select v.* from public.production_cost_versions v where v.orden_id = p_orden order by v.mayor, v.menor loop
    nver := nver + 1;
    if r.hash_anterior <> vprev or public.pc_sha256(concat_ws('|', r.hash_anterior, p_orden::text, r.version, r.tipo, r.snapshot::text)) <> r.hash then
      errores := errores || jsonb_build_object('tipo', 'VERSION', 'version', r.version, 'error', 'Versión alterada o cadena rota');
    end if;
    vprev := r.hash;
  end loop;
  -- d) Totales
  select * into c from public.production_costs where orden_id = p_orden;
  if c.orden_id is not null and public.pc_hash_costo(c) <> c.hash then
    errores := errores || jsonb_build_object('tipo', 'TOTALES', 'error', 'Totales modificados por fuera del cálculo');
  end if;
  return jsonb_build_object('ok', jsonb_array_length(errores) = 0, 'registros', nreg, 'lineas', nit, 'versiones', nver, 'errores', errores, 'verificado', now());
end $$;

-- Para enlazar más adelante con Ventas / Fase 8: ¿la OP tiene costo final aprobado por Gerencia?
create or replace function public.pc_puede_facturar(p_codigo_op text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.production_orders where orden_produccion_id = p_codigo_op and estado in ('APROBADO', 'CERRADO'))
     and not exists (select 1 from public.production_orders where orden_produccion_id = p_codigo_op and estado not in ('APROBADO', 'CERRADO', 'ANULADO'));
$$;

-- ---------------------------------------------------------------------
-- 11. Permisos: lectura para Producción, Finanzas, Gerencia, Logística y Soporte. Escritura: solo funciones pc_*.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['production_cost_config', 'production_orders', 'production_costs', 'production_cost_items', 'production_cost_versions',
                           'production_cost_audit_log', 'production_cost_approvals', 'production_material_prices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.pc_puede_leer()))', t || '_leer', t);
  end loop;
end $$;

-- Funciones internas: nadie las llama directo
revoke execute on function public.pc_auditar(uuid, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.pc_notificar(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.pc_recalcular(uuid) from public, anon, authenticated;
revoke execute on function public.pc_nueva_version(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.pc_snapshot_precio(text, text, numeric, uuid) from public, anon, authenticated;
revoke execute on function public.pc_exigir(text[]) from public, anon, authenticated;
revoke execute on function public.pc_costo_hora(text) from public, anon, authenticated;
revoke execute on function public.pc_dep_hora(text) from public, anon, authenticated;
revoke execute on function public.pc_stock(text) from public, anon, authenticated;
revoke execute on function public.pc_ultimo_ingreso(text) from public, anon, authenticated;

-- Funciones que usa la pantalla
do $$
declare f text;
begin
  foreach f in array array['pc_yo()', 'pc_puede_leer()', 'pc_catalogo_stock(text)', 'pc_catalogo_trabajadores()', 'pc_catalogo_maquinas()', 'pc_ops_disponibles()',
                           'pc_crear_orden(jsonb)', 'pc_guardar(uuid, jsonb, jsonb, text)', 'pc_anular_item(uuid, text)', 'pc_sincronizar(uuid)',
                           'pc_sincronizar_todas()', 'pc_flujo(uuid, text, text, text)', 'pc_guardar_config(jsonb, text)', 'pc_registrar_pdf(uuid)',
                           'pc_verificar(uuid)', 'pc_puede_facturar(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Realtime: la pantalla se actualiza sola (otro usuario edita, Almacén cambia un costo)
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['production_orders', 'production_costs', 'production_cost_items', 'production_cost_versions', 'production_cost_approvals'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Comprobación rápida (después de correr):
-- select public.pc_yo();
-- select * from public.production_cost_config;
-- select codigo, estado from public.production_orders order by created_at desc;
-- select id, accion, usuario, fecha_hora, motivo, left(hash_registro, 12) from public.production_cost_audit_log order by id desc limit 20;
