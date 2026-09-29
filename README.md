# ERP COMBOY VID — Módulo de Compras (Fase 2)

## Instalar y correr
```bash
npm install
npm run dev      # http://localhost:3000  → /dashboard/compras
npm run build    # verificación de producción
```

## Rutas
- `/dashboard/almacen`  → Nuevo REQ · Lista de REQ emitidos · Ingresos por V°B°
- `/dashboard/compras`  → Notificaciones · Antecedentes · Cotizaciones · OC · Facturas/DJ · Guías
- `/dashboard/planilla` → Maestro de trabajadores (fecha de ingreso, tipo de sueldo, AFP/ONP) · Planilla del periodo con asistencia del reloj

## Estructura
```
app/(dashboard)/layout.tsx              sidebar, buscador global, campana, rol simulado
app/(dashboard)/dashboard/compras/page.tsx
app/(dashboard)/dashboard/almacen/page.tsx
components/ui.tsx                       Button, Card, Badge, Tabs, Modal, Table, Timeline, Toaster
components/doc-viewer.tsx               visor de documento + historial (timeline)
lib/storage.ts                          TODA la lógica de negocio + localStorage (reemplazar por Supabase)
lib/pdf.ts                              PDFs jsPDF (REQ, Cotización, OC, Factura/DJ, Acta de ingreso)
lib/empresa.ts                          ← RUC, dirección, logo base64, sedes, unidades
lib/types.ts
```

## localStorage keys
reqs_almacen_pendientes · reqs_procesados_compras · cotizaciones · ordenes_compra · facturas · guias · erp_contadores · erp_rol · CV_TRABAJADORES_V2

## Reglas implementadas
- ACEPTAR → sale de notificaciones y queda en la lista como ACEPTADO.
- RECHAZAR → se borra de todo el sistema (notificación y lista).
- OBSERVAR → Almacén corrige y reenvía (vuelve a notificaciones).
- Cotización solo sobre REQ ACEPTADO/COTIZADO · OC solo desde cotización · 1 OC por REQ.
- Factura solo desde OC · IGV 18 % automático · alerta si difiere de la OC.
- Guía obligatoria para factura (PDF/imagen ≤ 1.5 MB, drag & drop, vista previa).
- Declaración Jurada: solo GERENCIA, tope TOPE_DJ (S/ 700, editable en lib/storage.ts), no requiere guía.
- FINALIZADO solo con V°B° de Almacén (check por producto + recibido por).
