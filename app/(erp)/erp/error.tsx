"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-semibold">No se pudo cargar esta pagina</h1>
      <p className="text-sm text-muted-foreground">
        Ocurrio un error en el servidor. Si acabas de desplegar, revisa que DATABASE_URL en Vercel sea una URL de
        PostgreSQL (postgresql://...).
      </p>
      {error.digest && <p className="text-xs text-muted-foreground">Codigo: {error.digest}</p>}
      <button onClick={reset} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
        Reintentar
      </button>
    </div>
  );
}
