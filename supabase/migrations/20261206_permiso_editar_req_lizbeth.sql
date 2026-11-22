-- =====================================================================
-- PERMISO INDIVIDUAL: Lizbeth (Tesorería / FINANZAS) puede EDITAR los requerimientos de Almacén
-- Pedido de Williams 2026-11-17. Es una EXCEPCIÓN a la regla "cada rol solo su módulo":
-- se da a la PERSONA (su perfil), no a todo el rol tesorería.
--
--   1. perfiles.permisos (text[]): permisos individuales por usuario. Lizbeth recibe 'req.editar_almacen'.
--   2. La BASE lo hace cumplir: un usuario de tesorería SIN ese permiso no puede cambiar el contenido
--      (productos, motivo, sede, solicitante, fecha) de un REQ de Almacén pendiente.
--   3. Auditoría: cada edición de un REQ queda en public.req_ediciones (quién, cuándo, antes y después).
--      La tabla es de solo inserción: nadie la puede editar ni borrar desde el ERP.
--   4. Si Tesorería edita un REQ, Almacén recibe un aviso (si ya corrió 20261107_notificaciones_flujo.sql).
--
-- Aditivo y re-ejecutable (se puede correr varias veces). No borra ni cambia datos existentes.
-- =====================================================================

-- 1) Permisos individuales por usuario --------------------------------
alter table public.perfiles add column if not exists permisos text[] not null default '{}';

-- Lizbeth Cahuana Apfata = usuario 'tesoreria' (tesoreria@comboyvid.local). Se agrega una sola vez.
update public.perfiles
   set permisos = array_append(coalesce(permisos, '{}'), 'req.editar_almacen')
 where (usuario = 'tesoreria' or nombre_completo ilike 'LIZBETH CAHUANA%')
   and not ('req.editar_almacen' = any(coalesce(permisos, '{}')));

-- ¿El usuario conectado tiene este permiso individual?
create or replace function public.tiene_permiso(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p = any(coalesce(pf.permisos, '{}')) from public.perfiles pf where pf.id = auth.uid()), false);
$$;
grant execute on function public.tiene_permiso(text) to authenticated;

-- 2) Auditoría de ediciones de REQ (solo inserción) --------------------
create table if not exists public.req_ediciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  req_id text not null,
  numero text,
  editado_por uuid default auth.uid(),
  usuario text,
  nombre text,
  rol text,
  con_permiso text,          -- 'req.editar_almacen' cuando editó Tesorería con el permiso individual
  antes jsonb,               -- sede, solicitante, fecha, motivo, items antes del cambio
  despues jsonb              -- lo mismo después del cambio
);
create index if not exists req_ediciones_req_idx on public.req_ediciones (req_id, created_at desc);

alter table public.req_ediciones enable row level security;
drop policy if exists req_ediciones_select on public.req_ediciones;
create policy req_ediciones_select on public.req_ediciones for select to authenticated
  using (public.mi_rol() in ('creador', 'tesoreria', 'almacen', 'gerencia'));
-- Sin políticas de insert/update/delete: solo escribe el trigger (security definer).
revoke insert, update, delete on public.req_ediciones from anon, authenticated;

-- Contenido editable de un REQ (lo que se compara y se guarda en la auditoría)
create or replace function public.req_contenido(d jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'sede', d -> 'sede', 'solicitante', d -> 'solicitante', 'fecha', d -> 'fecha',
    'motivo', d -> 'motivo', 'items', d -> 'items');
$$;

-- 3) Regla en la base: tesorería solo edita REQ de Almacén con el permiso individual
create or replace function public.compras_req_permiso_editar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.tipo = 'req_pendiente' and new.tipo = 'req_pendiente'
     and coalesce(new.data ->> 'origen', '') <> 'SUCURSAL'
     and public.req_contenido(coalesce(old.data, '{}')) is distinct from public.req_contenido(coalesce(new.data, '{}'))
     and public.mi_rol() = 'tesoreria'
     and not public.tiene_permiso('req.editar_almacen') then
    raise exception 'Su usuario no tiene permiso para editar requerimientos de Almacén (pídalo a SOPORTE).'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists compras_req_permiso_editar on public.compras;
create trigger compras_req_permiso_editar before update of data on public.compras
  for each row execute function public.compras_req_permiso_editar();

-- 4) Auditoría + aviso a Almacén ---------------------------------------
-- Nombre con "zz" para correr DESPUÉS de compras_req_notificar (los triggers van en orden alfabético).
create or replace function public.compras_req_zz_auditar_edicion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb := public.req_contenido(coalesce(old.data, '{}'));
  v_despues jsonb := public.req_contenido(coalesce(new.data, '{}'));
  v_rol text := public.mi_rol();
  v_usuario text;
  v_nombre text;
  v_numero text := coalesce(new.data ->> 'numero', 'REQ');
begin
  if old.tipo is distinct from 'req_pendiente' or new.tipo is distinct from 'req_pendiente' then return new; end if;
  if v_antes is not distinct from v_despues then return new; end if;

  select pf.usuario, coalesce(nullif(pf.nombre_completo, ''), pf.nombre)
    into v_usuario, v_nombre
    from public.perfiles pf where pf.id = auth.uid();

  insert into public.req_ediciones (req_id, numero, usuario, nombre, rol, con_permiso, antes, despues)
  values (new.id, v_numero, v_usuario, v_nombre, v_rol,
          case when v_rol = 'tesoreria' then 'req.editar_almacen' end, v_antes, v_despues);

  -- Editó Tesorería: el aviso de FINANZAS no debe decir "por Almacén", y Almacén se entera
  if v_rol = 'tesoreria' and coalesce(new.data ->> 'origen', '') <> 'SUCURSAL' and to_regclass('public.notificaciones') is not null then
    begin
      update public.notificaciones
         set titulo = v_numero || ' editado por Tesorería (' || coalesce(v_nombre, 'Tesorería') || ')'
       where tipo = 'REQ_ALMACEN' and datos ->> 'req_id' = new.id and not leida and created_at = now();

      insert into public.notificaciones (modulo, tipo, titulo, mensaje, href, datos)
      values ('ALMACEN', 'REQ_EDITADO_TESORERIA',
              v_numero || ' editado por Tesorería (' || coalesce(v_nombre, 'Tesorería') || ')',
              concat_ws(' · ', nullif(new.data ->> 'sede', ''),
                        coalesce(jsonb_array_length(case when jsonb_typeof(new.data -> 'items') = 'array' then new.data -> 'items' end), 0) || ' producto(s)',
                        nullif(left(new.data ->> 'motivo', 80), '')),
              '/dashboard/almacen',
              jsonb_build_object('req_id', new.id, 'numero', v_numero, 'evento', 'EDITADO_TESORERIA'));
    exception when others then
      raise warning 'compras_req_zz_auditar_edicion (aviso): %', sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists compras_req_zz_auditar_edicion on public.compras;
create trigger compras_req_zz_auditar_edicion after update of data on public.compras
  for each row execute function public.compras_req_zz_auditar_edicion();

-- Verificación:
-- select usuario, nombre_completo, rol, permisos from public.perfiles where 'req.editar_almacen' = any(permisos);
--   → debe salir solo Lizbeth (tesoreria)
-- select created_at, numero, nombre, rol, antes, despues from public.req_ediciones order by created_at desc limit 20;
--
-- Para quitarle el permiso más adelante:
-- update public.perfiles set permisos = array_remove(permisos, 'req.editar_almacen') where usuario = 'tesoreria';
