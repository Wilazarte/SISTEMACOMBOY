"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, BarChart3, Calculator, Eye, EyeOff, Factory, Landmark, Loader2, Lock, LogIn, ShieldCheck, Truck, User, X, type LucideIcon } from "lucide-react";
import { CLAVE_MODULO, CLAVE_USUARIO, MODULOS_LOGIN, login, logout, moduloGuardado, perteneceAModulo, puedeVer, rutaDeModulo, useSesion, type ModuloLogin } from "@/lib/auth";
import { CLAVE_SELECCION, ENCARGADOS_LOGIN, tarjetaDe } from "@/components/modulos-login";

/** Botones del dock: `slug` es la ruta /login/<slug> (app/login/[modulo] redirige a /login?modulo=). */
const DOCK: { id: ModuloLogin; slug: string; titulo: string; icon: LucideIcon }[] = [
  { id: "ventas", slug: "ventas", titulo: "VENTAS", icon: BarChart3 },
  { id: "contable", slug: "contable", titulo: "CONTABLE", icon: Calculator },
  { id: "tesoreria", slug: "tesoreria", titulo: "TESORERÍA", icon: Landmark },
  { id: "produccion", slug: "inventario", titulo: "PRODUCCIÓN", icon: Factory },
  { id: "logistica", slug: "logistica", titulo: "LOGÍSTICA", icon: Truck },
];

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

  // Sesión ya abierta con un módulo elegido: ir directo a ese módulo
  useEffect(() => {
    const m = moduloGuardado();
    if (sesion && m && !enviando) router.replace(rutaDeModulo(sesion, m));
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
      {/* Logo */}
      <header className="flex flex-col items-center pt-8 md:pt-12">
        <Logo />
        <p className="mt-3 text-[11px] font-medium tracking-[0.4em] text-white/70 md:text-xs">SOLUCIONES INDUSTRIALES</p>
      </header>

      {/* Título + formulario del módulo elegido */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
        <h1 className="max-w-3xl text-[26px] font-black uppercase leading-tight text-white [text-shadow:0_0_18px_rgba(255,30,30,0.75),0_0_42px_rgba(209,42,42,0.45)] md:text-[36px]">
          BIENVENIDO AL SISTEMA ERP COMBOY VID
        </h1>
        <p className="mt-3 text-[18px] font-light text-[#a3b8ff]">{encargado ? `${encargado.nombre} · ${encargado.cargo}` : "Selecciona tu módulo"}</p>

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
      <nav className="w-full px-4 pb-6 md:pb-10">
        <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-full border border-white/20 bg-black/30 p-2 backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2 p-1">
            {DOCK.map(({ id, slug, titulo, icon: Icon }) => {
              const sel = activo === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-modulo={id}
                  aria-pressed={sel}
                  onClick={() => elegir(id, slug)}
                  className={`flex h-[82px] w-[132px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-full border text-[12px] font-bold tracking-wider transition-all duration-200 ${
                    sel
                      ? "scale-105 border-[#ff3a3a] bg-gradient-to-b from-[#c41e1e] to-[#7a0f0f] text-white shadow-[0_0_25px_rgba(255,0,0,0.8)]"
                      : "border-white/20 bg-white/[0.06] text-white/80 hover:border-white/40 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={24} strokeWidth={1.75} />
                  {titulo}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/50">
          <ShieldCheck size={13} /> Acceso restringido por módulo según su usuario
        </p>
      </nav>
    </Fondo>
  );
}

/** Logo COMBOY: usa /logo-comboy.png; si no carga, lo recrea con texto (COM rojo, BOY azul, estrellas en las O). */
function Logo() {
  const [img, setImg] = useState(true);
  if (img)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/logo-comboy.png" onError={() => setImg(false)} alt="COMBOY" className="h-14 w-auto object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.15)] md:h-16" />;
  const letra = (l: string, color: string) =>
    l === "O" ? (
      <span className="relative inline-block" style={{ color }}>
        O<span className="absolute inset-0 flex items-center justify-center text-[0.38em] text-white">★</span>
      </span>
    ) : (
      <span style={{ color }}>{l}</span>
    );
  return (
    <p aria-label="COMBOY" className="text-5xl font-black tracking-tight md:text-6xl">
      {[..."COM"].map((l, i) => <span key={i}>{letra(l, "#d12a2a")}</span>)}
      {[..."BOY"].map((l, i) => <span key={i}>{letra(l, "#153a5e")}</span>)}
    </p>
  );
}

/** Meridianos y paralelos del globo de respaldo (elipses en un viewBox 200×200, radio 90). */
const MERIDIANOS = [15, 35, 55, 72, 85];
const PARALELOS = [-60, -36, -12, 12, 36, 60];

/** Fondo oscuro full-screen con overlay negro 30%. */
function Fondo({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-black">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1]">
        {/* TODO: agregar /public/login-bg.jpg (globo terráqueo futurista rojo) y reemplazar este gradiente + SVG por:
            <div className="absolute inset-0 bg-[url('/login-bg.jpg')] bg-cover bg-center" /> */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#4a0a0a_0%,#1a0303_45%,#000_80%)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 200 200" className="h-[120vmin] w-[120vmin] opacity-70 motion-safe:animate-flotar">
            <defs>
              <radialGradient id="globo-relleno" cx="35%" cy="30%" r="75%">
                <stop offset="0%" stopColor="#ff5a1f" stopOpacity="0.35" />
                <stop offset="45%" stopColor="#d12a2a" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#3a0202" stopOpacity="0.05" />
              </radialGradient>
            </defs>
            <g transform="rotate(-18 100 100)" fill="none" stroke="#ff3a3a" strokeWidth="0.4">
              <circle cx="100" cy="100" r="90" fill="url(#globo-relleno)" strokeWidth="0.7" />
              {MERIDIANOS.map((rx) => (
                <ellipse key={rx} cx="100" cy="100" rx={rx} ry="90" opacity={0.25 + rx / 250} />
              ))}
              {PARALELOS.map((lat) => {
                const y = 100 + 90 * Math.sin((lat * Math.PI) / 180);
                const rx = 90 * Math.cos((lat * Math.PI) / 180);
                return <ellipse key={lat} cx="100" cy={y} rx={rx} ry={rx * 0.16} opacity="0.5" />;
              })}
            </g>
          </svg>
        </div>
        <div className="absolute inset-0 bg-black/30" />
      </div>
      <main className="relative z-10 flex min-h-screen flex-col">{children}</main>
    </div>
  );
}
