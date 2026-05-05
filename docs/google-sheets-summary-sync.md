# Google Sheets Summary Sync

La integracion con Google Sheets es solo de salida. Supabase sigue siendo la fuente principal de datos.

## Flujo

1. Un usuario `admin` o `tecnico` guarda una calibracion/control en la app.
2. La app guarda el evento completo en Supabase.
3. Si Supabase confirma el guardado, la app arma un resumen minimo del evento.
4. La app llama a la Edge Function `sync-sheets-event`.
5. La Edge Function valida el usuario y reenvia el resumen al Web App de Google Apps Script.
6. Apps Script actualiza `Eventos` y `Equipos`.
7. La hoja `Alertas` se trabaja aparte dentro de Google Sheets con Apps Script o formulas.

Las fechas se reciben ya formateadas como `dd/mm/aaaa hh:mm` para evitar valores ISO UTC en la planilla. La app intenta enviarlas asi y la Edge Function vuelve a normalizarlas antes de reenviar a Apps Script.

## Secrets requeridos en Supabase

- `SERVICE_ROLE_KEY`: ya usado por funciones administrativas.
- `GOOGLE_SHEETS_WEBHOOK_URL`: URL del Web App publicado en Apps Script.
- `GOOGLE_SHEETS_TOKEN`: token compartido entre Edge Function y Apps Script.

## Hoja `Eventos`

Columnas recomendadas:

```txt
ID evento
Fecha evento
ID equipo
Planta
Linea
Cinta
Nombre balanza
Tipo resultado
Error final %
Tolerancia %
Dentro tolerancia
Peso real final kg
Peso indicado final kg
Inspeccion OK
Tecnico
Diagnostico resumido
Observaciones resumidas
Fecha sincronizacion
```

## Hoja `Equipos`

Columnas recomendadas:

```txt
ID equipo
Planta
Linea
Cinta
Nombre balanza
Estado actual
Ultimo evento
Fecha ultimo evento
Ultimo resultado
Ultimo error %
Ultimo factor final
Tecnico ultimo evento
Cantidad eventos
```

## Apps Script base

Configurar una propiedad de script llamada `CALIBRA_SHEETS_TOKEN` con el mismo valor que `GOOGLE_SHEETS_TOKEN`.

```js
const EVENT_HEADERS = [
  'ID evento',
  'Fecha evento',
  'ID equipo',
  'Planta',
  'Linea',
  'Cinta',
  'Nombre balanza',
  'Tipo resultado',
  'Error final %',
  'Tolerancia %',
  'Dentro tolerancia',
  'Peso real final kg',
  'Peso indicado final kg',
  'Inspeccion OK',
  'Tecnico',
  'Diagnostico resumido',
  'Observaciones resumidas',
  'Fecha sincronizacion',
]

const EQUIPMENT_HEADERS = [
  'ID equipo',
  'Planta',
  'Linea',
  'Cinta',
  'Nombre balanza',
  'Estado actual',
  'Ultimo evento',
  'Fecha ultimo evento',
  'Ultimo resultado',
  'Ultimo error %',
  'Ultimo factor final',
  'Tecnico ultimo evento',
  'Cantidad eventos',
]

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}')
    const expectedToken = PropertiesService.getScriptProperties().getProperty('CALIBRA_SHEETS_TOKEN')
    if (!expectedToken || body.token !== expectedToken) throw new Error('Unauthorized')
    if (!body.event || !body.event.id) throw new Error('Missing event')

    const ss = SpreadsheetApp.getActiveSpreadsheet()
    const eventsSheet = getSheet(ss, 'Eventos', EVENT_HEADERS)
    const equipmentSheet = getSheet(ss, 'Equipos', EQUIPMENT_HEADERS)

    upsertEvent(eventsSheet, body.event)
    upsertEquipment(equipmentSheet, eventsSheet, body.event)

    return json({ ok: true, message: 'Resumen recibido en Google Sheets.' })
  } catch (error) {
    return json({ ok: false, message: String(error.message || error) })
  }
}

function getSheet(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name)
  if (sheet.getLastRow() === 0) sheet.appendRow(headers)
  return sheet
}

function upsertEvent(sheet, event) {
  const row = [
    event.id,
    event.eventDate,
    event.equipmentId,
    event.plant,
    event.line,
    event.beltCode,
    event.scaleName,
    event.result,
    event.finalErrorPct,
    event.tolerancePct,
    event.withinTolerance ? 'Si' : 'No',
    event.finalExternalWeightKg,
    event.finalBeltWeightKg,
    event.inspectionOk ? 'Si' : 'No',
    event.technician,
    event.diagnosisSummary,
    event.notesSummary,
    event.syncedAt,
  ]
  const rowIndex = findRowByValue(sheet, 1, event.id)
  if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row])
  else sheet.appendRow(row)
}

function upsertEquipment(sheet, eventsSheet, event) {
  const eventCount = countEventsForEquipment(eventsSheet, event.equipmentId)
  const row = [
    event.equipmentId,
    event.plant,
    event.line,
    event.beltCode,
    event.scaleName,
    event.result,
    event.id,
    event.eventDate,
    event.result,
    event.finalErrorPct,
    event.finalFactor,
    event.technician,
    eventCount,
  ]
  const rowIndex = findRowByValue(sheet, 1, event.equipmentId)
  if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row])
  else sheet.appendRow(row)
}

function findRowByValue(sheet, column, value) {
  const lastRow = sheet.getLastRow()
  if (lastRow < 2) return -1
  const values = sheet.getRange(2, column, lastRow - 1, 1).getValues()
  const index = values.findIndex((row) => String(row[0]) === String(value))
  return index >= 0 ? index + 2 : -1
}

function countEventsForEquipment(sheet, equipmentId) {
  const lastRow = sheet.getLastRow()
  if (lastRow < 2) return 0
  return sheet
    .getRange(2, 3, lastRow - 1, 1)
    .getValues()
    .filter((row) => String(row[0]) === String(equipmentId)).length
}

function json(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON)
}
```

## Nota sobre `Alertas`

La hoja `Alertas` no se envia desde la app. Conviene generarla en Google Sheets tomando como base `Equipos` y reglas propias de seguimiento.
