import type { Prisma } from "@prisma/client";

export interface FiltroCampana {
  regiones?: string[];
  tipos?: string[];
  etapas?: string[];
}

export function whereFiltro(f: FiltroCampana): Prisma.ClienteWhereInput {
  return {
    optIn: true,
    ...(f.regiones?.length ? { region: { in: f.regiones } } : {}),
    ...(f.tipos?.length ? { tipoCliente: { in: f.tipos } } : {}),
    ...(f.etapas?.length ? { etapa: { in: f.etapas } } : {}),
  };
}

export const csv = (s: string | null | undefined) => (s ? s.split(",").filter(Boolean) : []);
