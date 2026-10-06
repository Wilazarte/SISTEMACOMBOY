-- =====================================================================
-- Planilla › personal S/ por hora: la edición manual del Módulo Creador (DÍAS / TARD.) ya NO borra
-- las HORAS importadas del reloj. Antes reemplazaba todo el registro y las horas quedaban vacías (0 h).
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- Después, vuelva a importar la asistencia de la semana para recuperar las horas.
-- =====================================================================

create or replace function public.editar_asistencia_creador(p_periodo text, p_trabajador text, p_dias integer, p_tardanzas integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  per text := upper(regexp_replace(btrim(coalesce(p_periodo, '')), '\s+', ' ', 'g'));
  trab text := btrim(coalesce(p_trabajador, ''));
begin
  if public.mi_rol() is null or public.mi_rol() not in ('creador', 'admin') then
    raise exception 'Edición no permitida fuera del módulo creador' using errcode = '42501';
  end if;
  if per = '' or trab = '' then
    raise exception 'Indique periodo y trabajador' using errcode = '22023';
  end if;
  if p_dias is null or p_dias < 0 or p_dias > 31 or p_tardanzas is null or p_tardanzas < 0 or p_tardanzas > p_dias then
    raise exception 'Días entre 0 y 31; tardanzas entre 0 y los días' using errcode = '22023';
  end if;
  if not exists (select 1 from public.planilla where tipo = 'trabajador' and id::text = trab) then
    raise exception 'El trabajador N° % no existe', trab using errcode = '22023';
  end if;
  insert into public.planilla (tipo, id, data)
  values ('asistencia', per || '|' || trab, jsonb_build_object(
    'id', per || '|' || trab, 'periodo', per, 'trabajador', trab, 'dias', p_dias, 'tardanzas', p_tardanzas,
    'origen_edicion', 'CREADOR', 'updated_by', auth.uid(), 'updated_by_creator_id', auth.uid(), 'fecha', now()))
  -- conserva las horas importadas del reloj (personal por hora): solo cambia días / tardanzas
  on conflict (tipo, id) do update set data = public.planilla.data || excluded.data;
end $$;

revoke all on function public.editar_asistencia_creador(text, text, integer, integer) from public, anon;
grant execute on function public.editar_asistencia_creador(text, text, integer, integer) to authenticated;
notify pgrst, 'reload schema';
