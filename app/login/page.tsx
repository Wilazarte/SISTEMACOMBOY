"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, BarChart3, Calculator, Eye, EyeOff, Factory, Landmark, Loader2, Lock, LogIn, Store, Truck, User, X, type LucideIcon } from "lucide-react";
import { CLAVE_MODULO, CLAVE_USUARIO, MODULOS_LOGIN, RUTA_LOGIN_SUCURSAL, RUTA_SUCURSAL, soloSecocha, login, logout, moduloGuardado, perteneceAModulo, puedeVer, rutaDeModulo, useSesion, type ModuloLogin } from "@/lib/auth";
import { CLAVE_SELECCION, ENCARGADOS_LOGIN, tarjetaDe } from "@/components/modulos-login";

/** Botones del dock: `slug` es la ruta /login/<slug> (app/login/[modulo] redirige a /login?modulo=). */
const DOCK: { id: ModuloLogin; slug: string; titulo: string; icon: LucideIcon }[] = [
  { id: "ventas", slug: "ventas", titulo: "VENTAS", icon: BarChart3 },
  { id: "contable", slug: "contable", titulo: "CONTABLE", icon: Calculator },
  { id: "tesoreria", slug: "tesoreria", titulo: "TESORERIA", icon: Landmark },
  { id: "produccion", slug: "inventario", titulo: "PRODUCCION", icon: Factory },
  { id: "logistica", slug: "logistica", titulo: "LOGISTICA", icon: Truck },
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
  // Logística sigue en "próximamente": se marca en el dock pero no abre el formulario
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
      setError("Ingrese usuario y contraseña.");
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
        <h1 className="mt-12 text-[28px] font-bold uppercase leading-tight text-white md:text-[40px]">BIENVENIDO AL SISTEMA ERP COMBOY VID</h1>
        <p className="mt-4 text-[20px] text-[#8fb0ff]">{encargado ? `${encargado.nombre} · ${encargado.cargo}` : "Selecciona tu módulo"}</p>
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
                  placeholder="ej. almacen"
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
        <div className="mx-auto flex w-full max-w-[1050px] justify-between gap-3 overflow-x-auto rounded-full border border-white/20 bg-black/30 px-6 py-4 backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {DOCK.map(({ id, slug, titulo, icon: Icon }) => {
            const sel = activo === id;
            return (
              <button
                key={id}
                type="button"
                data-modulo={id}
                aria-pressed={sel}
                onClick={() => elegir(id, slug)}
                className={`flex h-20 min-w-[112px] flex-1 flex-col items-center justify-center gap-1.5 rounded-full border text-[15px] font-bold text-white transition-all duration-200 ${
                  sel
                    ? "border-[#ff5a5a] bg-gradient-to-b from-[#e42323] to-[#7a0000] shadow-[0_0_22px_rgba(255,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.35)]"
                    : "border-white/20 bg-white/10 text-white/85 hover:border-white/40 hover:bg-white/15 hover:text-white"
                }`}
              >
                <Icon size={24} strokeWidth={2} />
                {titulo}
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

/** Logo COMBOY VID transparente (/logo.png). */
function Logo() {
  return <Image src="/logo.png" alt="COMBOY VID" width={500} height={160} priority className="h-[160px] w-[500px] max-w-full object-contain drop-shadow-[0_0_18px_rgba(0,0,0,0.6)]" />;
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
