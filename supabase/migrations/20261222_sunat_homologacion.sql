-- =====================================================================
-- Homologación SUNAT: inmutabilidad y trazabilidad de los comprobantes electrónicos
--
--  1) public.cpe_auditoria: bitácora SOLO INSERCIÓN de cada emisión, cambio, anulación o intento de borrado
--     de facturas, boletas y notas (quién, cuándo, qué campos). Nadie puede editarla ni borrarla.
--  2) Trigger en public.ventas (tipo 'comprobante'): un comprobante EMITIDO ya no cambia sus datos fiscales
--     (número, serie, fecha, cliente, ítems, importes, forma de pago, documento que modifica), no vuelve a
--     BORRADOR, un ANULADO no se reactiva y ninguno emitido se borra. Lo que sí puede cambiar: estado
--     EMITIDO -> ANULADO, estado SUNAT, cobros / saldo, historial, despacho y datos internos.
--  3) Número de comprobante único (no se repite F005-0001 entre dos comprobantes emitidos).
--  4) public.sunat_cpe y public.sunat_envios no se borran (constancias CDR / XML que exige SUNAT conservar).
--
-- Corrección excepcional (solo Soporte, desde el SQL Editor y queda registrada en cpe_auditoria):
--   begin; set local erp.correccion_cpe = 'on'; update public.ventas ...; commit;
--
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces. No borra ni cambia datos.
-- =====================================================================

-- 1) Bitácora de comprobantes (solo inserción)
create table if not exists public.cpe_auditoria (
  id bigint generated always as identity primary key,
  comprobante_id text not null,
  numero text,
  tipo_cpe text,
  operacion text not null,           -- EMISION / CAMBIO / ANULACION / CORRECCION / BORRADO_BLOQUEADO
  estado_antes text,
  estado_despues text,
  estado_sunat_antes text,
  estado_sunat_despues text,
  campos text[] not null default '{}',
  usuario uuid default auth.uid(),
  rol text,
  db_usuario text default current_user,
  created_at timestamptz not null default now()
);
create index if not exists cpe_auditoria_comprobante_idx on public.cpe_auditoria (comprobante_id, created_at desc);

alter table public.cpe_auditoria enable row level security;
revoke all on public.cpe_auditoria from anon;
revoke insert, update, delete on public.cpe_auditoria from authenticated;
grant select on public.cpe_auditoria to authenticated;
drop policy if exists cpe_auditoria_select on public.cpe_auditoria;
create policy cpe_auditoria_select on public.cpe_auditoria for select to authenticated
  using (public.mi_rol() in ('creador', 'soporte', 'gerencia', 'tesoreria', 'ventas'));

create or replace function public.cpe_solo_insercion() returns trigger
language plpgsql as $$
begin
  raise exception 'La tabla % es de solo inserción (auditoría SUNAT): no se edita ni se borra.', tg_table_name
    using errcode = '42501';
end $$;

drop trigger if exists cpe_auditoria_inmutable on public.cpe_auditoria;
create trigger cpe_auditoria_inmutable before update or delete on public.cpe_auditoria
  for each row execute function public.cpe_solo_insercion();

-- 2) Inmutabilidad de comprobantes emitidos
-- Solo lo que sale en el XML / representación impresa de cada línea (no campos internos que el ERP recalcula)
create or replace function public.cpe_items_fiscales(d jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_array(e -> 'productoNombre', e -> 'descripcion', e -> 'unidad', e -> 'cantidad', e -> 'm2', e -> 'precio') order by o), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(d -> 'items') = 'array' then d -> 'items' else '[]'::jsonb end) with ordinality as t(e, o)
$$;

create or replace function public.proteger_comprobante() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  claves text[] := array['tipo', 'serie', 'numero', 'fecha', 'cliente', 'clienteDoc', 'conIgv', 'preciosConIgv',
                         'descuento', 'base', 'igv', 'total', 'formaPago', 'cuotas', 'ref', 'motivoCodigo', 'motivoDescripcion'];
  k text;
  cambiados text[] := '{}';
  ea text; ed text; sa text; sd text;
  correccion boolean := coalesce(current_setting('erp.correccion_cpe', true), '') = 'on';
  rol text := public.mi_rol();
begin
  if tg_op = 'INSERT' then
    if new.tipo = 'comprobante' and coalesce(new.data ->> 'estado', 'BORRADOR') <> 'BORRADOR' then
      insert into public.cpe_auditoria (comprobante_id, numero, tipo_cpe, operacion, estado_despues, estado_sunat_despues, rol)
      values (new.id, new.data ->> 'numero', new.data ->> 'tipo', 'EMISION', new.data ->> 'estado', new.data ->> 'estadoSunat', rol);
    end if;
    return new;
  end if;

  if old.tipo is distinct from 'comprobante' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  ea := coalesce(old.data ->> 'estado', 'BORRADOR');
  sa := old.data ->> 'estadoSunat';

  -- Borrador: libre (se edita y se borra); al emitirse queda registrado
  if ea = 'BORRADOR' then
    if tg_op = 'UPDATE' and coalesce(new.data ->> 'estado', 'BORRADOR') <> 'BORRADOR' then
      insert into public.cpe_auditoria (comprobante_id, numero, tipo_cpe, operacion, estado_antes, estado_despues, estado_sunat_despues, rol)
      values (new.id, new.data ->> 'numero', new.data ->> 'tipo', 'EMISION', ea, new.data ->> 'estado', new.data ->> 'estadoSunat', rol);
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if correccion then
      insert into public.cpe_auditoria (comprobante_id, numero, tipo_cpe, operacion, estado_antes, estado_sunat_antes, campos, rol)
      values (old.id, old.data ->> 'numero', old.data ->> 'tipo', 'CORRECCION', ea, sa, array['BORRADO'], rol);
      return old;
    end if;
    raise exception 'El comprobante % ya fue emitido: no se puede eliminar (SUNAT exige conservarlo). Anúlelo con Baja o nota de crédito.',
      old.data ->> 'numero' using errcode = '42501';
  end if;

  -- UPDATE de un comprobante emitido o anulado
  if new.tipo is distinct from old.tipo or new.id is distinct from old.id then
    raise exception 'No se puede cambiar el tipo ni el id de un comprobante emitido.' using errcode = '42501';
  end if;
  ed := coalesce(new.data ->> 'estado', 'BORRADOR');
  sd := new.data ->> 'estadoSunat';

  foreach k in array claves loop
    if (old.data -> k) is distinct from (new.data -> k) then cambiados := cambiados || k; end if;
  end loop;
  if public.cpe_items_fiscales(old.data) is distinct from public.cpe_items_fiscales(new.data) then cambiados := cambiados || 'items'::text; end if;

  if not correccion then
    if array_length(cambiados, 1) > 0 then
      raise exception 'El comprobante % ya fue emitido: no se pueden cambiar sus datos fiscales (%). Emita una nota de crédito o débito.',
        old.data ->> 'numero', array_to_string(cambiados, ', ') using errcode = '42501';
    end if;
    if ed = 'BORRADOR' then
      raise exception 'El comprobante % ya fue emitido: no puede volver a borrador.', old.data ->> 'numero' using errcode = '42501';
    end if;
    if ea = 'ANULADO' and ed <> 'ANULADO' then
      raise exception 'El comprobante % está anulado: no se puede reactivar.', old.data ->> 'numero' using errcode = '42501';
    end if;
    if sa in ('ACEPTADO', 'OBSERVADO') and coalesce(sd, '') not in ('ACEPTADO', 'OBSERVADO', 'ANULADO') then
      raise exception 'El comprobante % ya fue aceptado por SUNAT: su estado SUNAT no puede volver a %.', old.data ->> 'numero', coalesce(sd, 'vacío')
        using errcode = '42501';
    end if;
  end if;

  if correccion or ea is distinct from ed or sa is distinct from sd or array_length(cambiados, 1) > 0 then
    insert into public.cpe_auditoria (comprobante_id, numero, tipo_cpe, operacion, estado_antes, estado_despues, estado_sunat_antes, estado_sunat_despues, campos, rol)
    values (new.id, new.data ->> 'numero', new.data ->> 'tipo',
            case when correccion then 'CORRECCION' when ed = 'ANULADO' and ea <> 'ANULADO' then 'ANULACION' else 'CAMBIO' end,
            ea, ed, sa, sd, cambiados, rol);
  end if;
  return new;
end $$;

drop trigger if exists proteger_comprobante on public.ventas;
create trigger proteger_comprobante before insert or update or delete on public.ventas
  for each row execute function public.proteger_comprobante();

-- 3) Número único entre comprobantes emitidos / anulados (si hoy hay repetidos, se listan y NO se crea el índice)
do $$
declare dup text;
begin
  select string_agg(numero || ' (' || n || ' veces)', ', ') into dup from (
    select data ->> 'numero' as numero, count(*) as n from public.ventas
    where tipo = 'comprobante' and coalesce(data ->> 'estado', 'BORRADOR') <> 'BORRADOR' and coalesce(data ->> 'numero', '') <> ''
    group by 1 having count(*) > 1
  ) x;
  if dup is null then
    create unique index if not exists ventas_comprobante_numero_uidx on public.ventas ((data ->> 'numero'))
      where tipo = 'comprobante' and coalesce(data ->> 'estado', 'BORRADOR') <> 'BORRADOR' and coalesce(data ->> 'numero', '') <> '';
  else
    raise notice 'NO se creó el índice único: números repetidos %. Envíe esta lista a Soporte.', dup;
  end if;
end $$;

-- 4) Constancias SUNAT (XML, CDR, bajas) y bitácora de envíos: no se borran
drop trigger if exists sunat_cpe_sin_borrar on public.sunat_cpe;
create or replace function public.sunat_cpe_no_borrar() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('erp.correccion_cpe', true), '') = 'on' then return old; end if;
  raise exception 'Las constancias SUNAT (sunat_cpe) se conservan: no se borran.' using errcode = '42501';
end $$;
create trigger sunat_cpe_sin_borrar before delete on public.sunat_cpe
  for each row execute function public.sunat_cpe_no_borrar();

drop trigger if exists sunat_envios_inmutable on public.sunat_envios;
create trigger sunat_envios_inmutable before update or delete on public.sunat_envios
  for each row execute function public.cpe_solo_insercion();

-- Verificación
select 'cpe_auditoria' as objeto, count(*)::text as valor from public.cpe_auditoria
union all select 'comprobantes emitidos', count(*)::text from public.ventas where tipo = 'comprobante' and coalesce(data ->> 'estado', 'BORRADOR') <> 'BORRADOR'
union all select 'índice número único', case when to_regclass('public.ventas_comprobante_numero_uidx') is null then 'NO (ver aviso)' else 'sí' end;
