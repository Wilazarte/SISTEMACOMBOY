-- =====================================================================
-- COSTO DE PRODUCCIÓN POR MODELO DE EQUIPO (Williams 2026-11-17)
-- "El costo se calculará en general por modelo de equipo: ECO-MINE 3000, ECO-MINE PRO 3500,
--  coche minero y eléctrica. Los costos se calcularán desde cero."
--
-- Correr DESPUÉS de 20261204_costo_produccion.sql. Idempotente (se puede correr varias veces).
-- No toca tablas de Producción, Almacén ni Tesorería: solo las tablas production_* y funciones pc_*.
--   * production_orders.origen admite 'MODELO' (orden_produccion_id = nombre del modelo).
--   * Una sola hoja ABIERTA por modelo (al cerrarla se puede abrir otra para recalcular).
--   * La hoja por modelo empieza vacía: material, unidad, cantidad y costo se escriben a mano
--     (sin motivo obligatorio; cada cambio sigue en la bitácora con hash SHA-256).
--   * pc_puede_facturar(OP): vale la hoja de la OP o, si no tiene, la hoja APROBADA de su modelo.
-- =====================================================================

alter table public.production_orders drop constraint if exists production_orders_origen_check;
alter table public.production_orders add constraint production_orders_origen_check check (origen in ('OP', 'LOTE', 'MODELO'));

drop index if exists public.production_orders_op_uidx;
create unique index if not exists production_orders_op_uidx
  on public.production_orders (orden_produccion_id, coalesce(equipo_id, '')) where estado <> 'ANULADO' and origen <> 'MODELO';
create unique index if not exists production_orders_modelo_uidx
  on public.production_orders (orden_produccion_id) where origen = 'MODELO' and estado not in ('ANULADO', 'CERRADO');

-- Modelo comercial a partir del texto de la OP (tipo de equipo + modelo)
create or replace function public.pc_modelo_familia(p_texto text) returns text language sql immutable as $$
  select case
    when u like '%ELECTRIC%' then 'REMOLCADOR ELECTRIC 4000'
    when u like '%COCHE%' then 'COCHE MINERO'
    when u like '%3500%' or u ~ '(^|[^A-Z])PRO([^A-Z]|$)' then 'REMOLCADOR ECO-MINE 3500 PRO'
    when u like '%3000%' or u like '%ECO%MINE%' or u like '%CV-300%' or u like '%RONCO%' or u like '%ROMI%' then 'REMOLCADOR ECO-MINE 3000'
  end
  from (select upper(coalesce(p_texto, '')) as u) s;
$$;

-- Los 4 modelos, con cuántas OP existentes son de cada uno (solo lectura de las OP)
create or replace function public.pc_modelos_disponibles() returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare f text; ops text[];
begin
  if not public.pc_puede_leer() then return; end if;
  foreach f in array array['REMOLCADOR ECO-MINE 3000', 'REMOLCADOR ECO-MINE 3500 PRO', 'COCHE MINERO', 'REMOLCADOR ELECTRIC 4000'] loop
    select coalesce(array_agg(distinct x ->> 'codigo' order by x ->> 'codigo'), '{}') into ops
      from public.pc_ops_disponibles() x
     where public.pc_modelo_familia(concat_ws(' ', x ->> 'tipo_equipo', x ->> 'modelo')) = f;
    return next jsonb_build_object('origen', 'MODELO', 'codigo', f, 'equipo_id', null, 'tipo_equipo', f, 'modelo', null, 'cantidad', 1,
                                   'fecha', null, 'estado', null, 'cliente', null, 'ops', to_jsonb(ops),
                                   'detalle', case when cardinality(ops) = 0 then 'Sin OP todavía' else cardinality(ops) || ' OP: ' || array_to_string(ops[1:6], ', ') || case when cardinality(ops) > 6 then '…' else '' end end);
  end loop;
end $$;

create or replace function public.pc_crear_orden(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare yo jsonb; op jsonb; cfg public.production_cost_config; o public.production_orders; n int; cant numeric; b record; st jsonb; ing jsonb; it public.production_cost_items; k int := 0;
begin
  yo := public.pc_exigir(array['PRODUCCION', 'SOPORTE', 'LOGISTICA']);
  perform set_config('pc.rpc', 'on', true);
  if coalesce(p ->> 'origen', '') = 'MODELO' then
    -- Costo por MODELO de equipo (Williams 2026-11-17): una hoja general por modelo, calculada desde cero
    select x into op from public.pc_modelos_disponibles() x where x ->> 'codigo' = upper(trim(p ->> 'orden_produccion_id')) limit 1;
    if op is null then raise exception 'Modelo % no reconocido. Use ECO-MINE 3000, ECO-MINE PRO 3500, Coche minero o Eléctrico.', p ->> 'orden_produccion_id'; end if;
    if exists (select 1 from public.production_orders where origen = 'MODELO' and orden_produccion_id = op ->> 'codigo' and estado not in ('ANULADO', 'CERRADO')) then
      raise exception 'El modelo % ya tiene una hoja de costo abierta: ábrala desde la lista.', op ->> 'codigo';
    end if;
  else
    select x into op from public.pc_ops_disponibles() x
     where x ->> 'codigo' = p ->> 'orden_produccion_id' and coalesce(x ->> 'equipo_id', '') = coalesce(p ->> 'equipo_id', '') limit 1;
    if op is null then raise exception 'La OP % no existe o está anulada: la hoja de costo debe enlazarse a una OP real.', p ->> 'orden_produccion_id'; end if;
    if exists (select 1 from public.production_orders where orden_produccion_id = op ->> 'codigo' and coalesce(equipo_id, '') = coalesce(op ->> 'equipo_id', '') and estado <> 'ANULADO') then
      raise exception 'La OP % ya tiene hoja de costo.', op ->> 'codigo';
    end if;
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
  perform public.pc_auditar(o.id, null, 'CREAR', null, to_jsonb(o) - 'updated_at', case when o.origen = 'MODELO' then 'Hoja de costo por modelo abierta para ' else 'Hoja de costo abierta para ' end || o.orden_produccion_id);

  -- Materiales de la lista (BOM) del modelo × cantidad, con el último costo de Almacén
  -- Hoja por MODELO: empieza vacía (los materiales, cantidades y costos se escriben desde cero)
  if o.origen <> 'MODELO' and to_regclass('public.bom_modelos') is not null and o.modelo is not null then
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
        -- En la hoja por MODELO el costo se escribe desde cero: no pide motivo (el cambio igual queda en la bitácora con valor anterior → nuevo)
        if o.origen <> 'MODELO' and (ant.id is null or round(costo, 4) <> round(ant.costo_unitario, 4)) and length(coalesce(motivo_item, '')) < 10 then
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

-- No se factura sin costo aprobado por Gerencia: hoja de la OP o, si la OP no tiene, la hoja de su modelo
create or replace function public.pc_puede_facturar(p_codigo_op text) returns boolean language plpgsql stable security definer set search_path = public as $$
declare fam text;
begin
  if exists (select 1 from public.production_orders where orden_produccion_id = p_codigo_op and origen <> 'MODELO' and estado <> 'ANULADO') then
    return exists (select 1 from public.production_orders where orden_produccion_id = p_codigo_op and estado in ('APROBADO', 'CERRADO'))
       and not exists (select 1 from public.production_orders where orden_produccion_id = p_codigo_op and estado not in ('APROBADO', 'CERRADO', 'ANULADO'));
  end if;
  select public.pc_modelo_familia(concat_ws(' ', x ->> 'tipo_equipo', x ->> 'modelo')) into fam from public.pc_ops_disponibles() x where x ->> 'codigo' = p_codigo_op limit 1;
  return fam is not null and exists (select 1 from public.production_orders where origen = 'MODELO' and orden_produccion_id = fam and estado in ('APROBADO', 'CERRADO'));
end $$;

do $$
declare f text;
begin
  foreach f in array array['pc_modelos_disponibles()', 'pc_crear_orden(jsonb)', 'pc_guardar(uuid, jsonb, jsonb, text)', 'pc_puede_facturar(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Comprobación rápida: select * from public.pc_modelos_disponibles();
