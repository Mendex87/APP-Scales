# APP-Scales

Aplicacion web para registro y trazabilidad de calibraciones de balanzas dinamicas sobre cintas transportadoras.

Version actual: `v4.0.7`.

## Incluye

- alta de balanzas
- eventos de calibracion
- wizard de 8 pasos con inspeccion previa, cero simplificado, cadena, acumulado, material real y cierre
- foto de parametros usados con factor de calibracion actual obligatorio
- `Span con peso patron (cadena)`
- validacion con material real usando como base el factor actual del controlador
- revision final con factor de calibracion final y aprobacion tecnica
- validaciones numericas de cierre para evitar valores imposibles o pasadas incompletas
- version de app registrada en cada evento para trazabilidad
- recuperacion de contraseña por email con cooldown local para evitar reenvios repetidos
- almacenamiento local o en servidor online
- historial tecnico de calibraciones
- reporte imprimible A4 con resumen sin duplicados, pesos de referencia con error final, pasadas completas y firma
- preview de `/mapa` con planta 3D editable, puntos operativos y soporte para modelos `.glb`

## Estado de operacion

La app esta en operacion real para el flujo principal de calibraciones, historial, reportes y servidor online.

La funcionalidad `/mapa` sigue como preview en la rama `preview-plant-map`. No debe considerarse final ni documentarse en manuales publicos hasta que la vista 3D quede aprobada.

Documento interno de la preview:

- `docs/plant-map-preview.md`

## Desarrollo local

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Exportaciones

La integracion con planillas externas fue retirada del flujo operativo. La trazabilidad vigente queda en el servidor online, el historial interno y los reportes PDF/impresos por evento.

## Recuperacion de contraseña

Los usuarios pueden pedir un link desde `Olvidé mi contraseña` en la pantalla de ingreso. El envio de emails depende del SMTP configurado en Supabase; ver `SUPABASE-SETUP.md` para URLs permitidas, plantilla del correo y configuracion Resend/Brevo/SendGrid/Mailgun/SES.

## Servidor online

La app usa Supabase como proveedor tecnico del servidor online. En UI y documentacion para usuario final se debe hablar de `servidor online`.

Archivo de setup:

- `SUPABASE-SETUP.md`

Variables esperadas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Si no están configuradas, la app entra en modo local.

## Deploy recomendado

La opcion mas simple es desplegar esta app en `Vercel` como sitio `Vite + React`.

Configuracion esperada:

- Build command: `npm run build`
- Output directory: `dist`
