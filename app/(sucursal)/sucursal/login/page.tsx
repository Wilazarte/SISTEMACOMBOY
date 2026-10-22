"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, LogIn, User } from "lucide-react";
import { CLAVE_MODULO, CLAVE_USUARIO, RUTA_SUCURSAL, login, logout, perteneceAModulo, useSesion } from "@/lib/auth";
import { cargarSedes, olvidarSedes } from "@/lib/sedes";
import { createClient } from "@/lib/supabase/client";

const CAMPO =
  "h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#c41e1e] focus:ring-2 focus:ring-[#c41e1e]/20";

/** Login propio de COMBOY VID SUCURSAL (usuarios de sede, p. ej. sucsecocha@comboyvid.com; también Taller y Tesorería). */
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
    if (!perteneceAModulo(r.sesion, "sucursal")) return negar("Este usuario no tiene acceso a COMBOY VID SUCURSAL.");
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
    try {
      window.localStorage.setItem(CLAVE_MODULO, "sucursal");
      window.localStorage.setItem(CLAVE_USUARIO, r.sesion.usuario);
    } catch {
      /* almacenamiento bloqueado */
    }
    await cargarSedes();
    router.replace(RUTA_SUCURSAL);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-10">
      <Image src="/comboy-logo.png" alt="COMBOY VID" width={260} height={84} priority className="h-[84px] w-auto object-contain" />
      <h1 className="mt-4 text-center text-[26px] font-bold uppercase tracking-wide text-slate-900 md:text-[32px]">COMBOY VID SUCURSAL</h1>
      <p className="mt-1 text-center text-[15px] text-slate-500">Arequipa · Secocha</p>

      <form onSubmit={entrar} noValidate className="mt-8 w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
        <h2 className="text-lg font-bold text-slate-900">Iniciar sesión</h2>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Usuario o correo</span>
          <span className="relative block">
            <User size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#c41e1e]" />
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
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Contraseña</span>
          <span className="relative block">
            <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#c41e1e]" />
            <input type={ver ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" placeholder="••••••••" className={`${CAMPO} pr-12`} />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {ver ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </p>
        )}
        <button
          type="submit"
          disabled={enviando}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#c41e1e] font-bold text-white transition hover:bg-[#a31818] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Ingresar
        </button>
      </form>
      <p className="mt-6 text-xs text-slate-400">COMBOY VID © 2025 · Sistema de Sucursales</p>
    </main>
  );
}
