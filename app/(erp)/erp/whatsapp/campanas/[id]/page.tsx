import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/erp-comercial/shared";
import { Button } from "@/components/erp-comercial/ui/button";
import { CampanaRunner } from "@/components/erp-comercial/whatsapp/campana-runner";

export default function CampanaPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <PageHeader
        title="Campaña"
        subtitle="Envío masivo con barra de progreso y reporte de entrega"
        actions={<Button asChild variant="ghost"><Link href="/erp/whatsapp/campanas"><ArrowLeft />Volver</Link></Button>}
      />
      <CampanaRunner id={params.id} />
    </div>
  );
}
