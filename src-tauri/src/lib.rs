// =====================================================================
// COMBOY VID ERP para Windows (Tauri v2).
//
// La ventana abre offline/index.html (incluido en el .exe), que entra a
// https://sistemacomboy.vercel.app. El ERP corre igual que en el navegador
// y, por estar dentro de la app, usa:
//   - SQLite local (plugin sql): copia de los datos + cola sync_queue para
//     trabajar sin señal (mina Secocha). Ver lib/offline/ en el Next.js.
//   - Actualizador (plugin updater): al abrir pregunta "Nueva versión
//     disponible" si hay un instalador nuevo en GitHub Releases.
// =====================================================================

use tauri_plugin_sql::{Migration, MigrationKind};

/// Base local. El archivo queda en %APPDATA%\com.comboyvid.erp\comboy-erp.db
pub const DB_URL: &str = "sqlite:comboy-erp.db";

fn migraciones() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "tablas_offline",
        kind: MigrationKind::Up,
        sql: r#"
-- Copia local de los documentos que se trabajan sin señal.
-- sync_status: synced (igual que Supabase) | pending (cambio local sin subir) | error | conflict
CREATE TABLE IF NOT EXISTS oc (
  id TEXT PRIMARY KEY,
  serie TEXT,
  data TEXT NOT NULL,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced','pending','error','conflict'))
);
CREATE TABLE IF NOT EXISTS facturas (
  id TEXT PRIMARY KEY,
  serie TEXT,
  data TEXT NOT NULL,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced','pending','error','conflict'))
);
CREATE TABLE IF NOT EXISTS guias (
  id TEXT PRIMARY KEY,
  serie TEXT,
  data TEXT NOT NULL,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced','pending','error','conflict'))
);
CREATE TABLE IF NOT EXISTS kardex (
  id TEXT PRIMARY KEY,
  serie TEXT,
  data TEXT NOT NULL,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced','pending','error','conflict'))
);
-- El resto de claves del ERP (stock, requerimientos, ventas...) para poder abrir los módulos sin señal
CREATE TABLE IF NOT EXISTS otros_registros (
  clave TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  PRIMARY KEY (clave, id)
);
-- Último perfil que entró en esta PC (rol, módulos, solo lectura): los permisos se respetan sin señal
CREATE TABLE IF NOT EXISTS usuarios (
  uid TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  rol TEXT NOT NULL,
  solo_lectura INTEGER NOT NULL DEFAULT 0,
  sesion_json TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
-- Cola de sincronización: cada cambio hecho sin señal (o que falló al subir)
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabla TEXT NOT NULL,
  operacion TEXT NOT NULL CHECK (operacion IN ('upsert','delete')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  clave TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  base_updated_at TEXT,
  estado TEXT NOT NULL DEFAULT 'pending' CHECK (estado IN ('pending','error')),
  ultimo_error TEXT
);
CREATE INDEX IF NOT EXISTS sync_queue_estado_idx ON sync_queue (estado, id);
-- Números correlativos reservados en Supabase cuando había señal (OC, REQ...) para emitir sin señal
CREATE TABLE IF NOT EXISTS correlativos_reservados (
  serie TEXT NOT NULL,
  numero INTEGER NOT NULL,
  PRIMARY KEY (serie, numero)
);
CREATE TABLE IF NOT EXISTS ajustes (
  k TEXT PRIMARY KEY,
  v TEXT
);
"#,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Una sola ventana: si se abre el acceso directo otra vez, se enfoca la que ya está abierta
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                use tauri::Manager;
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }))
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migraciones())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar COMBOY VID ERP");
}
