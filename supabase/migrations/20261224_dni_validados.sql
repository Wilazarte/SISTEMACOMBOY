-- =====================================================================
-- DNI verificado con RENIEC (Decolecta), mismo token y misma Edge Function que el RUC.
-- Correr DESPUÉS de 20261111_ruc_validados.sql. Idempotente: se puede correr más de una vez.
--
-- dni_validados: un registro por DNI consultado. SOLO lo escribe la Edge Function validar-ruc-decolecta
-- (service role). Los usuarios con sesión lo leen: un DNI verificado en Ventas ya sirve en Planilla,
-- Logística, Secocha, etc., sin gastar otra consulta.
-- Si esta tabla no existe la verificación igual funciona; solo no se recuerda entre sesiones.
-- =====================================================================

create table if not exists public.dni_validados (
  dni text primary key check (dni ~ '^\d{8}$'),
  nombres text not null default '',
  apellido_paterno text not null default '',
  apellido_materno text not null default '',
  nombre_completo text not null default '',
  verificado_at timestamptz not null default now(),
  usuario text
);
create index if not exists dni_validados_fecha_idx on public.dni_validados (verificado_at desc);

alter table public.dni_validados enable row level security;

drop policy if exists dni_validados_leer on public.dni_validados;
create policy dni_validados_leer on public.dni_validados for select to authenticated using (true);
-- Sin políticas de insert / update / delete: solo la Edge Function (service role) escribe.
