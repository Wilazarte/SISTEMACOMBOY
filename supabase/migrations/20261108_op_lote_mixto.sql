-- =====================================================================
-- FASE 1 · OP DE LOTE MIXTO (pedido de Williams 2026-10-30, corrección jefe de Logística).
-- Una OP = un expediente 26W (public.expedientes ya es la "orden de producción": código 26W-XXX,
-- lote, plazo, prioridad, costo estimado). Aquí se agrega:
--   expedientes.almacen_destino / total_unidades / es_lote_mixto
--   orden_produccion_detalles → equipos del lote (tipo, marca de motor, modelo, cantidad);
--                               chasis y serie se llenan en la Fase 8 (unidades jsonb, una por equipo).
--   bom_modelos               → lista de materiales por modelo; en la Fase 2 BOM × cantidad = costo estimado.
--   crear_op_lote()           → crea expediente + detalles en una sola transacción (LOTE-2026-W45 automático).
--   Aviso nuevo: al crear la OP, Almacén recibe "revisar previsiones" (además de Producción).
-- Aditivo: no borra datos; las OP anteriores (un equipo, con chasis) siguen igual.
-- Requiere 20261105_expedientes_26w.sql y 20261107_notificaciones_flujo.sql.
-- =====================================================================

alter table public.expedientes
  add column if not exists almacen_destino text,
  add column if not exists total_unidades integer not null default 0,
  add column if not exists es_lote_mixto boolean not null default false;

create table if not exists public.orden_produccion_detalles (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.expedientes (id) on delete cascade,
  tipo_equipo text not null,
  marca_motor text not null,
  modelo text not null,
  cantidad integer not null check (cantidad > 0),
  -- Fase 8: si cantidad = 1 basta con estas dos; con más unidades, una por equipo en `unidades`
  codigo_chasis text,
  serie_motor text,
  unidades jsonb not null default '[]'::jsonb,
  costo_bom numeric(14, 2) not null default 0,
  orden smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists orden_produccion_detalles_orden_idx on public.orden_produccion_detalles (orden_id);

-- total_unidades = suma de las cantidades del detalle
create or replace function public.op_detalles_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_orden uuid := coalesce(new.orden_id, old.orden_id);
begin
  update public.expedientes
     set total_unidades = coalesce((select sum(cantidad) from public.orden_produccion_detalles where orden_id = v_orden), 0)
   where id = v_orden;
  return null;
end $$;
drop trigger if exists op_detalles_total on public.orden_produccion_detalles;
create trigger op_detalles_total after insert or update of cantidad or delete on public.orden_produccion_detalles
  for each row execute function public.op_detalles_total();

-- Lista de materiales (BOM) por modelo: cantidad por UNA unidad del equipo
create table if not exists public.bom_modelos (
  id uuid primary key default gen_random_uuid(),
  modelo text not null,
  material text not null,
  unidad text not null default 'UND',
  cantidad numeric(14, 4) not null check (cantidad > 0),
  stock_id text,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (modelo, material, unidad)
);

alter table public.orden_produccion_detalles enable row level security;
alter table public.bom_modelos enable row level security;

drop policy if exists op_detalles_leer on public.orden_produccion_detalles;
create policy op_detalles_leer on public.orden_produccion_detalles for select to authenticated using (public.es_planta());
drop policy if exists op_detalles_crear on public.orden_produccion_detalles;
create policy op_detalles_crear on public.orden_produccion_detalles for insert to authenticated
  with check (public.mi_rol() in ('creador', 'soporte', 'almacen', 'logistica'));
-- Producción (costo BOM) y Fase 8 (chasis / serie) actualizan el detalle
drop policy if exists op_detalles_editar on public.orden_produccion_detalles;
create policy op_detalles_editar on public.orden_produccion_detalles for update to authenticated using (public.es_planta()) with check (public.es_planta());

drop policy if exists bom_leer on public.bom_modelos;
create policy bom_leer on public.bom_modelos for select to authenticated using (public.es_planta());
drop policy if exists bom_escribir on public.bom_modelos;
create policy bom_escribir on public.bom_modelos for all to authenticated
  using (public.mi_rol() in ('creador', 'soporte', 'almacen', 'produccion'))
  with check (public.mi_rol() in ('creador', 'soporte', 'almacen', 'produccion'));

-- ---------------------------------------------------------------------
-- crear_op_lote: expediente + detalles juntos (si un detalle falla, no queda la OP a medias).
-- p_detalles = [{tipo_equipo, marca_motor, modelo, cantidad}]
-- ---------------------------------------------------------------------
create or replace function public.crear_op_lote(p_plazo date, p_prioridad text, p_almacen text, p_detalles jsonb, p_datos jsonb, p_usuario text)
returns public.expedientes language plpgsql security invoker set search_path = public as $$
declare
  v public.expedientes;
  d jsonb;
  i integer := 0;
begin
  if p_plazo is null then raise exception 'Indique el plazo de finalización.'; end if;
  if p_plazo < (now() at time zone 'America/Lima')::date then raise exception 'El plazo no puede estar en el pasado.'; end if;
  if jsonb_typeof(p_detalles) <> 'array' or jsonb_array_length(p_detalles) = 0 then raise exception 'Agregue al menos un equipo al lote.'; end if;
  for d in select * from jsonb_array_elements(p_detalles) loop
    if coalesce(trim(d ->> 'tipo_equipo'), '') = '' or coalesce(trim(d ->> 'marca_motor'), '') = '' or coalesce(trim(d ->> 'modelo'), '') = '' then
      raise exception 'Cada equipo necesita tipo, marca de motor y modelo.';
    end if;
    if coalesce((d ->> 'cantidad')::int, 0) <= 0 then raise exception 'La cantidad de % debe ser mayor a 0.', d ->> 'modelo'; end if;
  end loop;

  insert into public.expedientes (lote, plazo, almacen_destino, es_lote_mixto, costo_estimado, precio_venta, estado_avance, fase_actual, datos, created_by)
  values ('LOTE-' || to_char(now() at time zone 'America/Lima', 'IYYY-"W"IW'), p_plazo, coalesce(nullif(trim(p_almacen), ''), 'Almacen Aqp'), true,
          0, 0, 13, 2, p_datos || jsonb_build_object('prioridad', coalesce(nullif(p_prioridad, ''), 'NORMAL')), p_usuario)
  returning * into v;

  for d in select * from jsonb_array_elements(p_detalles) loop
    i := i + 1;
    insert into public.orden_produccion_detalles (orden_id, tipo_equipo, marca_motor, modelo, cantidad, orden)
    values (v.id, upper(trim(d ->> 'tipo_equipo')), upper(trim(d ->> 'marca_motor')), upper(trim(d ->> 'modelo')), (d ->> 'cantidad')::int, i);
  end loop;

  select * into v from public.expedientes where id = v.id;
  return v;
end $$;
revoke execute on function public.crear_op_lote(date, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.crear_op_lote(date, text, text, jsonb, jsonb, text) to authenticated;

-- Aviso al crear la OP: Producción (aprobar) y, en lote mixto, Almacén (previsiones)
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
    perform public.notificar_flujo('PRODUCCION', 'POR_APROBAR', c || ' · nueva OP ' || coalesce(new.op_id || ' ', '') || 'por aprobar',
      prod || ' · plazo ' || coalesce(new.plazo::text, '—') || ' · aceptar y pedir materiales', new.id, c, 1::smallint,
      jsonb_build_object('op_id', new.op_id, 'plazo', new.plazo, 'prioridad', d ->> 'prioridad', 'lote', new.lote));
    -- Lote mixto: Almacén revisa previsiones (qué materiales tener listos) desde que nace la OP
    if coalesce(new.es_lote_mixto, false) then
      perform public.notificar_flujo('ALMACEN', 'PREVISIONES', c || ' · nueva OP: revisar previsiones de materiales',
        coalesce(d ->> 'resumenEquipos', prod) || ' · plazo ' || coalesce(new.plazo::text, '—') || ' · destino ' || coalesce(new.almacen_destino, '—'), new.id, c, 1::smallint,
        jsonb_build_object('lote', new.lote, 'plazo', new.plazo, 'prioridad', d ->> 'prioridad'));
    end if;
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

-- Realtime del detalle (chasis / serie de la Fase 8 y costo BOM)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orden_produccion_detalles') then
    alter publication supabase_realtime add table public.orden_produccion_detalles;
  end if;
end $$;

-- Verificación:
-- select codigo_expediente, lote, almacen_destino, total_unidades from public.expedientes where es_lote_mixto order by created_at desc;
