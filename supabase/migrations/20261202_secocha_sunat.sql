-- =====================================================================
-- SECOCHA FASE 3: facturación electrónica SUNAT de la sede Secocha
--
-- Correr en Supabase > SQL Editor DESPUÉS de 20261125_sunat_cpe.sql y 20261201_secocha_fase2.sql.
-- Se puede correr más de una vez.
--
--   1. Notas de crédito / débito de Secocha con series propias: FC02, BC02, FD02, BD02
--      (Secocha emite facturas F002 y boletas B002; Arequipa sigue con F001, B001, FC01, BC01, FD01, BD01).
--   2. El administrador de Secocha (rol sucursal) puede numerar notas.
--   3. Estado SUNAT (sunat_cpe, sunat_envios): cada sede ve solo los de sus comprobantes.
--
-- En Nubefact hay que registrar las series F002, B002, FC02, BC02, FD02 y BD02 (mismo RUC y token).
-- =====================================================================

begin;

-- 1 y 2. Correlativos de notas por serie
create or replace function public.siguiente_numero_cpe(serie text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  propia uuid := public.sede_usuario();
  n integer;
begin
  if serie not in ('FC01', 'BC01', 'FD01', 'BD01', 'FC02', 'BC02', 'FD02', 'BD02') then
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;
  if rol is null or rol not in ('creador', 'soporte', 'tesoreria', 'logistica', 'ventas', 'sucursal') then
    raise exception 'Su usuario no puede emitir notas de crédito ni de débito' using errcode = '42501';
  end if;
  -- Usuario de sede: solo las series de la sucursal (terminan en 02); Arequipa, las suyas (01) y SOPORTE en modo Secocha, ambas
  if propia is not null and serie !~ '02$' then
    raise exception 'La sede Secocha emite notas con series FC02, BC02, FD02 y BD02' using errcode = '42501';
  end if;
  insert into public.compras (tipo, id, data)
  values ('contador', '00000000-0000-0000-0000-000000000001', jsonb_build_object(serie, 1))
  on conflict (tipo, id) do update
    set data = public.compras.data || jsonb_build_object(serie, coalesce((public.compras.data ->> serie)::integer, 0) + 1)
  returning (data ->> serie)::integer into n;
  return n;
end $$;
revoke all on function public.siguiente_numero_cpe(text) from public, anon;
grant execute on function public.siguiente_numero_cpe(text) to authenticated;

-- 3. Estado SUNAT por sede: la fila se ve solo si su comprobante (public.ventas) es visible para el usuario
do $$
begin
  if to_regclass('public.sunat_cpe') is null then
    raise notice 'Sin tabla sunat_cpe: corra primero 20261125_sunat_cpe.sql';
    return;
  end if;
  drop policy if exists sede_isolation on public.sunat_cpe;
  create policy sede_isolation on public.sunat_cpe as restrictive for select to authenticated
    using ((select public.sede_usuario()) is null
           or exists (select 1 from public.ventas v where v.tipo = 'comprobante' and v.id::text = sunat_cpe.id));
  drop policy if exists sede_isolation on public.sunat_envios;
  create policy sede_isolation on public.sunat_envios as restrictive for select to authenticated
    using ((select public.sede_usuario()) is null
           or exists (select 1 from public.ventas v where v.tipo = 'comprobante' and v.id::text = sunat_envios.comprobante_id));
end $$;

commit;

-- Revisar:
-- select s.nombre, v.data->>'numero' as numero, c.estado from public.sunat_cpe c
--   join public.ventas v on v.id::text = c.id join public.sedes s on s.id = v.sede_id order by c.created_at desc limit 20;
