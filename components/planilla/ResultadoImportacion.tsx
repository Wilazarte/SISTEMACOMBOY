"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Unlink, X } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { fechaPE } from "@/lib/storage";
import { MOTIVOS, type DetalleHuella, type NoEncontrado } from "@/lib/emparejarReloj";
import type { Trabajador } from "@/lib/types";

/**
 * Resultado de "Importar asistencia": qué pasó con cada huella del reloj.
 * Las que no se pudieron vincular se muestran arriba, en grande, con su botón [Vincular].
 */
export function ResultadoImportacion({
  detalle,
  noEncontrados,
  trabajadores,
  eleccion,
  setEleccion,
  editable,
  onVincular,
  onCrear,
  onDesvincular,
  onCerrar,
  antiguos = [],
  onLimpiar,
}: {
  detalle: DetalleHuella[];
  noEncontrados: NoEncontrado[];
  trabajadores: Trabajador[];
  eleccion: Record<string, string>;
  setEleccion: (f: (m: Record<string, string>) => Record<string, string>) => void;
  editable: boolean;
  onVincular: (x: NoEncontrado, id: string) => void;
  onCrear: (x: NoEncontrado) => void;
  onDesvincular: (huella: string) => void;
  onCerrar: () => void;
  /** Asistencia guardada en este periodo de trabajadores que NO vienen en este Excel (de otra importación o edición). */
  antiguos?: { id: string; nombre: string; dias: number; horas: number; origen: string }[];
  onLimpiar?: (ids: string[]) => void;
}) {
  // Plegada por defecto (para ver la planilla debajo); se abre sola si hay vínculos guardados, huellas de más de 7 días o asistencia antigua
  const revisar = detalle.some((d) => d.vinculoGuardado || d.dias > 7) || antiguos.length > 0;
  const [abierto, setAbierto] = useState(revisar);
  useEffect(() => {
    if (revisar) setAbierto(true);
  }, [revisar]);
  const nombreDe = (id: string | null) => (id ? trabajadores.find((t) => t.id === id)?.nombre ?? "" : "");
  const activos = trabajadores.filter((t) => t.activo);

  return (
    <div className="space-y-3">
      {noEncontrados.length > 0 && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 text-red-900" data-no-encontrados>
          <p className="flex items-center gap-2 text-base font-bold">
            <AlertTriangle size={20} /> Trabajadores del reloj no encontrados ({noEncontrados.length}) — su asistencia aún NO se importó
          </p>
          <ul className="mt-3 space-y-2">
            {noEncontrados.map((x) => {
              const elegido = eleccion[x.huella] ?? x.candidatos[0]?.id ?? "";
              return (
                <li key={x.huella} data-huella={x.huella} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-[15px]">
                  <span className="font-semibold">
                    ⚠️ No se pudo vincular: <b>{x.nombre}</b> <span className="text-sm font-normal text-plomo-500">(huella {x.huella})</span>
                  </span>
                  <span className="flex-1" />
                  {editable && (
                    <>
                      <select
                        value={elegido}
                        onChange={(e) => setEleccion((m) => ({ ...m, [x.huella]: e.target.value }))}
                        className="max-w-[320px] rounded-lg border border-plomo-200 px-2 py-1.5 text-sm"
                        aria-label={`Trabajador para ${x.nombre}`}
                      >
                        {x.candidatos.map((c) => (
                          <option key={c.id} value={c.id}>
                            N° {c.id} · {c.nombre}
                          </option>
                        ))}
                        <optgroup label="Otros trabajadores">
                          {activos
                            .filter((t) => !x.candidatos.some((c) => c.id === t.id))
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                N° {t.id} · {t.nombre}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                      <Button size="sm" onClick={() => elegido && onVincular(x, elegido)} disabled={!elegido}>
                        <Link2 size={14} /> Vincular a {elegido} {nombreDe(elegido).split(" ")[0]}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => onCrear(x)} title="No es ninguno: registrar como trabajador nuevo">
                        Crear nuevo
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {detalle.length > 0 && (
        <div className="rounded-xl border border-plomo-200 bg-white shadow-sm" data-resultado-importacion>
          <div className="flex items-center justify-between border-b border-plomo-100 px-4 py-2.5">
            <button type="button" onClick={() => setAbierto((v) => !v)} className="text-left text-sm font-semibold text-azul-900 hover:underline" data-toggle-resultado>
              {abierto ? "▾" : "▸"} Resultado de la importación · {detalle.length} huella(s) del reloj · {detalle.filter((d) => d.destino).length} importada(s)
              {!abierto && <span className="ml-2 text-xs font-normal text-plomo-500">(ver detalle por huella)</span>}
            </button>
            <button type="button" onClick={onCerrar} className="rounded p-1 text-plomo-500 hover:bg-plomo-100" aria-label="Cerrar resultado">
              <X size={16} />
            </button>
          </div>
          {abierto && (
          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-plomo-50 text-left uppercase tracking-wide text-plomo-500">
                <tr>
                  <th className="px-3 py-2">Huella</th>
                  <th className="px-3 py-2">Nombre en el reloj</th>
                  <th className="px-3 py-2 text-right">Días</th>
                  <th className="px-3 py-2">Marcas del – al</th>
                  <th className="px-3 py-2">→ Trabajador</th>
                  <th className="px-3 py-2">Cómo se unió</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {detalle.map((d) => (
                  <tr key={d.huella} data-detalle={d.huella} className={cn("border-t border-plomo-100", !d.destino && "bg-red-50")}>
                    <td className="px-3 py-1.5 font-mono">{d.huella}</td>
                    <td className="px-3 py-1.5">{d.nombre}</td>
                    <td className={cn("px-3 py-1.5 text-right font-semibold", d.dias > 7 && "text-orange-600")} title={d.dias > 7 ? "Más de 7 días: el Excel trae más de una semana" : undefined}>
                      {d.dias}
                      {d.dias > 7 && " ⚠️"}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{d.desde ? `${fechaPE(d.desde)} – ${fechaPE(d.hasta)}` : "-"}</td>
                    <td className="px-3 py-1.5">
                      {d.destino ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 size={12} /> N° {d.destino} {nombreDe(d.destino)}
                        </span>
                      ) : (
                        <span className="font-semibold text-red-700">Sin vincular</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">{MOTIVOS[d.motivo]}</td>
                    <td className="px-3 py-1.5 text-right">
                      {editable && d.vinculoGuardado && (
                        <button
                          type="button"
                          onClick={() => onDesvincular(d.huella)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-plomo-500 hover:bg-plomo-100 hover:text-red-700"
                          title="Quitar el vínculo guardado: la huella vuelve a unirse por su N° o por nombre"
                        >
                          <Unlink size={12} /> Quitar vínculo
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          {antiguos.length > 0 && (
            <div className="border-t border-plomo-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-900" data-antiguos>
              <p className="font-semibold">
                Asistencia guardada en este periodo de {antiguos.length} trabajador(es) que NO vienen en este Excel (de una importación o edición anterior):
              </p>
              <p className="mt-1">
                {antiguos.map((a) => `N° ${a.id} ${a.nombre} (${a.dias} d · ${a.horas.toLocaleString("es-PE", { maximumFractionDigits: 2 })} h · ${a.origen})`).join(" · ")}
              </p>
              {editable && onLimpiar && (
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => onLimpiar(antiguos.map((a) => a.id))}>
                  Poner en 0 (no trabajaron esta semana)
                </Button>
              )}
            </div>
          )}
          {detalle.some((d) => d.dias > 7) && (
            <p className="border-t border-plomo-100 px-4 py-2 text-xs text-orange-700">
              ⚠️ Hay huellas con más de 7 días: el Excel trae marcas de más de una semana. Exporte solo la semana a pagar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
