import type { CalibrationEvent } from './types'

export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires'

const DAY_MS = 24 * 60 * 60 * 1000

type ArgentinaDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const argentinaPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ARGENTINA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const argentinaDateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARGENTINA_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'medium',
  hourCycle: 'h23',
})

const pad = (value: number) => String(value).padStart(2, '0')

const toValidDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const getArgentinaDateParts = (value: string | Date = new Date()): ArgentinaDateParts => {
  const date = toValidDate(value) || new Date()
  const parts = Object.fromEntries(
    argentinaPartsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<keyof ArgentinaDateParts, number>

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

export const formatArgentinaDateKey = (value: string | Date = new Date()) => {
  const parts = getArgentinaDateParts(value)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

export const formatArgentinaYearMonth = (value: string | Date = new Date()) => {
  const parts = getArgentinaDateParts(value)
  return `${parts.year}-${pad(parts.month)}`
}

export const formatArgentinaDateKeyForDisplay = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-')
  if (!year || !month || !day) return dateKey || '-'
  return `${day}/${month}/${year}`
}

export const addArgentinaDays = (value: string | Date, days: number) => {
  const parts = getArgentinaDateParts(value)
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export const differenceInArgentinaDays = (fromDateKey: string, toDateKey: string) => {
  const [fromYear, fromMonth, fromDay] = fromDateKey.split('-').map(Number)
  const [toYear, toMonth, toDay] = toDateKey.split('-').map(Number)
  if (![fromYear, fromMonth, fromDay, toYear, toMonth, toDay].every(Number.isFinite)) return 0
  const fromTime = Date.UTC(fromYear, fromMonth - 1, fromDay)
  const toTime = Date.UTC(toYear, toMonth - 1, toDay)
  return Math.ceil((toTime - fromTime) / DAY_MS)
}

const getArgentinaOffsetMs = (date: Date) => {
  const parts = getArgentinaDateParts(date)
  const argentinaAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return argentinaAsUtc - date.getTime()
}

const argentinaWallTimeToUtc = (parts: ArgentinaDateParts) => {
  const wallTimeAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  let offset = getArgentinaOffsetMs(new Date(wallTimeAsUtc))
  let utcTime = wallTimeAsUtc - offset
  const nextOffset = getArgentinaOffsetMs(new Date(utcTime))
  if (nextOffset !== offset) {
    offset = nextOffset
    utcTime = wallTimeAsUtc - offset
  }
  return new Date(utcTime)
}

export const argentinaDateTimeLocalToIso = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return toValidDate(value)?.toISOString() || new Date().toISOString()

  const [, year, month, day, hour, minute, second = '0'] = match
  return argentinaWallTimeToUtc({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  }).toISOString()
}

export const round = (value: number, digits = 3) => {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export type UnitSystem = 'metric' | 'imperial'
export type MeasureKind = 'lengthM' | 'lengthMm' | 'weightKg' | 'linearWeightKgM' | 'speedMs' | 'flowTph' | 'massT'

const KG_TO_LB = 2.20462262185
const M_TO_FT = 3.28083989501
const MM_TO_IN = 0.03937007874
const MS_TO_FT_MIN = M_TO_FT * 60
const TPH_TO_LB_H = 1000 * KG_TO_LB

export const getMeasureUnit = (kind: MeasureKind, unitSystem: UnitSystem) => {
  if (unitSystem === 'metric') {
    if (kind === 'lengthM') return 'm'
    if (kind === 'lengthMm') return 'mm'
    if (kind === 'weightKg') return 'kg'
    if (kind === 'linearWeightKgM') return 'kg/m'
    if (kind === 'speedMs') return 'm/s'
    if (kind === 'flowTph') return 't/h'
    return 't'
  }

  if (kind === 'lengthM') return 'ft'
  if (kind === 'lengthMm') return 'in'
  if (kind === 'weightKg') return 'lb'
  if (kind === 'linearWeightKgM') return 'lb/ft'
  if (kind === 'speedMs') return 'ft/min'
  if (kind === 'flowTph') return 'lb/h'
  return 'lb'
}

export const toDisplayMeasure = (value: number, kind: MeasureKind, unitSystem: UnitSystem) => {
  if (!Number.isFinite(value) || unitSystem === 'metric') return Number.isFinite(value) ? value : 0
  if (kind === 'lengthM') return value * M_TO_FT
  if (kind === 'lengthMm') return value * MM_TO_IN
  if (kind === 'weightKg') return value * KG_TO_LB
  if (kind === 'linearWeightKgM') return (value * KG_TO_LB) / M_TO_FT
  if (kind === 'speedMs') return value * MS_TO_FT_MIN
  if (kind === 'flowTph') return value * TPH_TO_LB_H
  return value * 1000 * KG_TO_LB
}

export const fromDisplayMeasure = (value: number, kind: MeasureKind, unitSystem: UnitSystem) => {
  if (!Number.isFinite(value) || unitSystem === 'metric') return Number.isFinite(value) ? value : 0
  if (kind === 'lengthM') return value / M_TO_FT
  if (kind === 'lengthMm') return value / MM_TO_IN
  if (kind === 'weightKg') return value / KG_TO_LB
  if (kind === 'linearWeightKgM') return (value * M_TO_FT) / KG_TO_LB
  if (kind === 'speedMs') return value / MS_TO_FT_MIN
  if (kind === 'flowTph') return value / TPH_TO_LB_H
  return value / KG_TO_LB / 1000
}

export const formatNumberForDisplay = (value: number, digits = 3) => {
  const rounded = round(value, digits)
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

export const formatMeasureValue = (value: number, kind: MeasureKind, unitSystem: UnitSystem, digits = 3) =>
  `${formatNumberForDisplay(toDisplayMeasure(value, kind, unitSystem), digits)} ${getMeasureUnit(kind, unitSystem)}`

export const formatMeasureInput = (value: string, kind: MeasureKind, unitSystem: UnitSystem, digits = 6) => {
  if (!value.trim()) return ''
  const parsed = toNumber(value, Number.NaN)
  if (!Number.isFinite(parsed)) return ''
  return formatNumberForDisplay(toDisplayMeasure(parsed, kind, unitSystem), digits)
}

export const parseMeasureInput = (value: string, kind: MeasureKind, unitSystem: UnitSystem, digits = 6) => {
  if (!value.trim()) return ''
  const parsed = toNumber(value, Number.NaN)
  if (!Number.isFinite(parsed)) return ''
  return formatNumberForDisplay(fromDisplayMeasure(parsed, kind, unitSystem), digits)
}

export const nowLocalValue = () => {
  const parts = getArgentinaDateParts()
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export const formatDateTime = (value: string) => {
  if (!value) return '-'
  const date = toValidDate(value)
  return date ? argentinaDateTimeFormatter.format(date) : '-'
}

export const formatDateOnly = (value: string | Date) => {
  const date = toValidDate(value)
  return date ? formatArgentinaDateKeyForDisplay(formatArgentinaDateKey(date)) : '-'
}

export const formatArgentinaClock = (value: string | Date = new Date()) => {
  const parts = getArgentinaDateParts(value)
  return `${pad(parts.day)}/${pad(parts.month)}/${String(parts.year).slice(-2)} · ${pad(parts.hour)}:${pad(parts.minute)}`
}

export const generateId = () => crypto.randomUUID()

export const normalizeDecimalInput = (value: string) => value.replace(/,/g, '.')

export const toNumber = (value: string | number | null | undefined, fallback = 0) => {
  const normalized = typeof value === 'string' ? normalizeDecimalInput(value).trim() : value
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : fallback
}

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
  const date = getArgentinaDateParts(dateValue)
  const fullYear = date.year
  const year = String(fullYear).slice(-2)
  const month = pad(date.month)
  const prefix = `CAL-${year}${month}`
  const legacyPrefix = `CAL-${fullYear}${month}-`
  const sequences = existingEvents
    .map((item) => {
      if (item.id.startsWith(prefix)) return Number(item.id.slice(prefix.length)) || 0
      if (item.id.startsWith(legacyPrefix)) return Number(item.id.slice(legacyPrefix.length)) || 0
      return 0
    })
    .filter((sequence) => sequence > 0)
  const count = Math.max(0, ...sequences) + 1
  return `${prefix}${String(count).padStart(2, '0')}`
}

