# Google Sheets Completo

Este flujo deja `Google Sheets` cumpliendo dos funciones:

1. `base de datos trazable`
2. `tablero operativo visible`

## Qué queda armado

### Hojas técnicas
- `Equipos`
- `Eventos de calibracion`
- `Foto de parametros`
- `Span con peso patron`
- `Validacion con material real`
- `Ajustes y aprobaciones`

### Hojas operativas
- `Ultimas calibraciones`
- `Resumen`
- `Dashboard`

## Qué muestra el Dashboard

- cantidad total de balanzas
- cantidad de eventos cargados
- balanzas fuera de tolerancia
- balanzas sin calibraciones
- últimas calibraciones por equipo
- equipos fuera de tolerancia
- últimos eventos sincronizados

## Archivo listo para pegar

Te dejé el script completo en:

- `Balanzas/GOOGLE-SHEETS-DASHBOARD.gs`

Ese archivo ya incluye:

- creación automática de hojas
- encabezados
- `ping` para probar conexión desde la app
- `upsert` para evitar duplicados
- reconstrucción de vistas operativas
- armado del `Dashboard`
- formato visual y semáforos

## Cómo conectarlo

### 1. Crear la planilla

1. Abrí una Google Sheet nueva.
2. Poné el nombre que quieras, por ejemplo: `Calibraciones Balanzas`.

### 2. Crear Apps Script

1. En la Sheet abrí `Extensiones > Apps Script`.
2. Abrí `Code.gs`.
3. Borrá todo el contenido.
4. Pegá el contenido completo de `Balanzas/GOOGLE-SHEETS-DASHBOARD.gs`.
5. Guardá el proyecto.

No hace falta crear hojas manualmente. El script lo hace solo.

### 3. Publicar Web App

1. `Implementar`
2. `Nueva implementacion`
3. Tipo: `Aplicacion web`
4. Ejecutar como: `Yo`
5. Acceso: `Cualquiera`
6. Copiá la URL del deploy

## URL integrada en la app

La app ya quedó preconfigurada con tu Web App:

```text
https://script.google.com/macros/s/AKfycbwGQ4PYavRs7B4YibAjYiKFXYjI8t6HvEcUja6fQ4ztot_pSIGpfMNHqei3rQTPsDR5/exec
```

Si redeployás Apps Script y cambia la URL, actualizala en la pestaña `Sheets` de la app.

## Flujo de uso completo

### 1. Cargar balanzas

En la app:

1. Abrí `Balanzas`
2. Cargá:
   - planta
   - línea
   - cinta
   - balanza
   - modelo y serie del controlador
   - ancho de cinta
   - largo de cinta
   - capacidad nominal
   - distancia de puente de pesaje
   - velocidad nominal
   - tipo de velocidad
   - diámetro de rolo si aplica

### 2. Crear evento de calibración

En `Nueva`:

1. elegís la balanza
2. cargás `foto de parámetros`
3. cargás `Span con peso patron (cadena)`
4. cargás `validación con material real`
5. cargás `ajuste final`
6. cargás `técnico`
7. guardás el evento

### 3. Probar conexión

En `Sheets`:

1. tocá `Probar conexion`
2. si responde bien, ya podés sincronizar

### 4. Sincronizar

Podés:

1. guardar un evento y dejar que intente enviarlo
2. o usar `Sincronizar` / `Enviar pendientes`

## Qué hace cada sincronización

Cada vez que entra un evento:

1. crea hojas faltantes si no existen
2. actualiza `Equipos`
3. actualiza `Eventos de calibracion`
4. actualiza `Foto de parametros`
5. actualiza `Span con peso patron`
6. actualiza `Validacion con material real`
7. actualiza `Ajustes y aprobaciones`
8. reconstruye `Ultimas calibraciones`
9. reconstruye `Resumen`
10. reconstruye `Dashboard`

## Estructura de datos

### `Equipos`

```text
equipmentId,plant,line,beltCode,scaleName,controllerModel,controllerSerial,beltWidthMm,beltLengthM,nominalCapacityTph,bridgeLengthM,nominalSpeedMs,speedSource,rpmRollDiameterMm,notes,createdAt
```

### `Eventos de calibracion`

```text
eventId,equipmentId,eventDate,createdAt,tolerancePercent,notes,syncStatus
```

### `Foto de parametros`

```text
eventId,calibrationFactor,zeroValue,spanValue,filterValue,bridgeLengthM,nominalSpeedMs,units,internalConstants,extraParameters,changedBy,changedReason
```

### `Span con peso patron`

```text
eventId,chainLinearKgM,passCount,avgControllerReadingKgM,avgErrorPct,provisionalFactor
```

### `Validacion con material real`

```text
eventId,externalWeightKg,beltWeightKg,errorPct,factorBefore,factorSuggested
```

### `Ajustes y aprobaciones`

```text
eventId,factorBefore,factorAfter,adjustmentReason,technician,approvedAt
```

### `Ultimas calibraciones`

```text
equipmentId,plant,line,beltCode,scaleName,lastEventId,lastEventDate,lastTechnician,lastMaterialErrorPct,lastFinalFactor,lastStatus
```

### `Resumen`

```text
metric,value
```

### `Dashboard`

No es una tabla técnica fija. Es una vista visual armada por script.

## Recomendación de operación

Para uso diario:

1. mirar `Dashboard`
2. revisar `Ultimas calibraciones`
3. entrar a hojas técnicas solo cuando haga falta trazabilidad fina

## Local

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Mejora futura recomendada

Si querés seguir puliéndolo, el siguiente paso útil sería:

1. agregar `edición de balanzas`
2. agregar `búsqueda por equipo`
3. agregar `exportación PDF` de un evento
4. agregar `botón abrir dashboard` directo desde la app
