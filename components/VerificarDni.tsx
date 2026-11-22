"use client";

// Botón "Verificar" junto a cada campo de DNI del ERP (igual que el de RUC). Consulta RENIEC con Decolecta
// (misma conexión que el RUC) y entrega nombres y apellidos para autocompletar. Si no se puede verificar,
// muestra el aviso y deja seguir a mano: el DNI nunca bloquea el formulario.

import { useState } from "react";
import { AlertTriangle, Loader2, Search, ShieldCheck } from "lucide-react";
import { MSG_DNI_8, MSG_DNI_FALLO, useDniVerificado, verificarDni, type DniReniec } from "@/lib/dni";
import { cn } from "@/components/ui";

export function VerificarDni({
  dni,
  onVerificado,
  className,
  verificadoAt,
}: {
  dni: string | undefined | null;
  /** Se llama con los datos de RENIEC para completar el formulario. */
  onVerificado?: (r: DniReniec) => void;
  className?: string;
  /** Fecha guardada de una verificación anterior (registros ya verificados). */
  verificadoAt?: string;
}) {
  const n = (dni ?? "").replace(/\D/g, "");
  const r = useDniVerificado(n);
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState<{ dni: string; msg: string } | null>(null);

  if (!n) return null;
  if (n.length !== 8)
    return (
      <span className={cn("mt-1 flex items-center gap-1 text-xs font-medium text-red-600", className)} role="alert">
        <AlertTriangle size={13} /> {MSG_DNI_8}
      </span>
    );

  const verificar = async () => {
    setConsultando(true);
    setError(null);
    try {
      onVerificado?.(await verificarDni(n));
    } catch (e) {
      setError({ dni: n, msg: e instanceof Error ? e.message : `${MSG_DNI_FALLO}.` });
    } finally {
      setConsultando(false);
    }
  };
  const err = error?.dni === n ? error.msg : "";
  const fecha = r?.verificadoAt ?? verificadoAt;

  return (
    <span className={cn("mt-1 flex flex-wrap items-center gap-1.5 text-xs", className)} role="status">
      {consultando ? (
        <span className="inline-flex items-center gap-1 text-plomo-500">
          <Loader2 size={13} className="animate-spin" /> Consultando RENIEC…
        </span>
      ) : r || verificadoAt ? (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
          <ShieldCheck size={13} /> DNI verificado en RENIEC{r ? ` · ${r.nombreCompleto}` : ""}
          {fecha ? ` · ${new Date(fecha).toLocaleDateString("es-PE")}` : ""}
        </span>
      ) : err ? (
        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
          <AlertTriangle size={13} /> {err}
        </span>
      ) : null}
      {!consultando && !r && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void verificar();
          }}
          className="inline-flex items-center gap-1 rounded-md border border-plomo-200 px-2 py-0.5 font-medium text-corp hover:bg-plomo-100"
        >
          <Search size={12} /> Verificar
        </button>
      )}
    </span>
  );
}
