-- =====================================================================
-- Parche: "null value in column ... of relation almacen violates not-null constraint"
-- La tabla almacen (y compras / planilla) existía antes del ERP con columnas propias obligatorias
-- (fecha, producto, cantidad...). El ERP guarda cada documento en tipo + id + data (jsonb), así que
-- esas columnas antiguas quedan vacías. Aquí se vuelven opcionales (se conservan sus datos).
-- NO desactiva RLS: los permisos siguen igual.
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- =====================================================================

-- 1) Diagnóstico: columnas obligatorias que el ERP no llena
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('almacen', 'compras', 'planilla')
  and is_nullable = 'NO' and column_default is null
  and column_name not in ('id', 'tipo', 'data', 'created_at', 'updated_at')
order by table_name, column_name;

-- 2) Columnas del ERP + columnas antiguas obligatorias -> opcionales
do $$
declare
  t text;
  c record;
begin
  foreach t in array array['almacen', 'compras', 'planilla'] loop
    execute format(
      'alter table public.%I
         add column if not exists tipo text,
         add column if not exists id text,
         add column if not exists data jsonb not null default ''{}''::jsonb,
         add column if not exists created_at timestamptz not null default now(),
         add column if not exists updated_at timestamptz not null default now()', t);
    for c in
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = t and is_nullable = 'NO' and column_default is null
        and is_identity = 'NO' and column_name not in ('id', 'tipo', 'data', 'created_at', 'updated_at')
        and column_name not in (
          select kcu.column_name from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
          where tc.table_schema = 'public' and tc.table_name = t and tc.constraint_type = 'PRIMARY KEY')
    loop
      execute format('alter table public.%I alter column %I drop not null', t, c.column_name);
      raise notice '%.%: ahora es opcional', t, c.column_name;
    end loop;
    execute format('create unique index if not exists %I on public.%I (tipo, id)', t || '_tipo_id_uidx', t);
  end loop;
end $$;

-- 3) Verificación: debe salir vacío
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and table_name in ('almacen', 'compras', 'planilla')
  and is_nullable = 'NO' and column_default is null
  and column_name not in ('id', 'tipo', 'data', 'created_at', 'updated_at');
