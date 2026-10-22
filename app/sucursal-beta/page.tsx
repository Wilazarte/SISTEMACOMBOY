import { redirect } from "next/navigation";

/** Dirección antigua: la Sucursal ahora es el módulo Secocha (/secocha). */
export default function SucursalBeta() {
  redirect("/secocha");
}
