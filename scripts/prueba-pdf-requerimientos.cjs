// Prueba de TEMPLATE_UNIFICADO: genera REQ-AQP, REQ-SECOCHA y REQ-TALLER con LIMA PLANA 1" TRUPER,
// y la Orden de Traslado (OT) que Producción Arequipa emite para el REQ-SECOCHA.
// Los PDF deben ser idénticos salvo Sede Origen y Número.
//   node scripts/prueba-pdf-requerimientos.cjs [carpeta]   (por defecto: ./pdf-prueba)
//   pdftotext -layout de cada PDF y diff para comparar.
const path = require("path");
const fs = require("fs");
const os = require("os");
const root = path.resolve(__dirname, "..");
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://x.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= "prueba";
// lib/pdf.ts usa toast de components/ui (React): aquí no hace falta
const stub = path.join(os.tmpdir(), "comboy-ui-stub.cjs");
fs.writeFileSync(stub, "exports.toast = () => {};");
const jiti = require(path.join(root, "node_modules/jiti"))(__filename, { alias: { "@/components/ui": stub, "@": root }, interopDefault: true });
const salida = path.resolve(process.argv[2] || "pdf-prueba");
fs.mkdirSync(salida, { recursive: true });
const { generarDocumento } = jiti(root + "/lib/pdf.ts");
const { sedeOrigenReq } = jiti(root + "/lib/plantillasDocumentos.ts");
const item = { id: "i1", nombre: 'LIMA PLANA 1" TRUPER', cantidad: 2, unidad: "UND", marca: "TRUPER", caracteristica: "", productoId: "p1", sku: "PROD-0042" };
const base = { fecha: "2026-10-22", solicitante: "Juan Pérez", motivo: "Mantenimiento de herramientas", items: [item], estado: "PENDIENTE", historial: [] };
const reqs = {
  "REQ-AQP-2026-01": { ...base, id: "a", numero: "REQ-AQP-2026-01", sede: "Arequipa - Planta Principal" },
  "REQ-SECOCHA-2026-01": { ...base, id: "s", numero: "REQ-SECOCHA-2026-01", sede: "Secocha", origen: "SUCURSAL", destino: "Almacén Taller Principal (Arequipa)" },
  "REQ-TALLER-2026-01": { ...base, id: "t", numero: "REQ-TALLER-2026-01", sede: "Taller Principal Aqp" },
};
(async () => {
// Logo real (en el navegador lo carga cargarLogo con fetch/FileReader/Image)
const png = fs.readFileSync(root + "/public/comboy-logo.png");
globalThis.window = globalThis.window || {};
globalThis.fetch = async () => ({ blob: async () => png });
globalThis.FileReader = class { readAsDataURL(b) { this.result = "data:image/png;base64," + b.toString("base64"); this.onload(); } };
globalThis.Image = class { set src(v) { this.naturalWidth = 800; this.naturalHeight = 341; this.onload(); } };
await jiti(root + "/lib/pdf.ts").cargarLogo();
for (const [n, r] of Object.entries(reqs)) {
  const doc = generarDocumento("REQ", sedeOrigenReq(r), r);
  fs.writeFileSync(path.join(salida, n + ".pdf"), Buffer.from(doc.output("arraybuffer")));
  console.log(`${n}.pdf · Sede Origen: ${sedeOrigenReq(r)}`);
}
// Orden de Traslado Producción Arequipa -> Secocha (atiende el REQ-SECOCHA): misma plantilla
const ot = generarDocumento("OT", "Arequipa - Planta Principal", {
  ...base, numero: "OT-00001", estado: "EN CAMINO", solicitante: "produccion", motivo: "Traslado entre establecimientos de la misma empresa",
  destino: "Sucursal Secocha", referencia: "REQ-SECOCHA-2026-01", guia: "T001-000001",
});
fs.writeFileSync(path.join(salida, "OT-00001.pdf"), Buffer.from(ot.output("arraybuffer")));
console.log("OT-00001.pdf · Orden de Traslado Arequipa -> Secocha");
})();
