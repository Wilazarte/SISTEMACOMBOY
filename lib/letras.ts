// Monto en letras para la representación impresa (leyenda 1000, catálogo 52): "SON MIL CIENTO OCHO CON 50/100 SOLES".
// Copia de supabase/functions/sunat-cpe/letras.ts (el Edge Function usa la misma), así el PDF y el XML dicen lo mismo.

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function menorMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  let t = CENTENAS[c];
  if (r > 0) {
    let d: string;
    if (r < 30) d = UNIDADES[r];
    else {
      const u = r % 10;
      d = DECENAS[Math.floor(r / 10)] + (u ? ` Y ${UNIDADES[u]}` : "");
    }
    t = t ? `${t} ${d}` : d;
  }
  return t;
}

/** Entero a letras (hasta 999 999 999 999). "UNO" final se apocopa a "UN" delante de MIL/MILLONES. */
export function enteroALetras(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  const apocope = (s: string) => s.replace(/UNO$/, "UN").replace(/VEINTIUNO$/, "VEINTIUN");
  if (millones > 0) partes.push(millones === 1 ? "UN MILLON" : `${apocope(enteroALetras(millones))} MILLONES`);
  if (miles > 0) partes.push(miles === 1 ? "MIL" : `${apocope(menorMil(miles))} MIL`);
  if (resto > 0) partes.push(menorMil(resto));
  return partes.join(" ");
}

export function montoEnLetras(monto: number, moneda = "PEN"): string {
  const centimos = Math.round(Math.abs(monto) * 100);
  const entero = Math.floor(centimos / 100);
  const dec = String(centimos % 100).padStart(2, "0");
  const nombre = moneda === "USD" ? "DÓLARES AMERICANOS" : "SOLES";
  return `SON ${enteroALetras(entero)} CON ${dec}/100 ${nombre}`;
}
