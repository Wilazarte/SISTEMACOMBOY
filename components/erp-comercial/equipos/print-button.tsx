"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/erp-comercial/ui/button";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="bg-blue-700 text-white hover:bg-blue-800">
      <Printer />Imprimir / Guardar PDF
    </Button>
  );
}
