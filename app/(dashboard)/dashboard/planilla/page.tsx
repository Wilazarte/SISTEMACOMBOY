import { redirect } from "next/navigation";

/** Planilla se movió a Tesorería / Compras (pestaña Planilla). Se mantiene la ruta para no romper enlaces. */
export default function PlanillaPage() {
  redirect("/dashboard/compras?tab=planilla");
}
