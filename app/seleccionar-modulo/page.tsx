"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CLAVE_SELECCION, MODULOS_SELECCION, type TarjetaModulo } from "@/components/modulos-login";

/** Esquinas cortadas de 8 px de las tarjetas. */
const CORTE = "[clip-path:polygon(8px_0,calc(100%-8px)_0,100%_8px,100%_calc(100%-8px),calc(100%-8px)_100%,8px_100%,0_calc(100%-8px),0_8px)]";

/** Selección de módulo antes del login: 3 tarjetas arriba y 2 centradas abajo. */
export default function SeleccionarModulo() {
  const router = useRouter();
  const [logo, setLogo] = useState("/logo-comboy.png");

  const elegir = (m: TarjetaModulo) => {
    try {
      window.localStorage.setItem(CLAVE_SELECCION, m.id);
    } catch {
      /* almacenamiento bloqueado */
    }
    router.push(`/login?modulo=${m.id}`);
  };

  const fila1 = MODULOS_SELECCION.slice(0, 3);
  const fila2 = MODULOS_SELECCION.slice(3);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0F1E3A] p-6">
      <Globo />

      <div className="relative z-10 rounded-xl bg-white px-8 py-4 shadow-[0_0_30px_rgba(227,6,19,0.3)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} onError={() => setLogo("/logo_comboy_navy.png")} alt="COMBOY VID" className="h-16 w-auto object-contain" />
      </div>
      <h1 className="relative z-10 mt-8 text-center text-3xl font-bold tracking-tight text-white [text-shadow:0_2px_24px_rgba(227,6,19,0.45)] md:text-4xl">Sistema de gestión ERP COMBOY VID</h1>
      <p className="relative z-10 mx-auto mt-3 max-w-4xl text-center text-sm text-gray-300 md:text-base">
        Plataforma integral para la gestión minera: compras, tesorería, almacén, planilla y gerencia en un solo lugar. Selecciona tu módulo
      </p>

      <div className="relative z-10 mx-auto mt-12 w-full max-w-6xl">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {fila1.map((m) => (
            <Tarjeta key={m.id} m={m} onElegir={elegir} />
          ))}
        </div>
        <div className="mx-auto mt-4 flex max-w-[700px] flex-wrap justify-center gap-4 md:mt-6 md:gap-6">
          {fila2.map((m) => (
            <Tarjeta key={m.id} m={m} onElegir={elegir} className="w-full md:w-[calc(50%-12px)]" />
          ))}
        </div>
      </div>
    </div>
  );
}

function Tarjeta({ m, onElegir, className = "" }: { m: TarjetaModulo; onElegir: (m: TarjetaModulo) => void; className?: string }) {
  const Icon = m.icon;
  const diagonal = "absolute h-[2px] w-[11.4px] origin-left bg-[#E30613]/60 transition-colors duration-300 group-hover:bg-[#E30613]";
  return (
    // El brillo exterior va en este contenedor: el clip-path de la tarjeta recortaría un box-shadow
    <div className={`group transition-all duration-300 [filter:drop-shadow(0_0_10px_rgba(227,6,19,0.2))] hover:scale-[1.03] hover:[filter:drop-shadow(0_0_25px_rgba(227,6,19,0.5))] ${className}`}>
      <button
        type="button"
        data-modulo={m.id}
        onClick={() => onElegir(m)}
        className={`relative block h-full w-full cursor-pointer overflow-hidden rounded-[10px] border border-[#E30613]/60 bg-[#0A1628]/85 p-6 text-left shadow-[inset_0_0_15px_rgba(227,6,19,0.15)] backdrop-blur-md transition-all duration-300 group-hover:border-[#E30613] group-hover:shadow-[inset_0_0_22px_rgba(227,6,19,0.28)] ${CORTE}`}
      >
        {/* Bordes de las esquinas cortadas */}
        <span aria-hidden className={`${diagonal} left-0 top-2 -rotate-45`} />
        <span aria-hidden className={`${diagonal} left-[calc(100%-8px)] top-0 rotate-45`} />
        <span aria-hidden className={`${diagonal} left-full top-[calc(100%-8px)] rotate-[135deg]`} />
        <span aria-hidden className={`${diagonal} left-2 top-full -rotate-[135deg]`} />
        {/* Puntitos decorativos: 3 arriba a la derecha, 2 abajo a la izquierda */}
        <span aria-hidden className="absolute right-4 top-4 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-[#E30613] opacity-80 transition-opacity group-hover:opacity-100" />
          ))}
        </span>
        <span aria-hidden className="absolute bottom-4 left-4 flex gap-1">
          {[0, 1].map((i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-[#E30613] opacity-60 transition-opacity group-hover:opacity-100" />
          ))}
        </span>

        <Icon className="h-7 w-7 text-[#E30613] transition-transform duration-300 group-hover:scale-110 md:h-9 md:w-9" strokeWidth={1.75} />
        <p className="mt-4 text-lg font-bold uppercase leading-snug text-white">{m.titulo}</p>
        <p className="mt-1 pb-2 text-sm text-gray-300">{m.desc}</p>
      </button>
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
            <stop offset="100%" stopColor="#0F1E3A" stopOpacity="0" />
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
