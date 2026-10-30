import { BarChart3, Calculator, Factory, Landmark, Package, ShoppingCart, Store, Truck, Users, type LucideIcon } from "lucide-react";
import type { ModuloLogin } from "@/lib/auth";

export interface TarjetaModulo {
  id: ModuloLogin;
  titulo: string;
  desc: string;
  icon: LucideIcon;
  /** Visible pero sin acceso todavía. */
  proximamente?: boolean;
}

/** Los módulos de /seleccionar-modulo y de /login sin módulo elegido. */
export const MODULOS_SELECCION: TarjetaModulo[] = [
  { id: "ventas", titulo: "Ventas", desc: "Gestión de pedidos y clientes", icon: ShoppingCart },
  { id: "contable", titulo: "Área Contable", desc: "Contabilidad y balances financieros", icon: Calculator },
  { id: "tesoreria", titulo: "Tesorería (Planilla - Compras)", desc: "Finanzas, planilla y compras", icon: Landmark },
  { id: "produccion", titulo: "Inventario", desc: "Producción e inventarios en almacén", icon: Factory },
  { id: "logistica", titulo: "Logística (Requerimientos - En camino - Entregado)", desc: "Requerimientos • En camino • Entregado", icon: Truck },
  { id: "sucursal", titulo: "Secocha", desc: "Sistema aparte de la sede Secocha (Arequipa es la Planta Principal)", icon: Store },
];

/** Módulos anteriores: ya no se ofrecen, pero /login?modulo=almacen|planilla|gerencia sigue funcionando. */
const ANTERIORES: TarjetaModulo[] = [
  { id: "almacen", titulo: "Almacén", desc: "Inventarios y materiales", icon: Package },
  { id: "planilla", titulo: "Planilla", desc: "Recursos humanos y pagos", icon: Users },
  { id: "gerencia", titulo: "Gerencia", desc: "Reportes y analíticas", icon: BarChart3 },
  // Del dock del login (pantalla de presentación)
  { id: "soporte", titulo: "Soporte", desc: "Dueño del sistema", icon: BarChart3 },
  { id: "finanzas", titulo: "Finanzas", desc: "Tesorería, planilla y compras", icon: Landmark },
];

export const tarjetaDe = (id: ModuloLogin): TarjetaModulo => [...MODULOS_SELECCION, ...ANTERIORES].find((t) => t.id === id)!;

/** Encargado que se muestra en la bienvenida del login según el módulo. */
export const ENCARGADOS_LOGIN: Record<ModuloLogin, { nombre: string; cargo: string }> = {
  ventas: { nombre: "LIZBETH CAHUANA APFATA", cargo: "Tesorera - Módulo de Ventas" },
  contable: { nombre: "Área Contable", cargo: "Contabilidad - COMBOY VID" },
  tesoreria: { nombre: "LIZBETH CAHUANA APFATA", cargo: "Tesorera - Módulo de Compras" },
  produccion: { nombre: "MANUEL CORNEJO APAZA", cargo: "Producción - permisos limitados" },
  logistica: { nombre: "WILLIAMS LAZARTE COLQUE", cargo: "Logística - emite las Órdenes de Producción" },
  sucursal: { nombre: "COMBOY VID SECOCHA", cargo: "Sede Secocha" },
  almacen: { nombre: "JOSE MANUEL ORTIZ ARAPA", cargo: "Jefe de Almacén - Módulo de Almacén" },
  planilla: { nombre: "Encargado de Planilla", cargo: "RRHH - Módulo de Planilla" },
  gerencia: { nombre: "Gerencia General", cargo: "Gerencia - solo lectura" },
  soporte: { nombre: "Adm", cargo: "Soporte - administrador del sistema" },
  finanzas: { nombre: "LIZBETH CAHUANA APFATA", cargo: "Tesorera - Módulo de Finanzas" },
};

/** Ruta para "Realizar requerimiento" (Inventario): Almacén › Nuevo requerimiento. */
export const RUTA_REQUERIMIENTO = "/dashboard/almacen?tab=nuevo";

/** Último módulo elegido en la pantalla de selección (solo recuerda la elección; la sesión usa CLAVE_MODULO). */
export const CLAVE_SELECCION = "modulo_seleccionado";
