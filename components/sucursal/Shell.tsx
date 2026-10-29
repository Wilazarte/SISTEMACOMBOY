"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Toaster } from "@/components/ui";
import { ModuloContenido, ModuloLayout } from "@/components/layout/ModuloLayout";
import { DatalistCatalogo } from "@/components/productos/ProductoInput";
import { RUTA_LOGIN_SUCURSAL, RUTA_SUCURSAL, logout, perteneceAModulo, useSesion } from "@/lib/auth";
import { detenerCatalogo, iniciarCatalogo } from "@/lib/productos";
import { cargarSedes, olvidarSedes, sedeSucursal, useSedes } from "@/lib/sedes";
import { detenerDatos, useDatos } from "@/lib/storage";

/**
 * Marco del módulo Secocha (/secocha): el mismo ModuloLayout de Arequipa (colores, header, spacing), con Sede: Secocha.
 * Sin dock, buscador ni barra de notificaciones del ERP. Solo Secocha: Arequipa es la
 * Planta Principal (el ERP) y no se muestra aquí; Taller y Tesorería entran directo a Secocha, sin selector.
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
        <p className="mt-1 text-sm text-plomo-500">Su usuario ({sesion.usuario}) no tiene acceso al módulo Secocha.</p>
        <button onClick={salir} className="mt-5 rounded-lg bg-corp px-5 py-2 text-[13px] font-medium text-white shadow-rojo hover:bg-vino-900">
          Cerrar sesión
        </button>
      </Centro>
    );

  if (!listo || !sesion || !sedes.listo || (!datos.listo && !datos.error))
    return (
      <Centro>
        <Loader2 size={22} className="animate-spin text-slate-400" />
        <p className="mt-3 text-sm text-plomo-500">{sesion ? "Cargando datos de la sede…" : "Verificando sesión…"}</p>
      </Centro>
    );

  const secocha = sedeSucursal(sedes.sedes);
  const error =
    datos.error ||
    sedes.error ||
    (!sede || !secocha ? "No se encontró la sede Secocha. El administrador debe revisar public.sedes y usuarios_sedes." : "") ||
    // Usuario de sede asignado a Arequipa (Planta Principal): el módulo Secocha es solo de Secocha
    (sedes.asignada && sedes.asignada.sedeId !== secocha!.id ? `Su usuario es de ${sede!.nombre}. El módulo Secocha es solo para la sede Secocha.` : "");
  if (error)
    return (
      <Centro>
        <AlertTriangle size={28} className="text-amber-500" />
        <h1 className="mt-3 text-lg font-semibold">No se pudo abrir la sucursal</h1>
        <p className="mt-1 max-w-md text-sm text-plomo-500">{error}</p>
        <div className="mt-5 flex gap-2">
          <button onClick={() => window.location.reload()} className="rounded-lg bg-corp px-5 py-2 text-[13px] font-medium text-white shadow-rojo hover:bg-vino-900">
            Reintentar
          </button>
          <button onClick={salir} className="rounded-lg border border-plomo-200 bg-surface px-5 py-2 text-sm font-medium text-fg hover:bg-plomo-50">
            Cerrar sesión
          </button>
        </div>
      </Centro>
    );

  // Mismo layout que Arequipa (components/layout/ModuloLayout): solo cambia la sede
  return (
    <ModuloLayout
      moduleName="SECOCHA"
      sede={sede!.nombre}
      inicio={RUTA_SUCURSAL}
      sesion={sesion}
      onSalir={salir}
      overlays={
        <>
          <DatalistCatalogo />
          <Toaster />
        </>
      }
    >
      <ModuloContenido key={sedes.actualId}>
        {children}
      </ModuloContenido>
    </ModuloLayout>
  );
}


function Centro({ children }: { children: ReactNode }) {
  return <div className="dark tema-planta fondo-grid flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] p-6 text-center text-fg">{children}</div>;
}
