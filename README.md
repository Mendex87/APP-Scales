# APP-Scales

Aplicacion web para registro y trazabilidad de calibraciones de balanzas dinamicas sobre cintas transportadoras.

## Incluye

- alta de balanzas
- eventos de calibracion
- foto de parametros usados
- `Span con peso patron (cadena)`
- validacion con material real
- ajuste final y aprobacion tecnica
- sincronizacion con Google Sheets
- dashboard operativo dentro de Google Sheets

## Desarrollo local

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Google Sheets

Archivos relacionados:

- `GOOGLE-SHEETS-SETUP.md`
- `GOOGLE-SHEETS-DASHBOARD.gs`

La app ya soporta:

- prueba de conexion por `ping`
- sincronizacion de eventos
- reconstruccion de hojas operativas
- dashboard visual

## Deploy recomendado

La opcion mas simple es desplegar esta app en `Vercel` como sitio `Vite + React`.

Configuracion esperada:

- Build command: `npm run build`
- Output directory: `dist`
