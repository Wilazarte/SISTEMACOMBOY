-- =====================================================================
-- RUC validado con SUNAT obligatorio en todo el ERP (padrón del sistema).
-- Correr DESPUÉS de 20261105_expedientes_26w.sql (usa la misma Edge Function validar-ruc-decolecta).
--
-- ruc_validados: un registro por RUC consultado en Decolecta. SOLO lo escribe la Edge Function
-- (service role): desde la app nadie puede marcar un RUC como validado a mano.
-- Todos los usuarios con sesión lo leen: así un RUC validado en Compras ya sirve en Ventas, Sucursal, etc.
-- Idempotente: se puede correr más de una vez.
-- =====================================================================

create table if not exists public.ruc_validados (
  ruc text primary key check (ruc ~ '^\d{11}$'),
  razon_social text not null,
  estado text,
  condicion text,
  direccion text,
  validado boolean not null default false, -- ACTIVO y HABIDO
  validado_at timestamptz not null default now(),
  usuario text
);
create index if not exists ruc_validados_fecha_idx on public.ruc_validados (validado_at desc);

alter table public.ruc_validados enable row level security;

drop policy if exists ruc_validados_leer on public.ruc_validados;
create policy ruc_validados_leer on public.ruc_validados for select to authenticated using (true);
-- Sin políticas de insert / update / delete: solo la Edge Function (service role) escribe.

-- Los RUC ya consultados en expedientes (cotizaciones) pasan al padrón para no volver a gastar consultas.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cotizaciones' and column_name = 'razon_social_sunat') then
    insert into public.ruc_validados (ruc, razon_social, estado, condicion, direccion, validado, validado_at)
    select distinct on (c.ruc) c.ruc, c.razon_social_sunat, c.ruc_estado, c.condicion_habido, c.direccion_fiscal, coalesce(c.ruc_validado, false), c.validado_at
    from public.cotizaciones c
    where c.ruc ~ '^\d{11}$' and coalesce(c.razon_social_sunat, '') <> '' and c.validado_at is not null
    order by c.ruc, c.validado_at desc
    on conflict (ruc) do nothing;
  end if;
end $$;
