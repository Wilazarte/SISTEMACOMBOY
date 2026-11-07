"use client";

// Piezas del estilo "terminal bursátil" del Dashboard Gerencia (pedido de Williams, 2026-11-07):
// cinta de cotizaciones en movimiento, cifras verde/rojo con flecha, velas semanales y curva acumulada.
// Todo se dibuja con SVG propio a partir de los datos reales del ERP; aquí no se calcula ni se inventa nada.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { montoCorto } from "@/components/logistica/planta";

export const SUBE = "#00d97e";
export const BAJA = "#ff3b5c";
const AZUL = "#2a7bff";
const GRIS = "#8b93a7";
const REJILLA = "rgba(255,255,255,0.07)";

/** Variación porcentual (null si no hay base para comparar). */
export const variacion = (actual: number, antes: number): number | null => (antes > 0 ? ((actual - antes) / antes) * 100 : actual > 0 ? null : 0);

/** ▲ +12.4% en verde, ▼ −3.1% en rojo, ■ 0.0% en gris; "NUEVO" cuando no hay base anterior. */
export function Delta({ pct, invertir = false, className }: { pct: number | null | undefined; /** Para cifras donde subir es malo (deuda vencida). */ invertir?: boolean; className?: string }) {
  if (pct === undefined) return null;
  if (pct === null)
    return (
      <span className={cn("mono font-bold", className)} style={{ color: SUBE }}>
        ▲ NUEVO
      </span>
    );
  const sube = pct > 0.05;
  const baja = pct < -0.05;
  const bueno = invertir ? baja : sube;
  const malo = invertir ? sube : baja;
  const color = bueno ? SUBE : malo ? BAJA : GRIS;
  const flecha = sube ? "▲" : baja ? "▼" : "■";
  return (
    <span className={cn("mono font-bold tabular-nums", className)} style={{ color }}>
      {flecha} {pct > 0 ? "+" : pct < 0 ? "−" : ""}
      {Math.abs(pct).toLocaleString("es-PE", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}
      %
    </span>
  );
}

export interface ItemCinta {
  simbolo: string;
  valor: string;
  pct?: number | null;
  invertir?: boolean;
  /** Sin variación: color fijo (alerta en rojo, neutro en blanco). */
  alerta?: boolean;
}

/** Cinta de cotizaciones (ticker tape): se desplaza sola, se detiene al pasar el mouse y respeta "reducir movimiento". */
export function CintaCotizaciones({ items }: { items: ItemCinta[] }) {
  const fila = (copia: number) => (
    <ul className="flex shrink-0 items-center" aria-hidden={copia > 0 ? true : undefined}>
      {items.map((it) => (
        <li key={`${copia}-${it.simbolo}`} className="mono flex items-center gap-2 whitespace-nowrap border-r border-white/[0.08] px-5 text-[13px]">
          <span className="font-bold tracking-wider text-[#facc15]">{it.simbolo}</span>
          <span className={cn("font-bold tabular-nums", it.alerta ? "text-[#ff3b5c]" : "text-white")}>{it.valor}</span>
          <Delta pct={it.pct} invertir={it.invertir} />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="cinta-bolsa relative overflow-hidden rounded-lg border border-white/[0.08] bg-black/70 py-2" role="marquee" aria-label="Cotizaciones del ERP en vivo">
      <div className="cinta-pista flex w-max">
        {fila(0)}
        {fila(1)}
      </div>
    </div>
  );
}

/** Mini gráfico de línea (sin ejes) para las cotizaciones. Verde si cierra arriba del inicio, rojo si abajo. */
export function Sparkline({ datos, alto = 34 }: { datos: number[]; alto?: number }) {
  if (datos.length < 2 || datos.every((v) => v === 0))
    return (
      <div style={{ height: alto }} className="mono flex items-end text-[10px] text-[#6b7280]">
        sin movimiento
      </div>
    );
  const ancho = 120;
  const max = Math.max(...datos);
  const min = Math.min(...datos);
  const y = (v: number) => alto - 3 - ((v - min) / (max - min || 1)) * (alto - 6);
  const x = (i: number) => (i / (datos.length - 1)) * ancho;
  const d = datos.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const color = datos[datos.length - 1] >= datos[0] ? SUBE : BAJA;
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" className="w-full" style={{ height: alto }} aria-hidden>
      <path d={`${d} L${ancho},${alto} L0,${alto} Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Tarjeta de "cotización": símbolo, cifra grande en monoespaciada, variación y sparkline. */
export function Cotizacion({
  simbolo,
  nombre,
  valor,
  pct,
  invertir,
  detalle,
  serie,
  icono,
  alerta,
}: {
  simbolo: string;
  nombre: string;
  valor: string;
  pct?: number | null;
  invertir?: boolean;
  detalle: string;
  serie?: number[];
  icono?: ReactNode;
  alerta?: boolean;
}) {
  return (
    <article className={cn("rounded-lg border bg-black/55 p-3.5", alerta ? "border-[#ff3b5c]/50" : "border-white/[0.08]")}>
      <header className="flex items-center justify-between gap-2">
        <span className="mono flex items-center gap-1.5 text-[12px] font-bold tracking-widest text-[#facc15]">
          {icono}
          {simbolo}
        </span>
        <Delta pct={pct} invertir={invertir} className="text-[12px]" />
      </header>
      <p className="mt-0.5 text-[12px] uppercase tracking-wide text-[#9ca3af]">{nombre}</p>
      <p className={cn("mono mt-1 text-[26px] font-bold leading-none tabular-nums", alerta ? "text-[#ff3b5c]" : "text-white")}>{valor}</p>
      {serie && (
        <div className="mt-2">
          <Sparkline datos={serie} />
        </div>
      )}
      <p className="mono mt-1.5 text-[11px] text-[#9ca3af]">{detalle}</p>
    </article>
  );
}

export interface Vela {
  etiqueta: string;
  /** Rango de fechas de la semana, para el tooltip. */
  rango: string;
  apertura: number;
  maximo: number;
  minimo: number;
  cierre: number;
  /** Volumen: comprobantes emitidos en la semana. */
  volumen: number;
  total: number;
}

/** Gráfico de velas japonesas: cada vela es una semana de ventas diarias (apertura = 1.er día, cierre = último). */
export function GraficoVelas({ velas }: { velas: Vela[] }) {
  const [activa, setActiva] = useState<number | null>(null);
  const W = 720;
  const H = 300;
  const izq = 8;
  const der = 62;
  const arriba = 12;
  const altoPrecio = 190;
  const altoVol = 52;
  const baseVol = arriba + altoPrecio + 26 + altoVol;
  const max = Math.max(1, ...velas.map((v) => v.maximo));
  const maxVol = Math.max(1, ...velas.map((v) => v.volumen));
  const paso = (W - izq - der) / Math.max(1, velas.length);
  const cuerpo = Math.min(22, paso * 0.56);
  const y = (v: number) => arriba + altoPrecio - (v / max) * altoPrecio;
  const lineas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const sinDatos = velas.every((v) => v.total === 0);
  const v = activa !== null ? velas[activa] : null;

  return (
    <div className="relative">
      <div className="-mx-1 overflow-x-auto px-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]" role="img" aria-label="Velas semanales de ventas diarias y volumen de comprobantes">
          {lineas.map((p) => (
            <g key={p}>
              <line x1={izq} x2={W - der} y1={y(p)} y2={y(p)} stroke={REJILLA} />
              <text x={W - der + 6} y={y(p) + 4} className="mono" fontSize={11} fill="#9ca3af">
                {montoCorto(p)}
              </text>
            </g>
          ))}
          <line x1={izq} x2={W - der} y1={baseVol} y2={baseVol} stroke={REJILLA} />
          <text x={W - der + 6} y={baseVol - altoVol + 10} className="mono" fontSize={10} fill="#9ca3af">
            VOL
          </text>
          {velas.map((vel, i) => {
            const cx = izq + paso * i + paso / 2;
            const sube = vel.cierre >= vel.apertura;
            const color = vel.total === 0 ? GRIS : sube ? SUBE : BAJA;
            const yA = y(Math.max(vel.apertura, vel.cierre));
            const yB = y(Math.min(vel.apertura, vel.cierre));
            const hVol = (vel.volumen / maxVol) * altoVol;
            return (
              <g key={vel.etiqueta + i} opacity={activa === null || activa === i ? 1 : 0.45}>
                <line x1={cx} x2={cx} y1={y(vel.maximo)} y2={y(vel.minimo)} stroke={color} strokeWidth={2} />
                <rect x={cx - cuerpo / 2} y={yA} width={cuerpo} height={Math.max(2, yB - yA)} rx={2} fill={sube ? color : "#0a0b0e"} stroke={color} strokeWidth={2} />
                {vel.volumen > 0 && <rect x={cx - cuerpo / 2} y={baseVol - hVol} width={cuerpo} height={hVol} rx={2} fill={color} opacity={0.4} />}
                <text x={cx} y={H - 4} textAnchor="middle" className="mono" fontSize={10} fill="#9ca3af">
                  {vel.etiqueta}
                </text>
                {/* Zona de hover más grande que la vela */}
                <rect x={izq + paso * i} y={0} width={paso} height={H} fill="transparent" onMouseEnter={() => setActiva(i)} onMouseLeave={() => setActiva(null)} onClick={() => setActiva(i)} />
              </g>
            );
          })}
          {sinDatos && (
            <text x={(W - der) / 2} y={arriba + altoPrecio / 2} textAnchor="middle" className="mono" fontSize={14} fill="#9ca3af">
              Sin comprobantes emitidos en las últimas semanas
            </text>
          )}
        </svg>
      </div>
      {v && (
        <div className="mono pointer-events-none absolute right-2 top-2 rounded-md border border-white/15 bg-black/90 px-3 py-2 text-[12px] leading-5 text-[#e5e7eb] shadow-lg">
          <p className="font-bold text-[#facc15]">{v.rango}</p>
          <p>
            Apertura {montoCorto(v.apertura)} · Cierre {montoCorto(v.cierre)}
          </p>
          <p>
            Máx {montoCorto(v.maximo)} · Mín {montoCorto(v.minimo)}
          </p>
          <p>
            Semana {montoCorto(v.total)} · {v.volumen} comprob.
          </p>
        </div>
      )}
    </div>
  );
}

/** Curva acumulada del mes actual contra el mes anterior, día a día (mismo eje: soles). Crosshair con tooltip. */
export function CurvaAcumulada({ actual, anterior, diaHoy, nombreActual, nombreAnterior }: { actual: number[]; anterior: number[]; diaHoy: number; nombreActual: string; nombreAnterior: string }) {
  const [dia, setDia] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 720;
  const H = 240;
  const izq = 8;
  const der = 62;
  const arriba = 14;
  const alto = H - arriba - 26;
  const dias = 31;
  const max = Math.max(1, ...actual, ...anterior);
  const x = (d: number) => izq + ((d - 1) / (dias - 1)) * (W - izq - der);
  const y = (v: number) => arriba + alto - (v / max) * alto;
  const camino = (s: number[]) => s.map((v, i) => `${i ? "L" : "M"}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const act = actual.slice(0, diaHoy);
  const color = (act[act.length - 1] ?? 0) >= (anterior[Math.min(diaHoy, anterior.length) - 1] ?? 0) ? SUBE : BAJA;
  const mover = (e: { clientX: number }) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setDia(Math.min(dias, Math.max(1, Math.round(((px - izq) / (W - izq - der)) * (dias - 1)) + 1)));
  };
  const finA = act.length ? act[act.length - 1] : 0;
  const finB = anterior.length ? anterior[anterior.length - 1] : 0;
  const etiquetas = useMemo(() => [1, 5, 10, 15, 20, 25, 31], []);

  return (
    <div className="relative">
      <div className="mono mb-2 flex flex-wrap gap-4 text-[12px] text-[#d4d4d8]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[3px] w-5 rounded" style={{ background: AZUL }} /> {nombreActual}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: GRIS }} /> {nombreAnterior}
        </span>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[560px]"
          role="img"
          aria-label="Ventas acumuladas del mes contra el mes anterior"
          onMouseMove={mover}
          onMouseLeave={() => setDia(null)}
          onTouchStart={(e) => mover(e.touches[0])}
          onTouchMove={(e) => mover(e.touches[0])}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={izq} x2={W - der} y1={y(f * max)} y2={y(f * max)} stroke={REJILLA} />
              <text x={W - der + 6} y={y(f * max) + 4} className="mono" fontSize={11} fill="#9ca3af">
                {montoCorto(f * max)}
              </text>
            </g>
          ))}
          {etiquetas.map((d) => (
            <text key={d} x={x(d)} y={H - 6} textAnchor="middle" className="mono" fontSize={10} fill="#9ca3af">
              {d}
            </text>
          ))}
          {anterior.length > 1 && <path d={camino(anterior)} fill="none" stroke={GRIS} strokeWidth={2} strokeDasharray="5 4" />}
          {act.length > 0 && (
            <>
              <path d={`${camino(act)} L${x(act.length)},${y(0)} L${x(1)},${y(0)} Z`} fill={AZUL} opacity={0.12} />
              <path d={camino(act)} fill="none" stroke={AZUL} strokeWidth={2} strokeLinejoin="round" />
              <circle cx={x(act.length)} cy={y(finA)} r={5} fill={AZUL} stroke="#0a0b0e" strokeWidth={2} className="punto-vivo" />
              <text x={Math.min(x(act.length) + 8, W - der - 70)} y={y(finA) - 8} className="mono" fontSize={12} fontWeight={700} fill={color}>
                {montoCorto(finA)}
              </text>
            </>
          )}
          {anterior.length > 1 && (
            <text x={W - der - 4} y={y(finB) - 6} textAnchor="end" className="mono" fontSize={11} fill="#9ca3af">
              {montoCorto(finB)}
            </text>
          )}
          {dia !== null && <line x1={x(dia)} x2={x(dia)} y1={arriba} y2={arriba + alto} stroke="#facc15" strokeDasharray="3 3" opacity={0.7} />}
        </svg>
      </div>
      {dia !== null && (
        <div className="mono pointer-events-none absolute left-2 top-8 rounded-md border border-white/15 bg-black/90 px-3 py-2 text-[12px] leading-5 text-[#e5e7eb] shadow-lg">
          <p className="font-bold text-[#facc15]">Día {dia}</p>
          <p>
            {nombreActual}: {dia <= act.length ? montoCorto(act[dia - 1]) : "—"}
          </p>
          <p>
            {nombreAnterior}: {dia <= anterior.length ? montoCorto(anterior[dia - 1]) : "—"}
          </p>
        </div>
      )}
    </div>
  );
}

/** Profundidad del flujo (estilo libro de órdenes): una barra por etapa, roja si está crítica. */
export function ProfundidadFlujo({
  filas,
}: {
  filas: {
    etiqueta: string;
    modulo: string;
    n: number;
    tono: "rojo" | "amarillo" | "verde";
  }[];
}) {
  const max = Math.max(1, ...filas.map((f) => f.n));
  const color = { rojo: BAJA, amarillo: "#facc15", verde: SUBE };
  return (
    <ul className="mono space-y-1.5 text-[12px]">
      {filas.map((f) => (
        <li key={f.etiqueta} className="grid grid-cols-[110px_minmax(0,1fr)_36px] items-center gap-2">
          <span className="truncate text-[#d4d4d8]" title={f.modulo}>
            {f.etiqueta}
          </span>
          <span className="h-3.5 overflow-hidden rounded-sm bg-white/[0.04]">
            <span
              className="block h-full rounded-sm"
              style={{
                width: `${Math.max(f.n ? 4 : 0, (f.n / max) * 100)}%`,
                background: color[f.tono],
                opacity: 0.75,
              }}
            />
          </span>
          <span className="text-right font-bold tabular-nums" style={{ color: color[f.tono] }}>
            {f.n}
          </span>
        </li>
      ))}
    </ul>
  );
}
