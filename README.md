# ERP COMBOY VID — Módulo de Compras (Fase 2)

## Puesta en marcha (Supabase, una sola vez)
1. **Tablas:** Supabase → SQL Editor → pegar `supabase_tables.sql` → *Run*. Crea las tablas, las políticas RLS, la numeración y activa Realtime. Se puede ejecutar varias veces.
2. **Usuarios:** desde la raíz del proyecto, con `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (Supabase → Project Settings → API Keys → `service_role` / secret):
   ```bash
   npm install
   node --env-file=.env.local scripts/crear-usuarios.mjs
   ```
   Crea con la Admin API de Supabase los 5 usuarios `creador`, `tesoreria`, `almacen`, `planilla` y `gerencia` `@comboyvid.local`, con correo confirmado y contraseña **`123456`**. Si un usuario ya existe, lo **borra y lo vuelve a crear** (su id cambia).
   `--env-file` carga `.env.local` (Node 20.6 o superior). Alternativa: definir las dos variables en la terminal y correr `node scripts/crear-usuarios.mjs`.
3. **Perfiles:** Supabase → SQL Editor → pegar `supabase/perfiles.sql` → *Run*. Asigna rol y módulos a cada usuario con su id real (hay que volver a correrlo cada vez que se ejecute el paso 2). Debe listar 5 filas.

   ⛔ **Nunca crear usuarios con `INSERT` directo en `auth.users`**: Supabase Cloud no los reconoce en el login ("Usuario o contraseña incorrectos"). Usar siempre el script (Admin API) o Authentication → Users → *Add user*.

   ⚠ La service role key salta todas las políticas de seguridad: solo en `.env.local` de la PC del administrador, **nunca** con prefijo `NEXT_PUBLIC_` ni subida a git. Después de crear los usuarios se puede borrar de `.env.local`.

   ⚠ `123456` es la misma contraseña para los 5: cambiarla en Supabase → Authentication → Users antes de usar el ERP en producción.
4. **Datos anteriores:** entrar con `creador` en cada PC que tenía datos y pulsar **"Subir datos de este navegador"** (menú lateral). Se combinan por id, sin duplicar.

## Instalar y correr (en cada PC)
```bash
copy .env.example .env.local     # Windows (en Linux/Mac: cp)
npm install
npm run dev      # http://localhost:3000  → /login
npm run build    # verificación de producción
```

## Usuarios y acceso
Entrar en `/login` con el usuario (sin `@comboyvid.local`) y la contraseña `123456`. El login es de Supabase Auth; el rol y los módulos de cada usuario están en la tabla `perfiles`.

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

## Baucher de pago en la Orden de Compra
- Compras › Órdenes de compra › *Emitir orden de compra* → sección **COMPROBANTE DE PAGO Y ORIGEN**: cuenta de pago (CAJA GENERAL / CAJA CHICA / FONDO DE RESERVA, por defecto CAJA GENERAL) y baucher opcional (JPG, PNG o PDF, máx. 5 MB, un archivo).
- **Activar en Supabase:** SQL Editor → `supabase/fix_vouchers.sql` (o volver a correr `supabase_tables.sql`). Crea el bucket privado `tesoreria` (carpeta `vouchers/`) en Storage y sus permisos.
- Se guarda en el documento de la OC (`compras`, tipo `orden`): `cuentaOrigenPago` (`caja_general` / `caja_chica` / `fondo_reserva`), `voucherUrl` (ruta `vouchers/<id>.<ext>` en el bucket), `voucherMonto`.
- Solo tesorería y creador emiten OC y suben bauchers; los demás perfiles con acceso ven el formulario deshabilitado y abren el baucher en modo lectura (enlace temporal de 5 min).

## Condiciones de pago (Ventas)
- **Activar en Supabase:** SQL Editor → `supabase/condiciones_pago.sql` (o volver a correr `supabase_tables.sql`). Crea `public.condiciones_pago` con Efectivo, Transferencia bancaria, Depósito, Yape, Plin, Tarjeta, Crédito 7/15/30/45/60 días y Personalizado; copia las condiciones que ya existían (mismo id).
- Nota de pedido: guarda el **id** de la condición. Crédito pide días (propone los de la condición) y calcula la **fecha de vencimiento**; Personalizado pide días y un detalle libre. Al facturar se usan esos días.
- **Clientes y notas en `public.ventas`** (no hay tabla `clientes`): `supabase/ventas_columnas.sql` agrega y llena por trigger `numero_np` (único), `ruc`, `cliente_nombre`, `condicion_pago_id`, `condicion_pago_nombre`, `dias_credito` y `fecha_vencimiento`, y crea el índice único (tipo, id). Si falta ese índice, el ERP igual guarda (actualiza o inserta fila por fila).
- Nuevas condiciones: Ventas › **Configuración**, o el botón **+** junto al select de la nota de pedido. Las editan creador y tesorería.

## Planilla (rediseño)
- **Trabajadores:** botón **Ficha** por trabajador (datos laborales con sede y edad automática, datos personales y contacto de emergencia). Desde la ficha: Guardar, **Dar de baja** (fecha + motivo), Reactivar, **Eliminar definitivo** (confirmación + escribir el N° de huella) y **Ver historial de pagos**. "Mostrar inactivos" los muestra en gris con badge rojo.
- **Duplicados del reloj** (mismo DNI o mismo nombre con número al final, ej. "LIZBETH CAHUANA 1"): aviso con **Eliminar duplicado y unir huella**; las próximas importaciones suman esa huella al trabajador original (`KEYS.HUELLAS_ALIAS`).
- **Planilla del periodo:** modo **DÍAS / HORAS / DÍAS + HORAS EXTRA** por periodo, jornada (8 h por defecto) y recargo de horas extra. Sueldo diario = mensual / 30 (diario: el mismo); hora = diario / jornada. Botones −1/+1 día, −1/+1 hora, +jornada, +media jornada. Son ajustes de la planilla (`KEYS.LIQUIDACIONES`): lo del reloj 🔒 no cambia y cada fila puede volver al reloj.
- **Contratistas:** concesiones / servicios externos (asesoría, trámites, construcción, equipos, sistemas, servicios básicos) con comprobantes RH/factura, pagos, liquidar saldo, anular, contrato PDF y filtros por servicio, sede y estado (`KEYS.CONTRATISTAS`).
- Todo se guarda en la tabla `planilla` de Supabase (no requiere SQL nuevo); los trabajadores existentes no cambian: los campos nuevos son opcionales.

## Adelantos (Planilla › Adelantos)
- **Activar en Supabase:** SQL Editor → `supabase/adelantos.sql` (o volver a correr `supabase_tables.sql`). Crea `public.adelantos` (id, trabajador_nombre, dni, fecha, monto, motivo, estado PENDIENTE / DESCONTADO / ANULADO) con RLS y Realtime.
- `/dashboard/planilla/adelantos` (botón **Adelantos** en Planilla): formulario arriba y tabla abajo; **Editar** carga el adelanto en el formulario para actualizarlo, y se puede eliminar. CRUD en `lib/adelantos.ts`.
- Editan planilla y creador; gerencia solo ve.
- **Descuento en planilla:** Planilla del periodo muestra *Adelantos pendientes* y *Total a pagar (con descuento)* = neto − adelantos (`obtenerAdelantosPendientesPorTrabajador` en `lib/adelantos.ts`; cruce por DNI o nombre). Se descuentan del más antiguo al más reciente mientras quepan en el neto; el resto queda pendiente.
- **Pagar planilla** (cierra la semana): guarda la planilla en el historial con adelantos y total a pagar, y en la misma transacción pasa esos adelantos a DESCONTADO con su `planilla_id`. Un adelanto DESCONTADO ya no se edita ni se elimina (también lo bloquea la base). Volver a correr `supabase/adelantos.sql` y `supabase/historial_planilla.sql`.

## Historial de planilla
- **Activar en Supabase:** SQL Editor → `supabase/historial_planilla.sql` (o volver a correr `supabase_tables.sql`). Crea `planilla_historial`, `planilla_historial_detalle`, la función `cerrar_planilla()` y su Realtime.
- Planilla › *Planilla del periodo* → **Cerrar semana y guardar en historial**: guarda una copia (no una referencia) de lo que se ve en pantalla, cabecera + detalle en una sola transacción. Un periodo se cierra una sola vez; el historial no se puede editar ni borrar.
- Planilla › **Historial**: carpetas por mes con los periodos cerrados; cada uno abre `/dashboard/planilla/historial/[id]` (solo lectura, con PDF). Se actualiza en vivo en todas las PCs y celulares.
- Cierran: planilla y creador. Ven: quienes tienen el módulo Planilla (incluida gerencia).

## Ventas (COMBOY VID · RUC 20613238566)
Flujo: **Nota de pedido → Aprobada → Factura / Boleta → Orden de despacho (Almacén) → Cobro**.

- **Activar en Supabase:** SQL Editor → `supabase/fix_ventas.sql` (o volver a correr `supabase_tables.sql`). Crea/adapta la tabla `ventas`, permisos, numeración NP / F001 / B001 / OD, Realtime, 8 condiciones de pago iniciales y da a tesorería el módulo Ventas. Mientras no se ejecute, Ventas aparece vacío y el resto del ERP funciona normal.
- `/dashboard/ventas`: Notas de pedido · Comprobantes · Condiciones de pago · Clientes · Cuentas por cobrar.
- `/dashboard/almacen` → pestaña **Órdenes de despacho** (también en `/dashboard/almacen/despacho`).
- Al **emitir** un comprobante: número F001/B001 atómico, asiento contable (1212 / 40111 / 70121), orden de despacho PENDIENTE y cobro (contado) o saldo en Cuentas por Cobrar (crédito).
- Al **despachar**: se elige la sede, se valida y descuenta stock (m² para vidrio con medidas; los servicios no mueven stock) y el comprobante pasa a ENTREGADO.
- Permisos: creador y tesorería gestionan ventas y cobros; almacén despacha; gerencia solo ve.
- Datos: documentos JSON en `public.ventas` (tipo `cliente`, `condicion_pago`, `nota_pedido`, `comprobante`, `cobro`, `asiento`) y `public.almacen` (tipo `despacho`).
- ⚠ **SUNAT:** los comprobantes quedan con estado SUNAT "NO ENVIADO" (falta integrar un OSE/PSE). El autocompletado de RUC/DNI tampoco está conectado: los datos del cliente se ingresan a mano.
- ⚠ Reemplazar en `lib/empresa.ts` la dirección, teléfono, email y la cuenta BCP / CCI (hoy son de ejemplo).

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
