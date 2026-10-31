"use client";

// Estado del RUC en SUNAT junto a cada campo de RUC del ERP. Con 11 dígitos válidos consulta sola
// (una vez por RUC; si ya está validado en el sistema no gasta consulta). Sin RUC validado no se guarda:
// eso lo exige exigirRucSunat() en lib, este componente solo lo muestra y deja reintentar.

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { rucValido } from "@/lib/storage";
import { avisoRuc, useRucSunat, validarRuc, type RucSunat } from "@/lib/ruc";
import { cn } from "@/components/ui";

export function EstadoRuc({
  ruc,
  onValidado,
  className,
}: {
  ruc: string | undefined | null;
  /** Se llama con la respuesta de SUNAT (para completar razón social / dirección si están vacías). */
  onValidado?: (r: RucSunat) => void;
  className?: string;
}) {
  const n = (ruc ?? "").replace(/\D/g, "");
  const aplica = n.length === 11 && rucValido(n);
  const r = useRucSunat(aplica ? n : "");
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState("");
  const intentado = useRef("");
  const cb = useRef(onValidado);
  cb.current = onValidado;

  const consultar = async (forzar = false) => {
    setConsultando(true);
    setError("");
    try {
      const res = await validarRuc(n, { forzar });
      cb.current?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar SUNAT.");
    } finally {
      setConsultando(false);
    }
  };

  useEffect(() => {
    setError("");
    if (!aplica || intentado.current === n) return;
    intentado.current = n;
    if (r) return; // ya validado en el sistema
    const t = setTimeout(() => void consultar(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, aplica]);

  if (!aplica) return null;
  const aviso = avisoRuc(r);

  return (
    <span className={cn("mt-1 flex flex-wrap items-center gap-1.5 text-xs", className)} role="status">
      {consultando ? (
        <span className="inline-flex items-center gap-1 text-plomo-500">
          <Loader2 size={13} className="animate-spin" /> Consultando SUNAT…
        </span>
      ) : r ? (
        <span className={cn("inline-flex items-center gap-1 font-medium", aviso ? "text-amber-600" : "text-emerald-600")}>
          {aviso ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
          {aviso ? `RUC validado · ${aviso}` : "RUC validado en SUNAT"} · {r.razon_social}
        </span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1 font-medium text-red-600">
            <ShieldAlert size={13} /> {error || "RUC sin validar: obligatorio para guardar."}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              void consultar(true);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-plomo-200 px-2 py-0.5 font-medium text-corp hover:bg-plomo-100"
          >
            <RefreshCw size={12} /> Validar RUC
          </button>
        </>
      )}
    </span>
  );
}
