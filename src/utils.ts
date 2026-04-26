import type { CalibrationEvent, Equipment, SheetsSyncPayload } from './types'

export const round = (value: number, digits = 3) => {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export const nowLocalValue = () => {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

export const formatDateTime = (value: string) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('es-AR')
}

export const generateId = () => crypto.randomUUID()

export const computePercentError = (reference: number, measured: number) => {
  if (!reference || !measured) return 0
  return ((measured - reference) / reference) * 100
}

export const computeSuggestedFactor = (previousFactor: number, externalWeight: number, beltWeight: number) => {
  if (!previousFactor || !externalWeight || !beltWeight) return 0
  return previousFactor * (externalWeight / beltWeight)
}

export const computeStatusLabel = (errorPct: number, tolerancePct: number) =>
  Math.abs(errorPct) <= tolerancePct ? 'Dentro de tolerancia' : 'Fuera de tolerancia'

export const generateEventCode = (dateValue: string, existingEvents: CalibrationEvent[]) => {
  const date = new Date(dateValue)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const prefix = `CAL-${year}${month}-`
  const count = existingEvents.filter((item) => item.id.startsWith(prefix)).length + 1
  return `${prefix}${String(count).padStart(4, '0')}`
}

export const buildSyncPayload = (equipment: Equipment, event: CalibrationEvent): SheetsSyncPayload => ({
  action: 'syncCalibrationEvent',
  equipment,
  event,
})
