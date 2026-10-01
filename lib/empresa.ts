// Datos de la empresa para cabeceras de PDF. Edítalos con los datos reales.
export const EMPRESA = {
  razonSocial: "COMBOY VID E.I.R.L.",
  nombreComercial: "VID COMBOY Soluciones Industriales",
  ruc: "20613238566",
  direccion: "Dirección fiscal, Lima - Perú", // <-- reemplazar
  telefono: "+51 900 000 000", // <-- reemplazar
  email: "compras@comboyvid.com", // <-- reemplazar
  /** Cuentas para pagos (Nota de Pedido y comprobantes). */
  cuentas: [
    { banco: "BCP", moneda: "Soles", numero: "000-0000000-0-00", cci: "002-000-000000000000-00" }, // <-- reemplazar
  ],
  /** Logo opcional en base64 (data:image/png;base64,...). Si queda vacío se dibuja un isotipo. */
  logoDataUrl: "",
};

export const SEDES = ["Oficina Lima", "Taller Principal", "Mina Cerro de Pasco", "Mina Huancavelica", "Mina La Libertad"];

export const UNIDADES = ["UND", "KG", "M", "M2", "GLN", "LT", "CAJA", "PAR", "JGO", "ROLLO", "BOLSA"];
