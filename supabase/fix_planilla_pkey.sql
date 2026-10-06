-- =====================================================================
-- FIX "duplicate key value violates unique constraint planilla_pkey"
-- (no deja emitir la boleta / guardar cambios de planilla)
--
-- Causa: en instalaciones donde la tabla planilla (o compras / almacen / ventas / contable) ya existía, se quedó con
-- su clave primaria antigua SOLO POR id. El ERP guarda varios tipos de documento en la misma tabla y la clave real es
-- (tipo, id): p. ej. la asistencia y la boleta del trabajador 27 en la SEMANA 41 tenían el mismo id y chocaban.
-- Los ids del ERP son texto (no usan secuencia): no hay que resetear ninguna secuencia.
--
-- Este script cambia la clave primaria a (tipo, id) en una sola transacción (Realtime la necesita para
-- publicar cambios). Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- =====================================================================
do $$
declare
  t text;
  pk record;
begin
  foreach t in array array['compras', 'almacen', 'planilla', 'ventas', 'contable'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    select c.conname, array_agg(a.attname::text order by a.attname::text) as cols into pk
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = ('public.' || t)::regclass and c.contype = 'p'
     group by c.conname;
    if found and pk.cols = array['id', 'tipo'] then
      raise notice '%: la clave primaria ya es (tipo, id)', t;
      continue;
    end if;
    -- filas sin tipo (antiguas): no pueden ir en la clave
    execute format('update public.%I set tipo = ''sin_tipo'' where tipo is null', t);
    execute format('alter table public.%I alter column tipo set not null, alter column id set not null', t);
    if found then
      raise notice '%: clave primaria % por (%) -> se cambia a (tipo, id)', t, pk.conname, array_to_string(pk.cols, ', ');
      execute format('alter table public.%I drop constraint %I', t, pk.conname);
    end if;
    execute format('alter table public.%I add primary key (tipo, id)', t);
    execute format('create unique index if not exists %I on public.%I (tipo, id)', t || '_tipo_id_uidx', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Verificación: todas deben decir (tipo, id)
select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where contype = 'p' and conrelid::regclass::text in ('compras', 'almacen', 'planilla', 'ventas', 'contable');
