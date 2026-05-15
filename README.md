# APP-Scales

Aplicacion web para registro y trazabilidad de calibraciones de balanzas dinamicas sobre cintas transportadoras.

Version actual: `v3.0.15`.

## Incluye

- alta de balanzas
- eventos de calibracion
- wizard de 8 pasos con inspeccion previa, cero simplificado, cadena, acumulado, material real y cierre
- foto de parametros usados
- `Span con peso patron (cadena)`
- validacion con material real
- ajuste final y aprobacion tecnica
- almacenamiento local o en Supabase
- historial tecnico de calibraciones
- reporte imprimible A4 con resumen, pesos de referencia, pasadas completas y firma

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
