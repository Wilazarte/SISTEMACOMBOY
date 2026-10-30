-- =====================================================================
-- FIX FASE 3 · RUTA 2 (Williams 2026-10-30): retiro_produccion() rechazaba con "Motivo inválido"
-- motivos de producción válidos (la lista fija de motivos de la base no coincide con la de la app).
-- Ahora acepta cualquier motivo que empiece con PRODUCCION; el resto de la función queda igual.
-- La función en producción puede no ser idéntica a supabase/almacen_kardex.sql (almacén relacional),
-- por eso NO se reemplaza entera: se toma su definición actual y solo se cambia la validación del motivo.
-- Aditivo y repetible: si ya está corregida, no hace nada.
-- =====================================================================
do $$
declare
  f regprocedure;
  def text;
  nuevo text;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'retiro_produccion' loop
    def := pg_get_functiondef(f);
    if def ~ 'motivo_produccion_libre' then
      raise notice '% ya estaba corregida', f;
      continue;
    end if;
    -- raise exception 'Motivo inválido' ...;  →  solo si el motivo NO empieza con PRODUCCION
    nuevo := regexp_replace(def,
      '(raise\s+exception\s+''Motivo inv[aá]lido''[^;]*;)',
      '/* motivo_produccion_libre */ if upper(btrim(coalesce(p_motivo, ''''))) not like ''PRODUCCION%'' then \1 end if;',
      'i');
    if nuevo = def then
      raise notice '% no tiene la validación "Motivo inválido": sin cambios', f;
      continue;
    end if;
    execute nuevo;
    raise notice '% corregida: acepta motivos PRODUCCION…', f;
  end loop;
end $$;

-- Verificación: debe aparecer motivo_produccion_libre
-- select pg_get_functiondef('public.retiro_produccion'::regproc) ~ 'motivo_produccion_libre';
