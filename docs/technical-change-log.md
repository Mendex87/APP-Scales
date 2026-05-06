# Technical Change Log

Registro de decisiones tecnicas relevantes, con foco en seguridad, despliegue y trazabilidad operativa.

## 2026-05-05 - v2.0.5 - Manuales actualizados

- Contexto: los manuales HTML habian quedado atrasados respecto de `v2.0.2` a `v2.0.4`.
- Cambio: se actualizo el manual tecnico publico/fuente con `Factor final` obligatorio y el bloqueo de guardado si falta.
- Cambio: se actualizo el manual administrador fuente y el manual admin interno generado desde la app con Sheets como salida operativa, `Dashboard`, `Alertas`, `Configuracion`, codigos cortos de equipo y borrados sincronizados.
- Motivo: alinear documentacion operativa con el comportamiento actual de la app y evitar instrucciones obsoletas en campo/admin.
- Cambio: el manual tecnico HTML deja de enlazar la descarga directa del PDF estatico y ofrece imprimir/guardar PDF desde el navegador, evitando distribuir un PDF viejo.
- Pendiente: regenerar PDFs estaticos si se requiere distribuirlos fuera del HTML, ya que el repo no tiene script automatizado de generacion PDF.
- Verificacion requerida: correr `npm run build`, abrir `/manual/tecnico/` y abrir el manual admin interno desde una sesion admin.

## 2026-05-05 - v2.0.4 - Factor final obligatorio

- Contexto: el evento podia guardarse sin completar `Factor final` porque la app usaba valores de respaldo como el factor usado en la pasada, sugerido o anterior.
- Cambio: la validacion de cierre exige `Factor final > 0` y muestra un bloqueo si falta.
- Cambio: el valor guardado como `finalAdjustment.factorAfter` sale del campo `Factor final`, no de un fallback automatico.
- Motivo: asegurar que el tecnico confirme explicitamente el factor que queda cargado en el controlador al cerrar el evento.
- Verificacion requerida: intentar guardar un evento sin `Factor final`; debe aparecer el bloqueo y no debe persistirse en Supabase.

## 2026-05-05 - v2.0.3 - Pulido UX responsive

- Contexto: la identidad visual estaba estable, pero la experiencia podia mejorar en navegacion, formularios largos y uso movil en campo.
- Cambio: se ajusto la navegacion principal para escritorio y movil, se agrego progreso visual al wizard y scroll automatico al cambiar de pantalla/paso.
- Cambio: se agregaron labels enlazados con `useId`, foco visible y mejoras de tactilidad/legibilidad en inputs, tarjetas, metricas y acciones.
- Motivo: reducir friccion operativa sin cambiar la arquitectura ni el lenguaje visual industrial ya establecido.
- Verificacion requerida: correr `npm run build` y probar dashboard, balanzas, wizard, herramientas e historial en escritorio y viewport movil.

## 2026-05-05 - Google Sheets - Reparacion automatica desde doPost

- Contexto: la planilla podia quedar sin actualizar si no se ejecutaba manualmente `setupCalibraSheets()` despues de pegar el script, y algunas hojas existentes podian conservar UUIDs en la columna visible de equipo.
- Cambio: el Apps Script documentado ahora ejecuta reparacion de estructura y codigos desde `doPost` en cada evento recibido, ademas de mantener `setupCalibraSheets()` como accion manual opcional.
- Cambio: se agrego reparacion defensiva para convertir UUIDs visibles o estados intermedios a `Codigo equipo` (`EQ-001`, etc.) y reescribir `Eventos` con el codigo corto cuando exista el mapeo.
- Motivo: que Google Sheets se mantenga alineado automaticamente sin depender de una accion manual posterior al deploy del script.
- Verificacion requerida: actualizar Apps Script, guardar un evento nuevo sin ejecutar `setupCalibraSheets()` y confirmar que `Eventos`, `Equipos`, `Alertas` y `Dashboard` se creen/formateen y usen `Codigo equipo` corto.

## 2026-05-05 - v2.0.2 - Borrados sincronizados con Sheets

- Contexto: Supabase elimina eventos y equipos desde la app, pero Google Sheets solo recibia altas/actualizaciones de eventos.
- Cambio: la app envia acciones `delete_event` y `delete_equipment` a la Edge Function despues de borrados exitosos en Supabase.
- Cambio: la Edge Function reenvia la accion a Apps Script y restringe borrados a rol `admin`; `upsert_event` sigue permitido para `admin` y `tecnico`.
- Cambio: el Apps Script documentado elimina filas de `Eventos`/`Equipos` y reconstruye `Alertas` y `Dashboard` desde las hojas vigentes.
- Motivo: mantener Google Sheets como espejo operativo de Supabase tambien cuando se eliminan registros.
- Verificacion requerida: desplegar la Edge Function, actualizar Apps Script, borrar un evento y una balanza de prueba; Sheets debe remover filas y actualizar KPIs.

## 2026-05-05 - Google Sheets - Alertas por error absoluto

- Contexto: el error final puede ser positivo o negativo; una configuracion de `1%` debe alertar tanto `+1%` como `-1%`.
- Cambio: el Apps Script documentado calcula alertas por error usando valor absoluto (`Math.abs`) y compara `>= Tolerancia alerta %`.
- Motivo: evitar que desvios negativos queden fuera del tablero operativo de Google Sheets.
- Verificacion requerida: en `Configuracion`, dejar `Tolerancia alerta % = 1` y confirmar que `Alertas` se genere para errores `-1`, `-1.2`, `1` y `1.2`.

## 2026-05-05 - Google Sheets - Codigo corto de equipo

- Contexto: el `ID equipo` interno enviado a Google Sheets es un UUID largo, poco legible para operacion.
- Decision: no cambiar el ID real de Supabase ni las claves usadas por eventos/fotos; Apps Script genera un `Codigo equipo` corto (`EQ-001`, `EQ-002`, etc.) solo para la planilla.
- Cambio: `docs/google-sheets-summary-sync.md` documenta un Apps Script que migra hojas existentes, oculta `ID interno equipo`, actualiza `Eventos`/`Equipos`, crea `Dashboard`, genera `Alertas` y agrega `Configuracion` editable desde Sheets.
- Motivo: mejorar lectura en Google Sheets sin migrar base de datos, eventos historicos, relaciones ni rutas de fotos en Storage.
- Verificacion requerida: pegar el script en Apps Script, ejecutar `setupCalibraSheets()` una vez y confirmar que `Eventos` use `Codigo equipo`, `Equipos` oculte `ID interno equipo`, `Dashboard` muestre KPIs y `Alertas` respete `Configuracion`.

## 2026-05-05 - v2.0.1 - Fecha de evento legible en Sheets

- Contexto: `Fecha sincronizacion` ya llegaba en formato legible, pero `Fecha evento` seguia llegando como ISO en Google Sheets.
- Cambio: la Edge Function `sync-sheets-event` normaliza `eventDate` y `syncedAt` a `dd/mm/aaaa hh:mm` antes de llamar al Web App de Apps Script.
- Motivo: corregir la presentacion en Sheets sin modificar los timestamps almacenados en Supabase.
- Verificacion requerida: desplegar la Edge Function y guardar un evento; Sheets debe mostrar `Fecha evento` como `05/05/2026 00:08`.

## 2026-05-04 - v2.0.0 - Corte estable operativo

- Contexto: la app ya opera con Supabase, roles, manual admin interno, manual tecnico publico, dashboard corregido y resumen automatico hacia Google Sheets.
- Cambio: se subio la version a `v2.0.0` como corte estable del avance funcional.
- Cambio: el payload enviado a Google Sheets formatea `Fecha evento` y `Fecha sincronizacion` como `dd/mm/aaaa hh:mm` para lectura operativa en planilla.
- Motivo: cerrar la etapa v1.x y dejar Google Sheets con fechas legibles sin perder timestamps ISO internos en Supabase.
- Verificacion requerida: guardar una calibracion y confirmar que Sheets muestre fechas como `05/05/2026 00:08`.

## 2026-05-04 - v1.1.24 - Resumen automatico a Google Sheets

- Contexto: Google Sheets debe funcionar como tablero externo resumido, sin replicar el detalle completo de Supabase.
- Cambio: al guardar un evento en Supabase, la app construye un resumen minimo y llama a la Edge Function `sync-sheets-event`.
- Cambio: la Edge Function valida usuario autenticado con rol `admin` o `tecnico` y reenvia el resumen al Web App de Google Apps Script usando `GOOGLE_SHEETS_WEBHOOK_URL` y `GOOGLE_SHEETS_TOKEN`.
- Cambio: se documento el Apps Script base en `docs/google-sheets-summary-sync.md` para actualizar `Eventos` y `Equipos`; `Alertas` queda para reglas propias de Sheets.
- Motivo: mantener Supabase como fuente principal y exportar un registro por calibracion, evitando cargas masivas y datos excesivos.
- Verificacion requerida: configurar secrets, desplegar la Edge Function, publicar el Apps Script y guardar una calibracion de prueba.

## 2026-05-04 - v1.1.23 - Acceso tecnico desde manual admin

- Contexto: el administrador necesita consultar tanto la guia interna como el procedimiento tecnico de campo desde su sesion.
- Cambio: se agregaron enlaces al manual tecnico publico dentro del manual admin generado en la app.
- Motivo: facilitar soporte y supervision sin volver a publicar el manual admin como recurso estatico.
- Verificacion requerida: ingresar como admin, abrir `Manual` y comprobar que `Abrir manual tecnico` abre `/manual/tecnico/`.

## 2026-05-04 - v1.1.22 - Manual admin interno ampliado

- Contexto: al retirar el PDF/HTML administrador de `public`, el reemplazo interno habia quedado demasiado resumido para uso real.
- Cambio: se amplio el manual generado en app para admin con indice, roles, gestion de usuarios, balanzas, cadenas, calibraciones, historial, Supabase/RLS, Vercel, acciones destructivas y checklist.
- Motivo: mantener el cierre de exposicion publica sin perder documentacion administrativa util para operacion y soporte.
- Verificacion requerida: ingresar con rol `admin`, abrir `Manual`, revisar contenido y probar `Imprimir o guardar PDF`.

## 2026-05-04 - v1.1.21 - Endurecimiento publico y manual admin interno

- Contexto: el manual administrador habia quedado como recurso estatico bajo `public`, por lo que podia abrirse por URL directa aunque no estuviera enlazado publicamente.
- Cambio: se eliminaron los archivos publicos `public/manual-admin.pdf` y `public/manual/admin/index.html`.
- Cambio: Vercel redirige `/manual/admin`, `/manual/admin/`, `/manual/admin/:path*` y `/manual-admin.pdf` hacia `/manual/tecnico/`.
- Cambio: el boton `Manual` de usuarios `admin` genera una guia administrativa dentro de la app autenticada, sin depender de un archivo estatico publico.
- Cambio: se agregaron headers de seguridad globales en `vercel.json`: `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`.
- Motivo: reducir exposicion de informacion administrativa, evitar indexacion accidental, limitar clickjacking y bloquear permisos del navegador que la app no usa.
- Verificacion requerida: correr `npm run build`, desplegar en Vercel y confirmar que `/manual/admin` y `/manual-admin.pdf` redirigen al manual tecnico.

## 2026-05-04 - v1.1.20 - Desvios abiertos por balanza

- Contexto: el dashboard contaba eventos historicos fuera de tolerancia, aunque una calibracion posterior hubiera corregido el equipo.
- Cambio: el KPI `Fuera tolerancia` ahora cuenta solo balanzas cuyo ultimo evento esta fuera de tolerancia.
- Motivo: el dashboard debe representar el estado actual del parque; el historial conserva los desvíos antiguos como trazabilidad.
