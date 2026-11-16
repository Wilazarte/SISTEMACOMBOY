-- =====================================================================
-- MÓDULO VENTAS (pedido de Williams, 2026-11-16): Ventas sale de Logística y es un módulo propio.
--   INICIO /ventas · pantallas /dashboard/ventas (Notas de pedido, Comprobantes, Cuentas por cobrar,
--   Clientes, Catálogo de Productos, Despachos, Requerimientos de Secocha, Configuración).
--   Rol nuevo: ventas (modulador: solo su módulo). Logística deja de ver y escribir Ventas.
--
-- ANTES DE CORRER:
--   1. Haber corrido 20261106_perfiles_asignacion.sql (columnas modulo_asignado, es_admin, activo…).
--   2. Crear el usuario en Supabase → Authentication → Users → Add user:
--        ventas@comboyvid.local   (contraseña la pone Williams; marcar "Auto Confirm User")
--      Si el usuario aún no existe, este SQL igual corre: el paso 2 no hace nada y se vuelve a correr después.
--
-- SOLO AGREGA O AJUSTA PERMISOS. No borra datos. Se puede correr más de una vez.
-- Pegar en Supabase → SQL Editor → Run.
-- =====================================================================

-- 1. Rol "ventas" permitido en perfiles
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('creador', 'tesoreria', 'almacen', 'planilla', 'gerencia', 'admin', 'compras', 'editor', 'sucursal',
                 'soporte', 'logistica', 'finanzas', 'produccion', 'ventas')) not valid;

-- 2. Perfil del usuario de Ventas (ventas@comboyvid.local). Cambie nombre_completo / iniciales cuando haya titular.
insert into public.perfiles as p (id, usuario, rol, nombre, modulos, solo_lectura, nombre_completo, email, modulo_asignado, avatar_iniciales, es_admin, activo)
select u.id, 'ventas', 'ventas', 'Ventas', array['/ventas', '/dashboard/ventas'], false, 'Ventas', lower(u.email), 'VENTAS', 'VE', false, true
from auth.users u
where lower(u.email) = 'ventas@comboyvid.local'
on conflict (id) do update set
  rol             = 'ventas',
  modulos         = array['/ventas', '/dashboard/ventas'],
  modulo_asignado = 'VENTAS',
  es_admin        = false,
  activo          = true;

-- 3. Logística ya no es dueña de Ventas: se le quita /dashboard/ventas y su política de escritura
update public.perfiles
set modulos = array_remove(modulos, '/dashboard/ventas')
where rol = 'logistica' and '/dashboard/ventas' = any (modulos);
drop policy if exists ventas_escribir_logistica on public.ventas;

-- 4. Escritura del rol ventas (políticas ADICIONALES: las de creador / tesorería no cambian)
--    ventas: clientes, notas de pedido, comprobantes, cobros y asientos de venta (no el contador de numeración)
drop policy if exists ventas_escribir_ventas on public.ventas;
create policy ventas_escribir_ventas on public.ventas for all to authenticated
  using (tipo <> 'contador' and public.mi_rol() = 'ventas')
  with check (tipo <> 'contador' and public.mi_rol() = 'ventas');
--    condiciones de pago (pestaña Configuración de Ventas)
drop policy if exists condiciones_pago_escribir_ventas on public.condiciones_pago;
create policy condiciones_pago_escribir_ventas on public.condiciones_pago for all to authenticated
  using (public.mi_rol() = 'ventas') with check (public.mi_rol() = 'ventas');
--    órdenes de despacho que genera la nota de pedido aprobada (almacen tipo 'despacho'); el stock no lo toca
drop policy if exists almacen_escribir_ventas on public.almacen;
create policy almacen_escribir_ventas on public.almacen for all to authenticated
  using (public.mi_rol() = 'ventas' and tipo = 'despacho')
  with check (public.mi_rol() = 'ventas' and tipo = 'despacho');
--    Lectura: ventas, almacen (stock y despachos) y Secocha ya se leen con puede_ver('/dashboard/ventas').

-- 5. Numeración NP / F001 / B001 / OD: se agrega 'ventas' a los roles que pueden emitir documentos de venta.
--    Se edita la función que está hoy en la base (no se reemplaza entera, para no perder otras series).
do $$
declare
  def text;
  nuevo text;
begin
  select pg_get_functiondef('public.siguiente_numero(text)'::regprocedure) into def;
  if def ~ '''ventas''' then
    raise notice 'siguiente_numero ya permite al rol ventas';
    return;
  end if;
  nuevo := regexp_replace(def,
    '(serie in \(''NP'', ''F001'', ''B001'', ''OD''\) and rol not in \()',
    '\1''ventas'', ');
  if nuevo = def then
    raise warning 'No se encontró la regla NP/F001/B001/OD en siguiente_numero: avise a soporte (el rol ventas no podrá numerar)';
  else
    execute nuevo;
    raise notice 'siguiente_numero: rol ventas agregado a NP, F001, B001 y OD';
  end if;
end $$;

-- 5b. Notas de crédito / débito SUNAT (solo si ya se corrió 20261125_sunat_cpe.sql del PR de facturación)
do $$
declare
  def text;
begin
  if to_regprocedure('public.siguiente_numero_cpe(text)') is null then return; end if;
  select pg_get_functiondef('public.siguiente_numero_cpe(text)'::regprocedure) into def;
  if def !~ '''ventas''' then
    execute replace(def, 'rol not in (''creador'',', 'rol not in (''ventas'', ''creador'',');
  end if;
end $$;

-- 6. Chat del grupo Ventas: el modulador de Ventas lee solo su sala ("Ventas")
create or replace function public.mi_sala_chat() returns text
language sql stable security definer set search_path = public as $$
  select case
    when rol = 'logistica' or upper(modulo_asignado) = 'LOGISTICA' then 'Logística'
    when rol = 'almacen' or upper(modulo_asignado) = 'ALMACEN' then 'Almacén'
    when rol in ('tesoreria', 'planilla', 'finanzas') or upper(modulo_asignado) = 'FINANZAS' then 'Finanzas'
    when rol = 'produccion' or upper(modulo_asignado) = 'PRODUCCION' then 'Producción'
    when rol = 'ventas' or upper(modulo_asignado) = 'VENTAS' then 'Ventas'
  end
  from public.perfiles where id = auth.uid()
$$;
grant execute on function public.mi_sala_chat() to authenticated;

-- 7. Avisos (campana / notificaciones en vivo del INICIO): módulo VENTAS
create or replace function public.mi_modulo_notif()
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.es_admin or p.rol in ('creador', 'soporte') then 'SOPORTE'
    when upper(coalesce(p.modulo_asignado, '')) in ('LOGISTICA', 'PRODUCCION', 'ALMACEN', 'FINANZAS', 'VENTAS') then upper(p.modulo_asignado)
    when p.rol = 'logistica' then 'LOGISTICA'
    when p.rol = 'produccion' then 'PRODUCCION'
    when p.rol = 'almacen' then 'ALMACEN'
    when p.rol in ('tesoreria', 'finanzas', 'planilla') then 'FINANZAS'
    when p.rol = 'ventas' then 'VENTAS'
    else null
  end
  from public.perfiles p where p.id = auth.uid();
$$;
revoke execute on function public.mi_modulo_notif() from public, anon;
grant execute on function public.mi_modulo_notif() to authenticated, service_role;

-- Revisar:
-- select usuario, rol, modulo_asignado, modulos from public.perfiles where rol in ('ventas', 'logistica');
-- select pg_get_functiondef('public.siguiente_numero(text)'::regprocedure);
