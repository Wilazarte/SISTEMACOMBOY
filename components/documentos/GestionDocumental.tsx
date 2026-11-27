"use client";

// =====================================================================
// Pantalla GESTIÓN DOCUMENTARIA (/documentos). Sistema auditado: nada se borra, nada se modifica sin
// huella; todo tiene dueño, versión, aprobación y trazabilidad. Toda la lógica de permisos y auditoría
// vive en la base (SQL 20261204) y en la Edge Function gestion-documental; esta pantalla solo la usa.
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, FileSearch, FileStack, Filter, Lock, Plus, RefreshCw, Route, Search, ShieldAlert } from "lucide-react";
import { toast } from "@/components/ui";
import { nombreDe, useSesion } from "@/lib/auth";
import {
  CATEGORIAS_GD,
  ESTADOS_GD,
  MODULOS_GD,
  esGerenciaGD,
  et,
  fechaCorta,
  listarDocumentos,
  misPendientes,
  modulosParaSubir,
  rolGD,
  type DocumentoGD,
  type PendienteGD,
} from "@/lib/gestionDocumental";
import { SubirDocumento } from "./Formularios";
import { HistoriaProcesos } from "./HistoriaProcesos";
import { PanelDocumento } from "./PanelDocumento";
import { QuienDescargo, Reportes } from "./PanelGerencia";
import { Boton, ChipEstado, FondoOndas, Tarjeta, Vacio, claseInput, cx } from "./piezas";

type Vista = "documentos" | "historia" | "descargas" | "reportes";

export function GestionDocumental() {
  const { sesion } = useSesion();
  const rol = sesion?.rol ?? "";
  const r = rolGD(rol);
  const usuario = sesion ? nombreDe(sesion) : "";
  const gerencia = esGerenciaGD(r);

  const [vista, setVista] = useState<Vista>("documentos");
  const [docs, setDocs] = useState<DocumentoGD[] | null>(null);
  const [error, setError] = useState("");
  const [pendientes, setPendientes] = useState<PendienteGD[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null); // id
  const [subir, setSubir] = useState(false);
  /** Código del proceso al que se adjunta el documento (desde la Trazabilidad de procesos). */
  const [subirRef, setSubirRef] = useState<string | undefined>(undefined);
  const [proceso, setProceso] = useState<string | undefined>(undefined);
  const [q, setQ] = useState("");
  const [verFiltros, setVerFiltros] = useState(false);
  const [f, setF] = useState({ modulo: "", estado: "", categoria: "", desde: "", hasta: "", archivados: false });

  const cargar = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([listarDocumentos(), misPendientes()]);
      setDocs(l);
      setPendientes(p);
      setError("");
      return l;
    } catch (e) {
      setError((e as Error).message);
      setDocs([]);
      return [];
    }
  }, []);

  useEffect(() => {
    if (!sesion) return;
    void cargar().then((l) => {
      // Enlace de la campana: /documentos?doc=POL-0008
      const qs = new URLSearchParams(window.location.search);
      const cod = qs.get("doc");
      const d = cod && l.find((x) => x.codigo_unico === cod.toUpperCase());
      if (d) setAbierto(d.id);
      // Historia de un proceso: /documentos?proceso=REQ-ALM-001
      const pr = qs.get("proceso");
      if (pr) {
        setProceso(pr.toUpperCase());
        setVista("historia");
      }
    });
    // Barra estática de pendientes: se refresca cada minuto
    const t = setInterval(() => void misPendientes().then(setPendientes), 60_000);
    return () => clearInterval(t);
  }, [sesion, cargar]);

  // "ver historia" desde la ficha de un documento (Código en otro módulo)
  useEffect(() => {
    const ir = (e: Event) => {
      const c = String((e as CustomEvent<string>).detail ?? "").trim().toUpperCase();
      if (!c) return;
      setAbierto(null);
      setProceso(c);
      setVista("historia");
    };
    window.addEventListener("gd:proceso", ir);
    return () => window.removeEventListener("gd:proceso", ir);
  }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toUpperCase();
    return (docs ?? []).filter((d) => {
      if (d.estado === "Archivado" && !f.archivados && f.estado !== "Archivado") return false;
      if (f.modulo && d.modulo !== f.modulo) return false;
      if (f.estado && d.estado !== f.estado) return false;
      if (f.categoria && d.categoria !== f.categoria) return false;
      const dia = d.fecha_creacion.slice(0, 10);
      if (f.desde && dia < f.desde) return false;
      if (f.hasta && dia > f.hasta) return false;
      if (!t) return true;
      // Buscador: código, nombre, fecha, dueño y código del otro módulo
      return [d.codigo_unico, d.nombre, d.dueno_nombre ?? "", fechaCorta(d.fecha_creacion), d.referencia_externa ?? "", d.archivo_nombre ?? ""].join(" ").toUpperCase().includes(t);
    });
  }, [docs, q, f]);

  const doc = docs?.find((d) => d.id === abierto) ?? null;
  const puedeSubir = modulosParaSubir(r).length > 0;
  const nFiltros = [f.modulo, f.estado, f.categoria, f.desde, f.hasta, f.archivados].filter(Boolean).length;
  const alertas = (docs ?? []).filter((d) => d.integridad === "ALERTA").length;

  if (!sesion) return null;
  if (!r)
    return (
      <Tarjeta className="mx-auto mt-10 max-w-md p-6 text-center text-[13px] text-tema-texto">
        Su rol ({rol}) no está habilitado en Gestión Documentaria.
      </Tarjeta>
    );

  return (
    <div className="relative isolate -mx-1 min-h-[70vh] rounded-2xl px-2 pb-8 pt-2 sm:px-4">
      <FondoOndas />

      {/* Header #11212D */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl !bg-tema-fuerte px-4 py-3.5 !text-white shadow-lg sm:px-5">
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold tracking-wide sm:text-[20px]">
            COMBOY VID <span className="text-white/45">|</span> Gestión Documentaria
          </h1>
          <p className="text-[12px] text-white/65">Sistema auditado: nada se borra, nada cambia sin huella. Cada acción queda registrada con usuario, fecha, hora e IP.</p>
        </div>
        {puedeSubir && (
          <Boton
            tono="critico"
            onClick={() => {
              setSubirRef(undefined);
              setSubir(true);
            }}
            className="shadow-md"
          >
            <Plus size={16} /> Subir documento
          </Boton>
        )}
      </header>

      {/* Barra estática: documentos que esperan MI aprobación */}
      {pendientes.length > 0 && (
        <div className="sticky top-0 z-20 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl !bg-tema-acento px-4 py-2.5 text-[13px] !text-white shadow-md">
          <span className="flex items-center gap-1.5 font-semibold">
            <BellRing size={16} /> {pendientes.length} documento(s) esperan su aprobación:
          </span>
          {pendientes.slice(0, 6).map((p) => (
            <button key={p.id + p.version} onClick={() => setAbierto(p.id)} className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-semibold hover:bg-white/25">
              {p.codigo_unico} {p.version}
            </button>
          ))}
          {pendientes.length > 6 && <span className="text-[12px] text-white/80">y {pendientes.length - 6} más</span>}
        </div>
      )}
      {alertas > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-tema-acento bg-white px-4 py-2 text-[13px] font-semibold text-tema-tinta">
          <ShieldAlert size={16} /> {alertas} documento(s) con ALERTA DE INTEGRIDAD: el archivo guardado no coincide con su hash.
        </div>
      )}

      {/* Vistas: todos ven Documentos e Trazabilidad de procesos; Gerencia / SOPORTE además auditoría y reportes */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            ["documentos", "Documentos", FileStack],
            ["historia", "Trazabilidad de procesos", Route],
            ...(gerencia
              ? ([
                  ["descargas", "¿Quién descargó qué?", FileSearch],
                  ["reportes", "Reportes", AlertTriangle],
                ] as const)
              : []),
          ] as const
        ).map(([id, label, Icono]) => (
          <button
            key={id}
            onClick={() => setVista(id)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition",
              vista === id ? "!bg-tema-sec !text-white" : "bg-white/80 text-tema-texto hover:bg-white"
            )}
          >
            <Icono size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {vista === "historia" ? (
          <HistoriaProcesos
            docsGD={docs ?? []}
            usuario={usuario}
            codigoInicial={proceso}
            puedeSubir={puedeSubir}
            onAbrirDocumento={setAbierto}
            onAdjuntar={(codigo) => {
              setSubirRef(codigo);
              setSubir(true);
            }}
          />
        ) : vista === "descargas" && gerencia ? (
          <QuienDescargo usuario={usuario} />
        ) : vista === "reportes" && gerencia ? (
          <Reportes usuario={usuario} />
        ) : (
          <div className="space-y-3">
            {/* Buscador + filtros (plegados, como el resto del ERP) */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 basis-60">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tema-texto/50" />
                <input className={cx(claseInput, "pl-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, nombre, fecha o dueño" aria-label="Buscar documentos" />
              </div>
              <Boton onClick={() => setVerFiltros((v) => !v)} className={nFiltros ? "border-tema-sec text-tema-sec" : ""}>
                <Filter size={15} /> Filtros{nFiltros ? ` (${nFiltros})` : ""}
              </Boton>
              <Boton onClick={() => void cargar().then(() => toast("Lista actualizada."))} aria-label="Actualizar">
                <RefreshCw size={15} />
              </Boton>
            </div>
            {verFiltros && (
              <Tarjeta className="grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
                <select className={claseInput} value={f.modulo} onChange={(e) => setF({ ...f, modulo: e.target.value })} aria-label="Módulo">
                  <option value="">Todos los módulos</option>
                  {MODULOS_GD.map((m) => (
                    <option key={m} value={m}>
                      {et(m)}
                    </option>
                  ))}
                </select>
                <select className={claseInput} value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })} aria-label="Estado">
                  <option value="">Todos los estados</option>
                  {ESTADOS_GD.filter((e) => e !== "Archivado" || gerencia).map((e) => (
                    <option key={e} value={e}>
                      {et(e)}
                    </option>
                  ))}
                </select>
                <select className={claseInput} value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} aria-label="Categoría">
                  <option value="">Todas las categorías</option>
                  {CATEGORIAS_GD.map((c) => (
                    <option key={c} value={c}>
                      {et(c)}
                    </option>
                  ))}
                </select>
                <input type="date" className={claseInput} value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} aria-label="Desde" title="Creado desde" />
                <input type="date" className={claseInput} value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} aria-label="Hasta" title="Creado hasta" />
                {gerencia ? (
                  <label className="flex items-center gap-2 text-[13px] text-tema-texto">
                    <input type="checkbox" className="accent-tema-fuerte" checked={f.archivados} onChange={(e) => setF({ ...f, archivados: e.target.checked })} /> Ver archivados
                  </label>
                ) : (
                  <span />
                )}
              </Tarjeta>
            )}

            {error ? (
              <Tarjeta className="p-5 text-[13px] font-semibold text-tema-tinta">{error}</Tarjeta>
            ) : !docs ? (
              <Tarjeta>
                <Vacio texto="Cargando documentos…" />
              </Tarjeta>
            ) : (
              <Tarjeta className="overflow-hidden">
                {filtrados.length === 0 ? (
                  <Vacio texto={docs.length === 0 ? "Todavía no tiene documentos visibles. Solo ve los documentos propios o con permiso explícito." : "Ningún documento coincide con la búsqueda."} />
                ) : (
                  <>
                    {/* PC: tabla */}
                    <table className="tabla-fija hidden w-full table-fixed text-[13px] md:table">
                      <thead className="[&_th]:!text-white !bg-tema-fuerte text-left text-[11px] uppercase tracking-wider !text-white">
                        <tr>
                          <th className="w-[110px] px-3 py-2.5">Código</th>
                          <th className="px-3 py-2.5">Nombre</th>
                          <th className="w-[105px] px-3 py-2.5">Módulo</th>
                          <th className="w-[72px] px-3 py-2.5">Versión</th>
                          <th className="w-[124px] px-3 py-2.5">Estado</th>
                          <th className="w-[150px] px-3 py-2.5">Dueño</th>
                          <th className="w-[96px] px-3 py-2.5">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtrados.map((d) => (
                          <tr
                            key={d.id}
                            onClick={() => setAbierto(d.id)}
                            className={cx("cursor-pointer border-t border-tema-texto/10 text-tema-texto transition hover:bg-tema-borde/35", abierto === d.id && "bg-tema-borde/50")}
                          >
                            <td className="px-3 py-2.5 font-semibold">
                              {d.codigo_unico}
                              {d.es_confidencial && <Lock size={12} className="ml-1 inline text-tema-tinta" aria-label="Confidencial" />}
                              {d.integridad === "ALERTA" && <ShieldAlert size={12} className="ml-1 inline text-tema-tinta" aria-label="Alerta de integridad" />}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="block truncate" title={d.nombre}>
                                {d.nombre}
                              </span>
                              {(d.referencia_externa || d.categoria) && (
                                <span className="block truncate text-[11px] text-tema-texto/55">
                                  {et(d.categoria)}
                                  {d.referencia_externa && ` · ${d.referencia_externa}`}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">{et(d.modulo)}</td>
                            <td className="px-3 py-2.5">{d.version_actual}</td>
                            <td className="px-3 py-2.5">
                              <ChipEstado estado={d.estado} />
                            </td>
                            <td className="truncate px-3 py-2.5">{d.dueno_nombre}</td>
                            <td className="px-3 py-2.5">{fechaCorta(d.fecha_creacion)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Celular: tarjetas, sin desplazamiento horizontal */}
                    <ul className="divide-y divide-tema-texto/10 md:hidden">
                      {filtrados.map((d) => (
                        <li key={d.id}>
                          <button onClick={() => setAbierto(d.id)} className="block w-full px-3 py-2.5 text-left text-tema-texto">
                            <span className="flex items-center justify-between gap-2">
                              <b className="text-[13px]">
                                {d.codigo_unico} · {d.version_actual}
                                {d.es_confidencial && <Lock size={11} className="ml-1 inline text-tema-tinta" />}
                              </b>
                              <ChipEstado estado={d.estado} />
                            </span>
                            <span className="mt-0.5 block break-words text-[13px]">{d.nombre}</span>
                            <span className="block text-[11px] text-tema-texto/60">
                              {et(d.modulo)} · {d.dueno_nombre} · {fechaCorta(d.fecha_creacion)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Tarjeta>
            )}
            <p className="text-[11px] text-tema-texto/60">
              {filtrados.length} de {docs?.length ?? 0} documento(s) visibles para su rol ({et(r)}). Solo se listan los propios y los que tienen permiso explícito.
            </p>
          </div>
        )}
      </div>

      {doc && <PanelDocumento doc={doc} rol={rol} usuario={usuario} onCerrar={() => setAbierto(null)} onCambio={() => void cargar()} />}
      <SubirDocumento
        abierta={subir}
        rol={rol}
        referencia={subirRef}
        onCerrar={() => setSubir(false)}
        onListo={async (codigo) => {
          setSubir(false);
          toast(`${codigo} v1.0 registrado. Hash SHA-256 guardado y auditoría creada.`);
          const l = await cargar();
          const d = l.find((x) => x.codigo_unico === codigo);
          if (d) setAbierto(d.id);
        }}
      />
    </div>
  );
}
