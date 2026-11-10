# JARVIS · Permisos exactos que debes activar

## Apps a instalar
| App | Para qué | Dónde |
|---|---|---|
| Tasker (6.2 o superior) | Motor de todo | Play Store |
| AutoVoice | "Hey Jarvis" continuo | Play Store |
| AutoNotification | Leer WhatsApp / Instagram / Gmail | Play Store |
| AutoInput | Pulsar "Enviar" en WhatsApp | Play Store |
| Tasker Settings | WiFi en Android 10+ | GitHub joaomgcd/TaskerSettings (APK) |
| Termux + Termux:Boot + Termux:API | Solo modo memoria avanzada | **F-Droid** (no Play Store) |

## 1. Accesibilidad
Ajustes → Accesibilidad → Apps instaladas (o "Servicios descargados"):
- **Tasker** → ACTIVAR
- **AutoInput** → ACTIVAR (sin esto no puede tocar "Enviar")
- **AutoVoice** → ACTIVAR

> Si el servicio aparece en gris ("Configuración restringida", Android 13+): Ajustes → Apps → [app] → menú ⋮ → **Permitir configuración restringida**, y vuelve a activarlo.

## 2. Acceso a notificaciones
Ajustes → Apps → Acceso especial → Acceso a notificaciones:
- **AutoNotification** → PERMITIR
- **Tasker** → PERMITIR
- **AutoVoice** → PERMITIR

## 3. Acceso a datos de uso
Ajustes → Apps → Acceso especial → Acceso a datos de uso:
- **Tasker** → PERMITIR (lo usa el detector de TikTok/Instagram)

## 4. Acceso a No molestar
Ajustes → Apps → Acceso especial → Acceso a No molestar:
- **Tasker** → PERMITIR

## 5. Otros permisos de Android
- Tasker → **Archivos y multimedia → Permitir gestión de todos los archivos** (escribe en `/storage/emulated/0/COMBOY`).
- Tasker → **Mostrar sobre otras apps**, **Modificar ajustes del sistema**, **Alarmas y recordatorios**, **Teléfono** (llamar), **Notificaciones**.
- AutoVoice → **Micrófono = Permitir siempre**.
- Termux → ejecutar `termux-setup-storage` y aceptar.

## 6. Batería (para que Android no mate a JARVIS)
En todos los teléfonos: Ajustes → Apps → [app] → Batería → **Sin restricciones** para **Tasker, AutoVoice, AutoNotification, AutoInput y Termux**. Además, en Tasker: Preferencias → Monitor → **Usar servicio en primer plano = ON**.

### Xiaomi / Redmi / POCO (MIUI / HyperOS)
1. Ajustes → Apps → Administrar apps → [app] → **Inicio automático = ON**.
2. Mismo lugar → **Ahorro de batería → Sin restricciones**.
3. Mismo lugar → **Otros permisos**: activar *Mostrar ventanas emergentes en segundo plano*, *Mostrar en pantalla de bloqueo* e *Iniciar en segundo plano*.
4. Abre Recientes, mantén pulsada la tarjeta de Tasker → **candado** (bloquear en memoria).
5. App Seguridad → Batería → desactiva **Ahorro de batería** y la **optimización de apps en segundo plano** si existe.
6. HyperOS: Ajustes → Batería → ⚙ → desactivar **Limitar apps en segundo plano** para estas apps.

### Samsung (One UI)
1. Ajustes → Apps → [app] → Batería → **Sin restricciones**.
2. Ajustes → Mantenimiento del dispositivo (o Batería) → **Límites de uso en segundo plano**:
   - Desactiva **Poner en suspensión las apps no usadas**.
   - Quita las apps de *Apps en suspensión* y *Apps en suspensión profunda*.
   - Agrégalas a **Apps que nunca se suspenden**.
3. Ajustes → Batería → desactiva **Batería adaptable** si JARVIS se sigue cerrando.

### Huawei / Honor (EMUI / MagicOS)
1. Ajustes → Batería → **Inicio de aplicaciones** → [app] → **Gestionar manualmente** y activa las 3 opciones: *Inicio automático*, *Inicio secundario* y *Ejecutar en segundo plano*.
2. Ajustes → Batería → desactiva **Modo de ahorro de energía**.
3. Ajustes → Apps → [app] → Batería → **Permitir actividad en segundo plano** (Honor: *Sin restricciones*).
4. Abre Recientes y baja la tarjeta de Tasker para fijarla (candado).

## 7. Por ADB (una sola vez desde la PC)
Solo si quieres que JARVIS active/desactive **datos móviles**:
```
adb shell pm grant net.dinglisch.android.taskerm android.permission.WRITE_SECURE_SETTINGS
adb shell pm grant net.dinglisch.android.taskerm android.permission.READ_LOGS
adb shell pm grant net.dinglisch.android.taskerm android.permission.DUMP
```
Además necesitas *ADB WiFi* en Tasker (Preferencias → Varios → ADB Wifi) o root. Sin eso, la acción `datos` falla y queda registrada en el CSV como error.
