"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ClipboardList } from "lucide-react";
import { ID_NOTIF_EXTRA } from "@/components/layout/NotificationSidebar";

/**
 * "Requerimientos por revisar" de Tesorería / Compras: ya no es una barra propia a la izquierda,
 * se dibuja como sección dentro de la barra derecha de notificaciones (components/layout/NotificationSidebar).
 * Los modales (Rechazar, Observar, Editar) se dibujan fuera de esta sección.
 */
export default function TesoreriaLeftDrawer({ cantidad, acciones, children }: { cantidad: number; acciones?: ReactNode; children: ReactNode }) {
  const [destino, setDestino] = useState<HTMLElement | null>(null);
  useEffect(() => setDestino(document.getElementById(ID_NOTIF_EXTRA)), []);
  if (!destino) return null;

  return createPortal(
    <section className="border-t border-[#1f2937] pt-5">
      <h3 className="flex items-center gap-2 text-[16px] font-bold text-white">
        <ClipboardList size={16} className="text-amber-400" /> Requerimientos por revisar
        <span className="rounded-full bg-[#f97316] px-2 py-0.5 text-xs">{cantidad}</span>
      </h3>
      {acciones && <div className="mt-3 flex flex-wrap gap-2">{acciones}</div>}
      <div className="mt-3 space-y-2">{children}</div>
    </section>,
    destino
  );
}
