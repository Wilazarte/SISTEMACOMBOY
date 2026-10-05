// Datos de la empresa para cabeceras de PDF. Edítalos con los datos reales.
export const EMPRESA = {
  razonSocial: "COMBOY VID",
  nombreComercial: "Inversiones Global Company Rousvid SAC",
  ruc: "20613238566", //
  direccion: "El Nazareno Mz. A Lt. 25 - Paucarpata, Arequipa - Perú", // <-- reemplazar
  telefono: "+51 942304539", // <-- reemplazar
  email: "informatica@comboyvid.com", // <-- reemplazar
  /** Cuentas para pagos (Nota de Pedido y comprobantes). */
  cuentas: [
    { banco: "BCP", moneda: "Soles", numero: "21515158381091", cci: "21515158381091" }, // <-- reemplazar
  ],
  /** Logo opcional en base64 (data:image/png;base64,...). Si queda vacío se dibuja un isotipo. */
  logoDataUrl: "",
};

export const SEDES = ["Adm Aqp", "Taller Principal Aqp", "Sucursal Secocha", "Area Comercial", "Gerencia"];

/** Almacenes físicos (ingreso de compras, equipos terminados de Producción, despacho). */
export const ALMACENES = ["Almacen Aqp", "Planta Arequipa", "Suc Secocha", "Adm Aqp"];
export const ALMACEN_DEFECTO = "Almacen Aqp";
/** Todas las ubicaciones donde puede haber stock (almacenes + sedes de requerimientos). */
export const SEDES_STOCK = Array.from(new Set([...ALMACENES, ...SEDES]));

export const UNIDADES = ["UND", "KG", "M", "M2", "GLN", "LT", "CAJA", "PAR", "JGO", "ROLLO", "BOLSA"];
