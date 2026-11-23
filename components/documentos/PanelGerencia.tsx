"use client";

// Panel de Gerencia: "¿Quién descargó qué?" (buscador por usuario, documento y fecha) y los 3 reportes
// (diario, vencimientos, confidenciales). Exporta a Excel y PDF con FIRMA DE AUDITORÍA: hash SHA-256 del
// contenido exportado + estado de la cadena del audit_log + quién y cuándo exportó. La exportación misma
// queda registrada en audit_log (EXPORTAR_REPORTE) con ese hash, para poder comprobar después el archivo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, FileSpreadsheet, FileText, Link2, Loader2, Lock, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui";
import {
  ACCION_TEXTO,
  buscarAuditoria,
  fechaCorta,
  fechaHora,
  hoyLima,
  registrarExportacion,
  reporteVencimientos,
  sha256Hex,
  valorTexto,
  verificarCadena,
  type AuditoriaGD,
  type FiltroAuditoria,
  type VencimientoGD,
} from "@/lib/gestionDocumental";
import { Boton, Campo, Tarjeta, Vacio, claseInput, cx } from "./piezas";
import { TablaAuditoria } from "./PanelDocumento";
import { guardarExcel } from "@/lib/guardarArchivo";

type Fila = Record<string, string | number>;

async function firma(titulo: string, filas: Fila[], usuario: string) {
  const hash = await sha256Hex(new TextEncoder().encode(JSON.stringify({ titulo, filas })));
  const cadena = await verificarCadena().catch((e) => ({ ok: false, total: 0, error: (e as Error).message }) as Awaited<ReturnType<typeof verificarCadena>>);
  const fecha = fechaHora(new Date().toISOString());
  return { hash, cadena, fecha, usuario };
}

/** Excel con hoja "Firma de auditoría". */
async function exportarExcel(titulo: string, archivo: string, filas: Fila[], usuario: string, filtros: string) {
  const f = await firma(titulo, filas, usuario);
  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas.length ? filas : [{ Resultado: "Sin registros" }]), "Reporte");
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.aoa_to_sheet([
      ["FIRMA DE AUDITORÍA · COMBOY VID · Gestión Documentaria"],
      ["Reporte", titulo],
      ["Filtros", filtros],
      ["Registros", filas.length],
      ["Generado por", f.usuario],
      ["Fecha y hora (Lima)", f.fecha],
      ["SHA-256 del contenido", f.hash],
      ["Cadena audit_log", f.cadena.ok ? `ÍNTEGRA (${f.cadena.total} registros)` : `ALERTA: ${f.cadena.error ?? "no verificada"}`],
      ["Último hash de la cadena", f.cadena.ultimo_hash ?? "—"],
      ["Comprobación", "El hash de este reporte quedó registrado en audit_log (Exportó reporte)."],
    ]),
    "Firma de auditoría"
  );
  await guardarExcel(libro, `${archivo}.xlsx`);
  // AUDITORÍA: EXPORTAR_REPORTE
  await registrarExportacion(`${titulo} · Excel · ${filas.length} registro(s)`, { formato: "XLSX", hash_sha256: f.hash, registros: filas.length, filtros, cadena_ok: f.cadena.ok });
}

/** PDF con pie de firma de auditoría en cada página (se abre en la vista previa del ERP). */
async function exportarPdf(titulo: string, archivo: string, filas: Fila[], usuario: string, filtros: string) {
  const f = await firma(titulo, filas, usuario);
  const [{ jsPDF }, { default: autoTable }, { mostrarPDF }] = await Promise.all([import("jspdf"), import("jspdf-autotable"), import("@/lib/visorPdf")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setFillColor(17, 33, 45); // #11212D
  doc.rect(0, 0, W, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.text("COMBOY VID | Gestión Documentaria", 10, 11.5);
  doc.setFontSize(10);
  doc.text(titulo, W - 10, 11.5, { align: "right" });
  doc.setTextColor(17, 33, 45);
  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.text(`Filtros: ${filtros}  ·  Registros: ${filas.length}`, 10, 24);
  const cols = filas.length ? Object.keys(filas[0]) : ["Resultado"];
  autoTable(doc, {
    startY: 27,
    head: [cols],
    body: filas.length ? filas.map((r) => cols.map((c) => String(r[c] ?? ""))) : [["Sin registros"]],
    styles: { font: "times", fontSize: 7.5, cellPadding: 1.4, textColor: [17, 33, 45], overflow: "linebreak" },
    headStyles: { fillColor: [41, 77, 97], textColor: [255, 255, 255] }, // #294D61
    alternateRowStyles: { fillColor: [235, 237, 237] },
    margin: { left: 10, right: 10, bottom: 22 },
    didDrawPage: () => {
      doc.setDrawColor(128, 0, 33); // #800021
      doc.line(10, H - 17, W - 10, H - 17);
      doc.setFontSize(7);
      doc.setTextColor(128, 0, 33);
      doc.text(`FIRMA DE AUDITORÍA · SHA-256 del contenido: ${f.hash}`, 10, H - 13);
      doc.setTextColor(17, 33, 45);
      doc.text(
        `Generado por ${f.usuario} · ${f.fecha} (Lima) · Cadena audit_log: ${f.cadena.ok ? `ÍNTEGRA, ${f.cadena.total} registros, último hash ${String(f.cadena.ultimo_hash ?? "").slice(0, 24)}…` : `ALERTA ${f.cadena.error ?? ""}`}`,
        10,
        H - 9.5
      );
      doc.text("El hash de este reporte quedó registrado en audit_log (Exportó reporte): permite comprobar que el archivo no fue alterado.", 10, H - 6);
    },
  });
  mostrarPDF(doc, archivo);
  // AUDITORÍA: EXPORTAR_REPORTE
  await registrarExportacion(`${titulo} · PDF · ${filas.length} registro(s)`, { formato: "PDF", hash_sha256: f.hash, registros: filas.length, filtros, cadena_ok: f.cadena.ok });
}

const filasAuditoria = (l: AuditoriaGD[]): Fila[] =>
  l.map((a) => ({
    "N°": a.secuencia,
    "Fecha y hora": fechaHora(a.fecha_hora),
    Usuario: a.usuario_nombre ?? "",
    Acción: ACCION_TEXTO[a.accion] ?? a.accion,
    Documento: a.codigo_documento ?? "",
    Nombre: a.nombre_documento ?? "",
    Versión: a.version ?? "",
    Confidencial: a.confidencial ? "Sí" : "No",
    IP: a.ip ?? "",
    Dispositivo: a.dispositivo ?? "",
    Detalle: a.detalle ?? "",
    "Antes → después": `${valorTexto(a.valor_anterior)} → ${valorTexto(a.valor_nuevo)}`,
  }));

function BotonesExportar({ titulo, archivo, filas, usuario, filtros }: { titulo: string; archivo: string; filas: () => Fila[]; usuario: string; filtros: string }) {
  const [ocupado, setOcupado] = useState<"" | "x" | "p">("");
  const correr = async (tipo: "x" | "p") => {
    setOcupado(tipo);
    try {
      await (tipo === "x" ? exportarExcel : exportarPdf)(titulo, archivo, filas(), usuario, filtros);
      toast("Reporte exportado con firma de auditoría. La exportación quedó registrada.");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOcupado("");
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Boton tono="secundario" onClick={() => correr("x")} disabled={!!ocupado}>
        {ocupado === "x" ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} Excel
      </Boton>
      <Boton tono="neutro" onClick={() => correr("p")} disabled={!!ocupado}>
        {ocupado === "p" ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} PDF
      </Boton>
    </div>
  );
}

function EstadoCadena() {
  const [c, setC] = useState<Awaited<ReturnType<typeof verificarCadena>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    verificarCadena().then(setC, (e) => setError((e as Error).message));
  }, []);
  if (error) return <p className="text-[12px] font-semibold text-tema-tinta">{error}</p>;
  if (!c) return <p className="text-[12px] text-tema-texto/60">Verificando la cadena del audit_log…</p>;
  return c.ok ? (
    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-tema-sec">
      <ShieldCheck size={15} /> Auditoría íntegra: {c.total} registro(s) encadenados por hash, ninguno borrado ni alterado.
    </p>
  ) : (
    <p className="flex items-center gap-1.5 text-[12px] font-bold text-tema-tinta">
      <ShieldAlert size={15} /> ALERTA: {c.error}. Alguien con acceso directo a la base modificó el registro de auditoría.
    </p>
  );
}

// ------------------------------------------------------------------ ¿Quién descargó qué?
export function QuienDescargo({ usuario }: { usuario: string }) {
  const [f, setF] = useState<FiltroAuditoria & { tipo: string }>({ usuario: "", documento: "", desde: "", hasta: "", tipo: "DESCARGAS" });
  const [filas, setFilas] = useState<AuditoriaGD[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const acciones = f.tipo === "DESCARGAS" ? ["DESCARGAR", "DESCARGA_BLOQUEADA"] : f.tipo === "VISTAS" ? ["VER"] : f.tipo === "ALERTAS" ? ["ACCESO_DENEGADO", "DESCARGA_BLOQUEADA", "ALERTA_INTEGRIDAD"] : undefined;
  const buscar = useCallback(async () => {
    setCargando(true);
    try {
      setFilas(await buscarAuditoria({ ...f, acciones }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.usuario, f.documento, f.desde, f.hasta, f.tipo]);
  useEffect(() => {
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.tipo]);
  const filtros = [f.usuario && `usuario "${f.usuario}"`, f.documento && `documento "${f.documento}"`, f.desde && `desde ${fechaCorta(f.desde)}`, f.hasta && `hasta ${fechaCorta(f.hasta)}`, f.tipo]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3">
      <Tarjeta className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-tema-texto">¿Quién descargó qué?</h3>
          <EstadoCadena />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Campo label="Usuario">
            <input className={claseInput} value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} placeholder="Nombre" onKeyDown={(e) => e.key === "Enter" && buscar()} />
          </Campo>
          <Campo label="Documento">
            <input className={claseInput} value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} placeholder="Código o nombre" onKeyDown={(e) => e.key === "Enter" && buscar()} />
          </Campo>
          <Campo label="Desde">
            <input type="date" className={claseInput} value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
          </Campo>
          <Campo label="Hasta">
            <input type="date" className={claseInput} value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
          </Campo>
          <Campo label="Ver">
            <select className={claseInput} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="DESCARGAS">Descargas</option>
              <option value="VISTAS">Vistas</option>
              <option value="ALERTAS">Alertas y accesos denegados</option>
              <option value="TODO">Todas las acciones</option>
            </select>
          </Campo>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Boton tono="neutro" onClick={buscar} disabled={cargando}>
            {cargando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Buscar
          </Boton>
          <BotonesExportar titulo="¿Quién descargó qué?" archivo={`auditoria-documentos-${hoyLima()}`} filas={() => filasAuditoria(filas ?? [])} usuario={usuario} filtros={filtros} />
        </div>
      </Tarjeta>
      <Tarjeta className="p-3">{filas ? <TablaAuditoria filas={filas} /> : <Vacio texto="Cargando…" />}</Tarjeta>
    </div>
  );
}

// ------------------------------------------------------------------ Reportes del gerente
type Rep = "diario" | "vencidos" | "confidenciales";

export function Reportes({ usuario }: { usuario: string }) {
  const [rep, setRep] = useState<Rep>("diario");
  const [dia, setDia] = useState(hoyLima());
  const [dias, setDias] = useState(30);
  const [categoria, setCategoria] = useState<string>("Politica");
  const [audit, setAudit] = useState<AuditoriaGD[] | null>(null);
  const [venc, setVenc] = useState<VencimientoGD[] | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      if (rep === "diario") setAudit(await buscarAuditoria({ desde: dia, hasta: dia, acciones: ["CREAR", "SUBIR_VERSION", "APROBAR", "RECHAZAR", "DESCARGAR"] }));
      else if (rep === "confidenciales") setAudit(await buscarAuditoria({ acciones: ["VER", "DESCARGAR"], soloConfidencial: true }));
      else setVenc(await reporteVencimientos(dias, categoria || null));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  }, [rep, dia, dias, categoria]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(() => {
    const l = audit ?? [];
    const c = (a: string) => l.filter((x) => x.accion === a).length;
    return { creados: c("CREAR"), versiones: c("SUBIR_VERSION"), aprobados: c("APROBAR"), rechazados: c("RECHAZAR"), descargas: c("DESCARGAR") };
  }, [audit]);

  const filasVenc = (): Fila[] =>
    (venc ?? []).map((v) => ({
      Código: v.codigo_unico,
      Nombre: v.nombre,
      Categoría: v.categoria,
      Módulo: v.modulo,
      Estado: v.estado,
      Versión: v.version_actual,
      Dueño: v.dueno_nombre ?? "",
      Vence: fechaCorta(v.fecha_vencimiento),
      "Días restantes": v.dias_restantes,
    }));

  const titulo = rep === "diario" ? `Reporte diario ${fechaCorta(dia)}` : rep === "vencidos" ? `Documentos que vencen en ${dias} días` : "Documentos confidenciales: quién los vio y descargó";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["diario", "Reporte diario", CalendarClock],
            ["vencidos", "Vencimientos (30 días)", CalendarClock],
            ["confidenciales", "Confidenciales", Lock],
          ] as const
        ).map(([id, label, Icono]) => (
          <button
            key={id}
            onClick={() => setRep(id)}
            className={cx("inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] font-semibold", rep === id ? "border-tema-texto !bg-tema-fuerte !text-white" : "border-tema-texto/25 bg-white text-tema-texto")}
          >
            <Icono size={14} /> {label}
          </button>
        ))}
      </div>
      <Tarjeta className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            {rep === "diario" && (
              <Campo label="Día">
                <input type="date" className={claseInput} value={dia} onChange={(e) => setDia(e.target.value)} />
              </Campo>
            )}
            {rep === "vencidos" && (
              <>
                <Campo label="Vencen en (días)">
                  <input type="number" min={1} max={365} className={cx(claseInput, "w-28")} value={dias} onChange={(e) => setDias(Math.max(1, Number(e.target.value) || 30))} />
                </Campo>
                <Campo label="Categoría">
                  <select className={claseInput} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                    <option value="Politica">Políticas</option>
                    <option value="">Todas</option>
                    <option value="Contrato">Contratos</option>
                    <option value="Plano">Planos</option>
                    <option value="Estrategia Comercial">Estrategia Comercial</option>
                  </select>
                </Campo>
              </>
            )}
            {cargando && <Loader2 size={16} className="mb-2.5 animate-spin text-tema-sec" />}
          </div>
          <BotonesExportar
            titulo={titulo}
            archivo={`${rep}-${hoyLima()}`}
            filas={() => (rep === "vencidos" ? filasVenc() : filasAuditoria(audit ?? []))}
            usuario={usuario}
            filtros={rep === "diario" ? `día ${fechaCorta(dia)}` : rep === "vencidos" ? `${dias} días · ${categoria || "todas"}` : "VER y DESCARGAR de documentos confidenciales"}
          />
        </div>
        {rep === "diario" && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              [
                ["Creados", resumen.creados, "var(--secundario)"],
                ["Versiones nuevas", resumen.versiones, "var(--secundario)"],
                ["Aprobados", resumen.aprobados, "var(--secundario)"],
                ["Rechazados", resumen.rechazados, "var(--accent)"],
                ["Descargas", resumen.descargas, "var(--text)"],
              ] as const
            ).map(([l, n, c]) => (
              <div key={l} className="rounded-lg border border-tema-texto/10 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-tema-texto/60">{l}</p>
                <p className="text-[22px] font-semibold" style={{ color: c }}>
                  {n}
                </p>
              </div>
            ))}
          </div>
        )}
      </Tarjeta>
      <Tarjeta className="p-3">
        {rep === "vencidos" ? (
          !venc ? (
            <Vacio texto="Cargando…" />
          ) : venc.length === 0 ? (
            <Vacio texto={`Ningún documento vence en los próximos ${dias} días.`} />
          ) : (
            <ul className="divide-y divide-tema-texto/10">
              {venc.map((v) => (
                <li key={v.codigo_unico} className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 text-[13px] text-tema-texto">
                  <span className="min-w-0">
                    <b>{v.codigo_unico}</b> {v.version_actual} · {v.nombre}
                    <span className="block text-[12px] text-tema-texto/60">
                      {v.categoria} · {v.modulo} · dueño {v.dueno_nombre}
                    </span>
                  </span>
                  <span className={cx("rounded-full px-2.5 py-0.5 text-[12px] font-bold", v.dias_restantes < 0 ? "!bg-tema-acento !text-white" : "border border-tema-acento text-tema-tinta")}>
                    {v.dias_restantes < 0 ? `Vencido hace ${-v.dias_restantes} d` : v.dias_restantes === 0 ? "Vence hoy" : `${fechaCorta(v.fecha_vencimiento)} · ${v.dias_restantes} d`}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : audit ? (
          <TablaAuditoria filas={audit} />
        ) : (
          <Vacio texto="Cargando…" />
        )}
      </Tarjeta>
      <p className="flex items-center gap-1 text-[11px] text-tema-texto/60">
        <Link2 size={12} /> Los reportes salen del audit_log (solo inserción): no dependen de que el documento siga visible.
      </p>
    </div>
  );
}
