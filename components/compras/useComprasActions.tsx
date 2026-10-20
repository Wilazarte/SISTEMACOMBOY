"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Field, Modal, Textarea, ejecutar } from "@/components/ui";
import { observarRequerimiento, rechazarRequerimiento } from "@/lib/storage";
import type { Requerimiento, Rol } from "@/lib/types";

/**
 * Acciones de revisión de un requerimiento pendiente (Observar con motivo / Rechazar con confirmación).
 * Lo usan las cards de Tesorería / Compras y la campanita del header: `modales` se dibuja una vez en el componente.
 */
export function useComprasActions(rol: Rol): {
  observar: (r: Requerimiento) => void;
  rechazar: (r: Requerimiento) => void;
  modales: ReactNode;
} {
  const [rechazo, setRechazo] = useState<Requerimiento | null>(null);
  const [obs, setObs] = useState<Requerimiento | null>(null);
  const [motivo, setMotivo] = useState("");

  const modales = (
    <>
      <Modal open={!!rechazo} onClose={() => setRechazo(null)} title={`Rechazar ${rechazo?.numero ?? ""}`}>
        <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle size={20} className="shrink-0" />
          El requerimiento se <b>eliminará de todo el sistema</b> (notificaciones y lista). Esta acción no se puede deshacer.
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRechazo(null)}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (rechazo && ejecutar(() => rechazarRequerimiento(rechazo.id), `${rechazo.numero} rechazado y eliminado`)) setRechazo(null);
            }}
          >
            Rechazar y eliminar
          </Button>
        </div>
      </Modal>

      <Modal open={!!obs} onClose={() => setObs(null)} title={`Observar ${obs?.numero ?? ""}`}>
        <Field label="Motivo de la observación" hint="Almacén verá esta observación y podrá corregir y reenviar.">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Especificar medida del rodamiento y marca aceptada" autoFocus />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setObs(null)}>Cancelar</Button>
          <Button
            variant="warning"
            onClick={() => {
              if (obs && ejecutar(() => observarRequerimiento(obs.id, motivo, rol), `${obs.numero} OBSERVADO`)) setObs(null);
            }}
          >
            Enviar observación
          </Button>
        </div>
      </Modal>
    </>
  );

  return {
    observar: (r) => {
      setMotivo("");
      setObs(r);
    },
    rechazar: setRechazo,
    modales,
  };
}
