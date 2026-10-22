"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPlus } from "lucide-react";
import { CLAVE_SELECCION, MODULOS_SELECCION, RUTA_REQUERIMIENTO, type TarjetaModulo } from "@/components/modulos-login";

/** Esquinas cortadas de 8 px de las tarjetas. */
const CORTE = "[clip-path:polygon(8px_0,calc(100%-8px)_0,100%_8px,100%_calc(100%-8px),calc(100%-8px)_100%,8px_100%,0_calc(100%-8px),0_8px)]";

/** Selección de módulo antes del login: todo centrado, dock de 5 módulos sobre el globo rojo. */
export default function SeleccionarModulo() {
  const router = useRouter();
  const [logo, setLogo] = useState("/comboy-logo.png");
  // Módulo con brillo: el que se señala, o el último elegido
  const [activo, setActivo] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  useEffect(() => {
    try {
      setUltimo(window.localStorage.getItem(CLAVE_SELECCION));
    } catch {
      /* almacenamiento bloqueado */
    }
  }, []);

  const ir = (m: TarjetaModulo, siguiente?: string) => {
    try {
      window.localStorage.setItem(CLAVE_SELECCION, m.id);
    } catch {
      /* almacenamiento bloqueado */
    }
    router.push(`/login?modulo=${m.id}${siguiente ? `&siguiente=${encodeURIComponent(siguiente)}` : ""}`);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-4 py-10 md:px-6">
      <Globo />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        onError={() => setLogo("/logo_comboy_navy.png")}
        alt="COMBOY VID"
        className="relative z-10 mx-auto h-20 w-auto object-contain [filter:drop-shadow(0_0_14px_rgba(255,255,255,0.35))_drop-shadow(0_0_30px_rgba(227,6,19,0.35))]"
      />
      <h1 className="relative z-10 mt-8 text-center text-2xl font-bold uppercase tracking-wider text-white [text-shadow:0_2px_24px_rgba(227,6,19,0.5)] md:text-4xl">
        Bienvenido al sistema ERP COMBOY VID
      </h1>
      <div className="relative z-10 mx-auto mt-3 h-1 w-12 rounded-full bg-[#E30613]" />
      <p className="relative z-10 mt-3 text-center text-xs uppercase tracking-[0.3em] text-gray-300 md:text-sm">Selecciona tu módulo</p>

      <div className="relative z-10 mx-auto mt-10 grid w-full max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5" onMouseLeave={() => setActivo(null)}>
        {MODULOS_SELECCION.map((m) => (
          <Tarjeta
            key={m.id}
            m={m}
            brilla={!m.proximamente && (activo ?? ultimo) === m.id}
            onSenalar={() => setActivo(m.id)}
            onElegir={() => ir(m)}
            onRequerimiento={m.id === "produccion" ? () => ir(m, RUTA_REQUERIMIENTO) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function Tarjeta({ m, brilla, onSenalar, onElegir, onRequerimiento }: { m: TarjetaModulo; brilla: boolean; onSenalar: () => void; onElegir: () => void; onRequerimiento?: () => void }) {
  const Icon = m.icon;
  const off = !!m.proximamente;
  const diagonal = `absolute h-[2px] w-[11.4px] origin-left transition-colors duration-300 ${brilla ? "bg-[#E30613]" : "bg-[#E30613]/60"}`;
  return (
    // El brillo exterior va en este contenedor: el clip-path de la tarjeta recortaría un box-shadow
    <div
      onMouseEnter={off ? undefined : onSenalar}
      onFocus={off ? undefined : onSenalar}
      className={`transition-all duration-300 ${
        off
          ? "opacity-55 grayscale"
          : brilla
            ? "scale-[1.03] [filter:drop-shadow(0_0_25px_rgba(227,6,19,0.55))]"
            : "[filter:drop-shadow(0_0_10px_rgba(227,6,19,0.2))]"
      }`}
    >
      <div
        className={`relative flex h-full min-h-[190px] flex-col overflow-hidden rounded-[10px] border bg-[#0A1628]/85 p-5 text-left backdrop-blur-md transition-all duration-300 ${CORTE} ${
          brilla ? "border-[#E30613] shadow-[inset_0_0_24px_rgba(227,6,19,0.3)]" : "border-[#E30613]/60 shadow-[inset_0_0_15px_rgba(227,6,19,0.15)]"
        }`}
      >
        {/* Bordes de las esquinas cortadas */}
        <span aria-hidden className={`${diagonal} left-0 top-2 -rotate-45`} />
        <span aria-hidden className={`${diagonal} left-[calc(100%-8px)] top-0 rotate-45`} />
        <span aria-hidden className={`${diagonal} left-full top-[calc(100%-8px)] rotate-[135deg]`} />
        <span aria-hidden className={`${diagonal} left-2 top-full -rotate-[135deg]`} />
        {/* Puntitos decorativos: 3 arriba a la derecha, 2 abajo a la izquierda */}
        <span aria-hidden className="absolute right-4 top-4 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-[#E30613] opacity-80" />
          ))}
        </span>
        <span aria-hidden className="absolute bottom-3 left-4 flex gap-1">
          {[0, 1].map((i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-[#E30613] opacity-60" />
          ))}
        </span>

        <Icon className={`h-7 w-7 text-[#E30613] transition-transform duration-300 md:h-9 md:w-9 ${brilla ? "scale-110" : ""}`} strokeWidth={1.75} />
        {/* Toda la tarjeta es el botón del módulo (after:inset-0); "Realizar requerimiento" queda encima */}
        <button
          type="button"
          data-modulo={m.id}
          onClick={onElegir}
          disabled={off}
          aria-disabled={off}
          className="mt-4 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none disabled:cursor-not-allowed [&:not(:disabled)]:cursor-pointer"
        >
          <span className="block text-base font-bold uppercase leading-snug text-white">{m.titulo}</span>
        </button>
        <p className="mt-1 text-sm text-gray-300">{m.desc}</p>

        <div className="mt-auto pt-4">
          {off && (
            <span className="inline-flex rounded-full border border-gray-500/50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-300">Próximamente</span>
          )}
          {onRequerimiento && (
            <button
              type="button"
              onClick={onRequerimiento}
              className="relative z-10 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#E30613] px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-[0_0_14px_rgba(227,6,19,0.45)] transition hover:bg-[#B8050F]"
            >
              <ClipboardPlus size={15} /> Realizar requerimiento
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Globo
// Globo 3D de malla con "mundo de puntos": proyección ortográfica de una grilla
// de latitud/longitud; los puntos se dibujan donde un ruido suave marca "tierra".
const R = 300;
const INCLINACION = (-20 * Math.PI) / 180; // eje inclinado
const GIRO = (25 * Math.PI) / 180; // longitud que mira al frente

function proyectar(lat: number, lon: number): { x: number; y: number; z: number } {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180 + GIRO;
  const x = Math.cos(la) * Math.sin(lo);
  const y = Math.sin(la);
  const z = Math.cos(la) * Math.cos(lo);
  // rotación del eje (inclinación hacia el observador)
  const y2 = y * Math.cos(INCLINACION) - z * Math.sin(INCLINACION);
  const z2 = y * Math.sin(INCLINACION) + z * Math.cos(INCLINACION);
  return { x: R + x * R, y: R - y2 * R, z: z2 };
}

const tierra = (lat: number, lon: number) =>
  Math.sin(lat * 0.075 + 1.1) * Math.cos(lon * 0.05 - 0.4) + 0.6 * Math.sin(lon * 0.11 + lat * 0.04 + 2) + 0.35 * Math.cos(lat * 0.19 - lon * 0.07) > 0.45;

const PUNTOS: { x: number; y: number; o: number }[] = [];
for (let lat = -78; lat <= 78; lat += 4.5)
  for (let lon = -180; lon < 180; lon += 4.5 / Math.max(0.35, Math.cos((lat * Math.PI) / 180))) {
    if (!tierra(lat, lon)) continue;
    const p = proyectar(lat, lon);
    if (p.z > 0.02) PUNTOS.push({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), o: +(0.35 + p.z * 0.65).toFixed(2) });
  }

/** Línea de la malla (paralelo o meridiano), solo la cara visible. */
function trazo(puntos: { x: number; y: number; z: number }[]): string {
  let d = "";
  let dibujando = false;
  for (const p of puntos) {
    if (p.z < 0) {
      dibujando = false;
      continue;
    }
    d += `${dibujando ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    dibujando = true;
  }
  return d;
}

const MALLA: string[] = [
  ...[-60, -40, -20, 0, 20, 40, 60].map((lat) => trazo(Array.from({ length: 121 }, (_, i) => proyectar(lat, -180 + i * 3)))),
  ...Array.from({ length: 12 }, (_, k) => -180 + k * 30).map((lon) => trazo(Array.from({ length: 61 }, (_, i) => proyectar(-90 + i * 3, lon)))),
];

function Globo() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center opacity-90">
      <div className="absolute h-[120vmin] w-[120vmin] rounded-full bg-[radial-gradient(circle,rgba(227,6,19,0.3)_0%,rgba(227,6,19,0.08)_45%,transparent_70%)] blur-2xl" />
      <svg viewBox={`-20 -20 ${R * 2 + 40} ${R * 2 + 40}`} className="h-[115vmin] w-[115vmin] blur-[0.6px] motion-safe:animate-flotar md:h-[95vmin] md:w-[95vmin]">
        <defs>
          <radialGradient id="globo-esfera" cx="38%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#E30613" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#8E0410" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={R} cy={R} r={R} fill="url(#globo-esfera)" stroke="#E30613" strokeOpacity="0.7" strokeWidth="1.6" />
        <g fill="none" stroke="#E30613" strokeOpacity="0.38" strokeWidth="0.9">
          {MALLA.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g fill="#FF3B45">
          {PUNTOS.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2.1" opacity={p.o} />
          ))}
        </g>
        <circle cx={R} cy={R} r={R + 8} fill="none" stroke="#E30613" strokeOpacity="0.18" strokeWidth="0.8" strokeDasharray="2 10" />
      </svg>
    </div>
  );
}
