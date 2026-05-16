import { loadChains, loadEquipment, loadEvents, loadPlantMapObjects, loadPlantMapPoints, saveChains, saveEquipment, saveEvents, savePlantMapObjects, savePlantMapPoints } from './storage'
import { isSupabaseConfigured, supabase } from './supabase'
import { DEFAULT_CHECK_INTERVAL_DAYS } from './types'
import type { CalibrationEvent, Chain, Equipment, PlantMapObject, PlantMapPoint, SyncStatus } from './types'

type EquipmentRow = {
  id: string
  plant: string
  line: string
  belt_code: string
  scale_name: string
  controller_model: string
  controller_serial: string
  belt_width_mm: number
  belt_length_m: number
  nominal_capacity_tph: number
  bridge_length_m: number
  nominal_speed_ms: number
  speed_source: Equipment['speedSource']
  rpm_roll_diameter_mm: number
  calibration_factor_current: number
  adjustment_factor_current: number
  totalizer_unit: string
  check_interval_days: number
  photo_path: string
  notes: string
  created_at: string
}

type EventRow = {
  id: string
  equipment_id: string
  created_at: string
  event_date: string
  tolerance_percent: number
  precheck?: CalibrationEvent['precheck']
  zero_check?: CalibrationEvent['zeroCheck']
  parameter_snapshot: CalibrationEvent['parameterSnapshot']
  chain_span: CalibrationEvent['chainSpan']
  accumulated_check?: CalibrationEvent['accumulatedCheck']
  material_validation: CalibrationEvent['materialValidation']
  final_adjustment: CalibrationEvent['finalAdjustment']
  approval: CalibrationEvent['approval']
  diagnosis?: string
  notes: string
  sync_status: SyncStatus
  sync_message: string
  synced_at: string | null
}

type ChainRow = {
  id: string
  plant: string
  name: string
  linear_weight_kg_m: number
  total_length_m: number
  total_weight_kg: number
  notes: string
  created_at: string
}

type PlantMapPointRow = {
  id: string
  label: string
  zone: string
  point_type: PlantMapPoint['pointType']
  x: number
  y: number
  equipment_id: string | null
  object_id?: string | null
  annual_calibration_date: string | null
  created_at: string
  updated_at: string
}

type PlantMapObjectRow = {
  id: string
  label: string
  object_type: PlantMapObject['objectType']
  x: number
  z: number
  elevation?: number
  rotation_y: number
  scale?: number
  width?: number
  depth?: number
  height?: number
  slope?: number
  color?: string
  model_path?: string | null
  created_at: string
  updated_at: string
}

export async function loadAppData() {
  const cachedEquipment = loadEquipment()
  const cachedChains = loadChains()
  const cachedEvents = loadEvents()
  const cachedPlantMapPoints = loadPlantMapPoints()
  const cachedPlantMapObjects = loadPlantMapObjects()

  if (!isSupabaseConfigured || !supabase) {
    return {
      equipment: cachedEquipment,
      chains: cachedChains,
      events: cachedEvents,
      plantMapPoints: cachedPlantMapPoints,
      plantMapObjects: cachedPlantMapObjects,
      plantMapSource: 'local' as const,
      source: 'local' as const,
    }
  }

  const [equipmentResult, chainsResult, eventsResult, plantMapResult, plantMapObjectsResult] = await Promise.all([
    supabase.from('equipments').select('*').order('created_at', { ascending: false }),
    supabase.from('chains').select('*').order('created_at', { ascending: false }),
    supabase.from('calibration_events').select('*').order('event_date', { ascending: false }),
    supabase.from('plant_map_points').select('*').order('label', { ascending: true }),
    supabase.from('plant_map_objects').select('*').order('label', { ascending: true }),
  ])

  if (equipmentResult.error) {
    throw toError(equipmentResult.error)
  }

  if (chainsResult.error) {
    throw toError(chainsResult.error)
  }

  if (eventsResult.error) {
    throw toError(eventsResult.error)
  }

  const equipment = (equipmentResult.data || []).map(mapEquipmentRow)
  const chains = (chainsResult.data || []).map(mapChainRow)
  const events = (eventsResult.data || []).map(mapEventRow)
  const plantMapPoints = plantMapResult.error
    ? cachedPlantMapPoints
    : ((plantMapResult.data || []) as PlantMapPointRow[]).map(mapPlantMapPointRow)
  const plantMapObjects = plantMapObjectsResult.error
    ? cachedPlantMapObjects
    : ((plantMapObjectsResult.data || []) as PlantMapObjectRow[]).map(mapPlantMapObjectRow)
  const plantMapSource = plantMapResult.error || plantMapObjectsResult.error ? 'local' as const : 'supabase' as const

  saveEquipment(equipment)
  saveChains(chains)
  saveEvents(events)
  savePlantMapPoints(plantMapPoints)
  savePlantMapObjects(plantMapObjects)
  const hydratedPlantMapObjects = loadPlantMapObjects()

  return {
    equipment,
    chains,
    events,
    plantMapPoints,
    plantMapObjects: hydratedPlantMapObjects,
    plantMapSource,
    source: 'supabase' as const,
  }
}

export async function testSupabaseConnection() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      message: 'Supabase no está configurado.',
    }
  }

  const result = await supabase.from('equipments').select('id').limit(1)

  if (result.error) {
    return {
      ok: false,
      message: result.error.message,
    }
  }

  return {
    ok: true,
    message: 'Conexion con Supabase OK.',
  }
}

export async function saveEquipmentRecord(item: Equipment) {
  if (!isSupabaseConfigured || !supabase) {
    const next = [item, ...loadEquipment().filter((current) => current.id !== item.id)]
    saveEquipment(next)
    return { source: 'local' as const }
  }

  const result = await supabase.from('equipments').upsert(toEquipmentRow(item))
  if (result.error) {
    throw toError(result.error)
  }

  return { source: 'supabase' as const }
}

const CHECK_INTERVAL_NOTE_PATTERN = /(?:\r?\n)?\[calibracinta:check_interval_days=(\d+)\]\s*/i

export async function deleteEquipmentRecord(equipmentId: string) {
  if (!isSupabaseConfigured || !supabase) {
    saveEquipment(loadEquipment().filter((item) => item.id !== equipmentId))
    saveEvents(loadEvents().filter((item) => item.equipmentId !== equipmentId))
    return { source: 'local' as const }
  }

  const result = await supabase.from('equipments').delete().eq('id', equipmentId)
  if (result.error) {
    throw toError(result.error)
  }

  saveEquipment(loadEquipment().filter((item) => item.id !== equipmentId))
  saveEvents(loadEvents().filter((item) => item.equipmentId !== equipmentId))
  return { source: 'supabase' as const }
}

export async function saveChainRecord(item: Chain) {
  if (!isSupabaseConfigured || !supabase) {
    const next = [item, ...loadChains().filter((current) => current.id !== item.id)]
    saveChains(next)
    return { source: 'local' as const }
  }

  const result = await supabase.from('chains').upsert(toChainRow(item))
  if (result.error) {
    throw toError(result.error)
  }

  return { source: 'supabase' as const }
}

export async function savePlantMapPointsRecord(items: PlantMapPoint[]) {
  const savedAt = new Date().toISOString()
  const normalized = items.map((item) => ({ ...item, updatedAt: savedAt }))
  savePlantMapPoints(normalized)

  if (!isSupabaseConfigured || !supabase) {
    return { source: 'local' as const }
  }

  const result = await supabase.from('plant_map_points').upsert(normalized.map(toPlantMapPointRow))
  if (result.error) {
    if (isPlantMapTableUnavailable(result.error)) {
      return { source: 'local' as const }
    }
    throw toError(result.error)
  }

  return { source: 'supabase' as const }
}

export async function savePlantMapObjectsRecord(items: PlantMapObject[]) {
  const savedAt = new Date().toISOString()
  const normalized = items.map((item) => ({ ...item, updatedAt: savedAt }))
  savePlantMapObjects(normalized)

  if (!isSupabaseConfigured || !supabase) {
    return { source: 'local' as const }
  }

  if (normalized.length > 0) {
    const result = await supabase.from('plant_map_objects').upsert(normalized.map(toPlantMapObjectRow))
    if (result.error) {
      if (isPlantMapTableUnavailable(result.error)) {
        return { source: 'local' as const }
      }
      throw toError(result.error)
    }
  }

  const existingResult = await supabase.from('plant_map_objects').select('id')
  if (existingResult.error) {
    if (isPlantMapTableUnavailable(existingResult.error)) {
      return { source: 'local' as const }
    }
    throw toError(existingResult.error)
  }

  const savedIds = new Set(normalized.map((item) => item.id))
  const deletedIds = (existingResult.data || [])
    .map((item) => item.id as string)
    .filter((id) => !savedIds.has(id))

  if (deletedIds.length > 0) {
    const deleteResult = await supabase.from('plant_map_objects').delete().in('id', deletedIds)
    if (deleteResult.error) {
      throw toError(deleteResult.error)
    }
  }

  return { source: 'supabase' as const }
}

function isPlantMapTableUnavailable(value: unknown) {
  const text = value && typeof value === 'object'
    ? [
        'message' in value ? (value as { message?: unknown }).message : '',
        'details' in value ? (value as { details?: unknown }).details : '',
        'hint' in value ? (value as { hint?: unknown }).hint : '',
        'code' in value ? (value as { code?: unknown }).code : '',
      ].join(' ')
    : String(value || '')
  return /plant_map_points|plant_map_objects|schema cache|relation/i.test(text) && /does not exist|not find|not found|42P01|PGRST205/i.test(text)
}

export async function deleteChainRecord(chainId: string) {
  if (!isSupabaseConfigured || !supabase) {
    saveChains(loadChains().filter((item) => item.id !== chainId))
    return { source: 'local' as const }
  }

  const result = await supabase.from('chains').delete().eq('id', chainId)
  if (result.error) {
    throw toError(result.error)
  }

  saveChains(loadChains().filter((item) => item.id !== chainId))
  return { source: 'supabase' as const }
}

export async function saveCalibrationEventRecord(item: CalibrationEvent) {
  if (!isSupabaseConfigured || !supabase) {
    const next = [item, ...loadEvents().filter((current) => current.id !== item.id)]
    saveEvents(next)
    return { source: 'local' as const }
  }

  const result = await supabase.from('calibration_events').insert(toEventRow(item))
  if (result.error) {
    const offlineEvent: CalibrationEvent = {
      ...item,
      syncStatus: 'pendiente',
      syncMessage: 'Guardado offline. Se sincronizara cuando haya conexion.',
      syncedAt: '',
    }
    const next = [offlineEvent, ...loadEvents().filter((current) => current.id !== item.id)]
    saveEvents(next)
    return { source: 'local' as const }
  }

  return { source: 'supabase' as const }
}

export async function deleteCalibrationEventRecord(eventId: string) {
  if (!isSupabaseConfigured || !supabase) {
    saveEvents(loadEvents().filter((item) => item.id !== eventId))
    return { source: 'local' as const }
  }

  const result = await supabase.from('calibration_events').delete().eq('id', eventId)
  if (result.error) {
    throw toError(result.error)
  }

  saveEvents(loadEvents().filter((item) => item.id !== eventId))
  return { source: 'supabase' as const }
}

export async function updateCalibrationEventSync(
  eventId: string,
  values: Pick<CalibrationEvent, 'syncStatus' | 'syncMessage' | 'syncedAt'>,
) {
  if (!isSupabaseConfigured || !supabase) {
    return
  }

  const result = await supabase
    .from('calibration_events')
    .update({
      sync_status: values.syncStatus,
      sync_message: values.syncMessage,
      synced_at: values.syncedAt || null,
    })
    .eq('id', eventId)

  if (result.error) {
    throw toError(result.error)
  }
}

function toError(value: unknown) {
  if (value instanceof Error) {
    return value
  }

  if (value && typeof value === 'object' && 'message' in value) {
    const message = String((value as { message: unknown }).message)
    const details = 'details' in value ? String((value as { details?: unknown }).details || '') : ''
    const hint = 'hint' in value ? String((value as { hint?: unknown }).hint || '') : ''
    const fullMessage = [message, details, hint].filter(Boolean).join(' | ')
    return new Error(fullMessage)
  }

  return new Error(String(value || 'Error desconocido'))
}

function parseEquipmentNotes(notes: string) {
  const match = notes.match(CHECK_INTERVAL_NOTE_PATTERN)
  const parsedDays = Number(match?.[1])
  return {
    notes: notes.replace(CHECK_INTERVAL_NOTE_PATTERN, '').trim(),
    checkIntervalDays: Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : DEFAULT_CHECK_INTERVAL_DAYS,
  }
}

function serializeEquipmentNotes(notes: string, checkIntervalDays: number) {
  const cleanNotes = notes.replace(CHECK_INTERVAL_NOTE_PATTERN, '').trim()
  const days = Number.isFinite(checkIntervalDays) && checkIntervalDays > 0 ? Math.round(checkIntervalDays) : DEFAULT_CHECK_INTERVAL_DAYS
  const marker = `[calibracinta:check_interval_days=${days}]`
  return cleanNotes ? `${cleanNotes}\n${marker}` : marker
}

function mapEquipmentRow(row: EquipmentRow): Equipment {
  const parsedNotes = parseEquipmentNotes(row.notes || '')
  const checkIntervalDays = Number.isFinite(row.check_interval_days) && row.check_interval_days > 0
    ? row.check_interval_days
    : parsedNotes.checkIntervalDays
  return {
    id: row.id,
    plant: row.plant,
    line: row.line,
    beltCode: row.belt_code,
    scaleName: row.scale_name,
    controllerModel: row.controller_model,
    controllerSerial: row.controller_serial,
    beltWidthMm: row.belt_width_mm,
    beltLengthM: row.belt_length_m,
    nominalCapacityTph: row.nominal_capacity_tph,
    bridgeLengthM: row.bridge_length_m,
    nominalSpeedMs: row.nominal_speed_ms,
    speedSource: row.speed_source,
    rpmRollDiameterMm: row.rpm_roll_diameter_mm,
    calibrationFactorCurrent: row.calibration_factor_current,
    adjustmentFactorCurrent: row.adjustment_factor_current,
    checkIntervalDays,
    totalizerUnit: row.totalizer_unit,
    photoPath: row.photo_path || '',
    notes: parsedNotes.notes,
    createdAt: row.created_at,
  }
}

function toEquipmentRow(item: Equipment): EquipmentRow {
  return {
    id: item.id,
    plant: item.plant,
    line: item.line,
    belt_code: item.beltCode,
    scale_name: item.scaleName,
    controller_model: item.controllerModel,
    controller_serial: item.controllerSerial,
    belt_width_mm: item.beltWidthMm,
    belt_length_m: item.beltLengthM,
    nominal_capacity_tph: item.nominalCapacityTph,
    bridge_length_m: item.bridgeLengthM,
    nominal_speed_ms: item.nominalSpeedMs,
    speed_source: item.speedSource,
    rpm_roll_diameter_mm: item.rpmRollDiameterMm,
    calibration_factor_current: item.calibrationFactorCurrent,
    adjustment_factor_current: item.adjustmentFactorCurrent,
    check_interval_days: item.checkIntervalDays,
    totalizer_unit: item.totalizerUnit,
    photo_path: item.photoPath || '',
    notes: serializeEquipmentNotes(item.notes, item.checkIntervalDays),
    created_at: item.createdAt,
  }
}

function mapChainRow(row: ChainRow): Chain {
  return {
    id: row.id,
    plant: row.plant,
    name: row.name,
    linearWeightKgM: row.linear_weight_kg_m,
    totalLengthM: row.total_length_m,
    totalWeightKg: row.total_weight_kg,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

function toChainRow(item: Chain): ChainRow {
  return {
    id: item.id,
    plant: item.plant,
    name: item.name,
    linear_weight_kg_m: item.linearWeightKgM,
    total_length_m: item.totalLengthM,
    total_weight_kg: item.totalWeightKg,
    notes: item.notes,
    created_at: item.createdAt,
  }
}

function mapPlantMapPointRow(row: PlantMapPointRow): PlantMapPoint {
  return {
    id: row.id,
    label: row.label,
    zone: row.zone,
    pointType: row.point_type,
    x: row.x,
    y: row.y,
    equipmentId: row.equipment_id || '',
    objectId: row.object_id || '',
    annualCalibrationDate: row.annual_calibration_date || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPlantMapPointRow(item: PlantMapPoint): PlantMapPointRow {
  return {
    id: item.id,
    label: item.label,
    zone: item.zone,
    point_type: item.pointType,
    x: item.x,
    y: item.y,
    equipment_id: item.equipmentId || null,
    object_id: item.objectId || null,
    annual_calibration_date: item.annualCalibrationDate || null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapPlantMapObjectRow(row: PlantMapObjectRow): PlantMapObject {
  return {
    id: row.id,
    label: row.label,
    objectType: row.object_type,
    x: row.x,
    z: row.z,
    elevation: row.elevation ?? 0,
    rotationY: row.rotation_y,
    scale: row.scale ?? 1,
    width: row.width ?? 1,
    depth: row.depth ?? 1,
    height: row.height ?? 1,
    slope: row.slope ?? 0,
    color: row.color || '#aeb6b4',
    modelPath: row.model_path || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPlantMapObjectRow(item: PlantMapObject): PlantMapObjectRow {
  return {
    id: item.id,
    label: item.label,
    object_type: item.objectType,
    x: item.x,
    z: item.z,
    elevation: item.elevation,
    rotation_y: item.rotationY,
    scale: item.scale,
    width: item.width,
    depth: item.depth,
    height: item.height,
    slope: item.slope,
    color: item.color,
    model_path: item.modelPath || '',
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapEventRow(row: EventRow): CalibrationEvent {
  const parameterSnapshot = (row.parameter_snapshot || {}) as CalibrationEvent['parameterSnapshot']
  return {
    id: row.id,
    appVersion: parameterSnapshot.appVersion || '',
    equipmentId: row.equipment_id,
    createdAt: row.created_at,
    eventDate: row.event_date,
    tolerancePercent: row.tolerance_percent,
    precheck: row.precheck || {
      beltEmpty: false,
      beltClean: false,
      noMaterialBuildup: false,
      idlersOk: false,
      structureOk: false,
      speedSensorOk: false,
      notes: '',
    },
    zeroCheck: row.zero_check || {
      completed: false,
      displayUnit: 'mV',
      beforeValue: '',
      afterValue: '',
      adjusted: false,
      notes: '',
    },
    parameterSnapshot,
    chainSpan: {
      chainId: row.chain_span?.chainId || '',
      chainName: row.chain_span?.chainName || '',
      chainLinearKgM: row.chain_span?.chainLinearKgM || 0,
      passCount: row.chain_span?.passCount || 0,
      avgControllerReadingKgM: row.chain_span?.avgControllerReadingKgM || 0,
      avgErrorPct: row.chain_span?.avgErrorPct || 0,
      provisionalFactor: row.chain_span?.provisionalFactor || 0,
    },
    accumulatedCheck: row.accumulated_check || {
      expectedFlowTph: 0,
      testMinutes: 0,
      expectedTotal: 0,
      indicatedTotal: 0,
      errorPct: 0,
      adjustmentFactorBefore: 0,
      adjustmentFactorSuggested: 0,
    },
    materialValidation: row.material_validation,
    finalAdjustment: row.final_adjustment,
    approval: row.approval,
    diagnosis: row.diagnosis || '',
    notes: row.notes,
    syncStatus: row.sync_status,
    syncMessage: row.sync_message,
    syncedAt: row.synced_at || '',
  }
}

export function toEventRow(item: CalibrationEvent): EventRow {
  return {
    id: item.id,
    equipment_id: item.equipmentId,
    created_at: item.createdAt,
    event_date: item.eventDate,
    tolerance_percent: item.tolerancePercent,
    precheck: item.precheck,
    zero_check: item.zeroCheck,
    parameter_snapshot: {
      ...item.parameterSnapshot,
      appVersion: item.appVersion || item.parameterSnapshot.appVersion || '',
    },
    chain_span: item.chainSpan,
    accumulated_check: item.accumulatedCheck,
    material_validation: item.materialValidation,
    final_adjustment: item.finalAdjustment,
    approval: item.approval,
    diagnosis: item.diagnosis,
    notes: item.notes,
    sync_status: item.syncStatus,
    sync_message: item.syncMessage,
    synced_at: item.syncedAt || null,
  }
}
