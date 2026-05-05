# Google Sheets Summary Sync

La integracion con Google Sheets es solo de salida. Supabase sigue siendo la fuente principal de datos.

## Flujo

1. Un usuario `admin` o `tecnico` guarda una calibracion/control en la app.
2. La app guarda el evento completo en Supabase.
3. Si Supabase confirma el guardado, la app arma un resumen minimo del evento.
4. La app llama a la Edge Function `sync-sheets-event`.
5. La Edge Function valida el usuario y reenvia el resumen al Web App de Google Apps Script.
6. Apps Script actualiza `Eventos`, `Equipos` y `Resumen`.

Las fechas se reciben ya formateadas como `dd/mm/aaaa hh:mm` para evitar valores ISO UTC en la planilla. La app intenta enviarlas asi y la Edge Function vuelve a normalizarlas antes de reenviar a Apps Script.

## Secrets requeridos en Supabase

- `SERVICE_ROLE_KEY`: ya usado por funciones administrativas.
- `GOOGLE_SHEETS_WEBHOOK_URL`: URL del Web App publicado en Apps Script.
- `GOOGLE_SHEETS_TOKEN`: token compartido entre Edge Function y Apps Script.

## Apps Script recomendado

Configurar una propiedad de script llamada `CALIBRA_SHEETS_TOKEN` con el mismo valor que `GOOGLE_SHEETS_TOKEN`.

Este script:

- genera un `Codigo equipo` corto (`EQ-001`, `EQ-002`, etc.);
- migra hojas existentes que todavia tengan `ID equipo` largo;
- mantiene el ID interno de Supabase solo en `Equipos` y lo oculta;
- actualiza/crea `Eventos` y `Equipos`;
- genera `Resumen` automaticamente;
- aplica colores y formato visual alineados a la app.

Despues de pegarlo en Apps Script, se puede ejecutar manualmente `setupCalibraSheets()` una vez para crear/migrar/formatear las hojas sin esperar a un evento nuevo.

```js
const COLORS = {
  ink: '#0c0b11',
  paper: '#f0efeb',
  paperStrong: '#faf9f6',
  orange: '#ff5949',
  orangeDark: '#d94135',
  grey: '#737074',
  success: '#1f8f5f',
  warning: '#c98500',
  error: '#c43b30',
}

const EVENT_HEADERS = [
  'ID evento',
  'Fecha evento',
  'Codigo equipo',
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
  'Codigo equipo',
  'ID interno equipo',
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

function setupCalibraSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const eventsSheet = getSheet(ss, 'Eventos', EVENT_HEADERS)
  const equipmentSheet = getSheet(ss, 'Equipos', EQUIPMENT_HEADERS)
  const summarySheet = getSheet(ss, 'Resumen', ['Indicador', 'Valor'])

  migrateLegacySheets(eventsSheet, equipmentSheet)
  rebuildSummary(summarySheet, equipmentSheet, eventsSheet)
  formatWorkbook(ss)
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}')
    const expectedToken = PropertiesService.getScriptProperties().getProperty('CALIBRA_SHEETS_TOKEN')
    if (!expectedToken || body.token !== expectedToken) throw new Error('Unauthorized')
    if (!body.event || !body.event.id) throw new Error('Missing event')

    const ss = SpreadsheetApp.getActiveSpreadsheet()
    const eventsSheet = getSheet(ss, 'Eventos', EVENT_HEADERS)
    const equipmentSheet = getSheet(ss, 'Equipos', EQUIPMENT_HEADERS)
    const summarySheet = getSheet(ss, 'Resumen', ['Indicador', 'Valor'])
    migrateLegacySheets(eventsSheet, equipmentSheet)

    const event = body.event
    const equipmentCode = getOrCreateEquipmentCode(equipmentSheet, event.equipmentId)

    upsertEvent(eventsSheet, event, equipmentCode)
    upsertEquipment(equipmentSheet, eventsSheet, event, equipmentCode)
    rebuildSummary(summarySheet, equipmentSheet, eventsSheet)
    formatWorkbook(ss)

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

function migrateLegacySheets(eventsSheet, equipmentSheet) {
  migrateLegacyEquipmentSheet(equipmentSheet)
  migrateLegacyEventsSheet(eventsSheet, equipmentSheet)
  ensureHeaders(eventsSheet, EVENT_HEADERS)
  ensureHeaders(equipmentSheet, EQUIPMENT_HEADERS)
}

function migrateLegacyEquipmentSheet(sheet) {
  const firstHeader = String(sheet.getRange(1, 1).getValue())
  const secondHeader = String(sheet.getRange(1, 2).getValue())
  if (firstHeader !== 'ID equipo' || secondHeader === 'ID interno equipo') return

  sheet.insertColumnBefore(1)
  ensureHeaders(sheet, EQUIPMENT_HEADERS)

  const lastRow = sheet.getLastRow()
  if (lastRow < 2) return

  for (let row = 2; row <= lastRow; row += 1) {
    sheet.getRange(row, 1).setValue(`EQ-${String(row - 1).padStart(3, '0')}`)
  }
}

function migrateLegacyEventsSheet(eventsSheet, equipmentSheet) {
  const thirdHeader = String(eventsSheet.getRange(1, 3).getValue())
  if (thirdHeader !== 'ID equipo') return

  eventsSheet.getRange(1, 3).setValue('Codigo equipo')
  const lastRow = eventsSheet.getLastRow()
  if (lastRow < 2) return

  const codeByInternalId = getEquipmentCodeMap(equipmentSheet)
  const equipmentIds = eventsSheet.getRange(2, 3, lastRow - 1, 1).getValues()
  const migratedIds = equipmentIds.map((row) => [codeByInternalId[String(row[0])] || row[0]])
  eventsSheet.getRange(2, 3, migratedIds.length, 1).setValues(migratedIds)
}

function getEquipmentCodeMap(sheet) {
  const lastRow = sheet.getLastRow()
  if (lastRow < 2) return {}

  return sheet.getRange(2, 1, lastRow - 1, 2).getValues().reduce((map, row) => {
    const code = String(row[0])
    const internalId = String(row[1])
    if (code && internalId) map[internalId] = code
    return map
  }, {})
}

function ensureHeaders(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
}

function getOrCreateEquipmentCode(sheet, internalId) {
  const existingRow = findRowByValue(sheet, 2, internalId)
  if (existingRow > 0) return String(sheet.getRange(existingRow, 1).getValue())

  const lastRow = sheet.getLastRow()
  if (lastRow < 2) return 'EQ-001'

  const codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat()
  const maxNumber = codes.reduce((max, code) => {
    const match = String(code).match(/^EQ-(\d+)$/)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `EQ-${String(maxNumber + 1).padStart(3, '0')}`
}

function upsertEvent(sheet, event, equipmentCode) {
  const row = [
    event.id,
    event.eventDate,
    equipmentCode,
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

function upsertEquipment(sheet, eventsSheet, event, equipmentCode) {
  const eventCount = countEventsForEquipment(eventsSheet, equipmentCode)
  const row = [
    equipmentCode,
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
  const rowIndex = findRowByValue(sheet, 2, event.equipmentId)
  if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row])
  else sheet.appendRow(row)
}

function rebuildSummary(sheet, equipmentSheet, eventsSheet) {
  const equipmentRows = getDataRows(equipmentSheet)
  const eventRows = getDataRows(eventsSheet)
  const currentMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/yyyy')
  const monthEvents = eventRows.filter((row) => String(row[1]).includes(currentMonth)).length
  const openDeviations = equipmentRows.filter((row) => String(row[6]).toLowerCase().includes('fuera')).length
  const calibrated = equipmentRows.filter((row) => String(row[6]).toLowerCase().includes('calibrada')).length
  const conform = equipmentRows.filter((row) => String(row[6]).toLowerCase().includes('conforme')).length

  sheet.clear()
  sheet.getRange(1, 1, 1, 2).setValues([['Indicador', 'Valor']])
  sheet.getRange(2, 1, 8, 2).setValues([
    ['Equipos registrados', equipmentRows.length],
    ['Eventos registrados', eventRows.length],
    ['Eventos del mes', monthEvents],
    ['Equipos fuera de tolerancia', openDeviations],
    ['Equipos calibrados', calibrated],
    ['Controles conformes', conform],
    ['Ultima actualizacion', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')],
    ['Accion recomendada', openDeviations > 0 ? 'Revisar desvios abiertos' : 'Seguimiento normal'],
  ])
}

function getDataRows(sheet) {
  const lastRow = sheet.getLastRow()
  const lastColumn = sheet.getLastColumn()
  if (lastRow < 2 || lastColumn < 1) return []
  return sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues()
}

function findRowByValue(sheet, column, value) {
  const lastRow = sheet.getLastRow()
  if (lastRow < 2) return -1
  const values = sheet.getRange(2, column, lastRow - 1, 1).getValues()
  const index = values.findIndex((row) => String(row[0]) === String(value))
  return index >= 0 ? index + 2 : -1
}

function countEventsForEquipment(sheet, equipmentCode) {
  const lastRow = sheet.getLastRow()
  if (lastRow < 2) return 0
  return sheet
    .getRange(2, 3, lastRow - 1, 1)
    .getValues()
    .filter((row) => String(row[0]) === String(equipmentCode)).length
}

function formatWorkbook(ss) {
  formatSheet(ss.getSheetByName('Eventos'), 'Eventos')
  formatSheet(ss.getSheetByName('Equipos'), 'Equipos')
  formatSheet(ss.getSheetByName('Resumen'), 'Resumen')
}

function formatSheet(sheet, name) {
  if (!sheet) return
  const lastRow = sheet.getLastRow()
  const lastColumn = sheet.getLastColumn()
  if (lastRow < 1 || lastColumn < 1) return

  sheet.setFrozenRows(1)
  sheet.getRange(1, 1, 1, lastColumn)
    .setBackground(COLORS.ink)
    .setFontColor(COLORS.paper)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastColumn)
      .setBackground(COLORS.paperStrong)
      .setFontColor(COLORS.ink)
      .setVerticalAlignment('middle')
    colorStatusRows(sheet, name, lastRow, lastColumn)
  }

  sheet.autoResizeColumns(1, lastColumn)
  sheet.getDataRange().setBorder(true, true, true, true, true, true, '#d8d3ca', SpreadsheetApp.BorderStyle.SOLID)

  if (name === 'Equipos' && lastColumn >= 2) sheet.hideColumns(2)
  if (name === 'Resumen') {
    sheet.setColumnWidths(1, 2, 230)
    sheet.getRange('A1:B1').setBackground(COLORS.orange).setFontColor(COLORS.ink)
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 2).setFontSize(12)
  }
}

function colorStatusRows(sheet, name, lastRow, lastColumn) {
  const statusColumn = name === 'Eventos' ? 8 : name === 'Equipos' ? 7 : -1
  if (statusColumn < 1) return

  const values = sheet.getRange(2, statusColumn, lastRow - 1, 1).getValues()
  values.forEach((row, index) => {
    const status = String(row[0]).toLowerCase()
    const target = sheet.getRange(index + 2, 1, 1, lastColumn)
    if (status.includes('fuera')) target.setBackground('#f8d7d4')
    else if (status.includes('calibrada') || status.includes('conforme')) target.setBackground('#dff0e8')
    else target.setBackground(COLORS.paperStrong)
  })
}

function json(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON)
}
```

## Hoja `Alertas`

Con este enfoque, `Resumen` ya se genera automaticamente. Si se necesita una hoja `Alertas` separada, conviene crearla luego tomando como base `Equipos` y reglas propias de seguimiento.

Reglas sugeridas:

- `Fuera de tolerancia`: prioridad alta.
- Mas de X dias sin control: prioridad media.
- `Calibrada` o `Control conforme`: seguimiento normal.
