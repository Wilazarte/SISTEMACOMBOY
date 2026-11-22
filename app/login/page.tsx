"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoginDosPaneles from "@/components/login/LoginDosPaneles";
import { MODULOS_LOGIN, type ModuloLogin } from "@/lib/auth";

/** Alias de URL: "compras"/"tesoreria"/"planilla" = Finanzas, "inventario" = Producción. /login/<slug> redirige aquí con ?modulo=. */
function moduloPedido(v: string | null): ModuloLogin | "" {
  const m = (v ?? "").trim().toLowerCase();
  if (m === "compras" || m === "tesoreria" || m === "planilla") return "finanzas";
  if (m === "inventario") return "produccion";
  return m in MODULOS_LOGIN ? (m as ModuloLogin) : "";
}

export default function LoginPage() {
  // useSearchParams necesita Suspense para el prerender de Next
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0b0e]" />}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  const router = useRouter();
  const pedido = moduloPedido(params.get("modulo"));

  // Enlaces antiguos /login?modulo=sucursal: la sucursal tiene su URL propia (misma pantalla, Secocha elegida)
  useEffect(() => {
    if (pedido === "sucursal") router.replace("/secocha/login");
  }, [pedido, router]);

  return <LoginDosPaneles inicial={pedido} siguiente={params.get("siguiente")} />;
}
