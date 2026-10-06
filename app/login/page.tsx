"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BarChart3, Box, Building2, Eye, EyeOff, Loader2, Lock, LogIn, ShieldCheck, User, Wallet, type LucideIcon } from "lucide-react";
import { CLAVE_MODULO, CLAVE_USUARIO, MODULOS_LOGIN, login, logout, moduloGuardado, perteneceAModulo, useSesion, type ModuloLogin } from "@/lib/auth";

const TARJETAS: { id: ModuloLogin; titulo: string; desc: string; icon: LucideIcon }[] = [
  { id: "tesoreria", titulo: "Tesorería / Compras", desc: "Finanzas y adquisiciones", icon: Wallet },
  { id: "almacen", titulo: "Almacén", desc: "Inventarios y materiales", icon: Box },
  { id: "planilla", titulo: "Planilla", desc: "Recursos humanos y pagos", icon: Building2 },
  { id: "gerencia", titulo: "Gerencia", desc: "Reportes y analíticas", icon: BarChart3 },
];

/** Encargado que se muestra encima del login al elegir el módulo. */
const ENCARGADOS_LOGIN: Record<string, { nombre: string; cargo: string }> = {
  "tesoreria / compras": { nombre: "LIZBETH CAHUANA APFATA", cargo: "Tesorera - Módulo de Compras" },
  tesoreria: { nombre: "LIZBETH CAHUANA APFATA", cargo: "Tesorera - Módulo de Compras" },
  compras: { nombre: "LIZBETH CAHUANA APFATA", cargo: "Tesorera - Módulo de Compras" },
  "almacén": { nombre: "JOSE MANUEL ORTIZ ARAPA", cargo: "Jefe de Almacén" },
  almacen: { nombre: "JOSE MANUEL ORTIZ ARAPA", cargo: "Jefe de Almacén" },
  planilla: { nombre: "Encargado de Planilla", cargo: "RRHH - Planilla" },
  gerencia: { nombre: "Gerencia General", cargo: "Gerencia - COMBOY VID" },
};

export default function LoginPage() {
  const router = useRouter();
  const { sesion } = useSesion();
  const [selectedModulo, setSelectedModulo] = useState<ModuloLogin | "">("");
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
  }, []);

  // Sesión ya abierta con un módulo elegido: ir directo a ese módulo
  useEffect(() => {
    const m = moduloGuardado();
    if (sesion && m && !enviando) router.replace(MODULOS_LOGIN[m].ruta);
  }, [sesion, router, enviando]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!selectedModulo) {
      setError("Selecciona un módulo a la izquierda primero.");
      return;
    }
    if (!usuario.trim() || !pass) {
      setError("Ingrese usuario y contraseña.");
      return;
    }
    setEnviando(true);
    const r = await login(usuario, pass);
    if (!r.sesion) {
      setEnviando(false);
      setPass("");
      setError(r.error ?? "Usuario o contraseña incorrectos.");
      return;
    }
    if (!perteneceAModulo(r.sesion, selectedModulo)) {
      await logout();
      setEnviando(false);
      setPass("");
      setError("Usuario no autorizado para este módulo");
      return;
    }
    try {
      window.localStorage.setItem(CLAVE_MODULO, selectedModulo);
      window.localStorage.setItem(CLAVE_USUARIO, r.sesion.usuario);
    } catch {
      /* almacenamiento bloqueado: el header usa la ruta actual */
    }
    router.replace(MODULOS_LOGIN[selectedModulo].ruta);
  };

  const elegido = TARJETAS.find((t) => t.id === selectedModulo);

  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row">
      {/* Izquierda: marca + selección de módulo */}
      <aside className="flex w-full flex-col justify-center bg-[#0f2238] px-6 py-10 text-white sm:px-10 lg:w-1/2 lg:px-14">
        <div className="mx-auto w-full max-w-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={logo} onError={() => setLogo("/logo-comboy.png")} alt="COMBOY VID" className="h-32 w-auto rounded-2xl bg-white object-contain px-6 py-4 shadow-2xl shadow-black/40 motion-safe:animate-flotar sm:h-40" />
          <h1 className="mt-8 font-serif text-3xl font-light leading-tight sm:text-[38px]">Sistema de gestión ERP COMBOY VID</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">Plataforma integral para la gestión minera: compras, tesorería, almacén, planilla y gerencia en un solo lugar.</p>

          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/50">Selecciona tu módulo</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {TARJETAS.map(({ id, titulo, desc, icon: Icon }) => {
              const activo = selectedModulo === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-modulo={id}
                  aria-pressed={activo}
                  onClick={() => {
                    setSelectedModulo(id);
                    setError("");
                  }}
                  className={`rounded-xl border p-4 text-left transition ${
                    activo ? "border-[#dc2626] bg-[#dc2626] shadow-lg shadow-red-900/30" : "border-white/10 bg-white/[0.05] hover:border-white/30 hover:bg-white/10"
                  }`}
                >
                  <Icon size={24} className={activo ? "text-white" : "text-white/70"} />
                  <p className="mt-3 text-sm font-semibold">{titulo}</p>
                  <p className={`mt-0.5 text-xs ${activo ? "text-white/90" : "text-white/50"}`}>{desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Derecha: formulario */}
      <main className="flex w-full flex-1 items-center justify-center bg-plomo-50 px-4 py-10 sm:px-8 lg:w-1/2">
        <div className="w-full max-w-[440px]">
          {selectedModulo && (
            <div key={selectedModulo} data-bienvenida className="mb-6 animate-aparecer rounded-xl border border-slate-100 bg-white/95 p-5 text-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur animate-in fade-in zoom-in-95 duration-300">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="COMBOY VID" className="mx-auto mb-4 h-20 w-auto object-contain drop-shadow-[0_10px_12px_rgba(15,34,56,0.25)] motion-safe:animate-flotar md:h-24" />
              <h2 className="text-[18px] font-extrabold uppercase leading-tight tracking-[0.02em] text-[#0f2238] md:text-[20px]">BIENVENIDO AL SISTEMA ERP COMBOY VID</h2>
              <p className="mt-2 text-[18px] font-black uppercase tracking-wide text-[#dc2626] md:text-[22px]">{ENCARGADOS_LOGIN[selectedModulo.toLowerCase()]?.nombre}</p>
              <p className="mt-1 text-[13px] font-semibold text-slate-600 md:text-[14px]">{ENCARGADOS_LOGIN[selectedModulo.toLowerCase()]?.cargo}</p>
              <div className="mx-auto mt-3 h-[3px] w-24 rounded-full bg-[#dc2626]"></div>
            </div>
          )}

          <div className="rounded-xl border border-plomo-200 border-t-[3px] border-t-[#dc2626] bg-white p-7 shadow-[0_4px_12px_rgba(15,36,64,0.06)]">
          <h2 className="font-serif text-3xl text-azul-900">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-plomo-500">Ingrese con el usuario asignado a su área.</p>

          {elegido ? (
            <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
              <elegido.icon size={14} /> Módulo seleccionado: {elegido.titulo}
            </p>
          ) : (
            <p role="status" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              ⚠️ Selecciona un módulo a la izquierda primero
            </p>
          )}

          <form onSubmit={entrar} className="mt-6 space-y-4" noValidate>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">Usuario</span>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-plomo-500" />
                <input
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="ej. almacen"
                  className="w-full rounded-lg border border-plomo-200 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-azul-900 focus:ring-1 focus:ring-azul-900"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">Contraseña</span>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-plomo-500" />
                <input
                  type={ver ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-plomo-200 py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-azul-900 focus:ring-1 focus:ring-azul-900"
                />
                <button
                  type="button"
                  onClick={() => setVer((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-plomo-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {ver ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle size={16} className="shrink-0" /> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando || selectedModulo === ""}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#dc2626] py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Ingresar
            </button>
          </form>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-plomo-500">
            <ShieldCheck size={14} /> Acceso restringido por módulo según su usuario
          </p>
        </div>
      </main>
    </div>
  );
}
