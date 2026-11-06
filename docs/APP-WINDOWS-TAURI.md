# App de Windows (Tauri v2) con modo sin señal

Fase 1 del plan "ERP en PC y celular offline". Reemplaza a la app Electron de `desktop/`
(que se conserva hasta que se confirme el cambio).

## Cómo funciona

```
COMBOY-ERP-Setup.exe ──instala──> COMBOY-ERP.exe (Tauri, ~10 MB)
                                   │
                                   ├─ src-tauri/offline/index.html  (arranque, va dentro del .exe)
                                   │     con señal ─> https://sistemacomboy.vercel.app (el ERP de siempre)
                                   │     sin señal ─> la copia guardada (service worker public/sw.js)
                                   │
                                   ├─ SQLite local  %APPDATA%\com.comboyvid.erp\comboy-erp.db
                                   │     oc, facturas, guias, kardex, otros_registros, usuarios,
                                   │     sync_queue, correlativos_reservados, ajustes
                                   │
                                   └─ Actualizador: lee latest.json del último Release de GitHub
```

Por qué no se empaqueta el Next.js dentro del .exe: el ERP usa middleware (sesión en el servidor),
rutas `/api/*` y redirecciones de Next.js, que necesitan un servidor. Por eso la app abre la web de
Vercel y guarda en el equipo lo necesario para trabajar sin señal:

| Qué | Dónde se guarda | Cuándo |
|---|---|---|
| Pantallas (HTML, JS, CSS) | Service worker (`public/sw.js`) | Cada pantalla que se abre con señal |
| Datos (OC, facturas, guías, kardex, stock…) | SQLite (`lib/offline/localDb.ts`) | Cada vez que bajan de Supabase |
| Perfil y permisos del usuario | SQLite tabla `usuarios` | Al iniciar sesión |
| Cambios hechos sin señal | SQLite tabla `sync_queue` (`sync_status = 'pending'`) | Al guardar sin señal |
| N° de OC / REQ para emitir sin señal | SQLite `correlativos_reservados` (3 por serie) | Con señal, en cada sincronización |

### Flujo de un cambio

1. El usuario guarda (por ejemplo, una guía). `lib/storage.ts → escribir()` actualiza la pantalla al instante.
2. Con señal se sube a Supabase como siempre. Sin señal (o si se cae a mitad de camino) el cambio va a
   `sync_queue` y la fila local queda `pending`. Abajo a la izquierda aparece
   "Sin señal · N cambio(s) guardados en este equipo".
3. `useSync()` (`hooks/useSync.ts`) intenta subir la cola cada 30 s y apenas vuelve la señal.
   - Error de permiso o de datos: hasta 3 reintentos, luego queda en rojo con botón "Reintentar".
   - Conflicto (otro equipo cambió el mismo documento): gana el cambio más reciente según `updated_at`,
     nada se borra, y la otra versión queda en la tabla `conflictos` para que SOPORTE decida.
4. Al terminar, se relee del servidor lo que cambió (Realtime sigue avisando a las demás PCs en < 2 s).

### Permisos

Los roles y permisos NO cambian: la app usa el mismo login, la misma tabla `perfiles` y las mismas
políticas RLS de Supabase. Sin señal se usa el último perfil que entró en esa PC (mismo rol, módulos y
"solo lectura"), y al subir la cola Supabase vuelve a validar cada cambio con RLS.

Límites sin señal:
- Iniciar sesión por primera vez necesita internet (Supabase Auth). Después, la sesión guardada sirve sin señal.
- Solo abren las pantallas que se usaron alguna vez con señal en esa PC.
- Lo que no pasa por `lib/storage.ts` (Expedientes 26W, validar RUC en SUNAT, subir archivos, `/api/*`)
  necesita señal.

## Pasos para Williams (una sola vez)

1. **Clave del actualizador.** En GitHub → repositorio → Settings → Secrets and variables → Actions →
   New repository secret, crear:
   - `TAURI_SIGNING_PRIVATE_KEY` = contenido del archivo `comboy-erp.key` (se entrega aparte, no está en el repo).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = la contraseña que se entrega con la clave.
   Guarde esa clave en un lugar seguro: sin ella las apps instaladas no aceptan actualizaciones.
2. **SQL.** En Supabase → SQL Editor, correr `supabase/migrations/20261112_offline_sync.sql` (tabla `conflictos`).
3. **Compilar.** GitHub → Actions → "App Windows (Tauri)" → Run workflow (o fusionar a main un cambio en
   `src-tauri/`). Al terminar queda un Release `app-v1.0.N` con `COMBOY-ERP-Setup.exe`.

## Instalar en cada PC (Windows 10/11)

1. Descargar `COMBOY-ERP-Setup.exe` del último Release:
   https://github.com/Wilazarte/SISTEMACOMBOY/releases/latest
2. Abrirlo. Si Windows muestra "Windows protegió su PC", clic en "Más información" → "Ejecutar de todas formas"
   (el instalador no tiene certificado de firma de código pagado).
3. Instala sin pedir administrador. Crea el acceso "COMBOY-ERP" en el menú Inicio y el escritorio.
4. **Primera vez con internet:** iniciar sesión y abrir las pantallas que se usarán en la mina
   (INICIO, Almacén, Kardex, Compras…). Así quedan guardadas para trabajar sin señal.
5. Actualizaciones: al abrir la app, si hay versión nueva aparece "Nueva versión disponible" → Actualizar.

## Desarrollo

```bash
npm install
npm run tauri:dev     # abre la app apuntando a la web de Vercel
npm run tauri:build   # en Windows: genera src-tauri/target/release/bundle/nsis/COMBOY-ERP_<versión>_x64-setup.exe
```

Requisitos para compilar en Windows: Rust (rustup), Node 22 y "Microsoft C++ Build Tools".
