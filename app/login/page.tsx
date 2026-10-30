"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, BarChart3, Eye, EyeOff, Factory, Landmark, Loader2, Lock, LogIn, Store, Truck, User, X, type LucideIcon } from "lucide-react";
import { CLAVE_MODULO, CLAVE_USUARIO, MODULOS_LOGIN, RUTA_LOGIN_SUCURSAL, RUTA_SUCURSAL, soloSecocha, login, logout, moduloGuardado, perteneceAModulo, puedeVer, rutaDeModulo, useSesion, type ModuloLogin } from "@/lib/auth";
import { CLAVE_SELECCION, ENCARGADOS_LOGIN, tarjetaDe } from "@/components/modulos-login";
import { homeAsignado } from "@/lib/permisosPlanta";

/**
 * Tarjetas de perfil (matriz de Williams, 2026-10-30): iniciales, persona y perfil. `slug` es la ruta /login/<slug>
 * (app/login/[modulo] redirige a /login?modulo=). GERENCIA es nuevo y de solo lectura; PRODUCCION, permisos limitados.
 */
const DOCK: { id: ModuloLogin; slug: string; titulo: string; iniciales: string; persona: string; icon: LucideIcon; badge?: { texto: string; clase: string } }[] = [
  { id: "soporte", slug: "soporte", titulo: "SOPORTE", iniciales: "AS", persona: "Adm", icon: BarChart3, badge: { texto: "Admin", clase: "bg-white/15 text-white" } },
  { id: "finanzas", slug: "finanzas", titulo: "FINANZAS", iniciales: "LF", persona: "Lizbeth", icon: Factory },
  { id: "almacen", slug: "almacen", titulo: "ALMACEN", iniciales: "JA", persona: "Jose", icon: Landmark },
  { id: "logistica", slug: "logistica", titulo: "LOGISTICA", iniciales: "WL", persona: "Williams", icon: Truck },
  { id: "produccion", slug: "produccion", titulo: "PRODUCCION", iniciales: "MP", persona: "Manuel", icon: Store, badge: { texto: "Permisos limitados", clase: "bg-white/10 text-white/80" } },
  { id: "gerencia", slug: "gerencia", titulo: "GERENCIA GENERAL", iniciales: "GG", persona: "Gerencia General", icon: BarChart3, badge: { texto: "NEW · Read-Only", clase: "bg-[#facc15] text-black" } },
];

/**
 * SECOCHA: sistema aparte (no es un módulo del ERP; Arequipa es la Planta Principal). Abre su propio login (/secocha/login);
 * ahí y en la base (RLS sede_isolation) se controla que solo entren usuarios de Secocha o del ERP central.
 */
const SUCURSAL_SECOCHA = { titulo: "SECOCHA", href: RUTA_LOGIN_SUCURSAL };

/** Alias de URL: "compras" = Tesorería, "inventario" = Producción. */
function moduloPedido(v: string | null): ModuloLogin | "" {
  const m = (v ?? "").trim().toLowerCase();
  if (m === "compras") return "tesoreria";
  if (m === "inventario") return "produccion";
  return m in MODULOS_LOGIN ? (m as ModuloLogin) : "";
}

const CAMPO =
  "h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] pl-10 text-[15px] text-white outline-none transition placeholder:text-white/30 focus:border-[#ff3a3a] focus:bg-white/[0.09] focus:ring-2 focus:ring-[#ff3a3a]/30 md:h-11 md:text-sm";

export default function LoginPage() {
  // useSearchParams necesita Suspense para el prerender de Next
  return (
    <Suspense fallback={<Fondo />}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const { sesion } = useSesion();
  const pedido = moduloPedido(params.get("modulo"));
  // Módulo en "próximamente": se marca en el dock pero no abre el formulario
  const proximamente = pedido !== "" && !!tarjetaDe(pedido).proximamente;
  const modulo = proximamente ? "" : pedido;
  // ?siguiente=/dashboard/... (ej. "Realizar requerimiento" desde /seleccionar-modulo)
  const siguiente = params.get("siguiente");
  const [activo, setActivo] = useState<ModuloLogin | "">(pedido);
  const [usuario, setUsuario] = useState("");
  const [pass, setPass] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => setActivo(pedido), [pedido]);

  // Secocha (antes Sucursal) es un sistema aparte con su propio login
  useEffect(() => {
    if (pedido === "sucursal") router.replace(RUTA_LOGIN_SUCURSAL);
  }, [pedido, router]);

  // Sesión ya abierta con un módulo elegido: ir directo a ese módulo
  useEffect(() => {
    const m = moduloGuardado();
    if (sesion && !enviando && soloSecocha(sesion)) router.replace(RUTA_SUCURSAL);
    else if (sesion && !enviando && homeAsignado(sesion)) router.replace(homeAsignado(sesion)!);
    else if (sesion && m && !enviando) router.replace(rutaDeModulo(sesion, m));
  }, [sesion, router, enviando]);

  const elegir = (id: ModuloLogin, slug: string) => {
    setError("");
    setActivo(id);
    try {
      window.localStorage.setItem(CLAVE_SELECCION, id);
    } catch {
      /* almacenamiento bloqueado */
    }
    router.push(`/login/${slug}${siguiente ? `?siguiente=${encodeURIComponent(siguiente)}` : ""}`, { scroll: false });
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!modulo) return;
    if (!usuario.trim() || !pass) {
      setError("Ingrese su nombre, usuario o correo y la contraseña.");
      return;
    }
    setEnviando(true);
    // Supabase Auth + tabla perfiles (rol y módulos asignados), ver lib/auth.ts
    const r = await login(usuario, pass);
    if (!r.sesion) {
      setEnviando(false);
      setPass("");
      setError(r.error ?? "Usuario o contraseña incorrectos.");
      return;
    }
    // Usuario solo de Secocha (modulos = ["/secocha"]): directo a su módulo
    if (soloSecocha(r.sesion)) {
      router.replace(RUTA_SUCURSAL);
      return;
    }
    // Perfil asignado (Finanzas, Almacén, Logística, Producción): siempre a su INICIO, elija el módulo que elija
    const asignado = homeAsignado(r.sesion);
    if (asignado) {
      try {
        window.localStorage.setItem(CLAVE_USUARIO, r.sesion.usuario);
      } catch {
        /* almacenamiento bloqueado */
      }
      router.replace(siguiente && puedeVer(r.sesion, siguiente.split("?")[0]) ? siguiente : asignado);
      return;
    }
    if (!perteneceAModulo(r.sesion, modulo)) {
      await logout();
      setEnviando(false);
      setPass("");
      setError("Este usuario no tiene acceso a este módulo");
      return;
    }
    try {
      window.localStorage.setItem(CLAVE_MODULO, modulo);
      window.localStorage.setItem(CLAVE_USUARIO, r.sesion.usuario);
    } catch {
      /* almacenamiento bloqueado: el header usa la ruta actual */
    }
    const destino = siguiente?.startsWith("/dashboard/") && puedeVer(r.sesion, siguiente.split("?")[0]) ? siguiente : rutaDeModulo(r.sesion, modulo);
    router.replace(destino);
  };

  const encargado = modulo ? ENCARGADOS_LOGIN[modulo] : null;

  return (
    <Fondo>
      {/* Logo (tal cual, sin fondo) */}
      <header className="mt-8 flex justify-center px-4">
        <Logo />
      </header>

      {/* Título + formulario del módulo elegido */}
      <section className="flex flex-col items-center px-4 text-center">
        <h1 className="mt-10 font-serif text-[28px] font-bold uppercase leading-tight text-white md:text-[40px]">BIENVENIDO AL SISTEMA ERP COMBOY VID</h1>
        <p className="mt-4 text-[20px] text-[#6B8AFF]">{encargado ? `${encargado.nombre} · ${encargado.cargo}` : "Selecciona tu módulo"}</p>
        {proximamente && (
          <p className="mt-6 animate-aparecer rounded-full border border-white/20 bg-black/40 px-5 py-2 text-sm text-white/80 backdrop-blur-xl">
            {tarjetaDe(pedido as ModuloLogin).titulo.split(" (")[0]} estará disponible próximamente.
          </p>
        )}

        {modulo && (
          <form
            key={modulo}
            onSubmit={entrar}
            noValidate
            className="mt-8 w-full max-w-sm animate-aparecer space-y-4 rounded-3xl border border-white/20 bg-black/40 p-6 text-left shadow-[0_0_40px_rgba(196,30,30,0.35)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Iniciar sesión</h2>
              <button
                type="button"
                onClick={() => router.push("/login", { scroll: false })}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
                aria-label="Cambiar módulo"
              >
                <X size={16} />
              </button>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/50">Usuario</span>
              <span className="relative block">
                <User size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#ff3a3a]" />
                <input
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  placeholder="Nombre, usuario o correo"
                  className={`${CAMPO} pr-3`}
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/50">Contraseña</span>
              <span className="relative block">
                <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#ff3a3a]" />
                <input
                  type={ver ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`${CAMPO} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setVer((v) => !v)}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
                  aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {ver ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="flex animate-aparecer items-center gap-2 rounded-xl border border-[#ff3a3a]/40 bg-[#7a0f0f]/40 px-3 py-2.5 text-sm font-medium text-[#ffb4b4]">
                <AlertCircle size={16} className="shrink-0" /> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[#ff3a3a] bg-gradient-to-b from-[#c41e1e] to-[#7a0f0f] font-bold text-white shadow-[0_0_25px_rgba(255,0,0,0.55)] transition hover:shadow-[0_0_32px_rgba(255,0,0,0.8)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 md:h-11"
            >
              {enviando ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Ingresar
            </button>
          </form>
        )}
      </section>

      {/* Dock de módulos (scroll horizontal en mobile) */}
      <nav className="mt-10 w-full px-4 pb-10">
        <div className="mx-auto flex w-full max-w-[1100px] justify-between gap-3 overflow-x-auto rounded-3xl border border-white/15 bg-black/55 px-6 py-4 backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {DOCK.map(({ id, slug, titulo, iniciales, persona, badge }) => {
            const sel = activo === id;
            return (
              <button
                key={id}
                type="button"
                data-modulo={id}
                aria-pressed={sel}
                onClick={() => elegir(id, slug)}
                className={`flex min-h-[118px] min-w-[128px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl border bg-[#141414]/90 px-2 py-3 text-center text-white transition-all duration-200 hover:scale-105 hover:border-[#D50000] hover:shadow-[0_0_20px_rgba(213,0,0,0.75)] ${
                  sel ? "scale-105 border-[#D50000] shadow-[0_0_22px_rgba(213,0,0,0.9)]" : "border-white/15"
                }`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[15px] font-bold">{iniciales}</span>
                <span className="text-[14px] font-bold leading-tight">{persona}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">{titulo}</span>
                {badge && <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.clase}`}>{badge.texto}</span>}
              </button>
            );
          })}
          {/* Sistema aparte: botón azul; se oculta solo si ya hay sesión de un usuario sin acceso a la sucursal */}
          {(!sesion || perteneceAModulo(sesion, "sucursal")) && (
            <button
              type="button"
              data-modulo="sucursal-secocha"
              onClick={() => router.push(SUCURSAL_SECOCHA.href)}
              className="flex h-20 min-w-[132px] flex-1 flex-col items-center justify-center gap-1.5 rounded-full border border-blue-500 bg-blue-500/15 text-center text-[14px] font-bold leading-tight text-blue-100 shadow-[0_0_15px] shadow-blue-500/50 transition-all duration-200 hover:bg-blue-500/25 hover:shadow-blue-500/80"
            >
              <Store size={24} strokeWidth={2} />
              {SUCURSAL_SECOCHA.titulo}
            </button>
          )}
        </div>
      </nav>
    </Fondo>
  );
}

/** Logo COMBOY VID transparente (/logo.png), al 150 %. */
function Logo() {
  return <Image src="/logo.png" alt="COMBOY VID" width={750} height={240} priority className="h-[240px] w-[750px] max-w-full object-contain drop-shadow-[0_0_18px_rgba(0,0,0,0.6)]" />;
}

/** Fondo: imagen de referencia /login-bg.jpg a pantalla completa con overlay negro 40%. */
function Fondo({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-black">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1]">
        <Image src="/login-bg.jpg" alt="" fill priority quality={90} sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-black/40" />
      </div>
      <main className="relative z-10 flex min-h-screen flex-col">{children}</main>
    </div>
  );
}
