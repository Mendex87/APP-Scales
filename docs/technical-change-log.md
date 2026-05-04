# Technical Change Log

Registro de decisiones tecnicas relevantes, con foco en seguridad, despliegue y trazabilidad operativa.

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
