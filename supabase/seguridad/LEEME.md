# Verificar la seguridad de la base de producción

Archivo: `informe_seguridad_produccion.sql` (en esta carpeta). Es **solo lectura**: un único SELECT que no crea, cambia ni borra nada. Probado en Postgres 16 con una base de prueba que tenía errores puestos a propósito, y también dentro de una transacción de solo lectura.

## Parte 1: correr el informe (5 minutos)

1. Entra a supabase.com, abre el proyecto de **producción** y ve a **SQL Editor → New query**.
2. Abre `informe_seguridad_produccion.sql`, copia **todo** y pégalo.
3. Pulsa **Run**. Si encima del resultado aparece un selector de filas (por ejemplo "100 rows"), cámbialo a **No limit** y vuelve a pulsar Run.
4. Pulsa **Export → Download CSV** (o "Copy as markdown") y envíame el archivo o pega el texto en el hilo.

Si Supabase avisa "This query has destructive operations", no es así: el archivo no tiene ni un update ni un delete. Solo el texto de la columna `que_hacer` menciona comandos, como sugerencia.

## Cómo leer el resultado

Cada fila es un hallazgo, ordenado de lo más grave a lo menos grave:

| Severidad | Qué significa | Qué hacer |
|---|---|---|
| **CRITICO** | Alguien **sin iniciar sesión** (solo con la clave pública que va en la web) puede leer o cambiar datos, o un usuario puede volverse administrador. | Arreglar hoy. |
| **ALTO** | Cualquier usuario del ERP ve o cambia más de lo que su módulo permite, o falta una migración de seguridad. | Arreglar esta semana. |
| **MEDIO** | Hay que revisarlo: funciones que se pueden llamar sin sesión, usuarios raros o migraciones funcionales pendientes. | Revisar. |
| **BAJO / INFO** | Orden y limpieza (respaldos viejos, usuarios inactivos). | Cuando se pueda. |
| **OK** | Comprobado y está bien. | Nada. |

Las secciones que revisa:

1. Tablas sin RLS (sin candado por filas).
2. Tablas con RLS pero sin políticas (la app no las ve, a veces es a propósito).
3. Políticas permisivas: `USING (true)`, abiertas a `anon` o `public`. También revisa las políticas "permitir todo" que el Sprint 1 debía borrar y quién puede escribir en `perfiles` (escalada a admin).
4. Funciones SECURITY DEFINER sin `search_path` fijo.
5. Funciones SECURITY DEFINER que se pueden llamar sin sesión. Las del login (`login_bloqueo`, `login_fallido`, `email_de_login`) son esperadas.
6. `mi_rol()`: un usuario sin perfil debe ser `sin_rol` y nunca `creador`.
7. Vistas que se saltan el RLS (sin `security_invoker`).
8. Buckets de Storage públicos o sin límite de tamaño.
9. Roles de la base: `anon`/`authenticated` con BYPASSRLS, o roles con LOGIN que nadie reconoce.
10. Extensiones en el esquema `public`.
11. **Migraciones del repo**: por cada archivo de `supabase/migrations` dice si está **Aplicada**, **Parcial** o **NO aplicada**, y qué objetos faltan. Sirve también para la lista de SQL pendientes.
12. Usuarios y perfiles: roles que no existen o en mayúscula, quién tiene acceso total (`*`), usuarios sin perfil, correos de fuera de la empresa, usuarios anónimos y usuarios inactivos más de 90 días.
13. Que nadie pueda leer `login_intentos`.

**Importante:** no corras los comandos de `que_hacer` por tu cuenta. Por ejemplo, activar RLS en una tabla sin crear antes sus políticas deja esa pantalla del ERP vacía. Envíame el resultado y te preparo el SQL de arreglo con su vista previa y su respaldo.

## Parte 2: chequeos en el panel de Supabase (10 minutos)

Marca cada uno y avísame cuál falla:

1. **Advisors → Security Advisor**: pulsa "Rerun linter". Envíame captura de los avisos en rojo (ERROR) y amarillo (WARN).
2. **Authentication → Sign In / Providers**:
   - "Allow new users to sign up" debe estar **APAGADO**. Los usuarios los creas tú; si está prendido, cualquiera con la clave pública puede crearse una cuenta.
   - "Anonymous sign-ins" debe estar **APAGADO**.
   - "Confirm email" puede quedar como está, porque los correos @comboyvid.local no reciben mensajes.
3. **Authentication → Rate limits**: deja los valores por defecto o más bajos. El ERP ya bloquea 5 intentos durante 15 minutos.
4. **Authentication → Password security** (si aparece): mínimo 8 caracteres. Activa "Leaked password protection" si tu plan lo ofrece.
5. **Project Settings → API Keys**:
   - La clave **service_role / secret** no debe estar en Vercel con nombre `NEXT_PUBLIC_...`, ni en la app de PC o la APK.
   - Si alguna vez la pegaste en un chat, un correo o un archivo compartido, pulsa **Roll / Regenerate** y actualízala solo en tu PC (`.env.local`) y en los Secrets de las Edge Functions.
6. **Vercel → proyecto sistemacomboy → Settings → Environment Variables**: deben estar **solo** `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o la anon key). Si ves `SUPABASE_SERVICE_ROLE_KEY` o algún `sb_secret_...`, bórralo: el ERP web no lo usa.
7. **Edge Functions → Secrets**: aquí sí deben estar los tokens (Nubefact, Decolecta y SUNAT). Revisa que no haya secretos duplicados o viejos que ya no uses.
8. **Database → Backups**: confirma que hay respaldos diarios recientes. Antes de cualquier arreglo grande conviene tener uno del día.
9. **Storage**: cada bucket (tesoreria, cotizaciones, guias, chat-adjuntos, gestion-documental) debe decir **Private**, sin el candado abierto de "Public".

## Ya revisado en el código (sin necesidad de tu acción)

- El código del ERP web solo usa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. La clave service_role aparece solo en las Edge Functions (la pone Supabase) y en scripts que corren en tu PC.
- En todo el historial de Git del repo no hay ninguna clave pegada (ni JWT `eyJ...` ni `sb_secret_...`).
- La app de PC abre la web de Vercel y no lleva claves dentro.

## Resultado del 2026-11-23 y arreglos

Informe corrido por Williams el 2026-11-23: **0 CRITICO**. Arreglos en `20261228_arreglos_seguridad.sql` (solo permisos, en una transacción) y para deshacerlos `20261228_arreglos_seguridad_rollback.sql`. Ambos probados en Postgres 16.
