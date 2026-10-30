"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "@/components/ui";
import { recargarExpedientes } from "@/lib/expedientes";
import { RUTA_INICIO, type ModuloInicio } from "@/lib/inicioModulos";
import { esperarGuardado } from "@/lib/storage";

// Pantalla de una acción (abierta desde un botón del INICIO, en la misma ventana): barra NavegacionERP arriba
// (components/NavegacionERP) y pie con Cancelar y Guardar y Cerrar. Guardar y Cerrar envía el formulario que se está
// llenando (o pulsa su botón Registrar / Emitir…); cuando el ERP confirma el guardado en Supabase, vuelve al INICIO.
// Un formulario marca su botón de guardar con data-guardar-pestana: en esta pantalla ese botón se oculta
// (app/globals.css) y el pie toma su texto ("Guardar compra e ingresar a stock"), así hay un solo botón de guardar.
// "¿Guardar y crear nuevo registro?" marcado: guarda y se queda en la pantalla con el formulario limpio.

const EV_TOAST = "erp:toast";
const ESPERA_MS = 8000;

const visible = (el: Element) => !el.closest("[data-sin-guardar], header") && el.getClientRects().length > 0;
const BOTON_GUARDAR = /^(guardar|registrar|crear|emitir|generar|aprobar|enviar|confirmar|pagar|subir)/i;

const botonGuardarEn = (raiz: ParentNode): HTMLButtonElement | undefined => {
  const botones = [...raiz.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.disabled && visible(b) && BOTON_GUARDAR.test((b.textContent ?? "").trim()));
  return botones[botones.length - 1];
};

/** Botón de guardar del formulario abierto (data-guardar-pestana), oculto en esta pantalla. */
function botonPrincipal(): HTMLButtonElement | undefined {
  const botones = [...document.querySelectorAll<HTMLButtonElement>("button[data-guardar-pestana]")].filter((b) => !!b.parentElement && visible(b.parentElement));
  return botones[botones.length - 1];
}

type Objetivo = { form: HTMLFormElement } | { boton: HTMLButtonElement } | { sinBoton: true } | null;

/**
 * Qué se guarda: con un modal abierto, su formulario o su botón principal (Guardar, Registrar, Crear, Emitir…).
 * Sin modal, el formulario del último campo editado o el botón principal más cercano a ese campo.
 * Si no se editó nada, no hay nada que guardar (null).
 */
function objetivoGuardar(editado: Element | null): Objetivo {
  const dialogos = [...document.querySelectorAll<HTMLElement>("[role='dialog']")].filter(visible);
  const dialogo = dialogos[dialogos.length - 1];
  if (dialogo) {
    const forms = [...dialogo.querySelectorAll<HTMLFormElement>("form")].filter(visible);
    if (forms.length) return { form: forms[forms.length - 1] };
    const boton = botonGuardarEn(dialogo);
    return boton ? { boton } : { sinBoton: true };
  }
  const principal = botonPrincipal();
  if (principal) return { boton: principal };
  if (!editado || !editado.isConnected || !visible(editado)) return null;
  const form = editado.closest("form");
  if (form) return { form };
  for (let el = editado.parentElement; el && el.tagName !== "MAIN"; el = el.parentElement) {
    const boton = botonGuardarEn(el);
    if (boton) return { boton };
  }
  return { sinBoton: true };
}

export function PiePestana({ modulo }: { modulo: ModuloInicio }) {
  const router = useRouter();
  const inicio = RUTA_INICIO[modulo];
  const cerrar = () => router.push(inicio);
  const [guardando, setGuardando] = useState(false);
  const [crearNuevo, setCrearNuevo] = useState(false);
  // Texto y estado del botón del formulario (data-guardar-pestana): el pie lo reemplaza
  const [principal, setPrincipal] = useState<{
    texto: string;
    deshabilitado: boolean;
  } | null>(null);
  useEffect(() => {
    document.body.dataset.modoPestana = "1";
    const leer = () => {
      const b = botonPrincipal();
      const texto = b?.textContent?.trim() ?? "";
      setPrincipal((p) => (!b ? null : p?.texto === texto && p.deshabilitado === b.disabled ? p : { texto, deshabilitado: b.disabled }));
    };
    leer();
    const reloj = setInterval(leer, 400);
    return () => {
      clearInterval(reloj);
      delete document.body.dataset.modoPestana;
    };
  }, []);
  const limpiar = useRef<() => void>(() => undefined);
  // Último campo que el usuario editó (se olvida cuando el ERP confirma un guardado)
  const editado = useRef<Element | null>(null);
  useEffect(() => {
    const alEditar = (e: Event) => {
      const t = e.target as Element | null;
      if (t && !t.closest("[data-sin-guardar]")) editado.current = t;
    };
    const alAvisar = (e: Event) => {
      if ((e as CustomEvent<{ tipo?: string }>).detail?.tipo !== "error") editado.current = null;
    };
    document.addEventListener("input", alEditar, true);
    document.addEventListener("change", alEditar, true);
    window.addEventListener(EV_TOAST, alAvisar);
    return () => {
      document.removeEventListener("input", alEditar, true);
      document.removeEventListener("change", alEditar, true);
      window.removeEventListener(EV_TOAST, alAvisar);
    };
  }, []);

  const terminar = async () => {
    const err = await esperarGuardado();
    if (err) {
      setGuardando(false);
      toast(`No se guardó: ${err}`, "error");
      return;
    }
    void recargarExpedientes();
    // Guardar y crear nuevo: se queda en la pantalla (el formulario ya se limpió al guardar)
    if (crearNuevo) {
      setGuardando(false);
      editado.current = null;
      return;
    }
    cerrar();
  };

  const guardarYCerrar = () => {
    const obj = objetivoGuardar(editado.current);
    // Nada editado: lo hecho en la pantalla ya se guardó al confirmarlo; solo se espera a Supabase
    if (!obj) {
      setGuardando(true);
      void terminar();
      return;
    }
    if ("sinBoton" in obj) {
      toast("Guarde con el botón del formulario (Registrar, Emitir…) y vuelva a pulsar Guardar y Cerrar.", "error");
      return;
    }
    if ("form" in obj && !obj.form.checkValidity()) {
      obj.form.reportValidity();
      return;
    }
    setGuardando(true);
    // El ERP confirma cada guardado con un aviso (toast): "ok" cierra, "error" deja la pestaña abierta
    const oir = (e: Event) => {
      const tipo = (e as CustomEvent<{ tipo?: string }>).detail?.tipo;
      fin();
      if (tipo === "error") setGuardando(false);
      else void terminar();
    };
    const reloj = setTimeout(() => {
      fin();
      setGuardando(false);
      toast("No se confirmó el guardado. Revise el formulario o use Cancelar.", "error");
    }, ESPERA_MS);
    function fin() {
      window.removeEventListener(EV_TOAST, oir);
      clearTimeout(reloj);
    }
    limpiar.current = fin;
    window.addEventListener(EV_TOAST, oir);
    if ("form" in obj) obj.form.requestSubmit();
    else obj.boton.click();
  };

  const cancelar = () => {
    limpiar.current();
    cerrar();
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-between gap-3 border-t border-[#2a3445] bg-[#0e1219]/95 px-4 py-3 backdrop-blur print:hidden sm:px-6 lg:px-8"
      data-sin-guardar
    >
      <label className="flex cursor-pointer items-center gap-2 text-[14px] text-white">
        <input type="checkbox" checked={crearNuevo} onChange={(e) => setCrearNuevo(e.target.checked)} className="h-4 w-4 accent-[#2a7bff]" />
        ¿Guardar y crear nuevo registro?
      </label>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={cancelar}
          className="inline-flex items-center gap-2 rounded-lg border border-[#2a3445] bg-[#1a212e] px-5 py-2.5 text-[14px] font-bold text-white hover:border-[#2a7bff]"
        >
          <X size={16} /> Cancelar
        </button>
        <button
          type="button"
          onClick={guardarYCerrar}
          disabled={guardando || !!principal?.deshabilitado}
          className="inline-flex items-center gap-2 rounded-lg bg-[#2a7bff] px-5 py-2.5 text-[14px] font-bold text-white hover:bg-[#1e64e6] disabled:opacity-70"
        >
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {principal?.texto && !guardando ? principal.texto : crearNuevo ? "Guardar" : "Guardar y Cerrar"}
        </button>
      </div>
    </div>
  );
}
