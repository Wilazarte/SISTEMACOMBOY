# JARVIS · Permisos exactos que debes activar

## Apps a instalar
| App | Para qué | Dónde |
|---|---|---|
| Tasker | Motor de todo | Play Store |
| AutoVoice | "Hey Jarvis" continuo | Play Store |
| AutoNotification | Leer WhatsApp / Instagram / Gmail | Play Store |
| AutoInput | Pulsar "Enviar" en WhatsApp | Play Store |
| Tasker Settings | WiFi en Android 10+ | GitHub joaomgcd/TaskerSettings (APK) |
| Termux + Termux:Boot + Termux:API | Solo modo memoria avanzada | **F-Droid** (no Play Store) |

## Accesibilidad (Ajustes → Accesibilidad → Apps instaladas)
- **Tasker** → ACTIVAR (detección de app en primer plano en algunos teléfonos).
- **AutoInput** → ACTIVAR (sin esto no puede tocar "Enviar").
- **AutoVoice** → ACTIVAR (Continuous y reconocimiento en pantalla).

## Acceso a notificaciones (Ajustes → Apps → Acceso especial → Acceso a notificaciones)
- **AutoNotification** → PERMITIR
- **Tasker** → PERMITIR
- **AutoVoice** → PERMITIR

## Acceso de uso (Ajustes → Apps → Acceso especial → Acceso a datos de uso)
- **Tasker** → PERMITIR (lo necesita el perfil de TikTok/Instagram).

## No Molestar (Ajustes → Apps → Acceso especial → Acceso a No molestar)
- **Tasker** → PERMITIR

## Batería (para que Android no mate a JARVIS)
Ajustes → Apps → [app] → Batería → **Sin restricciones** en: Tasker, AutoVoice, AutoNotification, AutoInput, Termux.
- Xiaomi/MIUI/HyperOS: además **Inicio automático** = ON y en Seguridad → Batería → "Sin restricciones". Bloquea Tasker en recientes (candado).
- Samsung: Batería → Límites de uso en segundo plano → quitar de "Apps en suspensión" y agregar a **"Apps que nunca se suspenden"**.
- Huawei: Batería → Inicio de aplicaciones → Tasker en **Gestionar manualmente** (las 3 opciones ON).
- Tasker → Preferencias → Monitor → **Usar servicio en primer plano** = ON.

## Otros permisos de Android
- Tasker: **Archivos y multimedia → Permitir gestión de todos los archivos** (escribe en /storage/emulated/0/COMBOY).
- Tasker: **Mostrar sobre otras apps**, **Modificar ajustes del sistema**, **Alarmas y recordatorios**, **Teléfono** (llamar), **Micrófono** (AutoVoice).
- AutoVoice: **Micrófono** = Permitir siempre.
- Termux: `termux-setup-storage` y aceptar.

## Por ADB (una sola vez desde la PC, para datos móviles y ajustes seguros)
```
adb shell pm grant net.dinglisch.android.taskerm android.permission.WRITE_SECURE_SETTINGS
adb shell pm grant net.dinglisch.android.taskerm android.permission.READ_LOGS
adb shell pm grant net.dinglisch.android.taskerm android.permission.DUMP
```
Activar/desactivar **datos móviles** requiere además *ADB WiFi* en Tasker (Preferencias → Varios → ADB Wifi) o root. Sin eso, la acción `datos` falla y JARVIS lo registra como error.
