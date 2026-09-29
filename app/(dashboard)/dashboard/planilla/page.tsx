"use client";
import { useState, useEffect, useMemo } from "react";

type TipoSueldo = "DIARIO" | "SEMANAL" | "QUINCENAL" | "MENSUAL";
type TipoAfp = "AFP_INTEGRA" | "AFP_PRIMA" | "AFP_HABITAT" | "AFP_PROFUTURO" | "ONP" | "SIN";

type TrabajadorDB = {
  id: string; // numero de huella
  nombre: string;
  dni: string;
  cargo: string;
  fechaIngreso: string;
  sueldo: number;
  tipoSueldo: TipoSueldo;
  afpTipo: TipoAfp;
  afpPorcentaje: number; // ej 13
  activo: boolean;
};

type TrabajadorCalc = TrabajadorDB & {
  dias: number;
  horas: number;
  tardanzas: number;
  bruto: number;
  descuentoAfp: number;
  neto: number;
  detalleDias: any[];
};

const AFP_OPTIONS: Record<TipoAfp, { label: string, porc: number }> = {
  AFP_INTEGRA: { label: "AFP Integra", porc: 13.0 },
  AFP_PRIMA: { label: "AFP Prima", porc: 12.9 },
  AFP_HABITAT: { label: "AFP Habitat", porc: 12.85 },
  AFP_PROFUTURO: { label: "AFP Profuturo", porc: 12.95 },
  ONP: { label: "ONP 13%", porc: 13.0 },
  SIN: { label: "Sin descuento / Recibo por Honorarios", porc: 0 },
};

export default function PlanillaPage() {
  const [trabajadoresDB, setTrabajadoresDB] = useState<TrabajadorDB[]>([]);
  const [asistenciaMap, setAsistenciaMap] = useState<Map<string, any>>(new Map());
  const [periodo, setPeriodo] = useState("SEMANA 14 - ABRIL 2026");
  const [boletaSel, setBoletaSel] = useState<TrabajadorCalc | null>(null);
  const [showRegistro, setShowRegistro] = useState(false);
  const [form, setForm] = useState<TrabajadorDB>({
    id: "", nombre: "", dni: "", cargo: "Operario", fechaIngreso: new Date().toISOString().split("T")[0],
    sueldo: 80, tipoSueldo: "DIARIO", afpTipo: "AFP_INTEGRA", afpPorcentaje: 13, activo: true
  });

  // Cargar de localStorage
  useEffect(() => {
    const saved = localStorage.getItem("CV_TRABAJADORES_V2");
    if (saved) setTrabajadoresDB(JSON.parse(saved));
  }, []);
  useEffect(() => {
    localStorage.setItem("CV_TRABAJADORES_V2", JSON.stringify(trabajadoresDB));
  }, [trabajadoresDB]);

  // IMPORTAR ASISTENCIA - LEE TU FORMATO N° | Nombre | Tiempo | Estado
  const importarAsistencia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

    const mapa = new Map<string, { nombre: string, fechas: Map<string, any[]> }>();
    json.forEach((r: any) => {
      const numero = String(r["Número"] || r["Numero"] || r["N°"] || "").trim();
      const nombre = String(r["Nombre"] || "").trim();
      const tiempo = String(r["Tiempo"] || "").trim();
      if (!numero ||!tiempo) return;
      if (!mapa.has(numero)) mapa.set(numero, { nombre, fechas: new Map() });
      const fecha = tiempo.split(" ")[0];
      const obj = mapa.get(numero)!;
      if (!obj.fechas.has(fecha)) obj.fechas.set(fecha, []);
      obj.fechas.get(fecha)!.push(tiempo);
      // Si no existe en DB, crealo auto
      if (!trabajadoresDB.find(t => t.id === numero)) {
        setTrabajadoresDB(prev => {
          if (prev.find(p => p.id === numero)) return prev;
          return [...prev, { id: numero, nombre, dni: "", cargo: "Operario", fechaIngreso: new Date().toISOString().split("T")[0], sueldo: 80, tipoSueldo: "DIARIO", afpTipo: "AFP_INTEGRA", afpPorcentaje: 13, activo: true }];
        });
      }
    });
    setAsistenciaMap(mapa as any);
    alert(`Asistencia importada: ${mapa.size} trabajadores`);
  };

  // CALCULO FINAL CRUZANDO DB + ASISTENCIA
  const calculados: TrabajadorCalc[] = useMemo(() => {
    return trabajadoresDB.filter(t=>t.activo).map(t => {
      const asis = asistenciaMap.get(t.id);
      const dias = asis? asis.fechas.size : 0;
      let horas = dias * 8;
      let tardanzas = 0;
      const detalleDias: any[] = [];
      if (asis) {
        asis.fechas.forEach((tiempos: string[], fecha: string) => {
          const entrada = tiempos.sort()[0]?.split(" ")[1] || "";
          if (entrada > "08:15:00") tardanzas++;
          detalleDias.push({ fecha, entrada, horas: 8 });
        });
      }

      // LOGICA DE SUELDO SEGUN TIPO
      let bruto = 0;
      if (t.tipoSueldo === "DIARIO") bruto = t.sueldo * dias;
      if (t.tipoSueldo === "SEMANAL") bruto = (t.sueldo / 6) * dias; // semanal se divide entre 6 dias laborables
      if (t.tipoSueldo === "QUINCENAL") bruto = (t.sueldo / 15) * dias;
      if (t.tipoSueldo === "MENSUAL") bruto = (t.sueldo / 30) * dias;

      const descuentoAfp = bruto * (t.afpPorcentaje / 100);
      const neto = bruto - descuentoAfp;

      return {...t, dias, horas, tardanzas, bruto, descuentoAfp, neto, detalleDias };
    });
  }, [trabajadoresDB, asistenciaMap]);

  const guardarTrabajador = () => {
    if (!form.id ||!form.nombre) return alert("Falta N° y Nombre");
    setTrabajadoresDB(prev => {
      const existe = prev.find(p => p.id === form.id);
      if (existe) return prev.map(p => p.id === form.id? form : p);
      return [...prev, form];
    });
    setShowRegistro(false);
    setForm({ id: "", nombre: "", dni: "", cargo: "Operario", fechaIngreso: new Date().toISOString().split("T")[0], sueldo: 80, tipoSueldo: "DIARIO", afpTipo: "AFP_INTEGRA", afpPorcentaje: 13, activo: true });
  };

  const descargarPDF = async (t: TrabajadorCalc) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("CV COMBOY VID E.I.R.L.", 20, 20);
    doc.setFontSize(10); doc.text(`BOLETA DE PAGO - ${periodo}`, 20, 27);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`Trabajador: ${t.nombre} | DNI: ${t.dni} | N°: ${t.id}`, 20, 38);
    doc.text(`Cargo: ${t.cargo} | Ingreso: ${t.fechaIngreso} | AFP: ${AFP_OPTIONS[t.afpTipo].label} (${t.afpPorcentaje}%)`, 20, 44);
    doc.text(`Tipo Sueldo: ${t.tipoSueldo} S/ ${t.sueldo} | Dias: ${t.dias} | Horas: ${t.horas}`, 20, 50);
    doc.line(20, 55, 190, 55);
    doc.text(`Bruto Calculado: S/ ${t.bruto.toFixed(2)}`, 20, 65);
    doc.text(`Descuento ${t.afpTipo}: - S/ ${t.descuentoAfp.toFixed(2)}`, 20, 72);
    doc.setFont("helvetica", "bold"); doc.text(`NETO A PAGAR: S/ ${t.neto.toFixed(2)}`, 20, 85);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text("Firma Trabajador _________________ Firma Empleador _________________", 20, 110);
    doc.save(`BOLETA_${t.id}_${t.nombre}.pdf`);
  };

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap justify-between gap-2">
        <h1 className="text-xl font-black">Planilla Semanal - COMBOY VID V2</h1>
        <div className="flex gap-2">
          <button onClick={()=>setShowRegistro(true)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">+ Registrar Trabajador</button>
          <label className="cursor-pointer rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold">Importar Asistencia<input type="file" accept=".xlsx,.xls" className="hidden" onChange={importarAsistencia} /></label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <input value={periodo} onChange={e=>setPeriodo(e.target.value)} className="rounded-lg border p-2 text-sm font-bold" />
        <div className="rounded-lg border bg-white p-2 text-sm">Trabajadores: <b>{calculados.length}</b></div>
        <div className="rounded-lg bg-slate-900 p-2 text-sm text-white">Total Neto: <b className="text-amber-400">S/ {calculados.reduce((a,b)=>a+b.neto,0).toFixed(2)}</b></div>
      </div>

      <div className="overflow-auto rounded-xl border bg-white">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-100 text-[10px] uppercase"><tr><th className="p-2">N°</th><th className="p-2">Trabajador / DNI</th><th className="p-2">Sueldo / Tipo</th><th className="p-2">AFP</th><th className="p-2">Dias</th><th className="p-2">Bruto</th><th className="p-2">Dscto</th><th className="p-2">Neto</th><th className="p-2">Boleta</th></tr></thead>
          <tbody>
            {calculados.map(t=>(
              <tr key={t.id} className="border-t">
                <td className="p-2 font-mono">{t.id}</td>
                <td className="p-2"><b>{t.nombre}</b><br/><span className="text-slate-500">{t.dni} - {t.cargo}</span></td>
                <td className="p-2"><select value={t.tipoSueldo} onChange={e=>setTrabajadoresDB(prev=>prev.map(x=>x.id===t.id?{...x,tipoSueldo:e.target.value as any}:x))} className="border text-[10px]"><option>DIARIO</option><option>SEMANAL</option><option>QUINCENAL</option><option>MENSUAL</option></select><br/><input type="number" value={t.sueldo} onChange={e=>setTrabajadoresDB(prev=>prev.map(x=>x.id===t.id?{...x,sueldo:Number(e.target.value)}:x))} className="w-16 border mt-1 p-1" /></td>
                <td className="p-2"><select value={t.afpTipo} onChange={e=>{const tipo=e.target.value as TipoAfp; setTrabajadoresDB(prev=>prev.map(x=>x.id===t.id?{...x,afpTipo:tipo, afpPorcentaje:AFP_OPTIONS[tipo].porc}:x))}} className="border text-[10px] w-24">{Object.entries(AFP_OPTIONS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select><br/>{t.afpPorcentaje}%</td>
                <td className="p-2 text-center">{t.dias}</td>
                <td className="p-2 text-right">S/ {t.bruto.toFixed(2)}</td>
                <td className="p-2 text-right text-red-600">- S/ {t.descuentoAfp.toFixed(2)}</td>
                <td className="p-2 text-right font-black">S/ {t.neto.toFixed(2)}</td>
                <td className="p-2 flex gap-1"><button onClick={()=>setBoletaSel(t)} className="rounded bg-slate-900 px-2 py-1 text-white">Ver</button><button onClick={()=>descargarPDF(t)} className="rounded bg-amber-500 px-2 py-1 font-bold">PDF</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL REGISTRO */}
      {showRegistro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5">
            <h2 className="font-black">Registrar Trabajador Completo</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <input placeholder="N° Huella (Ej: 7)" value={form.id} onChange={e=>setForm({...form,id:e.target.value})} className="rounded border p-2" />
              <input placeholder="DNI" value={form.dni} onChange={e=>setForm({...form,dni:e.target.value})} className="rounded border p-2" />
              <input placeholder="Nombre Completo" value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} className="col-span-2 rounded border p-2" />
              <input placeholder="Cargo" value={form.cargo} onChange={e=>setForm({...form,cargo:e.target.value})} className="rounded border p-2" />
              <input type="date" value={form.fechaIngreso} onChange={e=>setForm({...form,fechaIngreso:e.target.value})} className="rounded border p-2" />
              <select value={form.tipoSueldo} onChange={e=>setForm({...form,tipoSueldo:e.target.value as any})} className="rounded border p-2"><option value="DIARIO">Diario</option><option value="SEMANAL">Semanal</option><option value="QUINCENAL">Quincenal</option><option value="MENSUAL">Mensual</option></select>
              <input type="number" placeholder="Sueldo" value={form.sueldo} onChange={e=>setForm({...form,sueldo:Number(e.target.value)})} className="rounded border p-2" />
              <select value={form.afpTipo} onChange={e=>{const tipo=e.target.value as TipoAfp; setForm({...form,afpTipo:tipo,afpPorcentaje:AFP_OPTIONS[tipo].porc})}} className="rounded border p-2"><option value="AFP_INTEGRA">AFP Integra</option><option value="AFP_PRIMA">AFP Prima</option><option value="AFP_HABITAT">AFP Habitat</option><option value="AFP_PROFUTURO">AFP Profuturo</option><option value="ONP">ONP</option><option value="SIN">SIN AFP (RxH)</option></select>
              <input type="number" value={form.afpPorcentaje} onChange={e=>setForm({...form,afpPorcentaje:Number(e.target.value)})} className="rounded border p-2" placeholder="% AFP" />
            </div>
            <div className="mt-4 flex justify-end gap-2"><button onClick={()=>setShowRegistro(false)} className="rounded border px-4 py-2">Cancelar</button><button onClick={guardarTrabajador} className="rounded bg-amber-500 px-4 py-2 font-bold">Guardar</button></div>
          </div>
        </div>
      )}

      {/* MODAL BOLETA */}
      {boletaSel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6">
            <div className="border-2 border-slate-900 p-4 text-xs">
              <div className="flex justify-between border-b pb-2"><b>CV COMBOY VID - BOLETA DE PAGO {periodo}</b><span>D.S. 001-98-TR</span></div>
              <p className="mt-2"><b>Trabajador:</b> {boletaSel.nombre} - DNI: {boletaSel.dni} - N°: {boletaSel.id}</p>
              <p><b>Cargo:</b> {boletaSel.cargo} | <b>AFP:</b> {AFP_OPTIONS[boletaSel.afpTipo].label} {boletaSel.afpPorcentaje}% | <b>Sueldo:</b> {boletaSel.tipoSueldo} S/ {boletaSel.sueldo}</p>
              <table className="mt-3 w-full border"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Concepto</th><th className="p-2 text-right">Importe</th></tr></thead>
                <tbody><tr className="border-t"><td className="p-2">Remuneración ({boletaSel.dias} dias) - {boletaSel.tipoSueldo}</td><td className="p-2 text-right">S/ {boletaSel.bruto.toFixed(2)}</td></tr><tr className="border-t text-red-600"><td className="p-2">Desc. {boletaSel.afpTipo} {boletaSel.afpPorcentaje}%</td><td className="p-2 text-right">- S/ {boletaSel.descuentoAfp.toFixed(2)}</td></tr><tr className="border-t bg-amber-100 font-bold"><td className="p-2">NETO A PAGAR</td><td className="p-2 text-right">S/ {boletaSel.neto.toFixed(2)}</td></tr></tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end gap-2"><button onClick={()=>setBoletaSel(null)} className="rounded border px-4 py-2">Cerrar</button><button onClick={()=>descargarPDF(boletaSel)} className="rounded bg-amber-500 px-4 py-2 font-bold">Descargar PDF</button></div>
          </div>
        </div>
      )}
    </div>
  );
}