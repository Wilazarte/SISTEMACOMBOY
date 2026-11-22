-- =====================================================================
-- SECOCHA CON SUBMÓDULOS (fase 1): Ventas, Tesorería y Almacén de Secocha
--
-- Correr en Supabase > SQL Editor DESPUÉS de:
--   20261023_sedes_multisede.sql, 20261027_secocha_planta_principal.sql y 20261127_modulo_ventas.sql
-- Se puede correr más de una vez.
--
-- Qué hace:
--   1. usuarios_sedes acepta los roles de submódulo: ventas, tesoreria, almacen.
--   2. Numeración propia de cada sede (contadores_sede + siguiente_numero_sede):
--      NP-SEC-0001, F002-0001, B002-0001, OD-SEC-0001, DJ-SEC-001, GST-SEC-…  (Arequipa sigue con la suya).
--   3. Lectura: un usuario de Secocha lee ventas, compras, almacén, planilla y contable SOLO de Secocha
--      (la política restrictiva sede_isolation ya filtra por sede).
--   4. Tabla sucursal: el almacenero de Secocha escribe REQ, traslados (recepción) y stock;
--      el tesorero de Secocha, caja chica y cierres.
--   5. siguiente_numero_sucursal: REQ-SECOCHA (almacenero) y cierre de caja CC (tesorero) de Secocha.
--
-- Los usuarios (ventas, tesorería y almacén de Secocha) se crean con
-- /mnt/project-files/sql/PLANTILLA_crear_usuarios_secocha.sql, DESPUÉS de este archivo.
-- =====================================================================

begin;

-- 1. Roles de usuarios_sedes
alter table public.usuarios_sedes drop constraint if exists usuarios_sedes_rol_check;
alter table public.usuarios_sedes add constraint usuarios_sedes_rol_check
  check (rol in ('admin_sede', 'vendedor', 'cajero', 'ventas', 'tesoreria', 'almacen'));

-- 2. Numeración por sede
create table if not exists public.contadores_sede (
  sede_id uuid not null references public.sedes(id) on delete cascade,
  serie text not null,
  n integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (sede_id, serie)
);
alter table public.contadores_sede enable row level security;
-- Sin políticas: solo se toca con siguiente_numero_sede (security definer). Se puede leer para revisar.
drop policy if exists contadores_sede_select on public.contadores_sede;
create policy contadores_sede_select on public.contadores_sede for select to authenticated
  using (public.sede_usuario() is null or sede_id = public.sede_usuario());
grant select on public.contadores_sede to authenticated;
revoke all on public.contadores_sede from anon;

create or replace function public.siguiente_numero_sede(p_serie text, p_sede uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  propia uuid := public.sede_usuario();
  sede uuid;
  rol text := public.mi_rol();
  n integer;
begin
  if auth.uid() is null or rol is null or rol = 'sin_rol' then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;
  -- Usuario de sede: siempre la suya. ERP central (SOPORTE entrando a Secocha): la que pide.
  sede := coalesce(propia, p_sede);
  if sede is null or not exists (select 1 from public.sedes where id = sede) then
    raise exception 'Sede inválida' using errcode = '22023';
  end if;
  if p_serie is null or p_serie !~ '^[A-Z0-9_]{1,12}$' then
    raise exception 'Serie inválida: %', p_serie using errcode = '22023';
  end if;
  -- Quién numera qué (igual que en Arequipa)
  if p_serie in ('NP', 'F001', 'B001', 'OD') and rol not in ('creador', 'soporte', 'admin', 'ventas') then
    raise exception 'Su usuario no puede emitir documentos de Ventas' using errcode = '42501';
  end if;
  if (p_serie in ('OC', 'DJ', 'GST', 'RCT', 'BOL') or p_serie like 'BOL\_%') and rol not in ('creador', 'soporte', 'admin', 'tesoreria', 'finanzas', 'planilla') then
    raise exception 'Su usuario no puede emitir documentos de Tesorería' using errcode = '42501';
  end if;

  insert into public.contadores_sede as c (sede_id, serie, n) values (sede, p_serie, 1)
  on conflict (sede_id, serie) do update set n = c.n + 1, updated_at = now()
  returning c.n into n;
  return n;
end $$;
revoke all on function public.siguiente_numero_sede(text, uuid) from public, anon;
grant execute on function public.siguiente_numero_sede(text, uuid) to authenticated;

-- 3. Lectura de las tablas de datos para los usuarios de Secocha (sede_isolation deja solo lo de Secocha)
do $$
declare
  t text;
begin
  foreach t in array array['ventas', 'compras', 'almacen', 'planilla', 'contable'] loop
    if to_regclass(format('public.%I', t)) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_select_sede', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.sede_usuario()) is not null)',
                   t || '_select_sede', t);
  end loop;
end $$;

-- 4. Tabla sucursal: almacenero y tesorero de Secocha
drop policy if exists sucursal_escribir_sede on public.sucursal;
create policy sucursal_escribir_sede on public.sucursal for all to authenticated
  using (
    tipo <> 'contador' and (select public.sede_usuario()) is not null and (
      (public.mi_rol() = 'almacen' and tipo in ('traslado', 'req', 'stock'))
      or (public.mi_rol() = 'tesoreria' and tipo in ('caja', 'cierre'))
    )
  )
  with check (
    tipo <> 'contador' and (select public.sede_usuario()) is not null and (
      (public.mi_rol() = 'almacen' and tipo in ('traslado', 'req', 'stock'))
      or (public.mi_rol() = 'tesoreria' and tipo in ('caja', 'cierre'))
    )
  );
drop policy if exists sucursal_select_sede on public.sucursal;
create policy sucursal_select_sede on public.sucursal for select to authenticated
  using ((select public.sede_usuario()) is not null);

-- 5. Correlativos de la tabla sucursal (REQ-SECOCHA, cierres de caja)
create or replace function public.siguiente_numero_sucursal(serie text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  de_sede boolean := public.sede_usuario() is not null;
  clave text := serie || '_' || to_char(now() at time zone 'America/Lima', 'YYYY');
  n integer;
begin
  if serie in ('VTA', 'GE') then
    if rol not in ('creador', 'sucursal') then
      raise exception 'Su usuario no puede emitir documentos de la sucursal' using errcode = '42501';
    end if;
  elsif serie = 'REQSUC' then
    if not (rol in ('creador', 'sucursal') or (de_sede and rol = 'almacen')) then
      raise exception 'Su usuario no puede emitir requerimientos de la sucursal' using errcode = '42501';
    end if;
  elsif serie = 'CC' then
    if not (rol in ('creador', 'sucursal') or (de_sede and rol = 'tesoreria')) then
      raise exception 'Su usuario no puede declarar el cierre de caja' using errcode = '42501';
    end if;
  elsif serie in ('OT', 'GR') then
    if rol not in ('creador', 'almacen') or de_sede then
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
grant execute on function public.siguiente_numero_sucursal(text) to authenticated;

commit;

-- Revisar:
-- select s.nombre, c.serie, c.n from public.contadores_sede c join public.sedes s on s.id = c.sede_id order by 1, 2;
-- select u.email, s.nombre, us.rol from public.usuarios_sedes us join auth.users u on u.id = us.user_id join public.sedes s on s.id = us.sede_id;
