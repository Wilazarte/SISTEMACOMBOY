import { NextResponse } from "next/server";

/** Envuelve un handler para devolver errores como JSON { error } */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const r = await fn(...args);
      return r instanceof Response ? r : NextResponse.json(r ?? { ok: true });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Error interno";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  };
}

export type Ctx = { params: { id: string } };
