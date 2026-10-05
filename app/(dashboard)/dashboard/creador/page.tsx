"use client";

import { useMemo, useState } from "react";
import { KeyRound, Save, ShieldAlert } from "lucide-react";
import { Button, Card, CardHeader, Empty, Field, Input, Table, Td, cn, ejecutarAsync } from "@/components/ui";
import { getSesion, puedeEditarAsistencia } from "@/lib/auth";
import { KEYS, editarAsistenciaCreador, idAsistencia, normalizarPeriodo, useStore, useTrabajadores } from "@/lib/storage";
import type { AsistenciaPeriodo } from "@/lib/types";

type Borrador = Record<string, { dias: string; tardanzas: string }>;

/**
 * Módulo Creador › Edición manual de asistencia.
 * Única pantalla (además de Importar asistencia) que modifica DÍAS y TARD. de la planilla.
 * Solo roles creador / admin (permiso editar_asistencia_creador); la base lo vuelve a validar.
 */
export default function CreadorPage() {
  const sesion = getSesion();
  const trabajadores = useTrabajadores();
  const asistencia = useStore<AsistenciaPeriodo[]>(KEYS.ASISTENCIA, []);
  const [periodo, setPeriodo] = useState("SEMANA 14 - ABRIL 2026");
  const [borrador, setBorrador] = useState<Borrador>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  const periodos = useMemo(() => Array.from(new Set(asistencia.map((a) => a.periodo))).sort(), [asistencia]);
  const porId = useMemo(() => new Map(asistencia.map((a) => [a.id, a])), [asistencia]);
  const activos = trabajadores.filter((t) => t.activo).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  if (!puedeEditarAsistencia(sesion))
    return <Empty icon={<ShieldAlert size={28} />} text="Solo los roles CREADOR y ADMINISTRADORA pueden editar la asistencia manualmente." />;

  const valor = (trabajador: string, campo: "dias" | "tardanzas"): string => {
    const b = borrador[trabajador]?.[campo];
    if (b !== undefined) return b;
    return String(porId.get(idAsistencia(periodo, trabajador))?.[campo] ?? 0);
  };
  const cambiado = (trabajador: string) => borrador[trabajador] !== undefined;

  const guardar = async (trabajador: string) => {
    setGuardando(trabajador);
    const ok = await ejecutarAsync(
      () => editarAsistenciaCreador(periodo, trabajador, Number(valor(trabajador, "dias")), Number(valor(trabajador, "tardanzas"))),
      `Asistencia del N° ${trabajador} guardada (origen CREADOR)`
    );
    setGuardando(null);
    if (ok) setBorrador(({ [trabajador]: _, ...resto }) => resto);
  };

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="flex items-center gap-3 font-serif text-[36px] font-light leading-tight text-azul-900 lg:text-[42px]">
          <KeyRound size={22} className="text-corp" /> Módulo Creador
        </h1>
        <p className="mt-1 text-[13px] text-plomo-600">Edición manual de asistencia: corrige DÍAS y TARD. de la planilla. Queda registrado como origen CREADOR.</p>
      </div>

      <Card>
        <CardHeader
          title="Edición manual de asistencia"
          subtitle="BRUTO, DSCTO y NETO se recalculan solos en Planilla a partir de los DÍAS."
          action={
            <Field label="Periodo" className="w-72">
              <Input value={periodo} onChange={(e) => { setPeriodo(e.target.value); setBorrador({}); }} list="periodos-asistencia" className="font-semibold" />
              <datalist id="periodos-asistencia">
                {periodos.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
          }
        />
        {activos.length === 0 ? (
          <div className="p-5">
            <Empty icon={<KeyRound size={28} />} text="No hay trabajadores activos." />
          </div>
        ) : (
          <Table head={["N°", "Trabajador", "Días", "Tard.", "Origen", "Último cambio", ""]}>
            {activos.map((t) => {
              const reg = porId.get(idAsistencia(periodo, t.id));
              return (
                <tr key={t.id} className={cn(cambiado(t.id) && "bg-amber-50")}>
                  <Td className="font-mono">{t.id}</Td>
                  <Td className="font-semibold text-azul-900">{t.nombre}</Td>
                  {(["dias", "tardanzas"] as const).map((campo) => (
                    <Td key={campo}>
                      <Input
                        type="number"
                        min={0}
                        max={campo === "dias" ? 31 : undefined}
                        step={1}
                        aria-label={`${campo === "dias" ? "Días" : "Tardanzas"} del N° ${t.id}`}
                        value={valor(t.id, campo)}
                        onChange={(e) =>
                          setBorrador((b) => ({
                            ...b,
                            [t.id]: { ...(b[t.id] ?? { dias: valor(t.id, "dias"), tardanzas: valor(t.id, "tardanzas") }), [campo]: e.target.value },
                          }))
                        }
                        className="w-20 text-right"
                      />
                    </Td>
                  ))}
                  <Td>
                    {reg ? (
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", reg.origen_edicion === "CREADOR" ? "bg-red-50 text-vino" : "bg-[#EEF2F7] text-azul-700")}>
                        {reg.origen_edicion}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Sin registro</span>
                    )}
                  </Td>
                  <Td className="text-xs text-plomo-500">{reg ? new Date(reg.fecha).toLocaleString("es-PE") : "-"}</Td>
                  <Td>
                    <Button size="sm" onClick={() => guardar(t.id)} disabled={!cambiado(t.id) || guardando !== null}>
                      <Save size={14} /> {guardando === t.id ? "Guardando…" : "Guardar"}
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
