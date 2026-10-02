-- =====================================================================
-- Ventas: clientes y notas de pedido con columnas reales en public.ventas
-- (numero_np, ruc, cliente_nombre, condicion_pago_id, condicion_pago_nombre, dias_credito, fecha_vencimiento).
-- No hay tabla "clientes": el cliente es una fila de ventas con tipo = 'cliente'.
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
-- (También incluido en supabase/condiciones_pago.sql y supabase_tables.sql.)
-- =====================================================================

-- Columnas reales en public.ventas (numero_np, ruc, cliente_nombre, condicion_pago_id, condicion_pago_nombre,
-- dias_credito, fecha_vencimiento): se llenan solas con un trigger desde data; la app no cambia.
create or replace function public.ventas_columnas_pago() returns trigger
language plpgsql as $$
begin
  if new.tipo = 'cliente' then
    -- El cliente vive en la misma tabla ventas
    new.ruc := nullif(new.data ->> 'numDoc', '');
    new.cliente_nombre := nullif(new.data ->> 'razonSocial', '');
  elsif new.tipo in ('nota_pedido', 'comprobante') then
    new.ruc := nullif(regexp_replace(coalesce(new.data ->> 'clienteDoc', ''), '^\S+\s+', ''), '');
    new.cliente_nombre := nullif(new.data ->> 'cliente', '');
    new.condicion_pago_id := nullif(new.data ->> 'condPagoId', '');
    new.condicion_pago_nombre := nullif(new.data ->> 'condPagoNombre', '');
    new.dias_credito := round(coalesce(nullif(new.data ->> 'diasCredito', '')::numeric, 0))::int;
    new.fecha_vencimiento := nullif(coalesce(new.data ->> 'fechaVencimiento', new.data ->> 'fechaVenc'), '')::date;
    -- numero_np solo en la fila de la nota de pedido (el comprobante no lo repite: índice único)
    new.numero_np := case when new.tipo = 'nota_pedido' then nullif(new.data ->> 'numero', '') end;
  end if;
  return new;
end $$;

do $$
begin
  if to_regclass('public.ventas') is not null then
    alter table public.ventas
      add column if not exists tipo text,
      add column if not exists data jsonb not null default '{}'::jsonb,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now(),
      add column if not exists updated_by uuid default auth.uid(),
      add column if not exists condicion_pago_id text,
      add column if not exists condicion_pago_nombre text,
      add column if not exists dias_credito integer,
      add column if not exists fecha_vencimiento date,
      add column if not exists numero_np text,
      add column if not exists ruc text,
      add column if not exists cliente_nombre text;
    -- Las filas de clientes, cobros, asientos... no tienen N° de NP ni RUC
    alter table public.ventas alter column numero_np drop not null, alter column ruc drop not null, alter column cliente_nombre drop not null;
    -- Índice único del ERP (tipo, id): el guardado usa ON CONFLICT (tipo, id)
    if not exists (select 1 from public.ventas group by tipo, id having count(*) > 1) then
      create unique index if not exists ventas_tipo_id_uidx on public.ventas (tipo, id);
    end if;
    -- N° de nota de pedido único (las filas sin N° no chocan)
    if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'ventas' and indexdef ilike '%unique%(numero_np)%')
       and not exists (select 1 from public.ventas where numero_np is not null group by numero_np having count(*) > 1) then
      create unique index ventas_numero_np_uidx on public.ventas (numero_np);
    end if;
    drop trigger if exists ventas_columnas_pago on public.ventas;
    create trigger ventas_columnas_pago before insert or update on public.ventas
      for each row execute function public.ventas_columnas_pago();
    -- Filas que ya existían
    update public.ventas set data = data where tipo in ('cliente', 'nota_pedido', 'comprobante');
  end if;
end $$;

-- Verificación
select tipo, id, numero_np, ruc, cliente_nombre, condicion_pago_nombre, dias_credito, fecha_vencimiento
from public.ventas where tipo in ('cliente', 'nota_pedido') order by created_at desc limit 10;
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'ventas';
