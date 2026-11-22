-- =====================================================================
-- Base de proveedores y clientes compartida Arequipa + Secocha (Williams 2026-11-17)
--
-- Orden: correr DESPUÉS de 20261023_sedes_multisede.sql, 20261127_modulo_ventas.sql y 20261130_secocha_erp_completo.sql
-- (ya corridos). Es idempotente: se puede correr más de una vez.
--
-- Qué hace:
--   1. Proveedores (compras tipo 'proveedor') y clientes (ventas tipo 'cliente' y 'clasificacion_cliente')
--      dejan de estar aislados por sede: Arequipa y Secocha ven y editan la MISMA base.
--      Todo lo demás (compras, gastos, NP, comprobantes, cobros…) sigue aislado por sede como hoy.
--   2. Al editar un proveedor o cliente desde otra sede, la fila conserva la sede que lo registró.
--   3. Logística puede leer y escribir proveedores y clientes; Ventas, Tesorería y el administrador de Secocha
--      también (como ya hacían).
--
-- No borra ni modifica datos. Los clientes de Secocha migrados por 20261201 pasan a verse en Arequipa:
-- al final hay una consulta para revisar documentos repetidos entre sedes (no se unen solos).
-- =====================================================================

begin;

-- 1. sede_isolation: excepción para la base compartida -----------------------------------------
do $$
begin
  if to_regclass('public.compras') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'compras' and column_name = 'sede_id') then
    drop policy if exists sede_isolation on public.compras;
    create policy sede_isolation on public.compras as restrictive for all to authenticated
      using ((select public.sede_usuario()) is null or sede_id = (select public.sede_usuario()) or tipo = 'proveedor')
      with check ((select public.sede_usuario()) is null or sede_id = (select public.sede_usuario()) or tipo = 'proveedor');
  else
    raise notice 'compras sin sede_id: no se toca sede_isolation';
  end if;

  if to_regclass('public.ventas') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ventas' and column_name = 'sede_id') then
    drop policy if exists sede_isolation on public.ventas;
    create policy sede_isolation on public.ventas as restrictive for all to authenticated
      using ((select public.sede_usuario()) is null or sede_id = (select public.sede_usuario()) or tipo in ('cliente', 'clasificacion_cliente'))
      with check ((select public.sede_usuario()) is null or sede_id = (select public.sede_usuario()) or tipo in ('cliente', 'clasificacion_cliente'));
  else
    raise notice 'ventas sin sede_id: no se toca sede_isolation';
  end if;
end $$;

-- 2. Conservar la sede de origen al editar desde otra sede ----------------------------------------
--    asignar_sede (20261023) pone la sede del usuario en cada UPDATE. Este trigger corre DESPUÉS
--    (orden alfabético: asignar_sede < conservar_sede_base) y devuelve la sede original.
create or replace function public.conservar_sede_base() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('proveedor', 'cliente', 'clasificacion_cliente') and old.sede_id is not null then
    new.sede_id := old.sede_id;
    new.data := coalesce(new.data, '{}'::jsonb) || jsonb_build_object('sedeId', old.sede_id::text);
  end if;
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['compras', 'ventas'] loop
    if to_regclass(format('public.%I', t)) is null
       or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'sede_id')
       or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'data') then
      continue;
    end if;
    execute format('drop trigger if exists conservar_sede_base on public.%I', t);
    execute format('create trigger conservar_sede_base before update on public.%I for each row execute function public.conservar_sede_base()', t);
  end loop;
end $$;

-- 3. Lectura y escritura (políticas ADICIONALES: las existentes no cambian) ------------------------
drop policy if exists compras_base_proveedores_select on public.compras;
create policy compras_base_proveedores_select on public.compras for select to authenticated
  using (tipo = 'proveedor');

drop policy if exists compras_base_proveedores_escribir on public.compras;
create policy compras_base_proveedores_escribir on public.compras for all to authenticated
  using (tipo = 'proveedor' and public.mi_rol() in ('creador', 'soporte', 'logistica', 'tesoreria', 'finanzas', 'sucursal'))
  with check (tipo = 'proveedor' and public.mi_rol() in ('creador', 'soporte', 'logistica', 'tesoreria', 'finanzas', 'sucursal'));

drop policy if exists ventas_base_clientes_select on public.ventas;
create policy ventas_base_clientes_select on public.ventas for select to authenticated
  using (tipo in ('cliente', 'clasificacion_cliente'));

drop policy if exists ventas_base_clientes_escribir on public.ventas;
create policy ventas_base_clientes_escribir on public.ventas for all to authenticated
  using (tipo in ('cliente', 'clasificacion_cliente') and public.mi_rol() in ('creador', 'soporte', 'logistica', 'ventas', 'tesoreria', 'sucursal'))
  with check (tipo in ('cliente', 'clasificacion_cliente') and public.mi_rol() in ('creador', 'soporte', 'logistica', 'ventas', 'tesoreria', 'sucursal'));

commit;

-- Revisar -----------------------------------------------------------------------------------------
-- Proveedores y clientes por sede:
-- select s.nombre as sede, x.tipo, count(*) from (
--   select sede_id, tipo from public.compras where tipo = 'proveedor'
--   union all select sede_id, tipo from public.ventas where tipo in ('cliente', 'clasificacion_cliente')
-- ) x left join public.sedes s on s.id = x.sede_id group by 1, 2 order by 1, 2;
--
-- Clientes con el mismo documento registrados en las dos sedes (unirlos a mano si corresponde):
-- select data->>'numDoc' as documento, count(*), string_agg(data->>'razonSocial' || ' (' || coalesce(s.nombre, '?') || ')', ' | ')
--   from public.ventas v left join public.sedes s on s.id = v.sede_id
--  where v.tipo = 'cliente' group by 1 having count(*) > 1;
