"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function HistorialPage(){
  const [lista,setLista]=useState<any[]>([]);
  useEffect(()=>{(async()=>{
    const sb=createClient();
    const {data}=await sb.from("planilla_historial").select("*").order("fecha_cierre",{ascending:false});
    setLista(data||[]);
  })()},[]);
  return(
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Historial - {lista.length} cierres</h1>
      <div className="grid gap-3">
        {lista.map((h:any)=>(
          <Link key={h.id} href={`/dashboard/planilla/historial/${h.id}`} className="border p-4 rounded-lg flex justify-between hover:bg-gray-50">
            <div>
              <div className="font-bold">{h.periodo}</div>
              <div className="text-xs text-gray-500">{new Date(h.fecha_cierre).toLocaleString('es-PE')}</div>
            </div>
            <div className="text-right">
              <div className="font-bold">S/ {h.total_neto}</div>
              <div className="text-xs text-gray-500">Bruto S/ {h.total_bruto}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}