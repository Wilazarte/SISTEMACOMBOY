"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, LogIn, ShieldCheck, User } from "lucide-react";
import { EMPRESA } from "@/lib/empresa";
import { login, useSesion } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { sesion } = useSesion();
  const [usuario, setUsuario] = useState("");
  const [pass, setPass] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Si ya hay sesión, no mostrar el login
  useEffect(() => {
    if (sesion) router.replace("/dashboard");
  }, [sesion, router]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!usuario.trim() || !pass) {
      setError("Ingrese usuario y contraseña.");
      return;
    }
    setEnviando(true);
    const r = await login(usuario, pass);
    if (r.sesion) {
      router.replace("/dashboard");
    } else {
      setEnviando(false);
      setPass("");
      setError(r.error ?? "Usuario o contraseña incorrectos.");
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Panel de marca */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-500/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-amber-500/5" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-lg font-black text-slate-900">CV</div>
          <div>
            <p className="text-lg font-bold">COMBOY VID</p>
            <p className="text-xs text-slate-400">{EMPRESA.nombreComercial}</p>
          </div>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-black leading-tight">
            Sistema de gestión
            <br />
            <span className="text-amber-400">ERP COMBOY VID</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
            Compras, tesorería, almacén y planilla en un solo lugar. Cada usuario accede solo a los módulos de su área.
          </p>
          <ul className="mt-8 grid max-w-sm grid-cols-2 gap-2 text-sm text-slate-300">
            {["Tesorería / Compras", "Almacén", "Planilla", "Gerencia"].map((m) => (
              <li key={m} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {m}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">
          {EMPRESA.razonSocial} · RUC {EMPRESA.ruc}
        </p>
      </aside>

      {/* Formulario */}
      <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 font-black text-slate-900">CV</div>
            <div>
              <p className="font-bold text-slate-900">COMBOY VID</p>
              <p className="text-xs text-slate-500">ERP</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60">
            <h2 className="text-xl font-bold text-slate-900">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-slate-500">Ingrese con el usuario asignado a su área.</p>

            <form onSubmit={entrar} className="mt-6 space-y-4" noValidate>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Usuario</span>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    placeholder="ej. tesoreria"
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Contraseña</span>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={ver ? "text" : "password"}
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setVer((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
                disabled={enviando}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {enviando ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Ingresar
              </button>
            </form>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck size={14} /> Acceso restringido por módulo según su usuario
          </p>
        </div>
      </main>
    </div>
  );
}
