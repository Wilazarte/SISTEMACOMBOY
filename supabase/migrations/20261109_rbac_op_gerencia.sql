-- =====================================================================
-- RBAC: OP SOLO LOGÍSTICA + PERFIL GERENCIA (pedido de Williams, 2026-10-30)
--   · Emitir OP (crear expediente 26W y su detalle): solo LOGISTICA y SOPORTE (antes también Almacén).
--   · PRODUCCION: sin Almacén en sus módulos (solo entrega PT en la Fase 8 del expediente).
--   · GERENCIA (gerencia@comboyvid.local): visor de solo lectura; ve los lotes 26W para sus KPIs.
-- No borra datos. Se puede correr más de una vez. Requiere 20261106, 20261105 y 20261108.
-- =====================================================================

-- 1. Emitir OP: solo Logística y Soporte
do $$
begin
  if to_regclass('public.expedientes') is not null then
    execute 'drop policy if exists expedientes_crear on public.expedientes';
    execute $p$create policy expedientes_crear on public.expedientes for insert to authenticated
      with check (public.mi_rol() in ('creador', 'soporte', 'logistica'))$p$;
    -- Gerencia: solo lectura de los lotes (KPI "Lotes activos")
    execute 'drop policy if exists expedientes_leer_gerencia on public.expedientes';
    execute $p$create policy expedientes_leer_gerencia on public.expedientes for select to authenticated
      using (public.mi_rol() = 'gerencia')$p$;
  end if;
  if to_regclass('public.orden_produccion_detalles') is not null then
    execute 'drop policy if exists op_detalles_crear on public.orden_produccion_detalles';
    execute $p$create policy op_detalles_crear on public.orden_produccion_detalles for insert to authenticated
      with check (public.mi_rol() in ('creador', 'soporte', 'logistica'))$p$;
    execute 'drop policy if exists op_detalles_leer_gerencia on public.orden_produccion_detalles';
    execute $p$create policy op_detalles_leer_gerencia on public.orden_produccion_detalles for select to authenticated
      using (public.mi_rol() = 'gerencia')$p$;
  end if;
end $$;

-- 2. Producción: solo su módulo (Panel, sus OPs, Calidad); la entrega de PT va por el expediente 26W
update public.perfiles
   set modulos = array['/produccion', '/dashboard/produccion']
 where rol = 'produccion';

-- 3. Perfil GERENCIA (usuario de Auth gerencia@comboyvid.local, lo crea scripts/crear-usuarios.mjs)
insert into public.perfiles as p (id, usuario, rol, nombre, modulos, solo_lectura, nombre_completo, email, modulo_asignado, avatar_iniciales, es_admin, activo)
select u.id, 'gerencia', 'gerencia', 'Gerencia General', array[]::text[], true, 'Gerencia General', lower(u.email), 'GERENCIA', 'GG', false, true
from auth.users u
where lower(u.email) = 'gerencia@comboyvid.local'
on conflict (id) do update set
  nombre_completo  = 'Gerencia General',
  email            = excluded.email,
  modulo_asignado  = 'GERENCIA',
  avatar_iniciales = 'GG',
  solo_lectura     = true,
  es_admin         = false,
  activo           = true;

-- Revisar:
-- select nombre_completo, perfil, email, modulo_asignado, activo from public.usuarios order by es_admin desc, modulo_asignado;
