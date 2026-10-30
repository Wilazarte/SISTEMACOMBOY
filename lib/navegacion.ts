// Navegación del ERP en la MISMA ventana (pedido de Williams, 2026-10-30: nunca pestaña nueva).
// El layout registra su navegador (router de Next + aviso de ?tab=); cualquier botón, aunque no sea un
// componente con useRouter, navega con irA(). Atrás / Adelante del navegador (y de NavegacionERP) funcionan.

type Navegar = (href: string) => void;

let navegar: Navegar | null = null;

/** Lo llama el layout del ERP al montar; devuelve cómo quitarlo. */
export function registrarNavegador(fn: Navegar): () => void {
  navegar = fn;
  return () => {
    if (navegar === fn) navegar = null;
  };
}

/**
 * Va a una pantalla del ERP en la misma ventana (sin recargar). Los enlaces externos (videollamada Jitsi,
 * archivos) sí abren aparte, para no sacar al usuario del ERP.
 */
export function irA(href: string): void {
  if (!href.startsWith("/")) {
    window.open(href, "_blank", "noopener");
    return;
  }
  if (navegar) navegar(href);
  else window.location.assign(href);
}
