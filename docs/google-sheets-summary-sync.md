# Google Sheets Summary Sync

La integracion con Google Sheets es solo de salida. Supabase sigue siendo la fuente principal de datos.

## Flujo

1. Un usuario `admin` o `tecnico` guarda una calibracion/control en la app.
2. La app guarda el evento completo en Supabase.
3. Si Supabase confirma el guardado, la app arma un resumen minimo del evento.
4. La app llama a la Edge Function `sync-sheets-event`.
5. La Edge Function valida el usuario y reenvia el resumen al Web App de Google Apps Script.
6. Apps Script actualiza `Eventos`, `Equipos`, `Alertas`, `Dashboard` y `Configuracion`.

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
- crea `Configuracion` editable desde Sheets;
- crea `Dashboard` con el resumen operativo;
- crea `Alertas` automaticamente segun reglas configurables;
- aplica colores y formato visual alineados a la app.

Despues de pegarlo en Apps Script, ejecutar manualmente `setupCalibraSheets()` una vez para crear/migrar/formatear las hojas sin esperar a un evento nuevo.

```js
const DEFAULT_COLORS = {
  ink: '#0c0b11',
  paper: '#f0efeb',
  paperStrong: '#faf9f6',
  orange: '#ff5949',
  orangeDark: '#d94135',
  grey: '#737074',
  success: '#1f8f5f',
  warning: '#c98500',
  error: '#c43b30',
  border: '#d8d3ca',
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

const ALERT_HEADERS = [
  'Prioridad',
  'Estado',
  'Codigo equipo',
  'Planta',
  'Linea',
  'Cinta',
  'Nombre balanza',
  'Motivo',
  'Ultimo evento',
  'Fecha ultimo evento',
  'Error final %',
  'Tecnico',
  'Accion recomendada',
]

const CONFIG_HEADERS = ['Parametro', 'Valor', 'Descripcion']

const DEFAULT_CONFIG = [
  ['Empresa', 'ENERBLOCK', 'Titulo principal del dashboard'],
  ['Subtitulo dashboard', 'Tablero operativo de calibracion de cintas', 'Texto debajo del titulo'],
  ['Tolerancia alerta %', '1', 'Alerta si el error absoluto es mayor o igual a este valor'],
  ['Dias sin control', '30', 'Alerta si un equipo supera esta cantidad de dias sin evento'],
  ['Regla fuera tolerancia activa', 'Si', 'Activa alertas por estado fuera de tolerancia'],
  ['Regla error alto activa', 'Si', 'Activa alertas por error positivo o negativo fuera de Tolerancia alerta %'],
  ['Regla sin control activa', 'Si', 'Activa alertas por dias sin control'],
  ['Mostrar alertas cerradas', 'No', 'Reservado para futuros flujos manuales'],
  ['Color principal', DEFAULT_COLORS.orange, 'Color naranja de la app'],
  ['Color fondo', DEFAULT_COLORS.paper, 'Color de fondo calido'],
  ['Color fondo fuerte', DEFAULT_COLORS.paperStrong, 'Color de tarjetas/filas'],
  ['Color texto', DEFAULT_COLORS.ink, 'Color principal de texto'],
  ['Color correcto', DEFAULT_COLORS.success, 'Color de estados OK'],
  ['Color advertencia', DEFAULT_COLORS.warning, 'Color de advertencias'],
  ['Color error', DEFAULT_COLORS.error, 'Color de alertas criticas'],
]

function setupCalibraSheets() {
  const context = getWorkbookContext()
  migrateLegacySheets(context.eventsSheet, context.equipmentSheet)
  ensureConfig(context.configSheet)
  rebuildAlerts(context.alertsSheet, context.equipmentSheet, context.config)
  rebuildDashboard(context.dashboardSheet, context.equipmentSheet, context.eventsSheet, context.alertsSheet, context.config)
  hideLegacySummary(context.ss)
  formatWorkbook(context)
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}')
    const expectedToken = PropertiesService.getScriptProperties().getProperty('CALIBRA_SHEETS_TOKEN')
    if (!expectedToken || body.token !== expectedToken) throw new Error('Unauthorized')
    if (!body.event || !body.event.id) throw new Error('Missing event')

    const context = getWorkbookContext()
    migrateLegacySheets(context.eventsSheet, context.equipmentSheet)
    ensureConfig(context.configSheet)

    const event = body.event
    const equipmentCode = getOrCreateEquipmentCode(context.equipmentSheet, event.equipmentId)

    upsertEvent(context.eventsSheet, event, equipmentCode)
    upsertEquipment(context.equipmentSheet, context.eventsSheet, event, equipmentCode)
    rebuildAlerts(context.alertsSheet, context.equipmentSheet, context.config)
    rebuildDashboard(context.dashboardSheet, context.equipmentSheet, context.eventsSheet, context.alertsSheet, context.config)
    hideLegacySummary(context.ss)
    formatWorkbook(context)

    return json({ ok: true, message: 'Evento recibido en Google Sheets.' })
  } catch (error) {
    return json({ ok: false, message: String(error.message || error) })
  }
}

function getWorkbookContext() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const eventsSheet = getSheet(ss, 'Eventos', EVENT_HEADERS)
  const equipmentSheet = getSheet(ss, 'Equipos', EQUIPMENT_HEADERS)
  const configSheet = getSheet(ss, 'Configuracion', CONFIG_HEADERS)
  ensureConfig(configSheet)
  const config = getConfig(configSheet)

  return {
    ss,
    eventsSheet,
    equipmentSheet,
    configSheet,
    alertsSheet: getSheet(ss, 'Alertas', ALERT_HEADERS),
    dashboardSheet: getSheet(ss, 'Dashboard', ['Indicador', 'Valor']),
    config,
  }
}

function getSheet(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name)
  if (sheet.getLastRow() === 0) sheet.appendRow(headers)
  return sheet
}

function ensureConfig(sheet) {
  ensureHeaders(sheet, CONFIG_HEADERS)
  const existing = getConfig(sheet)
  const rowsToAdd = DEFAULT_CONFIG.filter((row) => !Object.prototype.hasOwnProperty.call(existing, row[0]))
  if (rowsToAdd.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 3).setValues(rowsToAdd)
}

function getConfig(sheet) {
  const rows = getDataRows(sheet)
  return rows.reduce((config, row) => {
    const key = String(row[0] || '').trim()
    if (key) config[key] = row[1]
    return config
  }, {})
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

function rebuildAlerts(sheet, equipmentSheet, config) {
  const rows = getDataRows(equipmentSheet)
  const tolerance = toNumber(config['Tolerancia alerta %'], 1)
  const maxDays = toNumber(config['Dias sin control'], 30)
  const enableOutOfTolerance = isYes(config['Regla fuera tolerancia activa'])
  const enableHighError = isYes(config['Regla error alto activa'])
  const enableStale = isYes(config['Regla sin control activa'])
  const alerts = []

  rows.forEach((row) => {
    const equipment = toEquipmentObject(row)
    const status = equipment.status.toLowerCase()
    const signedError = toNumber(equipment.error, 0)
    const absoluteError = Math.abs(signedError)
    const daysSince = getDaysSince(equipment.lastDate)

    if (enableOutOfTolerance && status.includes('fuera')) {
      alerts.push(buildAlert('Alta', equipment, 'Fuera de tolerancia', 'Revisar/calibrar'))
    } else if (enableHighError && absoluteError >= tolerance) {
      alerts.push(buildAlert('Alta', equipment, `Error fuera de +/-${tolerance}%`, 'Verificar ajuste y repetir pasada'))
    }

    if (enableStale && daysSince !== null && daysSince > maxDays) {
      alerts.push(buildAlert('Media', equipment, `Sin control hace ${daysSince} dias`, 'Programar control preventivo'))
    }
  })

  sheet.clear()
  ensureHeaders(sheet, ALERT_HEADERS)
  if (alerts.length > 0) sheet.getRange(2, 1, alerts.length, ALERT_HEADERS.length).setValues(alerts)
}

function buildAlert(priority, equipment, reason, action) {
  return [
    priority,
    'Abierta',
    equipment.code,
    equipment.plant,
    equipment.line,
    equipment.belt,
    equipment.name,
    reason,
    equipment.lastEvent,
    equipment.lastDate,
    equipment.error,
    equipment.technician,
    action,
  ]
}

function toEquipmentObject(row) {
  return {
    code: row[0],
    plant: row[2],
    line: row[3],
    belt: row[4],
    name: row[5],
    status: String(row[6] || ''),
    lastEvent: row[7],
    lastDate: row[8],
    error: row[10],
    technician: row[12],
  }
}

function rebuildDashboard(sheet, equipmentSheet, eventsSheet, alertsSheet, config) {
  const equipmentRows = getDataRows(equipmentSheet)
  const eventRows = getDataRows(eventsSheet)
  const alertRows = getDataRows(alertsSheet)
  const colors = getColors(config)
  const currentMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/yyyy')
  const monthEvents = eventRows.filter((row) => String(row[1]).includes(currentMonth)).length
  const criticalAlerts = alertRows.filter((row) => String(row[0]).toLowerCase() === 'alta').length
  const mediumAlerts = alertRows.filter((row) => String(row[0]).toLowerCase() === 'media').length
  const openDeviations = equipmentRows.filter((row) => String(row[6]).toLowerCase().includes('fuera')).length
  const calibrated = equipmentRows.filter((row) => String(row[6]).toLowerCase().includes('calibrada')).length
  const conform = equipmentRows.filter((row) => String(row[6]).toLowerCase().includes('conforme')).length

  sheet.getRange('A1:F28').breakApart()
  sheet.clear()
  sheet.setHiddenGridlines(true)
  sheet.getRange('A1:F1').merge().setValue(String(config['Empresa'] || 'ENERBLOCK'))
  sheet.getRange('A2:F2').merge().setValue(String(config['Subtitulo dashboard'] || 'Tablero operativo de calibracion de cintas'))
  sheet.getRange('A4:B4').merge().setValue('Equipos')
  sheet.getRange('C4:D4').merge().setValue('Eventos')
  sheet.getRange('E4:F4').merge().setValue('Alertas abiertas')
  sheet.getRange('A5:B6').merge().setValue(equipmentRows.length)
  sheet.getRange('C5:D6').merge().setValue(eventRows.length)
  sheet.getRange('E5:F6').merge().setValue(alertRows.length)
  sheet.getRange('A8:B8').merge().setValue('Eventos del mes')
  sheet.getRange('C8:D8').merge().setValue('Fuera tolerancia')
  sheet.getRange('E8:F8').merge().setValue('Sin control / medias')
  sheet.getRange('A9:B10').merge().setValue(monthEvents)
  sheet.getRange('C9:D10').merge().setValue(openDeviations)
  sheet.getRange('E9:F10').merge().setValue(mediumAlerts)
  sheet.getRange('A12:B12').merge().setValue('Calibradas')
  sheet.getRange('C12:D12').merge().setValue('Controles conformes')
  sheet.getRange('E12:F12').merge().setValue('Criticas')
  sheet.getRange('A13:B14').merge().setValue(calibrated)
  sheet.getRange('C13:D14').merge().setValue(conform)
  sheet.getRange('E13:F14').merge().setValue(criticalAlerts)
  sheet.getRange('A16:F16').merge().setValue('Alertas principales')

  const topAlerts = alertRows.slice(0, 8).map((row) => [row[0], row[2], row[3], row[5], row[7], row[12]])
  sheet.getRange(17, 1, 1, 6).setValues([['Prioridad', 'Equipo', 'Planta', 'Cinta', 'Motivo', 'Accion']])
  if (topAlerts.length > 0) sheet.getRange(18, 1, topAlerts.length, 6).setValues(topAlerts)
  else sheet.getRange('A18:F18').merge().setValue('Sin alertas abiertas segun la configuracion actual')

  sheet.getRange('A28:F28').merge().setValue(`Ultima actualizacion: ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')}`)
  formatDashboard(sheet, colors)
}

function formatDashboard(sheet, colors) {
  sheet.setColumnWidths(1, 6, 150)
  sheet.setRowHeights(1, 28, 28)
  sheet.getRange('A1:F28').setBackground(colors.paper).setFontColor(colors.ink).setFontFamily('Arial')
  sheet.getRange('A1:F1').setBackground(colors.ink).setFontColor(colors.paper).setFontSize(24).setFontWeight('bold').setHorizontalAlignment('center')
  sheet.getRange('A2:F2').setBackground(colors.orange).setFontColor(colors.ink).setFontWeight('bold').setHorizontalAlignment('center')
  sheet.getRangeList(['A4:B4', 'C4:D4', 'E4:F4', 'A8:B8', 'C8:D8', 'E8:F8', 'A12:B12', 'C12:D12', 'E12:F12'])
    .setBackground(colors.ink)
    .setFontColor(colors.paper)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
  sheet.getRangeList(['A5:B6', 'C5:D6', 'E5:F6', 'A9:B10', 'C9:D10', 'E9:F10', 'A13:B14', 'C13:D14', 'E13:F14'])
    .setBackground(colors.paperStrong)
    .setFontColor(colors.ink)
    .setFontSize(28)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
  sheet.getRange('E5:F6').setBackground(colors.error).setFontColor(colors.paper)
  sheet.getRange('E13:F14').setBackground(colors.error).setFontColor(colors.paper)
  sheet.getRange('A16:F16').setBackground(colors.orange).setFontColor(colors.ink).setFontWeight('bold').setHorizontalAlignment('center')
  sheet.getRange('A17:F17').setBackground(colors.ink).setFontColor(colors.paper).setFontWeight('bold')
  sheet.getRange('A28:F28').setBackground(colors.ink).setFontColor(colors.paper).setHorizontalAlignment('right')
  sheet.getRange('A1:F28').setBorder(true, true, true, true, true, true, colors.border, SpreadsheetApp.BorderStyle.SOLID)
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

function formatWorkbook(context) {
  const colors = getColors(context.config)
  formatSheet(context.eventsSheet, 'Eventos', colors)
  formatSheet(context.equipmentSheet, 'Equipos', colors)
  formatSheet(context.alertsSheet, 'Alertas', colors)
  formatSheet(context.configSheet, 'Configuracion', colors)
  context.dashboardSheet.setTabColor(colors.orange)
}

function formatSheet(sheet, name, colors) {
  if (!sheet) return
  const lastRow = sheet.getLastRow()
  const lastColumn = sheet.getLastColumn()
  if (lastRow < 1 || lastColumn < 1) return

  sheet.setFrozenRows(1)
  sheet.setTabColor(name === 'Alertas' ? colors.error : name === 'Configuracion' ? colors.warning : colors.orange)
  sheet.getRange(1, 1, 1, lastColumn)
    .setBackground(colors.ink)
    .setFontColor(colors.paper)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastColumn)
      .setBackground(colors.paperStrong)
      .setFontColor(colors.ink)
      .setVerticalAlignment('middle')
    colorStatusRows(sheet, name, lastRow, lastColumn, colors)
  }

  sheet.autoResizeColumns(1, lastColumn)
  sheet.getDataRange().setBorder(true, true, true, true, true, true, colors.border, SpreadsheetApp.BorderStyle.SOLID)

  if (name === 'Equipos' && lastColumn >= 2) sheet.hideColumns(2)
  if (name === 'Configuracion') sheet.getRange(2, 2, Math.max(lastRow - 1, 1), 1).setBackground('#fff4d6')
}

function colorStatusRows(sheet, name, lastRow, lastColumn, colors) {
  const statusColumn = name === 'Eventos' ? 8 : name === 'Equipos' ? 7 : name === 'Alertas' ? 1 : -1
  if (statusColumn < 1) return

  const values = sheet.getRange(2, statusColumn, lastRow - 1, 1).getValues()
  values.forEach((row, index) => {
    const status = String(row[0]).toLowerCase()
    const target = sheet.getRange(index + 2, 1, 1, lastColumn)
    if (status.includes('alta') || status.includes('fuera')) target.setBackground('#f8d7d4')
    else if (status.includes('media')) target.setBackground('#fff0c2')
    else if (status.includes('calibrada') || status.includes('conforme')) target.setBackground('#dff0e8')
    else target.setBackground(colors.paperStrong)
  })
}

function getColors(config) {
  return {
    ink: String(config['Color texto'] || DEFAULT_COLORS.ink),
    paper: String(config['Color fondo'] || DEFAULT_COLORS.paper),
    paperStrong: String(config['Color fondo fuerte'] || DEFAULT_COLORS.paperStrong),
    orange: String(config['Color principal'] || DEFAULT_COLORS.orange),
    orangeDark: DEFAULT_COLORS.orangeDark,
    success: String(config['Color correcto'] || DEFAULT_COLORS.success),
    warning: String(config['Color advertencia'] || DEFAULT_COLORS.warning),
    error: String(config['Color error'] || DEFAULT_COLORS.error),
    border: DEFAULT_COLORS.border,
  }
}

function getDaysSince(value) {
  const date = parseSheetDate(value)
  if (!date) return null
  return Math.floor((new Date().getTime() - date.getTime()) / 86400000)
}

function parseSheetDate(value) {
  if (value instanceof Date) return value
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return null
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
}

function toNumber(value, fallback) {
  const parsed = Number(String(value || '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function isYes(value) {
  return String(value || '').trim().toLowerCase() === 'si'
}

function hideLegacySummary(ss) {
  const sheet = ss.getSheetByName('Resumen')
  if (sheet) sheet.hideSheet()
}

function json(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON)
}
```

## Hoja `Configuracion`

`Configuracion` es editable desde Google Sheets. Apps Script respeta los valores existentes y solo agrega parametros nuevos si faltan.

Parametros principales:

- `Empresa`: titulo principal del dashboard.
- `Subtitulo dashboard`: texto secundario.
- `Tolerancia alerta %`: umbral absoluto para alerta alta; `1` alerta tanto con `-1%` como con `+1%`.
- `Dias sin control`: dias maximos sin evento antes de alerta media.
- `Regla fuera tolerancia activa`: `Si`/`No`.
- `Regla error alto activa`: `Si`/`No`.
- `Regla sin control activa`: `Si`/`No`.
- `Color principal`, `Color fondo`, `Color texto`, `Color correcto`, `Color advertencia`, `Color error`: colores editables.

## Hojas generadas

- `Dashboard`: reemplaza a `Resumen`; muestra KPIs, estado operativo y alertas principales.
- `Alertas`: lista operativa generada desde `Equipos` y las reglas de `Configuracion`.
- `Eventos`: historial resumido por evento.
- `Equipos`: estado actual por equipo, con `ID interno equipo` oculto.

Si existe una hoja vieja `Resumen`, el script la oculta para evitar duplicar informacion.
