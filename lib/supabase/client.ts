import { createBrowserClient } from "@supabase/ssr";

/** Cliente de Supabase para el navegador (una sola instancia por pestaña). */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local (copie .env.example).");
  }
  return createBrowserClient(url, key);
}
