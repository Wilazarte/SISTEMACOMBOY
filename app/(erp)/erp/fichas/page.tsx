"use client";

import { Download, ExternalLink, FileText } from "lucide-react";
import { fichasTecnicas } from "@/lib/erp-comercial/data/fichas";

export default function FichasPage() {
  const fichas = fichasTecnicas;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Fichas técnicas</h1>
        <p className="mt-1 text-sm text-gray-400">{fichas.length} fichas disponibles en PDF</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {fichas.map((ficha) => (
          <div key={ficha.id} className="flex flex-col rounded-lg border border-gray-700 bg-gray-900 p-5">
            <div className="mb-3 flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <h2 className="font-semibold text-gray-100">{ficha.nombre}</h2>
            </div>

            <dl className="mb-4 space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-gray-400">Modelo:</dt>
                <dd className="text-gray-200">{ficha.modelo}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400">Categoría:</dt>
                <dd className="text-gray-200">{ficha.categoria}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400">Tamaño:</dt>
                <dd className="text-gray-200">{ficha.tamano}</dd>
              </div>
            </dl>

            <div className="mt-auto flex gap-2">
              <a
                href={ficha.pdf}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                <ExternalLink className="h-4 w-4" />
                Ver PDF
              </a>
              <a
                href={ficha.pdf}
                download
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700"
              >
                <Download className="h-4 w-4" />
                Descargar
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
