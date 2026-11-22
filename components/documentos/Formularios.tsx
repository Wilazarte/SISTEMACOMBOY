"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Fingerprint, Loader2, Lock, Plus, Trash2, Upload } from "lucide-react";
import {
  CATEGORIAS_GD,
  PERMISOS_GD,
  PREFIJO,
  ROLES_GD,
  et,
  modulosParaSubir,
  pesoArchivo,
  rolGD,
  sha256Hex,
  subirDocumento,
  subirVersion,
  type CategoriaGD,
  type DatosSubida,
  type ModuloGD,
  type PermisoGD,
  type RolGD,
} from "@/lib/gestionDocumental";
import { Boton, Campo, VentanaGD, claseInput, cx } from "./piezas";

const MAX = 25 * 1024 * 1024;

function useHash(archivo: File | null): { hash: string; calculando: boolean } {
  const [hash, setHash] = useState("");
  const [calculando, setCalculando] = useState(false);
  useEffect(() => {
    setHash("");
    if (!archivo) return;
    let vivo = true;
    setCalculando(true);
    void archivo.arrayBuffer().then(sha256Hex).then((h) => {
      if (vivo) {
        setHash(h);
        setCalculando(false);
      }
    });
    return () => {
      vivo = false;
    };
  }, [archivo]);
  return { hash, calculando };
}

function SelectorArchivo({ archivo, onCambio }: { archivo: File | null; onCambio: (f: File | null) => void }) {
  const { hash, calculando } = useHash(archivo);
  // Botón propio + input oculto (como Registrar gasto): el input nativo con estilos no abría el
  // explorador de Windows en la app de escritorio. También se puede arrastrar el archivo a la caja.
  const ref = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  return (
    <div
      className={cx("rounded-lg border border-dashed p-3 transition", encima ? "border-tema-acento bg-tema-borde/60" : "border-tema-sec/50 bg-tema-borde/25")}
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onCambio(f);
      }}
    >
      <input
        ref={ref}
        type="file"
        className="hidden"
        onChange={(e) => {
          onCambio(e.target.files?.[0] ?? null);
          e.target.value = ""; // permite volver a elegir el mismo archivo
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Boton tono="neutro" onClick={() => ref.current?.click()}>
          <Upload size={15} /> {archivo ? "Cambiar archivo" : "Seleccionar archivo de la PC"}
        </Boton>
        <span className="min-w-0 break-words text-[12px] text-tema-texto/70">{archivo ? archivo.name : "o arrastre el archivo aquí"}</span>
      </div>
      {archivo && (
        <div className="mt-2 space-y-0.5 text-[11px] text-tema-texto/75">
          <p>
            {archivo.name} · {pesoArchivo(archivo.size)} {archivo.size > MAX && <b className="text-tema-tinta">· supera 25 MB</b>}
          </p>
          <p className="flex items-center gap-1 break-all font-mono">
            <Fingerprint size={12} className="shrink-0" /> SHA-256: {calculando ? "calculando…" : hash}
          </p>
          <p>El servidor vuelve a calcular el hash al recibirlo: si no coincide, rechaza el archivo.</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ FLUJO 1 · Subir documento
export function SubirDocumento({
  abierta,
  onCerrar,
  onListo,
  rol,
  referencia,
}: {
  abierta: boolean;
  onCerrar: () => void;
  onListo: (codigo: string) => void;
  rol: string;
  /** Historia de procesos: el documento se adjunta al proceso con este código (REQ-ALM-001, NP-0001…). */
  referencia?: string;
}) {
  const r = rolGD(rol);
  const modulos = modulosParaSubir(r);
  const inicial = (): DatosSubida => ({
    nombre: "",
    descripcion: "",
    modulo: (modulos[0] ?? "Almacen") as ModuloGD,
    categoria: "Politica",
    fecha_vencimiento: null,
    es_confidencial: false,
    referencia_externa: referencia ?? "",
    // Por defecto nadie ve nada: solo el aprobador (Gerencia) recibe permiso explícito de Aprobación
    permisos: ROLES_GD.map((x) => ({ rol: x, permiso: (x === "Gerencia" ? "Aprobacion" : "Sin Acceso") as PermisoGD })),
    aprobadores: ["Gerencia"],
    enviar: true,
  });
  const [d, setD] = useState<DatosSubida>(inicial);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (abierta) {
      setD(inicial());
      setArchivo(null);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  const set = <K extends keyof DatosSubida>(k: K, v: DatosSubida[K]) => setD((p) => ({ ...p, [k]: v }));
  const setPermiso = (rolP: RolGD, permiso: PermisoGD) => set("permisos", d.permisos.map((p) => (p.rol === rolP ? { ...p, permiso } : p)));
  const mover = (i: number, delta: number) => {
    const a = [...d.aprobadores];
    const j = i + delta;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set("aprobadores", a);
  };
  const libres = ROLES_GD.filter((x) => !d.aprobadores.includes(x));

  const guardar = async () => {
    setError("");
    if (!archivo) return setError("Elija el archivo.");
    if (archivo.size > MAX) return setError("El archivo supera 25 MB.");
    if (!d.nombre.trim()) return setError("Escriba el nombre del documento.");
    if (d.enviar && d.aprobadores.length === 0) return setError("Elija al menos un aprobador.");
    setGuardando(true);
    try {
      const r2 = await subirDocumento(archivo, { ...d, permisos: d.permisos.filter((p) => p.permiso !== "Sin Acceso") });
      onListo(r2.codigo);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <VentanaGD abierta={abierta} titulo="Subir documento" onCerrar={onCerrar} ancha>
      {modulos.length === 0 ? (
        <p className="text-[13px] text-tema-tinta">Su rol no puede subir documentos.</p>
      ) : (
        <div className="space-y-4">
          <SelectorArchivo archivo={archivo} onCambio={setArchivo} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombre" className="sm:col-span-2">
              <input className={claseInput} value={d.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Política de seguridad del almacén" />
            </Campo>
            <Campo label="Descripción" className="sm:col-span-2">
              <textarea className={claseInput} rows={2} value={d.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
            </Campo>
            <Campo label="Módulo" ayuda={modulos.length === 1 ? "Solo puede subir documentos de su módulo." : undefined}>
              <select className={claseInput} value={d.modulo} onChange={(e) => set("modulo", e.target.value as ModuloGD)} disabled={modulos.length === 1}>
                {modulos.map((m) => (
                  <option key={m} value={m}>
                    {et(m)}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Categoría" ayuda={`Código automático: ${PREFIJO[d.categoria]}-${d.categoria === "Requerimiento" ? "00000" : "0000"}`}>
              <select className={claseInput} value={d.categoria} onChange={(e) => set("categoria", e.target.value as CategoriaGD)}>
                {CATEGORIAS_GD.map((c) => (
                  <option key={c} value={c}>
                    {et(c)}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Fecha de vencimiento" ayuda="Opcional. Al vencer pasa a Vencido.">
              <input type="date" className={claseInput} value={d.fecha_vencimiento ?? ""} onChange={(e) => set("fecha_vencimiento", e.target.value || null)} />
            </Campo>
            <Campo label="Código en otro módulo" ayuda="Enlace por código, ej. REQ-045-2026, OC-080, NP-012.">
              <input className={claseInput} value={d.referencia_externa} onChange={(e) => set("referencia_externa", e.target.value.toUpperCase())} placeholder="REQ-00452" />
            </Campo>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-tema-acento/30 px-3 py-2 text-[13px] text-tema-texto">
            <input type="checkbox" className="mt-0.5 accent-tema-acento" checked={d.es_confidencial} onChange={(e) => set("es_confidencial", e.target.checked)} />
            <span>
              <b className="text-tema-tinta">Confidencial.</b> Descargar exigirá doble confirmación y el PDF saldrá con marca de agua (usuario + fecha + IP).
            </span>
          </label>

          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-tema-texto/75">Permisos de acceso por rol</p>
            <p className="mb-2 text-[11px] text-tema-texto/60">Por defecto nadie ve nada. Usted (dueño) tiene Control Total. Cada aprobador recibe al menos Aprobación.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {d.permisos.map((p) => (
                <div key={p.rol} className="flex items-center justify-between gap-2 rounded-lg border border-tema-texto/10 px-3 py-1.5">
                  <span className="text-[13px] font-semibold text-tema-texto">{et(p.rol)}</span>
                  <select
                    className={cx(claseInput, "w-auto py-1 text-[12px]", p.permiso !== "Sin Acceso" && "border-tema-sec font-semibold text-tema-sec")}
                    value={p.permiso}
                    onChange={(e) => setPermiso(p.rol, e.target.value as PermisoGD)}
                  >
                    {PERMISOS_GD.map((x) => (
                      <option key={x} value={x}>
                        {et(x)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-tema-texto/75">Ruta de aprobación (en orden)</p>
            <ol className="space-y-1.5">
              {d.aprobadores.map((a, i) => (
                <li key={a} className="flex items-center gap-2 rounded-lg bg-tema-borde/40 px-3 py-1.5 text-[13px] text-tema-texto">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full !bg-tema-fuerte text-[11px] font-bold !text-white">{i + 1}</span>
                  <span className="flex-1 font-semibold">{et(a)}</span>
                  <button type="button" onClick={() => mover(i, -1)} aria-label="Subir" className="p-1 text-tema-texto/70 hover:text-tema-texto">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" onClick={() => mover(i, 1)} aria-label="Bajar" className="p-1 text-tema-texto/70 hover:text-tema-texto">
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" onClick={() => set("aprobadores", d.aprobadores.filter((x) => x !== a))} aria-label="Quitar" className="p-1 text-tema-tinta">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ol>
            {libres.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <select className={cx(claseInput, "w-auto py-1 text-[12px]")} id="gd-aprob-nuevo" defaultValue="">
                  <option value="" disabled>
                    Agregar aprobador…
                  </option>
                  {libres.map((x) => (
                    <option key={x} value={x}>
                      {et(x)}
                    </option>
                  ))}
                </select>
                <Boton
                  className="py-1"
                  onClick={() => {
                    const s = document.getElementById("gd-aprob-nuevo") as HTMLSelectElement | null;
                    if (s?.value) set("aprobadores", [...d.aprobadores, s.value as RolGD]);
                  }}
                >
                  <Plus size={14} /> Agregar
                </Boton>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-[13px] text-tema-texto">
            <input type="checkbox" className="accent-tema-sec" checked={d.enviar} onChange={(e) => set("enviar", e.target.checked)} />
            Enviar a revisión ahora (si no, queda como Borrador)
          </label>

          {error && <p className="rounded-lg border border-tema-acento px-3 py-2 text-[13px] font-semibold text-tema-tinta">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton tono="critico" onClick={guardar} disabled={guardando}>
              {guardando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Subir documento
            </Boton>
          </div>
        </div>
      )}
    </VentanaGD>
  );
}

// ------------------------------------------------------------------ FLUJO 3 · Nueva versión
export function NuevaVersion({ abierta, onCerrar, onListo, docId, codigo, versionActual }: { abierta: boolean; onCerrar: () => void; onListo: (v: string) => void; docId: string; codigo: string; versionActual: string }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tipo, setTipo] = useState<"menor" | "mayor">("menor");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (abierta) {
      setArchivo(null);
      setTipo("menor");
      setMotivo("");
      setError("");
    }
  }, [abierta]);
  const siguiente = useMemo(() => {
    const [ma, me] = versionActual.slice(1).split(".").map(Number);
    return tipo === "mayor" ? `v${ma + 1}.0` : `v${ma}.${me + 1}`;
  }, [tipo, versionActual]);

  const guardar = async () => {
    setError("");
    if (!archivo) return setError("Elija el archivo de la nueva versión.");
    if (motivo.trim().length < 5) return setError("El motivo del cambio es obligatorio (mínimo 5 caracteres).");
    setGuardando(true);
    try {
      const r = await subirVersion(docId, archivo, tipo, motivo.trim());
      onListo(r.version);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <VentanaGD abierta={abierta} titulo={`Nueva versión de ${codigo}`} onCerrar={onCerrar}>
      <div className="space-y-3">
        <p className="rounded-lg bg-tema-borde/40 px-3 py-2 text-[12px] text-tema-texto">
          La versión {versionActual} NO se borra: queda intacta y recuperable en el historial. La nueva versión vuelve a revisión.
        </p>
        <SelectorArchivo archivo={archivo} onCambio={setArchivo} />
        <Campo label="Tipo de cambio">
          <div className="flex gap-2">
            {(["menor", "mayor"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={cx("flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold", tipo === t ? "border-tema-sec !bg-tema-sec !text-white" : "border-tema-texto/20 text-tema-texto")}
              >
                {t === "menor" ? "Cambio menor" : "Cambio mayor"}
              </button>
            ))}
          </div>
        </Campo>
        <p className="text-[13px] text-tema-texto">
          {versionActual} → <b>{siguiente}</b>
        </p>
        <Campo label="Motivo del cambio (obligatorio)">
          <textarea className={claseInput} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Qué cambió y por qué" />
        </Campo>
        {error && <p className="rounded-lg border border-tema-acento px-3 py-2 text-[13px] font-semibold text-tema-tinta">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton tono="secundario" onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Subir {siguiente}
          </Boton>
        </div>
      </div>
    </VentanaGD>
  );
}

// ------------------------------------------------------------------ Motivo obligatorio (rechazar, archivar, restaurar)
export function PedirMotivo({
  abierta,
  titulo,
  texto,
  etiqueta,
  boton,
  tono,
  onCerrar,
  onConfirmar,
}: {
  abierta: boolean;
  titulo: string;
  texto: string;
  etiqueta: string;
  boton: string;
  tono: "critico" | "secundario";
  onCerrar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (abierta) {
      setMotivo("");
      setError("");
    }
  }, [abierta]);
  return (
    <VentanaGD abierta={abierta} titulo={titulo} onCerrar={onCerrar}>
      <div className="space-y-3">
        <p className="text-[13px] text-tema-texto">{texto}</p>
        <Campo label={etiqueta}>
          <textarea className={claseInput} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Campo>
        {error && <p className="text-[13px] font-semibold text-tema-tinta">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton
            tono={tono}
            disabled={ocupado}
            onClick={async () => {
              if (motivo.trim().length < 5) return setError("Es obligatorio (mínimo 5 caracteres).");
              setOcupado(true);
              try {
                await onConfirmar(motivo.trim());
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setOcupado(false);
              }
            }}
          >
            {ocupado && <Loader2 size={15} className="animate-spin" />} {boton}
          </Boton>
        </div>
      </div>
    </VentanaGD>
  );
}

// ------------------------------------------------------------------ FLUJO 4 · Doble confirmación (confidencial)
export function ConfirmarDescarga({ abierta, codigo, version, onCerrar, onConfirmar }: { abierta: boolean; codigo: string; version: string; onCerrar: () => void; onConfirmar: () => Promise<void> }) {
  const [paso, setPaso] = useState(1);
  const [escrito, setEscrito] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (abierta) {
      setPaso(1);
      setEscrito("");
      setError("");
    }
  }, [abierta]);
  return (
    <VentanaGD abierta={abierta} titulo="Descarga de documento CONFIDENCIAL" onCerrar={onCerrar}>
      <div className="space-y-3 text-[13px] text-tema-texto">
        <p className="flex items-start gap-2 rounded-lg border-2 border-tema-acento px-3 py-2 font-semibold text-tema-tinta">
          <Lock size={16} className="mt-0.5 shrink-0" /> {codigo} {version} es confidencial. La descarga queda registrada con su nombre, fecha, hora e IP, y el PDF sale con marca de agua a su nombre.
        </p>
        {paso === 1 ? (
          <div className="flex justify-end gap-2">
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton tono="critico" onClick={() => setPaso(2)}>
              Confirmación 1 de 2: entiendo
            </Boton>
          </div>
        ) : (
          <>
            <Campo label={`Confirmación 2 de 2: escriba el código ${codigo}`}>
              <input className={claseInput} value={escrito} onChange={(e) => setEscrito(e.target.value.toUpperCase())} autoFocus />
            </Campo>
            {error && <p className="font-semibold text-tema-tinta">{error}</p>}
            <div className="flex justify-end gap-2">
              <Boton onClick={onCerrar}>Cancelar</Boton>
              <Boton
                tono="critico"
                disabled={escrito !== codigo || ocupado}
                onClick={async () => {
                  setOcupado(true);
                  try {
                    await onConfirmar();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setOcupado(false);
                  }
                }}
              >
                {ocupado && <Loader2 size={15} className="animate-spin" />} Descargar
              </Boton>
            </div>
          </>
        )}
      </div>
    </VentanaGD>
  );
}
