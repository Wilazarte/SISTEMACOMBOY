"use client";

// =====================================================================
// SOPORTE · Conflictos de sincronización (Fase 3).
// Cuando dos equipos cambiaron el mismo documento (uno sin señal), ganó el
// cambio más reciente y la otra versión quedó en public.conflictos.
// Aquí Administración decide: mantener lo que quedó o restaurar la otra versión.
// Nada se borra: el conflicto queda RESUELTO con quién y qué decidió.
// =====================================================================

import { Fragment, useCallback, useEffect, useState } from "react";
import { Button, Card, CardHeader, Table, Td, toast } from "@/components/ui";
import { getSesion, useSesion } from "@/lib/auth";
import { isAdmin } from "@/lib/permisosPlanta";
import { recargarTodo } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

interface Conflicto {
  id: string;
  tabla: string;
  tipo: string | null;
  registro_id: string;
  serie: string | null;
  operacion: "upsert" | "delete";
  version_local: Record<string, unknown> | null;
  version_servidor: Record<string, unknown> | null;
  gano: "LOCAL" | "SERVIDOR";
  editado_local_en: string | null;
  servidor_updated_at: string | null;
  usuario: string | null;
  dispositivo: string | null;
  created_at: string;
}

const COLUMNAS_SERVIDOR = ["created_at", "updated_at", "updated_by", "created_by"];
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "-");

export default function ConflictosPage() {
  const { sesion } = useSesion();
  const [lista, setLista] = useState<Conflicto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: e } = await createClient().from("conflictos").select("*").eq("estado", "PENDIENTE").order("created_at", { ascending: false }).limit(200);
    setCargando(false);
    if (e) return setError(e.code === "42P01" || e.code === "PGRST205" ? "Falta correr supabase/migrations/20261112_offline_sync.sql en Supabase." : e.message);
    setError("");
    setLista((data ?? []) as Conflicto[]);
  }, []);

  useEffect(() => {
    void cargar();
    const sb = createClient();
    const canal = sb.channel("conflictos").on("postgres_changes", { event: "*", schema: "public", table: "conflictos" }, () => void cargar()).subscribe();
    return () => void sb.removeChannel(canal);
  }, [cargar]);

  const resolver = async (c: Conflicto, decision: "MANTENER_GANADOR" | "RESTAURAR_PERDEDOR") => {
    const sb = createClient();
    try {
      if (decision === "RESTAURAR_PERDEDOR") {
        const perdedora = c.gano === "LOCAL" ? c.version_servidor : c.version_local;
        if (!perdedora) throw new Error("No hay otra versión para restaurar.");
        const fila = Object.fromEntries(Object.entries(perdedora).filter(([k]) => !COLUMNAS_SERVIDOR.includes(k)));
        const { error: e } = await sb.from(c.tabla).upsert(fila, { onConflict: c.tipo ? "tipo,id" : "id" });
        if (e) throw e;
      }
      const { error: e } = await sb
        .from("conflictos")
        .update({ estado: "RESUELTO", decision, resuelto_por: getSesion()?.usuario ?? null, resuelto_en: new Date().toISOString() })
        .eq("id", c.id);
      if (e) throw e;
      toast(decision === "RESTAURAR_PERDEDOR" ? "Se restauró la otra versión." : "Se mantuvo la versión actual.");
      void recargarTodo();
      void cargar();
    } catch (e) {
      toast(`No se pudo resolver: ${(e as Error).message}`, "error");
    }
  };

  if (sesion && !isAdmin(sesion)) return <p className="p-6 text-sm">Solo SOPORTE resuelve los conflictos.</p>;

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader title="Conflictos de sincronización" subtitle="Dos equipos cambiaron el mismo documento (uno sin señal). Ganó el más reciente; decida si se queda así." />
        {error && <p className="px-4 pb-4 text-sm text-red-500">{error}</p>}
        <Table tarjetas head={["Fecha", "Documento", "Tabla", "Ganó", "Equipo sin señal", "Acciones"]} empty={!cargando && lista.length === 0} vacio="Sin conflictos pendientes">
          {lista.map((c) => (
            <Fragment key={c.id}>
              <tr>
                <Td>{fecha(c.created_at)}</Td>
                <Td className="font-semibold">{c.serie ?? c.registro_id}</Td>
                <Td>
                  {c.tabla}
                  {c.tipo ? ` · ${c.tipo}` : ""}
                  {c.operacion === "delete" ? " · borrado" : ""}
                </Td>
                <Td>{c.gano === "LOCAL" ? "Cambio sin señal" : "Servidor"}</Td>
                <Td>
                  {c.usuario ?? "-"} · {c.dispositivo ?? "-"} · {fecha(c.editado_local_en)}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setAbierto(abierto === c.id ? null : c.id)}>
                      Ver
                    </Button>
                    <Button size="sm" onClick={() => void resolver(c, "MANTENER_GANADOR")}>
                      Mantener
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={c.operacion === "delete" && c.gano === "SERVIDOR"}
                      title={c.operacion === "delete" ? "Un borrado en conflicto nunca se aplica" : ""}
                      onClick={() => void resolver(c, "RESTAURAR_PERDEDOR")}
                    >
                      Restaurar la otra
                    </Button>
                  </div>
                </Td>
              </tr>
              {abierto === c.id && (
                <tr>
                  <td colSpan={6} className="px-4 py-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      {(["version_local", "version_servidor"] as const).map((k) => (
                        <div key={k}>
                          <p className="mb-1 text-xs font-bold uppercase text-[#93c5fd]">{k === "version_local" ? "Versión del equipo sin señal" : "Versión del servidor"}</p>
                          <pre className="max-h-64 overflow-auto rounded-lg bg-black/30 p-2 text-[11px] text-[#e5e7eb]">{JSON.stringify((c[k] as { data?: unknown })?.data ?? c[k], null, 2)}</pre>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </Table>
      </Card>
    </div>
  );
}
