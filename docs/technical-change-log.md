# Technical Change Log

Registro de decisiones tecnicas relevantes, con foco en seguridad, despliegue y trazabilidad operativa.

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
