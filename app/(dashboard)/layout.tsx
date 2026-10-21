"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, CloudUpload, Eye, Home, Loader2, LogOut, Menu, Moon, PanelLeft, Search, ShieldAlert, Sun } from "lucide-react";
import { EV_PESTANA, ID_BARRA_PESTANAS, Kbd, Toaster, cn, toast, type PestanaActiva } from "@/components/ui";
import { DocViewerHost, abrirDoc, type DocRef } from "@/components/doc-viewer";
import { ObservacionesGerencia } from "@/components/ObservacionesGerencia";
import { Header } from "@/components/Header";
import { AccionRapida } from "@/components/shell/AccionRapida";
import { Apariencia } from "@/components/shell/Apariencia";
import { Campana } from "@/components/shell/Campana";
import { CommandPalette, IconoDoc, type Comando } from "@/components/shell/CommandPalette";
import { useIr } from "@/components/shell/ir";
import { accionesDe, hrefSub, moduloDe, navDe } from "@/components/shell/nav";
import { Sidebar } from "@/components/shell/Sidebar";
import { inicioDe, logout, puedeVer, useSesion } from "@/lib/auth";
import { contarDatosLocales, subirDatosLocales } from "@/lib/migracion";
import { useNotificaciones } from "@/lib/notificaciones";
import { guardarPrefs, limpiarPrefs, usePrefs } from "@/lib/preferencias";
import { KEYS, detenerDatos, getCotizaciones, getFacturas, getGuias, getOrdenes, getPendientes, getProcesados, useDatos, useStore } from "@/lib/storage";
import type { OrdenDespacho, Requerimiento } from "@/lib/types";
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

/** Flujo de trabajo de cada módulo (franja de contexto, para ubicarse rápido). */
const FLUJOS: [string, string][] = [
  ["/dashboard/compras", "Requerimiento → Cotización → Orden de Compra → Bancarización → Factura"],
  ["/dashboard/almacen", "Requerimiento → Ingreso a almacén → Stock → Orden de Despacho → Entrega"],
  ["/dashboard/produccion", "Orden de Producción → QC firmado → Ingreso a Almacén → Venta → Despacho"],
  ["/dashboard/ventas", "Nota de Pedido → Aprobación → Orden de Despacho → Factura / Boleta → Cobro"],
  ["/dashboard/planilla", "Trabajadores → Planilla del periodo → Historial → Contratistas"],
  ["/dashboard/contable", "Libro Diario → Mayor → Balance → Estados Financieros"],
  ["/dashboard/creador", "Asistencia → Edición manual → Planilla"],
  ["/dashboard", "Resumen → Compras → Almacén → Ventas → Contable"],
];
const flujoDe = (ruta: string) => FLUJOS.find(([r]) => ruta === r || ruta.startsWith(`${r}/`))?.[1] ?? "";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const ir = useIr();
  const { sesion, listo } = useSesion();
  const datos = useDatos(!!sesion);
  const prefs = usePrefs();
  const notifs = useNotificaciones(sesion);
  const pendientes = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const [menu, setMenu] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [pestana, setPestana] = useState<PestanaActiva | null>(null);
  const [locales, setLocales] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const plegado = prefs.menuPlegado ?? false;

  useEffect(() => {
    if (listo && !sesion) {
      void detenerDatos();
      router.replace("/login");
    }
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
  const alternarTema = useCallback(() => guardarPrefs({ tema: document.documentElement.classList.contains("dark") ? "claro" : "oscuro" }), []);
  const alternarMenu = useCallback(() => guardarPrefs({ menuPlegado: !plegado }), [plegado]);

  // Atajos de teclado: Ctrl+K / "/" buscador, N P R G acciones, T tema, [ menú
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
      } else if (e.key === "[") alternarMenu();
      else if (k === "T") alternarTema();
      else {
        const a = acciones.find((x) => x.tecla === k);
        if (a) {
          e.preventDefault();
          ir(a.href);
        }
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [sesion, acciones, alternarMenu, alternarTema, ir]);

  const veCompras = sesion ? puedeVer(sesion, "/dashboard/compras") : false;
  const buscador = !!sesion && (veCompras || puedeVer(sesion, "/dashboard/almacen"));

  const comandos = useMemo<Comando[]>(() => {
    if (!sesion) return [];
    const nav = navDe(sesion);
    return [
      ...acciones.map((a) => ({ id: a.id, grupo: "Acciones", label: a.label, detalle: a.detalle, icon: a.icon, teclas: [a.tecla], run: () => ir(a.href) })),
      ...nav.map((n) => ({ id: n.href, grupo: "Ir a", label: n.label, detalle: n.subs.map((s) => s.label).slice(0, 4).join(" · "), icon: n.icon, run: () => ir(n.href) })),
      ...nav.flatMap((n) => n.subs.map((s) => ({ id: `${n.href}-${s.label}`, grupo: "Secciones", label: s.label, detalle: n.label, icon: n.icon, run: () => ir(hrefSub(n, s)) }))),
      { id: "tema", grupo: "Preferencias", label: "Cambiar tema claro / oscuro", icon: Moon, teclas: ["T"], claves: "modo oscuro claro dark", run: alternarTema },
      { id: "menu", grupo: "Preferencias", label: plegado ? "Expandir menú lateral" : "Contraer menú lateral", icon: PanelLeft, teclas: ["["], run: alternarMenu },
      {
        id: "estilo",
        grupo: "Preferencias",
        label: prefs.menuEstilo === "rojo" ? "Menú lateral grafito" : "Menú lateral rojo sólido",
        icon: PanelLeft,
        run: () => guardarPrefs({ menuEstilo: prefs.menuEstilo === "rojo" ? "grafito" : "rojo" }),
      },
    ];
  }, [sesion, acciones, ir, alternarTema, alternarMenu, plegado, prefs.menuEstilo]);

  const documentos = useCallback(
    (q: string): Comando[] =>
      buscador
        ? buscar(q).map((r) => ({ id: r.tipo + r.id, grupo: "Documentos", label: r.numero, detalle: `${r.tipo} · ${r.detalle}`, estado: r.estado, icon: IconoDoc, run: () => abrirDoc({ tipo: r.tipo, id: r.id }) }))
        : [],
    [buscador]
  );

  const salir = async () => {
    await detenerDatos();
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

  const nav = navDe(sesion);
  const permitido = puedeVer(sesion, path);
  // Contador de Almacén: órdenes de despacho nuevas que creó Ventas
  const veDespacho = puedeVer(sesion, "/dashboard/almacen") && ["creador", "almacen"].includes(sesion.rol);
  const contadores: Record<string, number> = {
    "/dashboard/compras": pendientes.length,
    "/dashboard/almacen": veDespacho ? odsNuevas(ods).length : 0,
  };
  const actual = moduloDe(path);
  const modulo = actual && actual.href !== "/dashboard" ? actual.href : undefined;
  const subActual = actual?.subs.find((s) => (s.href ? s.href === path : tabActiva?.id === s.tab));
  const migas = [actual?.label ?? "Inicio", subActual?.label ?? tabActiva?.label ?? (path === "/dashboard" ? "Resumen" : undefined)].filter(Boolean) as string[];
  const soloIconos = plegado;

  return (
    <div className={cn("flex min-h-screen flex-col bg-canvas transition-[padding] duration-300 ease-suave", plegado ? "lg:pl-[68px]" : "lg:pl-[252px]")}>
      <Sidebar
        nav={nav}
        ruta={path}
        tab={tabActiva?.id ?? null}
        plegado={plegado}
        estilo={prefs.menuEstilo ?? "grafito"}
        abierto={menu}
        contadores={contadores}
        onPlegar={alternarMenu}
        onCerrar={() => setMenu(false)}
        pie={
          <div className="space-y-0.5">
            {locales > 0 && (
              <button
                onClick={subirLocales}
                disabled={subiendo}
                className="mb-1 flex w-full items-center gap-2 rounded-lg bg-white/[0.08] px-3 py-2 text-left text-xs font-medium text-white hover:bg-white/[0.12] disabled:opacity-60"
                title="Sube a Supabase los datos que este navegador tenía de la versión anterior"
              >
                {subiendo ? <Loader2 size={15} className="shrink-0 animate-spin" /> : <CloudUpload size={15} className="shrink-0" />}
                <span className={cn("truncate", soloIconos && "lg:hidden")}>Subir datos de este navegador ({locales})</span>
              </button>
            )}
            <Apariencia tema={prefs.tema ?? "sistema"} menu={prefs.menuEstilo ?? "grafito"} soloIcono={soloIconos} />
            <div className="flex items-center gap-2.5 px-1.5 pt-1.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sidebar-borde bg-white/[0.07] text-[11px] font-semibold uppercase text-white">
                {sesion.usuario.slice(0, 2)}
              </span>
              <div className={cn("min-w-0 flex-1 leading-tight", soloIconos && "lg:hidden")}>
                <p className="truncate text-[13px] font-medium text-white">{sesion.usuario}</p>
                <p className="truncate text-xs text-sidebar-sub">{sesion.nombre}</p>
              </div>
              <button onClick={salir} className={cn("rounded-lg p-2 text-sidebar-sub transition hover:bg-white/10 hover:text-white", soloIconos && "lg:hidden")} title="Cerrar sesión" aria-label="Cerrar sesión">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        }
      />
      {menu && <div className="fixed inset-0 z-30 animate-velo bg-black/50 lg:hidden" onClick={() => setMenu(false)} />}

      {/* Barra superior: ruta, buscador global, campana y tema */}
      <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-plomo-200 bg-canvas/85 px-4 backdrop-blur-md lg:px-7">
        <button className="rounded-lg p-1.5 text-fg hover:bg-plomo-100 lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menú">
          <Menu size={20} />
        </button>
        <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1.5 text-[13px] text-plomo-500">
          <Link href={inicioDe(sesion)} className="hidden rounded p-0.5 hover:text-fg sm:block" aria-label="Inicio">
            <Home size={15} />
          </Link>
          {migas.map((m, i) => (
            <span key={m + i} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight size={13} className={cn("shrink-0 text-plomo-200", i === 0 && "hidden sm:block")} />
              {i === 0 && actual && migas.length > 1 ? (
                <Link href={actual.href} className="truncate hover:text-fg">
                  {m}
                </Link>
              ) : (
                <span className={cn("truncate", i === migas.length - 1 && "font-medium text-fg")}>{m}</span>
              )}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setPaleta(true)}
            className="flex h-9 items-center gap-2.5 rounded-lg border border-plomo-200 bg-surface px-2.5 text-[13px] text-plomo-500 shadow-card transition hover:border-plomo-500/40 hover:text-fg sm:w-64 md:w-80"
            aria-label="Abrir buscador global (Ctrl K)"
          >
            <Search size={15} className="shrink-0" />
            <span className="hidden flex-1 truncate text-left sm:block">{buscador ? "Buscar REQ, OC, factura…" : "Buscar o ir a…"}</span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <Campana notifs={notifs} vistas={prefs.notifVistas ?? []} />
          <button
            onClick={alternarTema}
            className="tip flex h-9 w-9 items-center justify-center rounded-lg border border-plomo-200 bg-surface text-fg-2 transition hover:bg-plomo-50 hover:text-fg"
            data-tip="Cambiar tema · T"
            aria-label="Cambiar tema claro / oscuro"
          >
            <Sun size={17} className="hidden dark:block" />
            <Moon size={17} className="dark:hidden" />
          </button>
        </div>
      </header>

      <main className="w-full flex-1">
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-6 sm:px-6 lg:px-8">
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
            <div className="animate-velo space-y-5" key={path} /* solo opacidad: un transform rompería los modales fijos */>
              <Header sesion={sesion} flujo={flujoDe(path)} />
              {/* Pestañas del módulo (components/ui Tabs se dibuja aquí): fijas al hacer scroll */}
              <div id={ID_BARRA_PESTANAS} className="sticky top-[60px] z-10 -mx-1 bg-canvas/90 px-1 py-2 backdrop-blur-md empty:hidden" />
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
              {children}
            </div>
          )}
        </div>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-plomo-200 px-4 py-4 text-xs text-plomo-500 sm:px-6 lg:px-8">
        <span>
          <span className="font-semibold text-fg">COMBOY</span> <span className="font-semibold text-rojo">VID</span> © 2025 · ERP COMBOYVID · Arequipa, Perú · Área Informática
        </span>
        <span className="font-mono">v3.2.1</span>
      </footer>
      <AccionRapida acciones={acciones} />
      <CommandPalette abierto={paleta} onCerrar={() => setPaleta(false)} comandos={comandos} documentos={documentos} />
      <DocViewerHost />
      <Toaster />
    </div>
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
