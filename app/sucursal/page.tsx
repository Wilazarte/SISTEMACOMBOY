import { redirect } from "next/navigation";

/** /sucursal y /sucursal-beta → Módulo Sucursal Beta (vive dentro del layout del ERP). */
export default function IrSucursal() {
  redirect("/dashboard/sucursal");
}
