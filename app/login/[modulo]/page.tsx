import { redirect } from "next/navigation";

/** /login/ventas, /login/inventario, ... → /login?modulo=<módulo> (el formulario vive en app/login/page.tsx). */
export default function LoginModulo({ params, searchParams }: { params: { modulo: string }; searchParams: { siguiente?: string } }) {
  const siguiente = searchParams.siguiente ? `&siguiente=${encodeURIComponent(searchParams.siguiente)}` : "";
  redirect(`/login?modulo=${encodeURIComponent(params.modulo)}${siguiente}`);
}
