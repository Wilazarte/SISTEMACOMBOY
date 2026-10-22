-- =====================================================================
-- Sedes: Arequipa = PLANTA PRINCIPAL / TALLER PRINCIPAL · Secocha = SUCURSAL · ERP COMBOY VID
-- Ejecutar en Supabase › SQL Editor (se puede repetir). Sin BEGIN/COMMIT.
--
-- El módulo Sucursal pasa a llamarse Secocha (/secocha) y trabaja solo con Secocha.
-- Arequipa es el ERP (Planta Principal / Taller Principal) y no se muestra en el módulo Secocha.
-- Los códigos de sede no cambian (ARE / SEC): los usan la numeración y sede_isolation.
-- =====================================================================

alter table public.sedes add column if not exists tipo text;

update public.sedes
   set tipo = 'PLANTA_PRINCIPAL', nombre = 'Arequipa - Planta Principal'
 where es_central or upper(codigo) in ('ARE', 'AQP') or nombre ilike '%arequipa%';

update public.sedes
   set tipo = 'SUCURSAL', nombre = 'Secocha'
 where upper(codigo) in ('SEC', 'SECOCHA') or nombre ilike '%secocha%';

-- Cualquier otra sede que no sea la central es una sucursal
update public.sedes set tipo = 'SUCURSAL' where tipo is null and not es_central;
update public.sedes set tipo = 'PLANTA_PRINCIPAL' where tipo is null and es_central;

alter table public.sedes alter column tipo set default 'SUCURSAL';
alter table public.sedes alter column tipo set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.sedes'::regclass and conname = 'sedes_tipo_chk') then
    alter table public.sedes add constraint sedes_tipo_chk check (tipo in ('PLANTA_PRINCIPAL', 'TALLER_PRINCIPAL', 'SUCURSAL'));
  end if;
end $$;

-- Perfiles con el módulo antiguo /sucursal -> /secocha (la app acepta los dos)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'perfiles' and column_name = 'modulos') then
    update public.perfiles set modulos = array_replace(modulos, '/sucursal', '/secocha') where '/sucursal' = any (modulos);
  end if;
end $$;

-- Revisión:
-- select codigo, nombre, tipo, es_central from public.sedes order by es_central desc;
