# APP-Scales

Aplicacion web para registro y trazabilidad de calibraciones de balanzas dinamicas sobre cintas transportadoras.

## Incluye

- alta de balanzas
- eventos de calibracion
- foto de parametros usados
- `Span con peso patron (cadena)`
- validacion con material real
- ajuste final y aprobacion tecnica
- almacenamiento local o en Supabase
- historial tecnico de calibraciones

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

La integracion con Google Sheets queda pausada temporalmente.

El objetivo para la proxima etapa es redisenarla para enviar solo datos relevantes de calibracion y estado operativo de balanzas, en lugar del evento tecnico completo.

Archivos historicos conservados como referencia:

- `GOOGLE-SHEETS-SETUP.md`
- `GOOGLE-SHEETS-DASHBOARD.gs`

## Supabase

La app ahora puede usar `Supabase` como base principal de datos.

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
