// Compila el export estático para la app Tauri (funciona igual en Windows, sin cross-env).
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", shell: true, env: { ...process.env, TAURI_EXPORT: "1" } });
process.exit(r.status ?? 1);
