-- =====================================================================
-- FIX productos_alias · ERP COMBOY VID
-- En producción la tabla tiene (id, producto_id, nombre_alias, nombre_alias_norm, created_at);
-- el catálogo maestro espera alias_normalizado text primary key.
-- Ejecutar en Supabase › SQL Editor. Se puede repetir sin efecto; si la tabla no existe no hace nada.
-- Corre antes de 20261022_unificar_productos.sql (que trae el mismo bloque, por si se ejecuta sola).
-- =====================================================================

-- Si normalizar_producto ya existe con otro nombre de parámetro (p. ej. "t") se conserva ese nombre
do $$
declare arg text;
begin
  select p.proargnames[1] into arg from pg_proc p where p.oid = to_regprocedure('public.normalizar_producto(text)');
  execute format($f$
    create or replace function public.normalizar_producto(%I text) returns text
    language sql immutable as $b$
      select regexp_replace(regexp_replace(upper(btrim(coalesce($1, ''))), '\s+', ' ', 'g'), '\s*/\s*', '/', 'g')
    $b$ $f$, coalesce(nullif(arg, ''), 'nombre'));
end $$;

-- productos_alias de producción (id, producto_id, nombre_alias, nombre_alias_norm, created_at)
-- -> alias_normalizado text primary key. Ver 20261022_fix_productos_alias.sql (mismo bloque; se puede repetir).
do $$
declare
  pk text;
  pk_cols text[];
begin
  if to_regclass('public.productos_alias') is null then return; end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos_alias' and column_name = 'nombre_alias_norm')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos_alias' and column_name = 'alias_normalizado') then
    alter table public.productos_alias rename column nombre_alias_norm to alias_normalizado;
  end if;
  alter table public.productos_alias add column if not exists alias_normalizado text;
  alter table public.productos_alias add column if not exists created_at timestamptz not null default now();

  -- Alias vacío: se toma del nombre original; todos quedan normalizados igual que normalizar_producto()
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos_alias' and column_name = 'nombre_alias') then
    execute 'update public.productos_alias set alias_normalizado = nombre_alias where coalesce(alias_normalizado, '''') = ''''';
    execute 'alter table public.productos_alias alter column nombre_alias drop not null';
  end if;
  update public.productos_alias set alias_normalizado = public.normalizar_producto(alias_normalizado)
   where alias_normalizado is distinct from public.normalizar_producto(alias_normalizado);
  delete from public.productos_alias where coalesce(alias_normalizado, '') = '';

  -- Un alias, un producto: se queda el más antiguo
  delete from public.productos_alias where ctid in (
    select ctid from (select ctid, row_number() over (partition by alias_normalizado order by created_at, ctid) rn from public.productos_alias) x where rn > 1);

  -- Clave primaria = alias_normalizado (la antigua sobre id deja de serlo; id queda como columna opcional)
  select c.conname, array(select a.attname::text from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
    into pk, pk_cols
    from pg_constraint c where c.conrelid = 'public.productos_alias'::regclass and c.contype = 'p';
  if pk is not null and pk_cols <> array['alias_normalizado'] then
    execute format('alter table public.productos_alias drop constraint %I', pk);
    pk := null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos_alias' and column_name = 'id') then
    execute 'alter table public.productos_alias alter column id drop not null';
  end if;
  if pk is null then
    alter table public.productos_alias add constraint productos_alias_pkey primary key (alias_normalizado);
  end if;
end $$;

do $$ begin if to_regclass('public.productos_alias') is not null then
  create index if not exists idx_productos_alias_producto on public.productos_alias (producto_id);
end if; end $$;
