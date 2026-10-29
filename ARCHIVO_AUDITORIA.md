# ARCHIVO_AUDITORIA · Fase 0 · ERP COMBOY VID

Fecha: 2026-10-28 · Base: `main` en `056a9f4` (después del PR #37) · Estado: **ESPERANDO "APROBADO"** para borrar.

En esta fase **no se borró ni cambió nada**. Este archivo es el único cambio del PR.

## 1. Cómo se auditó

- Se recorrieron los 139 archivos `.ts/.tsx` de `app/`, `components/`, `lib/`, `hooks/` y la raíz (`desktop/` aparte: es la app Electron y se mantiene).
- Grafo de imports: se partió de cada `page`, `layout` y `route` de Next.js y se siguió cada import. Lo que no se alcanza desde ninguna ruta es código muerto.
- `tsc --noEmit` (sin errores) y `tsc --noUnusedLocals` (22 imports/variables sin uso).
- Búsqueda de exports que ningún otro archivo usa, `console.*`, TODO/FIXME, dependencias de `package.json` sin uso y secretos en el repo.
- Se cruzó con la auditoría previa `docs/AUDITORIA-COMPLETA-COMBOY-VID.md` (2026-10-21).

## 2. Resultado en una línea

El código está **sano**: compila sin errores, no tiene TODOs viejos, casi no tiene `console.log` (3) y solo **2 archivos completos están muertos**. La basura real es poca; el trabajo grande está en **partir 5 archivos gigantes** y en **seguridad** (protección de rutas en servidor y contraseñas en scripts).

| Métrica | Antes | Después (si se aprueba) |
|---|---:|---:|
| Archivos .ts/.tsx | 139 | 137 |
| Archivos sin uso | 2 | 0 |
| Imports/variables sin uso | 22 | 0 |
| Funciones exportadas que nadie llama | 13 | 0 |
| `console.info` de depuración | 3 | 0 (se deja 1 si se quiere medir la carga) |
| Dependencias sin uso | 1 (`dotenv`) | 0 |
| Archivos > 1.000 líneas | 5 | 5 (se parten en Fase 1, sin cambiar pantallas) |
| Errores de TypeScript | 0 | 0 |

## 3. ¿Qué es realmente cada módulo? (respuesta a tu pregunta)

| Módulo visible | Ruta | Qué hace hoy en el código | Equivalente SAP | Comentario |
|---|---|---|---|---|
| **Ventas** | `/dashboard/ventas` | Notas de pedido (con costeo), comprobantes (factura/boleta/notas), despachos (OD), clientes, cuentas por cobrar, catálogo de productos, condiciones de pago, bandeja "Requerimientos de Secocha" | **SD** (+ parte de FI-AR) | Ya tiene el flujo Pedido → Factura → Entrega. Falta Cotización formal, lista de precios por cliente y alquiler. |
| **Almacén / Logística** | `/dashboard/almacen` | Requerimientos, ingresos, stock por sede, kardex, órdenes de despacho, equipos terminados con trazabilidad por chasis | **MM-IM / WM** | Es el corazón logístico. "Logística" no tiene página propia: es Almacén. |
| **Tesorería / Compras** | `/dashboard/compras` | Gasto/compra, cotizaciones, OC y OS, facturas de proveedor, 3 cajas Arequipa, DJ, **Planilla** | **MM-PUR + TR + HCM** | Mezcla compras y tesorería en un archivo de 2.190 líneas. |
| **Contable** | `/dashboard/contable` | Libro diario, mayor, balance, EEFF, estados de cuenta, asientos automáticos (PCGE) | **FI** | No hay CO (centros de costo) todavía. |
| **Producción** | `/dashboard/produccion` | Órdenes de producción de equipos; el QC firmado ingresa el equipo terminado a Almacén; retiro de material con Vale de Producción (VPI) | **PP + QM** (de taller) | Sí es **Taller**: arma/prepara equipos y les hace control de calidad. Es la base natural para Órdenes de Trabajo (PM/CS). |
| **Secocha** | `/secocha` | **Sucursal real** en Secocha: venta, entrega, caja chica, stock local, traslados, requerimientos y derivación de ventas a Arequipa. Usuario propio y datos aislados por sede (RLS) | **SD + WM de sucursal** | **No es control de calidad.** Ver alerta 3.1. |
| Planilla | pestaña de Tesorería | Trabajadores, asistencia por reloj, liquidación, boletas, contratistas, adelantos | **HCM** | |
| Creador | `/dashboard/creador` | Administración (usuarios, permisos) | Basis | |

### 3.1 Secocha (decidido por Williams, 2026-10-29)

Secocha **sigue como módulo independiente** (sucursal con su usuario, caja, stock y RLS por sede), pero usará **la misma infraestructura SAP** que Arequipa: documentos con cabecera/posiciones, numeración correlativa, estados, trazabilidad y auditoría. Calidad/Garantía (QM + CS) será un módulo nuevo apoyado en el QC de Producción.

### 3.2 Razón social (confirmado por Williams, 2026-10-29)

- Razón social legal: **INVERSIONES GLOBAL COMPANY ROUSVID S.A.C.**, RUC **20613238566** (ya es la que usan los documentos).
- Nombre comercial: **COMBOY VID**.
- Lema: **"Soluciones mineras, innovación que impulsa la minería"**.
- Ajuste pendiente: `components/Header.tsx` muestra "COMBOY VID SOLUCIONES INDUSTRIALES" en la franja de cada módulo; se cambia a "COMBOY VID" en la limpieza (mismo tamaño y fuente).

## 4. Lista para ELIMINAR (espera "APROBADO")

### 4.1 Archivos completos

| Archivo | Por qué es basura | Riesgo |
|---|---|---|
| `components/ui/CardFormal.tsx` | Nadie lo importa. Lo reemplazó `components/ui.tsx`. | Ninguno |
| `components/ui/TableFormal.tsx` | Nadie lo importa. Lo reemplazó `Table/Td` de `components/ui.tsx`. | Ninguno |
| `components/Header.tsx` (solo el texto) | Cambiar "COMBOY VID SOLUCIONES INDUSTRIALES" por "COMBOY VID" (nombre comercial confirmado). No es borrado de archivo. | Ninguno |
| `setup_usuarios.js` (raíz) | Duplica `scripts/crear-usuarios.mjs` y **trae una contraseña escrita en el código** (`Comboy2024*`). | Ninguno para la app. Si esa contraseña todavía se usa en algún usuario, cámbiala. |
| `scripts/logs/import_stock_repuestos_ALMACEN_saldos_13.log` | Log de una importación ya hecha (20 KB). | Ninguno |
| Dependencia `dotenv` en `package.json` | Solo la usaba `setup_usuarios.js`. | Ninguno |

### 4.2 Código muerto dentro de archivos que se mantienen

| Archivo | Qué se borra |
|---|---|
| `lib/storage.ts` | `getAsistencia`, `registrarGastoTesoreria` (nadie las llama) |
| `lib/productos.ts` | `recargarCatalogo`, `getCatalogo`, `productoPorId` |
| `lib/ventas.ts` | `prepararDespacho` |
| `lib/sucursal.ts` | `guardarSucursal` |
| `lib/sucursal-modelos.ts` | `JEFE_SUCURSAL` |
| `lib/productos-modelos.ts` | `etiquetaProducto` |
| `lib/asistencia.ts` | `PAGO_POR_DIA` |
| `lib/auth.ts` | `PERMISO_EDITAR_ASISTENCIA` |
| `components/layout/NotificationSidebar.tsx` | `ANCHO_NOTIF` |
| 11 archivos | 22 imports y variables sin uso (detalle en la tabla del punto 8) |
| `components/tesoreria/PlanillaTab.tsx`, `lib/storage.ts` | 3 `console.info` de depuración |

## 5. NO se toca (aunque parezca muerto)

- `desktop/` (app Electron de Windows) y `.github/workflows/desktop-windows.yml`.
- Redirecciones que mantienen enlaces viejos: `app/sucursal-beta/page.tsx`, `/sucursal → /secocha` y `/dashboard/productos → Ventas` en `next.config.mjs`, `app/(dashboard)/dashboard/planilla/page.tsx`, `app/login/[modulo]/page.tsx`, `app/page.tsx`.
- `lib/migracion.ts` (sube datos viejos del navegador de alguna PC que no haya entrado aún).
- **Todo `supabase/`**: migraciones ya corridas o pendientes, `backups/`, `tests/`, y los `.sql` sueltos de la raíz de `supabase/`. Son el historial de la base de datos.
- `scripts/` de mantenimiento (`crear-usuarios.mjs`, `unificar-inventario.mjs`, `mover-adjuntos-a-storage.mjs`, `import_stock_repuestos.js`, `prueba-pdf-requerimientos.cjs`).
- `docs/` (auditorías y pruebas de los sprints anteriores).
- Identidad visual: `app/globals.css`, `tailwind.config.ts`, logos en `public/`, ModuleHeader, isla, dock, barra de notificaciones, tema azul.

## 6. OPTIMIZAR (se hace sin pedir permiso, sin cambiar pantallas)

1. **Partir archivos gigantes** manteniendo las mismas funciones públicas: `lib/storage.ts` (3.216 líneas), `compras/page.tsx` (2.190), `lib/ventas.ts` (1.585), `lib/pdf.ts` (1.354), `PlanillaTab.tsx` (1.116). Se ordenan por módulo SAP (MM, SD, FI, HCM) solo por dentro.
2. **Quitar `export` innecesario** en más de 100 tipos y constantes que solo usa su propio archivo (no cambia nada visible).
3. Unificar `lib/constantes.ts > productoNormalizado` con `normalizarNombre` del catálogo maestro (hacen casi lo mismo).

## 7. Seguridad y bugs encontrados (se corrigen en Fase 1)

| # | Hallazgo | Gravedad | Propuesta |
|---|---|---|---|
| 1 | **No existe `middleware.ts`**: las rutas `/dashboard/*` se protegen solo en el navegador (`app/(dashboard)/layout.tsx`). Sin sesión se descarga la página, aunque los datos los frena RLS. | Alta | Middleware con `@supabase/ssr` que valide sesión y módulo antes de servir la página. |
| 2 | `scripts/crear-usuarios.mjs` crea los 5 usuarios base con contraseña **`123456`**. | Alta | Pedir la contraseña por variable de entorno y obligar a cambiarla. Confirma si esos usuarios `@comboyvid.local` siguen activos. |
| 3 | Login sin límite de intentos propio (solo el de Supabase Auth). | Media | Bloqueo temporal tras 5 intentos fallidos. |
| 4 | API routes (`derivar-venta`, `retiro-produccion`, `declaraciones-juradas`) piden sesión pero dejan el control de rol a la BD (RLS/RPC). | Media | Validar rol también en el servidor. |
| 5 | Auditoría del 21-oct: `mi_rol()` devolvía `creador` sin claim, policies "permitir todo", grants a `anon`, buckets públicos. El Sprint 1 (`20261021_sprint1_seguridad.sql`) los corrige. | Alta | Confirmar que ese SQL está corrido en Supabase; si no, es lo primero. |
| 6 | Casi todo vive en `data jsonb` (sin índices útiles ni reportes SQL). | Media | Las tablas nuevas de Fase 1 (Importación, CRM, Flota, Taller) serán relacionales con cabecera/posiciones e índices. |
| 7 | AFP/ONP al 10 % fijo; sin CTS, gratificación ni EsSalud. | Media | Se corrige en HCM. |

No se encontraron queries N+1 en el servidor: la app lee cada tabla una vez y trabaja en memoria (el costo está en el tamaño de la descarga, ya mitigado con `lib/storage.por-modulo.ts`).

## 8. Clasificación de los 139 archivos .ts/.tsx

Resumen: **118 MANTENER · 19 OPTIMIZAR · 2 ELIMINAR**.

| Archivo | Líneas | Lo usan | Clasificación | Motivo |
|---|---:|---|---|---|
| `app/(dashboard)/dashboard/almacen/despacho.tsx` | 601 | 3 archivo(s) | **MANTENER** |  |
| `app/(dashboard)/dashboard/almacen/despacho/page.tsx` | 16 | entrada Next.js | **MANTENER** | Ruta directa de Despacho (enlazada). |
| `app/(dashboard)/dashboard/almacen/page.tsx` | 574 | entrada Next.js | **MANTENER** |  |
| `app/(dashboard)/dashboard/compras/page.tsx` | 2190 | entrada Next.js | **OPTIMIZAR** | 2.2k líneas: separar pestañas en componentes; variable verVoucher sin uso. |
| `app/(dashboard)/dashboard/contable/page.tsx` | 421 | entrada Next.js | **MANTENER** |  |
| `app/(dashboard)/dashboard/creador/page.tsx` | 127 | entrada Next.js | **MANTENER** |  |
| `app/(dashboard)/dashboard/page.tsx` | 244 | entrada Next.js | **MANTENER** |  |
| `app/(dashboard)/dashboard/planilla/adelantos/page.tsx` | 261 | entrada Next.js | **MANTENER** |  |
| `app/(dashboard)/dashboard/planilla/historial/[periodoId]/page.tsx` | 10 | entrada Next.js | **MANTENER** |  |
| `app/(dashboard)/dashboard/planilla/page.tsx` | 6 | entrada Next.js | **MANTENER** | Redirección a Tesorería ?tab=planilla (se mantiene). |
| `app/(dashboard)/dashboard/produccion/page.tsx` | 242 | entrada Next.js | **MANTENER** |  |
| `app/(dashboard)/dashboard/ventas/cobrar.tsx` | 476 | 2 archivo(s) | **MANTENER** |  |
| `app/(dashboard)/dashboard/ventas/comprobantes.tsx` | 376 | 1 archivo(s) | **MANTENER** |  |
| `app/(dashboard)/dashboard/ventas/comun.tsx` | 381 | 5 archivo(s) | **MANTENER** |  |
| `app/(dashboard)/dashboard/ventas/maestros.tsx` | 255 | 2 archivo(s) | **MANTENER** |  |
| `app/(dashboard)/dashboard/ventas/notas.tsx` | 489 | 1 archivo(s) | **MANTENER** |  |
| `app/(dashboard)/dashboard/ventas/page.tsx` | 137 | entrada Next.js | **MANTENER** |  |
| `app/(dashboard)/dashboard/ventas/secocha.tsx` | 163 | 1 archivo(s) | **MANTENER** |  |
| `app/(dashboard)/layout.tsx` | 366 | entrada Next.js | **MANTENER** |  |
| `app/(sucursal)/layout.tsx` | 9 | entrada Next.js | **MANTENER** |  |
| `app/(sucursal)/secocha/login/page.tsx` | 145 | entrada Next.js | **MANTENER** |  |
| `app/(sucursal)/secocha/page.tsx` | 150 | entrada Next.js | **MANTENER** |  |
| `app/api/almacen/retiro-produccion/route.ts` | 60 | entrada Next.js | **OPTIMIZAR** | Revisar validación de rol en servidor. |
| `app/api/declaraciones-juradas/route.ts` | 35 | entrada Next.js | **OPTIMIZAR** | Revisar validación de rol en servidor. |
| `app/api/productos/route.ts` | 86 | entrada Next.js | **MANTENER** |  |
| `app/api/sucursal/derivar-venta/route.ts` | 81 | entrada Next.js | **OPTIMIZAR** | Revisar validación de rol en servidor. |
| `app/layout.tsx` | 22 | entrada Next.js | **MANTENER** |  |
| `app/login/[modulo]/page.tsx` | 7 | entrada Next.js | **MANTENER** | Redirección /login/<módulo> (se mantiene). |
| `app/login/page.tsx` | 278 | entrada Next.js | **OPTIMIZAR** | Sin límite de intentos propio (solo el de Supabase). |
| `app/page.tsx` | 5 | entrada Next.js | **MANTENER** | Redirección a /dashboard. |
| `app/seleccionar-modulo/page.tsx` | 217 | entrada Next.js | **MANTENER** |  |
| `app/sucursal-beta/page.tsx` | 6 | entrada Next.js | **MANTENER** | Redirección de enlace antiguo a /secocha (se mantiene). |
| `components/ArchivoRef.tsx` | 19 | 3 archivo(s) | **MANTENER** |  |
| `components/FirmaPad.tsx` | 74 | 3 archivo(s) | **MANTENER** |  |
| `components/Header.tsx` | 53 | 1 archivo(s) | **MANTENER** |  |
| `components/LogoComboy.tsx` | 22 | 1 archivo(s) | **MANTENER** |  |
| `components/ObservacionesGerencia.tsx` | 106 | 1 archivo(s) | **MANTENER** |  |
| `components/SelectorCaja.tsx` | 32 | 7 archivo(s) | **MANTENER** |  |
| `components/almacen/EquiposTerminados.tsx` | 429 | 1 archivo(s) | **MANTENER** |  |
| `components/almacen/StockAlmacen.tsx` | 448 | 1 archivo(s) | **OPTIMIZAR** | Imports/variables sin uso: Table, Td, fechaCorta |
| `components/compras/EditarGasto.tsx` | 86 | 2 archivo(s) | **MANTENER** |  |
| `components/compras/EditarReq.tsx` | 150 | 3 archivo(s) | **MANTENER** |  |
| `components/compras/FormBancarizacion.tsx` | 47 | 3 archivo(s) | **MANTENER** |  |
| `components/compras/FormGasto.tsx` | 447 | 1 archivo(s) | **MANTENER** |  |
| `components/compras/OrdenesServicio.tsx` | 495 | 1 archivo(s) | **MANTENER** |  |
| `components/compras/PagoCompra.tsx` | 69 | 1 archivo(s) | **MANTENER** |  |
| `components/compras/SelectorOrden.tsx` | 56 | 2 archivo(s) | **MANTENER** |  |
| `components/compras/ServiciosOS.tsx` | 119 | 1 archivo(s) | **MANTENER** |  |
| `components/contable/EstadosCuenta.tsx` | 220 | 1 archivo(s) | **MANTENER** |  |
| `components/dashboard/TarjetasOrdenables.tsx` | 104 | 1 archivo(s) | **MANTENER** |  |
| `components/doc-viewer.tsx` | 189 | 3 archivo(s) | **MANTENER** |  |
| `components/layout/FloatingDock.tsx` | 70 | 1 archivo(s) | **MANTENER** |  |
| `components/layout/IslandMenu.tsx` | 103 | 2 archivo(s) | **MANTENER** |  |
| `components/layout/ModuleHeader.tsx` | 68 | 1 archivo(s) | **MANTENER** |  |
| `components/layout/ModuloLayout.tsx` | 92 | 3 archivo(s) | **MANTENER** |  |
| `components/layout/NotificationSidebar.tsx` | 120 | 2 archivo(s) | **OPTIMIZAR** | Funciones exportadas que nadie usa: ANCHO_NOTIF |
| `components/modulos-login.ts` | 49 | 3 archivo(s) | **MANTENER** |  |
| `components/planilla/AdelantosTrabajador.tsx` | 153 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/CerrarSemana.tsx` | 125 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/Contratistas.tsx` | 416 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/ContratistasMaestro.tsx` | 269 | 2 archivo(s) | **MANTENER** |  |
| `components/planilla/DetalleHistorial.tsx` | 159 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/EditarListaSemana.tsx` | 98 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/FichaTrabajador.tsx` | 308 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/HistorialPlanilla.tsx` | 134 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/LiquidacionCelda.tsx` | 153 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/PagarSemanaFiltrada.tsx` | 129 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/ResultadoImportacion.tsx` | 192 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/generateReciboPDF.ts` | 95 | 2 archivo(s) | **MANTENER** |  |
| `components/planilla/useAdelantosPendientes.ts` | 42 | 1 archivo(s) | **MANTENER** |  |
| `components/planilla/useHistorialPlanilla.ts` | 67 | 2 archivo(s) | **MANTENER** |  |
| `components/productos/CatalogoProductos.tsx` | 454 | 1 archivo(s) | **MANTENER** |  |
| `components/productos/ProductoInput.tsx` | 167 | 11 archivo(s) | **MANTENER** |  |
| `components/requerimientos/RequerimientoForm.tsx` | 129 | 2 archivo(s) | **MANTENER** |  |
| `components/shell/AccionRapida.tsx` | 68 | 1 archivo(s) | **MANTENER** |  |
| `components/shell/Campana.tsx` | 101 | 1 archivo(s) | **MANTENER** |  |
| `components/shell/CommandPalette.tsx` | 152 | 1 archivo(s) | **MANTENER** |  |
| `components/shell/ir.ts` | 21 | 5 archivo(s) | **MANTENER** |  |
| `components/shell/nav.ts` | 119 | 2 archivo(s) | **MANTENER** |  |
| `components/sucursal/Caja.tsx` | 150 | 1 archivo(s) | **MANTENER** |  |
| `components/sucursal/Inventario.tsx` | 325 | 1 archivo(s) | **MANTENER** |  |
| `components/sucursal/Reportes.tsx` | 148 | 1 archivo(s) | **MANTENER** |  |
| `components/sucursal/Shell.tsx` | 115 | 1 archivo(s) | **MANTENER** |  |
| `components/sucursal/Traslados.tsx` | 314 | 1 archivo(s) | **MANTENER** |  |
| `components/sucursal/Ventas.tsx` | 491 | 1 archivo(s) | **OPTIMIZAR** | Imports/variables sin uso: Badge |
| `components/sucursal/comun.tsx` | 132 | 6 archivo(s) | **MANTENER** |  |
| `components/tesoreria/DeclaracionesJuradas.tsx` | 147 | 1 archivo(s) | **MANTENER** |  |
| `components/tesoreria/PlanillaTab.tsx` | 1117 | 1 archivo(s) | **OPTIMIZAR** | Imports/variables sin uso: edad 1.1k líneas; 2 console.info de depuración. |
| `components/tesoreria/QuickActions.tsx` | 158 | 4 archivo(s) | **MANTENER** |  |
| `components/tesoreria/TesoreriaLeftDrawer.tsx` | 29 | 1 archivo(s) | **MANTENER** |  |
| `components/ui.tsx` | 454 | 68 archivo(s) | **MANTENER** |  |
| `components/ui/BotonFiltros.tsx` | 50 | 17 archivo(s) | **MANTENER** |  |
| `components/ui/CardFormal.tsx` | 36 | 0 archivo(s) | **ELIMINAR** | Nadie lo importa (reemplazado por components/ui.tsx). |
| `components/ui/ListaDocs.tsx` | 206 | 13 archivo(s) | **MANTENER** |  |
| `components/ui/TableFormal.tsx` | 27 | 0 archivo(s) | **ELIMINAR** | Nadie lo importa (reemplazado por Table/Td de components/ui.tsx). |
| `hooks/useTogglePanel.ts` | 15 | 13 archivo(s) | **MANTENER** |  |
| `lib/adelantos.ts` | 236 | 8 archivo(s) | **MANTENER** |  |
| `lib/asistencia.ts` | 207 | 2 archivo(s) | **OPTIMIZAR** | Funciones exportadas que nadie usa: PAGO_POR_DIA |
| `lib/auth.ts` | 270 | 39 archivo(s) | **OPTIMIZAR** | Funciones exportadas que nadie usa: PERMISO_EDITAR_ASISTENCIA |
| `lib/cajas.ts` | 92 | 10 archivo(s) | **MANTENER** |  |
| `lib/comprobantes.ts` | 55 | 8 archivo(s) | **MANTENER** |  |
| `lib/constantes.ts` | 13 | 1 archivo(s) | **MANTENER** | SEDE_MAP lo usa Stock. |
| `lib/contable-auto.ts` | 58 | 1 archivo(s) | **MANTENER** |  |
| `lib/contable.ts` | 347 | 6 archivo(s) | **MANTENER** |  |
| `lib/contratistas.ts` | 166 | 2 archivo(s) | **MANTENER** |  |
| `lib/emparejarReloj.ts` | 143 | 2 archivo(s) | **MANTENER** |  |
| `lib/empresa.ts` | 30 | 23 archivo(s) | **MANTENER** |  |
| `lib/equipos.ts` | 365 | 10 archivo(s) | **MANTENER** |  |
| `lib/estadoCuenta.ts` | 104 | 1 archivo(s) | **MANTENER** |  |
| `lib/historial.ts` | 278 | 9 archivo(s) | **MANTENER** |  |
| `lib/hooks/useEditar.ts` | 31 | 1 archivo(s) | **MANTENER** |  |
| `lib/inventario.ts` | 71 | 2 archivo(s) | **MANTENER** |  |
| `lib/liquidacion.ts` | 167 | 2 archivo(s) | **MANTENER** |  |
| `lib/listaSemana.ts` | 60 | 2 archivo(s) | **MANTENER** |  |
| `lib/migracion.ts` | 79 | 1 archivo(s) | **MANTENER** | Migración única localStorage→Supabase; se mantiene mientras alguna PC vieja no haya entrado. |
| `lib/motivosRetiro.ts` | 40 | 2 archivo(s) | **MANTENER** |  |
| `lib/notificaciones.ts` | 178 | 3 archivo(s) | **MANTENER** |  |
| `lib/pdf.ts` | 1354 | 18 archivo(s) | **OPTIMIZAR** | 1.3k líneas: agrupar plantillas por documento. |
| `lib/periodo.ts` | 21 | 1 archivo(s) | **MANTENER** |  |
| `lib/plantillasDocumentos.ts` | 107 | 2 archivo(s) | **MANTENER** |  |
| `lib/preferencias.ts` | 107 | 4 archivo(s) | **MANTENER** |  |
| `lib/produccion.ts` | 133 | 3 archivo(s) | **MANTENER** |  |
| `lib/productos-modelos.ts` | 74 | 3 archivo(s) | **OPTIMIZAR** | Funciones exportadas que nadie usa: etiquetaProducto |
| `lib/productos.ts` | 277 | 8 archivo(s) | **OPTIMIZAR** | Funciones exportadas que nadie usa: recargarCatalogo, getCatalogo, productoPorId |
| `lib/reglasStock.ts` | 161 | 1 archivo(s) | **MANTENER** |  |
| `lib/sedes.ts` | 103 | 7 archivo(s) | **MANTENER** |  |
| `lib/storage.por-modulo.ts` | 105 | 1 archivo(s) | **MANTENER** |  |
| `lib/storage.ts` | 3216 | 70 archivo(s) | **OPTIMIZAR** | Funciones exportadas que nadie usa: getAsistencia, registrarGastoTesoreria 3.2k líneas: partir por módulo (MM/SD/FI/HCM) sin cambiar la API; carga por módulo ya existe. |
| `lib/sucursal-modelos.ts` | 276 | 6 archivo(s) | **OPTIMIZAR** | Funciones exportadas que nadie usa: JEFE_SUCURSAL |
| `lib/sucursal.ts` | 599 | 10 archivo(s) | **OPTIMIZAR** | Funciones exportadas que nadie usa: guardarSucursal |
| `lib/supabase/client.ts` | 11 | 13 archivo(s) | **MANTENER** |  |
| `lib/supabase/server.ts` | 21 | 4 archivo(s) | **OPTIMIZAR** | Falta middleware.ts: las rutas se protegen solo en el navegador. |
| `lib/trazabilidad.ts` | 69 | 1 archivo(s) | **MANTENER** |  |
| `lib/types.ts` | 915 | 54 archivo(s) | **MANTENER** |  |
| `lib/utils/chasis.ts` | 2 | 2 archivo(s) | **MANTENER** |  |
| `lib/utils/codigos.ts` | 28 | 5 archivo(s) | **MANTENER** |  |
| `lib/ventas.ts` | 1585 | 14 archivo(s) | **OPTIMIZAR** | Funciones exportadas que nadie usa: prepararDespacho 1.6k líneas: separar SD (pedido/factura/entrega) de CxC. |
| `next-env.d.ts` | 5 | entrada Next.js | **MANTENER** |  |
| `tailwind.config.ts` | 67 | entrada Next.js | **MANTENER** | Identidad visual (Times New Roman, colores). |

## 9. Siguiente paso después de "APROBADO"

1. Ejecutar la limpieza del punto 4 en un PR, compilar y verificar que todas las pantallas cargan igual.
2. Seguridad del punto 7 (middleware, contraseñas, rate limit).
3. **Módulo IMPORTACIÓN (MM-IM)**: Requerimiento de Importación → Orden de Importación (China/USA) → Embarque (nave, Callao, aduana) → Costeo (FOB + Flete + Seguro = CIF, + Ad Valorem + IGV + IPM + Percepción + Almacenaje + Transporte) → Liquidación → ingreso a Almacén con costo landed → margen de venta. Tablas relacionales nuevas con `sede_id` y RLS, sin tocar datos existentes.
4. Luego, en el orden que prefieras: CRM de minas, Flota/Alquiler, Taller (OT sobre Producción), Calidad/Garantía, CO por centro de costo.
