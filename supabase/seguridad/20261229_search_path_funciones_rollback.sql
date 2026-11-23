-- Deshace 20261229_search_path_funciones.sql (solo si algo dejó de funcionar).
begin;
do $$ begin if to_regclass('public.zz_search_path_cambiadas') is null then raise exception 'No hay nada que deshacer'; end if; end $$;
do $$
declare r record;
begin
  for r in select firma from public.zz_search_path_cambiadas loop
    if to_regprocedure(r.firma) is not null then
      execute format('alter routine %s reset search_path', r.firma);
    end if;
  end loop;
end $$;
commit;
