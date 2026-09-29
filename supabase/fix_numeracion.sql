-- =====================================================================
-- Parche: numeración de REQ / OC / DJ
-- Corrige: "No se pudo obtener el número: invalid input syntax for type uuid: 'principal'"
-- (compras.id es de tipo uuid en la base y el contador usaba el id 'principal').
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- =====================================================================

-- Diagnóstico: tipo de la columna id y claves foráneas que apuntan a estas tablas
select table_name, data_type as tipo_de_id
from information_schema.columns
where table_schema = 'public' and column_name = 'id'
  and table_name in ('compras', 'almacen', 'planilla', 'observaciones', 'perfiles')
order by table_name;

select conrelid::regclass as tabla_con_fk, conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where contype = 'f' and confrelid in ('public.compras'::regclass, 'public.almacen'::regclass, 'public.planilla'::regclass);

-- ---------------------------------------------------------------------
-- 7. NUMERACIÓN atómica (REQ-ALM-001, OC-2026-0001, DJ-001)
-- El contador vive en compras (tipo 'contador', id '00000000-0000-0000-0000-000000000001':
-- un UUID fijo para que sirva aunque compras.id sea de tipo uuid).
-- Si existe el contador antiguo con id 'principal', se une al nuevo (conserva el número más alto).
do $$
declare viejo jsonb;
begin
  select data into viejo from public.compras where tipo = 'contador' and id::text = 'principal';
  if viejo is not null then
    insert into public.compras (tipo, id, data)
    values ('contador', '00000000-0000-0000-0000-000000000001', viejo)
    on conflict (tipo, id) do update
      set data = (
        select coalesce(jsonb_object_agg(k, greatest(coalesce((public.compras.data ->> k)::integer, 0), coalesce((viejo ->> k)::integer, 0))), '{}'::jsonb)
        from (select jsonb_object_keys(public.compras.data) as k union select jsonb_object_keys(viejo)) claves
      );
    delete from public.compras where tipo = 'contador' and id::text = 'principal';
  end if;
end $$;

-- El UPDATE bloquea la fila del contador: si dos PCs piden número a la vez,
-- la segunda espera a la primera y nunca se repite un correlativo.
-- ---------------------------------------------------------------------
create or replace function public.siguiente_numero(serie text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  n integer;
begin
  if serie = 'REQ' and rol not in ('creador', 'almacen') then
    raise exception 'Su usuario no puede emitir requerimientos' using errcode = '42501';
  elsif serie = 'OC' and rol not in ('creador', 'tesoreria') then
    raise exception 'Su usuario no puede emitir órdenes de compra' using errcode = '42501';
  elsif serie = 'DJ' and rol is distinct from 'creador' then
    raise exception 'Su usuario no puede aprobar declaraciones juradas' using errcode = '42501';
  elsif serie not in ('REQ', 'OC', 'DJ') or rol is null then
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;

  insert into public.compras (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(serie, 1))
  on conflict (tipo, id) do update
    set data = public.compras.data || jsonb_build_object(serie, coalesce((public.compras.data ->> serie)::integer, 0) + 1)
  returning (data ->> serie)::integer into n;
  return n;
end $$;

-- Migración: sube el contador a "minimo" si está por debajo (nunca lo baja). Solo el creador.
create or replace function public.asegurar_numero_minimo(serie text, minimo integer) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.mi_rol() is distinct from 'creador' then
    raise exception 'Solo el creador puede ajustar la numeración' using errcode = '42501';
  end if;
  if serie not in ('REQ', 'OC', 'DJ') then
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;
  insert into public.compras (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(serie, greatest(minimo, 0)))
  on conflict (tipo, id) do update
    set data = public.compras.data || jsonb_build_object(serie, greatest(coalesce((public.compras.data ->> serie)::integer, 0), minimo))
  returning (data ->> serie)::integer into n;
  return n;
end $$;

revoke all on function public.siguiente_numero(text) from public, anon;
revoke all on function public.asegurar_numero_minimo(text, integer) from public, anon;
grant execute on function public.siguiente_numero(text) to authenticated;
grant execute on function public.asegurar_numero_minimo(text, integer) to authenticated;

-- Verificación: una fila con id 00000000-0000-0000-0000-000000000001 (0 filas si aún no se emitió ningún número)
select tipo, id, data from public.compras where tipo = 'contador';
