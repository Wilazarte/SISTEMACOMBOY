import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { RUTA_CREADOR, RUTA_LOGIN_SUCURSAL, RUTA_SUCURSAL, puedeVer, veTesoreria, type RolAuth, type Sesion } from "@/lib/permisos";
import { RUTA_NO_AUTORIZADO, homeAsignado } from "@/lib/permisosPlanta";

// =====================================================================
// ERP privado: sin sesión no se sirve ninguna página, se va al login.
// En los módulos, además, sin permiso no se entra (mismas reglas que el navegador,
// lib/permisos.ts). Los datos los protege RLS en Supabase.
// =====================================================================

const LOGIN = "/login";
const esLogin = (ruta: string) => ruta === LOGIN || ruta.startsWith(`${LOGIN}/`) || ruta === RUTA_LOGIN_SUCURSAL;

/** Rutas de módulos cuyo permiso se revisa en el servidor (el resto solo exige sesión). */
const MODULOS = ["/dashboard", RUTA_SUCURSAL, "/erp", "/gerencia", "/logistica", "/almacen", "/finanzas", "/produccion", "/soporte"];
const enModulo = (ruta: string) => MODULOS.some((m) => ruta === m || ruta.startsWith(`${m}/`));

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const ruta = req.nextUrl.pathname;
  if (esLogin(ruta)) return res;

  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(cookiesToSet) {
        // Token renovado: se copia a la petición y a la respuesta
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const enSecocha = ruta === RUTA_SUCURSAL || ruta.startsWith(`${RUTA_SUCURSAL}/`);
  const ir = (destino: string, siguiente?: boolean) => {
    const url = req.nextUrl.clone();
    url.pathname = destino;
    url.search = siguiente ? `?siguiente=${encodeURIComponent(ruta + req.nextUrl.search)}` : "";
    const r = NextResponse.redirect(url);
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  // getClaims valida la firma del token: una cookie inventada no pasa
  const { data } = await sb.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) {
    if (ruta.startsWith("/api/")) return NextResponse.json({ error: "SIN_SESION", mensaje: "Inicie sesión." }, { status: 401 });
    return ir(enSecocha ? RUTA_LOGIN_SUCURSAL : LOGIN, !enSecocha && ruta.startsWith("/dashboard/"));
  }

  // Las páginas sueltas (/, /seleccionar-modulo, /api…) solo piden sesión
  if (ruta === RUTA_NO_AUTORIZADO || !enModulo(ruta)) return res;

  // "*": modulo_asignado y activo (20261106_perfiles_asignacion.sql) son opcionales hasta correr su SQL
  const { data: p } = await sb.from("perfiles").select("*").eq("id", uid).maybeSingle();
  if (!p || p.activo === false) return ir(enSecocha ? RUTA_LOGIN_SUCURSAL : LOGIN);
  const sesion: Sesion = { usuario: p.usuario, rol: p.rol as RolAuth, nombre: p.nombre, modulos: p.modulos ?? [], soloLectura: !!p.solo_lectura, moduloAsignado: p.modulo_asignado ?? undefined };

  // Perfiles asignados (pedido de Williams, 2026-10-30): quien no es SOPORTE entra solo a su módulo;
  // /dashboard y cualquier ruta sin permiso lo llevan a su INICIO (/almacen, /finanzas, /logistica, /produccion)
  const asignado = enSecocha ? null : homeAsignado(sesion);
  if (ruta === "/dashboard") return asignado ? ir(asignado) : res;

  const permitido = ruta === "/dashboard/compras" ? veTesoreria(sesion) : puedeVer(sesion, ruta);
  if (!permitido && asignado) return ir(asignado);
  // Sin módulos asignados se deja pasar: el layout muestra el aviso (evita el bucle con /login)
  if (!permitido && (sesion.modulos.length > 0 || ruta.startsWith(RUTA_CREADOR))) return ir(enSecocha ? RUTA_LOGIN_SUCURSAL : RUTA_NO_AUTORIZADO);
  return res;
}

export const config = {
  // Todo menos archivos estáticos (_next, imágenes, íconos) y robots.txt
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico|gif|css|js|woff2?)$).*)"],
};
