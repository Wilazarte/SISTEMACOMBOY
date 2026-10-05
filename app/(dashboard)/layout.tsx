"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Bell, Calculator, CloudUpload, Eye, KeyRound, Receipt, LayoutDashboard, Loader2, LogOut, Menu, Search, Truck, ShieldAlert, ShoppingCart, UserCircle2, Users, Warehouse, X } from "lucide-react";
import { Badge, Toaster, cn, toast } from "@/components/ui";
import { DocViewerHost, abrirDoc, type DocRef } from "@/components/doc-viewer";
import { ObservacionesGerencia } from "@/components/ObservacionesGerencia";
import { inicioDe, logout, puedeVer, useSesion } from "@/lib/auth";
import { contarDatosLocales, subirDatosLocales } from "@/lib/migracion";
import { KEYS, detenerDatos, getCotizaciones, getFacturas, getGuias, getOrdenes, getPendientes, getProcesados, useDatos, useStore } from "@/lib/storage";
import type { OrdenDespacho, Requerimiento } from "@/lib/types";
import { avisoOD, getDespachos, odsNuevas } from "@/lib/ventas";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, pronto: true },
  { href: "/dashboard/almacen", label: "Almacén", icon: Warehouse },
  { href: "/dashboard/ventas", label: "Ventas", icon: Receipt },
  { href: "/dashboard/compras", label: "Tesorería / Compras", icon: ShoppingCart },
  { href: "/dashboard/contable", label: "Contable", icon: Calculator, activo: true },
  { href: "/dashboard/planilla", label: "Planilla", icon: Users },
  // Solo creador / admin (ver puedeVer en lib/auth.ts)
  { href: "/dashboard/creador", label: "Módulo Creador", icon: KeyRound },
];

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

/** Logotipo: COMBOY azul + VID rojo, serif. */
function Logo({ className, claro }: { className?: string; claro?: boolean }) {
  return (
    <Link href="/dashboard" className={cn("flex items-baseline gap-2 font-serif font-bold leading-none tracking-tight", className)} aria-label="COMBOY VID - inicio">
      <span className={claro ? "text-white" : "text-azul-900"}>COMBOY</span>
      <span className="text-corp">VID</span>
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { sesion, listo } = useSesion();
  const datos = useDatos(!!sesion);
  const pendientes = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const [locales, setLocales] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  // se recalcula al escribir; los datos se leen de la caché sincronizada con Supabase
  const resultados = useMemo(() => buscar(q), [q]);

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

  const salir = async () => {
    await detenerDatos();
    await logout();
    router.replace("/login");
  };

  if (!listo || !sesion || (!datos.listo && !datos.error))
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-plomo-50 text-plomo-500">
        <Loader2 size={24} className="animate-spin" />
        {sesion && <p className="text-sm">Cargando datos…</p>}
      </div>
    );

  if (datos.error)
    return (
      <div className="flex min-h-screen items-center justify-center bg-plomo-50 p-4">
        <div className="max-w-md rounded-xl border border-plomo-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle size={36} className="mx-auto text-corp" />
          <h1 className="mt-3 font-serif text-xl text-azul-900">No se pudieron cargar los datos</h1>
          <p className="mt-1 text-sm text-plomo-600">{datos.error}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={() => window.dispatchEvent(new Event("erp:reintentar"))} className="rounded-lg bg-corp px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-vino-900">
              Reintentar
            </button>
            <button onClick={salir} className="rounded-lg border border-plomo-200 bg-white px-6 py-2.5 text-sm font-medium text-azul-900 hover:bg-plomo-50">
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

  const nav = NAV.filter((n) => puedeVer(sesion, n.href));
  const permitido = puedeVer(sesion, path);
  const veCompras = puedeVer(sesion, "/dashboard/compras");
  // Campana de Almacén: órdenes de despacho nuevas que creó Ventas
  const veDespacho = puedeVer(sesion, "/dashboard/almacen") && ["creador", "almacen"].includes(sesion.rol);
  const nuevasOD = veDespacho ? odsNuevas(ods).length : 0;
  const buscador = veCompras || puedeVer(sesion, "/dashboard/almacen");
  const modulo = NAV.find((n) => n.href !== "/dashboard" && (path === n.href || path.startsWith(`${n.href}/`)))?.href;

  return (
    <div className="flex min-h-screen flex-col bg-plomo-50 lg:pl-[264px]">
      {/* Sidebar */}
      <aside
        className={cn("fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col text-white/70 transition-transform lg:translate-x-0", menu ? "translate-x-0" : "-translate-x-full")}
        style={{ background: "linear-gradient(180deg, #0F2440 0%, #1E3A5F 100%)" }}
      >
        <div className="flex h-[72px] items-center gap-3 border-b border-white/10 px-5">
          <Logo className="text-[26px] lg:hidden" claro />
          <div className="hidden lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/80">ERP Corporativo</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-white/40">Soluciones mineras</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setMenu(false)} aria-label="Cerrar menú">
            <X size={18} />
          </button>
        </div>
        <p className="px-5 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">Menú principal</p>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {nav.map((n) => {
            const activo = path === n.href || (n.href !== "/dashboard" && path.startsWith(`${n.href}/`)); // subpáginas (Adelantos, Historial…)
            const Icon = n.icon;
            const contenido = (
              <>
                <Icon size={18} />
                <span className="flex-1">{n.label}</span>
                {n.href === "/dashboard/compras" && pendientes.length > 0 && <span className="rounded-full bg-corp px-1.5 text-[11px] font-bold text-white">{pendientes.length}</span>}
                {n.pronto && <span className="text-[10px] uppercase tracking-wider text-white/30">Fase sig.</span>}
                {"activo" in n && n.activo && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">Activo</span>}
              </>
            );
            if (n.pronto)
              return (
                <div key={n.href} className="flex cursor-not-allowed items-center gap-3 rounded-lg px-5 py-3 text-sm font-medium opacity-50">
                  {contenido}
                </div>
              );
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenu(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-5 py-3 text-sm font-medium transition",
                  activo ? "ml-2 rounded-l-none border-l-2 border-l-corp bg-white/[0.08] text-white" : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                {contenido}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          {locales > 0 && (
            <button
              onClick={subirLocales}
              disabled={subiendo}
              className="mb-3 flex w-full items-center gap-2 rounded-lg bg-white/[0.08] px-3 py-2 text-left text-xs font-medium text-white hover:bg-white/[0.12] disabled:opacity-60"
              title="Sube a Supabase los datos que este navegador tenía de la versión anterior"
            >
              {subiendo ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
              Subir datos de este navegador ({locales})
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <UserCircle2 size={30} className="shrink-0 text-white/40" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{sesion.usuario}</p>
              <p className="truncate text-[11px] text-white/50">{sesion.nombre}</p>
            </div>
            <button onClick={salir} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" title="Cerrar sesión" aria-label="Cerrar sesión">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {menu && <div className="fixed inset-0 z-30 bg-azul-900/50 lg:hidden" onClick={() => setMenu(false)} />}

      {/* Header */}
      <header className="sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b-[3px] border-b-corp bg-white px-4 lg:px-8">
        <button className="text-azul-900 lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menú">
          <Menu size={22} />
        </button>
        <Logo className="hidden text-[42px] sm:flex" />
        <div className="ml-auto flex flex-1 items-center justify-end gap-3">
          <div className={cn("relative w-full max-w-md", !buscador && "invisible")}>
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-plomo-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar REQ, cotización, OC, factura, guía, proveedor…"
              className="w-full rounded-full border-[1.5px] border-azul-900 bg-white py-2 pl-10 pr-4 text-sm text-azul-900 outline-none placeholder:text-plomo-500 focus:ring-2 focus:ring-azul-900/15"
            />
            {q.trim().length >= 2 && (
              <div className="absolute inset-x-0 top-12 max-h-96 overflow-y-auto rounded-xl border border-plomo-200 bg-white shadow-[0_12px_32px_rgba(15,36,64,0.15)]">
                {resultados.length === 0 ? (
                  <p className="p-4 text-sm text-plomo-500">Sin coincidencias</p>
                ) : (
                  resultados.map((r) => (
                    <button
                      key={r.tipo + r.id}
                      onClick={() => {
                        abrirDoc({ tipo: r.tipo, id: r.id });
                        setQ("");
                      }}
                      className="flex w-full items-center gap-3 border-b border-plomo-100 px-4 py-2.5 text-left last:border-0 hover:bg-plomo-50"
                    >
                      <span className="w-14 text-[10px] font-bold uppercase tracking-wider text-plomo-500">{r.tipo}</span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-azul-900">{r.numero}</span>
                        <span className="block text-xs text-plomo-500">{r.detalle}</span>
                      </span>
                      <Badge estado={r.estado} />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {veDespacho && (
            <Link
              href="/dashboard/almacen?tab=despacho"
              onClick={() => window.dispatchEvent(new Event("erp:ir-despacho"))}
              className="relative flex items-center gap-2 rounded-full p-2 text-azul-900 hover:bg-plomo-100"
              title={nuevasOD ? `${nuevasOD} nueva(s) orden(es) de despacho:\n${odsNuevas(ods).map(avisoOD).join("\n")}` : "Órdenes de despacho"}
              aria-label="Órdenes de despacho nuevas"
            >
              {veCompras ? <Truck size={20} /> : <Bell size={20} />}
              {nuevasOD > 0 && (
                <>
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-corp px-1 text-[11px] font-bold text-white">{nuevasOD}</span>
                  <span className="hidden whitespace-nowrap rounded-full bg-corp px-2.5 py-0.5 text-[11px] font-bold text-white xl:inline">
                    {nuevasOD} nueva{nuevasOD > 1 ? "s" : ""} orden{nuevasOD > 1 ? "es" : ""}
                  </span>
                </>
              )}
            </Link>
          )}
          {veCompras && (
            <Link href="/dashboard/compras" className="relative rounded-full p-2 text-azul-900 hover:bg-plomo-100" title="Requerimientos por revisar">
              <Bell size={20} />
              {pendientes.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-corp px-1 text-[11px] font-bold text-white">{pendientes.length}</span>
              )}
            </Link>
          )}
          <span className="hidden items-center gap-2 whitespace-nowrap rounded-full border border-plomo-200 px-3 py-1.5 text-xs font-semibold text-azul-900 md:inline-flex">
            <UserCircle2 size={16} className="text-plomo-500" /> {sesion.nombre}
          </span>
        </div>
      </header>

      <main className="w-full max-w-none flex-1 bg-plomo-50 p-0">
        <div className="w-full px-6 py-8 lg:px-8">
        {sesion.modulos.length === 0 ? (
          <div className="mx-auto mt-16 max-w-md rounded-xl border border-plomo-200 bg-white p-8 text-center shadow-sm">
            <ShieldAlert size={40} className="mx-auto text-corp" />
            <h1 className="mt-3 font-serif text-2xl text-azul-900">Sin módulos asignados</h1>
            <p className="mt-1 text-sm text-plomo-500">
              Su usuario ({sesion.usuario}, rol {sesion.rol}) inició sesión, pero todavía no tiene módulos habilitados. El administrador debe asignarlos en la tabla perfiles (columna modulos).
            </p>
          </div>
        ) : !permitido ? (
          <div className="mx-auto mt-16 max-w-md rounded-xl border border-plomo-200 bg-white p-8 text-center shadow-sm">
            <ShieldAlert size={40} className="mx-auto text-corp" />
            <h1 className="mt-3 font-serif text-2xl text-azul-900">Acceso denegado</h1>
            <p className="mt-1 text-sm text-plomo-500">Su usuario ({sesion.usuario}) no tiene permiso para ver este módulo.</p>
            <Link href={inicioDe(sesion)} className="mt-5 inline-flex rounded-lg bg-corp px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-vino-900">
              Ir a mi módulo
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {sesion.soloLectura && (
              <div className="flex w-full items-center gap-2 rounded-xl border border-plomo-200 bg-white px-5 py-2.5 text-sm text-azul-700 shadow-[0_4px_12px_rgba(15,36,64,0.06)]">
                <Eye size={16} /> Modo solo lectura: puede revisar todo y registrar observaciones, pero no guardar, editar ni eliminar.
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
      <footer className="border-t border-plomo-200 bg-white px-6 py-4 text-center text-[12px] tracking-wide text-plomo-500 lg:px-8">
        <span className="font-serif text-azul-900">COMBOY</span> <span className="font-serif text-corp">VID</span> © 2025 • ERP Corporativo • Lima, Perú • v3.2.1
      </footer>
      <DocViewerHost />
      <Toaster />
    </div>
  );
}
