"use client";

import { useState } from "react";
import { HandCoins, Pencil, Save, Trash2 } from "lucide-react";
import { Button, Field, Input, Modal, Select, ejecutarAsync } from "@/components/ui";
import { crearAdelanto, editarAdelanto, eliminarAdelanto, type Adelanto } from "@/lib/adelantos";
import { SEDES } from "@/lib/empresa";
import { fechaPE, hoy, r2, soles } from "@/lib/storage";

/** "SEMANA 14 - ABRIL 2026" -> "semana 14" (para el concepto sugerido). */
const semanaCorta = (periodo: string) => periodo.match(/SEMANA\s+\d+/i)?.[0].toLowerCase() ?? periodo.toLowerCase();

type Form = { id?: string; monto: string; fecha: string; concepto: string; sede: string };

/**
 * Columna ADELANTOS de la planilla: registrar, editar o eliminar los adelantos PENDIENTES de un trabajador.
 * Se guardan en la tabla adelantos y se descuentan del TOTAL A PAGAR (Básico + H. extra - AFP - Adelantos).
 */
export function AdelantosTrabajador({
  trabajador,
  periodo,
  pendientes,
  editable,
  onClose,
  onCambio,
}: {
  trabajador: { id: string; nombre: string; dni?: string; sede?: string };
  periodo: string;
  pendientes: Adelanto[];
  editable: boolean;
  onClose: () => void;
  onCambio: () => void;
}) {
  const nuevo = (): Form => ({ monto: "", fecha: hoy(), concepto: `Adelanto ${semanaCorta(periodo)}`, sede: trabajador.sede || SEDES[0] });
  const [f, setF] = useState<Form>(nuevo);
  const [guardando, setGuardando] = useState(false);
  const total = r2(pendientes.reduce((a, x) => a + x.monto, 0));

  const guardar = async () => {
    setGuardando(true);
    const datos = { trabajador_nombre: trabajador.nombre, dni: trabajador.dni || null, fecha: f.fecha, monto: Number(f.monto), motivo: f.concepto, estado: "PENDIENTE" as const };
    const extras = { trabajador_id: trabajador.id, semana: periodo, sede: f.sede };
    const ok = await ejecutarAsync(
      () => (f.id ? editarAdelanto(f.id, datos, extras) : crearAdelanto(datos, extras)),
      f.id ? "Adelanto actualizado" : `Adelanto de ${soles(Number(f.monto) || 0)} registrado: se descuenta del total a pagar`
    );
    setGuardando(false);
    if (ok) {
      setF(nuevo());
      onCambio();
    }
  };

  const eliminar = async (a: Adelanto) => {
    if (!confirm(`¿Eliminar el adelanto de ${soles(a.monto)} del ${fechaPE(a.fecha)}?`)) return;
    if (await ejecutarAsync(() => eliminarAdelanto(a.id), "Adelanto eliminado")) {
      if (f.id === a.id) setF(nuevo());
      onCambio();
    }
  };

  return (
    <Modal open onClose={onClose} title={`Registrar adelanto - ${trabajador.nombre}`}>
      <div className="space-y-4 text-sm">
        {pendientes.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50/50">
            <p className="border-b border-red-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              Adelantos pendientes · total <span className="text-red-600">- {soles(total)}</span>
            </p>
            {pendientes.map((a) => (
              <div key={a.id} className="flex items-center gap-2 border-b border-red-100 px-3 py-2 last:border-0">
                <span className="w-24 text-xs text-plomo-500">{fechaPE(a.fecha)}</span>
                <span className="flex-1 truncate">
                  {a.motivo || "Adelanto"}
                  {a.sede ? <span className="text-xs text-plomo-500"> · {a.sede}</span> : null}
                </span>
                <b className="text-red-600">- {soles(a.monto)}</b>
                {editable && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Editar"
                      onClick={() => setF({ id: a.id, monto: String(a.monto), fecha: a.fecha, concepto: a.motivo ?? "", sede: a.sede || trabajador.sede || SEDES[0] })}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" title="Eliminar" onClick={() => eliminar(a)}>
                      <Trash2 size={14} className="text-red-600" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {editable ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-plomo-500">{f.id ? "Editar adelanto" : "Nuevo adelanto"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Monto S/ *">
                <Input type="number" min={0} step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} placeholder="0.00" autoFocus />
              </Field>
              <Field label="Fecha *">
                <Input type="date" value={f.fecha} max={hoy()} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
              </Field>
              <Field label="Concepto">
                <Input value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} placeholder="Ej: Adelanto semana 14" />
              </Field>
              <Field label="Sede">
                <Select value={f.sede} onChange={(e) => setF({ ...f, sede: e.target.value })} options={SEDES.map((s) => ({ value: s, label: s }))} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
              {f.id && (
                <Button variant="ghost" onClick={() => setF(nuevo())} disabled={guardando}>
                  Cancelar edición
                </Button>
              )}
              <Button variant="secondary" onClick={onClose} disabled={guardando}>
                Cerrar
              </Button>
              <Button onClick={guardar} disabled={guardando || !(Number(f.monto) > 0)}>
                {f.id ? <Save size={16} /> : <HandCoins size={16} />} {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </>
        ) : (
          <p className="rounded-lg bg-plomo-50 px-3 py-2 text-plomo-600">Solo lectura: esta planilla ya se pagó o su usuario no puede registrar adelantos.</p>
        )}
      </div>
    </Modal>
  );
}
