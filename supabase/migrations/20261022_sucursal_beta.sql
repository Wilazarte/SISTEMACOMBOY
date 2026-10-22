-- =====================================================================
-- MÓDULO SUCURSAL BETA · ERP COMBOY VID
-- Ejecutar UNA vez en Supabase › SQL Editor (se puede repetir sin romper nada).
--
-- Igual que compras / almacen / ventas, cada fila es un documento JSON (tipo + id + data):
--   public.sucursal -> tipo: sucursal   (model Sucursal      { id, nombre, sede, direccion, jefeId, cajaChicaActual })
--                            venta      (model VentaSucursal { id, fecha, cliente, docRef VTA-XXX-2026, total,
--                                                              estado registrada|entregada|derivada|cerrada,
--                                                              sucursalId, requiereTraslado })
--                            traslado   (model Traslado      { id, codigo OT-, origen TALLER_PRINCIPAL, destinoSucursalId,
--                                                              productos, estado en-camino|recibido|observado,
--                                                              guiaRemisionUrl, fechaEnvio, fechaRecepcion })
--                            derivacion (venta derivada al Taller Principal)
--                            req        (seguimiento local de REQ-SUC-001; el REQ viaja a Tesorería en compras)
--                            caja / cierre (caja chica y cierres diarios declarados a Tesorería)
--                            stock / cliente
--                            contador   (correlativos: solo con siguiente_numero_sucursal)
--
-- Permisos (RLS):
--   lee     : creador, gerencia, sucursal, tesorería y almacén (Taller Principal)
--   escribe : creador y sucursal todo; almacén traslados y derivaciones; tesorería cierres de caja y REQ
--   compras : el rol sucursal solo envía / lee SUS requerimientos (data->>'origen' = 'SUCURSAL')
-- =====================================================================

begin;

-- 1. Rol nuevo en perfiles
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('creador', 'tesoreria', 'almacen', 'planilla', 'gerencia', 'admin', 'compras', 'editor', 'sucursal')) not valid;

-- 2. Tabla de documentos de la sucursal
create table if not exists public.sucursal (
  tipo text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (tipo, id)
);
create unique index if not exists sucursal_tipo_id_uidx on public.sucursal (tipo, id);
create index if not exists sucursal_tipo_created_idx on public.sucursal (tipo, created_at desc);

drop trigger if exists sucursal_updated_at on public.sucursal;
create trigger sucursal_updated_at before update on public.sucursal
  for each row execute function public.tocar_updated_at();

alter table public.sucursal enable row level security;
grant select, insert, update, delete on public.sucursal to authenticated;
revoke all on public.sucursal from anon;

drop policy if exists sucursal_select on public.sucursal;
drop policy if exists sucursal_escribir on public.sucursal;

create policy sucursal_select on public.sucursal for select to authenticated
  using (public.mi_rol() in ('creador', 'gerencia', 'sucursal', 'tesoreria', 'almacen') or public.puede_ver('/dashboard/sucursal'));

create policy sucursal_escribir on public.sucursal for all to authenticated
  using (
    tipo <> 'contador' and (
      public.mi_rol() in ('creador', 'sucursal')
      or (public.mi_rol() = 'almacen' and tipo in ('traslado', 'derivacion', 'req'))
      or (public.mi_rol() = 'tesoreria' and tipo in ('cierre', 'req'))
    )
  )
  with check (
    tipo <> 'contador' and (
      public.mi_rol() in ('creador', 'sucursal')
      or (public.mi_rol() = 'almacen' and tipo in ('traslado', 'derivacion', 'req'))
      or (public.mi_rol() = 'tesoreria' and tipo in ('cierre', 'req'))
    )
  );

-- 3. Requerimientos de la sucursal -> Tesorería (tabla compras, tipo req_pendiente con origen SUCURSAL)
drop policy if exists compras_select_sucursal on public.compras;
drop policy if exists compras_req_sucursal on public.compras;

create policy compras_select_sucursal on public.compras for select to authenticated
  using (public.mi_rol() = 'sucursal' and tipo in ('req_pendiente', 'req_procesado') and data->>'origen' = 'SUCURSAL');

create policy compras_req_sucursal on public.compras for all to authenticated
  using (public.mi_rol() = 'sucursal' and tipo = 'req_pendiente' and data->>'origen' = 'SUCURSAL')
  with check (public.mi_rol() = 'sucursal' and tipo = 'req_pendiente' and data->>'origen' = 'SUCURSAL');

-- 4. Correlativos de la sucursal (atómicos, por año):
--    VTA-001-2026 · REQ-SUC-001 · GE-0001 (guía de entrega) · CC-001 (cierre de caja)  -> sucursal / creador
--    OT-00001 · T001-000001 (guía de remisión remitente, tipo 09)                     -> almacén / creador
create or replace function public.siguiente_numero_sucursal(serie text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  clave text := serie || '_' || to_char(now() at time zone 'America/Lima', 'YYYY');
  n integer;
begin
  if serie in ('VTA', 'REQSUC', 'GE', 'CC') then
    if rol not in ('creador', 'sucursal') then
      raise exception 'Su usuario no puede emitir documentos de la sucursal' using errcode = '42501';
    end if;
  elsif serie in ('OT', 'GR') then
    if rol not in ('creador', 'almacen') then
      raise exception 'Solo el Taller Principal (almacén) emite órdenes de traslado y guías de remisión' using errcode = '42501';
    end if;
    clave := serie; -- OT y guías: correlativo continuo
  else
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;

  insert into public.sucursal (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(clave, 1))
  on conflict (tipo, id) do update
    set data = public.sucursal.data || jsonb_build_object(clave, coalesce((public.sucursal.data ->> clave)::integer, 0) + 1)
  returning (data ->> clave)::integer into n;
  return n;
end $$;

revoke all on function public.siguiente_numero_sucursal(text) from public, anon;
grant execute on function public.siguiente_numero_sucursal(text) to authenticated;
-- Con 20261023_sedes_multisede.sql la función recibe también la sede: no deben quedar dos versiones
do $$
begin
  if to_regprocedure('public.siguiente_numero_sucursal(text,uuid)') is not null then
    drop function if exists public.siguiente_numero_sucursal(text);
  end if;
end $$;

-- 5. Sucursal inicial (editable desde el módulo)
insert into public.sucursal (tipo, id, data)
values ('sucursal', 'SUC-AQP-SUR', jsonb_build_object(
  'id', 'SUC-AQP-SUR',
  'nombre', 'Arequipa Sur',
  'sede', 'Arequipa',
  'direccion', '',
  'jefeId', null,
  'jefeNombre', 'LIZBETH CAHUANA APFATA',
  'cajaChicaActual', 0
))
on conflict (tipo, id) do nothing;

-- 6. Vistas de lectura (mismos campos que los modelos; respetan RLS)
-- (si ya se ejecutó 20261023_sedes_multisede.sql, las vistas tienen sede_id y no se vuelven a crear)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_sucursal_ventas' and column_name = 'sede_id') then
    execute $v$create or replace view public.v_sucursal_ventas with (security_invoker = true) as
select id,
       (data->>'fecha')::date              as fecha,
       data->>'cliente'                     as cliente,
       data->>'docRef'                      as doc_ref,
       (data->>'total')::numeric            as total,
       data->>'estado'                      as estado,
       data->>'sucursalId'                  as sucursal_id,
       coalesce((data->>'requiereTraslado')::boolean, false) as requiere_traslado
  from public.sucursal where tipo = 'venta'$v$;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_sucursal_traslados' and column_name = 'sede_id') then
    execute $v$create or replace view public.v_sucursal_traslados with (security_invoker = true) as
select id,
       data->>'codigo'                      as codigo,
       data->>'origen'                      as origen,
       data->>'destinoSucursalId'           as destino_sucursal_id,
       data->'productos'                    as productos,
       data->>'estado'                      as estado,
       data->>'guiaRemision'                as guia_remision,
       data->>'guiaRemisionUrl'             as guia_remision_url,
       (data->>'fechaEnvio')::date          as fecha_envio,
       nullif(data->>'fechaRecepcion', '')::date as fecha_recepcion
  from public.sucursal where tipo = 'traslado'$v$;
  end if;
end $$;

grant select on public.v_sucursal_ventas, public.v_sucursal_traslados to authenticated;

-- 7. Realtime: los cambios de la sucursal llegan al instante a Taller y Tesorería
do $$
begin
  alter publication supabase_realtime add table public.sucursal;
exception when duplicate_object or undefined_object then null;
end $$;

commit;

-- 8. Usuario de la sucursal (después de crearlo en Authentication › Users como sucursal@comboyvid.local):
-- insert into public.perfiles (id, usuario, rol, nombre, modulos, solo_lectura, cargo, nombre_completo)
-- select id, 'sucursal', 'sucursal', 'Sucursal', array['/dashboard/sucursal'], false,
--        'Jefe de Sucursal - Módulo de Sucursal Beta', 'LIZBETH CAHUANA APFATA'
--   from auth.users where email = 'sucursal@comboyvid.local'
-- on conflict (id) do update set rol = excluded.rol, modulos = excluded.modulos, cargo = excluded.cargo, nombre_completo = excluded.nombre_completo;
