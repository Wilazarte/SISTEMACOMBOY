"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Modal, cn } from "@/components/ui";
import {
  NOMBRE_ACCION,
  NOMBRE_ETAPA,
  NOMBRE_SECCION,
  NOMBRE_TIPO_VERSION,
  S,
  bitacora,
  pct,
  verificar,
  versionCompleta,
  type EstadoCostos,
  type HojaCosto,
  type RegistroAudit,
  type Verificacion,
  type VersionCosto,
} from "@/lib/costoProduccion";
import { ACERO, Alerta, Boton, Celda, GRIS, NOCHE, Tabla, VINO, pinta } from "./piezas";

type Pestana = "versiones" | "bitacora" | "firmas" | "integridad";

const fecha = (iso: string) => new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "medium" });
const corto = (h?: string | null) => (h ? `${h.slice(0, 10)}…` : "—");

/** Valor anterior → nuevo de un registro (solo los campos que cambiaron). */
function Diferencia({ r }: { r: RegistroAudit }) {
  const a = r.valor_anterior ?? {};
  const b = r.valor_nuevo ?? {};
  const claves = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).filter((k) => k !== "hash" && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (!r.valor_anterior) return <span className="text-[11.5px]">{b.descripcion ? `${String(b.descripcion)} · ${S(Number(b.subtotal ?? 0))}` : "Registro nuevo"}</span>;
  return (
    <ul className="space-y-0.5 text-[11.5px]">
      {claves.slice(0, 6).map((k) => (
        <li key={k} className="break-words">
          <b>{k}</b>: <span className="text-tema-tinta line-through">{String(a[k] ?? "—")}</span> → <span className="font-semibold text-tema-sec">{String(b[k] ?? "—")}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ver Historial de Costos: versiones (nunca se sobrescriben), bitácora con hash, firmas y verificación de integridad. */
export function HistorialCostos({ hoja, datos, onCerrar }: { hoja: HojaCosto; datos: EstadoCostos; onCerrar: () => void }) {
  const [p, setP] = useState<Pestana>("versiones");
  const [log, setLog] = useState<RegistroAudit[] | null>(null);
  const [ver, setVer] = useState<Verificacion | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [detalle, setDetalle] = useState<VersionCosto | null>(null);
  const versiones = datos.versiones.filter((v) => v.orden_id === hoja.id).sort((a, b) => b.mayor - a.mayor || b.menor - a.menor);
  const firmas = datos.aprobaciones.filter((a) => a.orden_id === hoja.id);

  useEffect(() => {
    if (p === "bitacora" && !log) void bitacora(hoja.id).then(setLog).catch(() => setLog([]));
  }, [p, log, hoja.id]);

  const correrVerificacion = async () => {
    setVerificando(true);
    try {
      setVer(await verificar(hoja.id));
    } finally {
      setVerificando(false);
    }
  };

  return (
    <Modal open onClose={onCerrar} title={`Historial de costos · ${hoja.codigo} · ${hoja.orden_produccion_id}`} wide>
      <div className="space-y-3 text-tema-texto">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["versiones", `Versiones (${versiones.length})`],
              ["bitacora", "Bitácora de auditoría"],
              ["firmas", `Firmas (${firmas.length})`],
              ["integridad", "Verificar integridad"],
            ] as [Pestana, string][]
          ).map(([id, txt]) => (
            <button key={id} onClick={() => setP(id)} className="rounded-full px-3 py-1 text-[12px] font-bold" style={p === id ? pinta(NOCHE) : pinta(GRIS, NOCHE)}>
              {txt}
            </button>
          ))}
        </div>

        {p === "versiones" && (
          <>
            <Tabla head={["Versión", "Tipo", "Costo total", "Costo unit.", "Margen", "Usuario", "Fecha", "Motivo", "Hash"]}>
              {versiones.map((v) => (
                <tr key={v.id} className="cursor-pointer hover:bg-tema-borde/30" onClick={() => void versionCompleta(v.id).then(setDetalle)}>
                  <Celda className="font-bold">v{v.version}</Celda>
                  <Celda>
                    <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase" style={pinta(v.tipo === "FINAL_REAL" || v.tipo === "ESTIMADO" ? ACERO : v.tipo === "BORRADOR" ? "#5a6670" : VINO)}>{NOMBRE_TIPO_VERSION[v.tipo]}</span>
                  </Celda>
                  <Celda className="whitespace-nowrap">{S(v.costo_total)}</Celda>
                  <Celda className="whitespace-nowrap">{S(v.costo_unitario)}</Celda>
                  <Celda>{pct(v.margen_real)}</Celda>
                  <Celda>{v.usuario}</Celda>
                  <Celda className="whitespace-nowrap text-[11.5px]">{fecha(v.created_at)}</Celda>
                  <Celda className="text-[11.5px]">{v.motivo}</Celda>
                  <Celda className="font-mono text-[10.5px]">{corto(v.hash)}</Celda>
                </tr>
              ))}
            </Tabla>
            <p className="text-[11px] text-tema-sec">Ninguna versión se sobrescribe: cada una guarda la foto completa de la hoja y el hash de la anterior. Toque una fila para ver su detalle.</p>
            {detalle?.snapshot && (
              <div className="rounded-lg border border-tema-sec p-3">
                <p className="mb-2 text-[12px] font-bold uppercase text-tema-sec">
                  Detalle v{detalle.version} · {NOMBRE_TIPO_VERSION[detalle.tipo]} · hash {detalle.hash}
                </p>
                <Tabla head={["Sección", "Descripción", "Cantidad", "Costo unit.", "Subtotal", "Estado"]}>
                  {(detalle.snapshot.items ?? []).map((i) => (
                    <tr key={i.id} className={cn(i.estado === "ANULADO" && "text-tema-texto/50 line-through")}>
                      <Celda>{NOMBRE_SECCION[i.seccion].slice(3)}</Celda>
                      <Celda>{i.descripcion}</Celda>
                      <Celda>{Number(i.cantidad)}</Celda>
                      <Celda className="whitespace-nowrap">{S(Number(i.costo_unitario))}</Celda>
                      <Celda className="whitespace-nowrap">{S(Number(i.subtotal))}</Celda>
                      <Celda>{i.estado}</Celda>
                    </tr>
                  ))}
                </Tabla>
              </div>
            )}
          </>
        )}

        {p === "bitacora" &&
          (!log ? (
            <p className="flex items-center gap-2 py-6 text-[13px]">
              <Loader2 size={15} className="animate-spin" /> Cargando bitácora…
            </p>
          ) : (
            <Tabla head={["#", "Fecha y hora", "Usuario", "IP", "Acción", "Valor anterior → nuevo", "Motivo", "Hash"]}>
              {log.map((r) => (
                <tr key={r.id}>
                  <Celda className="text-[11px]">{r.id}</Celda>
                  <Celda className="whitespace-nowrap text-[11.5px]">{fecha(r.fecha_hora)}</Celda>
                  <Celda>{r.usuario}</Celda>
                  <Celda className="text-[11px]">{r.ip}</Celda>
                  <Celda>
                    <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase" style={pinta(r.accion === "APROBAR" || r.accion === "CERRAR_ORDEN" || r.accion === "FIJAR_ESTIMADO" ? ACERO : r.accion === "RECHAZAR" || r.accion === "ANULAR" || r.accion === "ACTUALIZACION_AUTOMATICA" || r.accion === "CAMBIAR_PROVEEDOR" ? VINO : NOCHE)}>
                      {NOMBRE_ACCION[r.accion]}
                    </span>
                  </Celda>
                  <Celda className="min-w-[200px]">
                    <Diferencia r={r} />
                  </Celda>
                  <Celda className="min-w-[160px] text-[11.5px]">{r.motivo}</Celda>
                  <Celda className="font-mono text-[10.5px]" >
                    <span title={`Registro ${r.hash_registro}\nAnterior ${r.hash_anterior}`}>{corto(r.hash_registro)}</span>
                  </Celda>
                </tr>
              ))}
            </Tabla>
          ))}

        {p === "firmas" &&
          (firmas.length === 0 ? (
            <p className="py-6 text-[13px]">Aún nadie aprobó ni rechazó esta hoja.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {firmas.map((f) => (
                <div key={f.id} className={cn("rounded-lg border-2 p-3", f.decision === "APROBADO" ? "border-tema-sec" : "border-tema-acento")}>
                  <p className={cn("text-[11px] font-bold uppercase", f.decision === "APROBADO" ? "text-tema-sec" : "text-tema-tinta")}>
                    {NOMBRE_ETAPA[f.etapa]} · {f.decision}
                  </p>
                  {f.firma && <img src={f.firma} alt={`Firma de ${f.nombre ?? f.usuario}`} className="my-1 h-14 w-full object-contain" />}
                  <p className="text-[12.5px] font-semibold">{f.nombre ?? f.usuario}</p>
                  <p className="text-[11px]">
                    {f.cargo} · {fecha(f.created_at)} · v{f.version}
                  </p>
                  {f.motivo && <p className="mt-1 text-[11.5px] italic">“{f.motivo}”</p>}
                  <p className="mt-1 break-all font-mono text-[10px] text-tema-sec">Sello {f.sello}</p>
                </div>
              ))}
            </div>
          ))}

        {p === "integridad" && (
          <div className="space-y-3">
            <p className="text-[12.5px]">
              Recalcula en la base el SHA-256 de toda la bitácora (cadena), de cada línea de costo, de cada versión y de los totales. Si alguien cambió un dato por fuera del sistema, aparece aquí.
            </p>
            <Boton variante="acero" onClick={() => void correrVerificacion()} disabled={verificando}>
              {verificando ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Verificar ahora
            </Boton>
            {ver &&
              (ver.ok ? (
                <Alerta tono="acero" icono={<CheckCircle2 size={15} />}>
                  <b>ÍNTEGRO.</b> {ver.registros} registros de bitácora, {ver.lineas} líneas y {ver.versiones} versiones verificadas ({fecha(ver.verificado)}).
                </Alerta>
              ) : (
                <Alerta icono={<ShieldAlert size={15} />}>
                  <b>ALTERACIÓN DETECTADA ({ver.errores.length}).</b>
                  <ul className="mt-1 list-disc pl-4">
                    {ver.errores.map((e, i) => (
                      <li key={i}>
                        {e.tipo}
                        {e.descripcion ? ` · ${e.descripcion}` : ""}
                        {e.version ? ` · v${e.version}` : ""}
                        {e.id ? ` · #${e.id}` : ""}: {e.error}
                      </li>
                    ))}
                  </ul>
                </Alerta>
              ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
