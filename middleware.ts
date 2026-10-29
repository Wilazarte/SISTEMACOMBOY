import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// =====================================================================
// ERP privado: sin sesión no se sirve ninguna página, se va al login.
// Los permisos de cada rol los aplican los módulos (lib/auth.ts, lib/permisosPlanta.ts)
// y los datos los protege RLS en Supabase.
// =====================================================================

const LOGIN = "/login";
const LOGIN_SECOCHA = "/secocha/login";
const esLogin = (ruta: string) => ruta === LOGIN || ruta.startsWith(`${LOGIN}/`) || ruta === LOGIN_SECOCHA;

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

  // getClaims valida la firma del token: una cookie inventada no pasa
  const { data } = await sb.auth.getClaims();
  if (data?.claims?.sub) return res;

  if (ruta.startsWith("/api/")) return NextResponse.json({ error: "SIN_SESION", mensaje: "Inicie sesión." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = ruta === "/secocha" || ruta.startsWith("/secocha/") ? LOGIN_SECOCHA : LOGIN;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Todo menos archivos estáticos (_next, imágenes, íconos) y robots.txt
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico|gif|css|js|woff2?)$).*)"],
};
