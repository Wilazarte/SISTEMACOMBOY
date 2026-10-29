import { GerenciaDashboard } from "@/components/gerencia/GerenciaDashboard";

/** Dashboard Gerencia (War Room): visor general en tiempo real, solo lectura. Acceso: GERENCIA y SOPORTE (lib/auth.ts). */
export default function GerenciaPage() {
  return <GerenciaDashboard />;
}
