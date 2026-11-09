# JARVIS · asistente personal de Williams (COMBOY)

```
OÍDOS   AutoVoice Continuous "Hey Jarvis" ──► Tarea JARVIS Brain + Voice
CEREBRO Claude API (claude-sonnet-5-5, salida JSON con esquema)
BOCA    ElevenLabs, voz Adam (eleven_multilingual_v2); si falla, usa el TTS de Android
MEMORIA /storage/emulated/0/COMBOY/jarvis_memoria.md + jarvis_log.csv + jarvis_historial.json
VIGÍA   Perfil cada 2 min: 15 min en TikTok/IG → audio y te saca · 4 h sin ventas → alerta
```

## Archivos
| Archivo | Qué es |
|---|---|
| `tasker/JARVIS.prj.xml` | **Proyecto completo**: 2 perfiles y 9 tareas. Importa este. |
| `tasker/perfiles/*.prf.xml` | Cada perfil con sus tareas, por separado |
| `tasker/tareas/*.tsk.xml` | Cada tarea suelta |
| `tasker/js/*.js` | Código fuente de los JavaScriptlets (ya va incrustado en los XML) |
| `build.py` | Regenera los XML si editas un `.js`: `python3 jarvis/build.py` |
| `termux/jarvis_server.py` | Memoria avanzada opcional (SQLite + análisis de 7 días) |
| `termux/instalar.sh` | Instalador de Termux |
| `PERMISOS.md` | Lista exacta de permisos de accesibilidad y batería |

## Instalación (15 minutos)

**1. Importar.** Copia `JARVIS.prj.xml` al teléfono. En Tasker: mantén pulsada la pestaña de proyectos (abajo) → *Importar proyecto* → elige el archivo.

**2. Variables.** Tasker → pestaña **VARS** → **+** y crea:
| Variable | Valor |
|---|---|
| `%CLAVE_CLAUDE` | tu clave de console.anthropic.com |
| `%CLAVE_ELEVEN` | tu clave de elevenlabs.io |
| `%JV_PIN` | una palabra clave secreta (ej. `tornado`), para acciones sensibles |
| `%JV_META` | tu meta diaria de ventas (ej. `500`) |
| `%JV_MONEDA` | `S/`, `$`, `€`… |

Opcionales: `%JV_LIMITE_DIST` (15), `%JV_HORAS_SIN_VENTA` (4), `%JV_HORA_INI` (9), `%JV_HORA_FIN` (22), `%JV_EXPULSAR` (`si` te manda al inicio cuando te alerta), `%JV_VOZ_ID` (Adam).

**3. Setup.** Ejecuta una vez la tarea **JARVIS Setup** (▶). Crea `/storage/emulated/0/COMBOY/`, el CSV, la memoria y la agenda de contactos. Debe hablarte.

**4. Perfil "JARVIS Continuous Listen" (AutoVoice, 1 minuto).** Los plugins no se pueden incrustar en XML, así que este se crea a mano:
- Perfiles → **+** → *Evento* → *Plugin* → **AutoVoice** → *Recognized*
- Configuración: *Command Filter* = `jarvis` · *Exact Command* = OFF · *Use Regex* = OFF
- Tarea: **JARVIS Brain + Voice** · Nombre del perfil: `JARVIS Continuous Listen`
- Abre AutoVoice → *Continuous* → ON (mejor con *Google Assistant integration* o *Wake word*: "Hey Jarvis").

**5. Perfil "JARVIS Notificaciones" (AutoNotification).**
- Perfiles → **+** → *Evento* → *Plugin* → **AutoNotification** → *Intercept*
- *Action* = Created · *Apps* = WhatsApp, Instagram, Gmail
- Tarea: **JARVIS Notificacion**. Detecta clientes que preguntan precio/talla/stock y te avisa en voz.

**6. Tarea "JARVIS No Molestar".** Ábrela y, debajo del JavaScriptlet, agrega:
- `Audio → No molestar` · Modo: **Solo prioridad** · *If* `%par1 ~ on`
- `Audio → No molestar` · Modo: **Todo** · *If* `%par1 ~ off`

**7. Tarea "JARVIS Enviar WhatsApp" (envío automático, opcional).** Debajo del JavaScriptlet agrega:
- `Tarea → Esperar` 2 s
- `Plugin → AutoInput → Action` · Tipo: *Click* · Por: *Id* · Valor: `com.whatsapp:id/send`

Sin este paso JARVIS te deja el chat abierto con el mensaje escrito y tú tocas Enviar.

**8. Permisos.** Sigue `PERMISOS.md` completo. Si te saltas la parte de batería, Android apaga a JARVIS en una hora.

**9. Contactos.** Edita `/storage/emulated/0/COMBOY/jarvis_contactos.csv`:
```
nombre,numero
ana,51999111222
proveedor,51988777666
```

**10. Memoria.** Completa `jarvis_memoria.md` con productos, precios, costos y metas. JARVIS lo lee en cada orden.

## Órdenes de ejemplo
- "Hey Jarvis, registra venta de 150, hoodie negro talla M"
- "Jarvis, ánimo 4, estoy reventado"
- "Jarvis, pon alarma a las 6:30 para el gym"
- "Jarvis, recuérdame en 20 minutos subir el drop"
- "Jarvis, activa no molestar" / "baja el volumen a 5" / "abre Instagram"
- "Jarvis **tornado**, mándale WhatsApp a Ana: ya llegó tu talla M" ← la palabra clave autoriza
- "Jarvis, recuerda que el proveedor de gorras entrega los martes"
- "Jarvis, ¿cómo voy hoy y qué hago en la próxima hora?"

## Lealtad: cómo se protege
- AutoVoice **no** reconoce la voz de una persona; cualquiera que diga "Jarvis" cerca puede activarlo. Por eso:
  - Las acciones sensibles (`whatsapp`, `llamar`, `datos`) exigen **tu palabra clave `%JV_PIN` y el teléfono desbloqueado**. La palabra se quita antes de enviar el texto a la API.
  - En modo Tasker no hay ningún puerto abierto: solo se ejecuta desde perfiles de este teléfono.
  - El servidor de Termux escucha solo en `127.0.0.1` y exige `X-Jarvis-Token`.
  - El texto de notificaciones de terceros **solo se registra**: nunca se ejecuta como orden.
- Si quieres verificación por voz real, la única vía es un servicio de *speaker verification* aparte (Azure, Picovoice Eagle); no viene incluido.

## Modo memoria avanzada (Termux, opcional)
```
# en Termux
bash /storage/emulated/0/Download/termux/instalar.sh
nano ~/.jarvis.env          # pega CLAVE_CLAUDE y CLAVE_ELEVEN
bash ~/.termux/boot/jarvis.sh
```
En Tasker: `%JV_MODO` = `termux` y `%JV_TOKEN` = el token que imprimió el instalador. Si el servidor no responde, JARVIS cae solo al modo Tasker.
Agrega: memoria de conversación en SQLite, hechos a largo plazo y análisis de 7 días (horas con más ventas, redes vs ventas, ánimo). `GET /reporte` devuelve el análisis.

## Registro: `jarvis_log.csv`
`fecha,tipo,valor,detalle` · tipos: `venta`, `animo`, `enfoque`, `distraccion`, `app_abierta`, `alerta_distraccion`, `alerta_ventas`, `notificacion`, `lead`, `comando`, `whatsapp`, `error`.
Es CSV, no Google Sheet: ábrelo con Google Sheets/Excel o súbelo a Drive. La sincronización automática con Sheets no viene incluida.

## Si algo no importa o no funciona
- **El XML se generó a mano y no se probó en un teléfono.** Si Tasker rechaza un perfil: crea el perfil a mano (App: TikTok + Instagram → tarea de entrada *Distraccion Inicio*, salida *Distraccion Fin*; Hora: 00:00–23:59 cada 2 min → *JARVIS Vigia*). Las tareas son un solo JavaScriptlet cada una: si una falla, crea `Código → JavaScriptlet`, pega `00_lib.js` + el `.js` de la tarea y pon el timeout del `build.py`.
- **Revisa el perfil Vigía** después de importar: debe decir "Repetir cada 2 minutos".
- **Sin audio de ElevenLabs:** JARVIS usa el TTS de Android. Revisa `%CLAVE_ELEVEN` y que Tasker tenga acceso a todos los archivos (el mp3 se decodifica con `base64` en `/storage/emulated/0/COMBOY/`). Si sigue fallando, usa el modo Termux, que escribe el mp3 directamente.
- **Errores de la API** quedan en el CSV con tipo `error`.
- **WiFi** en Android 10+ necesita *Tasker Settings* instalado.
- **Costo:** cada orden es una llamada a Claude (esfuerzo bajo) más una a ElevenLabs. Las alertas del vigía usan frases locales y solo gastan ElevenLabs.
