# Medición Sprint 2 · Velocidad

Fecha: 2026-10-21 · Datos medidos en Supabase `wfhoczkoixmobxbwrfva` (Sprint 1 ya aplicado).

## Qué se midió y qué no

- **Medido [verificado]:** filas, bytes y cantidad de consultas que descarga cada usuario al entrar, calculados en la base con el mismo filtro que usa `lib/storage.ts` (`tipo = ?`, columnas pedidas).
- **No medido:** el tiempo real en segundos del login. Hace falta iniciar sesión con un usuario real en `npm run dev` y no tengo credenciales. El código ya imprime el tiempo: abrir la consola del navegador (F12) al entrar y leer (ejemplo del formato, no es una medición):
  ```
  iniciarDatos: 812 ms
  iniciarDatos: 12 de 33 claves, 452 filas
  ```
  Anotar ese número abajo, antes (rama `main`) y después (esta rama), con el mismo usuario y la misma red.

## Usuario Tesorería (`/dashboard/compras`, `/dashboard/tesoreria`)

| | Antes (main) | Después (Sprint 2) | Después + mover adjuntos |
|---|---|---|---|
| Consultas al entrar | 33 (todas las claves) | 12 | 12 |
| Filas | 1,140 | 452 | 452 |
| Datos descargados | **≈ 2.9 MB** (`select *`) | **≈ 750 kB** (`id,tipo,data`) | **≈ 215 kB** |
| Despachos (1.6 MB de fotos en base64) | se descargaban | no se descargan | no se descargan |
| Kardex, vales, planilla, ventas, contable | se descargaban | no (se bajan solo si se abre esa pantalla) | no |

Detalle del "antes": compras 735 kB (de eso, 5 guías con escaneo en base64 = 558 kB), almacén 2.2 MB (despachos 1.6 MB, kardex 308 kB, stock 158 kB, vales 104 kB), ventas 43 kB, contable 27 kB. La planilla ya no llega a Tesorería desde el Sprint 1 (RLS).

Detalle del "después": compras 682 kB (las guías siguen con base64 hasta correr `scripts/mover-adjuntos-a-storage.mjs`), stock 86 kB, condiciones de pago 2 kB.

**Estimación [inferido]:** con 74% menos datos y 21 consultas menos, el login de Tesorería debería bajar en proporción. No lo afirmo en segundos hasta medirlo con la consola.

## Otros usuarios (después)

| Usuario | Claves al entrar | Notas |
|---|---|---|
| almacen | 15 | Sigue bajando despachos (1.6 MB) y guías (556 kB), que son de su módulo. Baja cuando esos adjuntos pasen a Storage (ver nota del script). |
| planilla | 10 | Solo planilla + correlativos/observaciones/condiciones. |
| creador, gerencia (`*`) | 33 | Todo, igual que antes, pero con `id,tipo,data` (≈ 25% menos bytes). |

## Realtime

| | Antes | Después |
|---|---|---|
| Otra PC aprueba un REQ | se volvía a bajar la lista completa (pendientes y procesados) | se aplica solo la fila que cambió |
| Otra PC mueve kardex | se bajaban las 467 filas | 1 fila (y nada si este usuario no usa kardex) |
| Reconexión | se recargaban las 33 claves | solo las claves en uso |

## Aprobación de REQ

| | Antes | Después |
|---|---|---|
| Aceptar 2 REQ | 2 clics (Aceptar en cada tarjeta; "Ver" es opcional) | 2 clics: "Seleccionar todos" + "Aceptar seleccionados", sin importar cuántos sean |
| Aceptar 10 REQ | 10 clics | 2 clics |
| Rechazar varios | 2 clics por REQ (botón + confirmar) | 3 clics para todos (seleccionar todos + rechazar + confirmar) |

## Registro de mediciones reales (completar)

| Usuario | Antes (main) | Después (rama) | Red |
|---|---|---|---|
| tesoreria | ___ ms | ___ ms | |
| almacen | ___ ms | ___ ms | |
| creador | ___ ms | ___ ms | |
