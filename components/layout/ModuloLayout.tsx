"use client";

import { SEDE_PLANTA_PRINCIPAL } from "@/lib/plantillasDocumentos";

/** Sede del ERP (Arequipa): referencia del diseño de todos los módulos. */
export { SEDE_PLANTA_PRINCIPAL };

/**
 * Nombres anteriores del layout de los módulos. El ERP (Arequipa) y Secocha usan el layout global
 * components/erp/ErpLayout (diseño de Logística Planta): solo cambia la sede.
 */
export { ErpLayout as ModuloLayout, ErpContenido as ModuloContenido } from "@/components/erp/ErpLayout";
