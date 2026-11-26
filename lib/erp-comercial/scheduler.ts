import { ejecutarAutomatizaciones } from "./automations";

const g = globalThis as unknown as { __comboyScheduler?: boolean };

export function iniciarScheduler() {
  const min = Number(process.env.AUTOMATION_INTERVAL_MINUTES || "0");
  if (!min || g.__comboyScheduler) return;
  g.__comboyScheduler = true;
  const run = async () => {
    try {
      const r = await ejecutarAutomatizaciones();
      console.log("[automatizaciones]", JSON.stringify(r));
    } catch (e) {
      console.error("[automatizaciones] error", e);
    }
  };
  setTimeout(run, 15_000);
  setInterval(run, min * 60_000);
  console.log(`[automatizaciones] motor activo cada ${min} min`);
}
