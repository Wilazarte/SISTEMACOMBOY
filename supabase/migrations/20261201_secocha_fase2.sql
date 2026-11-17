-- =====================================================================
-- SECOCHA FASE 2: almacén propio, planilla y avisos por sede
--
-- Correr en Supabase > SQL Editor DESPUÉS de 20261130_secocha_erp_completo.sql. Se puede correr más de una vez.
--
--   1. Almacén Sucursal Secocha: su stock y su kardex pasan a la sede Secocha. Arequipa los sigue viendo
--      (son sus dos almacenes físicos); el administrador de Secocha ve y mueve solo el suyo.
--   2. Planilla por sede: el mismo periodo ("SEMANA 47 - NOVIEMBRE 2026") puede cerrarse en Arequipa y en Secocha.
--   3. Funciones de la base que el administrador de Secocha necesita: cerrar planilla, importar / editar asistencia,
--      fijar la caja del pago de planilla y retiro de almacén.
--   4. Avisos (campana) por sede: cada aviso guarda su sede; Secocha ve solo los suyos (todos sus módulos).
--   5. Se retira la Operación diaria antigua de /secocha (decisión de Williams 2026-11-17): su stock local pasa al
--      almacén Sucursal Secocha del ERP y sus clientes a los clientes de Ventas de Secocha. Lo que ya existe con el
--      mismo nombre / documento no se duplica. La tabla sucursal no se borra (queda como historial).
-- =====================================================================

begin;

-- 1. Almacén Sucursal Secocha -> sede Secocha
do $$
declare
  sec uuid;
  n integer;
begin
  select id into sec from public.sedes where upper(codigo) = 'SEC' or not es_central order by (upper(codigo) = 'SEC') desc limit 1;
  if sec is null then
    raise exception 'No existe la sede Secocha (public.sedes codigo SEC)';
  end if;
  -- Sin disparar triggers: solo cambia la sede, no el stock ni updated_at
  alter table public.almacen disable trigger user;
  update public.almacen
     set sede_id = sec, data = coalesce(data, '{}'::jsonb) || jsonb_build_object('sedeId', sec::text)
   where tipo in ('stock', 'KARDEX') and data->>'sede' ilike '%secocha%' and sede_id is distinct from sec;
  get diagnostics n = row_count;
  alter table public.almacen enable trigger user;
  raise notice 'Filas del almacén Sucursal Secocha pasadas a la sede Secocha: %', n;
end $$;

-- 2. Planilla: periodo único POR SEDE
alter table public.planilla_historial drop constraint if exists planilla_historial_periodo_key;
create unique index if not exists planilla_historial_sede_periodo_key on public.planilla_historial (sede_id, periodo);

-- 3. Funciones: se agrega el rol 'sucursal' (administrador de Secocha) a sus listas de roles.
--    La política sede_isolation y los cambios de abajo lo limitan a Secocha.
do $$
declare
  f text;
  p oid;
  def text;
  nuevo text;
begin
  foreach f in array array['cerrar_planilla', 'importar_asistencia', 'editar_asistencia_creador', 'fijar_caja_planilla', 'retiro_produccion'] loop
    for p in select oid from pg_proc where proname = f and pronamespace = 'public'::regnamespace loop
      def := pg_get_functiondef(p);
      nuevo := def;
      if nuevo !~ '''sucursal''' then
        nuevo := regexp_replace(nuevo, '(\(|,\s*)''creador''', '\1''creador'', ''sucursal''', 'g');
      end if;
      -- Cerrar planilla: el periodo ya cerrado se busca solo en la sede de quien cierra
      if f = 'cerrar_planilla' and nuevo !~ 'mi_sede\(\)' then
        nuevo := replace(nuevo, 'where periodo = per)', 'where periodo = per and sede_id is not distinct from public.mi_sede())');
      end if;
      -- Caja del pago: solo planillas de la propia sede
      if f = 'fijar_caja_planilla' and nuevo !~ 'puede_ver_sede' then
        nuevo := replace(nuevo, 'where id = p_id and caja_nombre is null', 'where id = p_id and caja_nombre is null and public.puede_ver_sede(sede_id)');
      end if;
      if nuevo = def then
        raise notice '%: sin cambios (ya estaba actualizada)', f;
        continue;
      end if;
      begin
        execute nuevo;
        raise notice '%: actualizada para el administrador de Secocha', f;
      exception when others then
        raise warning '%: no se pudo actualizar (%). Avise a soporte.', f, sqlerrm;
      end;
    end loop;
  end loop;
end $$;

-- 4. Avisos por sede
do $$
declare
  def text;
  nuevo text;
begin
  if to_regclass('public.notificaciones') is null then
    raise notice 'Sin tabla notificaciones (falta 20261107_notificaciones_flujo.sql): se omiten los avisos';
    return;
  end if;
  alter table public.notificaciones add column if not exists sede_id uuid references public.sedes(id);
  update public.notificaciones set sede_id = public.sede_central() where sede_id is null;
  alter table public.notificaciones alter column sede_id set default public.mi_sede();
  create index if not exists idx_notificaciones_sede on public.notificaciones (sede_id);
  -- La sede de quien provoca el aviso (los triggers corren con el usuario que hizo el cambio)
  drop trigger if exists asignar_sede on public.notificaciones;
  create trigger asignar_sede before insert on public.notificaciones
    for each row execute function public.asignar_sede('columna');
  drop policy if exists sede_isolation on public.notificaciones;
  create policy sede_isolation on public.notificaciones as restrictive for all to authenticated
    using ((select public.sede_usuario()) is null or sede_id = (select public.sede_usuario()))
    with check ((select public.sede_usuario()) is null or sede_id = (select public.sede_usuario()));

  -- El administrador de Secocha ve los avisos de todos los módulos de su sede (como SOPORTE en Arequipa)
  if to_regprocedure('public.mi_modulo_notif()') is not null then
    def := pg_get_functiondef('public.mi_modulo_notif()'::regprocedure);
    if def !~ '''sucursal''' then
      nuevo := replace(def, 'when p.es_admin or p.rol in (''creador'', ''soporte'') then ''SOPORTE''',
                       'when p.es_admin or p.rol in (''creador'', ''soporte'') or (p.rol = ''sucursal'' and ''*'' = any (coalesce(p.modulos, ''{}''::text[]))) then ''SOPORTE''');
      if nuevo = def then
        raise warning 'mi_modulo_notif: no se encontró la regla de SOPORTE; el administrador de Secocha no verá avisos. Avise a soporte.';
      else
        execute nuevo;
        raise notice 'mi_modulo_notif: administrador de Secocha agregado';
      end if;
    end if;
  end if;
end $$;

-- 5. Operación diaria antigua -> ERP
do $$
declare
  sec uuid;
  n integer;
begin
  if to_regclass('public.sucursal') is null then
    raise notice 'Sin tabla sucursal: nada que migrar';
    return;
  end if;
  select id into sec from public.sedes where upper(codigo) = 'SEC' or not es_central order by (upper(codigo) = 'SEC') desc limit 1;

  -- 5a. Stock local -> almacén Sucursal Secocha (el mismo producto ya existente no se toca)
  insert into public.almacen (tipo, id, data, sede_id)
  select 'stock', 'suc-' || s.id,
         jsonb_strip_nulls(jsonb_build_object(
           'id', 'suc-' || s.id, 'sede', 'Sucursal Secocha', 'nombre', btrim(s.data->>'producto'),
           'unidad', coalesce(nullif(s.data->>'unidad', ''), 'UND'),
           'cantidad', coalesce((s.data->>'stock')::numeric, 0), 'costoUnit', coalesce((s.data->>'costo')::numeric, 0),
           'actualizado', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'productoId', s.data->>'productoMaestroId', 'sku', s.data->>'sku', 'sedeId', sec::text)),
         sec
    from public.sucursal s
   where s.tipo = 'stock' and coalesce(btrim(s.data->>'producto'), '') <> '' and s.sede_id = sec
     and not exists (
       select 1 from public.almacen a
        where a.tipo = 'stock' and a.data->>'sede' ilike '%secocha%'
          and lower(trim(regexp_replace(a.data->>'nombre', '\s+', ' ', 'g'))) = lower(trim(regexp_replace(s.data->>'producto', '\s+', ' ', 'g'))))
  on conflict (tipo, id) do nothing;
  get diagnostics n = row_count;
  raise notice 'Productos del stock local pasados al almacén Sucursal Secocha: %', n;

  -- 5b. Clientes de la sucursal -> clientes de Ventas (Secocha)
  if to_regclass('public.ventas') is not null then
    insert into public.ventas (tipo, id, data, sede_id)
    select 'cliente', 'suc-' || c.id,
           jsonb_build_object(
             'id', 'suc-' || c.id,
             'tipoDoc', case when length(regexp_replace(coalesce(c.data->>'doc', ''), '\D', '', 'g')) = 11 then 'RUC'
                             when length(regexp_replace(coalesce(c.data->>'doc', ''), '\D', '', 'g')) = 8 then 'DNI' else 'CE' end,
             'numDoc', btrim(coalesce(c.data->>'doc', '')), 'razonSocial', btrim(c.data->>'nombre'),
             'direccionFiscal', coalesce(c.data->>'direccion', ''), 'direccionesEntrega', '[]'::jsonb,
             'telefono', coalesce(c.data->>'telefono', ''), 'email', coalesce(c.data->>'email', ''), 'contacto', '',
             'condPagoId', '', 'lineaCredito', 0, 'estado', 'ACTIVO',
             'created_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'sedeId', sec::text),
           sec
      from public.sucursal c
     where c.tipo = 'cliente' and coalesce(btrim(c.data->>'nombre'), '') <> '' and c.sede_id = sec
       and not exists (
         select 1 from public.ventas v
          where v.tipo = 'cliente' and v.sede_id = sec
            and ((coalesce(btrim(c.data->>'doc'), '') <> '' and btrim(v.data->>'numDoc') = btrim(c.data->>'doc'))
                 or upper(btrim(v.data->>'razonSocial')) = upper(btrim(c.data->>'nombre'))))
    on conflict (tipo, id) do nothing;
    get diagnostics n = row_count;
    raise notice 'Clientes de la Operación diaria pasados a Ventas Secocha: %', n;
  end if;
end $$;

commit;

-- Revisar:
-- select data->>'sede' as almacen, s.codigo, count(*) from public.almacen a join public.sedes s on s.id = a.sede_id where tipo = 'stock' group by 1, 2 order by 1;
-- select s.codigo, periodo from public.planilla_historial h join public.sedes s on s.id = h.sede_id order by fecha_cierre desc limit 10;
