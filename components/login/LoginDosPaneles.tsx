"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  ChevronRight,
  Eye,
  EyeOff,
  Factory,
  Landmark,
  Loader2,
  Lock,
  LogIn,
  Package,
  Receipt,
  ShieldCheck,
  Store,
  Truck,
  User,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  CLAVE_MODULO,
  CLAVE_USUARIO,
  RUTA_SUCURSAL,
  inicioDe,
  login,
  logout,
  moduloGuardado,
  perteneceAModulo,
  puedeVer,
  rutaDeModulo,
  soloSecocha,
  useSesion,
  type ModuloLogin,
} from "@/lib/auth";
import { CLAVE_SELECCION, ENCARGADOS_LOGIN } from "@/components/modulos-login";
import { homeAsignado } from "@/lib/permisosPlanta";
import { olvidarSedes } from "@/lib/sedes";
import { validarEntradaSecocha } from "@/lib/loginSecocha";
import { guardarCredencial, leerCredencial, olvidarCredencial, recordarDisponible } from "@/lib/credencialesEscritorio";

/**
 * Inicio de sesión en dos paneles (Williams, 2026-11-17): a la izquierda los módulos y Sucursal Secocha;
 * a la derecha el encargado del módulo elegido (solo lectura), usuario y contraseña.
 * En la app de PC aparece "Recordar contraseña" (cifrada por Windows, ver lib/credencialesEscritorio.ts).
 */
type Opcion = { id: ModuloLogin; titulo: string; icon: LucideIcon; etiqueta?: string };

const MODULOS: Opcion[] = [
  { id: "soporte", titulo: "Soporte", icon: ShieldCheck, etiqueta: "Admin" },
  { id: "gerencia", titulo: "Gerencia General", icon: BarChart3, etiqueta: "Solo lectura" },
  { id: "finanzas", titulo: "Finanzas", icon: Landmark },
  { id: "logistica", titulo: "Logística", icon: Truck },
  { id: "ventas", titulo: "Ventas", icon: Receipt },
  { id: "almacen", titulo: "Almacén", icon: Package },
  { id: "produccion", titulo: "Producción", icon: Factory, etiqueta: "Limitado" },
];

/** Sucursal aparte: un solo usuario (sucsecocha) que ve todo el ERP en modo Secocha. */
const SECOCHA: Opcion = { id: "sucursal", titulo: "Sucursal Secocha", icon: Store };

const TODAS = [...MODULOS, SECOCHA];

const CAMPO =
  "h-12 w-full focus-visible:outline-none rounded-xl border border-white/15 bg-white/[0.07] pl-11 text-[15px] text-white outline-none transition placeholder:text-white/35 focus:border-[#00f2fe] focus:bg-white/[0.1] focus:ring-2 focus:ring-[#00f2fe]/25";

export default function LoginDosPaneles({ inicial = "", siguiente = null }: { inicial?: ModuloLogin | ""; siguiente?: string | null }) {
  const router = useRouter();
  const { sesion } = useSesion();
  const [activo, setActivo] = useState<ModuloLogin | "">(inicial);
  const [usuario, setUsuario] = useState("");
  const [pass, setPass] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [puedeRecordar, setPuedeRecordar] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const usuarioRef = useRef<HTMLInputElement>(null);

  useEffect(() => setActivo(inicial), [inicial]);

  // App de PC: ¿hay almacén seguro para recordar la contraseña?
  useEffect(() => {
    recordarDisponible().then(setPuedeRecordar);
  }, []);

  // Al elegir módulo: rellena con lo guardado en este equipo (solo app de PC)
  useEffect(() => {
    let vigente = true;
    setPass("");
    setUsuario("");
    setRecordar(false);
    if (!activo || !puedeRecordar) return;
    leerCredencial(activo).then((c) => {
      if (!vigente || !c) return;
      setUsuario(c.usuario);
      setPass(c.pass);
      setRecordar(true);
    });
    return () => {
      vigente = false;
    };
  }, [activo, puedeRecordar]);

  // Sesión ya abierta: ir directo a su módulo
  useEffect(() => {
    if (!sesion || enviando) return;
    if (inicial === "sucursal") {
      if (perteneceAModulo(sesion, "sucursal")) router.replace(soloSecocha(sesion) ? RUTA_SUCURSAL : inicioDe(sesion));
      return;
    }
    const m = moduloGuardado();
    if (soloSecocha(sesion)) router.replace(RUTA_SUCURSAL);
    else if (homeAsignado(sesion)) router.replace(homeAsignado(sesion)!);
    else if (m) router.replace(rutaDeModulo(sesion, m));
  }, [sesion, router, enviando, inicial]);

  const elegir = (id: ModuloLogin) => {
    setError("");
    setActivo(id);
    try {
      window.localStorage.setItem(CLAVE_SELECCION, id);
    } catch {
      /* almacenamiento bloqueado */
    }
    // En celular el formulario queda debajo de la lista: llevarlo a la vista
    if (window.matchMedia("(max-width: 767px)").matches) {
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } else {
      requestAnimationFrame(() => usuarioRef.current?.focus());
    }
  };

  const negar = async (msg: string) => {
    await logout();
    setEnviando(false);
    setPass("");
    setError(msg);
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!activo) {
      setError("Seleccione su módulo en la lista.");
      return;
    }
    if (!usuario.trim() || !pass) {
      setError("Ingrese su usuario y la contraseña.");
      return;
    }
    setEnviando(true);
    // Supabase Auth + tabla perfiles (rol y módulos asignados), ver lib/auth.ts
    const r = await login(usuario, pass);
    if (!r.sesion) {
      setEnviando(false);
      setPass("");
      setError(r.error ?? "Usuario o contraseña incorrectos.");
      // La contraseña guardada ya no sirve (la cambiaron): se olvida
      if (recordar) olvidarCredencial(activo);
      return;
    }
    const sesionOk = r.sesion;
    const recordarAhora = async () => {
      if (!puedeRecordar) return;
      if (recordar) await guardarCredencial(activo, usuario.trim(), pass);
      else await olvidarCredencial(activo);
    };

    // Sucursal Secocha: valida la sede del usuario
    if (activo === "sucursal") {
      const v = await validarEntradaSecocha(sesionOk);
      if (!v.destino) {
        olvidarSedes();
        return negar(v.error ?? "Este usuario no tiene acceso al módulo Secocha.");
      }
      await recordarAhora();
      router.replace(v.destino);
      return;
    }
    // Usuario solo de Secocha (modulos = ["/secocha"]): directo a su módulo
    if (soloSecocha(sesionOk)) {
      await recordarAhora();
      router.replace(RUTA_SUCURSAL);
      return;
    }
    // Perfil asignado (Finanzas, Almacén, Logística, Producción): siempre a su INICIO
    const asignado = homeAsignado(sesionOk);
    if (asignado) {
      try {
        window.localStorage.setItem(CLAVE_USUARIO, sesionOk.usuario);
      } catch {
        /* almacenamiento bloqueado */
      }
      await recordarAhora();
      router.replace(siguiente && puedeVer(sesionOk, siguiente.split("?")[0]) ? siguiente : asignado);
      return;
    }
    if (!perteneceAModulo(sesionOk, activo)) return negar("Este usuario no tiene acceso a este módulo.");
    try {
      window.localStorage.setItem(CLAVE_MODULO, activo);
      window.localStorage.setItem(CLAVE_USUARIO, sesionOk.usuario);
    } catch {
      /* almacenamiento bloqueado: el header usa la ruta actual */
    }
    await recordarAhora();
    const destino = siguiente?.startsWith("/dashboard/") && puedeVer(sesionOk, siguiente.split("?")[0]) ? siguiente : rutaDeModulo(sesionOk, activo);
    router.replace(destino);
  };

  const opcion = TODAS.find((o) => o.id === activo);
  const encargado = activo ? ENCARGADOS_LOGIN[activo] : null;
  const esSecocha = activo === "sucursal";

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden bg-[#0a0b0e]">
      {/* Fondo: imagen del login + malla GLASS */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1]">
        <Image src="/login-bg.jpg" alt="" fill priority quality={85} sizes="100vw" className="object-cover object-center opacity-50" />
        <div className="fondo-malla absolute inset-0 opacity-80" />
      </div>

      <main className="flex min-h-screen items-center justify-center px-4 py-4 md:py-6">
        <div className="grid w-full max-w-[1040px] overflow-hidden rounded-[28px] border border-white/15 shadow-[0_30px_80px_rgba(0,0,0,0.6)] md:grid-cols-[1fr_1.08fr]">
          {/* ===== Panel izquierdo: módulos ===== */}
          <section className="relative overflow-hidden bg-[#f6f8fc] px-5 pb-20 pt-6 text-[#0f1b33] sm:px-8 md:px-10 md:pb-20 md:pt-7">
            <OndasClaras />
            <div className="relative">
              <Image src="/logo.png" alt="COMBOY VID" width={300} height={96} priority className="h-12 w-auto max-w-full object-contain md:h-14" />
              <h1 className="mt-3 text-[26px] font-extrabold leading-tight tracking-tight md:text-[30px]">Iniciar sesión</h1>
              <p className="mt-1 text-sm text-[#4b5b78]">Seleccione su módulo</p>

              <ul className="mt-4 space-y-1.5" role="listbox" aria-label="Módulos">
                {MODULOS.map((o) => (
                  <ItemModulo key={o.id} o={o} sel={activo === o.id} onClick={() => elegir(o.id)} />
                ))}
              </ul>

              <div className="my-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7a879e]">
                <span className="h-px flex-1 bg-[#d5dceb]" /> Sucursal <span className="h-px flex-1 bg-[#d5dceb]" />
              </div>
              <ul role="listbox" aria-label="Sucursal">
                <ItemModulo o={SECOCHA} sel={esSecocha} onClick={() => elegir("sucursal")} sucursal />
              </ul>
            </div>
          </section>

          {/* ===== Panel derecho: encargado, usuario y contraseña ===== */}
          <section className="relative overflow-hidden bg-[#0d1424] px-5 py-8 sm:px-8 md:px-12 md:py-12">
            <OndasOscuras />
            <form ref={formRef} onSubmit={entrar} noValidate className="relative mx-auto flex h-full w-full max-w-[400px] scroll-mt-4 flex-col justify-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#00f2fe]">ERP COMBOY VID</p>
              <h2 className="mt-1 text-2xl font-bold text-white">{opcion ? opcion.titulo : "Bienvenido"}</h2>
              <p className="mt-1 text-sm text-white/55">{opcion ? "Ingrese con su usuario de este módulo." : "Elija su módulo en la lista para continuar."}</p>

              <div className="mt-7 space-y-4">
                {/* 1. Encargado del módulo (solo lectura) */}
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">Encargado del módulo</span>
                  <span className="relative block">
                    <UserRound size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#00f2fe]" />
                    <input
                      readOnly
                      tabIndex={-1}
                      value={encargado ? encargado.nombre : ""}
                      placeholder="Seleccione un módulo"
                      title={encargado?.cargo}
                      className={`${CAMPO} cursor-default truncate pr-3 font-semibold uppercase focus:border-white/15 focus:ring-0`}
                      aria-label="Encargado del módulo"
                    />
                  </span>
                  {encargado && <span className="mt-1 block truncate text-xs text-white/45">{encargado.cargo}</span>}
                </label>

                {/* 2. Usuario */}
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">Usuario</span>
                  <span className="relative block">
                    <User size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#00f2fe]" />
                    <input
                      ref={usuarioRef}
                      value={usuario}
                      onChange={(e) => setUsuario(e.target.value)}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      disabled={!activo}
                      placeholder={esSecocha ? "sucsecocha@comboyvid.com" : "Nombre, usuario o correo"}
                      className={`${CAMPO} pr-3 disabled:opacity-50`}
                    />
                  </span>
                </label>

                {/* 3. Contraseña */}
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">Contraseña</span>
                  <span className="relative block">
                    <Lock size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#00f2fe]" />
                    <input
                      type={ver ? "text" : "password"}
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                      autoComplete="current-password"
                      disabled={!activo}
                      placeholder="••••••••"
                      className={`${CAMPO} pr-12 disabled:opacity-50`}
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

                {/* Solo en la app de PC */}
                {puedeRecordar && (
                  <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-white/80">
                    <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="h-4 w-4 accent-[#00c8ff] focus-visible:outline-[#00f2fe]" />
                    Recordar contraseña en este equipo
                  </label>
                )}
              </div>

              {error && (
                <p role="alert" className="mt-4 flex animate-aparecer items-center gap-2 rounded-xl border border-[#ff2a5f]/40 bg-[#ff2a5f]/10 px-3 py-2.5 text-sm font-medium text-[#ffb4c4]">
                  <AlertCircle size={16} className="shrink-0" /> {error}
                </p>
              )}

              <button
                type="submit"
                disabled={enviando || !activo}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#c41e3a] via-[#0066ff] to-[#00d4fe] text-[15px] font-bold tracking-wide text-white shadow-[0_8px_24px_rgba(0,102,255,0.35)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {enviando ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Ingresar
              </button>
              <p className="mt-5 text-center text-[11px] text-white/35">COMBOY VID · Soluciones mineras, innovación que impulsa la minería</p>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

function ItemModulo({ o, sel, onClick, sucursal }: { o: Opcion; sel: boolean; onClick: () => void; sucursal?: boolean }) {
  const Icon = o.icon;
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={sel}
        data-modulo={o.id}
        onClick={onClick}
        className={`group flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-200 ${
          sel
            ? sucursal
              ? "border-transparent bg-gradient-to-r from-[#0066ff] to-[#00c8fe] text-white shadow-[0_6px_18px_rgba(0,102,255,0.35)]"
              : "border-transparent bg-[#0f1b33] text-white shadow-[0_6px_18px_rgba(15,27,51,0.3)]"
            : "border-[#e1e7f2] bg-white/80 hover:border-[#00c8fe] hover:bg-white hover:shadow-[0_4px_14px_rgba(0,200,254,0.18)]"
        }`}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            sel ? "bg-white/15 text-white" : sucursal ? "bg-[#0066ff]/10 text-[#0066ff]" : "bg-[#c41e3a]/10 text-[#c41e3a]"
          }`}
        >
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{o.titulo}</span>
        {o.etiqueta && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${sel ? "bg-white/15 text-white" : "bg-[#eef2f9] text-[#5a6782]"}`}>{o.etiqueta}</span>
        )}
        <ChevronRight size={16} className={`shrink-0 transition ${sel ? "translate-x-0.5 text-white" : "text-[#9aa6bd] group-hover:text-[#00a6d6]"}`} />
      </button>
    </li>
  );
}

/** Ondas al pie del panel claro (adaptación de la referencia, en azul eléctrico y cian). */
function OndasClaras() {
  return (
    <svg aria-hidden viewBox="0 0 400 140" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full md:h-28">
      <path d="M0,70 C90,20 170,120 260,70 C320,38 360,50 400,30 L400,140 L0,140 Z" fill="#00c8fe" opacity="0.18" />
      <path d="M0,95 C80,60 180,140 280,92 C330,70 370,78 400,62 L400,140 L0,140 Z" fill="#0066ff" opacity="0.22" />
      <path d="M0,120 C100,92 190,140 300,112 C350,100 380,104 400,96 L400,140 L0,140 Z" fill="#0f1b33" opacity="0.9" />
    </svg>
  );
}

/** Ondas del panel oscuro: azul eléctrico, cian y un trazo rojo fuego de la marca. */
function OndasOscuras() {
  return (
    <svg aria-hidden viewBox="0 0 500 600" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="ola-azul" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0066ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#00f2fe" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="ola-fuego" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff2a5f" stopOpacity="0" />
          <stop offset="1" stopColor="#ff2a5f" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path d="M0,0 L500,0 L500,120 C380,190 260,40 120,110 C70,135 30,120 0,100 Z" fill="url(#ola-azul)" />
      <path d="M0,40 C120,140 260,10 500,150" fill="none" stroke="#00f2fe" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M0,600 L500,600 L500,470 C400,420 300,560 170,500 C100,470 40,490 0,520 Z" fill="url(#ola-azul)" opacity="0.6" />
      <path d="M0,560 C140,470 300,600 500,500" fill="none" stroke="url(#ola-fuego)" strokeWidth="3" />
    </svg>
  );
}
