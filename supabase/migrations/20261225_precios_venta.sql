-- =====================================================================
-- BASE DE PRECIOS DE VENTA (pedido de Williams 2026-11-22)
--
-- "Crea una base de datos para precios de ventas, que se pueda jalar de Costos de Producción si está su ficha
--  completa en caso de equipos, o llenar manualmente si no tiene precio. El precio indicado que se quede guardado."
--
-- Un solo archivo: pegar completo en Supabase › SQL Editor y ejecutar. Es idempotente (se puede correr otra vez).
-- No toca tablas de Producción, Almacén ni Ventas: solo LEE las hojas de costo (si existen) con una función.
--
--   precios_venta            : un precio por producto del catálogo o por modelo de equipo (S/, IGV incluido).
--   precios_venta_historial  : cada cambio de precio queda registrado (solo inserción, nadie lo edita ni borra).
--   pv_costos_modelos()      : última hoja de costo por modelo de equipo; "completa" = APROBADA o CERRADA.
--
-- Leen todos los usuarios con sesión. Guardan: Ventas, Finanzas/Tesorería y Soporte (creador/admin).
-- =====================================================================

begin;

create table if not exists public.precios_venta (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('PRODUCTO', 'EQUIPO')),
  clave text not null,                       -- nombre normalizado del producto (MAYÚSCULAS) o modelo del equipo
  producto_id text,                          -- productos_maestro.id (si es producto del catálogo)
  sku text,
  nombre text not null,
  unidad text not null default 'UND',
  precio numeric(14, 2) not null check (precio >= 0),          -- precio de venta UNITARIO en S/ con IGV incluido
  precio_sin_igv numeric(14, 2) generated always as (round(precio / 1.18, 2)) stored,
  origen text not null default 'MANUAL' check (origen in ('MANUAL', 'COSTO_PRODUCCION')),
  hoja_costo text,                           -- CP-2026-0001 cuando se jaló de Costo de Producción
  costo_unitario numeric(14, 2),             -- costo unitario de la hoja (sin IGV) al momento de jalar
  margen numeric(6, 4),                      -- margen usado: precio sin IGV = costo / (1 - margen)
  observacion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_usuario text,
  updated_at timestamptz not null default now(),
  updated_usuario text,
  unique (tipo, clave)
);
create index if not exists precios_venta_nombre_idx on public.precios_venta (nombre);

create table if not exists public.precios_venta_historial (
  id bigint generated always as identity primary key,
  precio_id uuid not null,
  tipo text not null,
  clave text not null,
  nombre text not null,
  precio_anterior numeric(14, 2),
  precio_nuevo numeric(14, 2) not null,
  origen text not null,
  hoja_costo text,
  costo_unitario numeric(14, 2),
  margen numeric(6, 4),
  observacion text,
  usuario text,
  created_at timestamptz not null default now()
);
create index if not exists precios_venta_historial_precio_idx on public.precios_venta_historial (precio_id, created_at desc);

-- Usuario que guarda (nombre del perfil) ----------------------------------------------------------
create or replace function public.pv_usuario() returns text language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(to_jsonb(p) ->> 'nombre_completo', ''), nullif(to_jsonb(p) ->> 'nombre', ''), to_jsonb(p) ->> 'usuario')
                     from public.perfiles p where p.id = auth.uid()), 'sistema');
$$;

create or replace function public.pv_puede_editar() returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_rol() in ('creador', 'soporte', 'admin', 'ventas', 'tesoreria', 'finanzas')
     and not coalesce((select (to_jsonb(p) ->> 'solo_lectura')::boolean from public.perfiles p where p.id = auth.uid()), false);
$$;

-- Normaliza, sella usuario/fecha y deja el historial ---------------------------------------------
create or replace function public.pv_antes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.clave := upper(regexp_replace(trim(new.clave), '\s+', ' ', 'g'));
  new.nombre := trim(new.nombre);
  new.updated_at := now();
  new.updated_usuario := public.pv_usuario();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_usuario := new.updated_usuario;
  else
    new.created_at := old.created_at;
    new.created_usuario := old.created_usuario;
  end if;
  if new.origen = 'MANUAL' then
    new.hoja_costo := null; new.costo_unitario := null; new.margen := null;
  end if;
  return new;
end $$;

create or replace function public.pv_historial() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.precio is distinct from old.precio or new.origen is distinct from old.origen or new.hoja_costo is distinct from old.hoja_costo
     or new.activo is distinct from old.activo then
    insert into public.precios_venta_historial (precio_id, tipo, clave, nombre, precio_anterior, precio_nuevo, origen, hoja_costo, costo_unitario, margen, observacion, usuario)
    values (new.id, new.tipo, new.clave, new.nombre, case when tg_op = 'UPDATE' then old.precio end, new.precio, new.origen, new.hoja_costo,
            new.costo_unitario, new.margen,
            case when not new.activo then concat_ws(' · ', 'PRECIO QUITADO', new.observacion) else new.observacion end, new.updated_usuario);
  end if;
  return null;
end $$;

drop trigger if exists pv_antes on public.precios_venta;
create trigger pv_antes before insert or update on public.precios_venta for each row execute function public.pv_antes();
drop trigger if exists pv_historial on public.precios_venta;
create trigger pv_historial after insert or update on public.precios_venta for each row execute function public.pv_historial();

-- El historial no se edita ni se borra
create or replace function public.pv_historial_inmutable() returns trigger language plpgsql as $$
begin
  raise exception 'El historial de precios de venta no se puede modificar ni borrar.';
end $$;
drop trigger if exists pv_historial_inmutable on public.precios_venta_historial;
create trigger pv_historial_inmutable before update or delete on public.precios_venta_historial for each row execute function public.pv_historial_inmutable();

-- Costo de Producción por modelo (solo lectura) ---------------------------------------------------
-- Devuelve, por cada modelo de equipo, la hoja más reciente (prefiere las completas = APROBADO / CERRADO,
-- y entre ellas la hoja POR MODELO). Si 20261204_costo_produccion.sql no se corrió, no devuelve nada.
create or replace function public.pv_costos_modelos() returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or to_regclass('public.production_orders') is null or to_regclass('public.production_costs') is null then
    return;
  end if;
  return query execute $q$
    with h as (
      select o.codigo, o.origen, o.orden_produccion_id, o.tipo_equipo, o.modelo, o.estado, o.aprobado_at, o.cerrado_at, o.created_at,
             c.costo_unitario, c.margen_deseado, c.precio_sugerido, c.precio_venta,
             case when o.origen = 'MODELO' then o.orden_produccion_id
                  else coalesce(public.pc_modelo_familia(concat_ws(' ', o.tipo_equipo, o.modelo)), upper(concat_ws(' ', o.tipo_equipo, o.modelo))) end as familia,
             o.estado in ('APROBADO', 'CERRADO') as completa
        from public.production_orders o
        join public.production_costs c on c.orden_id = o.id
       where o.estado not in ('ANULADO', 'RECHAZADO')
    ), r as (
      select h.*, row_number() over (partition by familia
                                      order by completa desc, (origen = 'MODELO') desc,
                                               coalesce(aprobado_at, cerrado_at, created_at) desc) as n
        from h where familia is not null
    )
    select jsonb_build_object('modelo', familia, 'hoja', codigo, 'origen', origen, 'estado', estado, 'completa', completa,
                              'costo_unitario', costo_unitario, 'margen', margen_deseado, 'precio_sugerido', precio_sugerido,
                              'precio_venta', precio_venta, 'fecha', coalesce(aprobado_at, cerrado_at, created_at))
      from r where n = 1 order by familia
  $q$;
exception when undefined_function or undefined_table or undefined_column then
  return;
end $$;

-- Permisos -----------------------------------------------------------------------------------------
alter table public.precios_venta enable row level security;
alter table public.precios_venta_historial enable row level security;
revoke all on public.precios_venta, public.precios_venta_historial from anon;
grant select, insert, update on public.precios_venta to authenticated;
revoke delete on public.precios_venta from authenticated;   -- no se borra: se desactiva
grant select on public.precios_venta_historial to authenticated;
revoke insert, update, delete on public.precios_venta_historial from authenticated;

drop policy if exists precios_venta_leer on public.precios_venta;
create policy precios_venta_leer on public.precios_venta for select to authenticated using (true);
drop policy if exists precios_venta_insertar on public.precios_venta;
create policy precios_venta_insertar on public.precios_venta for insert to authenticated with check (public.pv_puede_editar());
drop policy if exists precios_venta_editar on public.precios_venta;
create policy precios_venta_editar on public.precios_venta for update to authenticated using (public.pv_puede_editar()) with check (public.pv_puede_editar());
drop policy if exists precios_venta_historial_leer on public.precios_venta_historial;
create policy precios_venta_historial_leer on public.precios_venta_historial for select to authenticated using (true);

revoke execute on function public.pv_costos_modelos(), public.pv_puede_editar(), public.pv_usuario() from public, anon;
grant execute on function public.pv_costos_modelos(), public.pv_puede_editar(), public.pv_usuario() to authenticated;

-- Tiempo real (la pantalla se actualiza sola en todos los equipos)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'precios_venta') then
    execute 'alter publication supabase_realtime add table public.precios_venta';
  end if;
end $$;

commit;

-- Revisar -----------------------------------------------------------------------------------------
-- select tipo, nombre, precio, precio_sin_igv, origen, hoja_costo, updated_usuario, updated_at from public.precios_venta order by tipo, nombre;
-- select * from public.pv_costos_modelos();
-- select * from public.precios_venta_historial order by created_at desc limit 50;
