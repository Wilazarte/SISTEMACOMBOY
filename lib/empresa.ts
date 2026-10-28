// Datos de la empresa para cabeceras de PDF. Edítalos con los datos reales.
export const EMPRESA = {
  razonSocial: "COMBOY VID",
  nombreComercial: "Inversiones Global Company Rousvid SAC",
  ruc: "20613238566", //
  direccion: "El Nazareno Mz. A Lt. 25 - Paucarpata, Arequipa - Perú", // <-- reemplazar
  telefono: "+51 942304539", // <-- reemplazar
  email: "informatica@comboyvid.com", // <-- reemplazar
  /** Cuentas para pagos (Nota de Pedido y comprobantes): Interbank Negocios de la CAJA GENERAL (las mismas de lib/cajas.ts). */
  cuentas: [
    { banco: "Interbank", moneda: "Soles", numero: "3003008986156", cci: "00330000300898615618" },
    { banco: "Interbank", moneda: "Dólares", numero: "3003008986163", cci: "00330000300898616314" },
  ],
  /** Logo opcional en base64 (data:image/png;base64,...). Si queda vacío se dibuja un isotipo. */
  logoDataUrl: "",
};

export const SEDES = ["Adm Aqp", "Taller Principal Aqp", "Sucursal Secocha", "Area Comercial", "Gerencia", "Oficina Lima"];

/** Almacenes físicos (ingreso de compras, equipos terminados de Producción, despacho). */
export const ALMACENES = ["Almacen Aqp", "Planta Arequipa", "Suc Secocha", "Adm Aqp"];
export const ALMACEN_DEFECTO = "Almacen Aqp";
/** Todas las ubicaciones donde puede haber stock (almacenes + sedes de requerimientos). */
export const SEDES_STOCK = Array.from(new Set([...ALMACENES, ...SEDES]));

export const UNIDADES = ["UND", "PZA", "KG", "M", "M2", "GLN", "LT", "CAJA", "PAR", "JGO", "ROLLO", "BOLSA"];

/** Sede por defecto del stock de repuestos (importación de saldos del almacén). */
export const SEDE_REPUESTOS = "Taller Principal Aqp";
