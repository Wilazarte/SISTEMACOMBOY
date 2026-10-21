"use client";

import { Loader2 } from "lucide-react";
import { useUrlArchivo } from "@/lib/storage";

/** <img> de un adjunto guardado en Storage ("sb:...") o en base64 antiguo ("data:..."). */
export function ArchivoImg({ refArchivo, alt, className }: { refArchivo?: string; alt: string; className?: string }) {
  const url = useUrlArchivo(refArchivo);
  if (!url) return <span className={`inline-flex items-center justify-center bg-plomo-100 text-plomo-500 ${className ?? ""}`}><Loader2 size={16} className="animate-spin" /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}

/** <iframe> (PDF) de un adjunto guardado en Storage o en base64 antiguo. */
export function ArchivoFrame({ refArchivo, title, className }: { refArchivo?: string; title: string; className?: string }) {
  const url = useUrlArchivo(refArchivo);
  if (!url) return <span className={`flex items-center justify-center bg-plomo-100 text-plomo-500 ${className ?? ""}`}><Loader2 size={18} className="animate-spin" /></span>;
  return <iframe src={url} title={title} className={className} />;
}
