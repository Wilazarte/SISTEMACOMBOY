-- =====================================================================
-- App de Windows / Android sin señal (Fase 1, PR "ERP en PC y celular offline").
-- Tabla conflictos: cuando dos equipos cambiaron el mismo documento (uno sin señal),
-- gana el cambio más reciente (last-write-wins) y la versión perdedora queda aquí
-- para que Administración (SOPORTE) decida. Nunca se borra nada.
--
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
-- =====================================================================

create table if not exists public.conflictos (
  id uuid primary key default gen_random_uuid(),
  tabla text not null,                 -- compras, almacen, ventas...
  tipo text,                           -- orden, factura, guia, KARDEX...
  registro_id text not null,
  clave text,                          -- clave del ERP (ordenes_compra, almacen_kardex...)
  serie text,                          -- N° visible (OC-2026-0012, N° de serie del equipo...)
  operacion text not null default 'upsert' check (operacion in ('upsert', 'delete')),
  version_local jsonb,                 -- lo que se hizo en el equipo sin señal
  version_servidor jsonb,              -- lo que había en Supabase al sincronizar
  gano text not null check (gano in ('LOCAL', 'SERVIDOR')),
  editado_local_en timestamptz,
  servidor_updated_at timestamptz,
  usuario text,
  dispositivo text,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'RESUELTO')),
  decision text,                       -- MANTENER_GANADOR | RESTAURAR_PERDEDOR | nota libre
  resuelto_por text,
  resuelto_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists conflictos_estado_idx on public.conflictos (estado, created_at desc);
create index if not exists conflictos_registro_idx on public.conflictos (tabla, registro_id);

alter table public.conflictos enable row level security;
revoke all on public.conflictos from anon;
grant select, insert, update on public.conflictos to authenticated;

-- Cualquier usuario con sesión registra el conflicto que encontró su equipo al sincronizar
drop policy if exists conflictos_registrar on public.conflictos;
create policy conflictos_registrar on public.conflictos for insert to authenticated
  with check (estado = 'PENDIENTE');

-- Solo Administración (SOPORTE = rol creador / soporte) los ve y los resuelve. Nadie los borra.
drop policy if exists conflictos_ver on public.conflictos;
create policy conflictos_ver on public.conflictos for select to authenticated
  using (public.mi_rol() in ('creador', 'soporte'));
drop policy if exists conflictos_resolver on public.conflictos;
create policy conflictos_resolver on public.conflictos for update to authenticated
  using (public.mi_rol() in ('creador', 'soporte'))
  with check (public.mi_rol() in ('creador', 'soporte'));
