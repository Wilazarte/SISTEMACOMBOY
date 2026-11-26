// ERP Comercial: corre el motor de automatizaciones periodicamente mientras el servidor esta activo
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { iniciarScheduler } = await import("./lib/erp-comercial/scheduler");
    iniciarScheduler();
  }
}
