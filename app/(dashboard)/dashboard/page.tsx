"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSesion, inicioDe } from "@/lib/auth";

// El Dashboard de KPIs se implementa en la siguiente fase: por ahora lleva al primer módulo permitido.
export default function DashboardHome() {
  const router = useRouter();
  useEffect(() => {
    const sesion = getSesion();
    router.replace(sesion ? inicioDe(sesion) : "/login");
  }, [router]);
  return null;
}
