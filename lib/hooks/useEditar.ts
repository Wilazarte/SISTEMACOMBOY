"use client";

import { useCallback } from "react";
import { ErpError, escribir, leer, marcarEditado, useRol, type StoreKey } from "@/lib/storage";
import type { EventoHistorial } from "@/lib/types";

/**
 * Edición genérica de un documento de una lista de la caché (lib/storage.ts).
 * No llama a supabase.from(...).update directo: escribir() guarda solo la fila que cambió y deja la caché
 * al día al instante, así todas las pantallas (useStore) se refrescan sin recargar y Realtime no la pisa.
 * Deja rastro: editadoPor, editadoEn y una línea en el historial.
 *
 * Los documentos que recalculan totales o mueven stock tienen su propia función (editarNotaPedido,
 * editarCompra, editarGasto, editarRequerimiento); este hook es para correcciones de campos sueltos.
 */
export function useEditar<T extends { id: string; historial?: EventoHistorial[] }>(clave: StoreKey) {
  const [rol] = useRol();
  const editar = useCallback(
    (id: string, nuevosCampos: Partial<T>, accion = "Documento editado"): T => {
      const lista = leer<T[]>(clave, []);
      const viejo = lista.find((x) => x.id === id);
      if (!viejo) throw new ErpError("Documento no encontrado (actualice la página).");
      const detalle = Object.keys(nuevosCampos).join(", ");
      const nuevo = marcarEditado({ ...viejo, ...nuevosCampos, historial: viejo.historial ?? [] }, rol, accion, detalle) as unknown as T;
      escribir(clave, lista.map((x) => (x.id === id ? nuevo : x)));
      return nuevo;
    },
    [clave, rol]
  );
  return { editar };
}
