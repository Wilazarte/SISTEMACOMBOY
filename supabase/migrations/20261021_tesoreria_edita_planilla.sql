-- Tesorería edita y cierra la planilla (la planilla es una pestaña de Tesorería / Compras).
-- Agrega el rol 'tesoreria' donde hoy solo podían 'creador' y 'planilla'. Aplicado el 2026-10-21.
-- Adelantos ya incluía tesoreria (policy adelantos_acceso, Sprint 1).

-- Trabajadores, liquidaciones, boletas, contratistas y listas de la semana (tabla planilla; la asistencia va por RPC)
drop policy if exists planilla_escribir on public.planilla;
create policy planilla_escribir on public.planilla for all to authenticated
  using (tipo <> 'asistencia' and public.mi_rol() in ('creador', 'planilla', 'tesoreria'))
  with check (tipo <> 'asistencia' and public.mi_rol() in ('creador', 'planilla', 'tesoreria'));

-- cerrar_planilla, fijar_caja_planilla e importar_asistencia: se recrean con el mismo cuerpo, sumando tesoreria a la lista de roles.
-- siguiente_numero: boletas (BOL, BOL_AAAA) y requerimientos de contratista (RCT) también para tesoreria.
do $$
declare
  f oid;
  def text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('cerrar_planilla', 'fijar_caja_planilla', 'importar_asistencia', 'siguiente_numero')
  loop
    def := pg_get_functiondef(f);
    def := replace(def, $r$('creador', 'planilla', 'admin')$r$, $r$('creador', 'planilla', 'tesoreria', 'admin')$r$);
    def := replace(def, $r$rol not in ('creador', 'planilla') then$r$, $r$rol not in ('creador', 'planilla', 'tesoreria') then$r$);
    execute def;
  end loop;
end $$;

-- Verificación:
-- select policyname, qual from pg_policies where tablename = 'planilla' and policyname = 'planilla_escribir';
-- select proname from pg_proc where proname in ('cerrar_planilla','fijar_caja_planilla','importar_asistencia','siguiente_numero')
--   and pg_get_functiondef(oid) like '%tesoreria%';
