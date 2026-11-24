-- =====================================================================
-- REALTIME DEL CATÁLOGO DE PRODUCTOS · 2026-11-24
-- Para que una solicitud de producto nuevo y el producto aprobado aparezcan
-- en todas las PCs (Arequipa y Secocha) sin apretar F5.
--
-- Solo agrega las tablas del catálogo a la publicación de Realtime si les falta.
-- No borra ni cambia datos. Se puede correr varias veces.
-- (La app igual revisa cada 20 s y al volver a la pestaña; esto lo hace instantáneo.)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['productos_maestro', 'productos_alias', 'productos_solicitudes', 'productos_categorias'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'No existe la tabla %, se salta', t;
    elsif exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      raise notice 'Ya estaba en Realtime: %', t;
    else
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'Agregada a Realtime: %', t;
    end if;
  end loop;
end $$;

-- Verificación: deben salir las 4 tablas
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename like 'productos_%'
order by tablename;
