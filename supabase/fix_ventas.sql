-- =====================================================================
-- Parche: módulo VENTAS (tabla ventas, permisos, numeración NP/F001/B001/OD,
-- Realtime, condiciones de pago iniciales y acceso de tesorería a Ventas).
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- (Ya incluido en supabase_tables.sql; este archivo evita volver a correr todo.)
-- =====================================================================

-- 1) Tabla ventas (si ya existía con otra estructura, se le agregan columnas; sus filas se conservan)
create table if not exists public.ventas (tipo text not null, id text not null, primary key (tipo, id));
alter table public.ventas
  add column if not exists tipo text,
  add column if not exists id text,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid default auth.uid();

do $$
declare col record; c record;
begin
  -- id a texto si era numérico / uuid
  select data_type, is_identity into col from information_schema.columns
  where table_schema = 'public' and table_name = 'ventas' and column_name = 'id';
  if col.data_type not in ('text', 'character varying') then
    if col.is_identity = 'YES' then alter table public.ventas alter column id drop identity if exists; end if;
    alter table public.ventas alter column id drop default;
    alter table public.ventas alter column id type text using id::text;
  end if;
  -- columnas antiguas obligatorias que el ERP no usa -> opcionales
  for c in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'ventas' and is_nullable = 'NO' and column_default is null
      and is_identity = 'NO' and column_name not in ('id', 'tipo', 'data', 'created_at', 'updated_at')
      and column_name not in (
        select kcu.column_name from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
        where tc.table_schema = 'public' and tc.table_name = 'ventas' and tc.constraint_type = 'PRIMARY KEY')
  loop
    execute format('alter table public.ventas alter column %I drop not null', c.column_name);
  end loop;
end $$;

create unique index if not exists ventas_tipo_id_uidx on public.ventas (tipo, id);
drop trigger if exists ventas_updated_at on public.ventas;
create trigger ventas_updated_at before update on public.ventas for each row execute function public.tocar_updated_at();

-- 2) Permisos y RLS
grant select, insert, update, delete on public.ventas to authenticated;
revoke all on public.ventas from anon;
alter table public.ventas enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'ventas' loop
    execute format('drop policy %I on public.ventas', p.policyname);
  end loop;
end $$;
create policy ventas_select on public.ventas for select to authenticated
  using (public.puede_ver('/dashboard/ventas'));
create policy ventas_escribir on public.ventas for all to authenticated
  using (tipo <> 'contador' and public.mi_rol() in ('creador', 'tesoreria'))
  with check (tipo <> 'contador' and public.mi_rol() in ('creador', 'tesoreria'));

-- Almacén (stock y órdenes de despacho) visible también para Ventas
drop policy if exists almacen_select on public.almacen;
create policy almacen_select on public.almacen for select to authenticated
  using (public.puede_ver('/dashboard/almacen') or public.puede_ver('/dashboard/compras') or public.puede_ver('/dashboard/ventas'));

-- 3) Numeración: series NP, F001, B001, OD
create or replace function public.siguiente_numero(serie text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  n integer;
begin
  if serie = 'REQ' and rol not in ('creador', 'almacen') then
    raise exception 'Su usuario no puede emitir requerimientos' using errcode = '42501';
  elsif serie = 'OC' and rol not in ('creador', 'tesoreria') then
    raise exception 'Su usuario no puede emitir órdenes de compra' using errcode = '42501';
  elsif serie = 'DJ' and rol is distinct from 'creador' then
    raise exception 'Su usuario no puede aprobar declaraciones juradas' using errcode = '42501';
  elsif serie in ('NP', 'F001', 'B001', 'OD') and rol not in ('creador', 'tesoreria') then
    raise exception 'Su usuario no puede emitir documentos de venta' using errcode = '42501';
  elsif serie not in ('REQ', 'OC', 'DJ', 'NP', 'F001', 'B001', 'OD') or rol is null then
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;

  insert into public.compras (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(serie, 1))
  on conflict (tipo, id) do update
    set data = public.compras.data || jsonb_build_object(serie, coalesce((public.compras.data ->> serie)::integer, 0) + 1)
  returning (data ->> serie)::integer into n;
  return n;
end $$;

-- 4) Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ventas') then
    alter publication supabase_realtime add table public.ventas;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5) Condiciones de pago iniciales (editables en Ventas › Condiciones de pago)
-- ids fijos: se pueden ejecutar varias veces sin duplicar
-- ---------------------------------------------------------------------
insert into public.ventas (tipo, id, data)
select 'condicion_pago', v.id, jsonb_build_object(
  'id', v.id, 'codigo', v.codigo, 'nombre', v.nombre, 'dias', v.dias,
  'porcentajeInicial', v.inicial, 'contraentrega', v.contraentrega, 'activo', true)
from (
  values
    ('c0000000-0000-4000-8000-000000000001', 'CONTADO',   'Contado',                           0,  0,  false),
    ('c0000000-0000-4000-8000-000000000007', 'CRED07',    'Crédito 7 días',                    7,  0,  false),
    ('c0000000-0000-4000-8000-000000000015', 'CRED15',    'Crédito 15 días',                   15, 0,  false),
    ('c0000000-0000-4000-8000-000000000030', 'CRED30',    'Crédito 30 días',                   30, 0,  false),
    ('c0000000-0000-4000-8000-000000000045', 'CRED45',    'Crédito 45 días',                   45, 0,  false),
    ('c0000000-0000-4000-8000-000000000060', 'CRED60',    'Crédito 60 días',                   60, 0,  false),
    ('c0000000-0000-4000-8000-000000000100', 'CONTRAENT', 'Contraentrega',                     0,  0,  true),
    ('c0000000-0000-4000-8000-000000000050', 'ADEL50',    '50% adelanto · 50% contraentrega',  0,  50, true)
) as v (id, codigo, nombre, dias, inicial, contraentrega)
on conflict (tipo, id) do nothing;

-- 6) Tesorería también trabaja en Ventas (comprobantes y cobros)
update public.perfiles
set modulos = array_append(modulos, '/dashboard/ventas')
where rol = 'tesoreria' and not ('/dashboard/ventas' = any (modulos));

-- Verificación
select count(*) as condiciones_de_pago from public.ventas where tipo = 'condicion_pago';
select usuario, modulos from public.perfiles where rol in ('tesoreria', 'creador', 'gerencia') order by usuario;
