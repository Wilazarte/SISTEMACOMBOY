"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useSesion } from "@/lib/auth";
import { ETIQUETA_PERFIL, HOME_PERFIL, perfilPlanta } from "@/lib/permisosPlanta";

/** Destino del RBAC de la planta: el perfil intentó abrir la home de otro módulo. */
export default function NoAutorizadoPage() {
  const { sesion } = useSesion();
  const perfil = perfilPlanta(sesion);
  const home = perfil && perfil !== "soporte" ? HOME_PERFIL[perfil] : "/logistica";
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-[#2a3445] bg-[#1a212e] p-8 text-center text-[#e5e7eb]">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f97316]/15 text-[#f97316]">
        <Lock size={32} />
      </span>
      <h1 className="mt-4 text-2xl font-bold text-white">No autorizado - acceso denegado</h1>
      <p className="mt-2 text-[15px] text-[#d4d4d8]">
        {perfil && perfil !== "soporte" ? `Perfil ${ETIQUETA_PERFIL[perfil].label} - Acceso restringido solo a tu módulo.` : "Su usuario no tiene permiso para abrir esta página."}
      </p>
      <Link href={home} className="mt-6 inline-flex rounded-lg bg-[#f97316] px-5 py-2 text-[14px] font-semibold text-white hover:bg-[#ea580c]">
        Ir a mi módulo
      </Link>
    </div>
  );
}
