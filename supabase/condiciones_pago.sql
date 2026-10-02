-- =====================================================================
-- Condiciones de pago (Ventas › Nota de pedido / Comprobantes / Clientes)
-- Tabla propia public.condiciones_pago. Pegar en Supabase → SQL Editor → Run.
-- Se puede ejecutar varias veces: no duplica ni pisa las condiciones ya editadas.
-- Requiere public.mi_rol() y public.puede_ver() (supabase_tables.sql).
-- (También incluido en supabase_tables.sql, sección 7f.)
-- =====================================================================

create table if not exists public.condiciones_pago (
  id text primary key default gen_random_uuid()::text
);
alter table public.condiciones_pago
  add column if not exists codigo text,
  add column if not exists nombre text,
  add column if not exists tipo text not null default 'CONTADO',     -- CONTADO | CREDITO | PERSONALIZADO
  add column if not exists medio text,                                -- EFECTIVO, TRANSFERENCIA, DEPOSITO, YAPE, PLIN, TARJETA
  add column if not exists dias integer not null default 0,           -- días de crédito por defecto
  add column if not exists porcentaje_inicial numeric(5,2) not null default 0,
  add column if not exists contraentrega boolean not null default false,
  add column if not exists activo boolean not null default true,
  add column if not exists orden integer not null default 100,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid default auth.uid();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'condiciones_pago_codigo_key') then
    alter table public.condiciones_pago add constraint condiciones_pago_codigo_key unique (codigo);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'condiciones_pago_tipo_check') then
    alter table public.condiciones_pago add constraint condiciones_pago_tipo_check check (tipo in ('CONTADO', 'CREDITO', 'PERSONALIZADO')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'condiciones_pago_valores_check') then
    alter table public.condiciones_pago add constraint condiciones_pago_valores_check
      check (dias between 0 and 365 and porcentaje_inicial between 0 and 100 and (tipo <> 'CREDITO' or dias > 0)) not valid;
  end if;
end $$;

-- RLS: la ven quienes entran a Ventas; la editan creador y tesorería (igual que el resto de Ventas)
alter table public.condiciones_pago enable row level security;
drop policy if exists condiciones_pago_select on public.condiciones_pago;
drop policy if exists condiciones_pago_escribir on public.condiciones_pago;
create policy condiciones_pago_select on public.condiciones_pago for select to authenticated
  using (public.puede_ver('/dashboard/ventas'));
create policy condiciones_pago_escribir on public.condiciones_pago for all to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria'))
  with check (public.mi_rol() in ('creador', 'tesoreria'));
revoke all on public.condiciones_pago from anon;
grant select, insert, update, delete on public.condiciones_pago to authenticated;

-- Condiciones que ya existían en public.ventas (versión anterior): se copian con el mismo id
-- para que las notas de pedido, comprobantes y clientes que las usan sigan apuntando bien.
do $$
begin
  if to_regclass('public.ventas') is not null then
    insert into public.condiciones_pago (id, codigo, nombre, tipo, dias, porcentaje_inicial, contraentrega, activo, orden)
    select v.id,
           upper(coalesce(nullif(v.data ->> 'codigo', ''), v.id)),
           coalesce(nullif(v.data ->> 'nombre', ''), v.id),
           case when coalesce((v.data ->> 'dias')::int, 0) > 0 then 'CREDITO' else 'CONTADO' end,
           coalesce((v.data ->> 'dias')::int, 0),
           coalesce((v.data ->> 'porcentajeInicial')::numeric, 0),
           coalesce((v.data ->> 'contraentrega')::boolean, false),
           coalesce((v.data ->> 'activo')::boolean, true),
           50
    from public.ventas v
    where v.tipo = 'condicion_pago'
    on conflict do nothing;
  end if;
end $$;

-- Condiciones iniciales (ids fijos; los créditos usan los mismos ids de la versión anterior)
insert into public.condiciones_pago (id, codigo, nombre, tipo, medio, dias, orden)
values
  ('c0000000-0000-4000-8000-000000000201', 'EFECTIVO', 'Efectivo',               'CONTADO',       'EFECTIVO',      0,  1),
  ('c0000000-0000-4000-8000-000000000202', 'TRANSF',   'Transferencia bancaria', 'CONTADO',       'TRANSFERENCIA', 0,  2),
  ('c0000000-0000-4000-8000-000000000203', 'DEPOSITO', 'Depósito',               'CONTADO',       'DEPOSITO',      0,  3),
  ('c0000000-0000-4000-8000-000000000204', 'YAPE',     'Yape',                   'CONTADO',       'YAPE',          0,  4),
  ('c0000000-0000-4000-8000-000000000205', 'PLIN',     'Plin',                   'CONTADO',       'PLIN',          0,  5),
  ('c0000000-0000-4000-8000-000000000206', 'TARJETA',  'Tarjeta',                'CONTADO',       'TARJETA',       0,  6),
  ('c0000000-0000-4000-8000-000000000007', 'CRED07',   'Crédito 7 días',         'CREDITO',       null,            7,  7),
  ('c0000000-0000-4000-8000-000000000015', 'CRED15',   'Crédito 15 días',        'CREDITO',       null,            15, 8),
  ('c0000000-0000-4000-8000-000000000030', 'CRED30',   'Crédito 30 días',        'CREDITO',       null,            30, 9),
  ('c0000000-0000-4000-8000-000000000045', 'CRED45',   'Crédito 45 días',        'CREDITO',       null,            45, 10),
  ('c0000000-0000-4000-8000-000000000060', 'CRED60',   'Crédito 60 días',        'CREDITO',       null,            60, 11),
  ('c0000000-0000-4000-8000-000000000299', 'PERSONAL', 'Personalizado',          'PERSONALIZADO', null,            0,  12)
on conflict do nothing;

-- Realtime: una condición nueva aparece al instante en las otras PCs
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'condiciones_pago') then
    alter publication supabase_realtime add table public.condiciones_pago;
  end if;
end $$;

-- Verificación
select codigo, nombre, tipo, dias, activo from public.condiciones_pago order by orden, nombre;
