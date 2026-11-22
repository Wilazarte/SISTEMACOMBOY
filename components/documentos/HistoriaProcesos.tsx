"use client";

// =====================================================================
// HISTORIA DE PROCESOS (Gestión Documentaria): una "historia clínica" por proceso. Busca por cualquier
// código (REQ, OC, factura, guía, NP, OD, OP, GST…) y muestra la línea completa del flujo: cada documento
// con fecha, responsable, estado, bitácora y adjuntos, más los documentos de Gestión Documentaria que
// apuntan a ese proceso. Solo lectura sobre los módulos; abrir o imprimir una historia queda en audit_log.
// =====================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, Eye, FileText, Paperclip, Plus, Printer, RefreshCw, Route, Search } from "lucide-react";
import { abrirDoc } from "@/components/doc-viewer";
import { toast } from "@/components/ui";
import { abrirArchivo, soles } from "@/lib/storage";
import {
  ETAPAS,
  NOMBRE_PROCESO,
  buscarProceso,
  duracionDias,
  fechaHistoria,
  listarProcesos,
  referenciaDeProceso,
  type DocHistoria,
  type HistoriaProceso,
  type TipoProceso,
} from "@/lib/historiaProcesos";
import { et, fechaCorta, fechaHora, registrarConsultaHistoria, sha256Hex, type DocumentoGD } from "@/lib/gestionDocumental";
import { Boton, ChipEstado, Tarjeta, Vacio, claseInput, cx } from "./piezas";

const COLOR_ESTADO: Record<HistoriaProceso["estado"], { fondo: string; texto: string }> = {
  "EN CURSO": { fondo: "#800021", texto: "#FFFFFF" },
  CERRADO: { fondo: "#294D61", texto: "#FFFFFF" },
  ANULADO: { fondo: "#CCD0CF", texto: "#11212D" },
};

function ChipProceso({ estado }: { estado: HistoriaProceso["estado"] }) {
  const c = COLOR_ESTADO[estado];
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
      style={{ background: c.fondo, color: c.texto }}
    >
      {estado}
    </span>
  );
}

/** Se recalcula cuando cualquier módulo actualiza su caché (los datos de otros módulos se bajan al pedirlos). */
function useProcesos(): [HistoriaProceso[], () => void] {
  const [procesos, setProcesos] = useState<HistoriaProceso[]>([]);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recalcular = useCallback(() => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      try {
        setProcesos(listarProcesos());
      } catch (e) {
        console.error("Historia de procesos", e);
      }
    }, 150);
  }, []);
  useEffect(() => {
    recalcular();
    window.addEventListener("erp:update", recalcular);
    return () => {
      window.removeEventListener("erp:update", recalcular);
      if (t.current) clearTimeout(t.current);
    };
  }, [recalcular]);
  return [procesos, recalcular];
}

export function HistoriaProcesos({
  docsGD,
  usuario,
  codigoInicial,
  puedeSubir,
  onAbrirDocumento,
  onAdjuntar,
}: {
  docsGD: DocumentoGD[];
  usuario: string;
  codigoInicial?: string;
  puedeSubir: boolean;
  onAbrirDocumento: (id: string) => void;
  onAdjuntar: (codigo: string) => void;
}) {
  const [procesos, recalcular] = useProcesos();
  const [q, setQ] = useState(codigoInicial ?? "");
  const [tipo, setTipo] = useState<TipoProceso | "">("");
  const [estado, setEstado] = useState<HistoriaProceso["estado"] | "">("");
  const [sel, setSel] = useState<string | null>(null);
  const detalle = useRef<HTMLDivElement>(null);
  const auditados = useRef(new Set<string>());

  // Enlace desde la ficha de un documento (?proceso= o "ver historia")
  useEffect(() => {
    if (!codigoInicial || !procesos.length) return;
    const p = buscarProceso(codigoInicial, procesos);
    if (p) setSel(p.id);
    setQ(codigoInicial);
  }, [codigoInicial, procesos]);

  const filtrados = useMemo(() => {
    const t = q.trim().toUpperCase();
    return procesos.filter((p) => {
      if (tipo && p.tipo !== tipo) return false;
      if (estado && p.estado !== estado) return false;
      if (!t) return true;
      return [p.id, p.partes, ...p.codigos].join(" ").toUpperCase().includes(t);
    });
  }, [procesos, q, tipo, estado]);

  const cuenta = useMemo(() => {
    const c: Partial<Record<TipoProceso, number>> = {};
    procesos.forEach((p) => (c[p.tipo] = (c[p.tipo] ?? 0) + 1));
    return c;
  }, [procesos]);

  const actual = procesos.find((p) => p.id === sel) ?? null;

  // AUDITORÍA: abrir la historia de un proceso (una vez por proceso y por visita)
  useEffect(() => {
    if (!actual || auditados.current.has(actual.id)) return;
    auditados.current.add(actual.id);
    void registrarConsultaHistoria(actual.id, `Abrió la historia clínica de ${actual.id} (${NOMBRE_PROCESO[actual.tipo]})`, {
      tipo: actual.tipo,
      documentos: actual.docs.filter((d) => d.hecho).length,
      estado: actual.estado,
    });
  }, [actual]);

  const elegir = (id: string) => {
    setSel(id);
    // En celular el detalle va debajo de la lista
    setTimeout(() => detalle.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="space-y-3">
      <Tarjeta className="flex flex-wrap items-start gap-3 px-4 py-3 text-[13px] text-[#11212D]">
        <Route size={20} className="mt-0.5 shrink-0 text-[#294D61]" />
        <p className="min-w-0 flex-1 basis-64">
          <b>Historia clínica por proceso.</b> Cada compra, servicio, venta, producción y gasto se arma como una línea: desde el documento que lo inicia hasta el último paso, con
          todos sus documentos, fechas, responsables y adjuntos. Busque con cualquier código del proceso.
        </p>
      </Tarjeta>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#11212D]/50" />
          <input
            className={cx(claseInput, "pl-9")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const p = buscarProceso(q, procesos);
                if (p) elegir(p.id);
                else toast("Ningún proceso tiene ese código.", "error");
              }
            }}
            placeholder="Código: REQ, OC, factura, guía, NP, OD, OP, GST… o cliente / proveedor"
            aria-label="Buscar proceso"
          />
        </div>
        <select className={cx(claseInput, "w-auto basis-44")} value={tipo} onChange={(e) => setTipo(e.target.value as TipoProceso | "")} aria-label="Tipo de proceso">
          <option value="">Todos los procesos</option>
          {(Object.keys(NOMBRE_PROCESO) as TipoProceso[]).map((t) => (
            <option key={t} value={t}>
              {NOMBRE_PROCESO[t]} ({cuenta[t] ?? 0})
            </option>
          ))}
        </select>
        <select className={cx(claseInput, "w-auto basis-32")} value={estado} onChange={(e) => setEstado(e.target.value as HistoriaProceso["estado"] | "")} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="EN CURSO">En curso</option>
          <option value="CERRADO">Cerrado</option>
          <option value="ANULADO">Anulado</option>
        </select>
        <Boton
          onClick={() => {
            recalcular();
            toast("Procesos actualizados.");
          }}
          aria-label="Actualizar"
        >
          <RefreshCw size={15} />
        </Boton>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Lista de procesos */}
        <Tarjeta className="overflow-hidden">
          {filtrados.length === 0 ? (
            <Vacio texto={procesos.length ? "Ningún proceso coincide con la búsqueda." : "Cargando los procesos de los módulos…"} icono={<Route size={26} />} />
          ) : (
            <ul className="divide-y divide-[#11212D]/10">
              {filtrados.slice(0, 300).map((p) => {
                const avance = p.etapasHechas.length / ETAPAS[p.tipo].length;
                return (
                  <li key={p.tipo + p.id}>
                    <button
                      onClick={() => elegir(p.id)}
                      className={cx("block w-full px-3 py-2.5 text-left text-[#11212D] transition hover:bg-[#CCD0CF]/35", sel === p.id && "bg-[#CCD0CF]/55")}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <b className="min-w-0 break-words text-[13px]">{p.id}</b>
                        <ChipProceso estado={p.estado} />
                      </span>
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#294D61]">{NOMBRE_PROCESO[p.tipo]}</span>
                      <span className="block break-words text-[12px] text-[#11212D]/75">{p.partes || "—"}</span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#CCD0CF]">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.round(avance * 100)}%`,
                              background: p.estado === "CERRADO" ? "#294D61" : "#800021",
                            }}
                          />
                        </span>
                        <span className="shrink-0 text-[11px] text-[#11212D]/60">
                          {p.etapasHechas.length}/{ETAPAS[p.tipo].length} · {fechaHistoria(p.inicio)}
                        </span>
                      </span>
                      <span className="block text-[11px] text-[#11212D]/60">{p.etapaActual}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {filtrados.length > 300 && <p className="px-3 py-2 text-[11px] text-[#11212D]/60">Se muestran 300 de {filtrados.length}. Afine la búsqueda.</p>}
        </Tarjeta>

        {/* Historia clínica */}
        <div ref={detalle} className="min-w-0 scroll-mt-3">
          {actual ? (
            <HistoriaClinica
              p={actual}
              docsGD={docsGD.filter((d) => referenciaDeProceso(d.referencia_externa, actual))}
              usuario={usuario}
              puedeSubir={puedeSubir}
              onAbrirDocumento={onAbrirDocumento}
              onAdjuntar={onAdjuntar}
            />
          ) : (
            <Tarjeta>
              <Vacio texto="Elija un proceso para ver su historia clínica completa." icono={<FileText size={26} />} />
            </Tarjeta>
          )}
        </div>
      </div>
      <p className="text-[11px] text-[#11212D]/60">
        {filtrados.length} de {procesos.length} proceso(s). Se ven los procesos de los módulos que su rol puede leer; la historia no modifica ningún documento.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Historia de un proceso
function HistoriaClinica({
  p,
  docsGD,
  usuario,
  puedeSubir,
  onAbrirDocumento,
  onAdjuntar,
}: {
  p: HistoriaProceso;
  docsGD: DocumentoGD[];
  usuario: string;
  puedeSubir: boolean;
  onAbrirDocumento: (id: string) => void;
  onAdjuntar: (codigo: string) => void;
}) {
  const etapas = ETAPAS[p.tipo];
  const nAdjuntos = p.docs.reduce((s, d) => s + d.adjuntos.length, 0) + docsGD.length;
  const dias = duracionDias(p);
  return (
    <Tarjeta className="overflow-hidden">
      {/* Cabecera */}
      <div className="!bg-[#11212D] px-4 py-3.5 !text-white sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Historia clínica del proceso</p>
            <h2 className="break-words text-[18px] font-semibold">{p.id}</h2>
            <p className="text-[12px] text-white/70">{NOMBRE_PROCESO[p.tipo]}</p>
          </div>
          <ChipProceso estado={p.estado} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-4">
          <Dato label="Inicio">{fechaHistoria(p.inicio)}</Dato>
          <Dato label={p.fin ? "Cierre" : "Abierto hace"}>{p.fin ? fechaHistoria(p.fin) : `${dias} día(s)`}</Dato>
          <Dato label="Documentos">
            {p.docs.filter((d) => d.hecho).length} · {nAdjuntos} adjunto(s)
          </Dato>
          <Dato label="Monto">{p.monto ? soles(p.monto) : "—"}</Dato>
          <Dato label="Proveedor / cliente / equipo" ancho>
            {p.partes || "—"}
          </Dato>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => void imprimirHistoria(p, docsGD, usuario)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-[12px] font-semibold !text-white hover:bg-white/20"
          >
            <Printer size={14} /> Imprimir historia (PDF)
          </button>
          {puedeSubir && (
            <button
              onClick={() => onAdjuntar(p.id)}
              className="inline-flex items-center gap-1.5 rounded-lg !bg-[#800021] px-3 py-1.5 text-[12px] font-semibold !text-white hover:opacity-90"
            >
              <Plus size={14} /> Adjuntar documento al proceso
            </button>
          )}
        </div>
      </div>

      {/* Etapas */}
      <ol className="flex flex-wrap gap-x-1 gap-y-2 border-b border-[#11212D]/10 bg-[#CCD0CF]/30 px-4 py-3 sm:px-5">
        {etapas.map((e, i) => {
          const hecha = p.etapasHechas.includes(e);
          const actualE = !hecha && p.estado === "EN CURSO" && p.etapaActual === `Pendiente: ${e}`;
          return (
            <li key={e} className="flex items-center gap-1 text-[11px] font-semibold">
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
                style={
                  hecha
                    ? {
                        background: "#294D61",
                        color: "#FFFFFF",
                        borderColor: "#294D61",
                      }
                    : actualE
                      ? {
                          background: "#FFFFFF",
                          color: "#800021",
                          borderColor: "#800021",
                        }
                      : {
                          background: "#FFFFFF",
                          color: "rgba(17,33,45,0.55)",
                          borderColor: "rgba(17,33,45,0.2)",
                        }
                }
              >
                {hecha ? <CheckCircle2 size={12} /> : actualE ? <Clock3 size={12} /> : <Circle size={12} />} {e}
              </span>
              {i < etapas.length - 1 && <ChevronRight size={12} className="text-[#11212D]/35" />}
            </li>
          );
        })}
      </ol>

      {/* Línea de tiempo */}
      <div className="px-3 py-4 sm:px-5">
        <ol className="relative ml-2 border-l-2 border-[#11212D]/15">
          {p.docs.map((d) => (
            <Nodo key={d.clave} d={d} />
          ))}
        </ol>

        {/* Documentos de Gestión Documentaria enlazados por código */}
        <div className="mt-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#11212D]/75">
            <Paperclip size={14} /> Documentos adjuntos en Gestión Documentaria ({docsGD.length})
          </h3>
          {docsGD.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#11212D]/20 px-3 py-3 text-[12px] text-[#11212D]/60">
              Ninguno todavía. Use &quot;Adjuntar documento al proceso&quot; (planos, contratos, actas, fotos…): quedan versionados, con hash y auditoría, y aparecen aquí.
            </p>
          ) : (
            <ul className="divide-y divide-[#11212D]/10 rounded-lg border border-[#11212D]/10">
              {docsGD.map((g) => (
                <li key={g.id}>
                  <button
                    onClick={() => onAbrirDocumento(g.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-[#11212D] hover:bg-[#CCD0CF]/35"
                  >
                    <span className="min-w-0">
                      <b>{g.codigo_unico}</b> · {g.version_actual} · <span className="break-words">{g.nombre}</span>
                      <span className="block text-[11px] text-[#11212D]/60">
                        {et(g.categoria)} · {g.dueno_nombre} · {fechaCorta(g.fecha_creacion)}
                      </span>
                    </span>
                    <ChipEstado estado={g.estado} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Tarjeta>
  );
}

function Dato({ label, children, ancho }: { label: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={cx("min-w-0", ancho && "col-span-2 sm:col-span-4")}>
      <span className="block text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</span>
      <span className="block break-words font-semibold !text-white">{children}</span>
    </div>
  );
}

function Nodo({ d }: { d: DocHistoria }) {
  const [bitacora, setBitacora] = useState(false);
  const color = !d.hecho ? "#CCD0CF" : d.critico ? "#800021" : "#294D61";
  return (
    <li className="relative mb-4 pl-5 last:mb-0">
      <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white shadow" style={{ background: color }} aria-hidden />
      <div className={cx("rounded-lg border px-3 py-2", d.hecho ? "border-[#11212D]/12 bg-white" : "border-dashed border-[#11212D]/20 bg-[#CCD0CF]/20")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className={cx("min-w-0 break-words text-[13px]", d.hecho ? "text-[#11212D]" : "text-[#11212D]/55")}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#294D61]">{d.etapa}</span>
            <br />
            <b>{d.tipoDoc}</b>
            {d.codigo && <> · {d.codigo}</>}
          </p>
          <span className="shrink-0 text-[11px] text-[#11212D]/60">{d.hecho ? fechaHistoria(d.fecha) : "Pendiente"}</span>
        </div>
        <p className={cx("mt-0.5 break-words text-[12px]", d.hecho ? "text-[#11212D]/80" : "text-[#11212D]/50")}>{d.detalle}</p>
        {(d.estado || d.responsable || d.monto) && d.hecho && (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#11212D]/70">
            {d.estado && (
              <span className="font-bold uppercase" style={{ color: d.critico ? "#800021" : "#294D61" }}>
                {d.estado.replace(/_/g, " ")}
              </span>
            )}
            {d.responsable && <span>Responsable: {d.responsable}</span>}
            {!!d.monto && <span>{soles(d.monto)}</span>}
          </p>
        )}
        {d.hecho && (d.ver || d.pdf || d.adjuntos.length > 0 || d.bitacora.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.ver && (
              <button
                onClick={() => abrirDoc(d.ver!)}
                className="inline-flex items-center gap-1 rounded-md border border-[#11212D]/20 px-2 py-0.5 text-[11px] font-semibold text-[#11212D] hover:bg-[#CCD0CF]/40"
              >
                <Eye size={12} /> Ver
              </button>
            )}
            {d.pdf && (
              <button
                onClick={() => void d.pdf!().catch((e) => toast((e as Error).message, "error"))}
                className="inline-flex items-center gap-1 rounded-md border border-[#11212D]/20 px-2 py-0.5 text-[11px] font-semibold text-[#11212D] hover:bg-[#CCD0CF]/40"
              >
                <FileText size={12} /> PDF
              </button>
            )}
            {d.adjuntos.map((a, i) => (
              <button
                key={i}
                onClick={() => abrirArchivo(a.ref)}
                className="inline-flex max-w-full items-center gap-1 rounded-md !bg-[#294D61] px-2 py-0.5 text-[11px] font-semibold !text-white hover:opacity-90"
                title={a.nombre}
              >
                <Paperclip size={12} className="shrink-0" /> <span className="truncate">{a.nombre}</span>
              </button>
            ))}
            {d.bitacora.length > 0 && (
              <button
                onClick={() => setBitacora((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-[#294D61] hover:bg-[#CCD0CF]/40"
              >
                {bitacora ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Bitácora ({d.bitacora.length})
              </button>
            )}
          </div>
        )}
        {bitacora && (
          <ul className="mt-2 space-y-1 border-t border-[#11212D]/10 pt-2">
            {d.bitacora.map((e, i) => (
              <li key={i} className="break-words text-[11px] text-[#11212D]/80">
                <span className="text-[#11212D]/55">{fechaHistoria(e.fecha)}</span> · <b>{String(e.usuario ?? "")}</b> · {e.accion}
                {e.detalle && <> · {e.detalle}</>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ PDF de la historia (con huella)
async function imprimirHistoria(p: HistoriaProceso, docsGD: DocumentoGD[], usuario: string) {
  const filas = p.docs.map((d) => [
    d.hecho ? fechaHistoria(d.fecha) : "Pendiente",
    d.etapa,
    `${d.tipoDoc}${d.codigo ? `\n${d.codigo}` : ""}`,
    (d.estado ?? "").replace(/_/g, " "),
    d.responsable ?? "",
    d.detalle,
    d.monto ? soles(d.monto) : "",
    d.adjuntos.map((a) => a.nombre).join("\n"),
  ]);
  const gd = docsGD.map((g) => [g.codigo_unico, g.version_actual, g.nombre, et(g.estado), g.dueno_nombre ?? "", fechaCorta(g.fecha_creacion), g.hash_sha256.slice(0, 16) + "…"]);
  const hash = await sha256Hex(new TextEncoder().encode(JSON.stringify({ proceso: p.id, filas, gd })));
  const fecha = fechaHora(new Date().toISOString());
  const [{ jsPDF }, { default: autoTable }, { mostrarPDF }] = await Promise.all([import("jspdf"), import("jspdf-autotable"), import("@/lib/visorPdf")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setFillColor(17, 33, 45);
  doc.rect(0, 0, W, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.text("COMBOY VID | Historia clínica del proceso", 10, 11.5);
  doc.setFontSize(11);
  doc.text(p.id, W - 10, 11.5, { align: "right" });
  doc.setTextColor(17, 33, 45);
  doc.setFont("times", "normal");
  doc.setFontSize(9.5);
  doc.text(
    `${NOMBRE_PROCESO[p.tipo]} · ${p.estado} · ${p.etapaActual} · Inicio ${fechaHistoria(p.inicio)}${p.fin ? ` · Cierre ${fechaHistoria(p.fin)}` : ""}${p.monto ? ` · ${soles(p.monto)}` : ""}`,
    10,
    24,
  );
  doc.text(`Proveedor / cliente / equipo: ${p.partes || "—"}`, 10, 29);
  const pie = () => {
    doc.setDrawColor(128, 0, 33);
    doc.line(10, H - 14, W - 10, H - 14);
    doc.setFontSize(7);
    doc.setTextColor(128, 0, 33);
    doc.text(`HUELLA SHA-256 del contenido: ${hash}`, 10, H - 10);
    doc.setTextColor(17, 33, 45);
    doc.text(`Impreso por ${usuario} · ${fecha} (Lima) · La impresión quedó registrada en la auditoría de Gestión Documentaria.`, 10, H - 6.5);
  };
  autoTable(doc, {
    startY: 33,
    head: [["Fecha", "Etapa", "Documento", "Estado", "Responsable", "Detalle", "Monto", "Adjuntos"]],
    body: filas,
    styles: {
      font: "times",
      fontSize: 7.5,
      cellPadding: 1.4,
      textColor: [17, 33, 45],
      overflow: "linebreak",
    },
    headStyles: { fillColor: [41, 77, 97], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [235, 237, 237] },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 30 },
      2: { cellWidth: 38 },
      3: { cellWidth: 24 },
      4: { cellWidth: 26 },
      6: { cellWidth: 22 },
      7: { cellWidth: 34 },
    },
    margin: { left: 10, right: 10, bottom: 18 },
    didDrawPage: pie,
  });
  if (gd.length) {
    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      head: [["Doc. Gestión Documentaria", "Versión", "Nombre", "Estado", "Dueño", "Fecha", "Hash SHA-256"]],
      body: gd,
      styles: {
        font: "times",
        fontSize: 7.5,
        cellPadding: 1.4,
        textColor: [17, 33, 45],
        overflow: "linebreak",
      },
      headStyles: { fillColor: [17, 33, 45], textColor: [255, 255, 255] },
      margin: { left: 10, right: 10, bottom: 18 },
      didDrawPage: pie,
    });
  }
  mostrarPDF(doc, `Historia-${p.id}`);
  // AUDITORÍA: impresión de la historia, con la huella del contenido
  void registrarConsultaHistoria(p.id, `Imprimió la historia clínica de ${p.id}`, {
    formato: "PDF",
    hash_sha256: hash,
    documentos: filas.length,
    adjuntos_gd: gd.length,
  });
}
