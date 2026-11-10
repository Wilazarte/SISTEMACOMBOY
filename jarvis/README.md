# JARVIS · asistente personal de Williams (COMBOY)

```
OÍDOS   AutoVoice Continuous "Hey Jarvis" ──► Tarea JARVIS Brain + Voice
CEREBRO Claude API (claude-sonnet-4-5-20250929, responde en JSON)
BOCA    ElevenLabs, voz Adam (eleven_multilingual_v2); si falla, usa el TTS de Android
MEMORIA /storage/emulated/0/COMBOY/jarvis_memoria.md + jarvis_log.csv + jarvis_historial.json
VIGÍA   Perfil cada 2 min: 15 min en TikTok/IG → audio y te saca · 4 h sin ventas → alerta
```

> ⚠️ **Modelo deprecado.** `claude-sonnet-4-5-20250929` deja de funcionar el **30 de noviembre de 2026** (Anthropic lo retira). Desde ese día el cerebro responderá con error. Para cambiarlo sin tocar código: en Tasker crea la variable `%JV_MODELO` con el modelo nuevo (por ejemplo `claude-sonnet-5-5`); en Termux, `JV_MODELO=` en `~/.jarvis.env`.

## Archivos
| Archivo | Qué es |
|---|---|
| `tasker/JARVIS.prj.xml` | **Proyecto completo** (formato Tasker 6.2): 2 perfiles, 9 tareas y 4 marcas `<!-- MANUAL -->` |
| `tasker/perfiles/*.prf.xml` | Cada perfil con sus tareas, por separado |
| `tasker/tareas/*.tsk.xml` | Cada tarea suelta |
| `tasker/js/*.js` | Código de los JavaScriptlets (ya va incrustado en los XML) |
| `build.py` | Regenera los XML si editas un `.js`: `python3 jarvis/build.py` |
| `validar_xml.py` | Revisa la estructura de los XML: `python3 jarvis/validar_xml.py` |
| `termux/jarvis_server.py` | Memoria avanzada opcional (SQLite + análisis de 7 días) |
| `termux/instalar.sh` | Instalador de Termux |
| `PERMISOS.md` | Permisos de accesibilidad y batería (incluye Xiaomi, Samsung y Huawei) |

## Instalación

**1. Importar.** Copia `JARVIS.prj.xml` al teléfono. En Tasker: mantén pulsada la pestaña de proyectos (abajo) → *Importar proyecto* → elige el archivo.

**2. Variables.** Tasker → pestaña **VARS** → **+**:
| Variable | Valor |
|---|---|
| `%CLAVE_CLAUDE` | tu clave de console.anthropic.com |
| `%CLAVE_ELEVEN` | tu clave de elevenlabs.io |
| `%JV_PIN` | tu palabra clave secreta (ver **SEGURIDAD**) |
| `%JV_META` | meta diaria de ventas (ej. `500`) |
| `%JV_MONEDA` | `S/`, `$`, `€`… |

Opcionales: `%JV_MODELO`, `%JV_LIMITE_DIST` (15), `%JV_HORAS_SIN_VENTA` (4), `%JV_HORA_INI` (9), `%JV_HORA_FIN` (22), `%JV_EXPULSAR` (`si`), `%JV_VOZ_ID` (Adam).

**3. Setup.** Ejecuta una vez la tarea **JARVIS Setup** (▶). Crea `/storage/emulated/0/COMBOY/`, el CSV, la memoria y los contactos, y te habla.

**4. Los 4 pasos manuales** (abajo). Son las 4 marcas `<!-- MANUAL -->` del XML.

**5. Permisos.** Sigue `PERMISOS.md` completo. Si te saltas la parte de batería, Android apaga a JARVIS en una hora.

**6. Contactos y memoria.** Edita `/storage/emulated/0/COMBOY/jarvis_contactos.csv` (`nombre,numero` con código de país, ej. `ana,51999111222`) y completa `jarvis_memoria.md` con productos, precios, costos y metas.

## Los 4 pasos manuales
Los plugins de terceros (AutoVoice, AutoNotification, AutoInput) guardan su configuración en un formato propio que no se puede escribir a mano en el XML, y la acción nativa de No molestar tampoco tiene un formato documentado. Por eso se agregan desde Tasker:

**Manual 1 · AutoVoice → perfil "JARVIS Continuous Listen"**
1. Perfiles → **+** → *Evento* → *Plugin* → **AutoVoice** → *Recognized*.
2. Configuración: *Command Filter* = `jarvis` · *Exact Command* = OFF · *Use Regex* = OFF.
3. Tarea: **JARVIS Brain + Voice**. Nombre del perfil: `JARVIS Continuous Listen`.
4. Abre AutoVoice → *Continuous* → ON (o *Wake word* "Hey Jarvis").

**Manual 2 · AutoNotification → perfil "JARVIS Notificaciones"**
1. Perfiles → **+** → *Evento* → *Plugin* → **AutoNotification** → *Intercept*.
2. *Action* = Created · *Apps* = WhatsApp, Instagram, Gmail.
3. Tarea: **JARVIS Notificacion**.

**Manual 3 · AutoInput → tarea "JARVIS Enviar WhatsApp"** (opcional: envío automático)
1. Abre la tarea; debajo del JavaScriptlet agrega `Tarea → Esperar` 2 s.
2. Agrega `Plugin → AutoInput → Action` · Tipo *Click* · Por *Id* · Valor `com.whatsapp:id/send`.

Sin este paso JARVIS deja el chat abierto con el mensaje escrito y tú tocas Enviar.

**Manual 4 · No molestar → tarea "JARVIS No Molestar"**
1. Abre la tarea; debajo del JavaScriptlet agrega `Audio → No molestar` · Modo **Solo prioridad** · *If* `%par1 ~ on`.
2. Agrega otra `Audio → No molestar` · Modo **Todo** · *If* `%par1 ~ off`.

## SEGURIDAD: `%JV_PIN`
AutoVoice **no reconoce la voz de una persona**: cualquiera que diga "Jarvis" cerca del teléfono lo activa. `%JV_PIN` es lo que separa una orden tuya de la de cualquiera.

- **Qué protege:** las acciones sensibles `whatsapp`, `llamar` y `datos`. Sin la palabra clave en la orden, JARVIS responde "necesito tu palabra clave" y no ejecuta nada.
- **Doble condición:** además de la palabra, el teléfono debe estar **desbloqueado** (`%KEYG` = off). Bloqueado, se niega aunque digas la palabra.
- **Cómo se usa:** la dices dentro de la orden. Ejemplo con `%JV_PIN` = `tornado`: *"Jarvis **tornado**, mándale WhatsApp a Ana: ya llegó tu talla M"*.
- **No sale del teléfono:** JARVIS borra la palabra del texto **antes** de enviarlo a Claude, y tampoco queda en el CSV ni en el historial.
- **Cómo elegirla:** una palabra rara que no uses al hablar (no tu nombre, ni "COMBOY", ni números obvios). Cámbiala si alguien la escucha: basta con editar `%JV_PIN` en VARS.
- **Si `%JV_PIN` está vacía,** las acciones sensibles quedan **siempre bloqueadas**. La tarea Setup te avisa si falta.
- **Lo demás** (alarmas, volumen, abrir apps, registrar ventas) no pide palabra clave: no envían nada a terceros.

Otras protecciones:
- En modo Tasker no hay ningún puerto abierto: JARVIS solo se ejecuta desde perfiles de este teléfono.
- El servidor de Termux escucha **solo en 127.0.0.1**, compara `X-Jarvis-Token` en tiempo constante y responde **401** si falta, está vacío o es incorrecto. Sin `JARVIS_TOKEN` configurado, no arranca.
- El texto de notificaciones de terceros **solo se registra**: nunca se ejecuta como orden.
- Si el modelo devuelve una acción que no está en la lista permitida, se descarta.
- Para verificación de voz real haría falta un servicio aparte de *speaker verification* (Azure, Picovoice Eagle); no viene incluido.

## Órdenes de ejemplo
- "Hey Jarvis, registra venta de 150, hoodie negro talla M"
- "Jarvis, ánimo 4, estoy reventado"
- "Jarvis, pon alarma a las 6:30 para el gym" / "recuérdame en 20 minutos subir el drop"
- "Jarvis, activa no molestar" / "baja el volumen a 5" / "abre Instagram"
- "Jarvis tornado, llama a proveedor"
- "Jarvis, recuerda que el proveedor de gorras entrega los martes"
- "Jarvis, ¿cómo voy hoy y qué hago en la próxima hora?"

## Modo memoria avanzada (Termux, opcional)
```
bash /storage/emulated/0/Download/termux/instalar.sh
nano ~/.jarvis.env          # pega CLAVE_CLAUDE y CLAVE_ELEVEN
bash ~/.termux/boot/jarvis.sh
```
En Tasker: `%JV_MODO` = `termux` y `%JV_TOKEN` = el token que imprimió el instalador. Si el servidor no responde, JARVIS cae solo al modo Tasker.
Añade memoria de conversación en SQLite, hechos a largo plazo y un análisis de 7 días (horas con más ventas, redes vs ventas, ánimo). `GET /reporte` devuelve ese análisis.

## Registro: `jarvis_log.csv`
`fecha,tipo,valor,detalle` · tipos: `venta`, `animo`, `enfoque`, `distraccion`, `app_abierta`, `alerta_distraccion`, `alerta_ventas`, `notificacion`, `lead`, `comando`, `whatsapp`, `error`.
Es un CSV, no un Google Sheet: ábrelo con Sheets o Excel. La sincronización automática no viene incluida.

## Qué está verificado y qué no
- **Verificado en simulación local (Node, con las funciones de Tasker simuladas):** registro CSV y resumen del día, palabra clave, alarmas, `historial.json` inexistente → `[]`, `createDir` al inicio, lectura del JSON aunque venga rodeado de texto, descarte de acciones desconocidas, alerta a los 16 min de TikTok.
- **Verificado en el servidor:** 401 sin token, con token vacío y con token incorrecto; se niega a arrancar sin `JARVIS_TOKEN`; escucha solo en 127.0.0.1.
- **Verificado en el XML:** bien formado, `tv` 6.2, ids y referencias proyecto → perfiles → tareas coherentes, JavaScript de cada tarea compila, 4 marcas `<!-- MANUAL -->` (`validar_xml.py`).
- **NO verificado:** la importación en un teléfono con Tasker 6.2, ni las llamadas reales a Claude y ElevenLabs. El XML se escribió a mano siguiendo el formato de exportación de Tasker.

## Si algo no importa o no funciona
- **Tasker rechaza un perfil:** créalo a mano (App: TikTok + Instagram → entrada *Distraccion Inicio*, salida *Distraccion Fin*; Hora: 00:00–23:59 cada 2 min → *JARVIS Vigia*).
- **Tasker rechaza una tarea:** cada tarea es un solo JavaScriptlet. Crea `Código → JavaScriptlet`, pega `00_lib.js` + el `.js` de la tarea y pon el timeout que indica `build.py`.
- **Revisa el perfil Vigía** tras importar: debe decir "Repetir cada 2 minutos".
- **Sin audio de ElevenLabs:** JARVIS usa el TTS de Android. Revisa `%CLAVE_ELEVEN` y que Tasker tenga acceso a todos los archivos. Si sigue fallando, usa el modo Termux.
- **Errores de la API:** quedan en el CSV con tipo `error` y el código HTTP.
- **WiFi** en Android 10+ necesita *Tasker Settings*.
- **Costo:** cada orden es una llamada a Claude más una a ElevenLabs. Las alertas del vigía usan frases locales y solo gastan ElevenLabs.
