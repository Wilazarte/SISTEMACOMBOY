-- =====================================================================
-- ACTIVOS DE LA EMPRESA (Finanzas › Contabilidad › Activos), pedido de Williams 2026-11-17.
-- Los activos se guardan en public.contable, tipo 'ACTIVO_FIJO' (id + data jsonb), como los asientos:
-- ya tienen RLS (tesorería / soporte escriben; el administrador de Secocha solo en filas de Secocha), sede_id,
-- Realtime y respaldo. Este SQL NO es obligatorio para usar la pantalla; agrega:
--   1. Índices para buscar activos por código, serie y próximo mantenimiento.
--   2. Vista public.v_activos_fijos: un activo por fila con su depreciación lineal calculada al día
--      (para reportes, Excel del contador o Power BI). Respeta el RLS de contable (security_invoker).
-- Aditivo y re-ejecutable. Requiere supabase/contable_tables.sql.
-- =====================================================================

do $$
begin
  if to_regclass('public.contable') is null then
    raise exception 'Falta la tabla contable: ejecute primero supabase/contable_tables.sql';
  end if;
end $$;

-- 1. Índices
create index if not exists contable_activo_codigo_idx on public.contable ((data ->> 'codigo')) where tipo = 'ACTIVO_FIJO';
create index if not exists contable_activo_serie_idx on public.contable ((upper(data ->> 'serie'))) where tipo = 'ACTIVO_FIJO';
create index if not exists contable_activo_mant_idx on public.contable ((data ->> 'proximoMantenimiento')) where tipo = 'ACTIVO_FIJO';

-- 2. Vista con la depreciación (misma regla que lib/activos.ts):
--    base = costo − valor residual; mensual = base × tasa / 1200; vida útil = ceil(1200 / tasa) meses;
--    meses = meses cerrados desde el mes de inicio de uso (o compra) hasta hoy o la fecha de baja, tope la vida útil.
create or replace view public.v_activos_fijos
with (security_invoker = true) as
with a as (
  select
    c.id,
    c.sede_id,
    c.data ->> 'codigo' as codigo,
    c.data ->> 'nombre' as nombre,
    c.data ->> 'categoria' as categoria,
    c.data ->> 'marca' as marca,
    c.data ->> 'modelo' as modelo,
    c.data ->> 'serie' as serie,
    c.data ->> 'sede' as sede,
    c.data ->> 'area' as area,
    coalesce(c.data ->> 'estado', 'OPERATIVO') as estado,
    nullif(c.data ->> 'responsable', '') as responsable,
    case when c.data ->> 'fechaCompra' ~ '^\d{4}-\d{2}-\d{2}' then left(c.data ->> 'fechaCompra', 10)::date end as fecha_compra,
    case when c.data ->> 'fechaUso' ~ '^\d{4}-\d{2}-\d{2}' then left(c.data ->> 'fechaUso', 10)::date end as fecha_uso,
    case when c.data #>> '{baja,fecha}' ~ '^\d{4}-\d{2}-\d{2}' then left(c.data #>> '{baja,fecha}', 10)::date end as fecha_baja,
    case when c.data ->> 'proximoMantenimiento' ~ '^\d{4}-\d{2}-\d{2}' then left(c.data ->> 'proximoMantenimiento', 10)::date end as proximo_mantenimiento,
    coalesce(nullif(c.data ->> 'costo', '')::numeric, 0) as costo,
    coalesce(nullif(c.data ->> 'valorResidual', '')::numeric, 0) as valor_residual,
    coalesce(nullif(c.data ->> 'tasaAnual', '')::numeric, 10) as tasa_anual,
    c.data ->> 'proveedor' as proveedor,
    c.data ->> 'comprobante' as comprobante
  from public.contable c
  where c.tipo = 'ACTIVO_FIJO'
),
b as (
  select a.*,
         coalesce(a.fecha_uso, a.fecha_compra) as inicio,
         greatest(a.costo - a.valor_residual, 0) as base,
         case when a.tasa_anual > 0 then ceil(1200 / a.tasa_anual)::int else 0 end as vida_util_meses,
         least(coalesce(a.fecha_baja, (now() at time zone 'America/Lima')::date), (now() at time zone 'America/Lima')::date) as corte
  from a
),
m as (
  select b.*,
         least(greatest(
           (extract(year from b.corte) - extract(year from b.inicio)) * 12 + (extract(month from b.corte) - extract(month from b.inicio)),
           0)::int, b.vida_util_meses) as meses
  from b
)
select
  id, sede_id, codigo, nombre, categoria, marca, modelo, serie, sede, area, estado, responsable,
  fecha_compra, inicio as fecha_inicio_uso, proveedor, comprobante, costo, valor_residual, tasa_anual, vida_util_meses,
  round(base * tasa_anual / 1200, 2) as depreciacion_mensual,
  meses as meses_depreciados,
  case when vida_util_meses > 0 and meses >= vida_util_meses then base
       else least(base, round(base * tasa_anual / 1200 * meses, 2)) end as depreciacion_acumulada,
  costo - case when vida_util_meses > 0 and meses >= vida_util_meses then base
               else least(base, round(base * tasa_anual / 1200 * meses, 2)) end as valor_en_libros,
  proximo_mantenimiento,
  fecha_baja
from m;

grant select on public.v_activos_fijos to authenticated;
revoke all on public.v_activos_fijos from anon;

-- Verificación:
-- select codigo, nombre, sede, costo, depreciacion_mensual, depreciacion_acumulada, valor_en_libros, proximo_mantenimiento
--   from public.v_activos_fijos order by codigo;
