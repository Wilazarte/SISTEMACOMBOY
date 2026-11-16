-- =====================================================================
-- Facturación electrónica SUNAT (SEE - del contribuyente)
--  1) public.sunat_cpe: estado SUNAT de cada comprobante, XML firmado, hash y CDR (constancia de recepción)
--  2) public.sunat_envios: bitácora de cada envío / consulta / baja (auditoría)
--  3) public.siguiente_numero_cpe(serie): correlativos de notas de crédito y débito (FC01, BC01, FD01, BD01)
-- Solo el Edge Function sunat-cpe (service role) escribe en 1) y 2); el ERP solo lee.
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- =====================================================================

create table if not exists public.sunat_cpe (
  id text primary key,                -- id del comprobante en public.ventas (tipo 'comprobante')
  tipo_doc text not null,             -- catálogo 01: 01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito
  serie text not null,
  numero text not null,               -- F001-0001
  fecha_emision date not null,
  cliente_doc text,                   -- 6-20123456789
  total numeric(14, 2),
  igv numeric(14, 2),
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO', 'EXCEPCION', 'ANULADO')),
  codigo text,                        -- código de respuesta SUNAT (0 aceptado, 2xxx rechazo, 4xxx observación)
  descripcion text,
  observaciones jsonb not null default '[]'::jsonb,
  hash text,                          -- DigestValue de la firma (va en la representación impresa)
  nombre_archivo text,                -- 20613238566-01-F001-0001
  xml text,                           -- XML firmado enviado
  cdr_zip text,                       -- ZIP del CDR en base64 (constancia legal)
  entorno text not null default 'beta' check (entorno in ('beta', 'produccion')),
  intentos integer not null default 0,
  enviado_por text,
  enviado_at timestamptz,
  -- Comunicación de baja (facturas y sus notas)
  baja_id text,                       -- RA-AAAAMMDD-N
  baja_ticket text,
  baja_motivo text,
  baja_estado text check (baja_estado in ('EN_PROCESO', 'ACEPTADA', 'RECHAZADA')),
  baja_codigo text,
  baja_descripcion text,
  baja_xml text,
  baja_cdr_zip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sunat_cpe_numero_uidx on public.sunat_cpe (tipo_doc, numero, entorno);
create index if not exists sunat_cpe_estado_idx on public.sunat_cpe (estado);
create index if not exists sunat_cpe_baja_idx on public.sunat_cpe (baja_id);

create table if not exists public.sunat_envios (
  id bigint generated always as identity primary key,
  comprobante_id text not null,
  accion text not null,               -- enviar / consultar / baja / estado_baja
  entorno text,
  codigo text,
  mensaje text,
  usuario text,
  created_at timestamptz not null default now()
);
create index if not exists sunat_envios_comprobante_idx on public.sunat_envios (comprobante_id, created_at desc);

-- Lectura: quien ve Ventas o Contabilidad. Escritura: nadie desde el navegador (solo el Edge Function).
alter table public.sunat_cpe enable row level security;
alter table public.sunat_envios enable row level security;
revoke all on public.sunat_cpe, public.sunat_envios from anon;
revoke insert, update, delete on public.sunat_cpe, public.sunat_envios from authenticated;
grant select on public.sunat_cpe, public.sunat_envios to authenticated;

drop policy if exists sunat_cpe_select on public.sunat_cpe;
create policy sunat_cpe_select on public.sunat_cpe for select to authenticated
  using (public.puede_ver('/dashboard/ventas') or public.puede_ver('/dashboard/contable')
         or public.mi_rol() in ('creador', 'soporte', 'gerencia', 'tesoreria', 'logistica', 'ventas'));
drop policy if exists sunat_envios_select on public.sunat_envios;
create policy sunat_envios_select on public.sunat_envios for select to authenticated
  using (public.puede_ver('/dashboard/ventas') or public.mi_rol() in ('creador', 'soporte', 'gerencia', 'tesoreria', 'logistica', 'ventas'));

-- Realtime: la lista de comprobantes se actualiza sola cuando SUNAT responde
do $$
begin
  alter publication supabase_realtime add table public.sunat_cpe;
exception when duplicate_object or undefined_object then null;
end $$;

-- Correlativos de notas de crédito / débito (mismo contador que siguiente_numero, sin tocar esa función)
create or replace function public.siguiente_numero_cpe(serie text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  rol text := public.mi_rol();
  n integer;
begin
  if serie not in ('FC01', 'BC01', 'FD01', 'BD01') then
    raise exception 'Serie inválida: %', serie using errcode = '22023';
  end if;
  if rol is null or rol not in ('creador', 'soporte', 'tesoreria', 'logistica', 'ventas') then
    raise exception 'Su usuario no puede emitir notas de crédito ni de débito' using errcode = '42501';
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

-- Verificación
select 'sunat_cpe' as tabla, count(*) from public.sunat_cpe
union all select 'sunat_envios', count(*) from public.sunat_envios;
