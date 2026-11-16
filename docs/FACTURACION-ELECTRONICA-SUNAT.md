# Facturación electrónica SUNAT (SEE - del contribuyente)

El ERP genera el XML UBL 2.1, lo firma con el certificado digital de **INVERSIONES GLOBAL COMPANY ROUSVID S.A.C. (RUC 20613238566)**,
lo envía a SUNAT por el servicio web `billService` y guarda la constancia de recepción (CDR). Todo lo sensible
(certificado y clave SOL) vive en los *Secrets* del Edge Function `sunat-cpe`: nunca en el navegador ni en el repositorio.

## Qué hace

| Documento | Serie | Envío | Anulación |
|---|---|---|---|
| Factura (01) | F001 | `sendBill` al emitir (respuesta inmediata con CDR) | Comunicación de baja (RA) o nota de crédito 01 |
| Boleta (03) | B001 | `sendBill` al emitir | Nota de crédito 01 |
| Nota de crédito (07) | FC01 / BC01 | `sendBill` | — |
| Nota de débito (08) | FD01 / BD01 | `sendBill` | — |

- Estados: **SUNAT pendiente** (no enviado), **SUNAT ✓** (aceptado, código 0), **SUNAT ✓ obs.** (aceptado con observaciones 4xxx),
  **rechazado** (2000-3999: corregir y reenviar), **no recibido** (0100-1999: reenviar), **baja** (anulado ante SUNAT).
- Descargas: XML firmado, CDR (`R-…zip`) y CDR de la baja.
- Un comprobante aceptado por SUNAT ya no se anula solo en el ERP: se usa **Baja** (facturas) o **Nota → 01 Anulación**.
- La representación impresa (PDF A4 y ticket) lleva la leyenda SUNAT, el valor resumen (hash) y el QR con el formato de SUNAT.

## Lo que debe configurar Williams

1. **SQL**: correr `supabase/migrations/20261125_sunat_cpe.sql` en Supabase → SQL Editor.
2. **Edge Function**: desplegar la carpeta `supabase/functions/sunat-cpe` (`supabase functions deploy sunat-cpe`).
3. **Secrets** (Supabase → Edge Functions → Secrets):

| Secret | Beta (homologación) | Producción |
|---|---|---|
| `SUNAT_ENTORNO` | `beta` | `produccion` |
| `SUNAT_SOL_USUARIO` | `MODDATOS` (o vacío) | usuario SOL **secundario** con perfil de emisión electrónica |
| `SUNAT_SOL_CLAVE` | `moddatos` (o vacío) | su clave |
| `SUNAT_CERT_PFX` | certificado `.pfx` en base64 (en beta sirve uno de prueba) | certificado digital tributario de la empresa en base64 |
| `SUNAT_CERT_CLAVE` | contraseña del `.pfx` | contraseña del `.pfx` |

   Base64 del certificado en Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\ruta\certificado.pfx")) | Set-Clipboard`

   Opcionales: `SUNAT_FIRMA_ALG=sha256` (por defecto SHA-1, como los ejemplos de SUNAT) y los datos del domicilio fiscal si
   no coinciden con la Ficha RUC: `SUNAT_UBIGEO` (por defecto 040112 Paucarpata), `SUNAT_DIRECCION`, `SUNAT_DISTRITO`,
   `SUNAT_PROVINCIA`, `SUNAT_DEPARTAMENTO`, `SUNAT_NOMBRE_COMERCIAL`.

## Pasar a producción

1. En SUNAT Operaciones en Línea: afiliarse a **SEE - Del contribuyente**, registrar el certificado digital y crear el usuario SOL secundario.
2. Probar en beta: factura contado, factura crédito en cuotas, boleta, nota de crédito, nota de débito y una baja. Todas deben salir **SUNAT ✓**.
3. Cambiar `SUNAT_ENTORNO=produccion` y los secretos reales. Desde ese momento cada comprobante tiene validez legal.
4. Plazo: las facturas y sus notas deben llegar a SUNAT dentro de los 3 días calendario (el ERP las envía al emitir).

## Validaciones antes de enviar (para no gastar correlativos con errores)

Factura solo a RUC; series F/B según el documento; correlativo de 1 a 8 dígitos; cada ítem cuadra
(cantidad × valor unitario = valor de venta, IGV = 18 %); total = base + IGV; descuento global como cargo/descuento 02;
crédito con cuotas que suman el monto pendiente y vencen después de la emisión; NC por anulación/devolución por el total;
monto en letras (leyenda 1000); unidades del catálogo 03 (M2 → MTK, servicio → ZZ, etc.).

## Pruebas

`deno test -A --node-modules-dir=none supabase/functions/sunat-cpe/tests/` (con `PFX_PRUEBA_B64` y `PFX_PRUEBA_CLAVE` firma
y verifica la firma; `SALIDA_XML=carpeta` deja los XML y ZIP generados).
