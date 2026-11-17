"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Download,
  Eye,
  FileClock,
  Fingerprint,
  History,
  Link2,
  Loader2,
  Lock,
  Send,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "@/components/ui";
import {
  ACCION_CRITICA,
  ACCION_TEXTO,
  PERMISOS_GD,
  ROLES_GD,
  archivar,
  aprobar,
  auditoriaDocumento,
  cambiarPermiso,
  descargarArchivo,
  detalleDocumento,
  enviarRevision,
  et,
  fechaCorta,
  fechaHora,
  pesoArchivo,
  rechazar,
  registrarVistaFicha,
  restaurarArchivo,
  restaurarVersion,
  rolGD,
  valorTexto,
  verificarIntegridad,
  type AuditoriaGD,
  type DetalleGD,
  type DocumentoGD,
  type PermisoGD,
  type RolGD,
} from "@/lib/gestionDocumental";
import { ConfirmarDescarga, NuevaVersion, PedirMotivo } from "./Formularios";
import { Boton, ChipEstado, Vacio, claseInput, cx } from "./piezas";
import { VistaPrevia } from "./VistaPrevia";

type Pestana = "detalle" | "historial" | "permisos" | "auditoria";

export function PanelDocumento({ doc, rol, usuario, onCerrar, onCambio }: { doc: DocumentoGD; rol: string; usuario: string; onCerrar: () => void; onCambio: () => void }) {
  const [pestana, setPestana] = useState<Pestana>("detalle");
  const [det, setDet] = useState<DetalleGD | null>(null);
  const [cargando, setCargando] = useState(true);
  const [verPrevia, setVerPrevia] = useState<string | null>(null); // versión en vista previa
  const [modal, setModal] = useState<null | "rechazar" | "archivar" | "restaurar-archivo" | "version" | { restaurar: string } | { descargar: string }>(null);
  const [ocupado, setOcupado] = useState(false);
  const r = rolGD(rol);
  const gerencia = r === "Gerencia" || r === "Soporte";

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDet(await detalleDocumento(doc.id));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  }, [doc.id]);

  useEffect(() => {
    setPestana("detalle");
    setVerPrevia(null);
    void cargar();
    // AUDITORÍA: abrir la ficha queda registrado como VER
    void registrarVistaFicha(doc.id, doc.codigo_unico).catch(() => undefined);
  }, [doc.id, doc.codigo_unico, cargar]);

  const recargar = async () => {
    await cargar();
    onCambio();
  };
  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await fn();
      toast(ok);
      setModal(null);
      await recargar();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };

  const nivel = det?.nivel ?? doc.nivel;
  const archivado = doc.estado === "Archivado";
  const puedeDescargar = nivel >= 2;
  const puedeEditar = nivel >= 3 && !archivado;
  const puedeAuditar = nivel >= 5 || gerencia;

  const descargar = async (version: string, confirmaciones: number) => {
    try {
      const a = await descargarArchivo(doc.id, version, confirmaciones);
      toast(`Descargado ${doc.codigo_unico} ${a.version}${a.marca === "si" ? " con marca de agua" : ""}. Quedó registrado.`);
      setModal(null);
      if (a.integridad === "ALERTA") toast("ALERTA DE INTEGRIDAD: el archivo no coincide con su hash. Se avisó a Gerencia.", "error");
      onCambio();
    } catch (e) {
      const ex = e as Error & { extra?: { confirmar?: boolean } };
      if (ex.extra?.confirmar) setModal({ descargar: version });
      else toast(ex.message, "error");
    }
  };
  const pedirDescarga = (version: string) => (doc.es_confidencial ? setModal({ descargar: version }) : void descargar(version, 0));

  // Portal al body: por encima de la cabecera y del chat del ERP
  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end bg-[#11212D]/40" onMouseDown={onCerrar}>
      <aside
        className="flex h-full w-full flex-col bg-white shadow-2xl sm:w-[min(680px,100vw)]"
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={`Documento ${doc.codigo_unico}`}
      >
        {/* Cabecera del panel */}
        <div className="!bg-[#11212D] px-4 py-3 !text-white sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold tracking-wider text-white/70">
                {doc.codigo_unico} · {doc.version_actual} {doc.es_confidencial && <span className="inline-flex items-center gap-1 rounded !bg-[#800021] px-1.5 py-0.5 text-[10px] !text-white"><Lock size={10} /> CONFIDENCIAL</span>}
              </p>
              <h2 className="mt-0.5 break-words text-[16px] font-semibold leading-snug">{doc.nombre}</h2>
            </div>
            <button onClick={onCerrar} className="shrink-0 rounded-md p-1 text-white/80 hover:bg-white/10" aria-label="Cerrar panel">
              <X size={20} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-0.5 py-0.5">
              <ChipEstado estado={doc.estado} />
            </span>
            {doc.integridad === "ALERTA" && (
              <span className="inline-flex items-center gap-1 rounded-full !bg-[#800021] px-2.5 py-0.5 text-[11px] font-bold !text-white">
                <ShieldAlert size={12} /> ALERTA DE INTEGRIDAD
              </span>
            )}
            <span className="text-[11px] text-white/70">Su permiso: {nivel >= 5 ? "Control Total" : et(PERMISOS_GD[nivel])}</span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap gap-2 border-b border-[#11212D]/10 px-4 py-2.5 sm:px-5">
          {det?.puede_resolver && (
            <>
              <Boton tono="secundario" disabled={ocupado} onClick={() => accion(() => aprobar(doc.id), `${doc.codigo_unico} aprobado (paso ${det.paso_pendiente?.paso}).`)}>
                <CheckCircle2 size={15} /> Aprobar
              </Boton>
              <Boton tono="critico" disabled={ocupado} onClick={() => setModal("rechazar")}>
                <XCircle size={15} /> Rechazar
              </Boton>
            </>
          )}
          {puedeDescargar && (
            <Boton onClick={() => pedirDescarga(doc.version_actual)}>
              <Download size={15} /> Descargar
            </Boton>
          )}
          {puedeEditar && (
            <Boton onClick={() => setModal("version")}>
              <Upload size={15} /> Nueva versión
            </Boton>
          )}
          {puedeEditar && doc.estado === "Borrador" && (
            <Boton tono="neutro" disabled={ocupado} onClick={() => accion(() => enviarRevision(doc.id, ["Gerencia"]), "Enviado a revisión de Gerencia.")}>
              <Send size={15} /> Enviar a revisión
            </Boton>
          )}
          {puedeAuditar && (
            <Boton
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                try {
                  const v = await verificarIntegridad(doc.id);
                  toast(v.ok ? `Integridad correcta en ${v.versiones.length} versión(es).` : `ALERTA: ${v.versiones.filter((x) => !x.ok).map((x) => x.version).join(", ")} no coincide(n) con su hash.`, v.ok ? "ok" : "error");
                  await recargar();
                } catch (e) {
                  toast((e as Error).message, "error");
                } finally {
                  setOcupado(false);
                }
              }}
            >
              <Fingerprint size={15} /> Verificar integridad
            </Boton>
          )}
          {!archivado && (nivel >= 5 || r === "Gerencia") && (
            <Boton className="border-[#800021]/40 text-[#800021]" onClick={() => setModal("archivar")}>
              <Archive size={15} /> Eliminar (archivar)
            </Boton>
          )}
          {archivado && gerencia && (
            <Boton tono="secundario" onClick={() => setModal("restaurar-archivo")}>
              <ArchiveRestore size={15} /> Restaurar del archivo
            </Boton>
          )}
          {det && !det.puede_resolver && det.paso_pendiente && (
            <span className="self-center text-[12px] text-[#800021]">Esperando aprobación de {et(det.paso_pendiente.aprobador_rol)} (paso {det.paso_pendiente.paso})</span>
          )}
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 overflow-x-auto border-b border-[#11212D]/10 px-2 sm:px-4" role="tablist">
          {(
            [
              ["detalle", "Detalle", Eye],
              ["historial", "Historial y Versiones", History],
              ["permisos", "Permisos de acceso", Users],
              ...(puedeAuditar ? ([["auditoria", "Auditoría", FileClock]] as const) : []),
            ] as const
          ).map(([id, label, Icono]) => (
            <button
              key={id}
              role="tab"
              aria-selected={pestana === id}
              onClick={() => setPestana(id)}
              className={cx(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold",
                pestana === id ? "border-[#800021] text-[#11212D]" : "border-transparent text-[#11212D]/55 hover:text-[#11212D]"
              )}
            >
              <Icono size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
          {cargando && !det ? (
            <p className="flex items-center gap-2 text-[13px] text-[#11212D]/70">
              <Loader2 size={15} className="animate-spin" /> Cargando…
            </p>
          ) : !det ? (
            <Vacio texto="No tiene acceso a este documento." />
          ) : pestana === "detalle" ? (
            <Detalle doc={doc} usuario={usuario} versionPrevia={verPrevia ?? doc.version_actual} />
          ) : pestana === "historial" ? (
            <Historial
              det={det}
              versionActual={doc.version_actual}
              puedeDescargar={puedeDescargar}
              puedeEditar={puedeEditar}
              onVer={(v) => {
                setVerPrevia(v);
                setPestana("detalle");
              }}
              onDescargar={pedirDescarga}
              onRestaurar={(v) => setModal({ restaurar: v })}
            />
          ) : pestana === "permisos" ? (
            <Permisos det={det} doc={doc} editable={nivel >= 5 && !archivado} onCambio={recargar} />
          ) : (
            <Auditoria docId={doc.id} />
          )}
        </div>
      </aside>

      <PedirMotivo
        abierta={modal === "rechazar"}
        titulo={`Rechazar ${doc.codigo_unico}`}
        texto="El comentario es obligatorio y le llega al dueño. Queda en la auditoría con su nombre, fecha, hora e IP."
        etiqueta="Motivo del rechazo"
        boton="Rechazar"
        tono="critico"
        onCerrar={() => setModal(null)}
        onConfirmar={(m) => accion(() => rechazar(doc.id, m), `${doc.codigo_unico} rechazado.`)}
      />
      <PedirMotivo
        abierta={modal === "archivar"}
        titulo={`Eliminar ${doc.codigo_unico}`}
        texto="No se borra nada: el documento pasa a Archivado, visible solo para Gerencia. El archivo, sus versiones y su historial se conservan."
        etiqueta="Motivo (obligatorio)"
        boton="Archivar"
        tono="critico"
        onCerrar={() => setModal(null)}
        onConfirmar={async (m) => {
          await accion(() => archivar(doc.id, m), `${doc.codigo_unico} archivado.`);
          if (r !== "Gerencia" && r !== "Soporte") onCerrar();
        }}
      />
      <PedirMotivo
        abierta={modal === "restaurar-archivo"}
        titulo={`Restaurar ${doc.codigo_unico}`}
        texto="El documento vuelve a estar visible para quienes tienen permiso."
        etiqueta="Motivo (obligatorio)"
        boton="Restaurar"
        tono="secundario"
        onCerrar={() => setModal(null)}
        onConfirmar={(m) => accion(() => restaurarArchivo(doc.id, m), `${doc.codigo_unico} restaurado.`)}
      />
      {modal && typeof modal === "object" && "restaurar" in modal && (
        <PedirMotivo
          abierta
          titulo={`Restaurar ${modal.restaurar} de ${doc.codigo_unico}`}
          texto={`Se crea una versión NUEVA con el archivo de ${modal.restaurar}. Ninguna versión se borra ni se reescribe. Vuelve a revisión.`}
          etiqueta="Motivo (obligatorio)"
          boton="Restaurar versión"
          tono="secundario"
          onCerrar={() => setModal(null)}
          onConfirmar={(m) => accion(() => restaurarVersion(doc.id, modal.restaurar, m), `Versión ${modal.restaurar} restaurada como versión nueva.`)}
        />
      )}
      {modal && typeof modal === "object" && "descargar" in modal && (
        <ConfirmarDescarga abierta codigo={doc.codigo_unico} version={modal.descargar} onCerrar={() => setModal(null)} onConfirmar={() => descargar(modal.descargar, 2)} />
      )}
      <NuevaVersion
        abierta={modal === "version"}
        docId={doc.id}
        codigo={doc.codigo_unico}
        versionActual={doc.version_actual}
        onCerrar={() => setModal(null)}
        onListo={async (v) => {
          toast(`${doc.codigo_unico} ${v} subida. Va a revisión.`);
          setModal(null);
          await recargar();
        }}
      />
    </div>,
    document.body
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#11212D]/55">{label}</p>
      <div className="break-words text-[13px] text-[#11212D]">{children || "—"}</div>
    </div>
  );
}

function Detalle({ doc, usuario, versionPrevia }: { doc: DocumentoGD; usuario: string; versionPrevia: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Dato label="Código">{doc.codigo_unico}</Dato>
        <Dato label="Versión actual">{doc.version_actual}</Dato>
        <Dato label="Módulo">{et(doc.modulo)}</Dato>
        <Dato label="Categoría">{et(doc.categoria)}</Dato>
        <Dato label="Dueño">{doc.dueno_nombre}</Dato>
        <Dato label="Sede">{doc.sede === "SECOCHA" ? "Secocha" : "Arequipa"}</Dato>
        <Dato label="Creado">{fechaHora(doc.fecha_creacion)}</Dato>
        <Dato label="Vence">{fechaCorta(doc.fecha_vencimiento)}</Dato>
        <Dato label="Archivo">
          {doc.archivo_nombre} · {pesoArchivo(doc.archivo_bytes)}
        </Dato>
        {doc.referencia_externa && (
          <Dato label="Código en otro módulo">
            <button
              type="button"
              title="Ver la historia clínica del proceso"
              onClick={() => window.dispatchEvent(new CustomEvent("gd:proceso", { detail: doc.referencia_externa }))}
              className="inline-flex items-center gap-1 text-left font-semibold text-[#294D61] underline-offset-2 hover:underline"
            >
              <Link2 size={13} /> {doc.referencia_externa} · ver historia
            </button>
          </Dato>
        )}
        {doc.motivo_archivo && <Dato label="Motivo de archivo">{doc.motivo_archivo}</Dato>}
      </div>
      {doc.descripcion && <p className="whitespace-pre-wrap rounded-lg bg-[#CCD0CF]/30 px-3 py-2 text-[13px] text-[#11212D]">{doc.descripcion}</p>}
      <div className="rounded-lg border border-[#11212D]/10 px-3 py-2">
        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#11212D]/55">
          <Fingerprint size={12} /> Hash SHA-256 ({doc.version_actual})
        </p>
        <p className="break-all font-mono text-[11px] text-[#11212D]">{doc.hash_sha256}</p>
        <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: doc.integridad === "ALERTA" ? "#800021" : "#294D61" }}>
          {doc.integridad === "ALERTA" ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
          {doc.integridad === "OK" ? "Integridad verificada" : doc.integridad === "ALERTA" ? "El archivo no coincide con su hash" : "Se verifica cada vez que se abre o descarga"}
        </p>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#11212D]/75">
          Vista previa {versionPrevia !== doc.version_actual && `· ${versionPrevia}`} (sin descarga)
        </p>
        <VistaPrevia key={versionPrevia} docId={doc.id} version={versionPrevia} usuario={usuario} />
      </div>
    </div>
  );
}

function Historial({
  det,
  versionActual,
  puedeDescargar,
  puedeEditar,
  onVer,
  onDescargar,
  onRestaurar,
}: {
  det: DetalleGD;
  versionActual: string;
  puedeDescargar: boolean;
  puedeEditar: boolean;
  onVer: (v: string) => void;
  onDescargar: (v: string) => void;
  onRestaurar: (v: string) => void;
}) {
  const versiones = [...det.versiones].reverse();
  return (
    <div className="space-y-5">
      <p className="flex flex-wrap items-center gap-1 text-[12px] font-semibold text-[#11212D]">
        {det.versiones.map((v, i) => (
          <span key={v.version} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-[#11212D]/40">→</span>}
            <span className={cx("rounded px-1.5 py-0.5", v.version === versionActual ? "!bg-[#294D61] !text-white" : "bg-[#CCD0CF]/60")}>{v.version}</span>
          </span>
        ))}
      </p>
      <ol className="relative space-y-4 border-l-2 border-[#294D61]/30 pl-5">
        {versiones.map((v) => {
          const ronda = det.flujo.filter((f) => f.version === v.version);
          return (
            <li key={v.version} className="relative">
              <span className={cx("absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white", v.version === versionActual ? "!bg-[#294D61]" : "!bg-[#11212D]/40")} />
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[14px] text-[#11212D]">{v.version}</b>
                {v.version === versionActual && <span className="rounded !bg-[#294D61] px-1.5 text-[10px] font-bold uppercase !text-white">actual</span>}
                <span className="text-[12px] text-[#11212D]/70">
                  {fechaHora(v.fecha)} · {v.cambiado_por}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-[#11212D]">{v.motivo_cambio}</p>
              <p className="mt-0.5 break-all font-mono text-[10px] text-[#11212D]/60">
                SHA-256 {v.hash_sha256} · {v.archivo_nombre} · {pesoArchivo(v.archivo_bytes)}
              </p>
              {ronda.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {ronda.map((f) => (
                    <li key={f.paso} className="text-[12px]" style={{ color: f.estado === "Aprobado" ? "#294D61" : f.estado === "Rechazado" || f.estado === "Pendiente" ? "#800021" : "#11212D" }}>
                      Paso {f.paso} · {et(f.aprobador_rol)}: <b>{f.estado}</b>
                      {f.aprobador && ` por ${f.aprobador}`}
                      {f.fecha_aprobacion && ` · ${fechaHora(f.fecha_aprobacion)}`}
                      {f.comentario && ` · "${f.comentario}"`}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Boton className="px-2.5 py-1 text-[12px]" onClick={() => onVer(v.version)}>
                  <Eye size={13} /> Ver
                </Boton>
                {puedeDescargar && (
                  <Boton className="px-2.5 py-1 text-[12px]" onClick={() => onDescargar(v.version)}>
                    <Download size={13} /> Descargar
                  </Boton>
                )}
                {puedeEditar && v.version !== versionActual && (
                  <Boton className="px-2.5 py-1 text-[12px]" onClick={() => onRestaurar(v.version)}>
                    <History size={13} /> Restaurar esta versión
                  </Boton>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Permisos({ det, doc, editable, onCambio }: { det: DetalleGD; doc: DocumentoGD; editable: boolean; onCambio: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const actual = (rol: RolGD): PermisoGD => det.permisos.find((p) => p.rol === rol)?.permiso ?? "Sin Acceso";
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[#11212D]/70">
        Por defecto nadie ve nada. Además de estos roles: el dueño ({doc.dueno_nombre}) tiene Control Total y SOPORTE administra. Archivado = solo Gerencia.
        {editable ? " Cada cambio queda en la auditoría con el permiso anterior y el nuevo." : " Solo quien tiene Control Total cambia permisos."}
      </p>
      <div className="overflow-hidden rounded-lg border border-[#11212D]/10">
        <table className="w-full text-[13px]">
          <thead className="[&_th]:!text-white !bg-[#11212D] text-left text-[11px] uppercase tracking-wider !text-white">
            <tr>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Permiso</th>
              <th className="hidden px-3 py-2 sm:table-cell">Ve</th>
              <th className="hidden px-3 py-2 sm:table-cell">Descarga</th>
            </tr>
          </thead>
          <tbody>
            {ROLES_GD.map((rol) => {
              const p = actual(rol);
              const n = PERMISOS_GD.indexOf(p);
              return (
                <tr key={rol} className="border-t border-[#11212D]/10">
                  <td className="px-3 py-2 font-semibold text-[#11212D]">{et(rol)}</td>
                  <td className="px-3 py-1.5">
                    {editable ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          className={cx(claseInput, "w-auto py-1 text-[12px]", n > 0 && "border-[#294D61] font-semibold text-[#294D61]")}
                          value={p}
                          disabled={ocupado === rol}
                          onChange={async (e) => {
                            setOcupado(rol);
                            try {
                              await cambiarPermiso(doc.id, rol, e.target.value as PermisoGD);
                              toast(`${et(rol)}: ${et(p)} → ${et(e.target.value)}`);
                              await onCambio();
                            } catch (er) {
                              toast((er as Error).message, "error");
                            } finally {
                              setOcupado(null);
                            }
                          }}
                        >
                          {PERMISOS_GD.map((x) => (
                            <option key={x} value={x}>
                              {et(x)}
                            </option>
                          ))}
                        </select>
                        {ocupado === rol && <Loader2 size={14} className="animate-spin text-[#294D61]" />}
                      </div>
                    ) : (
                      <span className={n > 0 ? "font-semibold text-[#294D61]" : "text-[#11212D]/50"}>{et(p)}</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 sm:table-cell">{n >= 1 ? "Sí" : "No"}</td>
                  <td className="hidden px-3 py-2 sm:table-cell">{n >= 2 ? "Sí" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Auditoria({ docId }: { docId: string }) {
  const [filas, setFilas] = useState<AuditoriaGD[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    auditoriaDocumento(docId).then(setFilas, (e) => setError((e as Error).message));
  }, [docId]);
  if (error) return <p className="text-[13px] font-semibold text-[#800021]">{error}</p>;
  if (!filas)
    return (
      <p className="flex items-center gap-2 text-[13px] text-[#11212D]/70">
        <Loader2 size={15} className="animate-spin" /> Cargando auditoría…
      </p>
    );
  return <TablaAuditoria filas={filas} sinDocumento />;
}

/** Tabla de audit_log: en celular cada fila es una tarjeta (sin desplazamiento horizontal). */
export function TablaAuditoria({ filas, sinDocumento }: { filas: AuditoriaGD[]; sinDocumento?: boolean }) {
  if (filas.length === 0) return <Vacio texto="Sin registros." />;
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-[#11212D]/10 md:block">
        <table className="tabla-fija w-full table-fixed text-[12px]">
          <thead className="[&_th]:!text-white !bg-[#11212D] text-left text-[10px] uppercase tracking-wider !text-white">
            <tr>
              <th className="w-12 px-2 py-2">N°</th>
              <th className="w-[118px] px-2 py-2">Fecha y hora</th>
              <th className="w-[120px] px-2 py-2">Usuario</th>
              <th className="w-[120px] px-2 py-2">Acción</th>
              {!sinDocumento && <th className="w-[110px] px-2 py-2">Documento</th>}
              <th className="px-2 py-2">Detalle · antes → después</th>
              <th className="w-[110px] px-2 py-2">IP / dispositivo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((a) => (
              <tr key={a.id} className="border-t border-[#11212D]/10 align-top text-[#11212D]">
                <td className="px-2 py-1.5 text-[#11212D]/60">{a.secuencia}</td>
                <td className="px-2 py-1.5">{fechaHora(a.fecha_hora)}</td>
                <td className="break-words px-2 py-1.5">{a.usuario_nombre}</td>
                <td className={cx("break-words px-2 py-1.5 font-semibold", ACCION_CRITICA.has(a.accion) ? "text-[#800021]" : "text-[#294D61]")}>{ACCION_TEXTO[a.accion] ?? a.accion}</td>
                {!sinDocumento && (
                  <td className="break-words px-2 py-1.5">
                    {a.codigo_documento ?? "—"} {a.version}
                    {a.confidencial && <Lock size={11} className="ml-1 inline text-[#800021]" />}
                  </td>
                )}
                <td className="break-words px-2 py-1.5">
                  {a.detalle}
                  {(a.valor_anterior != null || a.valor_nuevo != null) && (
                    <span className="mt-0.5 block text-[11px] text-[#11212D]/60">
                      {valorTexto(a.valor_anterior) || "—"} → {valorTexto(a.valor_nuevo) || "—"}
                    </span>
                  )}
                </td>
                <td className="break-words px-2 py-1.5 text-[11px] text-[#11212D]/70" title={a.dispositivo ?? ""}>
                  {a.ip ?? "—"}
                  <span className="block truncate">{(a.dispositivo ?? "").split(" · ").slice(0, 2).join(" · ")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {filas.map((a) => (
          <li key={a.id} className="rounded-lg border border-[#11212D]/10 bg-white px-3 py-2 text-[12px] text-[#11212D]">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <b className={ACCION_CRITICA.has(a.accion) ? "text-[#800021]" : "text-[#294D61]"}>{ACCION_TEXTO[a.accion] ?? a.accion}</b>
              <span className="text-[#11212D]/60">
                N° {a.secuencia} · {fechaHora(a.fecha_hora)}
              </span>
            </div>
            <p>
              {a.usuario_nombre}
              {!sinDocumento && a.codigo_documento && ` · ${a.codigo_documento} ${a.version ?? ""}`} · IP {a.ip ?? "—"}
            </p>
            {a.detalle && <p className="break-words text-[#11212D]/80">{a.detalle}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
