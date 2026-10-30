-- =====================================================================
-- NOTIFICACIONES DEL FLUJO v3.0 (OP → Expediente 26W), pedido de Williams 2026-10-30.
-- Cada paso del flujo deja un aviso en public.notificaciones para el módulo que sigue:
--   1 OP creada                → PRODUCCION (Manuel Cornejo)   POR_APROBAR
--   2 Solicitud de materiales  → ALMACEN    (Jose Ortiz)       VALIDAR_STOCK
--   3 Ruta 1 stock suficiente  → PRODUCCION                    RUTA1_STOCK
--     Ruta 2 sin stock (REQ)   → LOGISTICA  (Williams)         RUTA2_REQ
--   4 OC emitida               → FINANZAS   (Lizbeth)          POR_PAGAR (con datos del proveedor)
--   5 Pago (bancarización)     → LOGISTICA                     TRANSPORTE
--   6 Guía de transporte       → ALMACEN                       RECEPCION
--   7 Acta de entrega completa → PRODUCCION                    MATERIALES_COMPLETOS
--   8 Cierre (serie, QC, zona) → ALMACEN y LOGISTICA           EXPEDIENTE_FINAL
-- Los avisos los crea la BASE (triggers): valen para cualquier pantalla o API que escriba el flujo.
-- Campana: leida = false AND (asignado_a = usuario OR modulo = su módulo). SOPORTE ve todos.
-- Aditivo: si la tabla ya existe, solo se agregan las columnas que falten. No se borra nada.
-- Requiere 20261105_expedientes_26w.sql y 20261106_perfiles_asignacion.sql.
-- =====================================================================

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.notificaciones
  add column if not exists modulo text,
  add column if not exists tipo text,
  add column if not exists titulo text,
  add column if not exists mensaje text,
  add column if not exists asignado_a uuid references auth.users (id) on delete set null,
  add column if not exists expediente_id uuid,
  add column if not exists codigo_expediente text,
  add column if not exists fase smallint,
  add column if not exists href text,
  add column if not exists datos jsonb not null default '{}'::jsonb,
  add column if not exists leida boolean not null default false,
  add column if not exists leida_at timestamptz,
  add column if not exists leida_por uuid;

create index if not exists notificaciones_pendientes_idx on public.notificaciones (modulo, leida, created_at desc);
create index if not exists notificaciones_asignado_idx on public.notificaciones (asignado_a, leida);

-- ---------------------------------------------------------------------
-- Módulo del usuario conectado: perfiles.modulo_asignado, o su rol si aún no lo tiene.
-- ---------------------------------------------------------------------
create or replace function public.mi_modulo_notif()
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.es_admin or p.rol in ('creador', 'soporte') then 'SOPORTE'
    when upper(coalesce(p.modulo_asignado, '')) in ('LOGISTICA', 'PRODUCCION', 'ALMACEN', 'FINANZAS') then upper(p.modulo_asignado)
    when p.rol = 'logistica' then 'LOGISTICA'
    when p.rol = 'produccion' then 'PRODUCCION'
    when p.rol = 'almacen' then 'ALMACEN'
    when p.rol in ('tesoreria', 'finanzas', 'planilla') then 'FINANZAS'
    else null
  end
  from public.perfiles p where p.id = auth.uid();
$$;
revoke execute on function public.mi_modulo_notif() from public, anon;
grant execute on function public.mi_modulo_notif() to authenticated, service_role;

-- RLS: cada uno ve lo suyo (asignado o de su módulo); SOPORTE ve todo. Nadie inserta ni edita directo:
-- los avisos los crean los triggers y "leída" se marca con marcar_notificaciones_leidas().
alter table public.notificaciones enable row level security;
drop policy if exists notificaciones_ver_flujo on public.notificaciones;
create policy notificaciones_ver_flujo on public.notificaciones for select to authenticated
  using (asignado_a = auth.uid() or modulo = public.mi_modulo_notif() or public.mi_modulo_notif() = 'SOPORTE');

create or replace function public.marcar_notificaciones_leidas(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  m text := public.mi_modulo_notif();
  n integer;
begin
  update public.notificaciones
     set leida = true, leida_at = now(), leida_por = auth.uid()
   where id = any (p_ids) and not leida
     and (asignado_a = auth.uid() or modulo = m or m = 'SOPORTE');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.marcar_notificaciones_leidas(uuid[]) from public, anon;
grant execute on function public.marcar_notificaciones_leidas(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Inserta un aviso. asignado_a = el titular del módulo (Manuel, Jose, Williams, Lizbeth) si hay uno solo.
-- Un fallo aquí nunca bloquea el flujo (solo deja un WARNING en el log).
-- ---------------------------------------------------------------------
create or replace function public.notificar_flujo(p_modulo text, p_tipo text, p_titulo text, p_mensaje text, p_exp_id uuid, p_codigo text, p_fase smallint, p_datos jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_asignado uuid;
begin
  select case when count(*) = 1 then (array_agg(p.id))[1] end into v_asignado
    from public.perfiles p
   where upper(coalesce(p.modulo_asignado, '')) = p_modulo
     and coalesce(p.activo, true) and not coalesce(p.es_admin, false);
  insert into public.notificaciones (modulo, tipo, titulo, mensaje, asignado_a, expediente_id, codigo_expediente, fase, href, datos)
  values (p_modulo, p_tipo, p_titulo, p_mensaje, v_asignado, p_exp_id, p_codigo, p_fase, '/erp/expediente/' || p_codigo, coalesce(p_datos, '{}'::jsonb));
exception when others then
  raise warning 'notificar_flujo(%, %): %', p_modulo, p_tipo, sqlerrm;
end $$;
revoke execute on function public.notificar_flujo(text, text, text, text, uuid, text, smallint, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Triggers sobre expedientes (fases 1, 2, 3, 6, 7, 8)
-- ---------------------------------------------------------------------
create or replace function public.expedientes_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d jsonb := coalesce(new.datos, '{}'::jsonb);
  o jsonb := case when tg_op = 'UPDATE' then coalesce(old.datos, '{}'::jsonb) else '{}'::jsonb end;
  c text := new.codigo_expediente;
  prod text := coalesce(d ->> 'producto', '');
  t jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.notificar_flujo('PRODUCCION', 'POR_APROBAR', c || ' · nueva OP ' || coalesce(new.op_id, '') || ' por aprobar',
      prod || ' · plazo ' || coalesce(new.plazo::text, '—') || ' · aceptar y pedir materiales', new.id, c, 1::smallint,
      jsonb_build_object('op_id', new.op_id, 'plazo', new.plazo, 'prioridad', d ->> 'prioridad'));
    return new;
  end if;

  if o -> 'solicitud' is null and d -> 'solicitud' is not null then
    perform public.notificar_flujo('ALMACEN', 'VALIDAR_STOCK', c || ' · validar materiales de producción',
      coalesce(jsonb_array_length(d -> 'solicitud' -> 'materiales'), 0) || ' material(es) · ' || coalesce(d -> 'solicitud' ->> 'numero', ''), new.id, c, 2::smallint,
      jsonb_build_object('solicitud', d -> 'solicitud' ->> 'numero'));
  end if;

  if o -> 'ruta' is null and d -> 'ruta' is not null then
    if (d ->> 'ruta') = '1' then
      perform public.notificar_flujo('PRODUCCION', 'RUTA1_STOCK', c || ' · Ruta 1: stock suficiente',
        'Almacén entregó todos los materiales (' || coalesce(d -> 'actaParcial' ->> 'numero', 'acta') || ') · iniciar fabricación', new.id, c, 3::smallint,
        jsonb_build_object('ruta', 1, 'acta', d -> 'actaParcial' ->> 'numero'));
    else
      perform public.notificar_flujo('LOGISTICA', 'RUTA2_REQ', c || ' · Ruta 2: sin stock, genera REQ',
        'Entrega parcial de Almacén · cotizar y emitir OC por los faltantes', new.id, c, 3::smallint,
        jsonb_build_object('ruta', 2, 'acta', d -> 'actaParcial' ->> 'numero'));
    end if;
  end if;

  if coalesce(jsonb_array_length(d -> 'transportes'), 0) > coalesce(jsonb_array_length(o -> 'transportes'), 0) then
    t := d -> 'transportes' -> (jsonb_array_length(d -> 'transportes') - 1);
    perform public.notificar_flujo('ALMACEN', 'RECEPCION', c || ' · material en camino: recibir',
      case when (t ->> 'sinFlete')::boolean then 'Entrega directa del proveedor'
           else coalesce(t ->> 'empresa', '') || ' · guía ' || coalesce(t ->> 'guiaTransportista', '') || ' · llega ' || coalesce(t ->> 'fechaEntrega', '—') end,
      new.id, c, 6::smallint,
      jsonb_build_object('empresa', t ->> 'empresa', 'guia', t ->> 'guiaTransportista', 'guia_remitente', t ->> 'guiaRemitente', 'placa', t ->> 'placa'));
  end if;

  if o -> 'actaCompleta' is null and d -> 'actaCompleta' is not null then
    perform public.notificar_flujo('PRODUCCION', 'MATERIALES_COMPLETOS', c || ' · materiales completos',
      coalesce(d -> 'actaCompleta' ->> 'numero', 'Acta completa') || ' · terminar fabricación, QC y acta PT', new.id, c, 7::smallint,
      jsonb_build_object('acta', d -> 'actaCompleta' ->> 'numero'));
  end if;

  if o -> 'cierre' is null and d -> 'cierre' is not null then
    perform public.notificar_flujo('ALMACEN', 'EXPEDIENTE_FINAL', c || ' · PT a almacén, zona ' || coalesce(d -> 'cierre' ->> 'zona', '—'),
      'Serie ' || coalesce(d -> 'cierre' ->> 'numeroSerie', '') || ' · ' || coalesce(d -> 'cierre' -> 'acta' ->> 'numero', '') || ' · expediente final', new.id, c, 8::smallint,
      jsonb_build_object('serie', d -> 'cierre' ->> 'numeroSerie', 'zona', d -> 'cierre' ->> 'zona', 'checklist', d -> 'cierre' -> 'checklist'));
    perform public.notificar_flujo('LOGISTICA', 'EXPEDIENTE_FINAL', c || ' · expediente final listo',
      'Serie ' || coalesce(d -> 'cierre' ->> 'numeroSerie', '') || ' · QC y PT en zona ' || coalesce(d -> 'cierre' ->> 'zona', '—'), new.id, c, 8::smallint,
      jsonb_build_object('serie', d -> 'cierre' ->> 'numeroSerie', 'zona', d -> 'cierre' ->> 'zona'));
  end if;
  return new;
end $$;

drop trigger if exists expedientes_notificar on public.expedientes;
create trigger expedientes_notificar after insert or update of datos on public.expedientes
  for each row execute function public.expedientes_notificar();

-- ---------------------------------------------------------------------
-- Triggers sobre ordenes_compra (fase 4 → Finanzas, fase 5 → Logística)
-- ---------------------------------------------------------------------
create or replace function public.ordenes_compra_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c text;
  p jsonb := coalesce(new.datos_proveedor, '{}'::jsonb);
begin
  select codigo_expediente into c from public.expedientes where id = new.expediente_id;
  if c is null then return new; end if;
  if tg_op = 'INSERT' then
    perform public.notificar_flujo('FINANZAS', 'POR_PAGAR', c || ' · ' || new.codigo_oc || ' por pagar',
      coalesce(p ->> 'razon_social', '') || ' · RUC ' || coalesce(p ->> 'ruc', '') || ' · ' || coalesce(p ->> 'moneda', 'PEN') || ' ' || to_char(coalesce(new.total, 0), 'FM999G999G990D00'),
      new.expediente_id, c, 4::smallint,
      jsonb_build_object('oc', new.codigo_oc, 'total', new.total, 'proveedor', p));
  elsif old.bancarizacion is null and new.bancarizacion is not null then
    perform public.notificar_flujo('LOGISTICA', 'TRANSPORTE', c || ' · ' || new.codigo_oc || ' pagada: coordinar transporte',
      coalesce(new.bancarizacion ->> 'medio_pago', '') || ' · ' || coalesce(new.bancarizacion ->> 'banco', '') || ' · op. ' || coalesce(new.bancarizacion ->> 'codigo_operacion', '—'),
      new.expediente_id, c, 5::smallint,
      jsonb_build_object('oc', new.codigo_oc, 'bancarizacion', new.bancarizacion));
  end if;
  return new;
end $$;

drop trigger if exists ordenes_compra_notificar on public.ordenes_compra;
create trigger ordenes_compra_notificar after insert or update of bancarizacion on public.ordenes_compra
  for each row execute function public.ordenes_compra_notificar();

-- Campana en vivo
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones') then
    alter publication supabase_realtime add table public.notificaciones;
  end if;
end $$;

-- Verificación:
-- select modulo, tipo, titulo, asignado_a, leida from public.notificaciones order by created_at desc limit 20;
