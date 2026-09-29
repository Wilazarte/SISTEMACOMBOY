# ERP COMBOY VID — Módulo de Compras (Fase 2)

## Puesta en marcha (Supabase, una sola vez)
1. **Tablas:** Supabase → SQL Editor → pegar `supabase_tables.sql` → *Run*. Crea las tablas, las políticas RLS, la numeración y activa Realtime. Se puede ejecutar varias veces.
2. **Usuarios y perfiles:** desde la raíz del proyecto:
   ```bash
   npm install                  # si aún no se instaló
   node setup_usuarios.js
   ```
   Crea en Supabase Auth (si no existen) `creador`, `tesoreria`, `almacen`, `planilla` y `gerencia` `@comboyvid.local`, con email confirmado y contraseña inicial **`Comboy2024*`**, y crea/actualiza sus perfiles en `public.perfiles`. Si un usuario ya existe, no cambia su contraseña. Se puede ejecutar varias veces.

   Necesita la **service role key** en `.env.local` (Supabase → Project Settings → API Keys → `service_role` / secret):
   ```
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   ⚠ Esa clave salta todas las políticas de seguridad: solo en `.env.local` de la PC del administrador, **nunca** con prefijo `NEXT_PUBLIC_` ni subida a git. Después de crear los usuarios se puede borrar de `.env.local`.

   ⚠ La contraseña inicial es la misma para los 5 usuarios: cámbiela en Supabase → Authentication → Users → usuario → *Update user* antes de usar el ERP en serio. (Para otra contraseña inicial: `SETUP_PASSWORD=MiClave node setup_usuarios.js`.)

   *Alternativa manual:* crear los 5 usuarios en Authentication → Users → *Add user* (marcar **Auto Confirm User**) y volver a ejecutar `supabase_tables.sql`, que genera los perfiles.
3. **Datos anteriores:** entrar con `creador` en cada PC que tenía datos y pulsar **"Subir datos de este navegador"** (menú lateral). Se combinan por id, sin duplicar.

## Instalar y correr (en cada PC)
```bash
copy .env.example .env.local     # Windows (en Linux/Mac: cp)
npm install
npm run dev      # http://localhost:3000  → /login
npm run build    # verificación de producción
```

## Usuarios y acceso
Entrar en `/login` con el usuario (sin `@comboyvid.local`). El login es de Supabase Auth; el rol y los módulos de cada usuario están en la tabla `perfiles`.

| Usuario | Módulos | Permisos |
|---|---|---|
| creador | todos | ver y editar todo |
| tesoreria | /dashboard/compras, /dashboard/tesoreria | ver y editar |
| almacen | /dashboard/almacen | ver y editar |
| planilla | /dashboard/planilla | ver y editar |
| gerencia | todos | solo lectura + observaciones por módulo |

Los mismos permisos se aplican en la base de datos con RLS (`supabase_tables.sql`): aunque alguien use la API directamente, gerencia no puede escribir, almacén no ve planilla, etc.
Para cambiar una contraseña: Supabase → Authentication → Users → usuario → *Reset password* / *Update user*.

## Datos y tiempo real
- Tablas: `compras` (REQ, cotizaciones, OC, facturas, guías, proveedores, compras directas, numeración), `almacen` (stock), `planilla` (trabajadores), `observaciones`, `perfiles`. Cada documento se guarda como `jsonb` en `data`.
- `lib/storage.ts` mantiene una caché en memoria: al guardar, la pantalla cambia al instante y se envían a Supabase solo las filas modificadas (upsert/delete). Si Supabase rechaza el cambio, se muestra el error y se vuelve a lo que hay en el servidor.
- Realtime (`supabase.channel("erp-cambios")`): lo que hace una PC aparece en las otras sin recargar. Al reconectarse tras un corte, se recarga todo.
- Numeración (REQ, OC, DJ): la asigna la función `siguiente_numero(serie)` en Supabase, que bloquea el contador mientras lo incrementa; dos PCs emitiendo a la vez nunca reciben el mismo número. El contador no se puede escribir directo (RLS). El número que muestra el formulario antes de guardar es referencial.

## Rutas
- `/dashboard/almacen`  → Nuevo REQ · Lista de REQ emitidos · Ingresos por V°B° · Stock
- `/dashboard/compras`  → Registrar compra (factura/boleta → stock) · Notificaciones · Antecedentes · Cotizaciones · OC · Facturas/DJ · Guías
- `/dashboard/planilla` → Maestro de trabajadores (fecha de ingreso, tipo de sueldo, AFP/ONP) · Planilla del periodo con asistencia del reloj

## Estructura
```
app/login/page.tsx                      login
app/(dashboard)/layout.tsx              sesión, menú filtrado por usuario, acceso denegado, modo solo lectura
components/ObservacionesGerencia.tsx    observaciones de gerencia por módulo (tabla observaciones)
lib/auth.ts                             login Supabase Auth, perfiles y permisos por módulo
lib/supabase/client.ts · server.ts      clientes de Supabase (navegador / servidor)
lib/migracion.ts                        sube a Supabase los datos antiguos del navegador
supabase_tables.sql                     tablas, RLS, Realtime y perfiles
app/(dashboard)/dashboard/compras/page.tsx
app/(dashboard)/dashboard/almacen/page.tsx
components/ui.tsx                       Button, Card, Badge, Tabs, Modal, Table, Timeline, Toaster
components/doc-viewer.tsx               visor de documento + historial (timeline)
lib/storage.ts                          TODA la lógica de negocio + sincronización con Supabase y Realtime
lib/pdf.ts                              PDFs jsPDF (REQ, Cotización, OC, Factura/DJ, Acta de ingreso)
lib/empresa.ts                          ← RUC, dirección, logo base64, sedes, unidades
lib/types.ts
```

## Reglas implementadas
- ACEPTAR → sale de notificaciones y queda en la lista como ACEPTADO.
- RECHAZAR → se borra de todo el sistema (notificación y lista).
- OBSERVAR → Almacén corrige y reenvía (vuelve a notificaciones).
- Cotización solo sobre REQ ACEPTADO/COTIZADO · OC solo desde cotización · 1 OC por REQ.
- Factura solo desde OC · IGV 18 % automático · alerta si difiere de la OC.
- Guía obligatoria para factura (PDF/imagen ≤ 1.5 MB, drag & drop, vista previa).
- Declaración Jurada: solo GERENCIA, tope TOPE_DJ (S/ 700, editable en lib/storage.ts), no requiere guía.
- FINALIZADO solo con V°B° de Almacén (check por producto + recibido por). El V°B° suma las cantidades de la OC al stock de la sede del REQ.
- Registrar compra: proveedor (con RUC validado), fecha DD/MM/AAAA, N° factura/boleta, productos con cantidad y precio unitario; subtotal, IGV 18 % y total automáticos (factura: precio sin IGV + 18 %; boleta: precio con IGV incluido, base = total ÷ 1.18). Al guardar suma las cantidades al stock de la sede (mismo producto + unidad) y guarda el último costo.
