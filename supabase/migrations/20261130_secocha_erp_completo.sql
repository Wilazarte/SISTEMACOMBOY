-- =====================================================================
-- SECOCHA = COPIA COMPLETA DEL ERP (Williams 2026-11-17)
-- Secocha no tiene perfiles separados: su ADMINISTRADOR (sucsecocha, rol sucursal) ve TODO el ERP de Arequipa
-- (Tesorería, Logística, Almacén, Ventas, Planilla, Dashboard) en "modo Secocha": mismas pantallas y barra de
-- accesos, solo los datos y la numeración de Secocha. La política restrictiva sede_isolation impide ver Arequipa.
--
-- Correr en Supabase > SQL Editor DESPUÉS de 20261129_secocha_submodulos.sql. Se puede correr más de una vez.
--
--   0. sucsecocha@comboyvid.com pasa a administrador de Secocha: módulos "*" (sigue con rol sucursal y sede Secocha).
--   1. usuarios_sedes acepta todos los perfiles del ERP.
--   2. siguiente_numero_sede: cualquier perfil de la sede numera sus documentos (las tablas siguen protegidas por RLS).
--   3. Cajas por sede: Secocha recibe sus propias CAJA CHICA, CAJA GENERAL y FONDO DE RESERVA (saldo 0),
--      con las mismas cuentas bancarias de la empresa. El nombre de caja ya no es único en todo el ERP, sino por sede.
--      OJO: 20261031_cajas_arequipa.sql ya no se debe volver a correr (usaba el nombre único global).
--   4. El administrador de Secocha escribe en todas las tablas que tienen sede (ventas, compras, almacén, planilla,
--      contable, cajas, adelantos…), siempre solo en filas de Secocha.
-- =====================================================================

begin;

-- 0. Administrador de Secocha
update public.perfiles p
   set modulos = array['*'], modulo_asignado = 'SECOCHA', solo_lectura = false
  from auth.users u
 where u.id = p.id and lower(u.email) = 'sucsecocha@comboyvid.com';

-- 1. Perfiles de usuarios_sedes
alter table public.usuarios_sedes drop constraint if exists usuarios_sedes_rol_check;
alter table public.usuarios_sedes add constraint usuarios_sedes_rol_check
  check (rol in ('admin_sede', 'vendedor', 'cajero', 'ventas', 'tesoreria', 'almacen', 'logistica', 'planilla', 'gerencia', 'finanzas', 'produccion'));

-- 2. Numeración de la sede para todos los perfiles
create or replace function public.siguiente_numero_sede(p_serie text, p_sede uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  propia uuid := public.sede_usuario();
  sede uuid;
  rol text := public.mi_rol();
  n integer;
begin
  if auth.uid() is null or rol is null or rol = 'sin_rol' or rol = 'gerencia' then
    raise exception 'Su usuario no puede emitir documentos' using errcode = '42501';
  end if;
  -- Usuario de sede: siempre la suya. ERP central (SOPORTE en modo Secocha): la que pide.
  sede := coalesce(propia, p_sede);
  if sede is null or not exists (select 1 from public.sedes where id = sede) then
    raise exception 'Sede inválida' using errcode = '22023';
  end if;
  if p_serie is null or p_serie !~ '^[A-Z0-9_]{1,12}$' then
    raise exception 'Serie inválida: %', p_serie using errcode = '22023';
  end if;
  insert into public.contadores_sede as c (sede_id, serie, n) values (sede, p_serie, 1)
  on conflict (sede_id, serie) do update set n = c.n + 1, updated_at = now()
  returning c.n into n;
  return n;
end $$;
revoke all on function public.siguiente_numero_sede(text, uuid) from public, anon;
grant execute on function public.siguiente_numero_sede(text, uuid) to authenticated;

-- 3. Cajas por sede
do $$
declare
  sec uuid;
begin
  if to_regclass('public.cajas') is null then
    raise notice 'Sin tabla cajas: se omite';
    return;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cajas' and column_name = 'sede_id') then
    raise exception 'La tabla cajas no tiene sede_id: corra primero 20261023_sedes_multisede.sql';
  end if;
  -- Secocha: código SEC o, si no, la sede que no es central (sin usar sedes.tipo, que puede no existir)
  select id into sec from public.sedes
   where upper(codigo) = 'SEC' or not es_central
   order by (upper(codigo) = 'SEC') desc limit 1;
  if sec is null then
    raise notice 'No existe la sede Secocha: se omiten sus cajas';
    return;
  end if;

  drop index if exists public.cajas_nombre_key;
  create unique index if not exists cajas_sede_nombre_key on public.cajas (sede_id, upper(btrim(nombre)));

  -- Mismas cajas activas de Arequipa, con saldo 0 (asignar_sede respeta la sede pedida en el ERP central)
  insert into public.cajas (nombre, tipo, descripcion, cuentas_bancarias, estado, orden, saldo_actual, sede_id)
  select c.nombre, c.tipo, c.descripcion, c.cuentas_bancarias, 'ACTIVA', c.orden, 0, sec
    from public.cajas c
   where c.sede_id = public.sede_central() and coalesce(c.estado, 'ACTIVA') = 'ACTIVA'
     and not exists (select 1 from public.cajas x where x.sede_id = sec and upper(btrim(x.nombre)) = upper(btrim(c.nombre)));
end $$;

-- 4. Escritura del administrador de Secocha en las tablas con sede (sede_isolation lo deja solo en Secocha)
do $$
declare
  t text;
begin
  for t in
    select c.table_name from information_schema.columns c
      join pg_class k on k.relname = c.table_name and k.relkind in ('r', 'p')
      join pg_namespace n on n.oid = k.relnamespace and n.nspname = 'public'
     where c.table_schema = 'public' and c.column_name = 'sede_id'
       and c.table_name not in ('sedes', 'usuarios_sedes', 'contadores_sede')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_sede', t);
    execute format($p$create policy %I on public.%I for all to authenticated
                      using (public.mi_rol() = 'sucursal' and (select public.sede_usuario()) is not null)
                      with check (public.mi_rol() = 'sucursal' and (select public.sede_usuario()) is not null)$p$,
                   t || '_admin_sede', t);
    raise notice 'Administrador de Secocha: %', t;
  end loop;
end $$;

commit;

-- Revisar:
-- select usuario, rol, modulos, modulo_asignado from public.perfiles where rol = 'sucursal';
-- select s.nombre as sede, c.nombre, c.tipo, c.saldo_actual from public.cajas c join public.sedes s on s.id = c.sede_id order by 1, c.orden;
