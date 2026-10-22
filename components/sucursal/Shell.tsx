"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AlertTriangle, Loader2, LogOut, MapPin, ShieldAlert } from "lucide-react";
import { ID_BARRA_PESTANAS, Toaster } from "@/components/ui";
import { DatalistCatalogo } from "@/components/productos/ProductoInput";
import { RUTA_LOGIN_SUCURSAL, cargoDe, logout, nombreDe, perteneceAModulo, useSesion } from "@/lib/auth";
import { detenerCatalogo, iniciarCatalogo } from "@/lib/productos";
import { cargarSedes, elegirSede, olvidarSedes, useSedes } from "@/lib/sedes";
import { detenerDatos, useDatos } from "@/lib/storage";

/**
 * Marco de COMBOY VID SUCURSAL: header blanco con el logo, la sede y el usuario. Nada del ERP
 * (sin Tesorería, dock, buscador ni barra de notificaciones). Un usuario de sede trabaja solo en
 * la suya; Taller y Tesorería (ERP central) eligen la sede.
 */
export function SucursalShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { sesion, listo } = useSesion();
  const permitido = !!sesion && perteneceAModulo(sesion, "sucursal");
  const datos = useDatos(permitido);
  const sedes = useSedes();

  useEffect(() => {
    if (listo && !sesion) router.replace(RUTA_LOGIN_SUCURSAL);
  }, [listo, sesion, router]);

  useEffect(() => {
    if (!permitido) return;
    void cargarSedes();
    void iniciarCatalogo();
  }, [permitido]);

  // Siempre claro, aunque el ERP de este navegador esté en modo oscuro
  useEffect(() => {
    const html = document.documentElement;
    const oscuro = html.classList.contains("dark");
    html.classList.remove("dark");
    return () => {
      if (oscuro) html.classList.add("dark");
    };
  }, []);

  const salir = async () => {
    await detenerDatos();
    await detenerCatalogo();
    olvidarSedes();
    await logout();
    router.replace(RUTA_LOGIN_SUCURSAL);
  };

  const sede = sedes.sedes.find((s) => s.id === sedes.actualId);

  if (listo && sesion && !permitido)
    return (
      <Centro>
        <ShieldAlert size={28} className="text-red-600" />
        <h1 className="mt-3 text-xl font-semibold">Acceso denegado</h1>
        <p className="mt-1 text-sm text-slate-500">Su usuario ({sesion.usuario}) no tiene acceso a COMBOY VID SUCURSAL.</p>
        <button onClick={salir} className="mt-5 rounded-lg bg-[#c41e1e] px-5 py-2 text-sm font-medium text-white hover:bg-[#a31818]">
          Cerrar sesión
        </button>
      </Centro>
    );

  if (!listo || !sesion || !sedes.listo || (!datos.listo && !datos.error))
    return (
      <Centro>
        <Loader2 size={22} className="animate-spin text-slate-400" />
        <p className="mt-3 text-sm text-slate-500">{sesion ? "Cargando datos de la sede…" : "Verificando sesión…"}</p>
      </Centro>
    );

  const error = datos.error || sedes.error || (!sede ? "Su usuario no tiene una sede visible. El administrador debe asignarla en usuarios_sedes." : "");
  if (error)
    return (
      <Centro>
        <AlertTriangle size={28} className="text-amber-500" />
        <h1 className="mt-3 text-lg font-semibold">No se pudo abrir la sucursal</h1>
        <p className="mt-1 max-w-md text-sm text-slate-500">{error}</p>
        <div className="mt-5 flex gap-2">
          <button onClick={() => window.location.reload()} className="rounded-lg bg-[#c41e1e] px-5 py-2 text-sm font-medium text-white hover:bg-[#a31818]">
            Reintentar
          </button>
          <button onClick={salir} className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cerrar sesión
          </button>
        </div>
      </Centro>
    );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-[0_1px_8px_rgba(15,23,42,0.06)]">
        <div className="relative mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Image src="/comboy-logo.png" alt="COMBOY VID" width={150} height={48} priority className="h-10 w-auto object-contain" />
          <h1 className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-center text-[20px] font-bold uppercase tracking-wide text-slate-900 md:block lg:text-[24px]">
            COMBOY VID SUCURSAL
          </h1>
          <div className="flex items-center gap-2">
            {sedes.asignada ? (
              <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-semibold text-slate-700">
                <MapPin size={14} className="text-[#c41e1e]" /> Sede {sede!.nombre}
              </span>
            ) : (
              <label className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1 text-[13px] font-semibold text-slate-700">
                <MapPin size={14} className="text-[#c41e1e]" /> Sede
                <select
                  value={sedes.actualId}
                  onChange={(e) => elegirSede(e.target.value)}
                  className="rounded-full border-0 bg-white px-2 py-1 text-[13px] font-semibold text-slate-900 outline-none"
                  aria-label="Sede"
                >
                  {sedes.sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-[13px] font-semibold text-slate-900">{nombreDe(sesion)}</p>
              <p className="text-[11px] text-slate-500">{sedes.asignada ? rolSede(sedes.asignada.rol) : cargoDe(sesion)}</p>
            </div>
            <button onClick={salir} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-[#c41e1e]" aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <h1 className="pb-2 text-center text-[17px] font-bold uppercase tracking-wide text-slate-900 md:hidden">COMBOY VID SUCURSAL</h1>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-16 pt-5 sm:px-6 lg:px-8">
        {/* Pestañas de la sucursal (components/ui Tabs dibuja aquí su isla) */}
        <div id={ID_BARRA_PESTANAS} className="sticky top-16 z-20 mb-5 empty:hidden" />
        {/* key: al cambiar de sede (ERP central) la pantalla se vuelve a armar con la otra sede */}
        <div key={sedes.actualId}>{children}</div>
      </main>
      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
        <span className="font-semibold text-slate-900">COMBOY</span> <span className="font-semibold text-[#c41e1e]">VID</span> SUCURSAL · Sede {sede!.nombre}
      </footer>
      <DatalistCatalogo />
      <Toaster />
    </div>
  );
}

const ROLES_SEDE: Record<string, string> = { admin_sede: "Administrador de sede", vendedor: "Vendedor", cajero: "Cajero" };
const rolSede = (r: string) => ROLES_SEDE[r] ?? r;

function Centro({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center text-slate-900">{children}</div>;
}
