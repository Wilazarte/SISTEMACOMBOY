# Sincronización entre equipos (Fase 3)

Objetivo: 5 PCs y 3 celulares trabajando a la vez sin pisarse, con o sin señal.

| Pedido | Dónde está |
|---|---|
| Realtime "erp_changes" (< 2 s) | `lib/storage.ts → iniciarDatos()`: canal `erp_changes` sobre compras (OC, facturas, guías), almacen (kardex, stock), planilla, ventas, observaciones, contable. Cada cambio de otro equipo se aplica en pantalla sin recargar. |
| Bloqueo por N° de serie | Tabla `locks` + `tomar_bloqueo()` con `SELECT … FOR UPDATE` (SQL `20261114_bloqueos_avisos.sql`). `lib/bloqueos.ts → useBloqueoSerie(serie)`. Ya activo en "Editar OC": si otro la edita sale "🔒 En edición por Logística desde 10:32" y Guardar queda deshabilitado hasta que la suelte. Caduca a los 10 min. |
| Cola sync_queue, worker 30 s, 3 reintentos | `lib/offline/cola.ts` + `hooks/useSync.ts` (Fase 1). |
| Last-write-wins sin borrar + conflictos | `lib/offline/cola.ts` + tabla `conflictos`. SOPORTE los resuelve en INICIO SOPORTE → "Conflictos de sincronización" (`/soporte/conflictos`): Mantener o Restaurar la otra versión. Un borrado en conflicto nunca se aplica. |
| Aviso de observaciones de Gerencia | Edge Function `supabase/functions/notificar-observacion`: correo (Resend) y WhatsApp (Meta Cloud API) a los usuarios del módulo observado. |

Sin señal no se puede pedir el bloqueo: el equipo edita igual y, si otro cambió lo mismo, la cola lo
detecta al subir y lo deja en `conflictos`.

## Pasos para Williams

1. Supabase → SQL Editor: correr `20261114_bloqueos_avisos.sql` (después de `20261112_offline_sync.sql`).
2. Edge Function de avisos:
   ```bash
   supabase functions deploy notificar-observacion --no-verify-jwt
   supabase secrets set WEBHOOK_SECRET=<una clave larga>
   supabase secrets set RESEND_API_KEY=<clave de resend.com> AVISOS_FROM="ERP COMBOY VID <avisos@comboyvid.com>"
   supabase secrets set WHATSAPP_TOKEN=<token de Meta> WHATSAPP_PHONE_ID=<id del número> WHATSAPP_TEMPLATE=<plantilla aprobada>
   ```
   (o desde el panel: Edge Functions → Deploy new function, pegando el archivo).
3. Supabase → Database → Webhooks → Create: tabla `observaciones`, evento INSERT, tipo "Supabase Edge
   Function" → `notificar-observacion`, cabecera `x-webhook-secret` = el mismo WEBHOOK_SECRET.
4. En `perfiles`, llenar `email` (correo real) y `telefono_whatsapp` (ej. 51987654321) de cada usuario.

WhatsApp: Meta solo deja mandar texto libre si la persona escribió al número en las últimas 24 h. Para
avisos en cualquier momento cree una plantilla (Business Manager → WhatsApp → Plantillas) con 3 variables:
módulo, autor y texto, y ponga su nombre en WHATSAPP_TEMPLATE.
