// Motor de discriminacion de precios de 2do grado
// precioFinal = precioLista x (1 + %tipoCliente) x (1 + %region) x (1 + %volumen)

export interface ReglaLite {
  id: string;
  tipo: string; // TIPO_CLIENTE | REGION | VOLUMEN
  equipoId: string | null;
  tipoCliente: string | null;
  region: string | null;
  minCantidad: number | null;
  maxCantidad: number | null;
  porcentaje: number;
  descripcion?: string | null;
}

export interface EquipoLite {
  id: string;
  precioLista: number;
  costoBase: number;
}

export interface ResultadoPrecio {
  precioLista: number;
  costoUnitario: number;
  ajusteTipo: number;
  ajusteRegion: number;
  ajusteVolumen: number;
  reglaTipo: ReglaLite | null;
  reglaRegion: ReglaLite | null;
  reglaVolumen: ReglaLite | null;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
  costoTotal: number;
  utilidad: number;
  margen: number; // % sobre precio de venta
  markup: number; // % sobre costo
  descuentoTotal: number; // % total vs lista
}

function elegir(reglas: ReglaLite[], equipoId: string, pred: (r: ReglaLite) => boolean) {
  const candidatas = reglas.filter(pred);
  const especificas = candidatas.filter((r) => r.equipoId === equipoId);
  const lista = especificas.length ? especificas : candidatas.filter((r) => !r.equipoId);
  // en volumen, gana el rango con mayor minimo que aplique
  return lista.sort((a, b) => (b.minCantidad ?? 0) - (a.minCantidad ?? 0))[0] ?? null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcularPrecio(
  equipo: EquipoLite,
  reglas: ReglaLite[],
  p: { tipoCliente: string; region: string; cantidad: number },
): ResultadoPrecio {
  const cantidad = Math.max(1, Math.floor(p.cantidad || 1));
  const reglaTipo = elegir(reglas, equipo.id, (r) => r.tipo === "TIPO_CLIENTE" && r.tipoCliente === p.tipoCliente);
  const reglaRegion = elegir(reglas, equipo.id, (r) => r.tipo === "REGION" && r.region === p.region);
  const reglaVolumen = elegir(
    reglas,
    equipo.id,
    (r) => r.tipo === "VOLUMEN" && cantidad >= (r.minCantidad ?? 1) && (r.maxCantidad == null || cantidad <= r.maxCantidad),
  );
  const ajusteTipo = reglaTipo?.porcentaje ?? 0;
  const ajusteRegion = reglaRegion?.porcentaje ?? 0;
  const ajusteVolumen = reglaVolumen?.porcentaje ?? 0;

  const precioUnitario = r2(equipo.precioLista * (1 + ajusteTipo / 100) * (1 + ajusteRegion / 100) * (1 + ajusteVolumen / 100));
  const subtotal = r2(precioUnitario * cantidad);
  const costoTotal = r2(equipo.costoBase * cantidad);
  const utilidad = r2(subtotal - costoTotal);
  return {
    precioLista: equipo.precioLista,
    costoUnitario: equipo.costoBase,
    ajusteTipo, ajusteRegion, ajusteVolumen,
    reglaTipo, reglaRegion, reglaVolumen,
    precioUnitario, cantidad, subtotal, costoTotal, utilidad,
    margen: subtotal ? (utilidad / subtotal) * 100 : 0,
    markup: costoTotal ? (utilidad / costoTotal) * 100 : 0,
    descuentoTotal: equipo.precioLista ? ((precioUnitario - equipo.precioLista) / equipo.precioLista) * 100 : 0,
  };
}
