-- =====================================================================
-- Security Advisor: "Public / Signed-In Users Can Execute SECURITY DEFINER Function" (2026-11-23)
-- Las funciones de TRIGGER (asignar_sede, proteger_comprobante, pv_historial, *_notificar, ...)
-- no se pueden llamar por /rpc, pero el Advisor las marca. Se les quita EXECUTE a anon, authenticated
-- y public. Los triggers SIGUEN funcionando: Postgres solo revisa ese permiso al crear el trigger,
-- no cada vez que se dispara. No toca las funciones que la app llama ni las del login.
-- Para deshacer: 20261230_funciones_trigger_sin_rpc_rollback.sql
-- =====================================================================
begin;
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure::text as firma
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prorettype = 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.firma);
    execute format('grant execute on function %s to service_role', r.firma);
    n := n + 1;
  end loop;
  raise notice 'Funciones de trigger cerradas: %', n;
end $$;
commit;

-- Verificación: debe salir 0
select count(*) as triggers_abiertos
from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public' and p.prorettype = 'trigger'::regtype
  and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
