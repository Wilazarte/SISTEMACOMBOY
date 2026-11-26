"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CloudUpload, Loader2, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/erp-comercial/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/erp-comercial/ui/table";
import { Input } from "@/components/erp-comercial/ui/input";
import { Button } from "@/components/erp-comercial/ui/button";
import { api } from "@/lib/erp-comercial/api-client";
import { cn, soles } from "@/lib/erp-comercial/utils";
import { prorratear, rentabilidad, totalesCostos, type CostosIn, type ManoObraIn, type MaterialIn } from "@/lib/erp-comercial/costos";

type EquipoInfo = { id: string; codigo: string; nombre: string; categoria: string; precioLista: number };
type Estado = "guardado" | "pendiente" | "guardando" | "error";

const SERVICIOS_BASE = ["Luz trifásica", "Alquiler taller", "Agua", "Internet", "Gas/Soldadura", "Transporte", "Herramientas"];
const UNIDADES = ["und", "pza", "kg", "m", "m²", "L", "juego", "rollo", "plancha"];
const nuevoMaterial = (): MaterialIn => ({ nombre: "", cantidad: 1, unidad: "und", costoUnitario: 0 });

const vacio = (): CostosIn => ({
  diasFabricacion: 0,
  materiales: [nuevoMaterial()],
  manoObra: [
    { rol: "Soldador", horas: 0, costoHora: 0 },
    { rol: "Electricista", horas: 0, costoHora: 0 },
    { rol: "Armador", horas: 0, costoHora: 0 },
  ],
  servicios: SERVICIOS_BASE.map((nombre) => ({ nombre, costoMensual: 0 })),
});

// Datos que la versión anterior guardaba en el navegador; se ofrecen para importar una sola vez.
const legacyKey = (codigo: string) => `comboy:costos:${codigo}`;
type Legacy = {
  diasFabricacion?: number;
  materiales?: { material?: string; cantidad?: number; unidad?: string; costoUnitario?: number }[];
  manoObra?: ManoObraIn[];
  servicios?: { concepto?: string; costoMensual?: number }[];
};
function leerLegacy(codigo: string): CostosIn | null {
  try {
    const raw = localStorage.getItem(legacyKey(codigo));
    if (!raw) return null;
    const l = JSON.parse(raw) as Legacy;
    return {
      diasFabricacion: l.diasFabricacion ?? 0,
      materiales: (l.materiales ?? []).map((m) => ({ nombre: m.material ?? "", cantidad: m.cantidad ?? 0, unidad: m.unidad ?? "und", costoUnitario: m.costoUnitario ?? 0 })),
      manoObra: l.manoObra ?? [],
      servicios: (l.servicios ?? []).map((s) => ({ nombre: s.concepto ?? "", costoMensual: s.costoMensual ?? 0 })),
    };
  } catch {
    return null;
  }
}
function borrarLegacy(codigo: string) {
  try {
    localStorage.removeItem(legacyKey(codigo));
  } catch {}
}

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function NumInput({ value, onChange, className, step = "any" }: { value: number; onChange: (n: number) => void; className?: string; step?: string }) {
  return (
    <Input
      type="number"
      min={0}
      step={step}
      inputMode="decimal"
      className={cn("text-right tabular-nums", className)}
      value={value === 0 ? "" : value}
      placeholder="0"
      onChange={(e) => onChange(num(e.target.value))}
    />
  );
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button size="icon" variant="ghost" title="Quitar fila" onClick={onClick}>
      <Trash2 className="text-rose-400" />
    </Button>
  );
}

function TotalRow({ label, value, cols }: { label: string; value: number; cols: number }) {
  return (
    <TR className="bg-muted/40 hover:bg-muted/40">
      <TD colSpan={cols - 2} className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</TD>
      <TD className="text-right font-semibold tabular-nums">{soles(value)}</TD>
      <TD />
    </TR>
  );
}

function EstadoGuardado({ estado, onRetry }: { estado: Estado; onRetry: () => void }) {
  if (estado === "guardando") return <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Guardando…</span>;
  if (estado === "pendiente") return <span className="text-sm text-muted-foreground">Cambios sin guardar…</span>;
  if (estado === "error")
    return (
      <button onClick={onRetry} className="flex items-center gap-1.5 text-sm text-rose-400 hover:underline">
        <TriangleAlert className="h-4 w-4" />No se pudo guardar · reintentar
      </button>
    );
  return <span className="flex items-center gap-1.5 text-sm text-emerald-400"><Check className="h-4 w-4" />Guardado</span>;
}

/** embedded = dentro de la pestaña del detalle del equipo (sin encabezado de página). */
export function CostosClient({ equipo, inicial, embedded = false }: { equipo: EquipoInfo; inicial: CostosIn | null; embedded?: boolean }) {
  const router = useRouter();
  const [c, setC] = useState<CostosIn>(() => inicial ?? vacio());
  const [estado, setEstado] = useState<Estado>("guardado");
  const [legacy, setLegacy] = useState<CostosIn | null>(null);
  const editado = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Si la BD aún no tiene costeo pero el navegador tiene datos de la versión anterior, ofrecer importarlos.
  useEffect(() => {
    if (!inicial) setLegacy(leerLegacy(equipo.codigo));
  }, [inicial, equipo.codigo]);

  async function guardarAhora(datos: CostosIn) {
    setEstado("guardando");
    try {
      await api(`/erp/api/equipos/${equipo.id}/costos`, "PUT", datos);
      setEstado("guardado");
      router.refresh(); // refresca cifras del servidor (resumen del detalle, costoBase)
      return true;
    } catch {
      setEstado("error");
      return false;
    }
  }

  // Guardado automático 700 ms después del último cambio.
  useEffect(() => {
    if (!editado.current) return;
    setEstado("pendiente");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => guardarAhora(c), 700);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);

  // Avisar si se intenta salir con cambios sin guardar.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (estado !== "guardado") e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [estado]);

  const cambiar = (fn: (p: CostosIn) => CostosIn) => {
    editado.current = true;
    setC(fn);
  };
  const set = <K extends keyof CostosIn>(k: K, v: CostosIn[K]) => cambiar((p) => ({ ...p, [k]: v }));
  const upd = <T,>(arr: T[], i: number, patch: Partial<T>) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x));

  const t = totalesCostos(c);
  const totalServMensual = c.servicios.reduce((s, x) => s + x.costoMensual, 0);
  const precio = equipo.precioLista;
  const { ganancia, margen } = rentabilidad(precio, t.total);

  function reiniciar() {
    if (confirm(`¿Borrar todo el costeo de ${equipo.codigo}? Se guardará vacío en la base de datos.`)) cambiar(() => vacio());
  }

  async function importarLegacy() {
    if (!legacy) return;
    clearTimeout(timer.current);
    setC(legacy);
    if (await guardarAhora(legacy)) {
      borrarLegacy(equipo.codigo);
      setLegacy(null);
    }
  }

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Montos en soles (S/). Los cambios se guardan automáticamente.</p>
          <div className="flex items-center gap-2">
            <EstadoGuardado estado={estado} onRetry={() => guardarAhora(c)} />
            <Button variant="ghost" size="sm" onClick={reiniciar}><RotateCcw />Reiniciar</Button>
          </div>
        </div>
      ) : (
        <PageHeader
          title={`Costo de producción · ${equipo.nombre}`}
          subtitle={`${equipo.codigo} · ${equipo.categoria} · montos en soles (S/)`}
          actions={
            <>
              <div className="mr-2 flex items-center"><EstadoGuardado estado={estado} onRetry={() => guardarAhora(c)} /></div>
              <Button asChild variant="outline"><Link href="/erp/equipos"><ArrowLeft />Equipos</Link></Button>
              <Button variant="ghost" onClick={reiniciar}><RotateCcw />Reiniciar</Button>
            </>
          }
        />
      )}

      {legacy && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-700/50 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
          <span>Este navegador tiene un costeo de {equipo.codigo} guardado con la versión anterior (localStorage). ¿Pasarlo a la base de datos?</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={importarLegacy}><CloudUpload />Importar</Button>
            <Button size="sm" variant="ghost" onClick={() => { borrarLegacy(equipo.codigo); setLegacy(null); }}>Descartar</Button>
          </div>
        </div>
      )}

      {/* 1. MATERIALES */}
      <Card>
        <CardHeader>
          <CardTitle>Materiales y componentes (BOM)</CardTitle>
          <CardDescription>Lista de materiales que lleva un equipo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border">
            <Table>
              <THead>
                <TR>
                  <TH>Material</TH><TH className="w-28 text-right">Cantidad</TH><TH className="w-32">Unidad</TH>
                  <TH className="w-36 text-right">Costo unitario</TH><TH className="w-36 text-right">Subtotal</TH><TH className="w-12" />
                </TR>
              </THead>
              <TBody>
                {c.materiales.map((m, i) => (
                  <TR key={i}>
                    <TD><Input value={m.nombre} placeholder="Ej. Plancha acero 3mm" onChange={(e) => set("materiales", upd(c.materiales, i, { nombre: e.target.value }))} /></TD>
                    <TD><NumInput value={m.cantidad} onChange={(n) => set("materiales", upd(c.materiales, i, { cantidad: n }))} /></TD>
                    <TD><Input list="unidades" value={m.unidad} onChange={(e) => set("materiales", upd(c.materiales, i, { unidad: e.target.value }))} /></TD>
                    <TD><NumInput value={m.costoUnitario} onChange={(n) => set("materiales", upd(c.materiales, i, { costoUnitario: n }))} /></TD>
                    <TD className="text-right tabular-nums">{soles(m.cantidad * m.costoUnitario)}</TD>
                    <TD><DelBtn onClick={() => set("materiales", c.materiales.filter((_, j) => j !== i))} /></TD>
                  </TR>
                ))}
                {!c.materiales.length && <TR><TD colSpan={6} className="py-6 text-center text-muted-foreground">Sin materiales</TD></TR>}
                <TotalRow label="Total materiales" value={t.materiales} cols={6} />
              </TBody>
            </Table>
            <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          <Button variant="outline" size="sm" onClick={() => set("materiales", [...c.materiales, nuevoMaterial()])}>
            <Plus />Agregar material
          </Button>
        </CardContent>
      </Card>

      {/* 2. MANO DE OBRA */}
      <Card>
        <CardHeader>
          <CardTitle>Mano de obra</CardTitle>
          <CardDescription>Horas de trabajo por rol para fabricar un equipo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border">
            <Table>
              <THead>
                <TR>
                  <TH>Rol</TH><TH className="w-28 text-right">Horas</TH><TH className="w-36 text-right">Costo por hora</TH>
                  <TH className="w-36 text-right">Subtotal</TH><TH className="w-12" />
                </TR>
              </THead>
              <TBody>
                {c.manoObra.map((m, i) => (
                  <TR key={i}>
                    <TD><Input value={m.rol} placeholder="Ej. Pintor" onChange={(e) => set("manoObra", upd(c.manoObra, i, { rol: e.target.value }))} /></TD>
                    <TD><NumInput value={m.horas} onChange={(n) => set("manoObra", upd(c.manoObra, i, { horas: n }))} /></TD>
                    <TD><NumInput value={m.costoHora} onChange={(n) => set("manoObra", upd(c.manoObra, i, { costoHora: n }))} /></TD>
                    <TD className="text-right tabular-nums">{soles(m.horas * m.costoHora)}</TD>
                    <TD><DelBtn onClick={() => set("manoObra", c.manoObra.filter((_, j) => j !== i))} /></TD>
                  </TR>
                ))}
                <TotalRow label="Total mano de obra" value={t.manoObra} cols={5} />
              </TBody>
            </Table>
          </div>
          <Button variant="outline" size="sm" onClick={() => set("manoObra", [...c.manoObra, { rol: "", horas: 0, costoHora: 0 }])}>
            <Plus />Agregar rol
          </Button>
        </CardContent>
      </Card>

      {/* 3. SERVICIOS */}
      <Card>
        <CardHeader>
          <CardTitle>Servicios y gastos de taller (overhead)</CardTitle>
          <CardDescription>Prorrateo = costo mensual ÷ 30 × días de fabricación.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Días que toma fabricar el equipo</span>
            <div className="w-28"><NumInput value={c.diasFabricacion} step="1" onChange={(n) => set("diasFabricacion", n)} /></div>
            <span className="text-sm text-muted-foreground">días</span>
          </div>
          <div className="rounded-xl border">
            <Table>
              <THead>
                <TR>
                  <TH>Concepto</TH><TH className="w-40 text-right">Costo mensual</TH><TH className="w-36 text-right">Prorrateo</TH><TH className="w-12" />
                </TR>
              </THead>
              <TBody>
                {c.servicios.map((s, i) => (
                  <TR key={i}>
                    <TD><Input value={s.nombre} placeholder="Ej. Seguridad" onChange={(e) => set("servicios", upd(c.servicios, i, { nombre: e.target.value }))} /></TD>
                    <TD><NumInput value={s.costoMensual} onChange={(n) => set("servicios", upd(c.servicios, i, { costoMensual: n }))} /></TD>
                    <TD className="text-right tabular-nums">{soles(prorratear(s.costoMensual, c.diasFabricacion))}</TD>
                    <TD><DelBtn onClick={() => set("servicios", c.servicios.filter((_, j) => j !== i))} /></TD>
                  </TR>
                ))}
                <TR className="bg-muted/40 hover:bg-muted/40">
                  <TD className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</TD>
                  <TD className="text-right tabular-nums text-muted-foreground">{soles(totalServMensual)} / mes</TD>
                  <TD className="text-right font-semibold tabular-nums">{soles(t.servicios)}</TD>
                  <TD />
                </TR>
              </TBody>
            </Table>
          </div>
          <Button variant="outline" size="sm" onClick={() => set("servicios", [...c.servicios, { nombre: "", costoMensual: 0 }])}>
            <Plus />Agregar gasto
          </Button>
        </CardContent>
      </Card>

      {/* 4. RESUMEN */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen final</CardTitle>
          <CardDescription>Costo total de producción por unidad y rentabilidad.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <Table>
              <TBody>
                <TR><TD>Materiales y componentes</TD><TD className="text-right tabular-nums">{soles(t.materiales)}</TD></TR>
                <TR><TD>Mano de obra</TD><TD className="text-right tabular-nums">{soles(t.manoObra)}</TD></TR>
                <TR><TD>Servicios y gastos de taller ({c.diasFabricacion} días)</TD><TD className="text-right tabular-nums">{soles(t.servicios)}</TD></TR>
                <TR className="bg-muted/40 hover:bg-muted/40">
                  <TD className="font-semibold uppercase tracking-wide">Costo total de producción</TD>
                  <TD className="text-right text-lg font-bold tabular-nums">{soles(t.total)}</TD>
                </TR>
                <TR>
                  <TD>Precio lista<div className="text-xs text-muted-foreground">Del catálogo de Equipos</div></TD>
                  <TD className="text-right font-medium tabular-nums">{soles(precio)}</TD>
                </TR>
                <TR>
                  <TD>Ganancia (precio − costo)</TD>
                  <TD className={cn("text-right font-semibold tabular-nums", ganancia < 0 ? "text-rose-400" : "text-emerald-400")}>{soles(ganancia)}</TD>
                </TR>
                <TR>
                  <TD>Margen % (ganancia ÷ precio)</TD>
                  <TD className={cn("text-right font-semibold tabular-nums", (margen ?? 0) < 0 ? "text-rose-400" : "text-emerald-400")}>
                    {margen === null ? "—" : `${margen.toFixed(1)}%`}
                  </TD>
                </TR>
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
