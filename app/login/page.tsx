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
    <div className="flex min-h-screen bg-plomo-50">
      {/* Panel de marca */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden border-r-[3px] border-r-corp p-12 text-white lg:flex" style={{ background: "linear-gradient(180deg, #0F2440 0%, #1E3A5F 100%)" }}>
        <div className="relative">
          <p className="font-serif text-[42px] font-bold leading-none tracking-tight">
            COMBOY <span className="text-corp">VID</span>
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-white/50">Soluciones mineras</p>
        </div>
        <div className="relative">
          <h1 className="font-serif text-[42px] font-light leading-tight">
            Sistema de gestión
            <br />
            <span className="text-white/60">ERP COMBOY VID</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            Compras, tesorería, almacén y planilla en un solo lugar. Cada usuario accede solo a los módulos de su área.
          </p>
          <ul className="mt-8 grid max-w-sm grid-cols-2 gap-2 text-sm text-white/80">
            {["Tesorería / Compras", "Almacén", "Planilla", "Gerencia"].map((m) => (
              <li key={m} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-corp" /> {m}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">
          {EMPRESA.razonSocial} · RUC {EMPRESA.ruc}
        </p>
      </aside>

      {/* Formulario */}
      <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">
          <p className="mb-8 font-serif text-[36px] font-bold leading-none tracking-tight text-azul-900 lg:hidden">
            COMBOY <span className="text-corp">VID</span>
          </p>

          <div className="rounded-xl border border-plomo-200 border-t-[3px] border-t-corp bg-white p-7 shadow-[0_4px_12px_rgba(15,36,64,0.06)]">
            <h2 className="font-serif text-2xl text-azul-900">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-plomo-500">Ingrese con el usuario asignado a su área.</p>

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
                    autoFocus
                    placeholder="ej. tesoreria"
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
                disabled={enviando}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-corp py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-vino-900 disabled:opacity-60"
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
