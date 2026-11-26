"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, FileDown, Pencil, Search, Trash2, Send } from "lucide-react";
import type { Equipo } from "@prisma/client";
import { Table, TBody, TD, TH, THead, TR } from "@/components/erp-comercial/ui/table";
import { Input, Select } from "@/components/erp-comercial/ui/input";
import { Button } from "@/components/erp-comercial/ui/button";
import { Badge } from "@/components/erp-comercial/ui/badge";
import { EquipoForm } from "./equipo-form";
import { api } from "@/lib/erp-comercial/api-client";
import { cn, parseJSON, soles } from "@/lib/erp-comercial/utils";
import { rentabilidad } from "@/lib/erp-comercial/costos";

export function EquiposTable({ equipos }: { equipos: (Equipo & { cotizado: number; costoProd: number | null })[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [marca, setMarca] = useState("");
  const [stock, setStock] = useState("");
  const categorias = Array.from(new Set(equipos.map((e) => e.categoria))).sort();
  const marcas = Array.from(new Set(equipos.map((e) => e.marca))).sort();

  const filtrados = useMemo(
    () =>
      equipos.filter(
        (e) =>
          (!q || `${e.codigo} ${e.nombre} ${e.descripcion}`.toLowerCase().includes(q.toLowerCase())) &&
          (!cat || e.categoria === cat) &&
          (!marca || e.marca === marca) &&
          (!stock || (stock === "bajo" ? e.stock < 10 : e.stock >= 10)),
      ),
    [equipos, q, cat, marca, stock],
  );

  async function eliminar(e: Equipo) {
    try {
      await api(`/erp/api/equipos/${e.id}`, "DELETE");
      toast.success("Equipo eliminado");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar código, nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-44" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select className="w-40" value={marca} onChange={(e) => setMarca(e.target.value)}>
          <option value="">Todas las marcas</option>
          {marcas.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select className="w-36" value={stock} onChange={(e) => setStock(e.target.value)}>
          <option value="">Todo el stock</option>
          <option value="bajo">Stock bajo (&lt;10)</option>
          <option value="ok">Stock OK</option>
        </Select>
      </div>
      <div className="rounded-xl border bg-card">
        <Table>
          <THead>
            <TR>
              <TH>Equipo</TH><TH>Categoría</TH><TH className="text-right">Stock</TH><TH className="text-right">Costo prod.</TH>
              <TH className="text-right">Precio lista</TH><TH className="text-right">Ganancia</TH><TH className="text-right">Margen</TH><TH className="text-right">Cotizado</TH><TH />
            </TR>
          </THead>
          <TBody>
            {filtrados.map((e) => {
              const foto = parseJSON<string[]>(e.fotos, [])[0];
              const r = e.costoProd === null ? null : rentabilidad(e.precioLista, e.costoProd);
              const tono = (v: number | null | undefined) => (v == null ? "text-muted-foreground" : v < 0 ? "text-rose-400" : "text-emerald-400");
              return (
                <TR key={e.id}>
                  <TD>
                    <Link href={`/erp/equipos/${encodeURIComponent(e.codigo)}/costos`} title="Ver costo de producción" className="flex items-center gap-3 hover:text-primary">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {foto ? <img src={foto} alt="" className="h-10 w-12 rounded object-cover" /> : <div className="h-10 w-12 rounded bg-muted" />}
                      <div>
                        <div className="font-medium">{e.nombre}</div>
                        <div className="text-xs text-muted-foreground">{e.codigo} · {e.marca}</div>
                      </div>
                    </Link>
                  </TD>
                  <TD><Badge variant="secondary">{e.categoria}</Badge></TD>
                  <TD className="text-right tabular-nums">{e.stock < 10 ? <Badge variant="danger">{e.stock}</Badge> : e.stock}</TD>
                  <TD className="text-right tabular-nums">
                    {e.costoProd === null ? (
                      <Link href={`/erp/equipos/${e.id}?tab=costos`} className="text-xs text-muted-foreground hover:text-primary hover:underline">Sin costeo</Link>
                    ) : soles(e.costoProd)}
                  </TD>
                  <TD className="text-right font-medium tabular-nums">{soles(e.precioLista)}</TD>
                  <TD className={cn("text-right tabular-nums", tono(r?.ganancia))}>{r ? soles(r.ganancia) : "—"}</TD>
                  <TD className={cn("text-right tabular-nums", tono(r?.margen))}>{r?.margen == null ? "—" : `${r.margen.toFixed(1)}%`}</TD>
                  <TD className="text-right tabular-nums">{e.cotizado}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button asChild size="icon" variant="ghost" title="Ver detalle"><Link href={`/erp/equipos/${e.id}`}><Eye /></Link></Button>
                      <Button asChild size="icon" variant="ghost" title="Ficha PDF"><a href={`/erp/api/equipos/${e.id}/pdf`} target="_blank"><FileDown /></a></Button>
                      <Button asChild size="icon" variant="ghost" title="Enviar oferta por WhatsApp"><Link href={`/erp/whatsapp/ofertas?equipo=${e.id}`}><Send className="text-wa" /></Link></Button>
                      <EquipoForm equipo={e} trigger={<Button size="icon" variant="ghost" title="Editar"><Pencil /></Button>} />
                      <ConfirmDelete onConfirm={() => eliminar(e)} />
                    </div>
                  </TD>
                </TR>
              );
            })}
            {!filtrados.length && <TR><TD colSpan={9} className="py-8 text-center text-muted-foreground">Sin resultados</TD></TR>}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

export function ConfirmDelete({ onConfirm, label }: { onConfirm: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <Button size="sm" variant="destructive" onClick={() => { setArmed(false); onConfirm(); }} onBlur={() => setArmed(false)} autoFocus>
      ¿Eliminar?
    </Button>
  ) : (
    <Button size={label ? "sm" : "icon"} variant="ghost" onClick={() => setArmed(true)} title="Eliminar">
      <Trash2 className="text-rose-400" />{label}
    </Button>
  );
}
