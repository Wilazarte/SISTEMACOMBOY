"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, Lock, LogIn, ShieldCheck, User } from "lucide-react";
import { CLAVE_MODULO, CLAVE_USUARIO, MODULOS_LOGIN, login, logout, moduloGuardado, perteneceAModulo, puedeVer, rutaDeModulo, useSesion, type ModuloLogin } from "@/lib/auth";
import { CLAVE_SELECCION, ENCARGADOS_LOGIN, MODULOS_SELECCION, tarjetaDe } from "@/components/modulos-login";

/** ?modulo= de la URL (acepta "compras" como alias de Tesorería). Otro valor, ej. "seleccion" = elegir módulo. */
function moduloDeUrl(v: string | null): ModuloLogin | "" {
  const m = (v ?? "").trim().toLowerCase();
  if (m === "compras") return "tesoreria";
  if (!(m in MODULOS_LOGIN) || tarjetaDe(m as ModuloLogin).proximamente) return ""; // Logística: próximamente
  return m as ModuloLogin;
}

// Colores fijos del login (no siguen el tema claro/oscuro del sistema)
const TARJETA = "relative z-10 w-[95vw] max-w-md rounded-2xl border-t-4 border-[#E30613] bg-white p-6 shadow-[0_0_30px_rgba(227,6,19,0.3)] md:w-full md:p-8";
const CAMPO =
  "h-12 w-full rounded-lg border border-[#E30613]/30 bg-[#EEF2FF] pl-10 text-[15px] text-[#0F1E3A] outline-none transition placeholder:text-gray-400 focus:border-[#E30613] focus:ring-2 focus:ring-[#FEE2E2] md:h-11 md:text-sm";

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
  const modulo = moduloDeUrl(params.get("modulo"));
  // ?siguiente=/dashboard/... (ej. "Realizar requerimiento" desde /seleccionar-modulo)
  const siguiente = params.get("siguiente");
  const [usuario, setUsuario] = useState("");
  const [pass, setPass] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [logo, setLogo] = useState("/logo_comboy_navy.png");
  const imgRef = useRef<HTMLImageElement>(null);

  // El error de carga puede ocurrir antes de la hidratación: revisar al montar
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setLogo("/logo-comboy.png");
  }, [modulo]);

  // Sesión ya abierta con un módulo elegido: ir directo a ese módulo
  useEffect(() => {
    const m = moduloGuardado();
    if (sesion && m && !enviando) router.replace(rutaDeModulo(sesion, m));
  }, [sesion, router, enviando]);

  const elegir = (m: ModuloLogin) => {
    setError("");
    try {
      window.localStorage.setItem(CLAVE_SELECCION, m);
    } catch {
      /* almacenamiento bloqueado */
    }
    router.push(`/login?modulo=${m}`, { scroll: false });
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

  const logoImg = (cls: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={imgRef} src={logo} onError={() => setLogo("/logo-comboy.png")} alt="COMBOY VID" className={cls} />
  );

  // Selección de módulo (sin ?modulo= válido, ej. /login o /login?modulo=seleccion)
  if (!modulo)
    return (
      <Fondo>
        <section className="relative z-10 w-[92vw] max-w-[480px] animate-aparecer rounded-[24px] border-t-[5px] border-[#E30613] bg-white/95 p-6 text-center shadow-[0_0_50px_rgba(227,6,19,0.4)] backdrop-blur-xl sm:w-[95%] md:p-8">
          {logoImg("mx-auto h-auto w-[180px] object-contain md:w-[220px]")}
          <h1 className="mt-5 text-base font-bold uppercase tracking-wider text-[#0F1E3A]">BIENVENIDO AL SISTEMA ERP COMBOY VID</h1>
          <div className="mx-auto mb-2 mt-2 h-1 w-12 rounded-full bg-[#E30613]" />
          <p className="mt-3 text-xs uppercase tracking-widest text-gray-400">Selecciona tu módulo</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-left md:gap-4">
            {MODULOS_SELECCION.map(({ id, titulo, desc, icon: Icon, proximamente }) => (
              <button
                key={id}
                type="button"
                data-modulo={id}
                onClick={() => elegir(id)}
                disabled={proximamente}
                className="group relative cursor-pointer rounded-xl disabled:pointer-events-none disabled:opacity-50 disabled:grayscale [&:last-child:nth-child(odd)]:col-span-2 border border-[#E30613]/15 bg-[#F8F9FF] p-4 text-left transition-all duration-200 hover:scale-[1.02] hover:border-[#E30613] hover:bg-white hover:shadow-[0_0_20px_rgba(227,6,19,0.2)] focus-visible:border-[#E30613] active:scale-[0.99]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#E30613] transition-colors duration-200 group-hover:bg-[#E30613] group-hover:text-white md:h-8 md:w-8">
                  <Icon className="h-4 w-4 md:h-[18px] md:w-[18px]" />
                </span>
                <span className="mt-3 block text-sm font-bold leading-tight text-[#0F1E3A]">{titulo}</span>
                <span className="mt-1 block text-[11px] leading-snug text-gray-500">{desc}</span>
                {proximamente && <span className="absolute right-3 top-3 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Próximamente</span>}
              </button>
            ))}
          </div>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
            <ShieldCheck size={13} /> Acceso restringido por módulo según su usuario
          </p>
        </section>
      </Fondo>
    );

  const elegido = tarjetaDe(modulo);
  const encargado = ENCARGADOS_LOGIN[modulo];

  return (
    <Fondo>
      {/* Tarjeta 1: bienvenida del módulo */}
      <section key={modulo} className={`${TARJETA} animate-aparecer text-center`}>
        {logoImg("mx-auto h-16 w-auto object-contain md:h-20")}
        <h1 className="mt-4 text-lg font-bold uppercase leading-snug text-[#0F1E3A]">BIENVENIDO AL SISTEMA ERP COMBOY VID</h1>
        <p className="mt-2 text-xl font-bold uppercase text-[#E30613]">{encargado.nombre}</p>
        <p className="mt-1 text-sm text-gray-600">{encargado.cargo}</p>
        <div className="mx-auto mt-3 h-1 w-[60px] rounded-full bg-[#E30613]" />
      </section>

      {/* Tarjeta 2: formulario */}
      <section className={`${TARJETA} mt-4`}>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-[#0F1E3A]">Iniciar sesión</h2>
        <p className="mt-1 text-sm text-gray-500">Ingresa con el usuario asignado a su área.</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-2 rounded-full bg-[#FEF2F2] px-3 py-1 text-sm font-medium text-[#E30613]">
            <elegido.icon size={15} /> Módulo seleccionado: {elegido.titulo}
          </p>
          <button
            type="button"
            onClick={() => router.push("/seleccionar-modulo")}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-100 hover:text-[#0F1E3A]"
          >
            <ArrowLeft size={13} /> Cambiar
          </button>
        </div>

        <form onSubmit={entrar} className="mt-6 space-y-4" noValidate>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Usuario</span>
            <span className="relative block">
              <User size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#E30613]/70" />
              <input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="ej. almacen"
                className={`${CAMPO} pr-3`}
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Contraseña</span>
            <span className="relative block">
              <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#E30613]/70" />
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
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 transition hover:bg-white hover:text-[#0F1E3A]"
                aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {ver ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>

          {error && (
            <p role="alert" className="flex animate-aparecer items-center gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5 text-sm font-medium text-[#B8050F]">
              <AlertCircle size={16} className="shrink-0" /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#E30613] p-3 font-bold text-white shadow-[0_6px_20px_rgba(227,6,19,0.35)] transition hover:bg-[#B8050F] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 md:h-11"
          >
            {enviando ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Ingresar
          </button>
        </form>
      </section>

      <p className="relative z-10 mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-white">
        <ShieldCheck size={14} /> Acceso restringido por módulo según su usuario
      </p>
    </Fondo>
  );
}

/** Meridianos y paralelos del globo (elipses en un viewBox 200×200, radio 90). */
const MERIDIANOS = [15, 35, 55, 72, 85];
const PARALELOS = [-60, -36, -12, 12, 36, 60];

/** Fondo azul noche #0F1E3A con un globo 3D rojo de malla, fijo detrás de las tarjetas. */
function Fondo({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#0F1E3A]">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1] flex items-center justify-center">
        {/* Halo rojo */}
        <div className="absolute h-[130vmin] w-[130vmin] rounded-full bg-[radial-gradient(circle,rgba(227,6,19,0.32)_0%,rgba(227,6,19,0.1)_40%,transparent_70%)] blur-2xl" />
        {/* Globo de malla: esfera con volumen + líneas de latitud y longitud */}
        <svg viewBox="0 0 200 200" className="h-[110vmin] w-[110vmin] blur-[1.2px] motion-safe:animate-flotar md:h-[90vmin] md:w-[90vmin]">
          <defs>
            <radialGradient id="globo-relleno" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#FF4D57" stopOpacity="0.55" />
              <stop offset="45%" stopColor="#E30613" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#5A0209" stopOpacity="0.1" />
            </radialGradient>
            <linearGradient id="globo-linea" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF6B73" />
              <stop offset="100%" stopColor="#E30613" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <g transform="rotate(-18 100 100)" fill="none" stroke="url(#globo-linea)" strokeWidth="0.55">
            <circle cx="100" cy="100" r="90" fill="url(#globo-relleno)" strokeWidth="0.9" />
            {MERIDIANOS.map((rx) => (
              <ellipse key={rx} cx="100" cy="100" rx={rx} ry="90" opacity={0.35 + rx / 200} />
            ))}
            <line x1="100" y1="10" x2="100" y2="190" opacity="0.8" />
            {PARALELOS.map((lat) => {
              const y = 100 + 90 * Math.sin((lat * Math.PI) / 180);
              const rx = 90 * Math.cos((lat * Math.PI) / 180);
              return <ellipse key={lat} cx="100" cy={y} rx={rx} ry={rx * 0.16} opacity="0.7" />;
            })}
            <ellipse cx="100" cy="100" rx="90" ry="14.4" opacity="0.9" />
          </g>
          {/* Brillo especular */}
          <ellipse cx="68" cy="58" rx="26" ry="14" fill="#FFFFFF" opacity="0.08" transform="rotate(-30 68 58)" />
        </svg>
      </div>
      <main className="relative z-10 mx-auto flex h-full min-h-screen max-w-[480px] flex-col items-center justify-center px-[2.5vw] py-8 md:px-4">{children}</main>
    </div>
  );
}
