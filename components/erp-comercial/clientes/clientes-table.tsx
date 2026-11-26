"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search } from "lucide-react";
import type { Cliente, Vendedor } from "@prisma/client";
import { Table, TBody, TD, TH, THead, TR } from "@/components/erp-comercial/ui/table";
import { Input, Select } from "@/components/erp-comercial/ui/input";
import { Button } from "@/components/erp-comercial/ui/button";
import { EtapaBadge, RegionBadge, TipoBadge } from "@/components/erp-comercial/shared";
import { ETAPAS, LABEL_ETAPA, LABEL_REGION, LABEL_TIPO, REGIONES, TIPOS_CLIENTE } from "@/lib/erp-comercial/constants";
import { diasDesde, fecha, soles } from "@/lib/erp-comercial/utils";

type Row = Cliente & { vendedor: Vendedor | null; totalCompras: number };

export function ClientesTable({ clientes, vendedores }: { clientes: Row[]; vendedores: Vendedor[] }) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [tipo, setTipo] = useState("");
  const [etapa, setEtapa] = useState("");
  const [vend, setVend] = useState("");
  const filtrados = useMemo(
    () =>
      clientes.filter(
        (c) =>
          (!q || `${c.razonSocial} ${c.documento} ${c.contacto} ${c.telefono}`.toLowerCase().includes(q.toLowerCase())) &&
          (!region || c.region === region) && (!tipo || c.tipoCliente === tipo) && (!etapa || c.etapa === etapa) && (!vend || c.vendedorId === vend),
      ),
    [clientes, q, region, tipo, etapa, vend],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar RUC/DNI, razón social, contacto, teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-36" value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Región</option>{REGIONES.map((r) => <option key={r} value={r}>{LABEL_REGION[r]}</option>)}</Select>
        <Select className="w-36" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Tipo</option>{TIPOS_CLIENTE.map((r) => <option key={r} value={r}>{LABEL_TIPO[r]}</option>)}</Select>
        <Select className="w-36" value={etapa} onChange={(e) => setEtapa(e.target.value)}><option value="">Etapa</option>{ETAPAS.map((r) => <option key={r} value={r}>{LABEL_ETAPA[r]}</option>)}</Select>
        <Select className="w-40" value={vend} onChange={(e) => setVend(e.target.value)}><option value="">Vendedor</option>{vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</Select>
      </div>
      <div className="rounded-xl border bg-card">
        <Table>
          <THead>
            <TR><TH>Cliente</TH><TH>Documento</TH><TH>Región</TH><TH>Tipo</TH><TH>Etapa</TH><TH>Vendedor</TH><TH className="text-right">Compras</TH><TH className="text-right">Crédito disp.</TH><TH>Últ. contacto</TH><TH /></TR>
          </THead>
          <TBody>
            {filtrados.map((c) => {
              const d = diasDesde(c.ultimoContacto);
              return (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/erp/clientes/${c.id}`} className="hover:text-primary">
                      <div className="font-medium">{c.razonSocial}</div>
                      <div className="text-xs text-muted-foreground">{c.contacto} · +{c.telefono}</div>
                    </Link>
                  </TD>
                  <TD className="text-xs tabular-nums text-muted-foreground">{c.tipoDocumento} {c.documento}</TD>
                  <TD><RegionBadge region={c.region} /></TD>
                  <TD><TipoBadge tipo={c.tipoCliente} /></TD>
                  <TD><EtapaBadge etapa={c.etapa} /></TD>
                  <TD className="text-sm">{c.vendedor?.nombre ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{soles(c.totalCompras)}</TD>
                  <TD className="text-right tabular-nums">{c.limiteCredito ? soles(c.limiteCredito - c.creditoUsado) : "—"}</TD>
                  <TD className="text-xs">
                    <div>{fecha(c.ultimoContacto)}</div>
                    {d !== null && d > 7 && <div className="text-amber-300">hace {d} días</div>}
                  </TD>
                  <TD><Button asChild size="icon" variant="ghost" title="Abrir chat"><Link href={`/erp/whatsapp?c=${c.id}`}><MessageCircle className="text-wa" /></Link></Button></TD>
                </TR>
              );
            })}
            {!filtrados.length && <TR><TD colSpan={10} className="py-8 text-center text-muted-foreground">Sin resultados</TD></TR>}
          </TBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{filtrados.length} de {clientes.length} clientes</p>
    </div>
  );
}
