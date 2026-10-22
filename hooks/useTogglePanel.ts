"use client";

import { useState } from "react";

/**
 * Paneles plegables de un módulo: filtros de búsqueda y formulario de registro.
 * Ambos arrancan CERRADOS: al entrar solo se ve la tabla.
 */
export function useTogglePanel() {
  const [showFiltros, setShowFiltros] = useState(false);
  const [showForm, setShowForm] = useState(false);
  return { showFiltros, showForm, setShowFiltros, setShowForm };
}

export default useTogglePanel;
