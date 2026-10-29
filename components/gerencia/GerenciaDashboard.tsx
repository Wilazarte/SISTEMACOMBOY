"use client";

import { Fragment, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, ChevronRight, Clock, Radio, Workflow } from "lucide-react";
import { ErpAlertList, type ErpAlerta } from "@/components/erp/ErpAlertList";
import { ErpTable, ErpTd } from "@/components/erp/ErpTable";
import { cn } from "@/components/erp/cn";
import { Barra, Etiqueta, Panel } from "@/components/logistica/piezas";
import { ChatGrupal, ReunionGrupal } from "@/components/logistica/planta";
import { useSesion } from "@/lib/auth";
import { ETAPAS, LIMITE_ETAPA_MS, MODULOS_GERENCIA, criticidad, msDe, useAhora, useGerencia, type Etapa, type FilaFlujo } from "@/lib/gerencia";
import { fechaPE, soles } from "@/lib/storage";

const COLOR = {
  rojo: { borde: "border-[#ef4444]", texto: "text-[#f87171]", fondo: "bg-[#ef4444]/10", punto: "bg-[#ef4444]" },
  amarillo: { borde: "border-[#eab308]", texto: "text-[#facc15]", fondo: "bg-[#eab308]/10", punto: "bg-[#eab308]" },
  verde: { borde: "border-[#22c55e]", texto: "text-[#4ade80]", fondo: "bg-[#22c55e]/10", punto: "bg-[#22c55e]" },
};

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });

/** Hora del último movimiento: HH:MM si es de hoy; si no, dd/mm (y la hora si se registró). */
function horaDe(f: string, ahora: number): string {
  const ms = msDe(f);
  if (f.length <= 10) return fechaPE(f);
  const mismoDia = new Date(ms).toLocaleDateString("es-PE", { timeZone: "America/Lima" }) === new Date(ahora).toLocaleDateString("es-PE", { timeZone: "America/Lima" });
  return mismoDia ? hhmm(ms) : `${fechaPE(f.slice(0, 10))} ${hhmm(ms)}`;
}

/** Tiempo en la etapa: 45 min, 3 h 10 min, 4 d 2 h. */
function duracion(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

function TablaFlujo({ filas, ahora, vacio }: { filas: FilaFlujo[]; ahora: number; vacio: string }) {
  const etiqueta = (id: Etapa) => ETAPAS.find((e) => e.id === id)?.label ?? id;
  return (
    <ErpTable head={["Hora", "Módulo", "Doc", "Estado", "Responsable", "Tiempo en etapa"]} empty={filas.length === 0} vacio={vacio}>
      {filas.map((f) => {
        const t = ahora - msDe(f.desde);
        const tarde = t > LIMITE_ETAPA_MS;
        return (
          <tr key={f.clave}>
            <ErpTd className="tabular">{horaDe(f.desde, ahora)}</ErpTd>
            <ErpTd>
              <span className="font-semibold text-white">{f.modulo}</span>
              <span className="text-[#a1a1aa]"> · {etiqueta(f.etapa)}</span>
            </ErpTd>
            <ErpTd className="font-semibold text-white">{f.doc}</ErpTd>
            <ErpTd>
              <Etiqueta tono="gris">{f.estado}</Etiqueta>
            </ErpTd>
            <ErpTd>{f.responsable}</ErpTd>
            <ErpTd className={cn("tabular font-semibold", tarde ? "text-[#f87171]" : "text-[#4ade80]")}>{duracion(t)}</ErpTd>
          </tr>
        );
      })}
    </ErpTable>
  );
}

/**
 * Dashboard Gerencia (War Room, pantalla grande): ticker de métricas, flujo de trabajo completo con
 * criticidad por etapa, pendientes por módulo, alertas y la tabla del flujo en tiempo real.
 * Solo lectura: no hay botones que operen ni accesos a módulos operativos.
 */
export function GerenciaDashboard() {
  const { sesion } = useSesion();
  const g = useGerencia();
  const ahora = useAhora();
  const [etapa, setEtapa] = useState<Etapa | null>(null);

  const ticker = [
    { label: "Compras activas", valor: soles(g.ticker.comprasActivas) },
    { label: "En tránsito", valor: `${g.ticker.enTransito} ${g.ticker.enTransito === 1 ? "envío" : "envíos"}` },
    { label: "OP activas", valor: String(g.ticker.opActivas) },
    { label: "PT disponible", valor: `${g.ticker.ptDisponible} ${g.ticker.ptDisponible === 1 ? "equipo" : "equipos"}` },
    { label: "Facturación hoy", valor: soles(g.ticker.facturacionHoy) },
  ];

  const maxModulo = Math.max(1, ...MODULOS_GERENCIA.map((m) => g.porModulo[m]));

  // Alertas críticas: stock crítico, facturas de proveedor vencidas y cobranzas vencidas (sin enlaces: solo lectura)
  const alertas: ErpAlerta[] = useMemo(
    () => [
      ...g.stockCritico.map((s) => ({ clave: `st:${s.id}`, titulo: `Stock crítico · ${s.nombre}`, detalle: s.sede, icono: <AlertTriangle size={15} />, derecha: <Etiqueta>{`${s.cantidad} ${s.unidad}`}</Etiqueta> })),
      ...g.cxpVencidas.map((f) => ({ clave: `cxp:${f.id}`, titulo: `Factura vencida ${f.numero} · ${f.proveedor}`, detalle: `Venció ${fechaPE(f.fechaVencimiento)}`, derecha: <Etiqueta>{soles(f.netoPagar ?? f.total)}</Etiqueta> })),
      ...g.cxcVencidas.map((n) => ({ clave: `cxc:${n.id}`, titulo: `Cobranza vencida ${n.numero} · ${n.cliente}`, detalle: "Nota de pedido por cobrar", derecha: <Etiqueta>{soles(n.total)}</Etiqueta> })),
    ],
    [g.stockCritico, g.cxpVencidas, g.cxcVencidas]
  );
  const recordatorios: ErpAlerta[] = g.recordatorios.map((p) => ({ clave: p.clave, titulo: p.titulo, detalle: p.detalle, derecha: <Etiqueta tono="gris">{p.etiqueta}</Etiqueta> }));

  const seleccion = etapa ? ETAPAS.find((e) => e.id === etapa)! : null;

  return (
    <div className="space-y-5 text-[#e5e7eb]">
      {/* Fila 1: ticker tipo bolsa */}
      <section aria-label="Indicadores en vivo" className="flex items-stretch overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#141414]">
        <span className="flex shrink-0 items-center gap-2 bg-[#ff6b00] px-4 text-[13px] font-bold uppercase text-white">
          <Radio size={16} className="animate-pulse" /> En vivo · {hhmm(ahora)}
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden py-3">
          <div className="ticker-pista flex w-max gap-10 whitespace-nowrap pl-6">
            {[0, 1].map((copia) => (
              <Fragment key={copia}>
                {ticker.map((t) => (
                  <span key={`${copia}-${t.label}`} aria-hidden={copia === 1} className="flex items-center gap-2 text-[15px] lg:text-[17px]">
                    <span className="font-semibold uppercase text-[#a1a1aa]">{t.label}:</span>
                    <span className="font-bold text-white">{t.valor}</span>
                    <span className="pl-8 text-[#ff6b00]">|</span>
                  </span>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Fila 2: flujo de trabajo principal */}
      <Panel titulo="Flujo de trabajo principal" icono={<Workflow size={17} />} accion={<span className="text-[12px] text-[#a1a1aa]">Rojo &gt; 5 pendientes · Amarillo 3 a 5 · Verde 0 a 2 · Clic para ver el detalle</span>}>
        <div className="flex flex-wrap items-stretch gap-2 xl:flex-nowrap">
          {ETAPAS.map((e, i) => {
            const n = g.porEtapa[e.id];
            const c = COLOR[criticidad(n)];
            const activa = etapa === e.id;
            return (
              <Fragment key={e.id}>
                {i > 0 && <ChevronRight size={20} className="hidden shrink-0 self-center text-[#ff6b00] xl:block" aria-hidden />}
                <button
                  type="button"
                  aria-pressed={activa}
                  onClick={() => setEtapa(activa ? null : e.id)}
                  className={cn(
                    "flex min-w-[120px] flex-1 flex-col items-center gap-1 rounded-xl border-2 px-3 py-4 text-center transition",
                    c.borde,
                    activa ? c.fondo : "bg-[#1c1c1c] hover:bg-[#232323]"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-bold uppercase text-white">
                    <span className={cn("h-2 w-2 rounded-full", c.punto)} aria-hidden /> {e.label}
                  </span>
                  <span className={cn("text-4xl font-bold tabular", c.texto)}>{n}</span>
                  <span className="text-[11px] text-[#a1a1aa]">{e.modulo}</span>
                </button>
              </Fragment>
            );
          })}
        </div>
        {seleccion && (
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-bold uppercase text-[#ff8a3d]">
              Detalle · {seleccion.label} ({g.porEtapa[seleccion.id]}) · solo lectura
            </p>
            <TablaFlujo filas={g.filas.filter((f) => f.etapa === seleccion.id)} ahora={ahora} vacio={`Sin documentos en ${seleccion.label}.`} />
          </div>
        )}
      </Panel>

      {/* Fila 3: pendientes por módulo | alertas y recordatorios */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel titulo="Pendientes urgentes por módulo" icono={<BarChart3 size={17} />}>
          <ul className="space-y-4">
            {MODULOS_GERENCIA.map((m) => {
              const n = g.porModulo[m];
              return (
                <li key={m}>
                  <span className="mb-1.5 flex items-center justify-between text-[15px]">
                    <span className="font-semibold text-white">{m}</span>
                    <span className={cn("font-bold tabular", COLOR[criticidad(n)].texto)}>{n}</span>
                  </span>
                  <Barra pct={(n / maxModulo) * 100} />
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[12px] text-[#a1a1aa]">Documentos detenidos en las etapas del flujo que le tocan a cada módulo.</p>
        </Panel>
        <Panel titulo="Alertas críticas y recordatorios" icono={<AlertTriangle size={17} />} className="space-y-5">
          <ErpAlertList titulo="Alertas críticas" icono={<AlertTriangle size={15} />} items={alertas} vacio="Sin alertas críticas." max={6} />
          <ErpAlertList titulo="Recordatorios" icono={<Clock size={15} />} items={recordatorios} vacio="Sin recordatorios." max={6} />
        </Panel>
      </div>

      {/* Reuniones y chat: GERENCIA no entra a los módulos, pero sí a las reuniones y al chat grupal */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <ReunionGrupal sesion={sesion} modulo="Gerencia" otrasSalas={["Logística", "Almacén", "Finanzas", "Producción"]} />
        </Panel>
        <Panel>
          <ChatGrupal sesion={sesion} modulo="Gerencia" />
        </Panel>
      </div>

      {/* Fila 4: flujo en tiempo real */}
      <Panel titulo="Flujo en tiempo real" icono={<Activity size={17} />} accion={<span className="text-[12px] text-[#a1a1aa]">Más de 2 h en la misma etapa: en rojo · {g.filas.length} documento(s) en curso</span>}>
        <TablaFlujo filas={g.filas.slice(0, 25)} ahora={ahora} vacio="No hay documentos en curso." />
      </Panel>
    </div>
  );
}

export default GerenciaDashboard;
