"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CloudUpload, Eye, Loader2, Search, ShieldAlert } from "lucide-react";
import { EV_PESTANA, Kbd, Toaster, toast, type PestanaActiva } from "@/components/ui";
import { DocViewerHost, abrirDoc, type DocRef } from "@/components/doc-viewer";
import { ObservacionesGerencia } from "@/components/ObservacionesGerencia";
import { AccionRapida } from "@/components/shell/AccionRapida";
import { Campana } from "@/components/shell/Campana";
import { CommandPalette, IconoDoc, type Comando } from "@/components/shell/CommandPalette";
import { useIr } from "@/components/shell/ir";
import { accionesDe, hrefSub, moduloDe, navDe } from "@/components/shell/nav";
import { FloatingDock } from "@/components/layout/FloatingDock";
import { ModuloContenido, ModuloLayout, SEDE_PLANTA_PRINCIPAL } from "@/components/layout/ModuloLayout";
import { NotificationSidebar } from "@/components/layout/NotificationSidebar";
import { DatalistCatalogo } from "@/components/productos/ProductoInput";
import { detenerCatalogo, iniciarCatalogo } from "@/lib/productos";
import { olvidarSedes } from "@/lib/sedes";
import { RUTA_SUCURSAL, inicioDe, soloSecocha, logout, puedeVer, useSesion, veTesoreria } from "@/lib/auth";
import { contarDatosLocales, subirDatosLocales } from "@/lib/migracion";
import { useNotificaciones } from "@/lib/notificaciones";
import { limpiarPrefs, usePrefs } from "@/lib/preferencias";
import { KEYS, detenerDatos, getCotizaciones, getFacturas, getGuias, getOrdenes, getPendientes, getProcesados, useDatos, useStore } from "@/lib/storage";
import type { OrdenDespacho } from "@/lib/types";
import { avisoOD, getDespachos, odsNuevas } from "@/lib/ventas";

interface Resultado extends DocRef {
  numero: string;
  detalle: string;
  estado: string;
}

function buscar(q: string): Resultado[] {
  const t = q.trim().toUpperCase();
  if (t.length < 2) return [];
  const out: Resultado[] = [];
  const reqs = [...getPendientes(), ...getProcesados()];
  reqs.forEach((r) => out.push({ tipo: "REQ", id: r.id, numero: r.numero, detalle: `${r.sede} · ${r.solicitante}`, estado: r.estado }));
  getCotizaciones().forEach((c) => out.push({ tipo: "COTI", id: c.id, numero: `COT ${c.numero}`, detalle: `${c.proveedor} · ${c.reqNumero}`, estado: c.estado }));
  getOrdenes().forEach((o) => out.push({ tipo: "OC", id: o.id, numero: o.numero, detalle: `${o.proveedor} · ${o.reqNumero}`, estado: o.estado }));
  getFacturas().forEach((f) => out.push({ tipo: "FACTURA", id: f.id, numero: f.numero, detalle: `${f.proveedor} · ${f.ocNumero}`, estado: f.estadoPago }));
  getGuias().forEach((g) => out.push({ tipo: "GUIA", id: g.id, numero: `GUÍA ${g.numero}`, detalle: `${g.facturaNumero} · ${g.ocNumero}`, estado: g.estado }));
  return out.filter((r) => `${r.numero} ${r.detalle}`.toUpperCase().includes(t)).slice(0, 12);
}

/** Flujo de trabajo de cada módulo: subtítulo pequeño del encabezado (ya no es barra). */
const FLUJOS: [string, string][] = [
  ["/dashboard/compras", "Requerimiento → Cotización → OC → Bancarización → Factura"],
  ["/dashboard/almacen", "Requerimiento → Ingreso a almacén → Stock → Orden de Despacho → Entrega"],
  ["/dashboard/produccion", "Orden de Producción → QC firmado → Ingreso a Almacén → Venta → Despacho"],
  ["/dashboard/ventas", "Nota de Pedido → Aprobación → Orden de Despacho → Factura / Boleta → Cobro"],
  ["/dashboard/planilla", "Trabajadores → Planilla del periodo → Historial → Contratistas"],
  ["/dashboard/contable", "Libro Diario → Mayor → Balance → Estados Financieros"],
  ["/dashboard/creador", "Asistencia → Edición manual → Planilla"],
  ["/dashboard", "Resumen → Compras → Almacén → Ventas → Contable"],
];
/** Título centrado del encabezado: MODULO <nombre> (Inventario = Almacén, Reportes = Contable). */
const NOMBRE_MODULO: [string, string][] = [
  ["/dashboard/compras", "TESORERIA"],
  ["/dashboard/ventas", "VENTAS"],
  ["/dashboard/almacen", "INVENTARIO"],
  ["/dashboard/contable", "REPORTES"],
  ["/dashboard/produccion", "PRODUCCION"],
  ["/dashboard/creador", "CREADOR"],
];
const flujoDe = (ruta: string) => FLUJOS.find(([r]) => ruta === r || ruta.startsWith(`${r}/`))?.[1] ?? "";

const CLAVE_NOTIF = "erp-notificaciones-abierta";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const ir = useIr();
  const { sesion, listo } = useSesion();
  const datos = useDatos(!!sesion);
  const prefs = usePrefs();
  const notifs = useNotificaciones(sesion);
  // Solo Almacén / creador reciben el aviso de órdenes de despacho: los demás no descargan esa clave
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, [], ["creador", "almacen"].includes(sesion?.rol ?? ""));
  const [paleta, setPaleta] = useState(false);
  const [pestana, setPestana] = useState<PestanaActiva | null>(null);
  const [locales, setLocales] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  // Barra derecha de notificaciones: abierta por defecto en escritorio, cerrada en celular; se recuerda (por navegador)
  const [notifAbierta, setNotifAbierta] = useState(false);
  useEffect(() => {
    try {
      const g = window.localStorage.getItem(CLAVE_NOTIF);
      setNotifAbierta(g ? g === "1" : window.matchMedia("(min-width: 1024px)").matches);
    } catch {
      setNotifAbierta(window.matchMedia("(min-width: 1024px)").matches);
    }
  }, []);
  const alternarNotif = () =>
    setNotifAbierta((a) => {
      try {
        window.localStorage.setItem(CLAVE_NOTIF, a ? "0" : "1");
      } catch {
        /* almacenamiento bloqueado */
      }
      return !a;
    });

  useEffect(() => {
    if (listo && !sesion) {
      void detenerDatos();
      router.replace("/login");
    }
    // Usuario solo de Secocha (modulos = ["/secocha"]): no usa el ERP
    if (soloSecocha(sesion)) router.replace(RUTA_SUCURSAL);
  }, [listo, sesion, router]);

  // Almacén: aviso con detalle cuando Ventas genera una orden de despacho (en vivo)
  const odsAvisadas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!sesion || !datos.listo || !["creador", "almacen"].includes(sesion.rol)) return;
    const nuevas = odsNuevas(ods);
    if (odsAvisadas.current === null) {
      odsAvisadas.current = new Set(nuevas.map((o) => o.id)); // las que ya había al entrar: solo la campana
      return;
    }
    for (const o of nuevas)
      if (!odsAvisadas.current.has(o.id)) {
        odsAvisadas.current.add(o.id);
        // Solo si Supabase la guardó: si la rechaza, la caché vuelve atrás y no se avisa
        setTimeout(() => {
          if (odsNuevas(getDespachos()).some((x) => x.id === o.id)) toast(`Nueva orden de despacho: ${avisoOD(o)}`);
        }, 2500);
      }
  }, [ods, sesion, datos.listo]);

  // Catálogo maestro de productos: uno solo para todos los almacenes (lib/productos.ts)
  useEffect(() => {
    if (sesion) void iniciarCatalogo();
  }, [sesion]);

  useEffect(() => {
    if (datos.listo && sesion?.rol === "creador") setLocales(contarDatosLocales());
  }, [datos.listo, sesion]);

  // Pestaña abierta en la página (ruta del encabezado y submenú activo)
  useEffect(() => {
    const on = (e: Event) => setPestana((e as CustomEvent<PestanaActiva>).detail);
    window.addEventListener(EV_PESTANA, on);
    return () => window.removeEventListener(EV_PESTANA, on);
  }, []);
  const tabActiva = pestana && pestana.ruta === path ? pestana : null;

  const acciones = useMemo(() => (sesion ? accionesDe(sesion) : []), [sesion]);

  // Atajos de teclado: Ctrl+K / "/" buscador, N P R G acciones
  useEffect(() => {
    if (!sesion) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta((p) => !p);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']") || document.querySelector("[role='dialog']")) return;
      const k = e.key.toUpperCase();
      if (e.key === "/") {
        e.preventDefault();
        setPaleta(true);
      } else {
        const a = acciones.find((x) => x.tecla === k);
        if (a) {
          e.preventDefault();
          ir(a.href);
        }
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [sesion, acciones, ir]);

  const veCompras = sesion ? puedeVer(sesion, "/dashboard/compras") : false;
  const buscador = !!sesion && (veCompras || puedeVer(sesion, "/dashboard/almacen"));

  const comandos = useMemo<Comando[]>(() => {
    if (!sesion) return [];
    const nav = navDe(sesion);
    return [
      ...acciones.map((a) => ({ id: a.id, grupo: "Acciones", label: a.label, detalle: a.detalle, icon: a.icon, teclas: [a.tecla], run: () => ir(a.href) })),
      ...nav.map((n) => ({ id: n.href, grupo: "Ir a", label: n.label, detalle: n.subs.map((s) => s.label).slice(0, 4).join(" · "), icon: n.icon, run: () => ir(n.href) })),
      ...nav.flatMap((n) => n.subs.map((s) => ({ id: `${n.href}-${s.label}`, grupo: "Secciones", label: s.label, detalle: n.label, icon: n.icon, run: () => ir(hrefSub(n, s)) }))),
    ];
  }, [sesion, acciones, ir]);

  const documentos = useCallback(
    (q: string): Comando[] =>
      buscador
        ? buscar(q).map((r) => ({ id: r.tipo + r.id, grupo: "Documentos", label: r.numero, detalle: `${r.tipo} · ${r.detalle}`, estado: r.estado, icon: IconoDoc, run: () => abrirDoc({ tipo: r.tipo, id: r.id }) }))
        : [],
    [buscador]
  );

  const salir = async () => {
    await detenerDatos();
    await detenerCatalogo();
    olvidarSedes();
    await logout();
    limpiarPrefs();
    router.replace("/login");
  };

  if (!listo || !sesion || (!datos.listo && !datos.error))
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas text-plomo-500">
        <span className="flex h-11 w-11 animate-pulse items-center justify-center rounded-xl bg-corp text-sm font-bold text-white shadow-rojo">CV</span>
        <p className="flex items-center gap-2 text-sm">
          <Loader2 size={15} className="animate-spin" /> {sesion ? "Cargando datos…" : "Verificando sesión…"}
        </p>
      </div>
    );

  if (datos.error)
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <div className="max-w-md animate-emerger rounded-2xl border border-plomo-200 bg-surface p-8 text-center shadow-pop">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rojo-soft text-rojo">
            <AlertTriangle size={24} />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-fg">No se pudieron cargar los datos</h1>
          <p className="mt-1 text-sm text-plomo-600">{datos.error}</p>
          <div className="mt-6 flex justify-center gap-2">
            <button onClick={() => window.dispatchEvent(new Event("erp:reintentar"))} className="rounded-lg bg-corp px-5 py-2 text-[13px] font-medium text-white shadow-rojo hover:bg-vino-900">
              Reintentar
            </button>
            <button onClick={salir} className="rounded-lg border border-plomo-200 bg-surface px-5 py-2 text-[13px] font-medium text-fg hover:bg-plomo-50">
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );

  const subirLocales = async () => {
    if (!confirm(`Se subirán a Supabase ${locales} registro(s) guardados en este navegador (sin duplicar los que ya existen). ¿Continuar?`)) return;
    setSubiendo(true);
    try {
      const n = await subirDatosLocales();
      toast(`Datos subidos: ${n} registro(s) nuevo(s). Ya se ven en todas las PCs.`);
      setLocales(0);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSubiendo(false);
    }
  };

  const permitido = path === "/dashboard/compras" ? veTesoreria(sesion) : puedeVer(sesion, path);
  const actual = moduloDe(path);
  const modulo = actual && actual.href !== "/dashboard" ? actual.href : undefined;
  const enPlanilla = path.startsWith("/dashboard/planilla") || (path === "/dashboard/compras" && tabActiva?.id === "planilla");
  const nombreModulo = enPlanilla ? "PLANILLA" : (NOMBRE_MODULO.find(([r]) => path === r || path.startsWith(`${r}/`))?.[1] ?? "DASHBOARD");

  return (
    <ModuloLayout
      moduleName={nombreModulo}
      sede={SEDE_PLANTA_PRINCIPAL}
      inicio={inicioDe(sesion)}
      sesion={sesion}
      onSalir={salir}
      // Con la barra de notificaciones abierta, en escritorio el contenido deja 320px a la derecha
      mainClassName={notifAbierta ? "lg:pr-[320px]" : ""}
      extra={
        <>
          <button
            onClick={() => setPaleta(true)}
            className="flex h-9 items-center gap-2.5 rounded-lg border border-gray-700 bg-[#1e293b] px-2.5 text-[13px] text-gray-300 transition hover:text-white 2xl:w-72"
            aria-label="Abrir buscador global (Ctrl K)"
            title={buscador ? "Buscar REQ, OC, factura… (Ctrl K)" : "Buscar o ir a… (Ctrl K)"}
          >
            <Search size={15} className="shrink-0" />
            <span className="hidden flex-1 truncate text-left 2xl:block">{buscador ? "Buscar REQ, OC, factura…" : "Buscar o ir a…"}</span>
            <span className="hidden items-center gap-1 lg:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <Campana notifs={notifs} vistas={prefs.notifVistas ?? []} />
          {locales > 0 && (
            <button
              onClick={subirLocales}
              disabled={subiendo}
              className="tip flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
              data-tip={`Subir datos de este navegador (${locales})`}
              aria-label="Subir datos de este navegador"
            >
              {subiendo ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
            </button>
          )}
        </>
      }
      overlays={
        <>
          <NotificationSidebar notifs={notifs} vistas={prefs.notifVistas ?? []} abierta={notifAbierta} onToggle={alternarNotif} enSeccion={path === "/dashboard/compras" && veCompras ? ["requerimiento"] : []} />
          <FloatingDock sesion={sesion} tab={tabActiva?.id} />
          <AccionRapida acciones={acciones} />
          <CommandPalette abierto={paleta} onCerrar={() => setPaleta(false)} comandos={comandos} documentos={documentos} />
          <DocViewerHost />
          <DatalistCatalogo />
          <Toaster />
        </>
      }
    >
      {sesion.modulos.length === 0 ? (
        <Aviso titulo="Sin módulos asignados">
          Su usuario ({sesion.usuario}, rol {sesion.rol}) inició sesión, pero todavía no tiene módulos habilitados. El administrador debe asignarlos en la tabla perfiles (columna modulos).
        </Aviso>
      ) : !permitido ? (
        <Aviso
          titulo="Acceso denegado"
          accion={
            <Link href={inicioDe(sesion)} className="mt-5 inline-flex rounded-lg bg-corp px-5 py-2 text-[13px] font-medium text-white shadow-rojo hover:bg-vino-900">
              Ir a mi módulo
            </Link>
          }
        >
          Su usuario ({sesion.usuario}) no tiene permiso para ver este módulo.
        </Aviso>
      ) : (
        <ModuloContenido
          key={path}
          sesion={sesion}
          sede={SEDE_PLANTA_PRINCIPAL}
          flujo={flujoDe(path === "/dashboard/compras" && tabActiva?.id === "planilla" ? "/dashboard/planilla" : path)}
          avisos={
            <>
              {sesion.soloLectura && (
                <div className="flex w-full items-center gap-2 rounded-xl border border-plomo-200 bg-surface px-4 py-2.5 text-sm text-fg-2 shadow-card">
                  <Eye size={16} className="shrink-0 text-plomo-500" /> Modo solo lectura: puede revisar todo y registrar observaciones, pero no guardar, editar ni eliminar.
                </div>
              )}
              {modulo && (
                <div className="w-full">
                  <ObservacionesGerencia modulo={modulo} sesion={sesion} />
                </div>
              )}
            </>
          }
        >
          {children}
        </ModuloContenido>
      )}
    </ModuloLayout>
  );
}

function Aviso({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-md animate-emerger rounded-2xl border border-plomo-200 bg-surface p-8 text-center shadow-card">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rojo-soft text-rojo">
        <ShieldAlert size={24} />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-fg">{titulo}</h1>
      <p className="mt-1 text-sm text-plomo-500">{children}</p>
      {accion}
    </div>
  );
}
