-- =====================================================================
-- Flujo v3.0 · Orden de Producción → Expediente 26W-001 (pedido de Williams, 2026-10-30).
-- SOLO AGREGA: 4 tablas nuevas, la función generate_codigo_expediente(), triggers de control,
-- políticas, Realtime y el bucket privado "cotizaciones". No modifica ni borra nada existente.
-- Se puede correr más de una vez.
--
-- Datos de ejemplo (OC-5512, S/ 12k, OEE 82 %, A1 1,240 kg…): NO se cargan. Si alguna vez se siembra una
-- prueba, va con is_demo = true y las pantallas la marcan como DEMO.
-- =====================================================================

-- Roles de la planta que trabajan el expediente (hoy Logística / Producción entran con el rol almacen;
-- si se crean usuarios con rol logistica, produccion o finanzas ya quedan habilitados aquí).
create or replace function public.es_planta()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_rol() in ('creador', 'soporte', 'almacen', 'logistica', 'produccion', 'tesoreria', 'finanzas', 'planilla');
$$;

-- ---------------------------------------------------------------------
-- 1. expedientes: un registro por Orden de Producción. codigo_expediente = 26W-001 (año + W + correlativo).
--    `datos` guarda el detalle del flujo (solicitud de materiales, actas, transporte, horas, historial).
-- ---------------------------------------------------------------------
create table if not exists public.expedientes (
  id uuid primary key default gen_random_uuid(),
  codigo_expediente text not null unique,
  lote text,
  op_id text,
  plazo date,
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'CERRADO', 'ANULADO')),
  estado_avance int not null default 0 check (estado_avance between 0 and 100),
  fase_actual int check (fase_actual between 1 and 8),
  costo_estimado numeric(14, 2) not null default 0,
  costo_real numeric(14, 2) not null default 0,
  precio_venta numeric(14, 2) not null default 0,
  datos jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 26W-001: MAX + 1 del año en curso. El candado evita que dos PCs saquen el mismo número.
create or replace function public.generate_codigo_expediente()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  prefijo text := to_char(now() at time zone 'America/Lima', 'YY') || 'W-';
  n int;
begin
  perform pg_advisory_xact_lock(hashtext('generate_codigo_expediente'));
  select coalesce(max((substring(codigo_expediente from '^\d{2}W-(\d+)$'))::int), 0) + 1 into n
    from public.expedientes where codigo_expediente like prefijo || '%';
  return prefijo || lpad(n::text, 3, '0');
end $$;

alter table public.expedientes alter column codigo_expediente set default public.generate_codigo_expediente();

create or replace function public.expedientes_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.codigo_expediente := old.codigo_expediente; -- el código no cambia nunca
  return new;
end $$;
drop trigger if exists expedientes_touch on public.expedientes;
create trigger expedientes_touch before update on public.expedientes for each row execute function public.expedientes_touch();

-- ---------------------------------------------------------------------
-- 2. cotizaciones: ORIGEN DE LA VERDAD de los datos del proveedor (la OC los copia, nunca se digitan en la OC).
--    ruc_validado / estado / condición solo los escribe la Edge Function validar-ruc-decolecta.
-- ---------------------------------------------------------------------
create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null references public.expedientes (id),
  archivo_url text,
  archivo_nombre text,
  ruc text not null,
  razon_social text not null,
  direccion text,
  celular text,
  asesor_ventas text,
  nro_cotizacion text,
  banco text,
  cuenta_bancaria text,
  cci text,
  condicion_pago text,
  motivo_compra text,
  fecha_cotizacion date,
  validez_dias int,
  moneda text not null default 'PEN',
  subtotal numeric(14, 2) not null default 0,
  igv numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  ruc_validado boolean not null default false,
  ruc_estado text,            -- ACTIVO, BAJA DE OFICIO…
  condicion_habido text,      -- HABIDO, NO HABIDO…
  razon_social_sunat text,
  direccion_fiscal text,
  validado_at timestamptz,
  is_demo boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists cotizaciones_expediente_idx on public.cotizaciones (expediente_id);

-- La app no puede marcar un RUC como validado: eso viene solo de la Edge Function (service_role).
create or replace function public.cotizaciones_proteger_validacion()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if tg_op = 'INSERT' or new.ruc is distinct from old.ruc then
    new.ruc_validado := false; new.ruc_estado := null; new.condicion_habido := null;
    new.razon_social_sunat := null; new.direccion_fiscal := null; new.validado_at := null;
  else
    new.ruc_validado := old.ruc_validado; new.ruc_estado := old.ruc_estado; new.condicion_habido := old.condicion_habido;
    new.razon_social_sunat := old.razon_social_sunat; new.direccion_fiscal := old.direccion_fiscal; new.validado_at := old.validado_at;
  end if;
  return new;
end $$;
drop trigger if exists cotizaciones_proteger_validacion on public.cotizaciones;
create trigger cotizaciones_proteger_validacion before insert or update on public.cotizaciones
  for each row execute function public.cotizaciones_proteger_validacion();

-- ---------------------------------------------------------------------
-- 3. ordenes_compra: la OC del expediente. datos_proveedor se COPIA de la cotización en la base
--    (lo que envíe la app se ignora). Sin RUC validado, ACTIVO y HABIDO no se puede crear.
-- ---------------------------------------------------------------------
create table if not exists public.ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null references public.expedientes (id),
  cotizacion_id uuid not null references public.cotizaciones (id),
  codigo_oc text not null unique,
  motivo_sustentado text not null,
  fecha_oc date not null default (now() at time zone 'America/Lima')::date,
  plazo_entrega date,
  datos_proveedor jsonb not null default '{}'::jsonb,
  subtotal numeric(14, 2) not null default 0,
  igv numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  estado text not null default 'EMITIDA' check (estado in ('EMITIDA', 'PAGADA', 'FACTURADA', 'ANULADA')),
  bancarizacion jsonb,  -- medio_pago, codigo_operacion, fecha, banco, voucher_url (Finanzas)
  comprobante jsonb,    -- tipo, numero, fecha (factura del proveedor)
  is_demo boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists ordenes_compra_expediente_idx on public.ordenes_compra (expediente_id);

create or replace function public.ordenes_compra_desde_cotizacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.cotizaciones;
begin
  select * into c from public.cotizaciones where id = new.cotizacion_id;
  if not found then raise exception 'Cotización no encontrada'; end if;
  if c.expediente_id <> new.expediente_id then raise exception 'La cotización es de otro expediente'; end if;
  if tg_op = 'INSERT' then
    if not c.ruc_validado or coalesce(c.ruc_estado, '') <> 'ACTIVO' or coalesce(c.condicion_habido, '') <> 'HABIDO' then
      raise exception 'RUC % sin validar o no ACTIVO / HABIDO en SUNAT (Decolecta): no se puede emitir la OC', c.ruc;
    end if;
  end if;
  new.datos_proveedor := jsonb_build_object(
    'ruc', c.ruc, 'razon_social', coalesce(c.razon_social_sunat, c.razon_social), 'direccion', coalesce(c.direccion_fiscal, c.direccion),
    'celular', c.celular, 'asesor_ventas', c.asesor_ventas, 'nro_cotizacion', c.nro_cotizacion, 'banco', c.banco,
    'cuenta_bancaria', c.cuenta_bancaria, 'cci', c.cci, 'condicion_pago', c.condicion_pago, 'motivo_compra', c.motivo_compra,
    'moneda', c.moneda, 'ruc_estado', c.ruc_estado, 'condicion_habido', c.condicion_habido, 'validado_at', c.validado_at
  );
  new.subtotal := c.subtotal; new.igv := c.igv; new.total := c.total;
  return new;
end $$;
drop trigger if exists ordenes_compra_desde_cotizacion on public.ordenes_compra;
create trigger ordenes_compra_desde_cotizacion before insert or update of cotizacion_id, datos_proveedor, subtotal, igv, total on public.ordenes_compra
  for each row execute function public.ordenes_compra_desde_cotizacion();

-- ---------------------------------------------------------------------
-- 4. proveedor_validacion_log: cada consulta a Decolecta (prueba ante auditoría). Solo la escribe la Edge Function.
-- ---------------------------------------------------------------------
create table if not exists public.proveedor_validacion_log (
  id uuid primary key default gen_random_uuid(),
  ruc text not null,
  cotizacion_id uuid references public.cotizaciones (id),
  respuesta_decolecta jsonb,
  ok boolean not null default false,
  usuario text,
  fecha timestamptz not null default now()
);
create index if not exists proveedor_validacion_log_ruc_idx on public.proveedor_validacion_log (ruc, fecha desc);

-- ---------------------------------------------------------------------
-- Políticas: la planta lee y escribe; nadie borra desde la app (se anula con estado).
-- ---------------------------------------------------------------------
alter table public.expedientes enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.ordenes_compra enable row level security;
alter table public.proveedor_validacion_log enable row level security;

drop policy if exists expedientes_leer on public.expedientes;
create policy expedientes_leer on public.expedientes for select to authenticated using (public.es_planta());
drop policy if exists expedientes_crear on public.expedientes;
create policy expedientes_crear on public.expedientes for insert to authenticated
  with check (public.mi_rol() in ('creador', 'soporte', 'almacen', 'logistica'));
drop policy if exists expedientes_editar on public.expedientes;
create policy expedientes_editar on public.expedientes for update to authenticated using (public.es_planta()) with check (public.es_planta());

drop policy if exists cotizaciones_leer on public.cotizaciones;
create policy cotizaciones_leer on public.cotizaciones for select to authenticated using (public.es_planta());
drop policy if exists cotizaciones_escribir on public.cotizaciones;
create policy cotizaciones_escribir on public.cotizaciones for insert to authenticated
  with check (public.mi_rol() in ('creador', 'soporte', 'almacen', 'logistica'));
drop policy if exists cotizaciones_editar on public.cotizaciones;
create policy cotizaciones_editar on public.cotizaciones for update to authenticated
  using (public.mi_rol() in ('creador', 'soporte', 'almacen', 'logistica'))
  with check (public.mi_rol() in ('creador', 'soporte', 'almacen', 'logistica'));

drop policy if exists ordenes_compra_leer on public.ordenes_compra;
create policy ordenes_compra_leer on public.ordenes_compra for select to authenticated using (public.es_planta());
drop policy if exists ordenes_compra_crear on public.ordenes_compra;
create policy ordenes_compra_crear on public.ordenes_compra for insert to authenticated
  with check (public.mi_rol() in ('creador', 'soporte', 'almacen', 'logistica'));
-- Finanzas (tesoreria) registra la bancarización; Logística el comprobante
drop policy if exists ordenes_compra_editar on public.ordenes_compra;
create policy ordenes_compra_editar on public.ordenes_compra for update to authenticated using (public.es_planta()) with check (public.es_planta());

drop policy if exists validacion_log_leer on public.proveedor_validacion_log;
create policy validacion_log_leer on public.proveedor_validacion_log for select to authenticated using (public.es_planta());

-- Realtime: el tablero y las campanas se actualizan solos
do $$
declare t text;
begin
  foreach t in array array['expedientes', 'cotizaciones', 'ordenes_compra'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Storage: bucket privado "cotizaciones" (cotizaciones/26W-001/<archivo>). PDF, imagen o Excel, máx. 10 MB.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotizaciones', 'cotizaciones', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'])
on conflict (id) do nothing;

drop policy if exists cotizaciones_archivos_leer on storage.objects;
create policy cotizaciones_archivos_leer on storage.objects for select to authenticated
  using (bucket_id = 'cotizaciones' and public.es_planta());
drop policy if exists cotizaciones_archivos_subir on storage.objects;
create policy cotizaciones_archivos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'cotizaciones' and public.mi_rol() in ('creador', 'soporte', 'almacen', 'logistica', 'tesoreria', 'finanzas'));
