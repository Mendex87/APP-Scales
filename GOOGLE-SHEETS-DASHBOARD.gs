function doPost(e) {
  try {
    ensureSheets();

    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (payload && payload.action === 'ping') {
      return jsonResponse({ ok: true, message: 'Conexion correcta.' });
    }

    if (!payload || payload.action !== 'syncCalibrationEvent') {
      throw new Error('Accion no soportada.');
    }

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var equipment = payload.equipment;
    var event = payload.event;

    upsertRow(spreadsheet.getSheetByName('Equipos'), [
      equipment.id,
      equipment.plant,
      equipment.line,
      equipment.beltCode,
      equipment.scaleName,
      equipment.controllerModel,
      equipment.controllerSerial,
      equipment.beltWidthMm,
      equipment.beltLengthM,
      equipment.nominalCapacityTph,
      equipment.bridgeLengthM,
      equipment.nominalSpeedMs,
      equipment.speedSource,
      equipment.rpmRollDiameterMm,
      equipment.notes,
      equipment.createdAt
    ]);

    upsertRow(spreadsheet.getSheetByName('Eventos de calibracion'), [
      event.id,
      event.equipmentId,
      event.eventDate,
      event.createdAt,
      event.tolerancePercent,
      event.notes,
      event.syncStatus
    ]);

    upsertRow(spreadsheet.getSheetByName('Foto de parametros'), [
      event.id,
      event.parameterSnapshot.calibrationFactor,
      event.parameterSnapshot.zeroValue,
      event.parameterSnapshot.spanValue,
      event.parameterSnapshot.filterValue,
      event.parameterSnapshot.bridgeLengthM,
      event.parameterSnapshot.nominalSpeedMs,
      event.parameterSnapshot.units,
      event.parameterSnapshot.internalConstants,
      event.parameterSnapshot.extraParameters,
      event.parameterSnapshot.changedBy,
      event.parameterSnapshot.changedReason
    ]);

    upsertRow(spreadsheet.getSheetByName('Span con peso patron'), [
      event.id,
      event.chainSpan.chainLinearKgM,
      event.chainSpan.passCount,
      event.chainSpan.avgControllerReadingKgM,
      event.chainSpan.avgErrorPct,
      event.chainSpan.provisionalFactor
    ]);

    upsertRow(spreadsheet.getSheetByName('Validacion con material real'), [
      event.id,
      event.materialValidation.externalWeightKg,
      event.materialValidation.beltWeightKg,
      event.materialValidation.errorPct,
      event.materialValidation.factorBefore,
      event.materialValidation.factorSuggested
    ]);

    upsertRow(spreadsheet.getSheetByName('Ajustes y aprobaciones'), [
      event.id,
      event.finalAdjustment.factorBefore,
      event.finalAdjustment.factorAfter,
      event.finalAdjustment.reason,
      event.approval.technician,
      event.approval.approvedAt
    ]);

    refreshLatestCalibrations(spreadsheet);
    refreshSummary(spreadsheet);
    refreshDashboard(spreadsheet);

    return jsonResponse({ ok: true, eventId: event.id });
  } catch (error) {
    return jsonResponse({ ok: false, message: String(error) });
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureSheets() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheetWithHeaders(spreadsheet, 'Equipos', [
    'equipmentId','plant','line','beltCode','scaleName','controllerModel','controllerSerial','beltWidthMm','beltLengthM','nominalCapacityTph','bridgeLengthM','nominalSpeedMs','speedSource','rpmRollDiameterMm','notes','createdAt'
  ]);

  ensureSheetWithHeaders(spreadsheet, 'Eventos de calibracion', [
    'eventId','equipmentId','eventDate','createdAt','tolerancePercent','notes','syncStatus'
  ]);

  ensureSheetWithHeaders(spreadsheet, 'Foto de parametros', [
    'eventId','calibrationFactor','zeroValue','spanValue','filterValue','bridgeLengthM','nominalSpeedMs','units','internalConstants','extraParameters','changedBy','changedReason'
  ]);

  ensureSheetWithHeaders(spreadsheet, 'Span con peso patron', [
    'eventId','chainLinearKgM','passCount','avgControllerReadingKgM','avgErrorPct','provisionalFactor'
  ]);

  ensureSheetWithHeaders(spreadsheet, 'Validacion con material real', [
    'eventId','externalWeightKg','beltWeightKg','errorPct','factorBefore','factorSuggested'
  ]);

  ensureSheetWithHeaders(spreadsheet, 'Ajustes y aprobaciones', [
    'eventId','factorBefore','factorAfter','adjustmentReason','technician','approvedAt'
  ]);

  ensureSheetWithHeaders(spreadsheet, 'Ultimas calibraciones', [
    'equipmentId','plant','line','beltCode','scaleName','lastEventId','lastEventDate','lastTechnician','lastMaterialErrorPct','lastFinalFactor','lastStatus'
  ]);

  ensureSheetWithHeaders(spreadsheet, 'Resumen', [
    'metric','value'
  ]);

  ensureSheetWithHeaders(spreadsheet, 'Dashboard', [
    'section','value1','value2','value3','value4','value5','value6'
  ]);
}

function ensureSheetWithHeaders(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeaderRow(sheet, headers.length, sheetName !== 'Dashboard');
    return;
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeaderRow(sheet, headers.length, sheetName !== 'Dashboard');
}

function styleHeaderRow(sheet, columns, freezeHeader) {
  sheet.getRange(1, 1, 1, columns)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#ffffff');

  if (freezeHeader) {
    sheet.setFrozenRows(1);
  } else {
    sheet.setFrozenRows(0);
  }
}

function upsertRow(sheet, values) {
  var keyValue = String(values[0]);
  var rows = readDataRows(sheet);

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === keyValue) {
      sheet.getRange(i + 2, 1, 1, values.length).setValues([values]);
      return;
    }
  }

  sheet.appendRow(values);
}

function refreshLatestCalibrations(spreadsheet) {
  var equipmentRows = readDataRows(spreadsheet.getSheetByName('Equipos'));
  var eventRows = readDataRows(spreadsheet.getSheetByName('Eventos de calibracion'));
  var materialRows = readDataRows(spreadsheet.getSheetByName('Validacion con material real'));
  var adjustmentRows = readDataRows(spreadsheet.getSheetByName('Ajustes y aprobaciones'));
  var latestSheet = spreadsheet.getSheetByName('Ultimas calibraciones');

  var materialByEvent = indexByFirstColumn(materialRows);
  var adjustmentByEvent = indexByFirstColumn(adjustmentRows);
  var latestByEquipment = {};

  for (var i = 0; i < eventRows.length; i++) {
    var row = eventRows[i];
    var equipmentId = String(row[1]);
    if (!latestByEquipment[equipmentId] || new Date(row[2]).getTime() > new Date(latestByEquipment[equipmentId][2]).getTime()) {
      latestByEquipment[equipmentId] = row;
    }
  }

  var values = [];

  for (var j = 0; j < equipmentRows.length; j++) {
    var equipmentRow = equipmentRows[j];
    var eventRow = latestByEquipment[String(equipmentRow[0])];

    if (!eventRow) {
      values.push([equipmentRow[0], equipmentRow[1], equipmentRow[2], equipmentRow[3], equipmentRow[4], '', '', '', '', '', 'Sin calibraciones']);
      continue;
    }

    var eventId = String(eventRow[0]);
    var materialRow = materialByEvent[eventId] || [];
    var adjustmentRow = adjustmentByEvent[eventId] || [];
    var errorPct = Number(materialRow[3] || 0);
    var tolerance = Number(eventRow[4] || 0);
    var status = Math.abs(errorPct) <= tolerance ? 'Dentro de tolerancia' : 'Fuera de tolerancia';

    values.push([
      equipmentRow[0],
      equipmentRow[1],
      equipmentRow[2],
      equipmentRow[3],
      equipmentRow[4],
      eventId,
      eventRow[2],
      adjustmentRow[4] || '',
      materialRow[3] || '',
      adjustmentRow[2] || '',
      status
    ]);
  }

  replaceSheetBody(latestSheet, values);
  formatLatestSheet(latestSheet);
}

function refreshSummary(spreadsheet) {
  var equipmentRows = readDataRows(spreadsheet.getSheetByName('Equipos'));
  var eventRows = readDataRows(spreadsheet.getSheetByName('Eventos de calibracion'));
  var latestRows = readDataRows(spreadsheet.getSheetByName('Ultimas calibraciones'));
  var summarySheet = spreadsheet.getSheetByName('Resumen');

  var outOfTolerance = 0;
  var withoutCalibration = 0;

  for (var i = 0; i < latestRows.length; i++) {
    var status = String(latestRows[i][10] || '');
    if (status === 'Fuera de tolerancia') outOfTolerance++;
    if (status === 'Sin calibraciones') withoutCalibration++;
  }

  var values = [
    ['Balanzas registradas', equipmentRows.length],
    ['Eventos registrados', eventRows.length],
    ['Balanzas fuera de tolerancia', outOfTolerance],
    ['Balanzas sin calibraciones', withoutCalibration],
    ['Ultima actualizacion', new Date().toLocaleString()]
  ];

  replaceSheetBody(summarySheet, values);
  summarySheet.autoResizeColumns(1, 2);
}

function refreshDashboard(spreadsheet) {
  var dashboard = spreadsheet.getSheetByName('Dashboard');
  var latestRows = readDataRows(spreadsheet.getSheetByName('Ultimas calibraciones'));
  var summaryRows = readDataRows(spreadsheet.getSheetByName('Resumen'));
  var eventRows = readDataRows(spreadsheet.getSheetByName('Eventos de calibracion'));

  dashboard.clear();
  dashboard.getRange('A1:G200').setBackground('#ffffff').setFontColor('#0f172a').setFontWeight('normal');
  dashboard.setFrozenRows(0);
  dashboard.setColumnWidths(1, 7, 180);

  dashboard.getRange('A1:G2').merge().setValue('Dashboard de Calibraciones de Balanzas').setFontSize(16).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashboard.getRange('A3:G3').merge().setValue('Vista operativa de estado, ultimas calibraciones y equipos fuera de tolerancia').setBackground('#e2e8f0').setHorizontalAlignment('center');

  var summaryMap = {};
  for (var i = 0; i < summaryRows.length; i++) {
    summaryMap[String(summaryRows[i][0])] = summaryRows[i][1];
  }

  writeKpiCard(dashboard, 'A5:B7', 'Balanzas registradas', summaryMap['Balanzas registradas'] || 0, '#dbeafe', '#1d4ed8');
  writeKpiCard(dashboard, 'C5:D7', 'Eventos registrados', summaryMap['Eventos registrados'] || 0, '#dcfce7', '#15803d');
  writeKpiCard(dashboard, 'E5:F7', 'Fuera de tolerancia', summaryMap['Balanzas fuera de tolerancia'] || 0, '#fee2e2', '#b91c1c');
  writeKpiCard(dashboard, 'A9:B11', 'Sin calibraciones', summaryMap['Balanzas sin calibraciones'] || 0, '#fef3c7', '#b45309');
  writeKpiCard(dashboard, 'C9:F11', 'Ultima actualizacion', summaryMap['Ultima actualizacion'] || '-', '#e0f2fe', '#0369a1');

  dashboard.getRange('A13:G13').merge().setValue('Ultimas calibraciones por balanza').setBackground('#0f172a').setFontColor('#ffffff').setFontWeight('bold');
  dashboard.getRange('A14:G14').setValues([['Planta','Linea','Cinta','Balanza','Fecha ultima calibracion','Error material real %','Estado']]).setFontWeight('bold').setBackground('#cbd5e1');

  var latestValues = [];
  for (var j = 0; j < latestRows.length; j++) {
    latestValues.push([
      latestRows[j][1],
      latestRows[j][2],
      latestRows[j][3],
      latestRows[j][4],
      latestRows[j][6],
      latestRows[j][8],
      latestRows[j][10]
    ]);
  }

  if (latestValues.length) {
    dashboard.getRange(15, 1, latestValues.length, 7).setValues(latestValues);
  }

  dashboard.getRange('I13:N13').merge().setValue('Equipos fuera de tolerancia').setBackground('#7f1d1d').setFontColor('#ffffff').setFontWeight('bold');
  dashboard.getRange('I14:N14').setValues([['Planta','Linea','Cinta','Balanza','Error %','Ultimo factor']]).setFontWeight('bold').setBackground('#fecaca');

  var outValues = [];
  for (var k = 0; k < latestRows.length; k++) {
    if (String(latestRows[k][10]) === 'Fuera de tolerancia') {
      outValues.push([
        latestRows[k][1],
        latestRows[k][2],
        latestRows[k][3],
        latestRows[k][4],
        latestRows[k][8],
        latestRows[k][9]
      ]);
    }
  }

  if (outValues.length) {
    dashboard.getRange(15, 9, outValues.length, 6).setValues(outValues);
  } else {
    dashboard.getRange('I15:N15').merge().setValue('No hay equipos fuera de tolerancia').setBackground('#dcfce7');
  }

  dashboard.getRange('A28:F28').merge().setValue('Ultimos eventos registrados').setBackground('#0f172a').setFontColor('#ffffff').setFontWeight('bold');
  dashboard.getRange('A29:F29').setValues([['Evento','Equipo','Fecha','Tolerancia %','Notas','Estado sync']]).setFontWeight('bold').setBackground('#cbd5e1');

  var recentEvents = eventRows
    .sort(function(a, b) { return new Date(b[2]).getTime() - new Date(a[2]).getTime(); })
    .slice(0, 10);

  var equipmentMap = buildEquipmentMap(readDataRows(spreadsheet.getSheetByName('Equipos')));
  var recentValues = [];

  for (var m = 0; m < recentEvents.length; m++) {
    var eventRow = recentEvents[m];
    var equipmentName = equipmentMap[String(eventRow[1])] || String(eventRow[1]);
    recentValues.push([eventRow[0], equipmentName, eventRow[2], eventRow[4], eventRow[5], eventRow[6]]);
  }

  if (recentValues.length) {
    dashboard.getRange(30, 1, recentValues.length, 6).setValues(recentValues);
  }

  applyDashboardConditionalFormatting(dashboard, latestValues.length, outValues.length, recentValues.length);
}

function writeKpiCard(sheet, rangeA1, title, value, bgColor, textColor) {
  var range = sheet.getRange(rangeA1);
  range.merge();
  range.setBackground(bgColor).setFontColor(textColor).setBorder(true, true, true, true, true, true);
  range.setValue(title + '\n' + value).setWrap(true).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
}

function applyDashboardConditionalFormatting(sheet, latestCount, outCount, recentCount) {
  var rules = [];

  if (latestCount > 0) {
    var latestRange = sheet.getRange(15, 7, latestCount, 1);
    var latestRule1 = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Dentro de tolerancia').setBackground('#dcfce7').setRanges([latestRange]).build();
    var latestRule2 = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Fuera de tolerancia').setBackground('#fee2e2').setRanges([latestRange]).build();
    var latestRule3 = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Sin calibraciones').setBackground('#fef3c7').setRanges([latestRange]).build();
    rules = rules.concat([latestRule1, latestRule2, latestRule3]);
  }

  if (recentCount > 0) {
    var syncRange = sheet.getRange(30, 6, recentCount, 1);
    var syncRule1 = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('sincronizado').setBackground('#dcfce7').setRanges([syncRange]).build();
    var syncRule2 = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('error').setBackground('#fee2e2').setRanges([syncRange]).build();
    var syncRule3 = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('pendiente').setBackground('#fef3c7').setRanges([syncRange]).build();
    rules = rules.concat([syncRule1, syncRule2, syncRule3]);
  }

  if (outCount > 0) {
    sheet.getRange(15, 9, outCount, 6).setBackground('#fff7ed');
  }

  sheet.setConditionalFormatRules(rules);
}

function readDataRows(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow <= 1 || lastColumn === 0) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
}

function replaceSheetBody(sheet, values) {
  var lastRow = sheet.getLastRow();
  var lastColumn = Math.max(sheet.getLastColumn(), values.length ? values[0].length : 1);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent().clearFormat();
  }
  if (values.length) {
    sheet.getRange(2, 1, values.length, values[0].length).setValues(values);
  }
  styleHeaderRow(sheet, sheet.getLastColumn(), sheet.getName() !== 'Dashboard');
}

function indexByFirstColumn(rows) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    map[String(rows[i][0])] = rows[i];
  }
  return map;
}

function buildEquipmentMap(rows) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    map[String(rows[i][0])] = [rows[i][1], rows[i][2], rows[i][3], rows[i][4]].join(' / ');
  }
  return map;
}

function formatLatestSheet(sheet) {
  sheet.autoResizeColumns(1, 11);
  var dataRows = readDataRows(sheet).length;
  if (dataRows > 0) {
    var statusRange = sheet.getRange(2, 11, dataRows, 1);
    var rules = [
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Dentro de tolerancia').setBackground('#dcfce7').setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Fuera de tolerancia').setBackground('#fee2e2').setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Sin calibraciones').setBackground('#fef3c7').setRanges([statusRange]).build()
    ];
    sheet.setConditionalFormatRules(rules);
  }
}
