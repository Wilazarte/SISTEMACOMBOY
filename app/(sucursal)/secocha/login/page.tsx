"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, LogIn, User } from "lucide-react";
import { LogoComboy } from "@/components/LogoComboy";
import { CLAVE_MODULO, CLAVE_USUARIO, RUTA_SUCURSAL, login, logout, perteneceAModulo, useSesion } from "@/lib/auth";
import { cargarSedes, getSedeActual, olvidarSedes } from "@/lib/sedes";
import { createClient } from "@/lib/supabase/client";

/** Sede elegida al entrar ("secocha", "arequipa"): la lee la app de la sucursal. */
const CLAVE_SEDE = "sede";

const CAMPO =
  "h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] pl-10 text-[15px] text-white outline-none transition placeholder:text-white/30 focus:border-red-600 focus:bg-white/[0.09] focus:ring-2 focus:ring-red-600/30";

/**
 * Login de COMBOY VID SECOCHA (módulo Secocha, antes Sucursal): sistema aparte, misma identidad visual que el login del ERP
 * (mapa mundial rojo, logo grande, tema oscuro). Usuarios de sede (p. ej. sucsecocha@comboyvid.com)
 * y también Taller y Tesorería del ERP central.
 */
export default function LoginSucursal() {
  const router = useRouter();
  const { sesion } = useSesion();
  const [usuario, setUsuario] = useState("");
  const [pass, setPass] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Sesión ya abierta de un usuario de la sucursal: entra directo
  useEffect(() => {
    if (sesion && !enviando && perteneceAModulo(sesion, "sucursal")) router.replace(RUTA_SUCURSAL);
  }, [sesion, enviando, router]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!usuario.trim() || !pass) {
      setError("Ingrese usuario y contraseña.");
      return;
    }
    setEnviando(true);
    const r = await login(usuario, pass);
    const negar = async (msg: string) => {
      await logout();
      olvidarSedes();
      setEnviando(false);
      setPass("");
      setError(msg);
    };
    if (!r.sesion) return negar(r.error ?? "Usuario o contraseña incorrectos.");
    if (!perteneceAModulo(r.sesion, "sucursal")) return negar("Este usuario no tiene acceso al módulo Secocha.");
    // Un usuario de sucursal debe tener su sede asignada (usuarios_sedes): sin sede no ve nada
    if (r.sesion.rol === "sucursal") {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      const { data, error: eSede } = await sb.from("usuarios_sedes").select("sede_id").eq("user_id", user?.id ?? "").maybeSingle();
      if (eSede) return negar(/does not exist|could not find/i.test(eSede.message) ? "Faltan las sedes en Supabase: ejecute supabase/migrations/20261023_sedes_multisede.sql." : eSede.message);
      if (!data) return negar("Su usuario no tiene sede asignada. El administrador debe registrarlo en usuarios_sedes.");
    }
    await cargarSedes();
    try {
      window.localStorage.setItem(CLAVE_MODULO, "sucursal");
      window.localStorage.setItem(CLAVE_USUARIO, r.sesion.usuario);
      // sucsecocha@comboyvid.com -> "secocha" (la sede asignada en usuarios_sedes)
      const sede = getSedeActual();
      if (sede) window.localStorage.setItem(CLAVE_SEDE, sede.nombre.toLowerCase());
    } catch {
      /* almacenamiento bloqueado */
    }
    router.replace(RUTA_SUCURSAL);
  };

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-black text-white">
      {/* Mismo fondo del login del ERP: mapa mundial rojo */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1]">
        <Image src="/login-bg.jpg" alt="" fill priority quality={90} sizes="100vw" className="object-cover object-center opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/80" />
      </div>

      <main className="relative z-10 flex min-h-screen flex-col items-center px-4 pb-10">
        <header className="mt-8 flex justify-center">
          <LogoComboy size="lg" />
        </header>

        <h1 className="mt-10 text-center text-4xl font-bold uppercase leading-tight text-white">COMBOY VID SECOCHA</h1>
        <p className="mt-3 text-center text-[20px] text-blue-300">Sede Secocha</p>

        <form onSubmit={entrar} noValidate className="mt-8 w-full max-w-sm space-y-4 rounded-2xl border border-red-900/50 bg-black/60 p-6 shadow-2xl backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white">Iniciar sesión</h2>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-300">Usuario o correo</span>
            <span className="relative block">
              <User size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white" />
              <input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                placeholder="sucsecocha@comboyvid.com"
                className={`${CAMPO} pr-3`}
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-300">Contraseña</span>
            <span className="relative block">
              <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white" />
              <input type={ver ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" placeholder="••••••••" className={`${CAMPO} pr-12`} />
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
            <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-600/40 bg-red-950/50 px-3 py-2.5 text-sm font-medium text-red-200">
              <AlertCircle size={16} className="shrink-0" /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={enviando}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Ingresar
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-white/50">COMBOY VID © 2025 - Módulo Secocha</p>
      </main>
    </div>
  );
}
