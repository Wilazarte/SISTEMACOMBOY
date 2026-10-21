"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, BarChart3, Box, Building2, Eye, EyeOff, Loader2, Lock, LogIn, ShieldCheck, User, Wallet, type LucideIcon } from "lucide-react";
import { CLAVE_MODULO, CLAVE_USUARIO, MODULOS_LOGIN, login, logout, moduloGuardado, perteneceAModulo, useSesion, type ModuloLogin } from "@/lib/auth";

const TARJETAS: { id: ModuloLogin; titulo: string; desc: string; icon: LucideIcon }[] = [
  { id: "tesoreria", titulo: "Tesorería / Compras", desc: "Finanzas y adquisiciones", icon: Wallet },
  { id: "almacen", titulo: "Almacén", desc: "Inventarios y materiales", icon: Box },
  { id: "planilla", titulo: "Planilla", desc: "Recursos humanos y pagos", icon: Building2 },
  { id: "gerencia", titulo: "Gerencia", desc: "Reportes y analíticas", icon: BarChart3 },
];

/** Encargado que se muestra en la bienvenida según el módulo elegido. */
const ENCARGADOS_LOGIN: Record<ModuloLogin, { nombre: string; cargo: string }> = {
  tesoreria: { nombre: "LIZBETH CAHUANA APFATA", cargo: "Tesorera - Módulo de Compras" },
  almacen: { nombre: "JOSE MANUEL ORTIZ ARAPA", cargo: "Jefe de Almacén - Módulo de Almacén" },
  planilla: { nombre: "Encargado de Planilla", cargo: "RRHH - Módulo de Planilla" },
  gerencia: { nombre: "Gerencia General", cargo: "Gerencia - COMBOY VID" },
};

/** ?modulo= de la URL (acepta "compras" como alias de Tesorería). */
function moduloDeUrl(v: string | null): ModuloLogin | "" {
  const m = (v ?? "").trim().toLowerCase();
  if (m === "compras") return "tesoreria";
  return m in MODULOS_LOGIN ? (m as ModuloLogin) : "";
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
    if (sesion && m && !enviando) router.replace(MODULOS_LOGIN[m].ruta);
  }, [sesion, router, enviando]);

  const elegir = (m: ModuloLogin | "") => {
    setError("");
    router.replace(m ? `/login?modulo=${m}` : "/login", { scroll: false });
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!modulo) {
      setError("Selecciona tu módulo primero.");
      return;
    }
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
    router.replace(MODULOS_LOGIN[modulo].ruta);
  };

  const elegido = TARJETAS.find((t) => t.id === modulo);
  const encargado = modulo ? ENCARGADOS_LOGIN[modulo] : null;

  return (
    <Fondo>
      {/* Tarjeta 1: bienvenida del módulo, o selección si la URL no trae ?modulo= */}
      <section key={modulo || "elegir"} className={`${TARJETA} animate-aparecer text-center`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={logo} onError={() => setLogo("/logo-comboy.png")} alt="COMBOY VID" className="mx-auto h-16 w-auto object-contain md:h-20" />
        <h1 className="mt-4 text-lg font-bold uppercase leading-snug text-[#0F1E3A]">BIENVENIDO AL SISTEMA ERP COMBOY VID</h1>
        {encargado ? (
          <>
            <p className="mt-2 text-xl font-bold uppercase text-[#E30613]">{encargado.nombre}</p>
            <p className="mt-1 text-sm text-gray-600">{encargado.cargo}</p>
            <div className="mx-auto mt-3 h-1 w-[60px] rounded-full bg-[#E30613]" />
          </>
        ) : (
          <>
            <div className="mx-auto mt-3 h-1 w-[60px] rounded-full bg-[#E30613]" />
            <p className="mt-5 text-xs font-medium uppercase tracking-wider text-gray-500">Selecciona tu módulo</p>
            <div className="mt-3 grid grid-cols-2 gap-2.5 text-left">
              {TARJETAS.map(({ id, titulo, desc, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  data-modulo={id}
                  onClick={() => elegir(id)}
                  className="group min-h-[88px] rounded-xl border border-gray-200 p-3 transition hover:-translate-y-0.5 hover:border-[#E30613] hover:shadow-[0_6px_20px_rgba(227,6,19,0.15)] focus-visible:border-[#E30613]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#E30613] transition group-hover:bg-[#E30613] group-hover:text-white">
                    <Icon size={17} />
                  </span>
                  <span className="mt-2 block text-[13px] font-semibold leading-tight text-[#0F1E3A]">{titulo}</span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-gray-500">{desc}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Tarjeta 2: formulario */}
      <section className={`${TARJETA} mt-4`}>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-[#0F1E3A]">Iniciar sesión</h2>
        <p className="mt-1 text-sm text-gray-500">Ingresa con el usuario asignado a su área.</p>

        {elegido ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-2 rounded-full bg-[#FEF2F2] px-3 py-1 text-sm font-medium text-[#E30613]">
              <elegido.icon size={15} /> Módulo seleccionado: {elegido.titulo}
            </p>
            <button type="button" onClick={() => elegir("")} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-100 hover:text-[#0F1E3A]">
              <ArrowLeft size={13} /> Cambiar
            </button>
          </div>
        ) : (
          <p role="status" className="mt-5 flex items-center gap-2 rounded-full bg-[#FEF2F2] px-3 py-1 text-sm font-medium text-[#E30613]">
            <AlertCircle size={15} /> Selecciona tu módulo arriba
          </p>
        )}

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
            disabled={enviando || !modulo}
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

/** Fondo azul noche con el globo rojo 3D fijo detrás de las tarjetas. */
function Fondo({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0F1E3A]">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center">
        {/* Halo */}
        <div className="absolute h-[130vmin] w-[130vmin] rounded-full bg-[radial-gradient(circle,rgba(227,6,19,0.28)_0%,rgba(227,6,19,0.08)_45%,transparent_70%)] blur-2xl" />
        {/* Globo: luz arriba a la izquierda, sombra abajo a la derecha */}
        <div className="h-[92vmin] w-[92vmin] rounded-full bg-[radial-gradient(circle_at_32%_28%,#FF7A80_0%,#F2303B_16%,#E30613_38%,#A2040F_68%,#4E020A_100%)] opacity-90 shadow-[inset_-40px_-50px_90px_rgba(0,0,0,0.45),inset_30px_30px_70px_rgba(255,255,255,0.12),0_0_120px_rgba(227,6,19,0.45)] blur-[2px] motion-safe:animate-flotar md:h-[78vmin] md:w-[78vmin]">
          {/* Brillo especular */}
          <div className="ml-[18%] mt-[14%] h-[22%] w-[30%] -rotate-[25deg] rounded-full bg-white/25 blur-xl" />
        </div>
      </div>
      {/* Velo para que el globo no compita con el texto */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-[#0F1E3A]/25 backdrop-blur-[1px]" />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-[2.5vw] py-8 md:px-4">{children}</main>
    </div>
  );
}
