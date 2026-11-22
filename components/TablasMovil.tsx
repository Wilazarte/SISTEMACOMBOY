"use client";

import { useEffect } from "react";

/**
 * Tablas en celular (Williams 2026-11-17: "que no haya la necesidad de desplazarse para ver un texto completo").
 * Pone en cada celda `data-label` con el título de su columna (thead th, respetando colSpan). En pantallas de
 * menos de 640 px, app/globals.css (bloque "Celular sin desplazamiento") muestra cada fila como una tarjeta:
 * "COLUMNA  valor" una debajo de otra, con salto de línea, sin barra horizontal. En PC las tablas no cambian.
 * Una tabla que deba quedarse como tabla lleva la clase `tabla-fija`.
 */
function etiquetar(tabla: HTMLTableElement) {
  const fila = tabla.tHead?.rows[tabla.tHead.rows.length - 1];
  if (!fila) return;
  const titulos: string[] = [];
  for (const th of Array.from(fila.cells)) {
    const t = (th.textContent ?? "").replace(/\s+/g, " ").trim();
    for (let i = 0; i < Math.max(1, th.colSpan); i++) titulos.push(t);
  }
  tabla.classList.add("tabla-movil");
  for (const cuerpo of Array.from(tabla.tBodies))
    for (const tr of Array.from(cuerpo.rows)) {
      let col = 0;
      for (const td of Array.from(tr.cells)) {
        const t = td.colSpan > 1 ? "" : (titulos[col] ?? "");
        if (td.dataset.label !== t) td.dataset.label = t;
        col += Math.max(1, td.colSpan);
      }
    }
}

export function TablasMovil() {
  useEffect(() => {
    let pendiente = 0;
    const revisar = () => {
      pendiente = 0;
      document.querySelectorAll<HTMLTableElement>("table:not(.tabla-fija)").forEach(etiquetar);
    };
    const programar = () => {
      if (!pendiente) pendiente = requestAnimationFrame(revisar);
    };
    // Solo en celular: en PC no hace falta vigilar el DOM
    const mq = window.matchMedia("(max-width: 639px)");
    const obs = new MutationObserver(programar);
    const aplicar = () => {
      obs.disconnect();
      if (!mq.matches) return;
      revisar();
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => {
      mq.removeEventListener("change", aplicar);
      obs.disconnect();
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, []);
  return null;
}

export default TablasMovil;
