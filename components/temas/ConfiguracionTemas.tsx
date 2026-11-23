"use client";

import { useEffect, useState } from "react";
import { CloudOff, Cloud } from "lucide-react";
import { Card, CardHeader, toast } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { defTema, etiquetaModulo, MODULOS_TEMA, TEMAS, type TemaId } from "@/lib/temas";
import { OpcionesTema } from "./SelectorTema";
import { useTema } from "./TemaProvider";

/** Selector compacto (lista desplegable con los 6 temas + "sin tema propio"). */
function SelectTema({ valor, onCambio, vacio }: { valor?: TemaId; onCambio: (t: TemaId | null) => void; vacio: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border border-plomo-200" style={{ background: valor ? `linear-gradient(135deg, ${defTema(valor).colores.bg} 0 50%, ${defTema(valor).colores.accent} 50% 100%)` : "transparent" }} />
      <select value={valor ?? ""} onChange={(e) => onCambio((e.target.value || null) as TemaId | null)} className="w-full min-w-0 rounded-lg border border-plomo-200 bg-surface px-2 py-1.5 text-[13px] text-fg">
        <option value="">{vacio}</option>
        {TEMAS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre} · {t.estilo}
          </option>
        ))}
      </select>
    </span>
  );
}

interface PerfilFila {
  usuario: string;
  nombre_completo: string | null;
  rol: string | null;
}

/**
 * Configuración › Temas (/configuracion): tema de mi usuario y, para SOPORTE, tema de todo el ERP, de cada módulo
 * y de cada usuario. Prioridad: módulo > usuario > global.
 */
export function ConfiguracionTemas() {
  const t = useTema();
  const [perfiles, setPerfiles] = useState<PerfilFila[]>([]);

  useEffect(() => {
    if (!t.puedeAdministrar) return;
    void createClient()
      .from("perfiles")
      .select("usuario, nombre_completo, rol")
      .order("usuario")
      .then(({ data }) => setPerfiles(((data ?? []) as PerfilFila[]).filter((p) => p.usuario)));
  }, [t.puedeAdministrar]);

  const avisar = (r: string | null, ok: string) => (r ? toast(`Aplicado en este equipo, pero no se guardó en el servidor: ${r}`, "error") : toast(ok));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Tema de mi usuario"
          subtitle={`Se aplica en todos tus módulos, salvo los que tengan un tema propio. Ahora ves: ${defTema(t.tema).nombre}.`}
          action={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-plomo-200 px-2.5 py-1 text-[12px] text-plomo-600">
              {t.enServidor ? <Cloud size={14} /> : <CloudOff size={14} />}
              {t.enServidor ? "Se guarda en tu usuario (cualquier PC)" : "Se guarda solo en este equipo"}
            </span>
          }
        />
        <div className="p-5">
          <OpcionesTema valor={t.config.usuarios[t.usuario]} onElegir={(id) => void t.setThemePorUsuario(t.usuario, id).then((r) => avisar(r, `Tu tema: ${defTema(id).nombre}`))} />
          <button
            type="button"
            disabled={!t.config.usuarios[t.usuario]}
            onClick={() => void t.setThemePorUsuario(t.usuario, null).then((r) => avisar(r, "Usarás el tema del ERP"))}
            className="mt-3 text-[13px] font-semibold text-plomo-600 hover:text-fg disabled:opacity-40"
          >
            Quitar mi tema (usar el del ERP)
          </button>
        </div>
      </Card>

      {t.puedeAdministrar && (
        <>
          <Card>
            <CardHeader title="Tema de todo el ERP" subtitle="Para todos los usuarios y módulos que no tengan tema propio." />
            <div className="p-5">
              <OpcionesTema valor={t.config.global} onElegir={(id) => void t.setThemeGlobal(id).then((r) => avisar(r, `Tema del ERP: ${defTema(id).nombre}`))} />
              <button
                type="button"
                disabled={!t.config.global}
                onClick={() => void t.setThemeGlobal(null).then((r) => avisar(r, "El ERP vuelve a COMBOY VID"))}
                className="mt-3 text-[13px] font-semibold text-plomo-600 hover:text-fg disabled:opacity-40"
              >
                Volver a COMBOY VID
              </button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Tema por módulo" subtitle="Manda sobre el tema de cada usuario mientras está en ese módulo." />
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {MODULOS_TEMA.map((m) => (
                <label key={m.clave} className="block rounded-xl border border-plomo-200 bg-surface p-3">
                  <span className="mb-1.5 block text-[13px] font-bold text-fg">{m.label}</span>
                  <SelectTema
                    valor={t.config.modulos[m.clave]}
                    vacio="Sin tema propio"
                    onCambio={(v) => void t.setThemePorModulo(m.clave, v).then((r) => avisar(r, `${m.label}: ${v ? defTema(v).nombre : "sin tema propio"}`))}
                  />
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Tema por usuario" subtitle="Tema por defecto de cada persona (ella también puede cambiarlo desde la paleta de la cabecera)." />
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {perfiles.length === 0 && <p className="text-[13px] text-plomo-500">No se pudo leer la lista de usuarios.</p>}
              {perfiles.map((p) => (
                <label key={p.usuario} className="block rounded-xl border border-plomo-200 bg-surface p-3">
                  <span className="block truncate text-[13px] font-bold text-fg">{p.nombre_completo || p.usuario}</span>
                  <span className="mb-1.5 block truncate text-[11.5px] text-plomo-500">
                    {p.usuario}
                    {p.rol ? ` · ${p.rol.toUpperCase()}` : ""}
                  </span>
                  <SelectTema
                    valor={t.config.usuarios[p.usuario.toLowerCase()]}
                    vacio="Tema del ERP"
                    onCambio={(v) => void t.setThemePorUsuario(p.usuario, v).then((r) => avisar(r, `${p.usuario}: ${v ? defTema(v).nombre : "tema del ERP"}`))}
                  />
                </label>
              ))}
            </div>
          </Card>
        </>
      )}

      {!t.puedeAdministrar && t.config.modulos[t.modulo] && (
        <p className="text-[13px] text-plomo-500">El módulo {etiquetaModulo(t.modulo)} tiene un tema propio fijado por Soporte.</p>
      )}
    </div>
  );
}
