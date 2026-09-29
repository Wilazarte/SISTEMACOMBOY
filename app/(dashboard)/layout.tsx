"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Bell, Calculator, CloudUpload, Eye, LayoutDashboard, Loader2, LogOut, Menu, Search, ShieldAlert, ShoppingCart, UserCircle2, Users, Warehouse, X } from "lucide-react";
import { Badge, Toaster, cn, toast } from "@/components/ui";
import { DocViewerHost, abrirDoc, type DocRef } from "@/components/doc-viewer";
import { ObservacionesGerencia } from "@/components/ObservacionesGerencia";
import { inicioDe, logout, puedeVer, useSesion } from "@/lib/auth";
import { contarDatosLocales, subirDatosLocales } from "@/lib/migracion";
import { KEYS, detenerDatos, getCotizaciones, getFacturas, getGuias, getOrdenes, getPendientes, getProcesados, useDatos, useStore } from "@/lib/storage";
import type { Requerimiento } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, pronto: true },
  { href: "/dashboard/almacen", label: "Almacén", icon: Warehouse },
  { href: "/dashboard/compras", label: "Tesorería / Compras", icon: ShoppingCart },
  { href: "/dashboard/contable", label: "Contable", icon: Calculator, pronto: true },
  { href: "/dashboard/planilla", label: "Planilla", icon: Users },
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

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { sesion, listo } = useSesion();
  const datos = useDatos(!!sesion);
  const pendientes = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-400">
        <Loader2 size={24} className="animate-spin" />
        {sesion && <p className="text-sm">Cargando datos…</p>}
      </div>
    );

  if (datos.error)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle size={36} className="mx-auto text-red-500" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">No se pudieron cargar los datos</h1>
          <p className="mt-1 text-sm text-slate-600">{datos.error}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={() => window.dispatchEvent(new Event("erp:reintentar"))} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Reintentar
            </button>
            <button onClick={salir} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
  const buscador = veCompras || puedeVer(sesion, "/dashboard/almacen");
  const modulo = NAV.find((n) => n.href !== "/dashboard" && (path === n.href || path.startsWith(`${n.href}/`)))?.href;

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 transition-transform lg:translate-x-0", menu ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-black text-slate-900">CV</div>
          <div>
            <p className="text-sm font-bold text-white">COMBOY VID</p>
            <p className="text-[11px] text-slate-400">ERP</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setMenu(false)} aria-label="Cerrar menú">
            <X size={18} />
          </button>
        </div>
        <nav className="space-y-1 p-3">
          {nav.map((n) => {
            const activo = path === n.href;
            const Icon = n.icon;
            const contenido = (
              <>
                <Icon size={18} />
                <span className="flex-1">{n.label}</span>
                {n.href === "/dashboard/compras" && pendientes.length > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-slate-900">{pendientes.length}</span>
                )}
                {n.pronto && <span className="text-[10px] uppercase text-slate-500">Fase sig.</span>}
              </>
            );
            if (n.pronto)
              return (
                <div key={n.href} className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium opacity-50">
                  {contenido}
                </div>
              );
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenu(false)}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition", activo ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white")}
              >
                {contenido}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-800 p-4">
          {locales > 0 && (
            <button
              onClick={subirLocales}
              disabled={subiendo}
              className="mb-3 flex w-full items-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-left text-xs font-medium text-amber-300 hover:bg-amber-500/25 disabled:opacity-60"
              title="Sube a Supabase los datos que este navegador tenía de la versión anterior"
            >
              {subiendo ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
              Subir datos de este navegador ({locales})
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <UserCircle2 size={30} className="shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{sesion.usuario}</p>
              <p className="truncate text-[11px] text-slate-400">{sesion.nombre}</p>
            </div>
            <button onClick={salir} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="Cerrar sesión" aria-label="Cerrar sesión">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {menu && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenu(false)} />}

      {/* Header */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
        <button className="lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menú">
          <Menu size={22} />
        </button>
        <div className={cn("relative max-w-md flex-1", !buscador && "invisible")}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar REQ, cotización, OC, factura, guía, proveedor…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
          />
          {q.trim().length >= 2 && (
            <div className="absolute inset-x-0 top-11 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
              {resultados.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">Sin coincidencias</p>
              ) : (
                resultados.map((r) => (
                  <button
                    key={r.tipo + r.id}
                    onClick={() => {
                      abrirDoc({ tipo: r.tipo, id: r.id });
                      setQ("");
                    }}
                    className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left last:border-0 hover:bg-slate-50"
                  >
                    <span className="w-14 text-[10px] font-bold uppercase text-slate-400">{r.tipo}</span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-slate-800">{r.numero}</span>
                      <span className="block text-xs text-slate-500">{r.detalle}</span>
                    </span>
                    <Badge estado={r.estado} />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {veCompras && (
            <Link href="/dashboard/compras" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Requerimientos por revisar">
              <Bell size={20} />
              {pendientes.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-slate-900">
                  {pendientes.length}
                </span>
              )}
            </Link>
          )}
          <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 sm:inline">{sesion.nombre}</span>
        </div>
      </header>

      <main className="p-4 lg:p-8">
        {!permitido ? (
          <div className="mx-auto mt-16 max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <ShieldAlert size={40} className="mx-auto text-red-500" />
            <h1 className="mt-3 text-xl font-bold text-slate-900">Acceso denegado</h1>
            <p className="mt-1 text-sm text-slate-500">Su usuario ({sesion.usuario}) no tiene permiso para ver este módulo.</p>
            <Link href={inicioDe(sesion)} className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Ir a mi módulo
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {sesion.soloLectura && (
              <div className="mx-auto flex max-w-7xl items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm text-sky-800">
                <Eye size={16} /> Modo solo lectura: puede revisar todo y registrar observaciones, pero no guardar, editar ni eliminar.
              </div>
            )}
            {modulo && (
              <div className="mx-auto max-w-7xl">
                <ObservacionesGerencia modulo={modulo} sesion={sesion} />
              </div>
            )}
            {children}
          </div>
        )}
      </main>
      <DocViewerHost />
      <Toaster />
    </div>
  );
}
