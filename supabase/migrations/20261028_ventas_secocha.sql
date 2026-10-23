-- =====================================================================
-- Secocha -> Ventas Arequipa
-- Los REQ-SECOCHA y las ventas derivadas de Secocha llegan a Ventas Arequipa (bandeja "Requerimientos de
-- Secocha"). Al aceptarlos, Ventas crea la Nota de Pedido (tabla ventas) y marca el REQ / la derivación
-- EN PRODUCCIÓN (tabla sucursal, tipos req y derivacion). Esta migración deja a Ventas leer y actualizar
-- esas filas: rol tesoreria (Tesorería / Ventas) o quien tenga /dashboard/ventas en perfiles.modulos.
-- Lo demás de sucursal_select / sucursal_escribir queda igual (20261022_sucursal_beta.sql).
-- sede_isolation (20261023_sedes_multisede.sql) sigue aplicando: los usuarios de sede solo ven la suya.
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================

drop policy if exists sucursal_select on public.sucursal;
drop policy if exists sucursal_escribir on public.sucursal;

create policy sucursal_select on public.sucursal for select to authenticated
  using (
    public.mi_rol() in ('creador', 'gerencia', 'sucursal', 'tesoreria', 'almacen')
    or public.puede_ver('/dashboard/sucursal')
    or (public.puede_ver('/dashboard/ventas') and tipo in ('req', 'derivacion', 'traslado', 'sucursal'))
  );

create policy sucursal_escribir on public.sucursal for all to authenticated
  using (
    tipo <> 'contador' and (
      public.mi_rol() in ('creador', 'sucursal')
      or (public.mi_rol() = 'almacen' and tipo in ('traslado', 'derivacion', 'req'))
      or (public.mi_rol() = 'tesoreria' and tipo in ('cierre', 'req', 'derivacion'))
      or (public.puede_ver('/dashboard/ventas') and tipo in ('req', 'derivacion'))
    )
  )
  with check (
    tipo <> 'contador' and (
      public.mi_rol() in ('creador', 'sucursal')
      or (public.mi_rol() = 'almacen' and tipo in ('traslado', 'derivacion', 'req'))
      or (public.mi_rol() = 'tesoreria' and tipo in ('cierre', 'req', 'derivacion'))
      or (public.puede_ver('/dashboard/ventas') and tipo in ('req', 'derivacion'))
    )
  );
