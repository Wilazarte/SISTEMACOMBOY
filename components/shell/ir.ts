"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { EV_IR_PESTANA } from "@/components/ui";

/** Navega a una ruta del ERP; si trae ?tab=, abre esa pestaña (también si ya se está en la página). */
export function useIr(): (href: string) => void {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      router.push(href);
      const tab = new URL(href, window.location.origin).searchParams.get("tab");
      if (!tab) return;
      const avisar = () => window.dispatchEvent(new CustomEvent(EV_IR_PESTANA, { detail: tab }));
      avisar(); // misma página: las pestañas ya escuchan
      setTimeout(avisar, 300); // otra página: cuando termine de montar
    },
    [router]
  );
}
