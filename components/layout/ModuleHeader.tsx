"use client";

import type { ReactNode } from "react";
import { ErpHeader } from "@/components/erp/ErpHeader";

/** Nombre anterior del encabezado de los módulos: ahora es components/erp/ErpHeader ("ERP COMBOY VID" centrado). */
export function ModuleHeader({
  moduleName: _moduleName,
  ...props
}: {
  moduleName?: string;
  inicio?: string;
  usuario?: string;
  nombre?: string;
  badge?: string;
  onSalir?: () => void;
  extra?: ReactNode;
}) {
  return <ErpHeader {...props} />;
}

export default ModuleHeader;
