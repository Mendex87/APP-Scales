# Technical Change Log

Registro de decisiones tecnicas relevantes, con foco en seguridad, despliegue y trazabilidad operativa.

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
