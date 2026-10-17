# Edicion tecnica de balanzas — v4.2.2

## Objetivo

Permitir corregir parametros de una balanza existente desde la cuenta tecnica.
Preview: `preview-technician-equipment-edit`.

## Usuario

Tecnico de campo. Admin conserva edicion completa y baja; supervisor/viewer no obtienen permisos nuevos.

## Flujo

1. Abrir Balanzas y elegir Editar en el equipo correspondiente.
2. Corregir parametros tecnicos o la identificacion/nombre de cinta (`beltCode`).
3. Tocar Actualizar balanza; validar los campos obligatorios antes del popup.
4. Revisar Confirmar cambios de balanza. El popup identifica el equipo y muestra el nombre anterior/nuevo de la cinta si cambia.
5. Cancelar conserva el formulario sin escribir. Confirmar cambios persiste y muestra resultado; un error conserva la edicion para reintentar.

## Inputs

Equipo existente y valores actualizados: cinta, controlador/serie, ancho/largo, capacidad,
puente, velocidad/origen, diametro RPM, factores de calibracion/ajuste,
frecuencia de control y unidad del totalizador.

## Outputs

Equipo actualizado y aviso de guardado en servidor online o local segun corresponda.
Ejemplo: cinta `CT-01` pasa a `CT-01A`, velocidad nominal de `1.5` a `1.6 m/s`;
solo se persiste despues de confirmar. Cancelar deja el registro anterior intacto.

## Reglas

- Tecnico no modifica planta, linea, nombre de balanza, foto, observaciones, ID ni fecha de creacion de equipos existentes.
- Solo admin elimina equipos. No se cambian permisos de alta ni guardado de eventos de calibracion.
- La actualizacion tecnica usa UPDATE con lista explicita de campos, no UPSERT de la fila completa.
- El servidor aplica RLS por rol y un trigger protege todos los campos fuera de la lista tecnica, incluidos campos futuros.
- Frecuencia se actualiza en `check_interval_days`; no se reescribe el marcador legado de observaciones desde cuentas tecnicas. La columna tiene prioridad al leer.

## Excepciones

- Equipo eliminado o sin permiso: no mostrar exito ni recrearlo automaticamente.
- Error de servidor: conservar formulario y mostrar el error.
- Se bloquean envios repetidos mientras se guarda.
- Las calibraciones historicas y sus snapshots no se reescriben. Historial y reportes que consultan el maestro mostraran la identificacion vigente.

## Criterios de calidad

- Tecnico edita los campos autorizados y no dispone de Dar de baja.
- Cancelar el popup no produce solicitudes de escritura; confirmar guarda una vez.
- Una llamada directa al servidor que cambie un campo administrativo falla para tecnico.
- Supervisor/viewer no actualizan ni eliminan; admin mantiene sus permisos.
- `npm run build` pasa.

## Activacion y pendientes

Aplicar `supabase/technician-equipment-edit.sql` en la base destinada a validar la preview.
El script es reejecutable y no modifica datos ni politicas DELETE. El esquema completo
`supabase/schema.sql` incluye los mismos permisos para nuevas instalaciones.
No basta con desplegar el frontend: sin el SQL la edicion tecnica seguira bloqueada por el servidor.
Los HTML de manuales se actualizan; los PDF existentes no se regeneran en este cambio.

## Siguiente accion

Validar la preview con cuentas tecnico, supervisor y admin despues de aplicar el SQL.
Promover a main solo con aprobacion explicita de esta nueva preview.

## Verificacion local ejecutada

- `npm run build`: OK; warning conocido de chunks mayores a 500 kB.
- PostgreSQL embebido (PGlite), con roles y RLS: probado tanto esquema completo como migracion sobre esquema previo; migracion aplicada dos veces sin errores.
- Tecnico: UPDATE de campos permitidos OK; cambios de ID, planta, linea, nombre de balanza, foto, observaciones, fecha y una columna administrativa futura rechazados. Alta conservada; DELETE bloqueado.
- Supervisor/viewer: UPDATE, DELETE e INSERT bloqueados. Admin mantiene edicion administrativa y baja.
- Navegador Edge headless con servidor simulado y datos ficticios: tecnico en viewport movil puede editar; cancelar no escribe; confirmar envia una sola actualizacion parcial, acepta coma decimal y conserva observaciones. Validacion de cinta vacia y recuperacion del formulario ante error de servidor OK.
- Navegador: supervisor no ve Editar/Dar de baja; admin mantiene campos administrativos habilitados y boton de baja. Sin errores de ejecucion del navegador.
- Estas pruebas no aplicaron SQL ni escribieron datos en el servidor online real.
