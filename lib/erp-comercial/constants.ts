export const TIPOS_CLIENTE = ["DISTRIBUIDOR", "MAYORISTA", "RETAIL", "VIP"] as const;
export const REGIONES = ["LIMA", "AREQUIPA", "NORTE", "SUR", "SELVA"] as const;
export const ETAPAS = ["PROSPECTO", "COTIZADO", "NEGOCIADO", "GANADO", "PERDIDO", "POSTVENTA"] as const;
export const CATEGORIAS_PLANTILLA = ["BIENVENIDA", "COTIZACION", "OFERTA", "POSTVENTA", "MANTENIMIENTO", "SEGUIMIENTO"] as const;

export type TipoCliente = (typeof TIPOS_CLIENTE)[number];
export type Region = (typeof REGIONES)[number];
export type Etapa = (typeof ETAPAS)[number];

export const LABEL_TIPO: Record<string, string> = {
  DISTRIBUIDOR: "Distribuidor", MAYORISTA: "Mayorista", RETAIL: "Retail", VIP: "VIP",
};
export const LABEL_REGION: Record<string, string> = {
  LIMA: "Lima", AREQUIPA: "Arequipa", NORTE: "Norte", SUR: "Sur", SELVA: "Selva",
};
export const LABEL_ETAPA: Record<string, string> = {
  PROSPECTO: "Prospecto", COTIZADO: "Cotizado", NEGOCIADO: "Negociado",
  GANADO: "Ganado", PERDIDO: "Perdido", POSTVENTA: "Post-Venta",
};
export const COLOR_ETAPA: Record<string, string> = {
  PROSPECTO: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  COTIZADO: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  NEGOCIADO: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  GANADO: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PERDIDO: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  POSTVENTA: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
};
export const COLOR_ESTADO_MSG: Record<string, string> = {
  PENDIENTE: "text-slate-400", ENVIADO: "text-slate-300", ENTREGADO: "text-slate-200",
  LEIDO: "text-sky-400", FALLIDO: "text-rose-400", SIMULADO: "text-amber-300", RECIBIDO: "text-emerald-300",
};

export const CONFIG_DEFAULTS: Record<string, string> = {
  diasSinContactoProspecto: "7",
  diasPostVenta: "2",
  diasAvisoMantenimiento: "7",
  autoEnviarMantenimiento: "true",
  autoEnviarPostVenta: "true",
  autoEnviarSeguimiento: "false",
};
