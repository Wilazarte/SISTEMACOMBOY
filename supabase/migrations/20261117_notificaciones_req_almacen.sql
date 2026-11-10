-- =====================================================================
-- AVISOS ALMACÉN → TESORERÍA (FINANZAS), pedido de Williams 2026-11-10.
-- Cada requerimiento de Almacén deja un aviso en public.notificaciones para FINANZAS (Lizbeth),
-- que se ve en vivo en el INICIO de Finanzas ("Notificaciones en vivo") y en la campana:
--   · REQ nuevo o corregido y reenviado (fila nueva compras tipo req_pendiente) → "REQ-… por revisar"
--   · REQ editado antes de la revisión (cambia data)                             → "REQ-… actualizado"
--     (el aviso anterior del mismo REQ queda leído: solo se ve el último)
--   · Tesorería lo acepta, observa o rechaza (la fila sale de req_pendiente)     → sus avisos quedan leídos
-- Los REQ de Secocha (origen SUCURSAL) no avisan aquí: van a Ventas Arequipa.
-- Lo hace la BASE (trigger): vale para cualquier pantalla o equipo que guarde el REQ.
-- Aditivo y re-ejecutable. Requiere 20261107_notificaciones_flujo.sql (tabla notificaciones + RLS + Realtime).
-- =====================================================================

do $$
begin
  if to_regclass('public.notificaciones') is null or to_regprocedure('public.mi_modulo_notif()') is null then
    raise exception 'Primero corra supabase/migrations/20261107_notificaciones_flujo.sql';
  end if;
end $$;

create index if not exists notificaciones_req_idx on public.notificaciones ((datos ->> 'req_id')) where tipo = 'REQ_ALMACEN';

create or replace function public.compras_req_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d jsonb;
  v_id text;
  v_asignado uuid;
  v_items int;
  v_titulo text;
  v_reenviado boolean;
begin
  -- Solo los requerimientos pendientes de revisión
  if tg_op = 'DELETE' then
    if old.tipo is distinct from 'req_pendiente' then return old; end if;
    update public.notificaciones
       set leida = true, leida_at = now(), leida_por = auth.uid()
     where tipo = 'REQ_ALMACEN' and datos ->> 'req_id' = old.id and not leida;
    return old;
  end if;

  if new.tipo is distinct from 'req_pendiente' then return new; end if;
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then return new; end if;

  d := coalesce(new.data, '{}'::jsonb);
  if d ->> 'origen' = 'SUCURSAL' then return new; end if;
  v_id := new.id;
  v_items := coalesce(jsonb_array_length(case when jsonb_typeof(d -> 'items') = 'array' then d -> 'items' end), 0);
  v_reenviado := tg_op = 'INSERT' and coalesce(d::text like '%reenviado a Tesorer%', false);
  v_titulo := coalesce(d ->> 'numero', 'REQ') || case
    when tg_op = 'UPDATE' then ' actualizado por Almacén'
    when v_reenviado then ' corregido y reenviado por Almacén'
    else ' de Almacén por revisar'
  end;

  -- Titular de Finanzas (si hay uno solo); si no, lo ve todo el módulo
  select case when count(*) = 1 then (array_agg(p.id))[1] end into v_asignado
    from public.perfiles p
   where upper(coalesce(p.modulo_asignado, '')) = 'FINANZAS'
     and coalesce(p.activo, true) and not coalesce(p.es_admin, false);

  -- Un solo aviso vivo por REQ: el anterior queda leído
  update public.notificaciones
     set leida = true, leida_at = now()
   where tipo = 'REQ_ALMACEN' and datos ->> 'req_id' = v_id and not leida;

  insert into public.notificaciones (modulo, tipo, titulo, mensaje, asignado_a, href, datos)
  values (
    'FINANZAS', 'REQ_ALMACEN', v_titulo,
    concat_ws(' · ', nullif(d ->> 'sede', ''), nullif(d ->> 'solicitante', ''), v_items || ' producto(s)', nullif(left(d ->> 'motivo', 80), '')),
    v_asignado, '/dashboard/compras',
    jsonb_build_object('req_id', v_id, 'numero', d ->> 'numero', 'evento', case when tg_op = 'UPDATE' then 'EDITADO' when v_reenviado then 'REENVIADO' else 'NUEVO' end)
  );
  return new;
exception when others then
  -- Un fallo del aviso nunca bloquea el requerimiento
  raise warning 'compras_req_notificar: %', sqlerrm;
  return coalesce(new, old);
end $$;

drop trigger if exists compras_req_notificar on public.compras;
create trigger compras_req_notificar after insert or update of data or delete on public.compras
  for each row execute function public.compras_req_notificar();

-- REQ de Almacén que ya esperaban revisión antes de este SQL: se avisan una vez
insert into public.notificaciones (modulo, tipo, titulo, mensaje, href, datos, created_at)
select 'FINANZAS', 'REQ_ALMACEN', coalesce(c.data ->> 'numero', 'REQ') || ' de Almacén por revisar',
       concat_ws(' · ', nullif(c.data ->> 'sede', ''), nullif(c.data ->> 'solicitante', ''),
                 coalesce(jsonb_array_length(case when jsonb_typeof(c.data -> 'items') = 'array' then c.data -> 'items' end), 0) || ' producto(s)',
                 nullif(left(c.data ->> 'motivo', 80), '')),
       '/dashboard/compras',
       jsonb_build_object('req_id', c.id, 'numero', c.data ->> 'numero', 'evento', 'NUEVO'),
       coalesce(c.created_at, now())
  from public.compras c
 where c.tipo = 'req_pendiente'
   and coalesce(c.data ->> 'origen', '') <> 'SUCURSAL'
   and not exists (select 1 from public.notificaciones n where n.tipo = 'REQ_ALMACEN' and n.datos ->> 'req_id' = c.id);

-- Verificación:
-- select titulo, mensaje, leida, created_at from public.notificaciones where tipo = 'REQ_ALMACEN' order by created_at desc limit 20;
