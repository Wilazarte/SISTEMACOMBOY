"use client";

// Botón flotante "Foto de guía" (solo en la app Android): el almacenero elige la OC, toma la foto de la
// guía física y queda vinculada a esa OC. Sin señal se guarda en el celular y se sube después.

import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, CloudOff } from "lucide-react";
import { Button, Modal, Select, toast } from "@/components/ui";
import { useSesion } from "@/lib/auth";
import { contarFotosPendientes, tomarFotoGuia } from "@/lib/movil/fotosGuia";
import { KEYS, useStore } from "@/lib/storage";
import type { OrdenCompra } from "@/lib/types";

export function FotoGuiaFlotante() {
  const { sesion } = useSesion();
  const [abierto, setAbierto] = useState(false);
  if (!sesion || sesion.soloLectura) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Foto de guía"
        className="fixed bottom-16 right-4 z-[9998] flex h-14 w-14 items-center justify-center rounded-full bg-[#1e6bff] text-white shadow-xl active:scale-95"
      >
        <Camera className="h-6 w-6" />
      </button>
      {abierto && <ModalFotoGuia onClose={() => setAbierto(false)} />}
    </>
  );
}

function ModalFotoGuia({ onClose }: { onClose: () => void }) {
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const [ocId, setOcId] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const opciones = useMemo(
    () =>
      ordenes.slice(0, 80).map((o) => ({ value: o.id, label: `${o.numero} · ${o.proveedor}` })),
    [ordenes]
  );
  const oc = ordenes.find((o) => o.id === ocId);

  useEffect(() => {
    void contarFotosPendientes().then(setPendientes).catch(() => undefined);
  }, [ocupado]);

  const tomar = async () => {
    if (!ocId) return toast("Elija la OC de la guía.", "error");
    setOcupado(true);
    try {
      const r = await tomarFotoGuia(ocId);
      if (r) toast(r.subida ? "Foto de guía subida y vinculada a la OC." : "Sin señal: la foto quedó en el celular y se subirá sola.");
    } catch (e) {
      toast(`No se pudo tomar la foto: ${(e as Error).message}`, "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Foto de guía de remisión">
      <div className="space-y-4">
        <Select value={ocId} onChange={(e) => setOcId(e.target.value)} options={opciones} placeholder="Elija la orden de compra…" />
        {oc && (
          <ul className="space-y-1 text-sm">
            {(oc.fotosGuia ?? []).map((f) => (
              <li key={f.ruta} className="flex items-center gap-2">
                {f.subida ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <CloudOff className="h-4 w-4 text-amber-500" />}
                {new Date(f.fecha).toLocaleString("es-PE")} · {f.usuario}
              </li>
            ))}
            {(oc.fotosGuia ?? []).length === 0 && <li className="text-plomo-500">Esta OC aún no tiene fotos de guía.</li>}
          </ul>
        )}
        {pendientes > 0 && <p className="text-xs text-amber-500">{pendientes} foto(s) esperan señal para subirse.</p>}
        <Button onClick={() => void tomar()} disabled={ocupado || !ocId} className="w-full">
          <Camera size={16} /> {ocupado ? "Guardando…" : "Tomar foto"}
        </Button>
      </div>
    </Modal>
  );
}
