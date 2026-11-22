"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  cargarTemasServidor,
  claveModulo,
  claveUsuario,
  escucharTemas,
  getConfigTemas,
  resolverTema,
  setThemeGlobal,
  setThemePorModulo,
  setThemePorUsuario,
  temasEnServidor,
  TEMA_PREDETERMINADO,
  type ConfigTemas,
  type OrigenTema,
  type TemaId,
} from "@/lib/temas";

interface ValorTema {
  /** Tema que se ve ahora (ya resuelto con la prioridad módulo > usuario > global). */
  tema: TemaId;
  origen: OrigenTema;
  config: ConfigTemas;
  /** Clave del módulo actual (ventas, almacen, secocha…). */
  modulo: string;
  /** Usuario logueado (perfiles.usuario en minúsculas). */
  usuario: string;
  /** SOPORTE: puede fijar el tema global, por módulo y de otros usuarios. */
  puedeAdministrar: boolean;
  /** La tabla preferencias_tema existe: la elección sigue al usuario en cualquier PC. */
  enServidor: boolean;
  setThemeGlobal: typeof setThemeGlobal;
  setThemePorModulo: typeof setThemePorModulo;
  setThemePorUsuario: typeof setThemePorUsuario;
}

const Ctx = createContext<ValorTema | null>(null);

/**
 * Proveedor de temas: lo monta ErpLayout (todos los módulos y Secocha). Resuelve el tema del módulo / usuario
 * actual y lo entrega a `children` como función, para que ErpLayout lo ponga en data-tema (app/themes.css).
 */
export function TemaProvider({
  moduleName,
  usuario,
  puedeAdministrar,
  children,
}: {
  moduleName: string;
  usuario: string;
  puedeAdministrar: boolean;
  children: (tema: TemaId) => ReactNode;
}) {
  // Primer render igual en servidor y navegador (predeterminado); al montar se lee localStorage y luego Supabase
  const [config, setConfig] = useState<ConfigTemas>({ modulos: {}, usuarios: {} });
  const [enServidor, setEnServidor] = useState(false);
  useEffect(() => {
    const sync = () => {
      setConfig(getConfigTemas());
      setEnServidor(temasEnServidor());
    };
    sync();
    const quitar = escucharTemas(sync);
    void cargarTemasServidor().then(sync);
    return quitar;
  }, []);

  const modulo = claveModulo(moduleName);
  const user = claveUsuario(usuario);
  const valor = useMemo<ValorTema>(() => {
    const { tema, origen } = resolverTema(config, modulo, user);
    return { tema, origen, config, modulo, usuario: user, puedeAdministrar, enServidor, setThemeGlobal, setThemePorModulo, setThemePorUsuario };
  }, [config, modulo, user, puedeAdministrar, enServidor]);

  // Transición suave de colores al cambiar (no mueve nada: solo color, fondo y borde)
  const anterior = useRef<TemaId>(TEMA_PREDETERMINADO);
  useEffect(() => {
    if (valor.tema === anterior.current) return;
    anterior.current = valor.tema;
    const html = document.documentElement;
    html.classList.add("cambiando-tema");
    const t = setTimeout(() => html.classList.remove("cambiando-tema"), 260);
    return () => {
      clearTimeout(t);
      html.classList.remove("cambiando-tema");
    };
  }, [valor.tema]);

  return <Ctx.Provider value={valor}>{children(valor.tema)}</Ctx.Provider>;
}

/** Igual que useTema(), pero null fuera de ErpLayout (ej. una cabecera suelta). */
export const useTemaOpcional = (): ValorTema | null => useContext(Ctx);

/** Tema actual y funciones para cambiarlo (dentro de ErpLayout). */
export function useTema(): ValorTema {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTema() debe usarse dentro de <TemaProvider> (ErpLayout)");
  return v;
}
