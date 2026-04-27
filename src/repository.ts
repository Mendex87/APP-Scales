import { loadEquipment, loadEvents, saveEquipment, saveEvents } from './storage'
import { isSupabaseConfigured, supabase } from './supabase'
import type { CalibrationEvent, Equipment, SyncStatus } from './types'

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
  notes: string
  created_at: string
}

type EventRow = {
  id: string
  equipment_id: string
  created_at: string
  event_date: string
  tolerance_percent: number
  parameter_snapshot: CalibrationEvent['parameterSnapshot']
  chain_span: CalibrationEvent['chainSpan']
  material_validation: CalibrationEvent['materialValidation']
  final_adjustment: CalibrationEvent['finalAdjustment']
  approval: CalibrationEvent['approval']
  notes: string
  sync_status: SyncStatus
  sync_message: string
  synced_at: string
}

export async function loadAppData() {
  const cachedEquipment = loadEquipment()
  const cachedEvents = loadEvents()

  if (!isSupabaseConfigured || !supabase) {
    return {
      equipment: cachedEquipment,
      events: cachedEvents,
      source: 'local' as const,
    }
  }

  const [equipmentResult, eventsResult] = await Promise.all([
    supabase.from('equipments').select('*').order('created_at', { ascending: false }),
    supabase.from('calibration_events').select('*').order('event_date', { ascending: false }),
  ])

  if (equipmentResult.error) {
    throw equipmentResult.error
  }

  if (eventsResult.error) {
    throw eventsResult.error
  }

  const equipment = (equipmentResult.data || []).map(mapEquipmentRow)
  const events = (eventsResult.data || []).map(mapEventRow)

  saveEquipment(equipment)
  saveEvents(events)

  return {
    equipment,
    events,
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
    throw result.error
  }

  return { source: 'supabase' as const }
}

export async function saveCalibrationEventRecord(item: CalibrationEvent) {
  if (!isSupabaseConfigured || !supabase) {
    const next = [item, ...loadEvents().filter((current) => current.id !== item.id)]
    saveEvents(next)
    return { source: 'local' as const }
  }

  const result = await supabase.from('calibration_events').upsert(toEventRow(item))
  if (result.error) {
    throw result.error
  }

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
      synced_at: values.syncedAt,
    })
    .eq('id', eventId)

  if (result.error) {
    throw result.error
  }
}

function mapEquipmentRow(row: EquipmentRow): Equipment {
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
    notes: row.notes,
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
    notes: item.notes,
    created_at: item.createdAt,
  }
}

function mapEventRow(row: EventRow): CalibrationEvent {
  return {
    id: row.id,
    equipmentId: row.equipment_id,
    createdAt: row.created_at,
    eventDate: row.event_date,
    tolerancePercent: row.tolerance_percent,
    parameterSnapshot: row.parameter_snapshot,
    chainSpan: row.chain_span,
    materialValidation: row.material_validation,
    finalAdjustment: row.final_adjustment,
    approval: row.approval,
    notes: row.notes,
    syncStatus: row.sync_status,
    syncMessage: row.sync_message,
    syncedAt: row.synced_at,
  }
}

function toEventRow(item: CalibrationEvent): EventRow {
  return {
    id: item.id,
    equipment_id: item.equipmentId,
    created_at: item.createdAt,
    event_date: item.eventDate,
    tolerance_percent: item.tolerancePercent,
    parameter_snapshot: item.parameterSnapshot,
    chain_span: item.chainSpan,
    material_validation: item.materialValidation,
    final_adjustment: item.finalAdjustment,
    approval: item.approval,
    notes: item.notes,
    sync_status: item.syncStatus,
    sync_message: item.syncMessage,
    synced_at: item.syncedAt,
  }
}
