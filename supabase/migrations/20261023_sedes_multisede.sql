-- =====================================================================
-- MULTI-SEDE · ERP COMBOY VID
-- Sucursal es un sistema aparte (/sucursal) con varias sedes. Cada usuario de sede
-- (usuarios_sedes) ve y graba SOLO las filas de su sede: lo aplica la base (RLS), no la pantalla.
--
-- Ejecutar en Supabase › SQL Editor DESPUÉS de:
--   20261022_sucursal_beta.sql, 20261022_fix_productos_alias.sql y 20261022_unificar_productos.sql
-- Sin BEGIN/COMMIT y se puede repetir sin duplicar nada.
--
--   sedes            Arequipa (ARE, central) · Secocha (SEC)
--   usuarios_sedes   user_id -> sede_id + rol (admin_sede, vendedor, cajero)
--   sede_id          en todas las tablas de datos (menos productos_maestro / productos_alias:
--                    el catálogo es compartido). Lo existente queda en Arequipa.
--   sede_isolation   política RESTRICTIVA: quien tiene sede asignada solo ve y graba filas donde
--                    sede_id = (select sede_id from usuarios_sedes where user_id = auth.uid()).
--                    Es restrictiva porque las políticas normales de cada tabla se suman con OR.
--                    Los usuarios del ERP central (sin fila en usuarios_sedes: creador, tesorería,
--                    almacén / Taller, gerencia) siguen viendo todas las sedes.
-- =====================================================================

-- 1. Sedes
create table if not exists public.sedes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text not null unique,
  es_central boolean not null default false,
  created_at timestamptz not null default now()
);
-- Una sola sede central
create unique index if not exists sedes_una_central on public.sedes (es_central) where es_central;

insert into public.sedes (nombre, codigo, es_central) values ('Arequipa', 'ARE', true), ('Secocha', 'SEC', false)
on conflict (codigo) do nothing;

-- 2. Usuarios de sede (un usuario, una sede)
create table if not exists public.usuarios_sedes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sede_id uuid not null references public.sedes(id) on delete restrict,
  rol text not null default 'vendedor' check (rol in ('admin_sede', 'vendedor', 'cajero')),
  created_at timestamptz not null default now()
);
create index if not exists idx_usuarios_sedes_sede on public.usuarios_sedes (sede_id);

-- 3. Funciones de sede (security definer: no dependen del RLS de usuarios_sedes)
-- Sede asignada al usuario; null = usuario del ERP central (ve todas las sedes)
create or replace function public.sede_usuario() returns uuid
language sql stable security definer set search_path = public as $$
  select sede_id from public.usuarios_sedes where user_id = auth.uid()
$$;

create or replace function public.sede_central() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.sedes where es_central order by created_at limit 1
$$;

-- Sede con la que trabaja el usuario: la suya o, en el ERP central, Arequipa
create or replace function public.mi_sede() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(public.sede_usuario(), public.sede_central())
$$;

-- ¿Puede ver / grabar una fila de esa sede?
create or replace function public.puede_ver_sede(p_sede uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sede_usuario() is null or p_sede = public.sede_usuario()
$$;

grant execute on function public.sede_usuario(), public.sede_central(), public.mi_sede(), public.puede_ver_sede(uuid) to authenticated;

-- RLS de sedes y usuarios_sedes
alter table public.sedes enable row level security;
alter table public.usuarios_sedes enable row level security;
drop policy if exists sedes_select on public.sedes;
drop policy if exists sedes_admin on public.sedes;
drop policy if exists usuarios_sedes_select on public.usuarios_sedes;
drop policy if exists usuarios_sedes_admin on public.usuarios_sedes;
create policy sedes_select on public.sedes for select to authenticated using (public.puede_ver_sede(id));
create policy sedes_admin on public.sedes for all to authenticated
  using (public.sede_usuario() is null and public.mi_rol() in ('creador', 'admin'))
  with check (public.sede_usuario() is null and public.mi_rol() in ('creador', 'admin'));
create policy usuarios_sedes_select on public.usuarios_sedes for select to authenticated
  using (user_id = auth.uid() or (public.sede_usuario() is null and public.mi_rol() in ('creador', 'admin', 'gerencia')));
create policy usuarios_sedes_admin on public.usuarios_sedes for all to authenticated
  using (public.sede_usuario() is null and public.mi_rol() in ('creador', 'admin'))
  with check (public.sede_usuario() is null and public.mi_rol() in ('creador', 'admin'));
grant select on public.sedes, public.usuarios_sedes to authenticated;
grant insert, update, delete on public.sedes, public.usuarios_sedes to authenticated;
revoke all on public.sedes, public.usuarios_sedes from anon;

-- 4. Al grabar: la sede de la fila.
--    Usuario de sede -> siempre la suya (no puede grabar en otra).
--    ERP central     -> la que trae data.sedeId (p. ej. el Taller emite una OT para Secocha) o la que ya tenía; si no, Arequipa.
--    En tablas de documentos se copia a data.sedeId para que la pantalla sepa de qué sede es cada fila.
create or replace function public.asignar_sede() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  propia uuid := public.sede_usuario();
  pedida uuid;
  con_data boolean := tg_nargs > 0 and tg_argv[0] = 'jsonb';
begin
  if con_data then
    begin
      pedida := nullif(new.data->>'sedeId', '')::uuid;
    exception when others then
      pedida := null;
    end;
  end if;
  if propia is not null then
    new.sede_id := propia;
  elsif tg_op = 'INSERT' then
    new.sede_id := coalesce(pedida, new.sede_id, public.sede_central());
  else
    new.sede_id := coalesce(pedida, old.sede_id, new.sede_id, public.sede_central());
  end if;
  if con_data then
    new.data := coalesce(new.data, '{}'::jsonb) || jsonb_build_object('sedeId', new.sede_id::text);
  end if;
  return new;
end $$;

-- 5. sede_id en todas las tablas de datos + Arequipa para lo existente + RLS sede_isolation
--    Pedido: clientes, proveedores, trabajadores, ventas, ventas_detalle, caja_chica, stock_almacenes.
--    En este ERP clientes / proveedores / trabajadores / caja / stock viven como documentos dentro de
--    ventas, compras, planilla, contable, almacen y sucursal: se aíslan esas tablas. Si además existen
--    tablas propias con esos nombres, también reciben sede_id y la misma regla.
do $$
declare
  t text;
  central uuid := public.sede_central();
  con_data boolean;
  tenia_rls boolean;
begin
  foreach t in array array[
    'clientes', 'proveedores', 'trabajadores', 'ventas', 'ventas_detalle', 'caja_chica', 'stock_almacenes',
    'compras', 'almacen', 'planilla', 'contable', 'sucursal', 'cajas', 'adelantos',
    'planilla_historial', 'planilla_historial_detalle', 'observaciones', 'productos_solicitudes'
  ] loop
    -- Solo tablas reales (stock_almacenes es la vista v_stock_almacenes, se trata abajo)
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = t and c.relkind in ('r', 'p')) then
      continue;
    end if;
    con_data := exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = t and column_name = 'data' and data_type = 'jsonb');
    select relrowsecurity into tenia_rls from pg_class where oid = format('public.%I', t)::regclass;

    execute format('alter table public.%I add column if not exists sede_id uuid references public.sedes(id)', t);

    -- Lo existente -> Arequipa (sin disparar triggers: no cambia updated_at ni revalida el stock)
    execute format('alter table public.%I disable trigger user', t);
    if con_data then
      execute format($u$update public.%I set sede_id = coalesce(sede_id, $1),
                        data = coalesce(data, '{}'::jsonb) || jsonb_build_object('sedeId', coalesce(sede_id, $1)::text)
                      where sede_id is null or data->>'sedeId' is distinct from sede_id::text$u$, t) using central;
    else
      execute format('update public.%I set sede_id = $1 where sede_id is null', t) using central;
    end if;
    execute format('alter table public.%I enable trigger user', t);

    execute format('alter table public.%I alter column sede_id set default public.mi_sede()', t);
    execute format('alter table public.%I alter column sede_id set not null', t);
    execute format('create index if not exists %I on public.%I (sede_id)', 'idx_' || t || '_sede', t);

    execute format('drop trigger if exists asignar_sede on public.%I', t);
    execute format('create trigger asignar_sede before insert or update on public.%I for each row execute function public.asignar_sede(%L)',
                   t, case when con_data then 'jsonb' else 'columna' end);

    -- RLS: tabla que no tenía RLS -> sigue abierta para usuarios logueados, pero aislada por sede
    if not tenia_rls then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists sede_acceso on public.%I', t);
      execute format('create policy sede_acceso on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
    execute format('drop policy if exists sede_isolation on public.%I', t);
    execute format('create policy sede_isolation on public.%I as restrictive for all to authenticated
                      using ((select public.sede_usuario()) is null or sede_id = (select public.sede_usuario()))
                      with check ((select public.sede_usuario()) is null or sede_id = (select public.sede_usuario()))', t);
  end loop;
end $$;

-- 6. Vistas con sede_id (security_invoker: respetan sede_isolation)
do $$
begin
  if to_regclass('public.v_stock_almacenes') is not null and to_regclass('public.sucursal') is not null then
    execute $v$
      create or replace view public.v_stock_almacenes with (security_invoker = true) as
      select p.id as producto_id, p.sku, p.nombre_display, a.data->>'sede' as almacen_id,
             coalesce((a.data->>'cantidad')::numeric, 0) as cantidad, 0::numeric as minimo, a.sede_id
        from public.almacen a join public.productos_maestro p on p.id = public.producto_de_nombre(a.data->>'nombre')
       where a.tipo = 'stock'
      union all
      select p.id, p.sku, p.nombre_display, 'SUCURSAL_' || upper(replace(coalesce(s.data->>'sucursalId', 'SUC'), '-', '_')),
             coalesce((s.data->>'stock')::numeric, 0), coalesce((s.data->>'minimo')::numeric, 0), s.sede_id
        from public.sucursal s join public.productos_maestro p on p.id = public.producto_de_nombre(s.data->>'producto')
       where s.tipo = 'stock'
    $v$;
  elsif to_regclass('public.v_stock_almacenes') is not null then
    execute $v$
      create or replace view public.v_stock_almacenes with (security_invoker = true) as
      select p.id as producto_id, p.sku, p.nombre_display, a.data->>'sede' as almacen_id,
             coalesce((a.data->>'cantidad')::numeric, 0) as cantidad, 0::numeric as minimo, a.sede_id
        from public.almacen a join public.productos_maestro p on p.id = public.producto_de_nombre(a.data->>'nombre')
       where a.tipo = 'stock'
    $v$;
  end if;

  if to_regclass('public.sucursal') is not null then
    execute $v$
      create or replace view public.v_sucursal_ventas with (security_invoker = true) as
      select id,
             (data->>'fecha')::date              as fecha,
             data->>'cliente'                     as cliente,
             data->>'docRef'                      as doc_ref,
             (data->>'total')::numeric            as total,
             data->>'estado'                      as estado,
             data->>'sucursalId'                  as sucursal_id,
             coalesce((data->>'requiereTraslado')::boolean, false) as requiere_traslado,
             sede_id
        from public.sucursal where tipo = 'venta'
    $v$;
    execute $v$
      create or replace view public.v_sucursal_traslados with (security_invoker = true) as
      select id,
             data->>'codigo'                      as codigo,
             data->>'origen'                      as origen,
             data->>'destinoSucursalId'           as destino_sucursal_id,
             data->'productos'                    as productos,
             data->>'estado'                      as estado,
             data->>'guiaRemision'                as guia_remision,
             data->>'guiaRemisionUrl'             as guia_remision_url,
             (data->>'fechaEnvio')::date          as fecha_envio,
             nullif(data->>'fechaRecepcion', '')::date as fecha_recepcion,
             sede_id
        from public.sucursal where tipo = 'traslado'
    $v$;
  end if;
end $$;

-- 7. Correlativos de la sucursal por sede (VTA, REQ-SUC, GE y CC de Secocha no se mezclan con Arequipa).
--    OT y guías de remisión: las emite el Taller Principal, siguen siendo un solo correlativo.
drop function if exists public.siguiente_numero_sucursal(text);
create or replace function public.siguiente_numero_sucursal(serie text, p_sede uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  propia uuid := public.sede_usuario();
  central uuid := public.sede_central();
  sede uuid;
  fila text;
  clave text := serie || '_' || to_char(now() at time zone 'America/Lima', 'YYYY');
  n integer;
begin
  if serie in ('VTA', 'REQSUC', 'GE', 'CC') then
    if rol not in ('creador', 'sucursal') then
      raise exception 'Su usuario no puede emitir documentos de la sucursal' using errcode = '42501';
    end if;
    sede := coalesce(propia, p_sede, central); -- un usuario de sede siempre numera en la suya
  elsif serie in ('OT', 'GR') then
    if rol not in ('creador', 'almacen') then
      raise exception 'Solo el Taller Principal (almacén) emite órdenes de traslado y guías de remisión' using errcode = '42501';
    end if;
    clave := serie; -- OT y guías: correlativo continuo del Taller
    sede := central;
  else
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;

  -- La fila del contador de Arequipa conserva su id (sigue la numeración que ya había)
  fila := case when sede = central then '00000000-0000-0000-0000-000000000001' else 'contador-' || sede::text end;
  insert into public.sucursal (tipo, id, data, sede_id)
  values ('contador', fila, jsonb_build_object(clave, 1), sede)
  on conflict (tipo, id) do update
    set data = public.sucursal.data || jsonb_build_object(clave, coalesce((public.sucursal.data ->> clave)::integer, 0) + 1)
  returning (data ->> clave)::integer into n;
  return n;
end $$;
revoke all on function public.siguiente_numero_sucursal(text, uuid) from public, anon;
grant execute on function public.siguiente_numero_sucursal(text, uuid) to authenticated;

-- 8. Sucursal de Secocha (Arequipa ya tiene SUC-AQP-SUR)
do $$
declare sec uuid := (select id from public.sedes where codigo = 'SEC');
begin
  if to_regclass('public.sucursal') is not null then
    insert into public.sucursal (tipo, id, data, sede_id)
    values ('sucursal', 'SUC-SEC', jsonb_build_object(
      'id', 'SUC-SEC', 'nombre', 'Secocha', 'sede', 'Secocha', 'direccion', '', 'jefeId', null,
      'jefeNombre', '', 'cajaChicaActual', 0, 'sedeId', sec::text), sec)
    on conflict (tipo, id) do nothing;
  end if;
end $$;

-- 9. Usuarios
-- 9a. La sucursal ya no está dentro del ERP: su módulo es /sucursal
update public.perfiles set modulos = array_replace(modulos, '/dashboard/sucursal', '/sucursal')
 where '/dashboard/sucursal' = any (modulos);

-- 9b. sucsecocha@comboyvid.com -> Secocha, admin_sede. Créelo antes en Authentication › Users
--     (si todavía no existe, este bloque no hace nada: vuelva a ejecutar el script después de crearlo).
insert into public.perfiles (id, usuario, rol, nombre, modulos, solo_lectura)
select u.id, 'sucsecocha', 'sucursal', 'Sucursal Secocha', array['/sucursal'], false
  from auth.users u where lower(u.email) = 'sucsecocha@comboyvid.com'
on conflict (id) do update set rol = excluded.rol, nombre = excluded.nombre, modulos = excluded.modulos, solo_lectura = false;

insert into public.usuarios_sedes (user_id, sede_id, rol)
select u.id, s.id, 'admin_sede'
  from auth.users u join public.sedes s on s.codigo = 'SEC'
 where lower(u.email) = 'sucsecocha@comboyvid.com'
on conflict (user_id) do update set sede_id = excluded.sede_id, rol = excluded.rol;

-- 9c. Los demás usuarios de sucursal que ya existían (sucursal@comboyvid.local) quedan en Arequipa,
--     así tampoco ven Secocha
insert into public.usuarios_sedes (user_id, sede_id, rol)
select p.id, public.sede_central(), 'admin_sede'
  from public.perfiles p
 where p.rol = 'sucursal' and exists (select 1 from auth.users u where u.id = p.id)
on conflict (user_id) do nothing;

-- 10. Realtime
do $$
declare t text;
begin
  foreach t in array array['sedes', 'usuarios_sedes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 11. Verificación (como sucsecocha no debe salir ninguna fila de Arequipa):
-- select s.codigo, count(*) from public.ventas v join public.sedes s on s.id = v.sede_id group by 1;
-- select u.email, s.nombre, us.rol from public.usuarios_sedes us join auth.users u on u.id = us.user_id join public.sedes s on s.id = us.sede_id;
