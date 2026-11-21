# App Android (Capacitor 6)

Fase 2 del plan "ERP en PC y celular offline". Misma web de Vercel (una sola base de código) dentro de
una app Android `com.comboyvid.erp`, con cámara, archivos, red y almacenamiento del celular.

## Qué hace

- **Abre el ERP de Vercel** (`capacitor.config.ts → server.url`). Sin señal: pantallas guardadas por el
  service worker (`public/sw.js`), datos en IndexedDB y cola de sincronización (`lib/offline/`, igual que en Windows).
  Si el celular nunca abrió el ERP con señal, muestra `movil/www/index.html` con "Reintentar".
- **Foto de guía** (botón azul con cámara, abajo a la derecha; no aparece para usuarios de solo lectura):
  elegir la OC → "Tomar foto". La foto se guarda en el celular (Filesystem), queda vinculada a la OC
  (`fotosGuia` en la OC) y se sube al bucket privado `guias` de Supabase Storage. Sin señal se queda en el
  celular (lista en Preferences) y se sube sola al volver la señal (`lib/movil/fotosGuia.ts`).
- **Red**: el plugin Network avisa al instante cuando vuelve la señal y dispara la sincronización (`hooks/useSync.ts`).
- **Tarjetas en el celular**: Kardex, las listas de Ventas y las listas de documentos (`ListaDocs`) se ven como
  tarjetas en pantallas de menos de 768 px (`ErpTable tarjetas`, estilo `.tabla-tarjetas` en `app/globals.css`).

## Pasos para Williams (una sola vez)

1. Supabase → SQL Editor: correr `supabase/migrations/20261113_bucket_guias.sql` (bucket `guias` y permisos).
2. Fusionar el PR. GitHub Actions → "App Android (APK)" arma `COMBOY-ERP.apk` y lo publica en Releases
   como `apk-v1.0.N` (sin marcarlo como "latest", porque el "latest" lo usa el actualizador de Windows).
3. Opcional, para un APK firmado de producción (Play Store o MDM): crear los secretos
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
   Sin ellos se publica solo el APK debug, que se instala igual en los celulares de la empresa.

## Instalar en cada celular

1. En el celular, abrir https://github.com/Wilazarte/SISTEMACOMBOY/releases y bajar `COMBOY-ERP.apk`
   del release `apk-v…` más reciente.
2. Abrir el archivo. Android pide "Permitir instalar apps de esta fuente" para el navegador: aceptar.
3. Abrir "COMBOY VID ERP", iniciar sesión **con señal** y entrar a las pantallas que se usarán en la mina.
4. La primera foto de guía pide permiso de cámara: "Permitir".

## Comandos (desarrollo)

```bash
npm install
npx cap add android      # ya hecho: la carpeta android/ está en el repo
npx cap sync android     # después de cambiar capacitor.config.ts o plugins
npx cap open android     # abre Android Studio
cd android && ./gradlew assembleDebug   # APK en android/app/build/outputs/apk/debug/app-debug.apk
```

Requisitos para compilar en una PC: Node 22, JDK 17 y Android Studio (SDK 34).
