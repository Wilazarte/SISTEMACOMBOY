-- Deshace 20261230_funciones_trigger_sin_rpc.sql
begin;
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as firma
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prorettype = 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('grant execute on function %s to public, anon, authenticated', r.firma);
  end loop;
end $$;
commit;
