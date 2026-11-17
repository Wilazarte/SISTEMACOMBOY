import { CLAVE_MODULO, CLAVE_USUARIO, RUTA_SUCURSAL, inicioDe, perteneceAModulo, soloSecocha, type Sesion } from "@/lib/auth";
import { cargarSedes, esUsuarioDeSede, getSedeActual } from "@/lib/sedes";
import { createClient } from "@/lib/supabase/client";

/** Sede elegida al entrar ("secocha", "arequipa"): la lee la app de la sucursal. */
const CLAVE_SEDE = "sede";

/**
 * Validación de Sucursal Secocha después de Supabase Auth (antes en app/(sucursal)/secocha/login).
 * Devuelve a dónde entrar, o el error (y quien llama cierra la sesión).
 */
export async function validarEntradaSecocha(sesion: Sesion): Promise<{ destino?: string; error?: string }> {
  // Perfiles con sede Secocha que no son "sucursal": el mismo ERP en modo Secocha
  if (!perteneceAModulo(sesion, "sucursal")) {
    await cargarSedes();
    if (!esUsuarioDeSede()) return { error: "Este usuario no tiene acceso al módulo Secocha." };
    return { destino: inicioDe(sesion) };
  }
  // Un usuario de sucursal (administrador de sede) debe tener su sede asignada (usuarios_sedes): sin sede no ve nada
  if (sesion.rol === "sucursal" || soloSecocha(sesion)) {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    const { data, error } = await sb.from("usuarios_sedes").select("sede_id").eq("user_id", user?.id ?? "").maybeSingle();
    if (error)
      return { error: /does not exist|could not find/i.test(error.message) ? "Faltan las sedes en Supabase: ejecute supabase/migrations/20261023_sedes_multisede.sql." : error.message };
    if (!data) return { error: "Su usuario no tiene sede asignada. El administrador debe registrarlo en usuarios_sedes." };
  }
  await cargarSedes();
  try {
    window.localStorage.setItem(CLAVE_MODULO, "sucursal");
    window.localStorage.setItem(CLAVE_USUARIO, sesion.usuario);
    // sucsecocha@comboyvid.com -> "secocha" (la sede asignada en usuarios_sedes)
    const sede = getSedeActual();
    if (sede) window.localStorage.setItem(CLAVE_SEDE, sede.nombre.toLowerCase());
  } catch {
    /* almacenamiento bloqueado */
  }
  return { destino: soloSecocha(sesion) ? RUTA_SUCURSAL : inicioDe(sesion) };
}
