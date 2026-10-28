-- Tesorería vuelve a poder pagar y cerrar la planilla semanal.
-- Síntoma: "Historial: Su usuario no puede cerrar la planilla (42501)" al pulsar "Pagar y cerrar semana"
-- con un usuario de Tesorería. La pantalla deja editar a creador, planilla, tesoreria y admin, pero
-- cerrar_planilla() en la base solo aceptaba ('creador', 'planilla', 'admin'): el permiso de tesoreria
-- (20261021_tesoreria_edita_planilla.sql) se perdió al volver a correr historial_planilla.sql / cajas.sql.
-- Se recrean las funciones de Planilla con la misma lógica, sumando tesoreria a la lista de roles.
-- Se puede correr más de una vez.
do $$
declare
  f oid;
  def text;
  nuevo text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('cerrar_planilla', 'fijar_caja_planilla', 'importar_asistencia')
  loop
    def := pg_get_functiondef(f);
    -- Cualquier lista de roles que empiece con 'creador', 'planilla' pasa a la lista completa
    nuevo := regexp_replace(def, $r$not in \('creador', 'planilla'[^)]*\)$r$, $r$not in ('creador', 'planilla', 'tesoreria', 'admin')$r$, 'g');
    if nuevo <> def then
      execute nuevo;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Verificación: las 3 filas deben decir true
select proname, pg_get_functiondef(oid) like '%''tesoreria''%' as tesoreria_puede
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('cerrar_planilla', 'fijar_caja_planilla', 'importar_asistencia');
