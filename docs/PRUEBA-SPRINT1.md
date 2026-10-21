# Prueba del Sprint 1 de seguridad

Migración: `supabase/migrations/20261021_sprint1_seguridad.sql` · Backup: `supabase/backups/backup_previo_sprint1.sql` · Vuelta atrás: `supabase/backups/rollback_sprint1.sql`

**Estado:** archivos generados, **no aplicados**. Solo `mi_rol()` ya está en Supabase desde el 2026-10-21.

## 1. Antes de aplicar

1. Correr el backup (deja los CSV en `supabase/backups/`, que no se suben a git):
   ```
   psql "<URI de Supabase>" -f supabase/backups/backup_previo_sprint1.sql
   ```
2. Anotar los conteos que imprime. Deben ser planilla 84, planilla_historial 7, planilla_historial_detalle 25.
3. Avisar a los usuarios: durante la prueba pueden ver "Su usuario no puede…" en algo que antes hacían.

## 2. Aplicar

Pegar el archivo de migración completo en Supabase › SQL Editor y ejecutar. Va en una sola transacción: si algo falla, no queda nada a medias.

## 3. Verificación en SQL (deben salir así)

| Consulta | Resultado esperado |
|----------|--------------------|
| `select grantee, table_name, privilege_type from information_schema.role_table_grants where grantee='anon' and table_schema='public';` | 0 filas |
| `select tablename, policyname from pg_policies where schemaname in ('public','storage') and 'public'=any(roles) and coalesce(qual,'true')='true' and coalesce(with_check,'true')='true';` | 0 filas |
| `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;` | 0 filas |
| `select id, public, file_size_limit from storage.buckets;` | los 3 con `public = false` y 5242880 |
| `select tablename, policyname, cmd from pg_policies where tablename in ('planilla','ventas','almacen','perfiles') order by 1,2;` | planilla: `planilla_escribir`, `planilla_select` · ventas: `ventas_escribir`, `ventas_select` · almacen: `almacen_escribir`, `almacen_select` · perfiles: `perfiles_insert_creador`, `perfiles_select_own`, `perfiles_update_creador` |
| conteos de planilla | 84 / 7 / 25 |

## 4. Simular usuarios en SQL (sin iniciar sesión)

En el SQL Editor, cada bloque corre como ese usuario y no deja cambios (`rollback`):

```sql
-- Reemplazar <usuario> por almacen, planilla, tesoreria, gerencia o creador
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from perfiles where usuario = '<usuario>'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.mi_rol() as rol,
  (select count(*) from planilla)  as planilla,
  (select count(*) from ventas)    as ventas,
  (select count(*) from compras)   as compras,
  (select count(*) from almacen)   as almacen,
  (select count(*) from perfiles)  as perfiles,
  (select count(*) from adelantos) as adelantos;
rollback;
```

Resultado esperado:

| Usuario | mi_rol | planilla | ventas | compras | almacen | perfiles | adelantos |
|---------|--------|----------|--------|---------|---------|----------|-----------|
| almacen | almacen | 0 | 0 | ve | ve | 1 (el suyo) | 0 |
| planilla | planilla | 84 | 0 | 0 | 0 | 1 | ve |
| tesoreria | tesoreria | 0 | ve | ve | ve | 1 | ve |
| gerencia | gerencia | ve | ve | ve | ve | 5 | ve |
| creador | creador | ve | ve | ve | ve | 5 | ve |

Para anónimo (debe fallar con *permission denied*):

```sql
begin; set local role anon; select count(*) from planilla; rollback;
```

## 5. Prueba manual en el ERP (3 usuarios mínimo)

| # | Usuario | Hacer | Debe pasar |
|---|---------|-------|------------|
| 1 | almacen | Entrar, crear un requerimiento, ver Stock y Despachos | Funciona. No ve Planilla ni Ventas. |
| 2 | almacen | Ir a `/dashboard/compras?tab=planilla` | "Acceso denegado". |
| 3 | planilla | Entrar a Planilla, abrir Historial, registrar un adelanto | Funciona. |
| 4 | planilla | Cerrar una semana de prueba (o revisar que el botón no dé error de permiso) | Funciona. |
| 5 | tesoreria | Aceptar un REQ, registrar un gasto con baucher (JPG/PNG/PDF < 5 MB) y abrir el baucher | Sube y se ve con enlace temporal. |
| 6 | tesoreria | Subir un baucher de más de 5 MB o un .docx | Rechazado. |
| 7 | tesoreria | Emitir una nota de pedido en Ventas (si tiene el módulo) | Funciona. |
| 8 | gerencia | Recorrer todos los módulos | Ve todo, no puede editar. |
| 9 | cualquiera | Abrir en el navegador `https://wfhoczkoixmobxbwrfva.supabase.co/rest/v1/planilla?select=*` con la llave pública | Error de permiso, sin datos. |

## 6. Cambios respecto a lo pedido (para no romper el ERP)

- **adelantos:** se agregó el rol `planilla` (además de creador, gerencia, tesorería). Ese rol registra y descuenta adelantos desde Planilla.
- **Tablas que se quedaban sin ninguna policy** al borrar "permitir todo" (ventas, condiciones_pago, cajas, movimientos_almacen, gastos, asistencia_creador) recibieron policies de reemplazo con `puede_ver()`/`mi_rol()`. Sin ellas, esas tablas quedan vacías para todos.
- **`planilla_leer`** (authenticated, `using true`) también se borra: dejaba a cualquier usuario leer la planilla.
- **`perfiles_select`** y **`perfiles_select_all`** se reemplazan por `perfiles_select_own`.
- **`revoke execute ... from public, anon`** en `mi_rol()`: revocar solo a anon no alcanza, porque EXECUTE viene de PUBLIC.
- **Efecto visible:** el dashboard de un usuario de Almacén deja de mostrar montos de ventas (ya no puede leer `ventas`).

## 7. Pendiente (no entra en este sprint)

- Las vistas `v_kardex` y `v_equipos_terminados` corren como su dueño e ignoran RLS para usuarios logueados. Se arregla con `alter view ... set (security_invoker = on)` después de probar.
- Bauchers guardados como base64 dentro de `compras` (Sprint 2).
