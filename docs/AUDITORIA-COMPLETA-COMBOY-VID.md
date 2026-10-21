# Auditoría completa · ERP COMBOY VID

Fecha: 2026-10-21 · Alcance: código en `app/`, `components/`, `lib/`, `supabase/` (commit `370e2b2`) y base de datos Supabase `wfhoczkoixmobxbwrfva` (solo lectura).
No se modificó código ni base de datos. No se hizo drop, delete ni rename.

> **Cómo se verificó.** `npx supabase status` no corre en esta PC (pide Docker; el proyecto sí está enlazado a `wfhoczkoixmobxbwrfva`). Las tablas, RLS, policies, grants, buckets y funciones se leyeron directo de Postgres (`pg_policies`, `pg_class`, `information_schema`, `storage.buckets`, `pg_proc`). Lo marcado como **[verificado]** se comprobó en la BD o en el código; lo marcado como **[inferido]** es una estimación.

---

## 1. Resumen ejecutivo: Top 10 problemas críticos

| # | Problema | Impacto | Evidencia |
|---|----------|---------|-----------|
| 1 | **`mi_rol()` devuelve `'creador'` cuando el token no trae el claim `rol`.** Todas las validaciones de rol en la BD (`cerrar_planilla`, `siguiente_numero`, policies `*_escribir`) quedan anuladas si no hay un Auth Hook que agregue ese claim. | Cualquier usuario, incluso anónimo, pasa como creador en el servidor. | `select coalesce(auth.jwt()->>'rol','creador')` **[verificado]**. No hay función hook en `public` **[verificado]**; confirmar en Dashboard › Auth › Hooks. |
| 2 | **Policies "permitir todo" (`using=true`, rol `public`) conviven con las policies buenas.** En Postgres las policies permisivas se suman con OR, así que las restrictivas no sirven. | Planilla, historial, ventas, almacén, condiciones de pago y asistencia se pueden leer y **escribir** sin restricción. | `planilla`: "permitir todo select/insert/update [public]"; `planilla_historial(_detalle)`: "permitir todo [ALL public]"; `ventas`, `almacen` ("Allow all"), `movimientos_almacen`, `gastos`, `condiciones_pago`, `asistencia_creador` **[verificado]**. |
| 3 | **El rol `anon` (la llave pública del navegador) tiene SELECT/INSERT/UPDATE/DELETE/TRUNCATE sobre `planilla`, `ventas`, `adelantos`, `asistencia_creador`, `contadores`, `gastos`, etc.** Junto con el #2, cualquiera con la URL del proyecto puede leer sueldos y DNIs, o borrarlos. | Exposición de datos personales y pérdida de datos. | `information_schema.role_table_grants` grantee=`anon` **[verificado]**. |
| 4 | **Escalada de privilegios en `perfiles`:** policy `perfiles_all_auth [ALL public] using=true check=true` y `authenticated` con UPDATE. Un usuario puede editar su propia fila y ponerse `modulos = {*}` o `rol = creador`. | Toma total del ERP desde cualquier cuenta. | **[verificado]** |
| 5 | **Tablas sin RLS:** `adelantos` (tiene policy pero RLS apagado), `contadores`, `manual_ediciones_asistencia`. | Lectura y escritura libre. | `relrowsecurity=false` **[verificado]** |
| 6 | **Buckets de Storage públicos y sin límites:** `tesoreria`, `vouchers`, `bauchers` tienen `public=true`, sin límite de tamaño ni MIME, y policies de INSERT/UPDATE/DELETE para `public`. El código dice "bucket privado" y valida 5 MB/JPG/PNG/PDF **solo en el navegador**. | Cualquiera puede subir, reemplazar o borrar bauchers. | `storage.buckets`, `lib/storage.ts:958-966` **[verificado]** |
| 7 | **Carga completa de todo el ERP al iniciar sesión:** `iniciarDatos()` descarga *todas* las claves (compras, almacén con 940 filas, ventas, planilla, contable…) sin importar el módulo del usuario, y cada cambio Realtime vuelve a descargar la clave entera. | Login a dashboard más lento; tráfico innecesario en cada cambio de otra PC. | `lib/storage.ts:373-470` **[verificado]**, tiempo **[inferido]** |
| 8 | **Bauchers guardados como base64 dentro de las filas** (`compras.voucher_data_url`, `readAsDataURL` en 5 lugares). Cada recarga de compras arrastra los archivos. | `compras` pesa 1 MB para 129 filas; crece con cada baucher. | `pg_total_relation_size`, `FormGasto.tsx:94`, `compras/page.tsx:1569`, `despacho.tsx:265` **[verificado]** |
| 9 | **Cálculo de AFP/ONP simplificado:** todas las AFP y la ONP usan 10%. ONP real es 13%; AFP real es aporte 10% + prima de seguro + comisión. **No existe cálculo de CTS, gratificación, vacaciones ni EsSalud.** | Boletas con descuentos legales incorrectos. | `lib/storage.ts:1437-1444` **[verificado]**; búsqueda de "cts/gratificación/essalud" sin resultados **[verificado]** |
| 10 | **Módulo Logística sin página propia y módulos fuera del menú:** `/dashboard/logistica` no existe (Logística = `almacen?tab=despacho`). Producción, Planilla y Creador no están en el BottomNav. | Usuarios no encuentran módulos; más clics. | Rutas del build y `components/layout/BottomNav.tsx` **[verificado]** |

---

## 2. Base de datos (estado actual)

### Conteos (verificación pedida)

| Tabla | Filas | Esperado | OK |
|-------|-------|----------|----|
| planilla | 84 | 84 | ✅ |
| planilla_historial | 7 | 7 | ✅ |
| planilla_historial_detalle | 25 | 25 | ✅ |

Otras tablas: compras 129 · almacen 940 · ventas 26 · contable 32 · adelantos 6 · perfiles 5 · gastos 0 · movimientos_almacen 0.

**Modelo de datos:** casi todo vive en columnas `data jsonb` con un discriminador `tipo`. Por ejemplo, `planilla` mezcla trabajador (16), asistencia (38), boleta (20), liquidación (6), lista_semana (2), contratista (1) y huella_alias (1). Las columnas sueltas (`dni`, `nombre`, `sueldo`, `periodo`) están vacías. Eso impide policies por columna, índices útiles y reportes SQL directos.

### RLS por tabla

| Tabla | RLS | Policies efectivas | Riesgo |
|-------|-----|--------------------|--------|
| adelantos | ❌ apagado | "adelantos todo" (no aplica) | 🔴 Crítico |
| contadores | ❌ | ninguna | 🔴 |
| manual_ediciones_asistencia | ❌ | ninguna | 🔴 |
| planilla | ✅ | "permitir todo" select/insert/update a `public` anula `planilla_select` | 🔴 |
| planilla_historial / _detalle | ✅ | "permitir todo [ALL public]" | 🔴 |
| ventas | ✅ | "permitir todo [ALL public]" | 🔴 |
| almacen | ✅ | "Allow all [ALL public]" anula `almacen_select/escribir` | 🔴 |
| movimientos_almacen, gastos, condiciones_pago, asistencia_creador | ✅ | todo `true` | 🟠 |
| perfiles | ✅ | `perfiles_all_auth` ALL true | 🔴 escalada |
| compras | ✅ | `compras_select` por `puede_ver`, escribir por `mi_rol()` | 🟠 (depende del #1) |
| contable, cajas, observaciones | ✅ | por rol | 🟠 (depende del #1) |
| user_preferences | ✅ | por `auth.uid()` | 🟢 correcto |

Índices: solo PK y `(tipo, id)`. No hay índices en campos `data->>'periodo'`, `data->>'trabajador'` ni fechas **[verificado]**. Con el volumen actual no duele; con miles de filas, sí.

---

## 3. Inventario de módulos

| Ruta | Archivo principal | Pestañas |
|------|-------------------|----------|
| `/login`, `/login/[modulo]` | `app/login/page.tsx` | Dock de 5 módulos + formulario |
| `/seleccionar-modulo` | `app/seleccionar-modulo/page.tsx` | 5 tarjetas (duplica al dock del login) |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Resumen |
| `/dashboard/ventas` | `ventas/*.tsx` (6 archivos) | Notas de pedido, Comprobantes, Despachos, Clientes, Cuentas por cobrar, Configuración |
| `/dashboard/contable` | `contable/page.tsx` | Libro Diario, Mayor, Balance, EEFF |
| `/dashboard/compras` (Tesorería) | `compras/page.tsx` (1700 líneas) + `components/tesoreria/PlanillaExistente.tsx` (1127) | Registrar gasto, Antecedentes, Cotizaciones, OC, Facturas, **Planilla** |
| `/dashboard/planilla` | redirige a `compras?tab=planilla` | — |
| `/dashboard/planilla/adelantos`, `/historial/[id]` | páginas propias | — |
| `/dashboard/produccion` | `produccion/page.tsx` | OP + QC (modales) |
| `/dashboard/almacen` | `almacen/page.tsx`, `despacho.tsx` | Nuevo REQ, REQs emitidos, Ingresos, Stock, Despacho |
| `/dashboard/logistica` | **no existe** | — |
| `/dashboard/creador` | `creador/page.tsx` | Asistencia manual |
| `POST /api/almacen/retiro-produccion` | route handler | valida sesión + RPC |

---

## 4. Informe por módulo

| Módulo | Esperada vs Real | Fallas / Bugs | Puntos ciegos | Seguridad | Redundancias | Tiempo perdido [inferido] | Recomendación |
|---|---|---|---|---|---|---|---|
| **A) Ventas** | NP → aprobación → OD → comprobante → cobro: **completo en flujo interno**. | Comprobantes quedan `NO_ENVIADO` a SUNAT. | Sin facturación electrónica (OSE/PSE), sin notas de crédito/débito, sin cotización previa a NP, sin lista de precios, sin reporte de ventas por vendedor/cliente/mes. | Tabla `ventas` con "permitir todo" + `anon` con todos los permisos: clientes y montos públicos. | Emitir en el ERP y luego emitir otra vez en el portal SUNAT o el PSE (doble digitación). | ~3-5 min por comprobante emitido dos veces. | Integrar un PSE (Nubefact/Efact) en Sprint 2-3. Cerrar RLS de `ventas` en Sprint 1. |
| **B) Contable** | Diario, Mayor, Balance, EEFF con filtro año/mes y cierre de periodo. Asientos automáticos desde OC y planilla. | — | Sin PLE/SIRE (libros electrónicos SUNAT), sin plan contable editable, sin conciliación bancaria, sin centros de costo, sin export a Excel del diario. | Policies por rol, pero dependen de `mi_rol()` (#1). | Copiar a mano el diario a Excel o al PLE. | ~1-2 h por cierre mensual. | Export XLSX y PLE en Sprint 3. |
| **C) Tesorería / Compras** | REQ → cotización → OC → bancarización → factura, gastos directos y cajas: **completo**. | El comentario dice bucket privado, pero es público. `compras/page.tsx` tiene 1700 líneas en un solo archivo. | Sin flujo de caja proyectado, sin conciliación de bauchers contra extracto, sin aprobación por montos (umbral), sin reporte de cuentas por pagar con vencimientos. | Bauchers públicos (#6), base64 en filas (#8). | Revisar REQ: abrir "Ver" (modal) → cerrar → "Aceptar" (2-3 clics por REQ, sin aprobar en lote). | ~30 s × N REQs/día. | Aprobación múltiple con checkbox; mover bauchers a Storage privado con URL firmada. |
| **C1) Planilla (migrada)** | Maestro de trabajadores, planilla del periodo, cierre, historial, contratistas, adelantos, boletas PDF: **completo en operación semanal**. | AFP/ONP al 10% fijo (#9). Columnas sueltas vacías (todo en jsonb). | **CTS, gratificaciones, vacaciones, EsSalud (9%), renta de 5ta, liquidación de cese, PLAME/T-Registro**: no existen. | Planilla legible por cualquiera (#2 y #3). Debería verse solo en Tesorería: hoy la UI lo respeta, la BD no. | Importar el reloj (CSV) a mano cada semana; ajustar asistencia celda por celda. | ~20-40 min/semana en importación y revisión. | Sprint 1: RLS. Sprint 3: tasas reales AFP (aporte+prima+comisión por AFP) y ONP 13%, CTS/gratificación. |
| **C2) Bancarizaciones** | Registro de cuenta origen + baucher en la OC (`validarPagoOC`). | — | Sin cruce automático del baucher con el extracto; sin límite de bancarización por monto (S/ 2,000 / US$ 500). | Bucket público. | Subir el mismo baucher en OC y luego en factura. | ~1 min por OC. | Reusar el baucher de la OC al facturar. |
| **C3) Liquidaciones (`lib/liquidacion.ts`)** | Modos de liquidación, liquidación por día/hora, AFP y adelantos. **Única fuente: no hay duplicados** de cálculo de neto. | Los porcentajes vienen de `AFP_OPTIONS` en `lib/storage.ts`, no de `liquidacion.ts` (dos archivos para una regla). | Ver C1. | — | — | — | Mover `AFP_OPTIONS` a `lib/liquidacion.ts` o a una tabla de parámetros con vigencia. |
| **D) Producción** | Órdenes de producción + control de calidad (QC firmado) + retiro de repuestos vía API con RPC transaccional. | — | Sin costeo por OP (materiales + mano de obra), sin BOM / receta de equipo, sin planificación (fechas, capacidad). | API valida sesión, pero la RPC confía en `mi_rol()` (#1). | Crear OP y luego vale de retiro por cada repuesto. | ~2 min por repuesto. | BOM por modelo de equipo (PLUS 4000, ECO MINE…) para generar el vale completo en 1 clic. |
| **E) Logística** | **No existe como módulo.** Es la pestaña Despacho de Almacén. El login manda a `almacen?tab=despacho`. | `/dashboard/logistica` da 404 si alguien la escribe. | Sin guías de remisión electrónicas (la pestaña Guías está oculta), sin seguimiento de transporte, sin rutas/transportistas. | `movimientos_almacen` abierta a `anon`. | — | — | Crear `/dashboard/logistica` como alias o redirect, y un tablero de despachos. |
| **F) Sistema base** | Login por módulo, dashboard, permisos por `perfiles.modulos`, Realtime, buscador Ctrl+K, BottomNav. | `/seleccionar-modulo` y el dock del login duplican la elección de módulo. `mi_rol()` por defecto creador. | Sin 2FA, sin bitácora de auditoría (quién cambió qué), sin recuperación de contraseña en UI, sin multiempresa/sucursal. | **#1, #2, #3, #4, #5.** No hay `middleware.ts`: la protección de rutas es solo del lado del cliente. `soloLectura` se respeta solo en la UI. | Elegir módulo dos veces (selección + login). Carga completa al entrar (#7). | ~5-10 s por login [inferido]. | Ver roadmap. |

---

## 5. Checklist de auditoría

### 5.1 Seguridad

| Pregunta | Respuesta |
|----------|-----------|
| ¿Tablas sin RLS? | **Sí:** `adelantos`, `contadores`, `manual_ediciones_asistencia`. |
| ¿Policies faltantes o malas? | **Sí:** "permitir todo" en planilla, planilla_historial(_detalle), ventas, almacen, movimientos_almacen, gastos, condiciones_pago, asistencia_creador, perfiles. Anulan las policies buenas. |
| ¿Usuarios ven datos de otras áreas? | **Sí, a nivel BD.** La UI oculta Planilla a quien no la tiene, pero cualquier usuario (o `anon`) puede leer `planilla` con la API REST. Además todo usuario descarga al entrar todas las tablas que RLS le deja ver (hoy, casi todas). |
| ¿Filtros de empresa/sucursal? | **No existen.** No hay columna `empresa_id`/`sede_id` ni filtro en policies. `requerimientos.sede` es solo texto. |
| ¿Inputs sin validación? | Validación **solo en el cliente** (formularios y `validarVoucher`). La API `retiro-produccion` sí valida. No hay librería de esquemas (zod). |
| ¿SQL injection vía Supabase? | **Bajo riesgo:** todo pasa por el query builder y RPCs con parámetros. No hay SQL concatenado en el cliente. |
| ¿Storage sin validación? | **Sí:** buckets públicos sin `file_size_limit` ni `allowed_mime_types`; upload/update/delete abiertos a `public`. |
| Otros | `mi_rol()` por defecto `'creador'`. Sin `middleware.ts`. Llave de servicio **no** expuesta (solo `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) ✅. |

### 5.2 Procesos redundantes

| Pregunta | Respuesta |
|----------|-----------|
| ¿Doble clic donde debería ser uno? | Revisar REQ (Ver → cerrar → Aceptar). Elegir módulo dos veces (seleccionar-modulo + dock del login). Baucher subido en OC y otra vez en factura. |
| ¿`SELECT *` o `count()` repetidos? | `select("*")` en 7 lugares; `descargar()` trae todas las columnas de cada clave, incluidos los base64 de bauchers. |
| ¿Refetch innecesario? | **Sí:** cada evento Realtime vuelve a descargar la clave completa (`aplicarCambio` → `recargar`). Al reconectar, recarga todas las claves. |
| ¿Falta de caché/react-query? | Hay caché propia en memoria (`lib/storage.ts`) con `useStore`. No persiste entre recargas de página: F5 vuelve a descargar todo. |
| ¿Formularios largos? | Nueva OP y QC son modales grandes; Registrar gasto tiene muchos campos pero ya agrupados. No hay formulario de 10 pasos. |
| ¿Export/import manual? | Importar el reloj de asistencia (CSV) cada semana a mano; comprobantes a SUNAT a mano; libros contables a mano. |

### 5.3 Navegación y UX (medido sobre la UI actual)

| Recorrido | Clics |
|-----------|-------|
| Login → Planilla (usuario Planilla) | Seleccionar módulo (1) → Ingresar (2) → abre directo Planilla |
| Login → Planilla (usuario Tesorería) | **No puede:** su perfil tiene `/dashboard/compras` pero no `/dashboard/planilla`, así que no ve la pestaña. Si Planilla debe ser de Tesorería, hay que darle ese módulo. |
| Dashboard → Planilla (creador / gerencia) | BottomNav Tesorería (1) → pestaña Planilla (2) |
| Dashboard → Historial de planilla | Tesorería (1) → Planilla (2) → Historial (3) → abrir periodo (4) |
| Dashboard → Producción | No está en el BottomNav: Ctrl+K → escribir → Enter (3 acciones) |

- **Breadcrumbs:** sí, en el header (módulo › pestaña). **Botón volver:** solo en el detalle de historial.
- **Búsqueda:** buscador global Ctrl+K (REQ, OC, factura, guía). No busca trabajadores, clientes ni comprobantes de venta.
- **Tablas:** sin paginación en ningún listado (`Table` no pagina; solo `cobrar.tsx` corta a 100). Filtro por fecha en 15 pantallas; filtro por DNI/nombre solo en el maestro de trabajadores.
- **Modales:** usan `max-w-lg`/`max-w-4xl` con velo. Los de OP/QC y detalle de documento tapan toda la pantalla en móvil.
- **Carga > 2 s:** probable al entrar [inferido], por el #7 (≈20 consultas en paralelo, almacén con 940 filas, compras con base64). No se midió en el navegador.
- Las pantallas de carga y error del layout no usan el tema oscuro (fondo claro un instante).

### 5.4 Datos y lógica

| Pregunta | Respuesta |
|----------|-----------|
| ¿Conteos 84 / 7 / 25? | ✅ Correctos. |
| ¿AFP/ONP, neto y adelantos en `lib/liquidacion.ts`? | Sí, sin duplicados de cálculo. Los porcentajes están en `lib/storage.ts` (`AFP_OPTIONS`). |
| ¿CTS se calcula? | **No.** No existe en ningún archivo. |
| ¿Estados y validaciones de cierre? | `cerrar_planilla()` valida rol, periodo no vacío, periodo no cerrado antes y filas no negativas. **Falta:** reabrir periodo con permiso y motivo, bloqueo de edición de asistencia de un periodo cerrado en la BD, y estado "pagado" separado de "cerrado". Además la validación de rol depende de `mi_rol()` (#1). |

### 5.5 Lo que falta (gaps de ERP)

- **Ventas:** facturación electrónica SUNAT, notas de crédito/débito, cotizaciones, lista de precios, reportes de ventas.
- **Contable:** PLE/SIRE, plan de cuentas editable, conciliación bancaria, centros de costo, export Excel.
- **Tesorería:** flujo de caja, cuentas por pagar con vencimientos, aprobaciones por monto, conciliación de bauchers.
- **Planilla:** CTS, gratificación, vacaciones, EsSalud, renta 5ta, liquidación de cese, PLAME/T-Registro, tasas AFP reales.
- **Producción:** BOM por modelo, costeo por OP, planificación.
- **Logística:** módulo propio, guía de remisión electrónica, transportistas.
- **Sistema:** bitácora de auditoría, 2FA, multiempresa/sede, middleware de rutas, pruebas automáticas (no hay ningún test), backups verificados.

---

## 6. Matriz de prioridad

| Prioridad | Ítem | Horas [inferido] |
|-----------|------|------------------|
| 🔴 Crítico | Arreglar `mi_rol()` (leer rol desde `perfiles` con `auth.uid()`, sin valor por defecto) | 2 |
| 🔴 Crítico | Borrar policies "permitir todo"/"Allow all" y dejar las restrictivas (planilla, historial, ventas, almacen, etc.) | 4 |
| 🔴 Crítico | `revoke all on ... from anon` en tablas de negocio | 1 |
| 🔴 Crítico | `perfiles`: solo lectura de la fila propia; edición solo creador | 1 |
| 🔴 Crítico | Activar RLS en `adelantos`, `contadores`, `manual_ediciones_asistencia` con policies por rol | 2 |
| 🔴 Crítico | Buckets privados + límite 5 MB + MIME + policies por rol | 3 |
| 🟠 Alto | Carga por módulo (descargar solo lo que el usuario usa) y Realtime incremental (aplicar la fila del evento) | 10 |
| 🟠 Alto | Sacar base64 de `compras`/`almacen` a Storage | 6 |
| 🟠 Alto | Tasas AFP/ONP reales y parametrizables | 6 |
| 🟠 Alto | `middleware.ts` que valide sesión y módulo en el servidor | 4 |
| 🟡 Medio | CTS y gratificación | 16 |
| 🟡 Medio | Paginación y filtros (fecha, DNI, nombre) en `Table` | 8 |
| 🟡 Medio | Aprobación de REQ en lote | 4 |
| 🟡 Medio | Ruta `/dashboard/logistica` y Producción/Planilla en el menú ("Más") | 3 |
| 🟡 Medio | Bitácora de auditoría (trigger de cambios) | 8 |
| 🟢 Bajo | Unificar `/seleccionar-modulo` con el dock del login | 2 |
| 🟢 Bajo | Tema oscuro en pantallas de carga/error | 1 |
| 🟢 Bajo | Partir `compras/page.tsx` (1700 líneas) por pestaña | 6 |
| 🟢 Bajo | Export Excel del Libro Diario | 3 |

---

## 7. Roadmap en 3 sprints

### Sprint 1 · Seguridad (≈14 h)
1. Script de respaldo (`pg_dump` o export CSV de todas las tablas) antes de tocar policies.
2. Nueva `mi_rol()` basada en `perfiles` (sin `'creador'` por defecto).
3. Eliminar policies "permitir todo"; revisar que quedan `*_select` y `*_escribir` por módulo.
4. Revocar grants de `anon`; RLS en las 3 tablas sin RLS; `perfiles` cerrado.
5. Buckets privados con límites; leer bauchers con URL firmada.
6. Probar con cada usuario (almacen, planilla, tesoreria, gerencia, creador) que ve y edita solo lo suyo.

### Sprint 2 · Velocidad (≈24 h)
1. `iniciarDatos()` por módulo: descargar solo las claves de los módulos del usuario.
2. Realtime incremental: aplicar `payload.new`/`old` a la caché en vez de recargar todo.
3. Bauchers e imágenes fuera de `data jsonb`.
4. Seleccionar columnas necesarias en vez de `*`; índices en `data->>'periodo'` y fechas si crece el volumen.
5. Medir login → dashboard (objetivo < 2 s) y dejar el número en este documento.

### Sprint 3 · UX y procesos (≈40 h)
1. Menú "Más" con Producción, Planilla, Logística y Creador; ruta `/dashboard/logistica`.
2. Paginación y filtros en tablas; búsqueda de trabajadores, clientes y comprobantes en Ctrl+K.
3. Aprobación de REQ en lote; reusar baucher de OC en la factura.
4. Tasas AFP/ONP reales, CTS y gratificación.
5. Unificar la elección de módulo en el login.
6. Siguiente etapa (fuera de los 3 sprints): facturación electrónica SUNAT y PLE.
