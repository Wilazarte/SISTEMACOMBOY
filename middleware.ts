import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { RUTA_CREADOR, RUTA_LOGIN_SUCURSAL, RUTA_SUCURSAL, puedeVer, veTesoreria, type RolAuth, type Sesion } from "@/lib/permisos";

// =====================================================================
// Protección de rutas en el servidor: sin sesión no se sirve ninguna
// página del ERP ni de Secocha, y sin permiso no se entra al módulo.
// Mismas reglas que el navegador (lib/permisos.ts); los datos además
// los protege RLS en Supabase.
// =====================================================================

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
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

  const ruta = req.nextUrl.pathname;
  const enSecocha = ruta === RUTA_SUCURSAL || ruta.startsWith(`${RUTA_SUCURSAL}/`);
  if (ruta === RUTA_LOGIN_SUCURSAL) return res;

  const ir = (destino: string, siguiente?: boolean) => {
    const url = req.nextUrl.clone();
    url.pathname = destino;
    url.search = siguiente ? `?siguiente=${encodeURIComponent(ruta + req.nextUrl.search)}` : "";
    const r = NextResponse.redirect(url);
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  // getClaims valida la firma del token (sin ir a Supabase si el proyecto usa claves asimétricas)
  const { data } = await sb.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return ir(enSecocha ? RUTA_LOGIN_SUCURSAL : "/login", !enSecocha);

  // /dashboard solo redirige al primer módulo permitido: no hace falta leer el perfil
  if (ruta === "/dashboard") return res;

  const { data: p } = await sb.from("perfiles").select("usuario,rol,nombre,modulos,solo_lectura").eq("id", uid).maybeSingle();
  if (!p) return ir(enSecocha ? RUTA_LOGIN_SUCURSAL : "/login");
  const sesion: Sesion = { usuario: p.usuario, rol: p.rol as RolAuth, nombre: p.nombre, modulos: p.modulos ?? [], soloLectura: !!p.solo_lectura };

  const permitido = ruta === "/dashboard/compras" ? veTesoreria(sesion) : puedeVer(sesion, ruta);
  // Sin módulos asignados se deja pasar: el layout muestra el aviso (evita el bucle con /login)
  if (!permitido && (sesion.modulos.length > 0 || ruta.startsWith(RUTA_CREADOR))) return ir(enSecocha ? RUTA_LOGIN_SUCURSAL : "/dashboard");
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/secocha/:path*"],
};
