import { redirect } from "next/navigation";

/** Dirección antigua: la Sucursal ahora es un sistema aparte en /sucursal. */
export default function SucursalBeta() {
  redirect("/sucursal");
}
