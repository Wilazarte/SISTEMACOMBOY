"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Palette, Settings2 } from "lucide-react";
import { defTema, etiquetaModulo, TEMAS, type DefTema, type TemaId } from "@/lib/temas";
import { useTemaOpcional } from "./TemaProvider";

export const RUTA_CONFIGURACION = "/configuracion";

const ORIGEN: Record<string, string> = {
  modulo: "tema del módulo",
  usuario: "tu tema",
  global: "tema de todo el ERP",
  predeterminado: "predeterminado",
};

/** Muestra de un tema: fondo, barra, tarjeta, texto y acentos (los 5 colores que pide el selector). */
export function MuestraTema({ t, grande = false }: { t: DefTema; grande?: boolean }) {
  const c = t.colores;
  return (
    <span
      aria-hidden
      className={`relative block overflow-hidden rounded-lg border ${grande ? "h-20" : "h-11"}`}
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <span className="absolute inset-y-0 left-0 w-[22%]" style={{ backgroundColor: c.sidebar, borderRight: `1px solid ${c.border}` }} />
      <span className="absolute left-[30%] right-[8%] top-[18%] bottom-[18%] rounded-md border" style={{ backgroundColor: c.card, borderColor: c.border }}>
        <span className="absolute left-[10%] top-[22%] h-[14%] w-[45%] rounded-full" style={{ backgroundColor: c.text }} />
        <span className="absolute left-[10%] top-[50%] h-[12%] w-[30%] rounded-full" style={{ backgroundColor: c.muted }} />
        <span className="absolute bottom-[18%] right-[10%] h-[30%] w-[22%] rounded" style={{ backgroundColor: c.accent }} />
        <span className="absolute bottom-[18%] right-[36%] h-[30%] w-[12%] rounded" style={{ backgroundColor: c.accent2 }} />
      </span>
    </span>
  );
}

/** Lista de los 6 temas para elegir (cabecera y Configuración). `valor` = tema elegido en ese ámbito. */
export function OpcionesTema({ valor, onElegir, compacto = false }: { valor?: TemaId; onElegir: (t: TemaId) => void; compacto?: boolean }) {
  return (
    <div className={`grid gap-2 ${compacto ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"}`}>
      {TEMAS.map((t) => {
        const activo = valor === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onElegir(t.id)}
            aria-pressed={activo}
            className={`group rounded-xl border bg-surface p-1.5 text-left transition hover:border-[var(--accent)] ${activo ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-plomo-200"}`}
          >
            <MuestraTema t={t} grande={!compacto} />
            <span className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-bold text-fg">{t.nombre}</span>
                <span className="block truncate text-[11px] text-plomo-500">{t.estilo}</span>
              </span>
              {activo && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "var(--accent)", color: "var(--on-accent)" }}>
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type Ambito = "usuario" | "modulo" | "global";

/**
 * Botón de la cabecera (paleta): elige el tema al instante para tu usuario, el módulo actual o todo el ERP
 * (los dos últimos solo SOPORTE). El detalle (otros módulos, otros usuarios) está en Configuración › Temas.
 */
export function BotonTema() {
  const t = useTemaOpcional();
  const [abierto, setAbierto] = useState(false);
  const [ambito, setAmbito] = useState<Ambito>("usuario");
  const [error, setError] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  if (!t) return null; // fuera de ErpLayout no hay temas
  const valor: TemaId | undefined =
    ambito === "global" ? t.config.global : ambito === "modulo" ? t.config.modulos[t.modulo] : t.config.usuarios[t.usuario];

  const elegir = async (tema: TemaId | null) => {
    setError("");
    const r =
      ambito === "global" ? await t.setThemeGlobal(tema) : ambito === "modulo" ? await t.setThemePorModulo(t.modulo, tema) : await t.setThemePorUsuario(t.usuario, tema);
    if (r) setError(`Se aplicó en este equipo, pero no se guardó en el servidor: ${r}`);
  };

  const ambitos: [Ambito, string][] = [["usuario", "Mi usuario"]];
  if (t.puedeAdministrar && t.modulo) ambitos.push(["modulo", `Módulo ${etiquetaModulo(t.modulo)}`]);
  if (t.puedeAdministrar) ambitos.push(["global", "Todo el ERP"]);
  const tapado = ambito === "usuario" && t.config.modulos[t.modulo];

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`${abierto ? "" : "tip "}flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] glass-card text-[#d4d4d8] transition hover-cian hover:text-white`}
        data-tip={`Tema: ${defTema(t.tema).nombre}`}
        aria-label="Cambiar tema de color"
        aria-expanded={abierto}
      >
        <Palette size={18} />
      </button>
      {abierto && (
        <div className="selector-tema absolute right-0 top-[calc(100%+10px)] z-50 w-[min(360px,calc(100vw-24px))] animate-bajar rounded-2xl border border-plomo-200 bg-surface p-3 text-fg shadow-pop">
          <p className="text-[13px] font-bold">Tema de color</p>
          <p className="mb-2 text-[11.5px] text-plomo-500">
            Ahora: <b className="text-fg">{defTema(t.tema).nombre}</b> ({ORIGEN[t.origen]}). Solo cambian los colores.
          </p>
          {ambitos.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Aplicar a">
              {ambitos.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={ambito === id}
                  onClick={() => setAmbito(id)}
                  className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ${ambito === id ? "border-transparent" : "border-plomo-200 text-plomo-600 hover:text-fg"}`}
                  style={ambito === id ? { backgroundColor: "var(--accent)", color: "var(--on-accent)" } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <OpcionesTema valor={valor} onElegir={(id) => void elegir(id)} compacto />
          {tapado && (
            <p className="mt-2 rounded-lg bg-plomo-100 px-2 py-1.5 text-[11.5px] text-plomo-600">
              Este módulo tiene su propio tema ({defTema(t.config.modulos[t.modulo]).nombre}) y manda sobre el tuyo; tu tema se ve en los demás módulos.
            </p>
          )}
          {error && <p className="mt-2 text-[11.5px] font-semibold text-rojo">{error}</p>}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-plomo-200 pt-2">
            <button type="button" onClick={() => void elegir(null)} disabled={!valor} className="text-[12px] font-semibold text-plomo-600 hover:text-fg disabled:opacity-40">
              Quitar ({ambito === "usuario" ? "usar el del ERP" : ambito === "modulo" ? "sin tema propio" : "volver a COMBOY VID"})
            </button>
            <Link href={RUTA_CONFIGURACION} onClick={() => setAbierto(false)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--accent-ink)] hover:underline">
              <Settings2 size={14} /> Configuración
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
