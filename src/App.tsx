import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, MouseEvent, PointerEvent, ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import {
  ClipboardCheck,
  Download,
  History,
  Moon,
  Pencil,
  PlusCircle,
  RotateCcw,
  Save,
  Scale,
  Settings2,
  Sun,
  Trash2,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react'
import { EquipmentPhoto } from './components/EquipmentPhoto'
import { HistoryPager } from './components/HistoryPager'
import { Metric } from './components/Metric'
import {
  deleteCalibrationEventRecord,
  deleteChainRecord,
  deleteEquipmentRecord,
  loadAppData,
  saveCalibrationEventRecord,
  saveChainRecord,
  saveEquipmentRecord,
  savePlantMapPointsRecord,
  toEventRow,
  updateCalibrationEventSync,
} from './repository'
import { loadChains, loadEquipment, loadEvents, loadPlantMapPoints, saveChains, saveEquipment, saveEvents } from './storage'
import { isSupabaseConfigured, supabase } from './supabase'
import { DEFAULT_CHECK_INTERVAL_DAYS } from './types'
import type { CalibrationEvent, Chain, Equipment, MaterialOutcome, MaterialPass, PlantMapPoint, SpeedSource } from './types'
import {
  addArgentinaDays,
  argentinaDateTimeLocalToIso,
  computePercentError,
  computeSuggestedFactor,
  differenceInArgentinaDays,
  formatArgentinaClock,
  formatArgentinaDateKey,
  formatArgentinaDateKeyForDisplay,
  formatArgentinaYearMonth,
  formatDateOnly,
  formatDateTime,
  formatMeasureInput,
  formatMeasureValue,
  formatNumberForDisplay,
  getMeasureUnit,
  generateEventCode,
  generateId,
  normalizeDecimalInput,
  nowLocalValue,
  parseMeasureInput,
  round,
  toDisplayMeasure,
  toNumber,
} from './utils'
import type { MeasureKind, UnitSystem } from './utils'

type Screen = 'dashboard' | 'balanzas' | 'herramientas' | 'nueva' | 'historial' | 'usuarios' | 'mapa'
type ToastTone = 'info' | 'success' | 'warning' | 'error'
type AppTheme = 'light' | 'dark'
type LoginTransitionPhase = 'idle' | 'cover' | 'reveal'
type AuthPanelMode = 'login' | 'recover-password' | 'update-password'
type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => { finished: Promise<void> }
}

type Toast = {
  id: string
  message: string
  tone: ToastTone
  exiting?: boolean
}

type ConfirmDialog = {
  title: string
  message: string
  detail?: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
}

type UserRole = 'admin' | 'tecnico' | 'supervisor' | 'viewer'

type AuthUser = {
  id: string
  username: string
  email: string
  role: UserRole
}

type ManagedUser = AuthUser & {
  createdAt: string
}

type SessionLog = {
  id: string
  user_id: string
  username: string
  login_at: string
  logout_at: string | null
  ip_address: string | null
  user_agent: string | null
}

const APP_VERSION = 'v4.0.3'
const CALIBRATION_DRAFT_KEY = 'calibracinta:event-draft:v1'
const THEME_STORAGE_KEY = 'calibracinta:theme'
const UNIT_SYSTEM_STORAGE_KEY = 'calibracinta:unit-system'
const SESSION_LOG_ID_KEY = 'calibracinta:session-log-id'
const SESSION_LAST_ACTIVITY_KEY = 'calibracinta:session-last-activity'
const PASSWORD_RESET_COOLDOWN_KEY = 'calibracinta:password-reset-cooldown-until'
const SESSION_TIMEOUT_MINUTES = 30
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000
const HISTORY_PAGE_SIZE = 25
const HistoryEventCard = lazy(() => import('./components/HistoryEventCard').then((module) => ({ default: module.HistoryEventCard })))

function getToastTone(message: string): ToastTone {
  if (/^error|fallo|incorrect|invalid|invalido|inválido|no se pudo/i.test(message)) return 'error'
  if (/pendiente|incompleta/i.test(message)) return 'warning'
  if (/ok|sincronizado|guardada|guardado|cargados|cerrada|iniciada|creado|eliminado/i.test(message)) return 'success'
  return 'info'
}

function getToastLabel(tone: ToastTone) {
  if (tone === 'success') return 'OK'
  if (tone === 'warning') return 'ALERTA'
  if (tone === 'error') return 'ERROR'
  return 'INFO'
}

function clearAccessHash() {
  if (window.location.hash !== '#acceso') return

  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

function getScreenFromPath(): Screen {
  return window.location.pathname === '/mapa' ? 'mapa' : 'dashboard'
}

function getScreenPath(screen: Screen) {
  return screen === 'mapa' ? '/mapa' : '/'
}

function clampMapPercent(value: number) {
  if (!Number.isFinite(value)) return 50
  return Math.min(100, Math.max(0, value))
}

function addDateKeyDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) return dateKey
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function getAuthCallbackParams() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  return {
    hashParams: new URLSearchParams(hash),
    searchParams: new URLSearchParams(window.location.search),
  }
}

function isPasswordRecoveryUrl() {
  const { hashParams, searchParams } = getAuthCallbackParams()
  return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery' || searchParams.has('code')
}

function clearAuthCallbackUrl() {
  const url = new URL(window.location.href)
  const authParams = ['code', 'type', 'error', 'error_code', 'error_description']
  authParams.forEach((param) => url.searchParams.delete(param))
  url.hash = ''
  window.history.replaceState(null, '', `${url.pathname}${url.search}`)
}

function getPasswordRecoveryRedirectTo() {
  const url = new URL(window.location.href)
  url.hash = ''
  url.search = ''
  return url.toString()
}

function getStoredPasswordResetCooldownUntil() {
  const stored = Number(localStorage.getItem(PASSWORD_RESET_COOLDOWN_KEY))
  return Number.isFinite(stored) && stored > Date.now() ? stored : 0
}

function getSessionDevice(userAgent: string | null) {
  const normalized = (userAgent || '').toLowerCase()
  if (/android|iphone|ipad|ipod|mobile|windows phone/i.test(normalized)) return 'Movil'
  return 'Navegador'
}

function getSessionDedupeKey(log: SessionLog) {
  const normalizeDate = (value: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    date.setMilliseconds(0)
    return date.toISOString()
  }

  return [
    log.user_id,
    log.username,
    normalizeDate(log.login_at),
    normalizeDate(log.logout_at),
    log.user_agent || '',
  ].join('|')
}

function dedupeSessionLogs(logs: SessionLog[]) {
  const seen = new Set<string>()
  const unique: SessionLog[] = []
  const duplicates: SessionLog[] = []

  for (const log of logs) {
    const key = getSessionDedupeKey(log)
    if (seen.has(key)) {
      duplicates.push(log)
      continue
    }

    seen.add(key)
    unique.push(log)
  }

  return { unique, duplicates }
}

function getInitialTheme(): AppTheme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'dark' ? 'dark' : 'light'
}

function getInitialUnitSystem(): UnitSystem {
  const stored = localStorage.getItem(UNIT_SYSTEM_STORAGE_KEY)
  return stored === 'imperial' ? 'imperial' : 'metric'
}

const defaultEquipmentForm = {
  plant: '',
  line: '',
  beltCode: '',
  scaleName: '',
  controllerModel: '',
  controllerSerial: '',
  beltWidthMm: '',
  beltLengthM: '',
  nominalCapacityTph: '',
  bridgeLengthM: '',
  nominalSpeedMs: '',
  speedSource: 'automatica' as SpeedSource,
  rpmRollDiameterMm: '',
  calibrationFactorCurrent: '',
  adjustmentFactorCurrent: '1',
  checkIntervalDays: String(DEFAULT_CHECK_INTERVAL_DAYS),
  totalizerUnit: 'tn',
  photoPath: '',
  notes: '',
}

const defaultChainForm = {
  plant: '',
  name: '',
  linearWeightKgM: '',
  totalLengthM: '',
  totalWeightKg: '',
  notes: '',
}

const defaultEventForm = {
  eventDate: nowLocalValue(),
  tolerancePercent: '1',
  precheckBeltEmpty: false,
  precheckBeltClean: false,
  precheckNoMaterialBuildup: false,
  precheckIdlersOk: false,
  precheckStructureOk: false,
  precheckSpeedSensorOk: false,
  precheckNotes: '',
  zeroCompleted: false,
  zeroDisplayUnit: 'mV',
  zeroBeforeValue: '',
  zeroAfterValue: '',
  zeroAdjusted: false,
  zeroNotes: '',
  calibrationFactor: '',
  zeroValue: '',
  spanValue: '',
  filterValue: '',
  snapshotBridgeLengthM: '',
  snapshotNominalSpeedMs: '',
  units: 'kg',
  internalConstants: '',
  extraParameters: '',
  changedBy: '',
  changedReason: '',
  chainId: '',
  chainName: '',
  chainLinearKgM: '',
  passCount: '',
  avgControllerReadingKgM: '',
  provisionalFactor: '',
  expectedFlowTph: '',
  accumulatedTestMinutes: '',
  accumulatedIndicatedTotal: '',
  adjustmentFactorBefore: '',
  externalWeightKg: '',
  beltWeightKg: '',
  materialPass1ExternalWeightKg: '',
  materialPass1BeltWeightKg: '',
  materialPass1Factor: '',
  materialPass1Notes: '',
  materialPass2ExternalWeightKg: '',
  materialPass2BeltWeightKg: '',
  materialPass2Factor: '',
  materialPass2Notes: '',
  materialPass3ExternalWeightKg: '',
  materialPass3BeltWeightKg: '',
  materialPass3Factor: '',
  materialPass3Notes: '',
  finalFactor: '',
  adjustmentReason: '',
  technician: '',
  notes: '',
}

const defaultRpmToolForm = {
  rpm: '',
  indicatedSpeedMs: '',
}

const defaultLoopToolForm = {
  loopTimeSeconds: '',
  indicatedSpeedMs: '',
}

const defaultChainToolForm = {
  chainLengthM: '',
  chainWeightKg: '',
  trainLengthM: '',
  speedMs: '',
}

const defaultFactorToolForm = {
  currentFactor: '',
  controllerWeightKg: '',
  realWeightKg: '',
}

const defaultAccumulatedToolForm = {
  expectedFlowTph: '',
  testMinutes: '',
  indicatedTotal: '',
  adjustmentFactorCurrent: '1',
}

const calibrationSteps = [
  'Eleccion de balanza/cinta',
  'Inspeccion',
  'Cero',
  'Parametros',
  'Cadena',
  'Acumulado',
  'Material real',
  'Cierre',
]

const MAX_TOLERANCE_PERCENT = 20
const MAX_TEST_MINUTES = 240
const MAX_FACTOR_VALUE = 1_000_000

type EventDraft = {
  eventForm: typeof defaultEventForm
  selectedEquipmentId: string
  selectedChainId: string
  materialPassCount: number
  savedAt: string
}

function getStoredEventDraftSavedAt() {
  try {
    const rawDraft = localStorage.getItem(CALIBRATION_DRAFT_KEY)
    if (!rawDraft) return ''
    const draft = JSON.parse(rawDraft) as Partial<EventDraft>
    return typeof draft.savedAt === 'string' ? draft.savedAt : ''
  } catch {
    return ''
  }
}

type EventBlockingIssue = {
  message: string
  step: number
}

function outcomeLabel(outcome?: MaterialOutcome) {
  if (outcome === 'control_conforme') return 'Control conforme'
  if (outcome === 'calibrada_ajustada') return 'Calibrada'
  if (outcome === 'ajuste_sin_verificacion') return 'Ajuste sin verificacion'
  return 'Fuera de tolerancia'
}

function statusClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized.includes('fuera')) return 'danger'
  if (normalized.includes('pendiente') || normalized.includes('sin calibr')) return 'warning'
  if (normalized.includes('calibrada')) return 'success'
  if (normalized.includes('conforme')) return 'success'
  return 'neutral'
}

function getEventMaterialPasses(item: CalibrationEvent): MaterialPass[] {
  if (item.materialValidation.passes?.length) return item.materialValidation.passes
  return [
    {
      index: 1,
      externalWeightKg: item.materialValidation.externalWeightKg,
      beltWeightKg: item.materialValidation.beltWeightKg,
      factorUsed: item.materialValidation.factorBefore,
      errorPct: item.materialValidation.errorPct,
      notes: 'Registro historico sin pasadas detalladas.',
    },
  ]
}

function getEventMaterialOutcome(item: CalibrationEvent) {
  const passes = getEventMaterialPasses(item).filter((pass) => pass.externalWeightKg > 0 && pass.beltWeightKg > 0)
  const finalPass = passes[passes.length - 1]
  const errorPct = finalPass?.errorPct ?? item.materialValidation.errorPct
  const adjustmentApplied = item.materialValidation.adjustmentApplied ?? false
  const outcome = item.materialValidation.outcome ?? (Math.abs(errorPct) <= item.tolerancePercent ? 'control_conforme' : 'fuera_tolerancia')
  return {
    adjustmentApplied,
    errorPct,
    finalPass,
    outcome,
    passes,
    status: outcomeLabel(outcome),
  }
}

const DUE_SOON_DAYS = 7
const ANNUAL_SCALE_INTERVAL_DAYS = 365
const ANNUAL_SCALE_WARNING_DAYS = 30

type MaintenanceStatus = 'out_of_tolerance' | 'overdue' | 'due_soon' | 'ok' | 'no_history'

type EquipmentMaintenance = {
  status: MaintenanceStatus
  label: string
  rowClass: 'danger' | 'warning' | 'success' | 'neutral'
  priorityRank: number
  action: string
  detail: string
  lastValidDateText: string
  nextDueDateText: string
  daysRemaining: number | null
  daysText: string
}

type PlantPointStatus = {
  label: string
  rowClass: 'danger' | 'warning' | 'success' | 'neutral'
  detail: string
  lastValidDateText: string
  nextDueDateText: string
  daysText: string
  equipment?: Equipment
  maintenance?: EquipmentMaintenance
}

function plantMapPointTypeLabel(type: PlantMapPoint['pointType']) {
  if (type === 'truck_scale') return 'Báscula camionera'
  if (type === 'dispatch_scale') return 'Despacho'
  if (type === 'kiln_scale') return 'Horno'
  return 'Balanza dinámica'
}

function isAnnualPlantPoint(point: PlantMapPoint) {
  return point.pointType === 'truck_scale'
}

function getAnnualPlantPointStatus(point: PlantMapPoint, today = new Date()): PlantPointStatus {
  if (!point.annualCalibrationDate) {
    return {
      label: 'Sin fecha anual',
      rowClass: 'neutral',
      detail: 'Cargar fecha de ultima calibracion desde el mapa.',
      lastValidDateText: '-',
      nextDueDateText: 'Pendiente',
      daysText: 'Pendiente',
    }
  }

  const nextDueDate = addDateKeyDays(point.annualCalibrationDate, ANNUAL_SCALE_INTERVAL_DAYS)
  const daysRemaining = differenceInArgentinaDays(formatArgentinaDateKey(today), nextDueDate)
  const lastValidDateText = formatArgentinaDateKeyForDisplay(point.annualCalibrationDate)
  const nextDueDateText = formatArgentinaDateKeyForDisplay(nextDueDate)

  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining)
    return {
      label: 'Control anual vencido',
      rowClass: 'danger',
      detail: `Vencio hace ${overdueDays} dia${overdueDays === 1 ? '' : 's'} · ultimo anual ${lastValidDateText}`,
      lastValidDateText,
      nextDueDateText,
      daysText: `${overdueDays} dia${overdueDays === 1 ? '' : 's'} vencido`,
    }
  }

  if (daysRemaining <= ANNUAL_SCALE_WARNING_DAYS) {
    return {
      label: daysRemaining === 0 ? 'Vence hoy' : 'Vence pronto',
      rowClass: 'warning',
      detail: daysRemaining === 0 ? `Vence hoy · ultimo anual ${lastValidDateText}` : `Vence en ${daysRemaining} dias · ultimo anual ${lastValidDateText}`,
      lastValidDateText,
      nextDueDateText,
      daysText: daysRemaining === 0 ? 'Hoy' : `${daysRemaining} dias`,
    }
  }

  return {
    label: 'Anual vigente',
    rowClass: 'success',
    detail: `Proxima calibracion anual ${nextDueDateText} · ${daysRemaining} dias restantes`,
    lastValidDateText,
    nextDueDateText,
    daysText: `${daysRemaining} dias`,
  }
}

function getEquipmentMaintenance(item: Equipment, equipmentEvents: CalibrationEvent[], today = new Date()): EquipmentMaintenance {
  const sortedEvents = equipmentEvents
    .slice()
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
  const lastEvent = sortedEvents[0]
  const intervalDays = Number.isFinite(item.checkIntervalDays) && item.checkIntervalDays > 0
    ? Math.round(item.checkIntervalDays)
    : DEFAULT_CHECK_INTERVAL_DAYS

  if (!lastEvent) {
    return {
      status: 'no_history',
      label: 'Sin historial',
      rowClass: 'warning',
      priorityRank: 3,
      action: 'Primera calibracion',
      detail: `Sin control registrado · frecuencia ${intervalDays} dias`,
      lastValidDateText: '-',
      nextDueDateText: 'Pendiente',
      daysRemaining: null,
      daysText: 'Pendiente',
    }
  }

  const lastOutcome = getEventMaterialOutcome(lastEvent)
  if (statusClass(lastOutcome.status) === 'danger') {
    return {
      status: 'out_of_tolerance',
      label: 'Fuera de tolerancia',
      rowClass: 'danger',
      priorityRank: 0,
      action: 'Revisar desvio',
      detail: `Ultimo error ${lastOutcome.errorPct} % · ${formatDateTime(lastEvent.eventDate)}`,
      lastValidDateText: '-',
      nextDueDateText: 'Bloqueado',
      daysRemaining: null,
      daysText: 'Requiere accion',
    }
  }

  const lastValidEvent = sortedEvents.find((eventItem) => statusClass(getEventMaterialOutcome(eventItem).status) === 'success')
  if (!lastValidEvent) {
    return {
      status: 'no_history',
      label: 'Sin control valido',
      rowClass: 'warning',
      priorityRank: 3,
      action: 'Registrar control',
      detail: `No hay control conforme o calibracion valida · frecuencia ${intervalDays} dias`,
      lastValidDateText: '-',
      nextDueDateText: 'Pendiente',
      daysRemaining: null,
      daysText: 'Pendiente',
    }
  }

  const dueDateKey = addArgentinaDays(lastValidEvent.eventDate, intervalDays)
  const daysRemaining = differenceInArgentinaDays(formatArgentinaDateKey(today), dueDateKey)
  const lastValidDateText = formatDateOnly(lastValidEvent.eventDate)
  const nextDueDateText = formatArgentinaDateKeyForDisplay(dueDateKey)

  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining)
    return {
      status: 'overdue',
      label: 'Control vencido',
      rowClass: 'danger',
      priorityRank: 1,
      action: 'Control vencido',
      detail: `Vencio hace ${overdueDays} dia${overdueDays === 1 ? '' : 's'} · ultimo valido ${lastValidDateText}`,
      lastValidDateText,
      nextDueDateText,
      daysRemaining,
      daysText: `${overdueDays} dia${overdueDays === 1 ? '' : 's'} vencido`,
    }
  }

  if (daysRemaining <= DUE_SOON_DAYS) {
    return {
      status: 'due_soon',
      label: daysRemaining === 0 ? 'Vence hoy' : 'Vence pronto',
      rowClass: 'warning',
      priorityRank: 2,
      action: daysRemaining === 0 ? 'Control hoy' : 'Programar control',
      detail: daysRemaining === 0 ? `Vence hoy · ultimo valido ${lastValidDateText}` : `Vence en ${daysRemaining} dias · ultimo valido ${lastValidDateText}`,
      lastValidDateText,
      nextDueDateText,
      daysRemaining,
      daysText: daysRemaining === 0 ? 'Hoy' : `${daysRemaining} dias`,
    }
  }

  return {
    status: 'ok',
    label: 'Al dia',
    rowClass: 'success',
    priorityRank: 4,
    action: 'Seguimiento normal',
    detail: `Proximo control ${nextDueDateText} · ${daysRemaining} dias restantes`,
    lastValidDateText,
    nextDueDateText,
    daysRemaining,
    daysText: `${daysRemaining} dias`,
  }
}

function reportValue(value: unknown) {
  return String(value ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function reportRow(label: string, value: unknown) {
  return `<div><span>${reportValue(label)}</span><strong>${reportValue(value ?? '-')}</strong></div>`
}

function reportCheck(label: string, checked: boolean) {
  return `<span class="check ${checked ? 'ok' : 'alert'}">${checked ? 'OK' : 'NO'} · ${reportValue(label)}</span>`
}

function buildAdminManualHtml(user: AuthUser) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex, nofollow, noarchive" />
  <title>Manual administrador Calibra Cinta</title>
  <style>
    :root { font-family: Arial, sans-serif; color: #0c0b11; background: #f0efeb; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; background: #f7f5ef; line-height: 1.48; }
    main { max-width: 1040px; margin: 0 auto; }
    header, section { background: #faf9f6; border: 1px solid rgba(12, 11, 17, 0.18); padding: 24px; margin-bottom: 16px; }
    h1, h2, h3, p { margin: 0; }
    h1 { max-width: 760px; font-size: clamp(36px, 7vw, 72px); line-height: 0.88; text-transform: uppercase; letter-spacing: -0.045em; }
    h2 { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #ff5949; font-size: 24px; text-transform: uppercase; letter-spacing: -0.025em; }
    h3 { margin: 18px 0 8px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.02em; }
    p, li, td { color: #2e2930; }
    ul, ol { padding-left: 22px; }
    li { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 10px; border: 1px solid rgba(12, 11, 17, 0.14); text-align: left; vertical-align: top; }
    th { color: #f0efeb; background: #0c0b11; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    code { padding: 1px 5px; background: #e5e2da; border: 1px solid rgba(12, 11, 17, 0.12); }
    .cover { color: #f0efeb; background: linear-gradient(135deg, #0c0b11, #19171a 70%, #2e2930); }
    .cover p { max-width: 720px; margin-top: 12px; color: #e8e5de; }
    .kicker { display: inline-block; margin-bottom: 14px; color: #ff5949; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    .actions button, .actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 10px 14px; border: 2px solid #ff5949; background: #ff5949; color: #0c0b11; font-weight: 800; text-transform: uppercase; text-decoration: none; cursor: pointer; }
    .actions a.secondary { color: #f0efeb; background: transparent; }
    .meta, .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .meta { margin-top: 22px; }
    .meta div, .card { padding: 12px; background: #f0efeb; border: 1px solid rgba(12, 11, 17, 0.14); }
    .meta span { display: block; color: #737074; font-size: 12px; text-transform: uppercase; }
    .meta strong { display: block; margin-top: 3px; }
    .callout { padding: 12px; background: #fff3d6; border: 1px solid rgba(201, 133, 0, 0.45); }
    .ok { background: rgba(31, 143, 95, 0.1); border-color: rgba(31, 143, 95, 0.35); }
    .danger { background: rgba(196, 59, 48, 0.1); border-color: rgba(196, 59, 48, 0.35); }
    .toc ol { columns: 2; column-gap: 32px; }
    @media print { body { background: #fff; padding: 0; } header, section { break-inside: avoid; border-color: #bbb; } .actions { display: none; } }
    @media (max-width: 760px) { body { padding: 12px; } header, section { padding: 16px; } .meta, .grid { grid-template-columns: 1fr; } .toc ol { columns: 1; } }
  </style>
</head>
<body>
  <main>
    <header class="cover">
      <span class="kicker">Manual administrador interno</span>
      <h1>Calibra Cinta</h1>
      <p>Guia de administracion, supervision y mantenimiento operativo. Este documento se genera dentro de una sesion autenticada con rol admin y no se publica como recurso estatico.</p>
      <div class="actions">
        <button onclick="window.print()">Imprimir o guardar PDF</button>
        <a class="secondary" href="/manual/tecnico/" target="_blank" rel="noreferrer">Abrir manual tecnico</a>
      </div>
      <div class="meta">
        <div><span>Usuario</span><strong>${reportValue(user.username)}</strong></div>
        <div><span>Rol</span><strong>${reportValue(user.role)}</strong></div>
        <div><span>Version app</span><strong>${APP_VERSION}</strong></div>
      </div>
    </header>

    <section class="callout danger">
      <strong>Uso interno:</strong> no reenviar capturas, PDFs o contenidos administrativos fuera del equipo responsable. El manual tecnico de campo es el unico manual publico.
    </section>

    <section class="callout ok">
      <strong>Manual tecnico disponible:</strong> desde esta guia admin tambien se puede abrir el manual tecnico de campo para revisar el procedimiento operativo que usan tecnicos, supervisores y usuarios de consulta.
      <div class="actions"><a href="/manual/tecnico/" target="_blank" rel="noreferrer">Abrir manual tecnico de campo</a></div>
    </section>

    <section class="toc">
      <h2>Indice</h2>
      <ol>
        <li>Objetivo del rol admin</li>
        <li>Roles y permisos</li>
        <li>Ingreso y controles iniciales</li>
        <li>Gestion de usuarios</li>
        <li>Gestion de balanzas</li>
        <li>Gestion de cadenas patron</li>
        <li>Calibraciones y controles preventivos</li>
        <li>Historial, reportes y criterios de lectura</li>
        <li>Servidor online, permisos y datos</li>
        <li>Seguridad y despliegue Vercel</li>
        <li>Acciones destructivas</li>
        <li>Checklist de administracion</li>
      </ol>
    </section>

    <section>
      <h2>1. Objetivo del rol admin</h2>
      <p>El administrador mantiene la calidad de los datos maestros, los permisos de usuarios y la trazabilidad del historial. No reemplaza el criterio tecnico de campo: asegura que cada tecnico tenga acceso correcto, que cada equipo este identificado y que los eventos queden auditables.</p>
      <div class="grid">
        <div class="card"><strong>Datos maestros</strong><p>Balanzas, cadenas, plantas, factores y fotos.</p></div>
        <div class="card"><strong>Operacion</strong><p>Seguimiento de estado actual y eventos fuera de tolerancia.</p></div>
        <div class="card"><strong>Gobierno</strong><p>Usuarios, permisos, borrados y version desplegada.</p></div>
      </div>
    </section>

    <section>
      <h2>2. Roles y permisos</h2>
      <table>
        <thead><tr><th>Rol</th><th>Puede hacer</th><th>No debe hacer</th></tr></thead>
        <tbody>
          <tr><td>Admin</td><td>Gestiona usuarios, equipos, cadenas, eventos, eliminaciones y revisiones.</td><td>Compartir material admin o usar usuarios personales para tecnicos.</td></tr>
          <tr><td>Tecnico</td><td>Realiza trabajo de campo: da de alta equipos nuevos cuando no existen, carga cadenas, registra calibraciones/controles, usa herramientas y consulta historial.</td><td>No puede eliminar datos, gestionar usuarios, editar equipos existentes ni dar de baja balanzas.</td></tr>
          <tr><td>Supervisor</td><td>Consulta balanzas, historial, reportes, herramientas y fotos.</td><td>Crear, editar o borrar registros operativos.</td></tr>
          <tr><td>Consulta</td><td>Acceso basico de lectura segun configuracion.</td><td>Operar calibraciones o administrar datos.</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>3. Ingreso y controles iniciales</h2>
      <ol>
        <li>Confirmar que la cabecera muestre la version esperada luego de cada deploy.</li>
        <li>Confirmar que el estado de base indique <code>Servidor online</code> para trabajo multi-dispositivo.</li>
        <li>Si se ve <code>Modo local</code>, no asumir sincronizacion remota hasta resolver conectividad/configuracion.</li>
        <li>Si un usuario olvida su contrasena, usar <strong>Olvide mi contrasena</strong> en el ingreso; el servidor online enviara un link al email registrado.</li>
        <li>Revisar el dashboard: equipos fuera de tolerancia, equipos sin historial y eventos del mes.</li>
      </ol>
    </section>

    <section>
      <h2>4. Gestion de usuarios</h2>
      <h3>Alta recomendada</h3>
      <ol>
        <li>Entrar como admin y abrir <strong>Usuarios</strong>.</li>
        <li>Cargar email, nombre visible, contrasena y rol minimo necesario.</li>
        <li>Usar <code>tecnico</code> para campo, <code>supervisor</code> para revision y <code>viewer</code> para consulta.</li>
        <li>Reservar <code>admin</code> para responsables reales del sistema.</li>
      </ol>
      <div class="callout ok">Recuperacion de acceso: cada usuario puede pedir un link desde <strong>Olvide mi contrasena</strong>. El envio depende del email registrado y del servicio SMTP configurado en el servidor online.</div>
      <div class="callout">Si falla una accion de usuarios, revisar primero la Edge Function <code>manage-users</code> y el secret <code>SERVICE_ROLE_KEY</code>.</div>
    </section>

    <section>
      <h2>5. Gestion de balanzas</h2>
      <p>La balanza es el dato maestro principal. Una identificacion incorrecta afecta reportes, filtros, fotos y calibraciones.</p>
      <table>
        <thead><tr><th>Campo</th><th>Uso administrativo</th></tr></thead>
        <tbody>
          <tr><td>Planta, linea, cinta y nombre</td><td>Identificacion operativa y busqueda historica.</td></tr>
          <tr><td>Controlador y serie</td><td>Trazabilidad del instrumento intervenido.</td></tr>
          <tr><td>Puente y velocidad nominal</td><td>Base de calculos tecnicos y herramientas.</td></tr>
          <tr><td>Factor actual</td><td>Referencia para ajustes y diagnostico.</td></tr>
          <tr><td>Foto</td><td>Ayuda visual para evitar seleccionar equipo equivocado.</td></tr>
        </tbody>
      </table>
      <div class="callout ok">Los tecnicos pueden crear equipos, pero la edicion administrativa de equipos existentes queda reservada a admin por permisos internos.</div>
    </section>

    <section>
      <h2>6. Gestion de cadenas patron</h2>
      <p>Las cadenas se reutilizan en calibraciones. Mantener peso lineal, largo, peso total y planta correctamente cargados evita errores de span.</p>
      <ul>
        <li>Si hay cadenas de la misma planta que la balanza, la app prioriza esas cadenas.</li>
        <li>Si una planta no tiene cadenas, se habilita fallback a todas las cadenas disponibles.</li>
        <li>Los eventos historicos conservan el nombre y peso lineal usados aunque luego se edite la cadena.</li>
      </ul>
    </section>

    <section>
      <h2>7. Calibraciones y controles preventivos</h2>
      <p>El wizard se divide en ocho pasos: eleccion, inspeccion, cero, parametros, cadena, acumulado, material real y cierre. El cierre exige cargar explicitamente el <strong>Factor final</strong> que queda en el controlador.</p>
      <div class="callout ok">El flujo actual acepta decimales con coma o punto, incluye <strong>Marcar todo OK</strong> en inspeccion, simplifica cero a valor observado y conserva el borrador local solo cuando el usuario decide recuperarlo.</div>
      <table>
        <thead><tr><th>Situacion</th><th>Criterio</th><th>Resultado esperado</th></tr></thead>
        <tbody>
          <tr><td>Primera carga sin historial</td><td>Completar cadena, acumulado y material.</td><td>Calibrada o fuera de tolerancia.</td></tr>
          <tr><td>Control preventivo</td><td>Una pasada dentro de tolerancia sin ajuste puede cerrar.</td><td>Control conforme.</td></tr>
          <tr><td>Ajuste de factor</td><td>Debe existir pasada posterior completa.</td><td>Calibrada si queda dentro.</td></tr>
          <tr><td>Factor final vacio o cero</td><td>No se permite guardar.</td><td>Completar valor confirmado en controlador.</td></tr>
          <tr><td>Ultima pasada fuera</td><td>No forzar cierre conforme.</td><td>Fuera de tolerancia.</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>8. Historial, reportes y lectura de estado</h2>
      <ul>
        <li>El historial muestra todos los eventos, incluidos desvios ya corregidos.</li>
        <li>El dashboard muestra el estado actual del parque segun el ultimo evento de cada balanza.</li>
        <li>Un evento viejo fuera de tolerancia no debe contar como desvio abierto si la balanza luego quedo calibrada.</li>
        <li>El reporte imprimible se abre desde Historial y puede guardarse como PDF desde el navegador.</li>
        <li>El reporte A4 vertical prioriza resumen, pesos de referencia, pasadas completas con material, soporte tecnico y firma.</li>
      </ul>
    </section>

    <section>
      <h2>9. Servidor online, permisos y datos</h2>
      <p>La app usa un servidor online como base de datos en la nube para equipos, cadenas, eventos, perfiles y fotos. Los permisos internos impiden acciones fuera del rol asignado.</p>
      <ul>
        <li>No usar credenciales administrativas en el navegador.</li>
        <li>Si aparece un error de permisos, revisar tabla, accion y rol antes de cambiar configuraciones.</li>
        <li>La funcion interna de usuarios usa credenciales administrativas del servidor.</li>
        <li>El servidor online, el historial interno y los reportes PDF quedan como fuentes de consulta operativa.</li>
        <li>Los borrados de eventos/equipos se aplican solo sobre el servidor online y el cache local del navegador.</li>
        <li>El guardado de eventos no debe actualizar <code>equipments</code>, porque eso rompio previamente al rol tecnico.</li>
      </ul>
    </section>

    <section>
      <h2>10. Seguridad y despliegue Vercel</h2>
      <ul>
        <li>El dominio productivo es <code>mendex87.com</code>.</li>
        <li>Vercel despliega automaticamente luego de push a <code>main</code>.</li>
        <li>El manual admin no debe volver a publicarse en <code>public</code>.</li>
        <li>Las rutas publicas admin redirigen al manual tecnico.</li>
        <li>Los headers de seguridad se administran en <code>vercel.json</code>.</li>
      </ul>
    </section>

    <section>
      <h2>11. Acciones destructivas</h2>
      <p>Eliminar balanzas, cadenas o eventos es una accion administrativa. Confirmar siempre impacto operativo antes de avanzar.</p>
      <ul>
        <li>Eliminar una balanza puede afectar eventos asociados en el servidor online.</li>
        <li>Si hace falta respaldo externo de una balanza o evento, guardar PDF antes de borrar.</li>
        <li>Eliminar una cadena no modifica los datos historicos ya guardados en eventos.</li>
        <li>Eliminar eventos reduce la trazabilidad y debe quedar justificado por procedimiento interno.</li>
      </ul>
    </section>

    <section>
      <h2>12. Checklist de administracion</h2>
      <ol>
        <li>Version visible coincide con el ultimo deploy.</li>
        <li>Usuarios tienen rol minimo necesario.</li>
        <li>Balanzas nuevas tienen planta, linea, cinta, nombre y foto si corresponde.</li>
        <li>Cadenas tienen peso lineal verificado.</li>
        <li>Eventos recientes tienen Factor final confirmado y guardado.</li>
        <li>Historial y dashboard interno muestran eventos, estados y alertas actualizadas.</li>
        <li>Eventos fuera de tolerancia tienen seguimiento.</li>
        <li>Reportes importantes fueron impresos o guardados.</li>
        <li>No hay material admin publicado en rutas publicas.</li>
      </ol>
    </section>
  </main>
</body>
</html>`
}

function buildCalibrationReportHtml(item: CalibrationEvent, equipmentItem: Equipment | undefined, unitSystem: UnitSystem) {
  const materialSummary = getEventMaterialOutcome(item)
  const eventAppVersion = item.appVersion || item.parameterSnapshot.appVersion || '-'
  const measure = (value: number, kind: MeasureKind, digits = 3) => formatMeasureValue(value, kind, unitSystem, digits)
  const equipmentLabel = equipmentItem
    ? `${equipmentItem.plant} / ${equipmentItem.line} / ${equipmentItem.beltCode} / ${equipmentItem.scaleName}`
    : 'Equipo no encontrado'
  const materialPassRows = materialSummary.passes
    .map(
      (pass) => `<tr>
        <td>${reportValue(pass.index)}</td>
        <td>${reportValue(measure(pass.externalWeightKg, 'weightKg'))}</td>
        <td>${reportValue(measure(pass.beltWeightKg, 'weightKg'))}</td>
        <td>${reportValue(pass.factorUsed || '-')}</td>
        <td>${reportValue(`${pass.errorPct} %`)}</td>
        <td>${reportValue(materialSummary.finalPass?.index === pass.index ? 'Final' : pass.index === 1 ? 'Control inicial' : 'Post-ajuste')}</td>
      </tr>`,
    )
    .join('')
  const finalExternalWeight = materialSummary.finalPass?.externalWeightKg ?? item.materialValidation.externalWeightKg
  const finalBeltWeight = materialSummary.finalPass?.beltWeightKg ?? item.materialValidation.beltWeightKg
  const finalWeightDiff = finalBeltWeight - finalExternalWeight
  const closureType = materialSummary.adjustmentApplied ? 'Ajustada' : 'Control'
  const optionalMeasure = (value: number, kind: MeasureKind, digits = 3) => value > 0 ? measure(value, kind, digits) : 'No requerido'
  const optionalText = (value: string | number, suffix = '') => value ? `${value}${suffix}` : 'No requerido'
  const inspectionChecks = [
    reportCheck('Banda vacia', item.precheck.beltEmpty),
    reportCheck('Banda limpia', item.precheck.beltClean),
    reportCheck('Sin acumulacion', item.precheck.noMaterialBuildup),
    reportCheck('Rolos y puente OK', item.precheck.idlersOk),
    reportCheck('Estructura OK', item.precheck.structureOk),
    reportCheck('Sensor velocidad OK', item.precheck.speedSensorOk),
    reportCheck('Cero realizado', item.zeroCheck.completed),
  ].join('')

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte ${reportValue(item.id)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
    @page { size: A4 portrait; margin: 8mm; }
    :root { color: #0c0b11; font-family: Inter, Arial, sans-serif; --report-dark-gradient: linear-gradient(115deg, transparent 0 54%, rgba(255, 89, 73, 0.65) 54% 57%, transparent 57% 100%), repeating-linear-gradient(115deg, transparent 0 12px, rgba(248, 246, 239, 0.08) 12px 13px, transparent 13px 28px), linear-gradient(135deg, #0c0b11 0%, #19171d 72%, #2c2527 100%); }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 14px; background: #ece9e1; }
    h1, h2, p { margin: 0; }
    h1, h2, .badge, span, strong, th { font-family: "Barlow Condensed", Inter, sans-serif; text-transform: uppercase; }
    h1 { font-size: 34px; line-height: 0.82; letter-spacing: -0.04em; }
    h2 { margin-bottom: 5px; padding-bottom: 3px; border-bottom: 2px solid #ff5949; font-size: 16px; line-height: 0.9; letter-spacing: -0.015em; }
    .no-print { margin: 0 0 10px; min-height: 36px; padding: 0 14px; border: 1px solid #d94135; border-radius: 999px; background: #ff5949; color: #0c0b11; font-weight: 800; text-transform: uppercase; cursor: pointer; }
    .sheet { width: min(100%, 194mm); min-height: 277mm; margin: 0 auto; padding: 7mm; border: 1px solid #c9c3b8; border-radius: 8px; background: linear-gradient(115deg, rgba(255, 89, 73, 0.05) 0 18%, transparent 18% 100%), repeating-linear-gradient(135deg, transparent 0 16px, rgba(12, 11, 17, 0.025) 16px 17px, transparent 17px 34px), #f8f6ef; box-shadow: 0 18px 45px rgba(12, 11, 17, 0.16); }
    .header { overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) 58mm; gap: 8px; margin-bottom: 7px; padding: 10px; color: #f8f6ef; border-radius: 7px; background: var(--report-dark-gradient); background-clip: padding-box; }
    .header h1,
    .header span,
    .header strong { color: #f8f6ef; }
    .header p { margin-top: 4px; color: rgba(248, 246, 239, 0.78); font-size: 10px; }
    .equipment-title { max-width: 24ch; margin-top: 7px; color: #f8f6ef; font-family: "Barlow Condensed", Inter, sans-serif; font-size: 23px; font-weight: 700; line-height: 0.88; letter-spacing: -0.025em; text-transform: uppercase; }
    .badge { display: inline-flex; align-items: center; min-height: 24px; padding: 0 9px; border-radius: 999px; background: #ff5949; color: #0c0b11; font-size: 14px; font-weight: 700; letter-spacing: 0.05em; }
    .header .badge { color: #0c0b11; }
    .header-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; align-content: start; }
    .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .wide,
    .full { grid-column: 1 / -1; }
    .panel { padding: 6px; border: 1px solid #d5cfc3; border-radius: 7px; background: linear-gradient(135deg, rgba(255, 89, 73, 0.035), transparent 38%), #fffdf8; break-inside: avoid; }
    .result-strip { margin-bottom: 7px; padding: 7px; border: 1px solid #d5cfc3; border-radius: 7px; background: linear-gradient(115deg, rgba(255, 89, 73, 0.08), transparent 46%), #fffdf8; }
    .result-grid { display: grid; grid-template-columns: 1.15fr 0.62fr 0.54fr 0.82fr; gap: 4px; }
    .result-grid > div { min-height: 30px; padding: 5px 6px; border: 1px solid #dfd9ce; border-top: 3px solid #ff5949; border-radius: 5px; background: #faf8f2; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .grid div, .tile { min-height: 31px; padding: 5px 6px; border: 1px solid #dfd9ce; border-top: 3px solid #ff5949; border-radius: 5px; background: #faf8f2; }
    span { display: block; color: #6f6a68; font-size: 8.5px; font-weight: 700; letter-spacing: 0.06em; }
    strong { display: block; margin-top: 1px; color: #0c0b11; font-size: 13.5px; line-height: 0.94; letter-spacing: -0.01em; overflow-wrap: anywhere; }
    .weight-focus { margin-bottom: 7px; padding: 8px; border: 2px solid #0c0b11; border-radius: 8px; background: linear-gradient(120deg, rgba(255, 89, 73, 0.12), transparent 42%), #fffdf8; }
    .weight-grid { display: grid; grid-template-columns: 1fr 1fr 0.82fr 0.72fr; gap: 6px; }
    .weight-card { min-height: 56px; padding: 8px; border: 1px solid #d5cfc3; border-left: 6px solid #ff5949; border-radius: 7px; background: #faf8f2; }
    .weight-card strong { font-size: 24px; line-height: 0.88; letter-spacing: -0.035em; }
    .weight-card.main { color: #f8f6ef; border-color: #0c0b11; background: var(--report-dark-gradient); background-clip: padding-box; }
    .weight-card.main span,
    .weight-card.main strong { color: #f8f6ef; }
    .checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
    .check { min-height: 20px; padding: 4px 5px; border: 1px solid #dfd9ce; border-radius: 999px; background: #f7f4ed; color: #252226; font-size: 8.5px; line-height: 1; }
    .check.ok { border-color: rgba(31, 143, 95, 0.38); background: rgba(31, 143, 95, 0.1); }
    .check.alert { border-color: rgba(196, 59, 48, 0.35); background: rgba(196, 59, 48, 0.1); }
    table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 6px; background: #fffdf8; }
    th, td { padding: 4px 5px; border: 1px solid #d8d2c8; text-align: left; font-size: 9.6px; vertical-align: top; }
    th { background: var(--report-dark-gradient); color: #f8f6ef; font-size: 8.5px; letter-spacing: 0.05em; }
    .notes-grid { display: grid; grid-template-columns: 1fr 0.72fr; gap: 6px; align-items: stretch; }
    .notes { min-height: 46px; padding: 6px; border: 1px solid #d8d2c8; border-left: 4px solid #ff5949; border-radius: 6px; background: #fffdf8; font-size: 9px; line-height: 1.14; white-space: pre-wrap; overflow-wrap: anywhere; }
    .signature { display: grid; align-content: end; min-height: 58px; padding: 7px; border: 1px solid #0c0b11; border-radius: 6px; background: repeating-linear-gradient(135deg, transparent 0 9px, rgba(255, 89, 73, 0.08) 9px 10px), #fffdf8; }
    .signature-line { height: 1px; margin-top: 22px; background: #0c0b11; }
    .signature strong { font-size: 13px; }
    @media print { body { padding: 0; background: #fff; } .no-print { display: none; } .sheet { width: auto; min-height: auto; margin: 0; padding: 0; border: 0; box-shadow: none; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">Imprimir o guardar PDF</button>
  <main class="sheet">
    <section class="header">
      <div>
        <span>Reporte de calibracion</span>
        <h1>${reportValue(item.id)}</h1>
        <p>Equipo / cinta</p>
        <div class="equipment-title">${reportValue(equipmentLabel)}</div>
      </div>
      <div class="header-meta">
        <div><span>Fecha evento</span><strong>${reportValue(formatDateTime(item.eventDate))}</strong></div>
        <div><span>Tipo cierre</span><strong><span class="badge">${reportValue(closureType)}</span></strong></div>
        <div><span>Version app</span><strong>${reportValue(eventAppVersion)}</strong></div>
        <div><span>Unidades</span><strong>${reportValue(unitSystem === 'metric' ? 'Metricas' : 'Imperiales')}</strong></div>
      </div>
    </section>

    <section class="result-strip">
      <h2>Resumen</h2>
      <div class="result-grid">
        ${reportRow('Resultado', materialSummary.status)}
        ${reportRow('Tolerancia', `${item.tolerancePercent} %`)}
        ${reportRow('Pasadas', materialSummary.passes.length)}
        ${reportRow('Factor final', item.finalAdjustment.factorAfter)}
      </div>
    </section>

    <section class="weight-focus">
      <h2>Pesos de referencia</h2>
      <div class="weight-grid">
        <div class="weight-card main"><span>Peso certificado final</span><strong>${reportValue(measure(finalExternalWeight, 'weightKg'))}</strong></div>
        <div class="weight-card main"><span>Peso controlador final</span><strong>${reportValue(measure(finalBeltWeight, 'weightKg'))}</strong></div>
        <div class="weight-card"><span>Diferencia controlador-certificado</span><strong>${reportValue(measure(finalWeightDiff, 'weightKg'))}</strong></div>
        <div class="weight-card"><span>Error material final</span><strong>${reportValue(`${materialSummary.errorPct} %`)}</strong></div>
      </div>
    </section>

    <section class="layout">
      <div class="panel full">
        <h2>Material certificado</h2>
        <table>
          <thead><tr><th>#</th><th>Peso certificado</th><th>Controlador</th><th>Factor usado</th><th>Error</th><th>Rol</th></tr></thead>
          <tbody>${materialPassRows}</tbody>
        </table>
      </div>

      <div class="panel">
        <h2>Controlador y parametros</h2>
        <div class="grid">
          ${reportRow('Controlador', equipmentItem ? equipmentItem.controllerModel : '-')}
          ${reportRow('Serie', equipmentItem ? equipmentItem.controllerSerial : '-')}
          ${reportRow('Factor inicial', item.parameterSnapshot.calibrationFactor)}
          ${reportRow('Cero controlador', item.parameterSnapshot.zeroValue)}
          ${reportRow('Puente', measure(item.parameterSnapshot.bridgeLengthM, 'lengthM'))}
          ${reportRow('Velocidad', measure(item.parameterSnapshot.nominalSpeedMs, 'speedMs'))}
        </div>
      </div>

      <div class="panel">
        <h2>Cadena y acumulado</h2>
        <div class="grid">
          ${reportRow('Cadena', item.chainSpan.chainName || 'No requerido')}
          ${reportRow('Tiempo cadena', optionalText(item.chainSpan.passCount, ' min'))}
          ${reportRow('Peso lineal', optionalMeasure(item.chainSpan.chainLinearKgM, 'linearWeightKgM'))}
          ${reportRow('Lectura prom.', optionalMeasure(item.chainSpan.avgControllerReadingKgM, 'linearWeightKgM'))}
          ${reportRow('Caudal leido', optionalMeasure(item.accumulatedCheck.expectedFlowTph, 'flowTph'))}
          ${reportRow('Acumulado indicado', optionalMeasure(item.accumulatedCheck.indicatedTotal, 'massT'))}
        </div>
      </div>

      <div class="panel full">
        <h2>Inspeccion y cero</h2>
        <div class="checks">${inspectionChecks}</div>
      </div>

      <div class="panel full">
        <h2>Notas y firma</h2>
        <div class="notes-grid">
          <div>
            <div class="notes"><span>Diagnostico</span>${reportValue(item.diagnosis || '-')}</div>
            <div class="notes"><span>Observaciones</span>${reportValue(item.notes || '-')}</div>
          </div>
          <div class="signature">
            <span>Firma tecnico</span>
            <div class="signature-line"></div>
            <strong>${reportValue(item.approval.technician || '')}</strong>
          </div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`
}

function App() {
  const [screen, setScreen] = useState<Screen>(getScreenFromPath)
  const [equipment, setEquipment] = useState<Equipment[]>(() => loadEquipment())
  const [chains, setChains] = useState<Chain[]>(() => loadChains())
  const [events, setEvents] = useState<CalibrationEvent[]>(() => loadEvents())
  const [plantMapPoints, setPlantMapPoints] = useState<PlantMapPoint[]>(() => loadPlantMapPoints())
  const [plantMapDraftPoints, setPlantMapDraftPoints] = useState<PlantMapPoint[]>([])
  const [plantMapSource, setPlantMapSource] = useState<'local' | 'supabase'>('local')
  const [selectedPlantPointId, setSelectedPlantPointId] = useState('')
  const [plantMapEditing, setPlantMapEditing] = useState(false)
  const [plantMapSaving, setPlantMapSaving] = useState(false)
  const [draggingPlantPointId, setDraggingPlantPointId] = useState('')
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('')
  const [selectedChainId, setSelectedChainId] = useState('')
  const [equipmentForm, setEquipmentForm] = useState(defaultEquipmentForm)
  const [chainForm, setChainForm] = useState(defaultChainForm)
  const [eventForm, setEventForm] = useState(defaultEventForm)
  const [calibrationStep, setCalibrationStep] = useState(0)
  const [materialPassCount, setMaterialPassCount] = useState(1)
  const [hasEventDraft, setHasEventDraft] = useState(() => Boolean(localStorage.getItem(CALIBRATION_DRAFT_KEY)))
  const [eventDraftSavedAt, setEventDraftSavedAt] = useState(getStoredEventDraftSavedAt)
  const [equipmentSubmitAttempted, setEquipmentSubmitAttempted] = useState(false)
  const [chainSubmitAttempted, setChainSubmitAttempted] = useState(false)
  const [eventSubmitAttempted, setEventSubmitAttempted] = useState(false)
  const [eventSaving, setEventSaving] = useState(false)
  const [editingEquipmentId, setEditingEquipmentId] = useState('')
  const [equipmentPhotoFile, setEquipmentPhotoFile] = useState<File | null>(null)
  const [equipmentPhotoPreview, setEquipmentPhotoPreview] = useState('')
  const [photoViewer, setPhotoViewer] = useState<{ src: string; title: string } | null>(null)
  const [rpmToolForm, setRpmToolForm] = useState(defaultRpmToolForm)
  const [loopToolForm, setLoopToolForm] = useState(defaultLoopToolForm)
  const [chainToolForm, setChainToolForm] = useState(defaultChainToolForm)
  const [factorToolForm, setFactorToolForm] = useState(defaultFactorToolForm)
  const [accumulatedToolForm, setAccumulatedToolForm] = useState(defaultAccumulatedToolForm)
  const [historyEquipmentId, setHistoryEquipmentId] = useState('todos')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('todos')
  const [historyMonthFilter, setHistoryMonthFilter] = useState('todos')
  const [historyPage, setHistoryPage] = useState(1)
  const [loadingData, setLoadingData] = useState(true)
  const [dataSource, setDataSource] = useState<'local' | 'supabase'>('local')
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(getInitialUnitSystem)
  const [clockNow, setClockNow] = useState(() => new Date())
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null)
  const [navPulseScreen, setNavPulseScreen] = useState<Screen | null>(null)
  const [loginTransitionPhase, setLoginTransitionPhase] = useState<LoginTransitionPhase>('idle')
  const equipmentFormRef = useRef<HTMLDivElement | null>(null)
  const eventSaveInFlightRef = useRef(false)
  const didMountScrollRef = useRef(false)
  const navPulseTimeoutRef = useRef<number | null>(null)
  const plantMapCanvasRef = useRef<HTMLDivElement | null>(null)
  const loginTransitionTimeoutRef = useRef<number | null>(null)
  const loginTransitionStartedAtRef = useRef(0)
  const calibrationStepAnchorRef = useRef<HTMLDivElement | null>(null)
  const passwordRecoveryActiveRef = useRef(isPasswordRecoveryUrl())
  const dataLoadStartRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now())
  const dataLoadLoggedRef = useRef(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister())
      }).catch(() => undefined)
    }

    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.filter((key) => key.includes('workbox') || key.includes('supabase-api') || key.includes('google-fonts'))
          .forEach((key) => caches.delete(key))
      }).catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(UNIT_SYSTEM_STORAGE_KEY, unitSystem)
  }, [unitSystem])

  useEffect(() => {
    setEventForm((current) => (
      current.units === 'kg' || current.units === 'lb' || current.zeroDisplayUnit === 'kg' || current.zeroDisplayUnit === 'lb'
        ? {
            ...current,
            units: current.units === 'kg' || current.units === 'lb' ? getMeasureUnit('weightKg', unitSystem) : current.units,
            zeroDisplayUnit: current.zeroDisplayUnit === 'kg' || current.zeroDisplayUnit === 'lb' ? getMeasureUnit('weightKg', unitSystem) : current.zeroDisplayUnit,
          }
        : current
    ))
  }, [unitSystem])

  useEffect(() => () => {
    if (loginTransitionTimeoutRef.current !== null) {
      window.clearTimeout(loginTransitionTimeoutRef.current)
    }
  }, [])

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authPanelMode, setAuthPanelMode] = useState<AuthPanelMode>(() => (isPasswordRecoveryUrl() ? 'update-password' : 'login'))
  const [passwordResetEmail, setPasswordResetEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [authActionLoading, setAuthActionLoading] = useState(false)
  const [passwordResetCooldownUntil, setPasswordResetCooldownUntil] = useState(getStoredPasswordResetCooldownUntil)
  const [passwordResetCooldownNow, setPasswordResetCooldownNow] = useState(Date.now)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [userForm, setUserForm] = useState({ email: '', username: '', password: '', role: 'viewer' as UserRole })
  const [userManagementLoading, setUserManagementLoading] = useState(false)
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([])
  const [sessionsTab, setSessionsTab] = useState(false)

  useEffect(() => {
    if (!passwordResetCooldownUntil) return undefined

    const updateCooldown = () => {
      const now = Date.now()
      setPasswordResetCooldownNow(now)
      if (passwordResetCooldownUntil <= now) {
        localStorage.removeItem(PASSWORD_RESET_COOLDOWN_KEY)
        setPasswordResetCooldownUntil(0)
      }
    }

    updateCooldown()
    const intervalId = window.setInterval(updateCooldown, 1000)
    return () => window.clearInterval(intervalId)
  }, [passwordResetCooldownUntil])

  const passwordResetCooldownSeconds = Math.max(0, Math.ceil((passwordResetCooldownUntil - passwordResetCooldownNow) / 1000))
  const isPasswordResetCoolingDown = passwordResetCooldownSeconds > 0

  useEffect(() => {
    if (!currentUser) return undefined

    setClockNow(new Date())
    const clockInterval = window.setInterval(() => setClockNow(new Date()), 30_000)
    return () => window.clearInterval(clockInterval)
  }, [currentUser?.id])

  function setSyncNotice(message: string) {
    if (!message) return
    const id = generateId()
    const tone = getToastTone(message)

    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.map((item) => (item.id === id ? { ...item, exiting: true } : item)))
    }, 3800)
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4200)
  }

  const unitSystemName = unitSystem === 'metric' ? 'Metrico' : 'Imperial'
  const measureUnit = (kind: MeasureKind) => getMeasureUnit(kind, unitSystem)
  const measureLabel = (label: string, kind: MeasureKind) => `${label} (${measureUnit(kind)})`
  const measureInput = (value: string, kind: MeasureKind, digits = 6) => formatMeasureInput(value, kind, unitSystem, digits)
  const parseMeasure = (value: string, kind: MeasureKind, digits = 6) => parseMeasureInput(value, kind, unitSystem, digits)
  const measureText = (value: number, kind: MeasureKind, digits = 3) => formatMeasureValue(value, kind, unitSystem, digits)
  const measureNumber = (value: number, kind: MeasureKind, digits = 3) => formatNumberForDisplay(toDisplayMeasure(value, kind, unitSystem), digits)

  function handleUnitSystemToggle() {
    const nextUnitSystem = unitSystem === 'metric' ? 'imperial' : 'metric'
    setUnitSystem(nextUnitSystem)
    setSyncNotice(`Unidades ${nextUnitSystem === 'metric' ? 'metricas' : 'imperiales'} activadas. Los datos guardados no se modifican.`)
  }

  useEffect(() => {
    saveEquipment(equipment)
  }, [equipment])

  useEffect(() => {
    saveChains(chains)
  }, [chains])

  useEffect(() => {
    saveEvents(events)
  }, [events])

  useEffect(() => {
    if (loadingData || dataLoadLoggedRef.current) return
    dataLoadLoggedRef.current = true
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    console.info('[Calibra Cinta performance]', {
      version: APP_VERSION,
      dataSource,
      equipment: equipment.length,
      chains: chains.length,
      events: events.length,
      loadMs: Math.round(now - dataLoadStartRef.current),
    })
  }, [chains.length, dataSource, equipment.length, events.length, loadingData])

  useEffect(() => {
    let cancelled = false

    async function initializeAuth() {
      if (!supabase) {
        setAuthLoading(false)
        return
      }

      const recoveringPassword = isPasswordRecoveryUrl()
      if (recoveringPassword) {
        passwordRecoveryActiveRef.current = true
        setAuthPanelMode('update-password')
      }

      const { data } = await supabase.auth.getSession()
      if (!cancelled) {
        if (recoveringPassword) {
          setCurrentUser(null)
          setAuthLoading(false)
          return
        }

        await loadAuthenticatedUser(data.session)
        setAuthLoading(false)
      }
    }

    void initializeAuth()

    const { data } = supabase?.auth.onAuthStateChange((authEvent, session) => {
      if (authEvent === 'PASSWORD_RECOVERY' || isPasswordRecoveryUrl() || passwordRecoveryActiveRef.current) {
        passwordRecoveryActiveRef.current = true
        setAuthPanelMode('update-password')
        setCurrentUser(null)
        setAuthLoading(false)
        return
      }

      void loadAuthenticatedUser(session)
    }) || { data: null }

    return () => {
      cancelled = true
      data?.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false

    async function refreshAuthenticatedData() {
      try {
        const result = await loadAppData()
        if (cancelled) return
        setEquipment(result.equipment)
        setChains(result.chains || [])
        setEvents(result.events)
        setPlantMapPoints(result.plantMapPoints)
        setPlantMapSource(result.plantMapSource)
        setDataSource(result.source)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'No se pudo cargar la base remota.'
        setSyncNotice(`No se pudo cargar datos autenticados: ${message}`)
      }
    }

    void refreshAuthenticatedData()

    return () => {
      cancelled = true
    }
  }, [currentUser?.id])

  useEffect(() => {
    let cancelled = false

    async function initializeData() {
      try {
        const result = await loadAppData()
        if (cancelled) return
        setEquipment(result.equipment)
        setChains(result.chains || [])
        setEvents(result.events)
        setPlantMapPoints(result.plantMapPoints)
        setPlantMapSource(result.plantMapSource)
        setDataSource(result.source)
        if (!isSupabaseConfigured) {
          setSyncNotice('Servidor online no configurado. La app quedo en modo local.')
        }
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'No se pudo cargar la base remota.'
        setDataSource('local')
        setSyncNotice(`No se pudo conectar al servidor online: ${message}`)
      } finally {
        if (!cancelled) {
          setLoadingData(false)
        }
      }
    }

    void initializeData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return

    function handleOnline() {
      const client = supabase
      if (!client) return

      const pending = events.filter((e) => e.syncStatus === 'pendiente')
      if (pending.length === 0) return

      pending.forEach(async (event) => {
        try {
          const result = await client.from('calibration_events').insert(toEventRow(event))
          if (!result.error) {
            const syncValues = {
              syncStatus: 'sincronizado' as const,
              syncMessage: 'Sincronizado automaticamente tras reconexion.',
              syncedAt: new Date().toISOString(),
            }
            await updateCalibrationEventSync(event.id, syncValues)
            setEvents((current) =>
              current.map((item) => (item.id === event.id ? { ...item, ...syncValues } : item)),
            )
          }
        } catch {
          // Se mantiene pendiente para siguiente intento
        }
      })
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [events])

  useEffect(() => {
    if (!selectedEquipmentId && equipment.length > 0) {
      setSelectedEquipmentId(equipment[0].id)
    }
  }, [equipment, selectedEquipmentId])

  useEffect(() => {
    if (!equipmentPhotoFile) {
      setEquipmentPhotoPreview('')
      return
    }
    const objectUrl = URL.createObjectURL(equipmentPhotoFile)
    setEquipmentPhotoPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [equipmentPhotoFile])

  useEffect(() => {
    if (!currentUser) return
    if (currentUser.role !== 'admin' && screen === 'usuarios') {
      setScreen(currentUser.role === 'viewer' ? 'herramientas' : 'dashboard')
    }
    if (currentUser.role === 'viewer' && (screen === 'balanzas' || screen === 'nueva')) {
      setScreen('herramientas')
    }
    if (currentUser.role === 'supervisor' && screen === 'nueva') {
      setScreen('dashboard')
    }
  }, [currentUser, screen])

  useEffect(() => {
    const handlePopState = () => setScreen(getScreenFromPath())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const desiredPath = getScreenPath(screen)
    const isPlantMapPath = window.location.pathname === '/mapa'
    if (window.location.pathname !== desiredPath && (screen === 'mapa' || isPlantMapPath)) {
      window.history.pushState(null, '', desiredPath)
    }
  }, [screen])

  const selectedEquipment = useMemo(
    () => equipment.find((item) => item.id === selectedEquipmentId),
    [equipment, selectedEquipmentId],
  )

  const selectedEquipmentLastEvent = useMemo(() => {
    if (!selectedEquipment) return null
    return events
      .filter((item) => item.equipmentId === selectedEquipment.id)
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())[0] || null
  }, [events, selectedEquipment])

  const selectedEquipmentStatus = selectedEquipmentLastEvent
    ? getEventMaterialOutcome(selectedEquipmentLastEvent).status
    : 'Sin calibrar'
  const requiresFullCalibration = !selectedEquipmentLastEvent

  const selectedChain = useMemo(() => chains.find((item) => item.id === selectedChainId), [chains, selectedChainId])
  const plantChains = useMemo(() => {
    if (!selectedEquipment) return []
    const equipmentPlant = selectedEquipment.plant.trim().toLowerCase()
    return chains.filter((item) => item.plant.trim().toLowerCase() === equipmentPlant)
  }, [chains, selectedEquipment])
  const availableChains = selectedEquipment && plantChains.length > 0 ? plantChains : chains
  const usingAllChainsFallback = Boolean(selectedEquipment && plantChains.length === 0 && chains.length > 0)
  const canOperate = currentUser?.role === 'admin' || currentUser?.role === 'tecnico'
  const canReview = currentUser?.role === 'admin' || currentUser?.role === 'tecnico' || currentUser?.role === 'supervisor'
  const canDelete = currentUser?.role === 'admin'
  const canManageUsers = currentUser?.role === 'admin'

  useEffect(() => {
    if (screen === 'usuarios' && canManageUsers) {
      if (sessionsTab) {
        void loadSessionLogs()
      } else {
        void loadManagedUsers()
      }
    }
  }, [screen, canManageUsers, sessionsTab])

  useEffect(() => {
    if (!currentUser) return
    if (!didMountScrollRef.current) {
      didMountScrollRef.current = true
      return
    }
    const isMobile = window.matchMedia('(max-width: 640px)').matches
    if (!isMobile || screen === 'nueva') return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      const target = document.querySelector('#main-content .screen-banner') || document.querySelector('#main-content .screen-shell')
      target?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
    })
  }, [screen, currentUser])

  useEffect(() => {
    if (screen !== 'nueva') return
    const isMobile = window.matchMedia('(max-width: 640px)').matches
    if (!isMobile) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      calibrationStepAnchorRef.current?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
    })
  }, [screen, calibrationStep])

  useEffect(() => {
    if (screen !== 'nueva') return

    const intervalId = window.setInterval(() => {
      const savedAt = new Date().toISOString()
      const draft: EventDraft = {
        eventForm,
        selectedEquipmentId,
        selectedChainId,
        materialPassCount,
        savedAt,
      }
      localStorage.setItem(CALIBRATION_DRAFT_KEY, JSON.stringify(draft))
      setHasEventDraft(true)
      setEventDraftSavedAt(savedAt)
    }, 30_000)

    return () => window.clearInterval(intervalId)
  }, [screen, eventForm, selectedEquipmentId, selectedChainId, materialPassCount])

  useEffect(() => {
    if (!selectedEquipment) return

    setChainToolForm((current) => ({
      ...current,
      trainLengthM: current.trainLengthM || String(selectedEquipment.bridgeLengthM || ''),
      speedMs: current.speedMs || String(selectedEquipment.nominalSpeedMs || ''),
    }))
    setFactorToolForm((current) => ({
      ...current,
      currentFactor: current.currentFactor || String(selectedEquipment.calibrationFactorCurrent || ''),
    }))
    setAccumulatedToolForm((current) => ({
      ...current,
      adjustmentFactorCurrent: current.adjustmentFactorCurrent || String(selectedEquipment.adjustmentFactorCurrent || 1),
    }))
    const plantChain = chains.find((item) => item.plant.trim().toLowerCase() === selectedEquipment.plant.trim().toLowerCase())
    if (plantChain) {
      setSelectedChainId((current) => current || plantChain.id)
      setChainToolForm((current) => ({
        ...current,
        chainLengthM: current.chainLengthM || String(plantChain.totalLengthM || ''),
        chainWeightKg: current.chainWeightKg || String(plantChain.totalWeightKg || ''),
      }))
      setEventForm((current) => ({
        ...current,
        chainId: current.chainId || plantChain.id,
        chainName: current.chainName || plantChain.name,
        chainLinearKgM: current.chainLinearKgM || String(plantChain.linearWeightKgM || ''),
      }))
    }
  }, [selectedEquipment, chains])

  function applySelectedChainToEvent(chain: Chain) {
    setSelectedChainId(chain.id)
    setEventForm((current) => ({
      ...current,
      chainId: chain.id,
      chainName: chain.name,
      chainLinearKgM: String(chain.linearWeightKgM || ''),
    }))
  }

  const equipmentWithLastEvent = useMemo(() => {
    return equipment.map((item) => {
      const equipmentEvents = events.filter((eventItem) => eventItem.equipmentId === item.id)
      const lastEvent = equipmentEvents
        .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())[0]
      return { item, lastEvent, maintenance: getEquipmentMaintenance(item, equipmentEvents) }
    })
  }, [equipment, events])

  const avgErrorPct = useMemo(
    () => computePercentError(toNumber(eventForm.chainLinearKgM) || 0, toNumber(eventForm.avgControllerReadingKgM) || 0),
    [eventForm.chainLinearKgM, eventForm.avgControllerReadingKgM],
  )

  const materialFactorBefore = toNumber(eventForm.calibrationFactor) || 0

  const materialPasses = useMemo<MaterialPass[]>(() => {
    const rawPasses = [
      {
        index: 1,
        externalWeightKg: toNumber(eventForm.materialPass1ExternalWeightKg || eventForm.externalWeightKg) || 0,
        beltWeightKg: toNumber(eventForm.materialPass1BeltWeightKg || eventForm.beltWeightKg) || 0,
        factorUsed: materialFactorBefore,
        notes: eventForm.materialPass1Notes.trim(),
      },
      {
        index: 2,
        externalWeightKg: toNumber(eventForm.materialPass2ExternalWeightKg) || 0,
        beltWeightKg: toNumber(eventForm.materialPass2BeltWeightKg) || 0,
        factorUsed: toNumber(eventForm.materialPass2Factor) || 0,
        notes: eventForm.materialPass2Notes.trim(),
      },
      {
        index: 3,
        externalWeightKg: toNumber(eventForm.materialPass3ExternalWeightKg) || 0,
        beltWeightKg: toNumber(eventForm.materialPass3BeltWeightKg) || 0,
        factorUsed: toNumber(eventForm.materialPass3Factor) || 0,
        notes: eventForm.materialPass3Notes.trim(),
      },
    ]

    return rawPasses.slice(0, materialPassCount).map((pass) => ({
      ...pass,
      errorPct: round(computePercentError(pass.externalWeightKg, pass.beltWeightKg)),
    }))
  }, [eventForm, materialFactorBefore, materialPassCount])

  const completeMaterialPasses = useMemo(
    () => materialPasses.filter((pass) => pass.externalWeightKg > 0 && pass.beltWeightKg > 0),
    [materialPasses],
  )
  const displayedMaterialPassesComplete = useMemo(
    () => materialPasses.every((pass) => pass.externalWeightKg > 0 && pass.beltWeightKg > 0 && (pass.index === 1 || pass.factorUsed > 0)),
    [materialPasses],
  )

  const finalMaterialPass = completeMaterialPasses[completeMaterialPasses.length - 1]
  const materialErrorPct = finalMaterialPass?.errorPct ?? 0

  const suggestedFactor = useMemo(
    () => computeSuggestedFactor(finalMaterialPass?.factorUsed || materialFactorBefore, finalMaterialPass?.externalWeightKg || 0, finalMaterialPass?.beltWeightKg || 0),
    [finalMaterialPass, materialFactorBefore],
  )

  const materialAdjustmentApplied = useMemo(() => {
    const finalFactor = toNumber(eventForm.finalFactor) || finalMaterialPass?.factorUsed || materialFactorBefore
    return completeMaterialPasses.length > 1 || Math.abs(finalFactor - materialFactorBefore) > 0.000001
  }, [completeMaterialPasses.length, eventForm.finalFactor, finalMaterialPass, materialFactorBefore])

  const materialOutcome = useMemo<MaterialOutcome>(() => {
    if (!finalMaterialPass) return 'fuera_tolerancia'
    if (Math.abs(finalMaterialPass.errorPct) > (toNumber(eventForm.tolerancePercent) || 1)) return 'fuera_tolerancia'
    return materialAdjustmentApplied ? 'calibrada_ajustada' : 'control_conforme'
  }, [eventForm.tolerancePercent, finalMaterialPass, materialAdjustmentApplied])

  const outOfToleranceCount = useMemo(
    () => equipmentWithLastEvent.filter(({ lastEvent }) => lastEvent && statusClass(getEventMaterialOutcome(lastEvent).status) === 'danger').length,
    [equipmentWithLastEvent],
  )

  const dashboardStats = useMemo(() => {
    const currentMonth = formatArgentinaYearMonth()
    const withoutHistory = equipmentWithLastEvent.filter(({ lastEvent }) => !lastEvent).length
    const overdue = equipmentWithLastEvent.filter(({ maintenance }) => maintenance.status === 'overdue').length
    const dueSoon = equipmentWithLastEvent.filter(({ maintenance }) => maintenance.status === 'due_soon').length
    const upToDate = equipmentWithLastEvent.filter(({ maintenance }) => maintenance.status === 'ok').length
    const conform = events.filter((item) => getEventMaterialOutcome(item).outcome === 'control_conforme').length
    const calibrated = events.filter((item) => getEventMaterialOutcome(item).outcome === 'calibrada_ajustada').length
    const monthEvents = events.filter((item) => formatArgentinaYearMonth(item.eventDate) === currentMonth).length
    const nextAction = outOfToleranceCount > 0
      ? 'Revisar equipos fuera de tolerancia'
      : overdue > 0
        ? 'Atender controles vencidos'
        : dueSoon > 0
          ? 'Programar controles proximos'
          : withoutHistory > 0
            ? 'Completar primera calibracion'
            : 'Mantener controles preventivos'
    return { withoutHistory, overdue, dueSoon, upToDate, conform, calibrated, monthEvents, nextAction }
  }, [equipmentWithLastEvent, events, outOfToleranceCount])

  const fleetReadinessPercent = equipment.length
    ? Math.max(0, Math.round((dashboardStats.upToDate / equipment.length) * 100))
    : 0

  const latestEvent = useMemo(() => {
    return events
      .slice()
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())[0] || null
  }, [events])

  const priorityEquipment = useMemo(() => {
    return equipmentWithLastEvent
      .map(({ item, lastEvent, maintenance }) => {
        return {
          item,
          lastEvent,
          maintenance,
          statusText: maintenance.label,
          statusKey: maintenance.rowClass,
          rank: maintenance.priorityRank,
          action: maintenance.action,
          detail: maintenance.detail,
        }
      })
      .filter((row) => row.rank < 4)
      .sort((a, b) => a.rank - b.rank || `${a.item.plant}${a.item.line}${a.item.beltCode}`.localeCompare(`${b.item.plant}${b.item.line}${b.item.beltCode}`))
      .slice(0, 4)
  }, [equipmentWithLastEvent])

  const selectedEquipmentMaintenance = selectedEquipment
    ? getEquipmentMaintenance(selectedEquipment, events.filter((item) => item.equipmentId === selectedEquipment.id))
    : null

  const activePlantMapPoints = plantMapEditing ? plantMapDraftPoints : plantMapPoints

  useEffect(() => {
    if (selectedPlantPointId && activePlantMapPoints.some((point) => point.id === selectedPlantPointId)) return
    setSelectedPlantPointId(activePlantMapPoints[0]?.id || '')
  }, [activePlantMapPoints, selectedPlantPointId])

  const plantMapStatusById = useMemo(() => {
    const statusById = new Map<string, PlantPointStatus>()

    activePlantMapPoints.forEach((point) => {
      if (isAnnualPlantPoint(point)) {
        statusById.set(point.id, getAnnualPlantPointStatus(point, clockNow))
        return
      }

      if (!point.equipmentId) {
        statusById.set(point.id, {
          label: 'Pendiente de vincular',
          rowClass: 'neutral',
          detail: 'Un administrador debe vincular este punto con una balanza cargada.',
          lastValidDateText: '-',
          nextDueDateText: 'Pendiente',
          daysText: 'Pendiente',
        })
        return
      }

      const linkedEquipment = equipment.find((item) => item.id === point.equipmentId)
      if (!linkedEquipment) {
        statusById.set(point.id, {
          label: 'Vinculo no encontrado',
          rowClass: 'neutral',
          detail: 'La balanza vinculada ya no existe en el parque cargado.',
          lastValidDateText: '-',
          nextDueDateText: 'Pendiente',
          daysText: 'Pendiente',
        })
        return
      }

      const equipmentEvents = events.filter((item) => item.equipmentId === linkedEquipment.id)
      const maintenance = getEquipmentMaintenance(linkedEquipment, equipmentEvents, clockNow)
      statusById.set(point.id, {
        label: maintenance.label,
        rowClass: maintenance.rowClass,
        detail: maintenance.detail,
        lastValidDateText: maintenance.lastValidDateText,
        nextDueDateText: maintenance.nextDueDateText,
        daysText: maintenance.daysText,
        equipment: linkedEquipment,
        maintenance,
      })
    })

    return statusById
  }, [activePlantMapPoints, clockNow, equipment, events])

  const selectedPlantPoint = activePlantMapPoints.find((point) => point.id === selectedPlantPointId) || activePlantMapPoints[0]
  const selectedPlantPointStatus = selectedPlantPoint ? plantMapStatusById.get(selectedPlantPoint.id) : undefined
  const plantMapStatusCounts = useMemo(() => {
    return activePlantMapPoints.reduce(
      (summary, point) => {
        const status = plantMapStatusById.get(point.id)?.rowClass || 'neutral'
        summary[status] += 1
        return summary
      },
      { success: 0, warning: 0, danger: 0, neutral: 0 },
    )
  }, [activePlantMapPoints, plantMapStatusById])

  function startPlantMapEditing() {
    if (currentUser?.role !== 'admin') return
    setPlantMapDraftPoints(plantMapPoints)
    setPlantMapEditing(true)
    setSyncNotice('Modo edicion del mapa activo. Los cambios se aplican al guardar.')
  }

  function cancelPlantMapEditing() {
    setPlantMapDraftPoints([])
    setPlantMapEditing(false)
    setDraggingPlantPointId('')
    setSyncNotice('Edicion del mapa cancelada.')
  }

  function updatePlantMapDraftPoint(pointId: string, changes: Partial<PlantMapPoint>) {
    setPlantMapDraftPoints((current) => current.map((point) => (point.id === pointId ? { ...point, ...changes } : point)))
  }

  async function savePlantMapEditing() {
    if (currentUser?.role !== 'admin' || !plantMapEditing) return
    setPlantMapSaving(true)
    try {
      const savedAt = new Date().toISOString()
      const nextPoints = plantMapDraftPoints.map((point) => ({ ...point, updatedAt: savedAt }))
      const result = await savePlantMapPointsRecord(nextPoints)
      setPlantMapPoints(nextPoints)
      setPlantMapDraftPoints([])
      setPlantMapEditing(false)
      setDraggingPlantPointId('')
      setPlantMapSource(result.source)
      setSyncNotice(result.source === 'supabase' ? 'Mapa de planta guardado en servidor online.' : 'Mapa de planta guardado solo localmente.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el mapa.'
      setSyncNotice(`Error al guardar mapa: ${message}`)
    } finally {
      setPlantMapSaving(false)
    }
  }

  function updatePlantPointPosition(pointId: string, event: PointerEvent<HTMLElement>) {
    const canvas = plantMapCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = clampMapPercent(((event.clientX - rect.left) / rect.width) * 100)
    const y = clampMapPercent(((event.clientY - rect.top) / rect.height) * 100)
    updatePlantMapDraftPoint(pointId, { x: round(x, 2), y: round(y, 2) })
  }

  function handlePlantPointPointerDown(event: PointerEvent<HTMLButtonElement>, pointId: string) {
    setSelectedPlantPointId(pointId)
    if (!plantMapEditing || currentUser?.role !== 'admin') return
    event.preventDefault()
    setDraggingPlantPointId(pointId)
    event.currentTarget.setPointerCapture(event.pointerId)
    updatePlantPointPosition(pointId, event)
  }

  function handlePlantPointPointerMove(event: PointerEvent<HTMLButtonElement>, pointId: string) {
    if (draggingPlantPointId !== pointId || !plantMapEditing) return
    updatePlantPointPosition(pointId, event)
  }

  function handlePlantPointPointerUp(event: PointerEvent<HTMLButtonElement>, pointId: string) {
    if (draggingPlantPointId !== pointId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDraggingPlantPointId('')
  }

  function handlePlantMapPointEquipmentChange(pointId: string, equipmentId: string) {
    if (!plantMapEditing || currentUser?.role !== 'admin') return
    updatePlantMapDraftPoint(pointId, { equipmentId })
  }

  function handlePlantMapPointDateChange(pointId: string, annualCalibrationDate: string) {
    if (!plantMapEditing || currentUser?.role !== 'admin') return
    updatePlantMapDraftPoint(pointId, { annualCalibrationDate })
  }

  const precheckPassed = useMemo(
    () =>
      eventForm.precheckBeltEmpty &&
      eventForm.precheckBeltClean &&
      eventForm.precheckNoMaterialBuildup &&
      eventForm.precheckIdlersOk &&
      eventForm.precheckStructureOk &&
      eventForm.precheckSpeedSensorOk,
    [eventForm],
  )

  function markPrecheckAsPassed() {
    setEventForm((current) => ({
      ...current,
      precheckBeltEmpty: true,
      precheckBeltClean: true,
      precheckNoMaterialBuildup: true,
      precheckIdlersOk: true,
      precheckStructureOk: true,
      precheckSpeedSensorOk: true,
    }))
  }

  const equipmentBlockingIssues = useMemo(() => {
    const issues: string[] = []
    if (!equipmentForm.plant.trim()) issues.push('Falta planta.')
    if (!equipmentForm.line.trim()) issues.push('Falta linea.')
    if (!equipmentForm.beltCode.trim()) issues.push('Falta identificacion de cinta.')
    if (!equipmentForm.scaleName.trim()) issues.push('Falta nombre de balanza.')
    if (!equipmentForm.controllerModel.trim()) issues.push('Falta modelo de controlador.')
    if (!(toNumber(equipmentForm.bridgeLengthM) > 0)) issues.push('La distancia de puente debe ser mayor a 0.')
    if (!(toNumber(equipmentForm.nominalSpeedMs) > 0)) issues.push('La velocidad nominal debe ser mayor a 0.')
    if (!(toNumber(equipmentForm.checkIntervalDays) > 0)) issues.push('La frecuencia de control debe ser mayor a 0 dias.')
    return issues
  }, [equipmentForm])

  const chainBlockingIssues = useMemo(() => {
    const issues: string[] = []
    if (!chainForm.plant.trim()) issues.push('Falta planta.')
    if (!chainForm.name.trim()) issues.push('Falta nombre de cadena.')
    if (!(toNumber(chainForm.linearWeightKgM) > 0)) issues.push('El peso por metro debe ser mayor a 0.')
    return issues
  }, [chainForm])

  const eventBlockingIssues = useMemo(() => {
    const issues: EventBlockingIssue[] = []
    const addIssue = (message: string, step: number) => issues.push({ message, step })
    const tolerancePercent = toNumber(eventForm.tolerancePercent)
    const calibrationFactor = toNumber(eventForm.calibrationFactor)
    const finalFactor = toNumber(eventForm.finalFactor)
    if (!selectedEquipment) addIssue('Seleccioná una balanza.', 0)
    if (!(tolerancePercent > 0)) addIssue('La tolerancia debe ser mayor a 0.', 0)
    if (tolerancePercent > MAX_TOLERANCE_PERCENT) addIssue(`La tolerancia no puede superar ${MAX_TOLERANCE_PERCENT} %.`, 0)
    if (!precheckPassed) addIssue('Completá toda la inspeccion previa.', 1)
    if (!eventForm.zeroCompleted) addIssue('Debés registrar el cero antes de calibrar.', 2)
    if (!(calibrationFactor > 0)) addIssue('Falta el factor de calibracion actual del controlador.', 3)
    if (calibrationFactor > MAX_FACTOR_VALUE) addIssue('El factor de calibracion actual es demasiado alto; revisá el valor cargado.', 3)
    if (!currentUser?.username.trim()) addIssue('Falta usuario responsable logueado.', 7)
    if (requiresFullCalibration) {
      const chainTestMinutes = toNumber(eventForm.passCount)
      const accumulatedTestMinutes = toNumber(eventForm.accumulatedTestMinutes)
      if (!(toNumber(eventForm.chainLinearKgM) > 0)) addIssue('Falta el peso lineal de cadena.', 4)
      if (!(chainTestMinutes > 0)) addIssue('Falta el tiempo de test con cadena.', 4)
      if (chainTestMinutes > MAX_TEST_MINUTES) addIssue(`El tiempo de test con cadena no puede superar ${MAX_TEST_MINUTES} min.`, 4)
      if (!(toNumber(eventForm.avgControllerReadingKgM) > 0)) addIssue('Falta el promedio de lectura del controlador.', 4)
      if (!(toNumber(eventForm.expectedFlowTph) > 0)) addIssue('Falta el caudal leido.', 5)
      if (!(accumulatedTestMinutes > 0)) addIssue('Falta el tiempo de prueba.', 5)
      if (accumulatedTestMinutes > MAX_TEST_MINUTES) addIssue(`El tiempo de prueba no puede superar ${MAX_TEST_MINUTES} min.`, 5)
      if (!(toNumber(eventForm.accumulatedIndicatedTotal) > 0)) addIssue('Falta el acumulado indicado.', 5)
    }
    materialPasses.forEach((pass) => {
      const hasAnyWeight = pass.externalWeightKg !== 0 || pass.beltWeightKg !== 0
      if (pass.externalWeightKg < 0 || pass.beltWeightKg < 0) addIssue(`La pasada ${pass.index} no puede tener pesos negativos.`, 6)
      if (pass.index > 1 && !hasAnyWeight) addIssue(`Completá o quitá la pasada ${pass.index}.`, 6)
      if (hasAnyWeight && !(pass.externalWeightKg > 0 && pass.beltWeightKg > 0)) addIssue(`Completá peso certificado y controlador en la pasada ${pass.index}.`, 6)
      if (pass.factorUsed > MAX_FACTOR_VALUE) addIssue(`El factor usado en la pasada ${pass.index} es demasiado alto.`, 6)
    })
    if (!finalMaterialPass) addIssue('Falta una pasada completa con material real.', 6)
    if (completeMaterialPasses.some((pass) => pass.index > 1 && !(pass.factorUsed > 0))) addIssue('Falta el factor usado en una verificacion post-ajuste.', 6)
    if (materialAdjustmentApplied && completeMaterialPasses.length < 2) addIssue('Si se ajusta el factor, falta una pasada posterior de verificacion.', 6)
    if (!(finalFactor > 0)) addIssue('Falta el factor de calibracion final.', 7)
    if (finalFactor > MAX_FACTOR_VALUE) addIssue('El factor de calibracion final es demasiado alto; revisá el valor cargado.', 7)
    return issues
  }, [completeMaterialPasses, currentUser, eventForm, finalMaterialPass, materialAdjustmentApplied, materialPasses, precheckPassed, requiresFullCalibration, selectedEquipment])

  const firstBlockingIssue = eventBlockingIssues[0]

  const calibrationStepStates = useMemo(() => {
    const fullCalibrationReady = !requiresFullCalibration || (
      toNumber(eventForm.chainLinearKgM) > 0 &&
      toNumber(eventForm.avgControllerReadingKgM) > 0 &&
      toNumber(eventForm.expectedFlowTph) > 0 &&
      toNumber(eventForm.accumulatedTestMinutes) > 0 &&
      toNumber(eventForm.accumulatedIndicatedTotal) > 0
    )
    return calibrationSteps.map((step, index) => {
      const complete = [
        Boolean(selectedEquipment && eventForm.eventDate && toNumber(eventForm.tolerancePercent) > 0 && toNumber(eventForm.tolerancePercent) <= MAX_TOLERANCE_PERCENT),
        precheckPassed,
        eventForm.zeroCompleted,
        toNumber(eventForm.calibrationFactor) > 0,
        !requiresFullCalibration || (toNumber(eventForm.chainLinearKgM) > 0 && toNumber(eventForm.passCount) > 0 && toNumber(eventForm.passCount) <= MAX_TEST_MINUTES && toNumber(eventForm.avgControllerReadingKgM) > 0),
        !requiresFullCalibration || (toNumber(eventForm.expectedFlowTph) > 0 && toNumber(eventForm.accumulatedTestMinutes) > 0 && toNumber(eventForm.accumulatedTestMinutes) <= MAX_TEST_MINUTES && toNumber(eventForm.accumulatedIndicatedTotal) > 0),
        Boolean(finalMaterialPass && displayedMaterialPassesComplete),
        eventBlockingIssues.length === 0,
      ][index]
      const skipped = !requiresFullCalibration && (index === 4 || index === 5)
      const warning = index === 4 || index === 5 ? requiresFullCalibration && !fullCalibrationReady : false
      const statusLabel = skipped ? 'No requerido' : complete ? 'Completo' : warning ? 'Requiere atencion' : 'Pendiente'
      return { step, complete, warning, skipped, statusLabel }
    })
  }, [displayedMaterialPassesComplete, eventBlockingIssues.length, eventForm, finalMaterialPass, precheckPassed, requiresFullCalibration, selectedEquipment])

  const wizardReadinessPercent = Math.round((calibrationStepStates.filter(({ complete }) => complete).length / calibrationSteps.length) * 100)
  const wizardStepCue = [
    selectedEquipment ? `Equipo activo: ${selectedEquipment.beltCode} / ${selectedEquipment.scaleName}. ${selectedEquipmentMaintenance?.detail || ''}` : 'Selecciona una balanza para iniciar el circuito.',
    precheckPassed ? 'Inspeccion completa. El equipo esta en condicion de medicion.' : 'Completa los seis checks mecanicos antes de avanzar.',
    eventForm.zeroCompleted ? 'Cero registrado. Continua con la foto de parametros.' : 'Registra el cero del controlador antes de medir.',
    toNumber(eventForm.calibrationFactor) > 0 ? 'Factor actual del controlador registrado. Ese factor sera la base para material real.' : 'Carga el factor actual con el que esta trabajando la balanza.',
    !requiresFullCalibration ? 'Cadena no requerida para este control preventivo.' : toNumber(eventForm.chainLinearKgM) > 0 && toNumber(eventForm.avgControllerReadingKgM) > 0 ? 'Span con cadena registrado.' : 'Carga peso lineal de cadena y promedio del controlador.',
    !requiresFullCalibration ? 'Acumulado no requerido para este control preventivo.' : toNumber(eventForm.expectedFlowTph) > 0 && toNumber(eventForm.accumulatedTestMinutes) > 0 && toNumber(eventForm.accumulatedIndicatedTotal) > 0 ? 'Acumulado registrado.' : 'Completa caudal leido, tiempo y acumulado indicado.',
    finalMaterialPass ? `Ultima pasada: ${round(materialErrorPct)} % de error.` : 'Carga al menos una pasada completa con material real.',
    eventBlockingIssues.length === 0 ? 'Evento listo para guardar con factor final confirmado.' : eventBlockingIssues[0]?.message,
  ][calibrationStep]

  const rpmToolResult = useMemo(() => {
    const diameterMm = selectedEquipment?.rpmRollDiameterMm || 0
    const rpm = toNumber(rpmToolForm.rpm) || 0
    const indicated = toNumber(rpmToolForm.indicatedSpeedMs) || 0
    if (!diameterMm || !rpm) return null

    const diameterM = diameterMm / 1000
    const speedMs = (rpm * Math.PI * diameterM) / 60
    const speedMmin = speedMs * 60
    const speedMh = speedMs * 3600
    const diff = indicated ? indicated - speedMs : 0
    const errorPct = indicated ? (diff / speedMs) * 100 : 0

    return {
      speedMs,
      speedMmin,
      speedMh,
      diff,
      errorPct,
    }
  }, [rpmToolForm, selectedEquipment])

  const loopToolResult = useMemo(() => {
    const beltLengthM = selectedEquipment?.beltLengthM || 0
    const loopTimeSeconds = toNumber(loopToolForm.loopTimeSeconds) || 0
    const indicated = toNumber(loopToolForm.indicatedSpeedMs) || 0
    if (!beltLengthM || !loopTimeSeconds) return null

    const speedMs = beltLengthM / loopTimeSeconds
    const speedMmin = speedMs * 60
    const speedMh = speedMs * 3600
    const diff = indicated ? indicated - speedMs : 0
    const errorPct = indicated ? (diff / speedMs) * 100 : 0

    return {
      speedMs,
      speedMmin,
      speedMh,
      diff,
      errorPct,
    }
  }, [loopToolForm, selectedEquipment])

  const chainToolResult = useMemo(() => {
    const chainLengthM = toNumber(chainToolForm.chainLengthM) || 0
    const chainWeightKg = toNumber(chainToolForm.chainWeightKg) || 0
    const trainLengthM = toNumber(chainToolForm.trainLengthM) || 0
    const speedMs = toNumber(chainToolForm.speedMs) || 0
    if (!chainLengthM || !chainWeightKg || !trainLengthM || !speedMs) return null

    const kgPerMeter = chainWeightKg / chainLengthM
    const kgOnTrain = kgPerMeter * trainLengthM
    const tph = kgOnTrain * speedMs * 3.6

    return {
      kgPerMeter,
      kgOnTrain,
      tph,
    }
  }, [chainToolForm])

  const factorToolResult = useMemo(() => {
    const currentFactor = toNumber(factorToolForm.currentFactor) || 0
    const controllerWeightKg = toNumber(factorToolForm.controllerWeightKg) || 0
    const realWeightKg = toNumber(factorToolForm.realWeightKg) || 0
    if (!currentFactor || !controllerWeightKg || !realWeightKg) return null

    const newFactor = currentFactor * (realWeightKg / controllerWeightKg)
    const diffKg = realWeightKg - controllerWeightKg
    const errorPct = (diffKg / realWeightKg) * 100
    const recommendation = Math.abs(errorPct) < 0.5 ? 'Mantener factor' : errorPct > 0 ? 'Subir factor' : 'Bajar factor'

    return {
      newFactor,
      diffKg,
      errorPct,
      recommendation,
    }
  }, [factorToolForm])

  const accumulatedToolResult = useMemo(() => {
    const expectedFlowTph = toNumber(accumulatedToolForm.expectedFlowTph) || 0
    const testMinutes = toNumber(accumulatedToolForm.testMinutes) || 0
    const indicatedTotal = toNumber(accumulatedToolForm.indicatedTotal) || 0
    const adjustmentFactorCurrent = toNumber(accumulatedToolForm.adjustmentFactorCurrent) || 0
    if (!expectedFlowTph || !testMinutes || !indicatedTotal || !adjustmentFactorCurrent) return null

    const expectedTotal = (expectedFlowTph * testMinutes) / 60
    const errorPct = ((indicatedTotal - expectedTotal) / expectedTotal) * 100
    const suggestedAdjustmentFactor = adjustmentFactorCurrent * (expectedTotal / indicatedTotal)

    return {
      expectedTotal,
      errorPct,
      suggestedAdjustmentFactor,
    }
  }, [accumulatedToolForm])

  const automaticDiagnosis = useMemo(() => {
    const messages: string[] = []
    if (rpmToolResult && selectedEquipment?.nominalSpeedMs) {
      const configuredDiffPct = ((rpmToolResult.speedMs - selectedEquipment.nominalSpeedMs) / selectedEquipment.nominalSpeedMs) * 100
      if (Math.abs(configuredDiffPct) > 2) {
        messages.push('La velocidad calculada por RPM no coincide con la velocidad configurada.')
      }
    }
    if (chainToolResult && eventForm.avgControllerReadingKgM) {
      if (Math.abs(avgErrorPct) > 2) {
        messages.push('El caudal instantaneo o la lectura base difieren mas de 2%; revisar factor de calibracion, velocidad o mecanica.')
      }
    }
    if (accumulatedToolResult) {
      if (Math.abs(accumulatedToolResult.errorPct) > 2) {
        messages.push('El acumulado difiere mas de 2%; revisar o corregir con factor de ajuste.')
      }
      if (Math.abs(accumulatedToolResult.errorPct) <= 2 && chainToolResult && Math.abs(avgErrorPct) <= 2) {
        messages.push('Instantaneo y acumulado coherentes para la prueba realizada.')
      }
    }
    if (chainToolResult && Math.abs(avgErrorPct) <= 2 && accumulatedToolResult && Math.abs(accumulatedToolResult.errorPct) > 2) {
      messages.push('Si el instantaneo esta correcto y falla el acumulado, no tocar factor de calibracion. Corregir con factor de ajuste.')
    }
    if (!eventForm.zeroCompleted) {
      messages.push('El cero no fue realizado antes de la prueba.')
    }
    if (finalMaterialPass && materialOutcome === 'control_conforme') {
      messages.push('La pasada con material quedo dentro de tolerancia sin ajuste; registrar como control preventivo conforme.')
    }
    if (finalMaterialPass && materialOutcome === 'calibrada_ajustada') {
      messages.push('Hubo ajuste de factor y verificacion posterior dentro de tolerancia; registrar como calibrada.')
    }
    if (finalMaterialPass && materialOutcome === 'fuera_tolerancia') {
      messages.push('La ultima pasada con material queda fuera de tolerancia; requiere nueva verificacion o intervencion.')
    }
    return messages
  }, [rpmToolResult, selectedEquipment, chainToolResult, eventForm.avgControllerReadingKgM, avgErrorPct, accumulatedToolResult, eventForm.zeroCompleted, finalMaterialPass, materialOutcome])

  const historyMonths = useMemo(() => {
    return Array.from(new Set(events.map((item) => formatArgentinaYearMonth(item.eventDate)).filter(Boolean))).sort().reverse()
  }, [events])

  const filteredEvents = useMemo(() => {
    return events
      .filter((item) => {
        const matchesEquipment = historyEquipmentId === 'todos' || item.equipmentId === historyEquipmentId
        const materialSummary = getEventMaterialOutcome(item)
        const statusKey = statusClass(materialSummary.status)
        const matchesStatus = historyStatusFilter === 'todos' || statusKey === historyStatusFilter
        const matchesMonth = historyMonthFilter === 'todos' || formatArgentinaYearMonth(item.eventDate) === historyMonthFilter
        return matchesEquipment && matchesStatus && matchesMonth
      })
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
  }, [events, historyEquipmentId, historyMonthFilter, historyStatusFilter])

  const historySummary = useMemo(() => {
    return filteredEvents.reduce(
      (summary, item) => {
        const state = statusClass(getEventMaterialOutcome(item).status)
        if (state === 'danger') summary.outOfTolerance += 1
        if (state === 'success') summary.compliant += 1
        return summary
      },
      { outOfTolerance: 0, compliant: 0 },
    )
  }, [filteredEvents])

  const historyTotalPages = Math.max(1, Math.ceil(filteredEvents.length / HISTORY_PAGE_SIZE))
  const paginatedEvents = useMemo(() => {
    const safePage = Math.min(Math.max(historyPage, 1), historyTotalPages)
    const start = (safePage - 1) * HISTORY_PAGE_SIZE
    return filteredEvents.slice(start, start + HISTORY_PAGE_SIZE)
  }, [filteredEvents, historyPage, historyTotalPages])

  const equipmentById = useMemo(() => {
    return new Map(equipment.map((item) => [item.id, item]))
  }, [equipment])

  useEffect(() => {
    setHistoryPage(1)
  }, [historyEquipmentId, historyMonthFilter, historyStatusFilter])

  useEffect(() => {
    setHistoryPage((current) => Math.min(Math.max(current, 1), historyTotalPages))
  }, [historyTotalPages])

  function resetEventForm() {
    const plantChain = selectedEquipment
      ? chains.find((chain) => chain.plant.trim().toLowerCase() === selectedEquipment.plant.trim().toLowerCase())
      : undefined
    const chainForEvent = selectedChain || plantChain

    if (!selectedChain && plantChain) setSelectedChainId(plantChain.id)
    setEventForm({
      ...defaultEventForm,
      eventDate: nowLocalValue(),
      units: measureUnit('weightKg'),
      snapshotBridgeLengthM: selectedEquipment ? String(selectedEquipment.bridgeLengthM || '') : '',
      snapshotNominalSpeedMs: selectedEquipment ? String(selectedEquipment.nominalSpeedMs || '') : '',
      chainId: chainForEvent?.id || '',
      chainName: chainForEvent?.name || '',
      chainLinearKgM: chainForEvent ? String(chainForEvent.linearWeightKgM || '') : '',
    })
    setCalibrationStep(0)
    setMaterialPassCount(1)
    setEventSubmitAttempted(false)
  }

  function saveEventDraft() {
    const savedAt = new Date().toISOString()
    const draft: EventDraft = {
      eventForm,
      selectedEquipmentId,
      selectedChainId,
      materialPassCount,
      savedAt,
    }
    localStorage.setItem(CALIBRATION_DRAFT_KEY, JSON.stringify(draft))
    setHasEventDraft(true)
    setEventDraftSavedAt(savedAt)
    setSyncNotice('Borrador de calibracion guardado en este dispositivo.')
  }

  function loadEventDraft() {
    const rawDraft = localStorage.getItem(CALIBRATION_DRAFT_KEY)
    if (!rawDraft) {
      setSyncNotice('No hay borrador local para recuperar.')
      return
    }

    try {
      const draft = JSON.parse(rawDraft) as EventDraft
      setEventForm({ ...defaultEventForm, ...draft.eventForm })
      setSelectedEquipmentId(draft.selectedEquipmentId || '')
      setSelectedChainId(draft.selectedChainId || '')
      setMaterialPassCount(draft.materialPassCount || 1)
      setCalibrationStep(0)
      setScreen('nueva')
      setEventDraftSavedAt(draft.savedAt || '')
      setSyncNotice(`Borrador recuperado (${formatDateTime(draft.savedAt)}).`)
    } catch {
      localStorage.removeItem(CALIBRATION_DRAFT_KEY)
      setHasEventDraft(false)
      setEventDraftSavedAt('')
      setSyncNotice('El borrador local estaba dañado y fue descartado.')
    }
  }

  function clearEventDraft(showNotice = true) {
    localStorage.removeItem(CALIBRATION_DRAFT_KEY)
    setHasEventDraft(false)
    setEventDraftSavedAt('')
    if (showNotice) {
      resetEventForm()
      setSyncNotice('Borrador local descartado. Formulario reiniciado.')
    }
  }

  function goToCalibrationStep(step: number) {
    setCalibrationStep(Math.min(Math.max(step, 0), calibrationSteps.length - 1))
  }

  function goToPreviousCalibrationStep() {
    setCalibrationStep((current) => Math.max(current - 1, 0))
  }

  function goToNextCalibrationStep() {
    setCalibrationStep((current) => Math.min(current + 1, calibrationSteps.length - 1))
  }

  function printCalibrationReport(item: CalibrationEvent, equipmentItem?: Equipment) {
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      setSyncNotice('No se pudo abrir el reporte. Revisá el bloqueador de ventanas emergentes.')
      return
    }

    reportWindow.opener = null
    reportWindow.document.write(buildCalibrationReportHtml(item, equipmentItem, unitSystem))
    reportWindow.document.close()
    reportWindow.focus()
    reportWindow.setTimeout(() => reportWindow.print(), 250)
  }

  function openAdminManual() {
    if (!currentUser || currentUser.role !== 'admin') return
    const manualWindow = window.open('', '_blank')
    if (!manualWindow) {
      setSyncNotice('No se pudo abrir el manual admin. Revisá el bloqueador de ventanas emergentes.')
      return
    }

    manualWindow.opener = null
    manualWindow.document.write(buildAdminManualHtml(currentUser))
    manualWindow.document.close()
    manualWindow.focus()
  }

  async function recordLoginSession(session: Session, username: string) {
    if (!supabase) return

    const sessionLogId = generateId()
    const userAgent = navigator.userAgent || ''
    const ipAddress = (session as unknown as Record<string, unknown>)?.ip || null
    const { error } = await supabase.from('user_sessions').insert({
      id: sessionLogId,
      user_id: session.user.id,
      username,
      login_at: new Date().toISOString(),
      ip_address: ipAddress ? String(ipAddress) : null,
      user_agent: userAgent || null,
    })

    if (error) {
      console.error('Error registrando login:', error)
      localStorage.removeItem(SESSION_LOG_ID_KEY)
      return
    }

    localStorage.setItem(SESSION_LOG_ID_KEY, sessionLogId)
  }

  async function loadAuthenticatedUser(session: Session | null, options: { recordLogin?: boolean } = {}) {
    if (!session?.user || !supabase) {
      setCurrentUser(null)
      localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('username, role')
      .eq('id', session.user.id)
      .single()

    if (error || !data) {
      setCurrentUser(null)
      localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY)
      setSyncNotice('Tu usuario no tiene perfil asignado. Contactá a un administrador.')
      return
    }

    const username = data.username || session.user.email || 'Usuario'

    setCurrentUser({
      id: session.user.id,
      email: session.user.email || '',
      username,
      role: data.role as UserRole,
    })

    if (options.recordLogin) {
      await recordLoginSession(session, username)
    }
  }

  async function handleLogout(message = 'Sesion cerrada.') {
    if (!supabase) {
      setCurrentUser(null)
      setScreen('dashboard')
      localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY)
      setSyncNotice(message)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData?.session?.user?.id || currentUser?.id
    const sessionLogId = localStorage.getItem(SESSION_LOG_ID_KEY)
    const logoutAt = new Date().toISOString()

    if (userId) {
      try {
        if (sessionLogId) {
          const { error } = await supabase
            .from('user_sessions')
            .update({ logout_at: logoutAt })
            .eq('id', sessionLogId)

          if (error) throw error
        }

        // Cierra duplicados abiertos creados por versiones previas del flujo de auth.
        const { error } = await supabase
          .from('user_sessions')
          .update({ logout_at: logoutAt })
          .eq('user_id', userId)
          .is('logout_at', null)

        if (error) throw error
      } catch (err) {
        console.error('Error registrando logout:', err)
      }
    }

    localStorage.removeItem(SESSION_LOG_ID_KEY)
    localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY)
    await supabase.auth.signOut()
    setCurrentUser(null)
    setScreen('dashboard')
    setSyncNotice(message)
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    if (!supabase) {
      setSyncNotice('Autenticacion online no configurada.')
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    })

    if (error) {
      setSyncNotice('Usuario o contrasenia incorrectos.')
      setLoginPassword('')
      return
    }

    if (!data?.session) {
      setSyncNotice('Error al iniciar sesion. Intenta de nuevo.')
      return
    }

    localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(Date.now()))
    const shouldRevealLoginTransition = beginLoginTransition()
    await loadAuthenticatedUser(data.session, { recordLogin: true })
    setLoginEmail('')
    setLoginPassword('')
    setSyncNotice('Sesion iniciada.')
    setScreen(getScreenFromPath())
    clearAccessHash()
    if (shouldRevealLoginTransition) revealLoginTransition()
  }

  function showPasswordRecoveryRequest() {
    setPasswordResetEmail(loginEmail.trim())
    setLoginPassword('')
    setAuthPanelMode('recover-password')
  }

  function startPasswordResetCooldown() {
    const cooldownUntil = Date.now() + PASSWORD_RESET_COOLDOWN_MS
    localStorage.setItem(PASSWORD_RESET_COOLDOWN_KEY, String(cooldownUntil))
    setPasswordResetCooldownNow(Date.now())
    setPasswordResetCooldownUntil(cooldownUntil)
  }

  async function handlePasswordResetRequest(event: FormEvent) {
    event.preventDefault()
    if (!supabase) {
      setSyncNotice('Recuperacion online no configurada.')
      return
    }

    const email = (passwordResetEmail || loginEmail).trim().toLowerCase()
    if (!email) {
      setSyncNotice('Ingresá el email del usuario para recuperar la contraseña.')
      return
    }

    const cooldownMs = passwordResetCooldownUntil - Date.now()
    if (cooldownMs > 0) {
      const seconds = Math.ceil(cooldownMs / 1000)
      setPasswordResetCooldownNow(Date.now())
      setSyncNotice(`Esperá ${seconds} segundos antes de pedir otro email de recuperacion.`)
      return
    }

    setAuthActionLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordRecoveryRedirectTo(),
      })

      if (error) throw error

      setLoginEmail(email)
      setPasswordResetEmail(email)
      startPasswordResetCooldown()
      setSyncNotice('Si el email esta registrado, enviamos instrucciones para cambiar la contraseña.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar la recuperacion.'
      if (/rate limit|too many|exceeded/i.test(message)) {
        startPasswordResetCooldown()
        setSyncNotice(`Demasiados intentos de recuperacion. Esperá ${PASSWORD_RESET_COOLDOWN_MS / 1000} segundos antes de reenviar.`)
        return
      }
      setSyncNotice(`No se pudo enviar la recuperacion: ${message}`)
    } finally {
      setAuthActionLoading(false)
    }
  }

  async function handlePasswordUpdate(event: FormEvent) {
    event.preventDefault()
    if (!supabase) {
      setSyncNotice('Recuperacion online no configurada.')
      return
    }

    if (newPassword.length < 8) {
      setSyncNotice('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (newPassword !== newPasswordConfirm) {
      setSyncNotice('Las contraseñas no coinciden.')
      return
    }

    setAuthActionLoading(true)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setSyncNotice('El link de recuperacion expiro. Solicitá uno nuevo.')
        return
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      passwordRecoveryActiveRef.current = false
      clearAuthCallbackUrl()
      setNewPassword('')
      setNewPasswordConfirm('')
      setLoginPassword('')
      setAuthPanelMode('login')
      await supabase.auth.signOut()
      setCurrentUser(null)
      setSyncNotice('Contraseña actualizada. Ingresá nuevamente.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar la contraseña.'
      setSyncNotice(`No se pudo actualizar la contraseña: ${message}`)
    } finally {
      setAuthActionLoading(false)
    }
  }

  async function cancelPasswordUpdate() {
    passwordRecoveryActiveRef.current = false
    clearAuthCallbackUrl()
    setNewPassword('')
    setNewPasswordConfirm('')
    setAuthPanelMode('login')
    if (supabase) await supabase.auth.signOut()
  }

  useEffect(() => {
    if (!currentUser) return undefined

    let timeoutId: number | null = null
    let closingSession = false

    const getLastActivity = () => {
      const stored = Number(localStorage.getItem(SESSION_LAST_ACTIVITY_KEY))
      return Number.isFinite(stored) && stored > 0 ? stored : null
    }

    const clearSessionTimer = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const closeIfExpired = () => {
      if (closingSession) return

      const lastActivity = getLastActivity()
      const elapsed = lastActivity ? Date.now() - lastActivity : SESSION_TIMEOUT_MS
      if (elapsed < SESSION_TIMEOUT_MS) {
        scheduleSessionClose()
        return
      }

      closingSession = true
      void handleLogout(`Sesion cerrada automaticamente tras ${SESSION_TIMEOUT_MINUTES} minutos sin actividad.`)
    }

    function scheduleSessionClose() {
      clearSessionTimer()
      const lastActivity = getLastActivity()
      const elapsed = lastActivity ? Date.now() - lastActivity : SESSION_TIMEOUT_MS
      const remaining = SESSION_TIMEOUT_MS - elapsed

      if (remaining <= 0) {
        closeIfExpired()
        return
      }

      timeoutId = window.setTimeout(closeIfExpired, remaining)
    }

    const registerSessionActivity = () => {
      if (closingSession) return
      localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(Date.now()))
      scheduleSessionClose()
    }

    const resumeSessionActivity = () => {
      if (closingSession) return

      const lastActivity = getLastActivity()
      const elapsed = lastActivity ? Date.now() - lastActivity : SESSION_TIMEOUT_MS
      if (elapsed >= SESSION_TIMEOUT_MS) {
        closeIfExpired()
        return
      }

      registerSessionActivity()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') resumeSessionActivity()
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SESSION_LAST_ACTIVITY_KEY) scheduleSessionClose()
    }

    const lastActivity = getLastActivity()
    if (!lastActivity) {
      registerSessionActivity()
    } else if (Date.now() - lastActivity >= SESSION_TIMEOUT_MS) {
      closeIfExpired()
    } else {
      registerSessionActivity()
    }

    window.addEventListener('pointerdown', registerSessionActivity)
    window.addEventListener('keydown', registerSessionActivity)
    window.addEventListener('touchstart', registerSessionActivity, { passive: true })
    window.addEventListener('wheel', registerSessionActivity, { passive: true })
    window.addEventListener('focus', resumeSessionActivity)
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearSessionTimer()
      window.removeEventListener('pointerdown', registerSessionActivity)
      window.removeEventListener('keydown', registerSessionActivity)
      window.removeEventListener('touchstart', registerSessionActivity)
      window.removeEventListener('wheel', registerSessionActivity)
      window.removeEventListener('focus', resumeSessionActivity)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentUser?.id])

  function primeEventForm(item: Equipment) {
    const plantChain = chains.find((chain) => chain.plant.trim().toLowerCase() === item.plant.trim().toLowerCase())
    if (plantChain) {
      setSelectedChainId(plantChain.id)
    }
    setSelectedEquipmentId(item.id)
    setEventForm({
      ...defaultEventForm,
      eventDate: nowLocalValue(),
      units: measureUnit('weightKg'),
      snapshotBridgeLengthM: String(item.bridgeLengthM || ''),
      snapshotNominalSpeedMs: String(item.nominalSpeedMs || ''),
      chainId: plantChain?.id || '',
      chainName: plantChain?.name || '',
      chainLinearKgM: plantChain ? String(plantChain.linearWeightKgM || '') : '',
    })
    setCalibrationStep(0)
    setScreen('nueva')
  }

  function primeEquipmentEdit(item: Equipment) {
    setEditingEquipmentId(item.id)
    setEquipmentPhotoFile(null)
    setEquipmentSubmitAttempted(false)
    setEquipmentForm({
      plant: item.plant,
      line: item.line,
      beltCode: item.beltCode,
      scaleName: item.scaleName,
      controllerModel: item.controllerModel,
      controllerSerial: item.controllerSerial,
      beltWidthMm: String(item.beltWidthMm || ''),
      beltLengthM: String(item.beltLengthM || ''),
      nominalCapacityTph: String(item.nominalCapacityTph || ''),
      bridgeLengthM: String(item.bridgeLengthM || ''),
      nominalSpeedMs: String(item.nominalSpeedMs || ''),
      speedSource: item.speedSource,
      rpmRollDiameterMm: String(item.rpmRollDiameterMm || ''),
      calibrationFactorCurrent: String(item.calibrationFactorCurrent || ''),
      adjustmentFactorCurrent: String(item.adjustmentFactorCurrent || 1),
      checkIntervalDays: String(item.checkIntervalDays || DEFAULT_CHECK_INTERVAL_DAYS),
      totalizerUnit: item.totalizerUnit || 'tn',
      photoPath: item.photoPath || '',
      notes: item.notes,
    })
    setScreen('balanzas')
    window.setTimeout(() => {
      const target = equipmentFormRef.current
      if (!target) return

      const isMobile = window.matchMedia('(max-width: 640px)').matches
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const rect = target.getBoundingClientRect()
      const isVisible = rect.top >= 80 && rect.bottom <= window.innerHeight
      if (!isMobile && isVisible) return

      target.scrollIntoView({ behavior: reduceMotion || !isMobile ? 'auto' : 'smooth', block: isMobile ? 'start' : 'nearest' })
    }, 0)
  }

  function resetEquipmentForm() {
    setEditingEquipmentId('')
    setEquipmentPhotoFile(null)
    setEquipmentSubmitAttempted(false)
    setEquipmentForm(defaultEquipmentForm)
  }

  function getEquipmentPhotoUrl(path: string) {
    if (!path || !supabase) return ''
    return supabase.storage.from('equipment-photos').getPublicUrl(path).data.publicUrl
  }

  function openEquipmentPhoto(item: Equipment) {
    const src = getEquipmentPhotoUrl(item.photoPath)
    if (!src) return
    setPhotoViewer({ src, title: `${item.plant} / ${item.line} / ${item.beltCode} / ${item.scaleName}` })
  }

  function handleConfirmDialog() {
    if (!confirmDialog) return
    const action = confirmDialog.onConfirm
    setConfirmDialog(null)
    void action()
  }

  async function resizeImage(file: File) {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('No se pudo leer la imagen.'))
        image.src = objectUrl
      })
      const maxSize = 720
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * scale)
      canvas.height = Math.round(image.height * scale)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No se pudo procesar la imagen.')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.'))), 'image/jpeg', 0.82)
      })
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  async function uploadEquipmentPhoto(file: File, equipmentId: string) {
    if (!supabase) return ''
    const blob = await resizeImage(file)
    const path = `${equipmentId}/${Date.now()}.jpg`
    const result = await supabase.storage.from('equipment-photos').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    if (result.error) throw result.error
    return result.data.path
  }

  function applyMeasuredSpeed(speedMs: number) {
    setEventForm((current) => ({
      ...current,
      measuredSpeedMs: String(round(speedMs, 6)),
    }))
    setScreen('nueva')
  }

  function applyChainToEvent() {
    if (!chainToolResult) return
    setEventForm((current) => ({
      ...current,
      chainId: selectedChain?.id || current.chainId,
      chainName: selectedChain?.name || current.chainName,
      chainLinearKgM: String(round(chainToolResult.kgPerMeter, 6)),
      expectedFlowTph: String(round(chainToolResult.tph, 6)),
      snapshotBridgeLengthM: current.snapshotBridgeLengthM || chainToolForm.trainLengthM,
      snapshotNominalSpeedMs: current.snapshotNominalSpeedMs || chainToolForm.speedMs,
    }))
    setScreen('nueva')
  }

  function applyFactorToEvent() {
    if (!factorToolResult) return
    setEventForm((current) => ({
      ...current,
      finalFactor: String(round(factorToolResult.newFactor, 6)),
      adjustmentReason: current.adjustmentReason || factorToolResult.recommendation,
    }))
    setScreen('nueva')
  }

  function applyAccumulatedToEvent() {
    if (!accumulatedToolResult) return
    setEventForm((current) => ({
      ...current,
      expectedFlowTph: current.expectedFlowTph || accumulatedToolForm.expectedFlowTph,
      accumulatedTestMinutes: accumulatedToolForm.testMinutes,
      accumulatedIndicatedTotal: accumulatedToolForm.indicatedTotal,
      adjustmentFactorBefore: accumulatedToolForm.adjustmentFactorCurrent,
    }))
    setScreen('nueva')
  }

  async function handleEquipmentSubmit(event: FormEvent) {
    event.preventDefault()
    setEquipmentSubmitAttempted(true)

    if (equipmentBlockingIssues.length > 0) return

    try {
      const equipmentId = editingEquipmentId || generateId()
      let photoPath = equipmentForm.photoPath
      if (equipmentPhotoFile) {
        photoPath = await uploadEquipmentPhoto(equipmentPhotoFile, equipmentId)
      }

      const nextEquipment: Equipment = {
        id: equipmentId,
        plant: equipmentForm.plant.trim(),
        line: equipmentForm.line.trim(),
        beltCode: equipmentForm.beltCode.trim(),
        scaleName: equipmentForm.scaleName.trim(),
        controllerModel: equipmentForm.controllerModel.trim(),
        controllerSerial: equipmentForm.controllerSerial.trim(),
        beltWidthMm: toNumber(equipmentForm.beltWidthMm) || 0,
        beltLengthM: toNumber(equipmentForm.beltLengthM) || 0,
        nominalCapacityTph: toNumber(equipmentForm.nominalCapacityTph) || 0,
        bridgeLengthM: toNumber(equipmentForm.bridgeLengthM) || 0,
        nominalSpeedMs: toNumber(equipmentForm.nominalSpeedMs) || 0,
        speedSource: equipmentForm.speedSource,
        rpmRollDiameterMm: toNumber(equipmentForm.rpmRollDiameterMm) || 0,
        calibrationFactorCurrent: toNumber(equipmentForm.calibrationFactorCurrent) || 0,
        adjustmentFactorCurrent: toNumber(equipmentForm.adjustmentFactorCurrent) || 1,
        checkIntervalDays: Math.round(toNumber(equipmentForm.checkIntervalDays) || DEFAULT_CHECK_INTERVAL_DAYS),
        totalizerUnit: equipmentForm.totalizerUnit.trim() || 'tn',
        photoPath,
        notes: equipmentForm.notes.trim(),
        createdAt: equipment.find((item) => item.id === equipmentId)?.createdAt || new Date().toISOString(),
      }

      const result = await saveEquipmentRecord(nextEquipment)
      setEquipment((current) => [nextEquipment, ...current.filter((item) => item.id !== nextEquipment.id)])
      setSelectedEquipmentId(nextEquipment.id)
      resetEquipmentForm()
      setEquipmentSubmitAttempted(false)
      setDataSource(result.source)
      setSyncNotice(
        result.source === 'supabase'
          ? `Balanza ${editingEquipmentId ? 'actualizada' : 'guardada'} en servidor online.`
          : `Balanza ${editingEquipmentId ? 'actualizada' : 'guardada'} solo localmente.`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la balanza.'
      setSyncNotice(`Error al guardar balanza: ${message}`)
    }
  }

  async function handleChainSubmit(event: FormEvent) {
    event.preventDefault()
    setChainSubmitAttempted(true)

    if (chainBlockingIssues.length > 0) return

    const nextChain: Chain = {
      id: generateId(),
      plant: chainForm.plant.trim(),
      name: chainForm.name.trim(),
      linearWeightKgM: toNumber(chainForm.linearWeightKgM) || 0,
      totalLengthM: toNumber(chainForm.totalLengthM) || 0,
      totalWeightKg: toNumber(chainForm.totalWeightKg) || 0,
      notes: chainForm.notes.trim(),
      createdAt: new Date().toISOString(),
    }

    try {
      const result = await saveChainRecord(nextChain)
      setChains((current) => [nextChain, ...current.filter((item) => item.id !== nextChain.id)])
      setSelectedChainId(nextChain.id)
      setChainForm(defaultChainForm)
      setChainSubmitAttempted(false)
      setDataSource(result.source)
      setSyncNotice(result.source === 'supabase' ? 'Cadena guardada en servidor online.' : 'Cadena guardada solo localmente.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la cadena.'
      setSyncNotice(`Error al guardar cadena: ${message}`)
    }
  }

  async function handleEventSubmit(event: FormEvent) {
    event.preventDefault()
    if (eventSaveInFlightRef.current) return

    setEventSubmitAttempted(true)
    if (eventBlockingIssues.length > 0) {
      goToCalibrationStep(eventBlockingIssues[0].step)
      return
    }
    if (!selectedEquipment) return

    const factorBeforeAdjustment = materialFactorBefore
    const factorAfterAdjustment = toNumber(eventForm.finalFactor)

    const isAdmin = currentUser?.role === 'admin'
    const eventDateValue = isAdmin ? argentinaDateTimeLocalToIso(eventForm.eventDate) : new Date().toISOString()

    const record: CalibrationEvent = {
      id: generateEventCode(eventDateValue, events),
      appVersion: APP_VERSION,
      equipmentId: selectedEquipment.id,
      createdAt: new Date().toISOString(),
      eventDate: eventDateValue,
      tolerancePercent: toNumber(eventForm.tolerancePercent) || 1,
      precheck: {
        beltEmpty: eventForm.precheckBeltEmpty,
        beltClean: eventForm.precheckBeltClean,
        noMaterialBuildup: eventForm.precheckNoMaterialBuildup,
        idlersOk: eventForm.precheckIdlersOk,
        structureOk: eventForm.precheckStructureOk,
        speedSensorOk: eventForm.precheckSpeedSensorOk,
        notes: eventForm.precheckNotes.trim(),
      },
      zeroCheck: {
        completed: eventForm.zeroCompleted,
        displayUnit: eventForm.zeroDisplayUnit.trim(),
        beforeValue: eventForm.zeroBeforeValue.trim(),
        afterValue: eventForm.zeroBeforeValue.trim(),
        adjusted: false,
        notes: eventForm.zeroNotes.trim(),
      },
      parameterSnapshot: {
        appVersion: APP_VERSION,
        calibrationFactor: toNumber(eventForm.calibrationFactor) || 0,
        zeroValue: toNumber(eventForm.zeroValue) || 0,
        spanValue: toNumber(eventForm.spanValue) || 0,
        filterValue: eventForm.filterValue.trim(),
        bridgeLengthM: toNumber(eventForm.snapshotBridgeLengthM) || 0,
        nominalSpeedMs: toNumber(eventForm.snapshotNominalSpeedMs) || 0,
        units: eventForm.units.trim(),
        internalConstants: eventForm.internalConstants.trim(),
        extraParameters: eventForm.extraParameters.trim(),
        changedBy: currentUser?.username || '',
        changedReason: eventForm.changedReason.trim(),
      },
      chainSpan: {
        chainId: eventForm.chainId.trim(),
        chainName: eventForm.chainName.trim(),
        chainLinearKgM: toNumber(eventForm.chainLinearKgM) || 0,
        passCount: toNumber(eventForm.passCount) || 0,
        avgControllerReadingKgM: toNumber(eventForm.avgControllerReadingKgM) || 0,
        avgErrorPct: round(avgErrorPct),
        provisionalFactor: toNumber(eventForm.provisionalFactor) || toNumber(eventForm.calibrationFactor) || 0,
      },
      accumulatedCheck: {
        expectedFlowTph: toNumber(eventForm.expectedFlowTph) || 0,
        testMinutes: toNumber(eventForm.accumulatedTestMinutes) || 0,
        expectedTotal: ((toNumber(eventForm.expectedFlowTph) || 0) * (toNumber(eventForm.accumulatedTestMinutes) || 0)) / 60,
        indicatedTotal: toNumber(eventForm.accumulatedIndicatedTotal) || 0,
        errorPct:
          toNumber(eventForm.expectedFlowTph) > 0 && toNumber(eventForm.accumulatedTestMinutes) > 0 && toNumber(eventForm.accumulatedIndicatedTotal) > 0
            ? round(
                ((toNumber(eventForm.accumulatedIndicatedTotal) -
                  ((toNumber(eventForm.expectedFlowTph) * toNumber(eventForm.accumulatedTestMinutes)) / 60)) /
                  ((toNumber(eventForm.expectedFlowTph) * toNumber(eventForm.accumulatedTestMinutes)) / 60)) *
                  100,
              )
            : 0,
        adjustmentFactorBefore: toNumber(eventForm.adjustmentFactorBefore) || selectedEquipment.adjustmentFactorCurrent || 1,
        adjustmentFactorSuggested:
          toNumber(eventForm.expectedFlowTph) > 0 && toNumber(eventForm.accumulatedTestMinutes) > 0 && toNumber(eventForm.accumulatedIndicatedTotal) > 0
            ? round(
                (toNumber(eventForm.adjustmentFactorBefore) || selectedEquipment.adjustmentFactorCurrent || 1) *
                  ((((toNumber(eventForm.expectedFlowTph) || 0) * (toNumber(eventForm.accumulatedTestMinutes) || 0)) / 60) /
                    (toNumber(eventForm.accumulatedIndicatedTotal) || 1)),
                6,
              )
            : 0,
      },
      materialValidation: {
        externalWeightKg: finalMaterialPass?.externalWeightKg || 0,
        beltWeightKg: finalMaterialPass?.beltWeightKg || 0,
        errorPct: round(materialErrorPct),
        factorBefore: factorBeforeAdjustment,
        factorSuggested: round(suggestedFactor, 6),
        passes: completeMaterialPasses.map((pass) => ({
          ...pass,
          factorUsed: pass.factorUsed || factorBeforeAdjustment,
          errorPct: round(pass.errorPct),
        })),
        finalPassIndex: finalMaterialPass?.index || 0,
        adjustmentApplied: materialAdjustmentApplied,
        outcome: materialOutcome,
      },
      finalAdjustment: {
        factorBefore: factorBeforeAdjustment,
        factorAfter: round(factorAfterAdjustment, 6),
        reason: eventForm.adjustmentReason.trim(),
      },
      approval: {
        technician: currentUser?.username || '',
        approvedAt: eventDateValue,
      },
      diagnosis: automaticDiagnosis.join(' '),
      notes: eventForm.notes.trim(),
      syncStatus: 'pendiente',
      syncMessage: '',
      syncedAt: '',
    }

    if (
      !record.approval.technician ||
      !record.materialValidation.externalWeightKg ||
      !record.precheck.beltEmpty ||
      !record.precheck.beltClean ||
      !record.precheck.noMaterialBuildup ||
      !record.precheck.idlersOk ||
      !record.precheck.structureOk ||
      !record.precheck.speedSensorOk ||
      !record.zeroCheck.completed ||
      (requiresFullCalibration &&
        (!record.chainSpan.avgControllerReadingKgM ||
          !record.accumulatedCheck.expectedFlowTph ||
          !record.accumulatedCheck.testMinutes ||
          !record.accumulatedCheck.indicatedTotal))
    ) {
      return
    }

    eventSaveInFlightRef.current = true
    setEventSaving(true)

    try {
      const result = await saveCalibrationEventRecord(record)
      let savedRecord = record
      let notice =
        result.source === 'supabase'
          ? `Evento ${record.id} guardado en servidor online.`
          : `Evento ${record.id} guardado solo localmente.`

      if (result.source === 'supabase') {
        const syncValues = {
          syncStatus: 'sincronizado' as const,
          syncMessage: 'Guardado en servidor online.',
          syncedAt: new Date().toISOString(),
        }

        try {
          await updateCalibrationEventSync(record.id, syncValues)
          savedRecord = { ...record, ...syncValues }
        } catch (syncError) {
          const syncMessage = syncError instanceof Error ? syncError.message : 'No se pudo actualizar el estado interno.'
          notice = `Evento ${record.id} guardado en servidor online. Aviso: ${syncMessage}`
        }
      }

      setEvents((current) => [savedRecord, ...current.filter((item) => item.id !== record.id)])
      clearEventDraft(false)
      resetEventForm()
      setScreen('historial')
      setDataSource(result.source)
      setSyncNotice(notice)
      window.setTimeout(() => {
        eventSaveInFlightRef.current = false
        setEventSaving(false)
      }, 0)
    } catch (error) {
      eventSaveInFlightRef.current = false
      setEventSaving(false)
      const message = error instanceof Error ? error.message : 'No se pudo guardar el evento.'
      setSyncNotice(`Error al guardar evento: ${message}`)
      return
    }

  }

  async function handleDeleteEvent(eventId: string) {
    setConfirmDialog({
      title: 'Eliminar evento',
      message: `Eliminar definitivamente el evento ${eventId}?`,
      detail: 'Esta accion no se puede deshacer.',
      confirmLabel: 'Eliminar evento',
      onConfirm: async () => {
        try {
          const result = await deleteCalibrationEventRecord(eventId)
          setEvents((current) => current.filter((item) => item.id !== eventId))
          setDataSource(result.source)
          setSyncNotice(`Evento ${eventId} eliminado.`)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudo eliminar el evento.'
          setSyncNotice(`Error al eliminar evento: ${message}`)
        }
      },
    })
  }

  async function handleDeleteEquipment(item: Equipment) {
    const relatedEvents = events.filter((eventItem) => eventItem.equipmentId === item.id).length
    setConfirmDialog({
      title: 'Dar de baja balanza',
      message: `${item.plant} / ${item.line} / ${item.beltCode} / ${item.scaleName}`,
      detail: `${relatedEvents > 0 ? `Tambien se eliminaran ${relatedEvents} eventos asociados. ` : ''}Esta accion no se puede deshacer.`,
      confirmLabel: 'Dar de baja',
      onConfirm: async () => {
        try {
          const result = await deleteEquipmentRecord(item.id)
          setEquipment((current) => current.filter((currentItem) => currentItem.id !== item.id))
          setEvents((current) => current.filter((eventItem) => eventItem.equipmentId !== item.id))
          if (selectedEquipmentId === item.id) {
            setSelectedEquipmentId('')
          }
          setDataSource(result.source)
          setSyncNotice(`Balanza ${item.scaleName} dada de baja.`)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudo dar de baja la balanza.'
          setSyncNotice(`Error al dar de baja balanza: ${message}`)
        }
      },
    })
  }

  async function handleDeleteChain(item: Chain) {
    setConfirmDialog({
      title: 'Eliminar cadena',
      message: `${item.plant} / ${item.name}`,
      detail: 'Los eventos historicos conservaran el nombre y peso lineal registrados. Esta accion no se puede deshacer.',
      confirmLabel: 'Eliminar cadena',
      onConfirm: async () => {
        try {
          const result = await deleteChainRecord(item.id)
          setChains((current) => current.filter((currentItem) => currentItem.id !== item.id))
          if (selectedChainId === item.id) {
            setSelectedChainId('')
          }
          if (eventForm.chainId === item.id) {
            setEventForm((current) => ({ ...current, chainId: '', chainName: '', chainLinearKgM: '' }))
          }
          setDataSource(result.source)
          setSyncNotice(`Cadena ${item.name} eliminada.`)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudo eliminar la cadena.'
          setSyncNotice(`Error al eliminar cadena: ${message}`)
        }
      },
    })
  }

  async function loadManagedUsers() {
    if (!supabase || !canManageUsers) return
    setUserManagementLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'list' },
      })
      if (error) throw error
      setManagedUsers((data?.users || []) as ManagedUser[])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.'
      setSyncNotice(`Error de usuarios: ${message}`)
    } finally {
      setUserManagementLoading(false)
    }
  }

  async function loadSessionLogs() {
    if (!supabase || currentUser?.role !== 'admin') return
    setUserManagementLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .order('login_at', { ascending: false })
        .limit(100)

      if (error) throw error
      const { unique, duplicates } = dedupeSessionLogs((data as SessionLog[]) || [])
      setSessionLogs(unique)

      if (duplicates.length > 0) {
        const { error: cleanupError } = await supabase
          .from('user_sessions')
          .delete()
          .in('id', duplicates.map((log) => log.id))

        if (cleanupError) console.error('Error borrando sesiones duplicadas:', cleanupError)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar las sesiones.'
      setSyncNotice(`Error de sesiones: ${message}`)
    } finally {
      setUserManagementLoading(false)
    }
  }

  async function handleClearSessionLogs() {
    if (!supabase || !canManageUsers) return
    const client = supabase

    setConfirmDialog({
      title: 'Borrar registros de sesiones',
      message: 'Se eliminaran todos los ingresos y cierres registrados.',
      detail: 'Esta accion limpia el historial de auditoria de sesiones y no se puede deshacer.',
      confirmLabel: 'Borrar registros',
      onConfirm: async () => {
        setUserManagementLoading(true)
        try {
          const { data, error } = await client.functions.invoke('manage-users', {
            body: { action: 'clear_sessions' },
          })

          if (error) throw error
          if (!data?.ok) throw new Error(String(data?.message || 'No se pudieron borrar las sesiones.'))

          localStorage.removeItem(SESSION_LOG_ID_KEY)
          setSessionLogs([])
          setSyncNotice(`Registros de sesiones eliminados (${data.deleted || 0}).`)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudieron borrar las sesiones.'
          setSyncNotice(`Error de sesiones: ${message}`)
        } finally {
          setUserManagementLoading(false)
        }
      },
    })
  }

  async function handleUserSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !canManageUsers) return

    setUserManagementLoading(true)
    try {
      const { error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'create', ...userForm },
      })
      if (error) throw error
      setUserForm({ email: '', username: '', password: '', role: 'viewer' })
      setSyncNotice(`Usuario ${userForm.email} creado.`)
      await loadManagedUsers()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear el usuario.'
      setSyncNotice(`Error al crear usuario: ${message}`)
    } finally {
      setUserManagementLoading(false)
    }
  }

  async function handleDeleteUser(user: ManagedUser) {
    if (!supabase || !canManageUsers) return
    const client = supabase
    if (user.id === currentUser?.id) {
      setSyncNotice('No podés eliminar tu propio usuario activo.')
      return
    }
    setConfirmDialog({
      title: 'Eliminar usuario',
      message: user.email,
      detail: 'Esta accion no se puede deshacer.',
      confirmLabel: 'Eliminar usuario',
      onConfirm: async () => {
        setUserManagementLoading(true)
        try {
          const { error } = await client.functions.invoke('manage-users', {
            body: { action: 'delete', userId: user.id },
          })
          if (error) throw error
          setSyncNotice(`Usuario ${user.email} eliminado.`)
          await loadManagedUsers()
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudo eliminar el usuario.'
          setSyncNotice(`Error al eliminar usuario: ${message}`)
        } finally {
          setUserManagementLoading(false)
        }
      },
    })
  }

  function renderToastStack() {
    return (
      <section className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone} ${toast.exiting ? 'toast-exiting' : ''}`}>
            <span className="toast-label" aria-hidden="true">{getToastLabel(toast.tone)}</span>
            <span className="toast-dot" />
            <p>{toast.message}</p>
            <span className="toast-progress" />
          </div>
        ))}
      </section>
    )
  }

  function renderLoginTransition() {
    if (loginTransitionPhase === 'idle') return null
    const className = `login-transition ${loginTransitionPhase === 'reveal' ? 'login-transition-reveal' : ''}`

    return (
      <div className={className} aria-hidden="true">
        <span className="login-transition-rail" />
        <span className="login-transition-core" />
      </div>
    )
  }

  function clearLoginTransitionTimeout() {
    if (loginTransitionTimeoutRef.current === null) return

    window.clearTimeout(loginTransitionTimeoutRef.current)
    loginTransitionTimeoutRef.current = null
  }

  function beginLoginTransition() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false

    clearLoginTransitionTimeout()
    loginTransitionStartedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
    flushSync(() => setLoginTransitionPhase('cover'))
    return true
  }

  function revealLoginTransition() {
    clearLoginTransitionTimeout()
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const elapsed = now - loginTransitionStartedAtRef.current
    const revealDelay = Math.max(0, 520 - elapsed)
    loginTransitionTimeoutRef.current = window.setTimeout(() => {
      setLoginTransitionPhase('reveal')
      loginTransitionTimeoutRef.current = window.setTimeout(() => {
        setLoginTransitionPhase('idle')
        loginTransitionTimeoutRef.current = null
      }, 820)
    }, revealDelay)
  }

  const handleActionPulse = (event: MouseEvent<HTMLDivElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement | HTMLAnchorElement>('.primary, .secondary')
      : null
    if (!target || target.classList.contains('nav-item') || target.classList.contains('theme-toggle')) return
    if (target instanceof HTMLButtonElement && target.disabled) return

    target.classList.remove('action-pulse')
    void target.offsetWidth
    target.classList.add('action-pulse')
    window.setTimeout(() => target.classList.remove('action-pulse'), 780)
  }

  if (authLoading) {
    return (
      <div className="app-shell auth-shell">
        <section className="auth-card">
          <div className="brand-kicker">Acceso protegido</div>
          <h1>CalibraCinta</h1>
          <p>Cargando sesión...</p>
        </section>
        {renderToastStack()}
        {renderLoginTransition()}
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="public-shell" onClickCapture={handleActionPulse}>
        <section className="public-hero">
          <div className="public-copy" aria-label="Video de presentacion de Calibra Cinta">
            <video
              className="public-hero-video"
              src="/intro/calibra-cinta-intro.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
            <div className="public-scanline" aria-hidden="true"></div>
            <div className="public-copy-content">
              <span className="brand-kicker">Planta, campo y reporte en un mismo flujo</span>
              <h1>Calibracion trazable para balanzas dinamicas</h1>
              <p>Registro guiado de inspeccion, cero, parametros, cadena, acumulado, material real y cierre tecnico para cintas transportadoras.</p>
              <div className="public-actions">
                <a className="primary manual-link" href="#acceso">Ingresar a la app</a>
                <a className="secondary manual-link" href="/manual/tecnico/" target="_blank" rel="noreferrer">Manual de campo</a>
              </div>
              <div className="public-signal-row" aria-label="Resumen operativo">
                <span><strong>8</strong> pasos guiados</span>
                <span><strong>4</strong> roles</span>
                <span><strong>PDF</strong> reporte</span>
              </div>
            </div>
          </div>

          <div id="acceso" className="auth-card public-login">
            <div className="login-status"><span></span> Servidor online</div>
            <div className="brand-kicker">Acceso protegido</div>
            {authPanelMode === 'login' && (
              <>
                <h2>Ingresar</h2>
                <p>Operadores habilitados pueden cargar controles, revisar historial y emitir reportes de campo.</p>
                <form className="stack" onSubmit={handleLogin}>
                  <Field label="Email" type="email" value={loginEmail} onChange={setLoginEmail} />
                  <Field label="Contraseña" type="password" value={loginPassword} onChange={setLoginPassword} />
                  <button className="primary" type="submit">Ingresar</button>
                </form>
                <div className="auth-form-actions">
                  <button className="auth-text-button" type="button" onClick={showPasswordRecoveryRequest}>Olvidé mi contraseña</button>
                </div>
                <div className="login-footnote">Roles: admin, tecnico, supervisor y consulta.</div>
              </>
            )}
            {authPanelMode === 'recover-password' && (
              <>
                <h2>Recuperar contraseña</h2>
                <p>Ingresá el email asignado a tu usuario. Si existe en el sistema, vas a recibir un link para cargar una nueva contraseña.</p>
                <form className="stack" onSubmit={handlePasswordResetRequest}>
                  <Field label="Email" type="email" value={passwordResetEmail} onChange={setPasswordResetEmail} disabled={authActionLoading} />
                  <button className="primary" type="submit" disabled={authActionLoading || isPasswordResetCoolingDown}>{authActionLoading ? 'Enviando...' : isPasswordResetCoolingDown ? `Reenviar en ${passwordResetCooldownSeconds}s` : 'Enviar instrucciones'}</button>
                </form>
                {isPasswordResetCoolingDown && <p className="auth-cooldown">Para evitar bloqueos del servidor online, podés pedir otro email en {passwordResetCooldownSeconds} segundos.</p>}
                <div className="auth-form-actions">
                  <button className="auth-text-button" type="button" onClick={() => setAuthPanelMode('login')} disabled={authActionLoading}>Volver al ingreso</button>
                </div>
                <div className="login-footnote">El link de recuperacion llega al email registrado por el administrador.</div>
              </>
            )}
            {authPanelMode === 'update-password' && (
              <>
                <h2>Nueva contraseña</h2>
                <p>El link de recuperacion fue recibido. Cargá una contraseña nueva para volver a ingresar de forma segura.</p>
                <form className="stack" onSubmit={handlePasswordUpdate}>
                  <Field label="Nueva contraseña" type="password" value={newPassword} onChange={setNewPassword} disabled={authActionLoading} />
                  <Field label="Confirmar contraseña" type="password" value={newPasswordConfirm} onChange={setNewPasswordConfirm} disabled={authActionLoading} />
                  <button className="primary" type="submit" disabled={authActionLoading}>{authActionLoading ? 'Actualizando...' : 'Actualizar contraseña'}</button>
                </form>
                <div className="auth-form-actions">
                  <button className="auth-text-button" type="button" onClick={() => void cancelPasswordUpdate()} disabled={authActionLoading}>Cancelar y volver</button>
                </div>
                <div className="login-footnote">La contraseña debe tener al menos 8 caracteres. Después de actualizarla, se vuelve al ingreso.</div>
              </>
            )}
          </div>
        </section>

        <section className="public-grid" aria-label="Modulos principales">
          <div className="card"><span className="section-kicker">Campo</span><h2>Flujo guiado</h2><p className="hint">Validaciones paso a paso para reducir omisiones durante la intervencion.</p></div>
          <div className="card"><span className="section-kicker">Trazabilidad</span><h2>Eventos auditables</h2><p className="hint">Factores, errores, tecnico responsable y diagnostico quedan listos para reporte.</p></div>
          <div className="card"><span className="section-kicker">Operacion</span><h2>Estado del parque</h2><p className="hint">KPIs, semaforos y filtros para priorizar equipos con accion recomendada.</p></div>
        </section>
        {renderToastStack()}
        {renderLoginTransition()}
      </div>
    )
  }

  const manualHref = '/manual/tecnico/'

  const handleNavSelect = (nextScreen: Screen) => {
    setScreen(nextScreen)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    if (navPulseTimeoutRef.current !== null) {
      window.clearTimeout(navPulseTimeoutRef.current)
    }

    setNavPulseScreen(nextScreen)
    navPulseTimeoutRef.current = window.setTimeout(() => {
      setNavPulseScreen(null)
      navPulseTimeoutRef.current = null
    }, 780)
  }

  const navItemClass = (itemScreen: Screen) => [
    'nav-item',
    screen === itemScreen ? 'active' : '',
    navPulseScreen === itemScreen ? 'nav-pulse' : '',
  ].filter(Boolean).join(' ')

  const handleThemeToggle = () => {
    const nextTheme: AppTheme = theme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    if (root.dataset.themeTransition) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const transitionDocument = document as ViewTransitionDocument

    const applyNextTheme = () => {
      root.dataset.theme = nextTheme
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
      flushSync(() => setTheme(nextTheme))
    }

    if (prefersReducedMotion) {
      applyNextTheme()
      return
    }

    const cleanup = () => {
      delete root.dataset.themeTransition
    }

    root.dataset.themeTransition = nextTheme === 'dark' ? 'to-dark' : 'to-light'

    if (!transitionDocument.startViewTransition) {
      root.classList.add('theme-soft-transition')
      applyNextTheme()
      window.setTimeout(() => {
        root.classList.remove('theme-soft-transition')
        cleanup()
      }, 620)
      return
    }

    const transition = transitionDocument.startViewTransition(applyNextTheme)
    void transition.finished.then(cleanup, cleanup)
  }

  return (
    <div className="app-shell" onClickCapture={handleActionPulse}>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <header className="topbar">
        <div className="brand-block">
          <h1>Balanzas Dinamicas</h1>
          <p>Trazabilidad de seteo, Span con peso patron, material real y ajuste final.</p>
          <div className="live-clock" aria-label="Hora actual de Argentina">
            <time dateTime={clockNow.toISOString()}>{formatArgentinaClock(clockNow)}</time>
          </div>
        </div>
        <div className="topbar-control-stack">
          <div className="topbar-actions">
            <div className="chip version-chip">{APP_VERSION}</div>
            <div className="chip">{currentUser.username} · {currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'tecnico' ? 'Tecnico' : currentUser.role === 'supervisor' ? 'Supervisor' : 'Consulta'}</div>
            <div className={`chip ${dataSource === 'supabase' ? 'sincronizado' : 'pendiente'}`}>
              {dataSource === 'supabase' ? 'Servidor online' : 'Modo local'}
            </div>
            <button
              className="secondary small theme-toggle"
              type="button"
              onClick={handleThemeToggle}
              aria-label={theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro'}
            >
              {theme === 'dark' ? <Sun className="action-icon" aria-hidden="true" /> : <Moon className="action-icon" aria-hidden="true" />}
              {theme === 'dark' ? 'Claro' : 'Oscuro'}
            </button>
            {currentUser.role === 'admin' ? (
              <button className="secondary small manual-link" type="button" onClick={openAdminManual}>
                <Download className="action-icon" aria-hidden="true" />Manual
              </button>
            ) : (
              <a className="secondary small manual-link" href={manualHref} target="_blank" rel="noreferrer">
                <Download className="action-icon" aria-hidden="true" />Manual
              </a>
            )}
            <button className="secondary small" onClick={() => void handleLogout()}>Salir</button>
          </div>
          <button
            className="secondary small unit-toggle topbar-unit-toggle"
            type="button"
            onClick={handleUnitSystemToggle}
            aria-label={`Cambiar a unidades ${unitSystem === 'metric' ? 'imperiales' : 'metricas'}`}
          >
            {unitSystemName}
          </button>
        </div>
      </header>

      <section className="hero-strip">
        <div className="hero-panel hero-panel-primary">
          <span>Base activa</span>
          <strong>{dataSource === 'supabase' ? 'Servidor online' : 'Modo local'}</strong>
          <p>{dataSource === 'supabase' ? 'Registro multi-dispositivo habilitado.' : 'Modo contingencia con almacenamiento local.'}</p>
        </div>
        <div className="hero-panel">
          <span>Balanzas</span>
          <strong>{equipment.length}</strong>
          <p>Equipos listos para medición y trazabilidad.</p>
        </div>
        <div className="hero-panel">
          <span>Eventos</span>
          <strong>{events.length}</strong>
          <p>Calibraciones registradas en el historial técnico.</p>
        </div>
        <div className="hero-panel alert-panel">
          <span>Fuera de tolerancia</span>
          <strong>{outOfToleranceCount}</strong>
          <p>Eventos que requieren revisión técnica o seguimiento operativo.</p>
        </div>
      </section>

      {renderToastStack()}
      {renderLoginTransition()}

      {photoViewer && (
        <div className="photo-modal" role="dialog" aria-modal="true" aria-label="Foto de balanza">
          <button className="photo-modal-backdrop" type="button" onClick={() => setPhotoViewer(null)} aria-label="Cerrar foto" />
          <div className="photo-modal-card">
            <div className="row wrap">
              <div>
                <span className="section-kicker">Referencia visual</span>
                <h2>{photoViewer.title}</h2>
              </div>
              <button className="secondary small" type="button" onClick={() => setPhotoViewer(null)}>Cerrar</button>
            </div>
            <img src={photoViewer.src} alt={photoViewer.title} />
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="confirm-modal" role="dialog" aria-modal="true" aria-label={confirmDialog.title}>
          <button className="confirm-modal-backdrop" type="button" onClick={() => setConfirmDialog(null)} aria-label="Cancelar accion" />
          <div className="confirm-modal-card">
            <span className="section-kicker">Accion destructiva</span>
            <h2>{confirmDialog.title}</h2>
            <p className="confirm-message">{confirmDialog.message}</p>
            {confirmDialog.detail && <p className="confirm-detail">{confirmDialog.detail}</p>}
            <div className="row compact-actions confirm-actions">
              <button className="secondary" type="button" onClick={() => setConfirmDialog(null)}>Cancelar</button>
              <button className="secondary danger" type="button" onClick={handleConfirmDialog}>{confirmDialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}

      {loadingData && <div className="notice" role="status">Cargando datos...</div>}

      <main id="main-content" className="content">
        {screen === 'dashboard' && (
          <section className="stack screen-shell">
            <div className="dashboard-grid">
              <div className="dashboard-card primary-dashboard-card">
                <span>Accion recomendada</span>
                <strong>{dashboardStats.nextAction}</strong>
                <p>{outOfToleranceCount > 0 ? 'Hay eventos que requieren seguimiento.' : 'El parque no muestra desvíos abiertos según el historial cargado.'}</p>
              </div>
              <Metric label="Balanzas" value={String(equipment.length)} />
              <Metric label="Vencidos" value={String(dashboardStats.overdue)} />
              <Metric label="Vencen pronto" value={String(dashboardStats.dueSoon)} />
              <Metric label="Sin historial" value={String(dashboardStats.withoutHistory)} />
              <Metric label="Eventos del mes" value={String(dashboardStats.monthEvents)} />
              <Metric label="Fuera tolerancia" value={String(outOfToleranceCount)} />
              <Metric label="Al dia" value={String(dashboardStats.upToDate)} />
              <Metric label="Controles conformes" value={String(dashboardStats.conform)} />
              <Metric label="Calibradas" value={String(dashboardStats.calibrated)} />
            </div>
            <div className="ops-overview">
              <div className="card ops-panel compact-ops-panel">
                <div>
                  <span className="section-kicker">Comando de turno</span>
                  <h2>Pulso operativo</h2>
                  <p className="hint">Lectura ejecutiva del parque sin duplicar el detalle tecnico del historial.</p>
                </div>
                <div className="readiness-score" style={{ '--readiness': `${fleetReadinessPercent}%` } as CSSProperties}>
                  <span>Controles al dia</span>
                  <strong>{fleetReadinessPercent}%</strong>
                  <i aria-hidden="true"><b /></i>
                </div>
                <div className="ops-facts compact-top">
                  <div><span>Ultimo evento</span><strong>{latestEvent ? formatDateTime(latestEvent.eventDate) : '-'}</strong></div>
                  <div><span>Fuente</span><strong>{dataSource === 'supabase' ? 'Servidor online' : 'Local'}</strong></div>
                  <div><span>Modo</span><strong>{canOperate ? 'Campo habilitado' : canReview ? 'Revision' : 'Consulta'}</strong></div>
                </div>
              </div>
              <div className="card priority-panel">
                <div className="row wrap">
                  <div>
                    <span className="section-kicker">Prioridad</span>
                    <h2>{priorityEquipment.length > 0 ? 'Cola de accion' : 'Sin prioridades abiertas'}</h2>
                    <p className="hint">{priorityEquipment.length > 0 ? 'Se muestran desvios, vencidos, proximos a vencer o sin historial.' : 'Los equipos al dia no se listan como alerta.'}</p>
                  </div>
                </div>
                <div className="priority-list compact-top">
                  {priorityEquipment.map((row) => (
                    <div className={`priority-row priority-${row.statusKey}`} key={row.item.id}>
                      <div>
                        <span>{row.action}</span>
                        <strong>{row.item.plant} / {row.item.line} / {row.item.beltCode}</strong>
                        <p>{row.item.scaleName} · {row.detail}</p>
                      </div>
                      <button
                        className="secondary small"
                        type="button"
                        onClick={() => {
                          setSelectedEquipmentId(row.item.id)
                          if (!row.lastEvent && canOperate) {
                            primeEventForm(row.item)
                            return
                          }
                          if (!row.lastEvent) {
                            setScreen('balanzas')
                            return
                          }
                          setHistoryEquipmentId(row.item.id)
                          setScreen('historial')
                        }}
                      >
                        Abrir
                      </button>
                    </div>
                  ))}
                  {priorityEquipment.length === 0 && <div className="empty-state success-state">Parque al dia segun frecuencia de control configurada.</div>}
                </div>
              </div>
            </div>
            <div className="quick-actions card">
              <div>
                <span className="section-kicker">Accesos rapidos</span>
                <h2>Trabajo de campo</h2>
              </div>
              <div className="row compact-actions">
                {canOperate && <button className="primary" type="button" onClick={() => setScreen('nueva')}><ClipboardCheck className="action-icon" aria-hidden="true" />Nueva calibracion</button>}
                <button className="secondary" type="button" onClick={() => setScreen('mapa')}><Scale className="action-icon" aria-hidden="true" />Mapa planta</button>
                {canReview && <button className="secondary" type="button" onClick={() => setScreen('balanzas')}><Scale className="action-icon" aria-hidden="true" />Ver balanzas</button>}
                <button className="secondary" type="button" onClick={() => setScreen('historial')}><History className="action-icon" aria-hidden="true" />Historial</button>
                <button className="secondary" type="button" onClick={() => setScreen('herramientas')}><Wrench className="action-icon" aria-hidden="true" />Herramientas</button>
              </div>
            </div>
            {canReview && <div className="stack">
              {equipmentWithLastEvent.slice(0, 4).map(({ item, lastEvent, maintenance }) => {
                const statusText = maintenance.label
                return (
                  <div className={`card equipment-card status-${maintenance.rowClass}`} key={item.id}>
                    <div className="equipment-card-header">
                      <div className="equipment-card-head">
                        <EquipmentPhoto photoUrl={getEquipmentPhotoUrl(item.photoPath)} label={item.scaleName} status={statusText} compact onOpen={() => openEquipmentPhoto(item)} />
                        <div>
                          <span className="section-kicker">{statusText}</span>
                          <h3>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</h3>
                          <p className="hint">{lastEvent ? maintenance.detail : 'Requiere primera carga/calibracion.'}</p>
                        </div>
                      </div>
                      <div className="equipment-card-actions row compact-actions">
                        {canOperate && <button className="secondary small" onClick={() => primeEventForm(item)}><PlusCircle className="action-icon" aria-hidden="true" />Nueva calibracion</button>}
                        <button className="secondary small" onClick={() => { setHistoryEquipmentId(item.id); setScreen('historial') }}><History className="action-icon" aria-hidden="true" />Historial</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>}
          </section>
        )}

        {screen === 'mapa' && (
          <section className="stack screen-shell plant-map-screen">
            <div className="screen-banner plant-map-banner">
              <div>
                <span className="section-kicker">Mapa operativo</span>
                <h2>Planta de secado y despacho</h2>
                <p>Vista isometrica de puntos de balanzas y basculas. Los colores indican estado actual, vencimiento o falta de vinculacion.</p>
              </div>
              <div className="row compact-actions plant-map-banner-actions">
                <button className="secondary" type="button" onClick={() => setScreen('dashboard')}>Volver al inicio</button>
                {currentUser.role === 'admin' && !plantMapEditing && (
                  <button className="primary" type="button" onClick={startPlantMapEditing}><Pencil className="action-icon" aria-hidden="true" />Editar mapa</button>
                )}
                {currentUser.role === 'admin' && plantMapEditing && (
                  <>
                    <button className="primary" type="button" onClick={() => void savePlantMapEditing()} disabled={plantMapSaving}><Save className="action-icon" aria-hidden="true" />Guardar edicion</button>
                    <button className="secondary" type="button" onClick={cancelPlantMapEditing} disabled={plantMapSaving}><XCircle className="action-icon" aria-hidden="true" />Cancelar</button>
                  </>
                )}
              </div>
            </div>

            {plantMapSource === 'local' && (
              <div className="notice plant-map-notice" role="status">Mapa usando datos locales. Si la tabla nueva todavia no fue aplicada en el servidor online, la app sigue funcionando sin romper el resto.</div>
            )}

            <div className="plant-map-layout">
              <div className="card plant-map-board">
                <div className="row wrap plant-map-board-head">
                  <div>
                    <span className="section-kicker">Layout Noviembre 2024</span>
                    <h2>Mapa fijo de sectores principales</h2>
                    <p className="hint">Primera version SVG/CSS: sectores de proceso, despachos y puntos operativos interactivos.</p>
                  </div>
                  <div className="plant-map-legend" aria-label="Leyenda de estados">
                    <span className="plant-status-key success">Al dia</span>
                    <span className="plant-status-key warning">Proximo</span>
                    <span className="plant-status-key danger">Vencido</span>
                    <span className="plant-status-key neutral">Sin vincular</span>
                  </div>
                </div>

                <div className={`plant-map-canvas ${plantMapEditing ? 'editing' : ''}`} ref={plantMapCanvasRef}>
                  <div className="plant-map-model" aria-hidden="true">
                    <div className="plant-model-grid" />
                    <div className="plant-model-zone zone-stock" style={{ '--x': '23%', '--y': '39%', '--w': '24%', '--h': '30%' } as CSSProperties}><span>Acopios</span></div>
                    <div className="plant-model-zone zone-process" style={{ '--x': '49%', '--y': '37%', '--w': '33%', '--h': '34%' } as CSSProperties}><span>Secado / zarandas</span></div>
                    <div className="plant-model-zone zone-dispatch" style={{ '--x': '78%', '--y': '47%', '--w': '25%', '--h': '36%' } as CSSProperties}><span>Silos y despacho</span></div>
                    <div className="plant-model-zone zone-truck" style={{ '--x': '72%', '--y': '80%', '--w': '35%', '--h': '19%' } as CSSProperties}><span>Camiones</span></div>

                    <div className="plant-3d-road road-main" style={{ '--x': '74%', '--y': '77%', '--w': '36rem', '--angle': '-7deg' } as CSSProperties} />
                    <div className="plant-3d-road road-service" style={{ '--x': '50%', '--y': '65%', '--w': '34rem', '--angle': '-12deg' } as CSSProperties} />

                    <div className="plant-3d-stockpile pile-one" style={{ '--x': '18%', '--y': '44%', '--w': '8.5rem', '--h': '5.4rem' } as CSSProperties}><span>Mineral humedo</span></div>
                    <div className="plant-3d-stockpile pile-two" style={{ '--x': '27%', '--y': '35%', '--w': '9.5rem', '--h': '6rem' } as CSSProperties}><span>Acopio lavado</span></div>
                    <div className="plant-3d-cabin" style={{ '--x': '18%', '--y': '63%', '--w': '5rem', '--h': '3.2rem', '--tone': 'control' } as CSSProperties}><span>Sala MCC</span></div>

                    <div className="plant-3d-belt belt-main" style={{ '--x': '31%', '--y': '57%', '--w': '19rem', '--angle': '-13deg' } as CSSProperties}><span>Cinta 23</span></div>
                    <div className="plant-3d-belt belt-feed" style={{ '--x': '40%', '--y': '47%', '--w': '14rem', '--angle': '-19deg' } as CSSProperties}><span>Alimentacion hornos</span></div>
                    <div className="plant-3d-belt belt-transfer" style={{ '--x': '60%', '--y': '46%', '--w': '20rem', '--angle': '11deg' } as CSSProperties}><span>Transferencia a silos</span></div>
                    <div className="plant-3d-belt belt-dispatch" style={{ '--x': '76%', '--y': '60%', '--w': '16rem', '--angle': '-10deg' } as CSSProperties}><span>Despacho</span></div>

                    <div className="plant-3d-kiln kiln-one" style={{ '--x': '36%', '--y': '40%', '--w': '10.5rem', '--h': '3.8rem', '--angle': '-8deg' } as CSSProperties}><span>Horno 1</span></div>
                    <div className="plant-3d-kiln kiln-two" style={{ '--x': '47%', '--y': '37%', '--w': '10.5rem', '--h': '3.8rem', '--angle': '-8deg' } as CSSProperties}><span>Horno 2</span></div>
                    <div className="plant-3d-kiln kiln-three" style={{ '--x': '58%', '--y': '34%', '--w': '10.5rem', '--h': '3.8rem', '--angle': '-8deg' } as CSSProperties}><span>Horno 3</span></div>

                    <div className="plant-3d-structure screen-house" style={{ '--x': '49%', '--y': '53%', '--w': '10rem', '--h': '5rem' } as CSSProperties}><span>Zarandas</span></div>
                    <div className="plant-3d-cabin control-room" style={{ '--x': '60%', '--y': '53%', '--w': '6.8rem', '--h': '4rem', '--tone': 'control' } as CSSProperties}><span>Cabina proceso</span></div>

                    <div className="plant-3d-silo silo-one" style={{ '--x': '69%', '--y': '38%', '--h': '7.4rem' } as CSSProperties}><span>Silo A</span></div>
                    <div className="plant-3d-silo silo-two" style={{ '--x': '75%', '--y': '35%', '--h': '8.2rem' } as CSSProperties}><span>Silo B</span></div>
                    <div className="plant-3d-silo silo-three" style={{ '--x': '82%', '--y': '33%', '--h': '7.8rem' } as CSSProperties}><span>Silo C</span></div>
                    <div className="plant-3d-silo silo-four" style={{ '--x': '89%', '--y': '36%', '--h': '7rem' } as CSSProperties}><span>Silo D</span></div>

                    <div className="plant-3d-bin dispatch-one" style={{ '--x': '68%', '--y': '57%' } as CSSProperties}><span>D1</span></div>
                    <div className="plant-3d-bin dispatch-two" style={{ '--x': '75%', '--y': '53%' } as CSSProperties}><span>D2</span></div>
                    <div className="plant-3d-bin dispatch-three" style={{ '--x': '82%', '--y': '49%' } as CSSProperties}><span>D3</span></div>
                    <div className="plant-3d-bin dispatch-four" style={{ '--x': '89%', '--y': '45%' } as CSSProperties}><span>D4</span></div>
                    <div className="plant-3d-cabin dispatch-cabin" style={{ '--x': '91%', '--y': '59%', '--w': '5.8rem', '--h': '3.6rem', '--tone': 'dispatch' } as CSSProperties}><span>Cabina despacho</span></div>

                    <div className="plant-3d-scale truck-scale-one" style={{ '--x': '66%', '--y': '78%', '--w': '11rem', '--angle': '-7deg' } as CSSProperties}><span>Bascula 1</span></div>
                    <div className="plant-3d-scale truck-scale-two" style={{ '--x': '78%', '--y': '82%', '--w': '11rem', '--angle': '-7deg' } as CSSProperties}><span>Bascula 2</span></div>
                    <div className="plant-3d-cabin scale-cabin-one" style={{ '--x': '59%', '--y': '73%', '--w': '4.8rem', '--h': '3.2rem', '--tone': 'scale' } as CSSProperties}><span>Cabina B1</span></div>
                    <div className="plant-3d-cabin scale-cabin-two" style={{ '--x': '87%', '--y': '77%', '--w': '4.8rem', '--h': '3.2rem', '--tone': 'scale' } as CSSProperties}><span>Cabina B2</span></div>
                  </div>

                  {activePlantMapPoints.map((point) => {
                    const status = plantMapStatusById.get(point.id)
                    const isSelected = selectedPlantPoint?.id === point.id
                    return (
                      <button
                        className={`plant-map-point status-${status?.rowClass || 'neutral'} ${isSelected ? 'selected' : ''} ${draggingPlantPointId === point.id ? 'dragging' : ''}`}
                        key={point.id}
                        type="button"
                        style={{ left: `${point.x}%`, top: `${point.y}%` }}
                        onClick={() => setSelectedPlantPointId(point.id)}
                        onPointerDown={(event) => handlePlantPointPointerDown(event, point.id)}
                        onPointerMove={(event) => handlePlantPointPointerMove(event, point.id)}
                        onPointerUp={(event) => handlePlantPointPointerUp(event, point.id)}
                        onPointerCancel={() => setDraggingPlantPointId('')}
                        aria-label={`${point.label}: ${status?.label || 'Sin estado'}`}
                      >
                        <span className="plant-point-dot" aria-hidden="true" />
                        <span className="plant-point-label">{point.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="plant-map-footer">
                  <div><span>10 puntos iniciales</span><strong>{activePlantMapPoints.length}</strong></div>
                  <div><span>Al dia</span><strong>{plantMapStatusCounts.success}</strong></div>
                  <div><span>Proximos</span><strong>{plantMapStatusCounts.warning}</strong></div>
                  <div><span>Vencidos</span><strong>{plantMapStatusCounts.danger}</strong></div>
                  <div><span>Pendientes</span><strong>{plantMapStatusCounts.neutral}</strong></div>
                </div>
                {plantMapEditing && <p className="hint compact-top">Modo edicion activo: arrastra puntos, ajusta vinculos o fechas y confirma con Guardar edicion.</p>}
              </div>

              <aside className={`card plant-map-detail status-${selectedPlantPointStatus?.rowClass || 'neutral'}`}>
                {selectedPlantPoint ? (
                  <>
                    <span className="section-kicker">{plantMapPointTypeLabel(selectedPlantPoint.pointType)}</span>
                    <h2>{selectedPlantPoint.label}</h2>
                    <p className="hint">{selectedPlantPoint.zone} · {selectedPlantPointStatus?.detail || 'Sin estado disponible.'}</p>
                    <div className="grid two compact-top">
                      <Metric label="Estado" value={selectedPlantPointStatus?.label || '-'} />
                      <Metric label="Dias" value={selectedPlantPointStatus?.daysText || '-'} />
                      <Metric label="Ultimo valido" value={selectedPlantPointStatus?.lastValidDateText || '-'} />
                      <Metric label="Proximo" value={selectedPlantPointStatus?.nextDueDateText || '-'} />
                    </div>

                    {!isAnnualPlantPoint(selectedPlantPoint) && (
                      <div className="plant-map-admin-field compact-top">
                        <label className="label">Balanza vinculada</label>
                        <select
                          className="input"
                          value={selectedPlantPoint.equipmentId}
                          onChange={(event) => handlePlantMapPointEquipmentChange(selectedPlantPoint.id, event.target.value)}
                          disabled={!plantMapEditing || currentUser.role !== 'admin'}
                        >
                          <option value="">Sin vincular</option>
                          {equipment.map((item) => (
                            <option key={item.id} value={item.id}>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</option>
                          ))}
                        </select>
                        {!plantMapEditing && currentUser.role === 'admin' && <p className="hint compact-top">Activá Editar mapa para cambiar el vinculo.</p>}
                      </div>
                    )}

                    {isAnnualPlantPoint(selectedPlantPoint) && (
                      <div className="plant-map-admin-field compact-top">
                        <label className="label">Ultima calibracion anual</label>
                        <input
                          className="input"
                          type="date"
                          value={selectedPlantPoint.annualCalibrationDate}
                          onChange={(event) => handlePlantMapPointDateChange(selectedPlantPoint.id, event.target.value)}
                          disabled={!plantMapEditing || currentUser.role !== 'admin'}
                        />
                        <p className="hint compact-top">Alerta amarilla a {ANNUAL_SCALE_WARNING_DAYS} dias del vencimiento anual.</p>
                      </div>
                    )}

                    {selectedPlantPointStatus?.equipment && (
                      <div className="plant-linked-equipment compact-top">
                        <span>Equipo vinculado</span>
                        <strong>{selectedPlantPointStatus.equipment.plant} / {selectedPlantPointStatus.equipment.line} / {selectedPlantPointStatus.equipment.beltCode}</strong>
                        <p>{selectedPlantPointStatus.equipment.scaleName}</p>
                      </div>
                    )}

                    <div className="row compact-actions plant-map-detail-actions">
                      {selectedPlantPointStatus?.equipment && canOperate && (
                        <button className="primary" type="button" onClick={() => primeEventForm(selectedPlantPointStatus.equipment!)}><PlusCircle className="action-icon" aria-hidden="true" />Nueva calibracion</button>
                      )}
                      {selectedPlantPointStatus?.equipment && (
                        <button className="secondary" type="button" onClick={() => { setHistoryEquipmentId(selectedPlantPointStatus.equipment!.id); setScreen('historial') }}><History className="action-icon" aria-hidden="true" />Historial</button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="empty-state">No hay puntos de mapa cargados.</div>
                )}
              </aside>
            </div>
          </section>
        )}

        {screen === 'balanzas' && canReview && (
          <section className="stack screen-shell">
            <div className="screen-banner">
              <span className="section-kicker">Parque instalado</span>
              <h2>Listado de balanzas y estado operativo</h2>
              <p>Alta de equipos, lectura rápida de último error, factor y estado general de cada instalación.</p>
            </div>
            <div ref={equipmentFormRef} className="scroll-anchor">
            <CollapsibleCard key={editingEquipmentId || 'equipment-list'} title="Listado de balanzas" hint="Alta de equipos y datos tecnicos principales." defaultOpen={equipment.length === 0 || Boolean(editingEquipmentId)}>
                <div className="row wrap">
                  <div>
                    <h2>{editingEquipmentId ? 'Editar balanza' : 'Listado de balanzas'}</h2>
                    <p className="hint">{editingEquipmentId ? 'Actualizá datos tecnicos y foto del equipo.' : 'La app arranca mostrando equipos y su ultimo estado conocido.'}</p>
                  </div>
                  {canOperate && <button className="secondary" onClick={() => setScreen('nueva')}>
                    <PlusCircle className="action-icon" aria-hidden="true" />
                    Nueva calibracion
                  </button>}
              </div>
              {canOperate && <form className="stack" onSubmit={handleEquipmentSubmit}>
                <div className="grid two">
                  <Field label="Planta" value={equipmentForm.plant} onChange={(value) => setEquipmentForm((current) => ({ ...current, plant: value }))} />
                  <Field label="Linea" value={equipmentForm.line} onChange={(value) => setEquipmentForm((current) => ({ ...current, line: value }))} />
                  <Field label="Cinta" value={equipmentForm.beltCode} onChange={(value) => setEquipmentForm((current) => ({ ...current, beltCode: value }))} />
                  <Field label="Balanza" value={equipmentForm.scaleName} onChange={(value) => setEquipmentForm((current) => ({ ...current, scaleName: value }))} />
                  <Field label="Modelo controlador" value={equipmentForm.controllerModel} onChange={(value) => setEquipmentForm((current) => ({ ...current, controllerModel: value }))} />
                  <Field label="Serie controlador" value={equipmentForm.controllerSerial} onChange={(value) => setEquipmentForm((current) => ({ ...current, controllerSerial: value }))} />
                  <Field label={measureLabel('Ancho cinta', 'lengthMm')} type="number" value={measureInput(equipmentForm.beltWidthMm, 'lengthMm')} onChange={(value) => setEquipmentForm((current) => ({ ...current, beltWidthMm: parseMeasure(value, 'lengthMm') }))} />
                  <Field label={measureLabel('Largo cinta', 'lengthM')} type="number" value={measureInput(equipmentForm.beltLengthM, 'lengthM')} onChange={(value) => setEquipmentForm((current) => ({ ...current, beltLengthM: parseMeasure(value, 'lengthM') }))} />
                  <Field label={measureLabel('Capacidad nominal', 'flowTph')} type="number" value={measureInput(equipmentForm.nominalCapacityTph, 'flowTph')} onChange={(value) => setEquipmentForm((current) => ({ ...current, nominalCapacityTph: parseMeasure(value, 'flowTph') }))} />
                  <Field label={measureLabel('Distancia puente pesaje', 'lengthM')} type="number" value={measureInput(equipmentForm.bridgeLengthM, 'lengthM')} onChange={(value) => setEquipmentForm((current) => ({ ...current, bridgeLengthM: parseMeasure(value, 'lengthM') }))} />
                  <Field label={measureLabel('Velocidad nominal', 'speedMs')} type="number" value={measureInput(equipmentForm.nominalSpeedMs, 'speedMs')} onChange={(value) => setEquipmentForm((current) => ({ ...current, nominalSpeedMs: parseMeasure(value, 'speedMs') }))} />
                  <Field label="Factor calibracion actual" type="number" value={equipmentForm.calibrationFactorCurrent} onChange={(value) => setEquipmentForm((current) => ({ ...current, calibrationFactorCurrent: value }))} />
                  <Field label="Factor ajuste actual" type="number" value={equipmentForm.adjustmentFactorCurrent} onChange={(value) => setEquipmentForm((current) => ({ ...current, adjustmentFactorCurrent: value }))} />
                  <Field label="Frecuencia control (dias)" type="number" value={equipmentForm.checkIntervalDays} onChange={(value) => setEquipmentForm((current) => ({ ...current, checkIntervalDays: value }))} />
                  <div>
                    <label className="label">Origen velocidad</label>
                    <select className="input" value={equipmentForm.speedSource} onChange={(e) => setEquipmentForm((current) => ({ ...current, speedSource: e.target.value as SpeedSource }))}>
                      <option value="automatica">Automatica</option>
                      <option value="calculada">Calculada</option>
                      <option value="rpm">RPM</option>
                    </select>
                  </div>
                  <div className="system-field">
                    <span>Unidad visible</span>
                    <strong>{unitSystemName}</strong>
                  </div>
                  <Field label={measureLabel('Diametro rolo RPM', 'lengthMm')} type="number" value={measureInput(equipmentForm.rpmRollDiameterMm, 'lengthMm')} onChange={(value) => setEquipmentForm((current) => ({ ...current, rpmRollDiameterMm: parseMeasure(value, 'lengthMm') }))} />
                </div>
                <div className="photo-field">
                  <div className="equipment-avatar">
                    {equipmentPhotoPreview ? (
                      <img src={equipmentPhotoPreview} alt="Preview de balanza" />
                    ) : equipmentForm.photoPath ? (
                      <img src={getEquipmentPhotoUrl(equipmentForm.photoPath)} alt="Foto de balanza" />
                    ) : (
                      <span>{equipmentForm.scaleName?.slice(0, 2).toUpperCase() || 'BD'}</span>
                    )}
                  </div>
                  <div>
                    <label className="label">Foto de balanza</label>
                    <input
                      className="input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => setEquipmentPhotoFile(event.target.files?.[0] || null)}
                    />
                    <p className="hint">Se comprime antes de subirla para mantener la app liviana.</p>
                  </div>
                </div>
                <TextArea label="Observaciones del equipo" value={equipmentForm.notes} onChange={(value) => setEquipmentForm((current) => ({ ...current, notes: value }))} />
                {equipmentSubmitAttempted && equipmentBlockingIssues.length > 0 && (
                  <div className="warning-panel">
                    <strong>Faltan datos para guardar la balanza</strong>
                    <ul>
                      {equipmentBlockingIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="row compact-actions">
                  <button className="primary" type="submit"><Save className="action-icon" aria-hidden="true" />{editingEquipmentId ? 'Actualizar balanza' : 'Guardar balanza'}</button>
                  {editingEquipmentId && <button className="secondary" type="button" onClick={resetEquipmentForm}><XCircle className="action-icon" aria-hidden="true" />Cancelar edicion</button>}
                </div>
              </form>}
            </CollapsibleCard>
            </div>

            <CollapsibleCard title="Cadenas de calibracion" hint="Gestion de pesos patron reutilizables por planta." defaultOpen={chains.length === 0}>
              <div className="row wrap">
                <div>
                  <h2>Cadenas de calibracion</h2>
                  <p className="hint">Definí una cadena por planta y reutilizala en herramientas y eventos.</p>
                </div>
              </div>
              {canOperate && <form className="stack" onSubmit={handleChainSubmit}>
                <div className="grid two">
                  <Field label="Planta" value={chainForm.plant} onChange={(value) => setChainForm((current) => ({ ...current, plant: value }))} />
                  <Field label="Nombre de cadena" value={chainForm.name} onChange={(value) => setChainForm((current) => ({ ...current, name: value }))} />
                  <Field label={measureLabel('Peso por longitud', 'linearWeightKgM')} type="number" value={measureInput(chainForm.linearWeightKgM, 'linearWeightKgM')} onChange={(value) => setChainForm((current) => ({ ...current, linearWeightKgM: parseMeasure(value, 'linearWeightKgM') }))} />
                  <Field label={measureLabel('Largo total', 'lengthM')} type="number" value={measureInput(chainForm.totalLengthM, 'lengthM')} onChange={(value) => setChainForm((current) => ({ ...current, totalLengthM: parseMeasure(value, 'lengthM') }))} />
                  <Field label={measureLabel('Peso total', 'weightKg')} type="number" value={measureInput(chainForm.totalWeightKg, 'weightKg')} onChange={(value) => setChainForm((current) => ({ ...current, totalWeightKg: parseMeasure(value, 'weightKg') }))} />
                </div>
                <TextArea label="Observaciones de cadena" value={chainForm.notes} onChange={(value) => setChainForm((current) => ({ ...current, notes: value }))} />
                {chainSubmitAttempted && chainBlockingIssues.length > 0 && (
                  <div className="warning-panel">
                    <strong>Faltan datos para guardar la cadena</strong>
                    <ul>
                      {chainBlockingIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button className="primary" type="submit"><Save className="action-icon" aria-hidden="true" />Guardar cadena</button>
              </form>}
              <div className="stack compact-top">
                {chains.map((item) => (
                  <div className="result-row" key={item.id}>
                    <span>{item.plant} / {item.name}</span>
                    <div className="row compact-actions">
                      <strong>{measureText(item.linearWeightKgM, 'linearWeightKgM', 6)}</strong>
                      {canDelete && <button className="secondary small danger" type="button" onClick={() => handleDeleteChain(item)}><Trash2 className="action-icon" aria-hidden="true" />Eliminar</button>}
                    </div>
                  </div>
                ))}
                {chains.length === 0 && <div className="result-row"><span>No hay cadenas cargadas.</span><strong>-</strong></div>}
              </div>
            </CollapsibleCard>

            <div className="stack">
              {equipmentWithLastEvent.map(({ item, lastEvent, maintenance }) => {
                const statusText = maintenance.label
                return (
                  <div className={`card equipment-card status-${maintenance.rowClass}`} key={item.id}>
                    <div className="equipment-card-header">
                      <div className="equipment-card-head">
                        <EquipmentPhoto
                          photoUrl={getEquipmentPhotoUrl(item.photoPath)}
                          label={item.scaleName}
                          status={statusText}
                          compact
                          onOpen={() => openEquipmentPhoto(item)}
                        />
                        <div>
                          <span className="section-kicker">{statusText}</span>
                          <h3>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</h3>
                          <p className="hint">{item.controllerModel} {item.controllerSerial ? `| ${item.controllerSerial}` : ''}</p>
                        </div>
                      </div>
                      <div className="equipment-card-actions row compact-actions">
                        {canOperate && <button className="secondary small" onClick={() => primeEventForm(item)}><PlusCircle className="action-icon" aria-hidden="true" />Nueva calibracion</button>}
                        {canDelete && <button className="secondary small" onClick={() => primeEquipmentEdit(item)}><Pencil className="action-icon" aria-hidden="true" />Editar</button>}
                        {canDelete && <button className="secondary small danger" onClick={() => handleDeleteEquipment(item)}><Trash2 className="action-icon" aria-hidden="true" />Dar de baja</button>}
                      </div>
                    </div>
                    <div className="grid four compact-top">
                      <Metric label="Ultimo factor" value={lastEvent ? String(lastEvent.finalAdjustment.factorAfter) : '-'} />
                      <Metric label="Factor ajuste" value={String(item.adjustmentFactorCurrent || 1)} />
                      <Metric label="Ultimo control valido" value={maintenance.lastValidDateText} />
                      <Metric label="Proximo control" value={maintenance.nextDueDateText} />
                      <Metric label="Dias restantes" value={maintenance.daysText} />
                      <Metric label="Frecuencia" value={`${item.checkIntervalDays || DEFAULT_CHECK_INTERVAL_DAYS} dias`} />
                      <Metric label="Ultimo error" value={lastEvent ? `${lastEvent.materialValidation.errorPct} %` : '-'} />
                      <Metric label="Estado" value={statusText} />
                    </div>
                  </div>
                )
              })}
              {equipment.length === 0 && <div className="card">Todavia no hay balanzas cargadas.</div>}
            </div>
          </section>
        )}

        {screen === 'nueva' && canOperate && (
          <section className="stack screen-shell">
            <div className="screen-banner">
              <span className="section-kicker">Eleccion de balanza/cinta</span>
              <h2>Secuencia real de trabajo</h2>
              <p>Inspección previa, cero, parámetros, span con cadena, material real y ajuste final en un solo circuito técnico.</p>
            </div>
            <div className="wizard-panel card">
              <div className="row wrap">
                <div>
                  <span className="section-kicker">Paso {calibrationStep + 1} de {calibrationSteps.length}</span>
                  <h2>{calibrationSteps[calibrationStep]}</h2>
                </div>
                <div className="row compact-actions">
                  {hasEventDraft && <button className="secondary small" type="button" onClick={loadEventDraft} disabled={eventSaving}><RotateCcw className="action-icon" aria-hidden="true" />Recuperar borrador</button>}
                  <button className="secondary small" type="button" onClick={saveEventDraft} disabled={eventSaving}><Save className="action-icon" aria-hidden="true" />Guardar borrador</button>
                  {eventDraftSavedAt && <span className="draft-status">Ultimo borrador: {formatDateTime(eventDraftSavedAt)}</span>}
                </div>
              </div>
              <div className="wizard-progress" aria-hidden="true">
                <span style={{ width: `${((calibrationStep + 1) / calibrationSteps.length) * 100}%` }} />
              </div>
              <div className="wizard-steps" aria-label="Progreso de calibracion">
                {calibrationStepStates.map(({ step, complete, warning, skipped, statusLabel }, index) => (
                  <button
                    className={`wizard-step ${index === calibrationStep ? 'active' : skipped ? 'skipped' : complete ? 'complete' : warning ? 'warning' : ''}`}
                    key={step}
                    type="button"
                    onClick={() => goToCalibrationStep(index)}
                    disabled={eventSaving}
                    aria-current={index === calibrationStep ? 'step' : undefined}
                    title={statusLabel}
                  >
                    <span>{index + 1}</span>
                    {step}
                    <small>{statusLabel}</small>
                  </button>
                ))}
              </div>
              <div className="wizard-context compact-top">
                <Metric label="Balanza" value={selectedEquipment ? `${selectedEquipment.beltCode} / ${selectedEquipment.scaleName}` : 'Sin seleccion'} />
                <Metric label="Cadena" value={selectedChain ? selectedChain.name : requiresFullCalibration ? 'Pendiente' : 'No requerida'} />
                <Metric label="Tolerancia" value={`${eventForm.tolerancePercent || 1} %`} />
                <Metric label="Estado previo" value={selectedEquipmentStatus} />
                <Metric label="Control" value={selectedEquipmentMaintenance?.label || '-'} />
                <Metric label="Proximo" value={selectedEquipmentMaintenance?.nextDueDateText || '-'} />
              </div>
              <div className="wizard-guidance compact-top">
                <div>
                  <span className="section-kicker">Control de avance</span>
                  <strong>{wizardReadinessPercent}% listo</strong>
                  <p>{wizardStepCue}</p>
                </div>
                <div className={`readiness-meter ${eventBlockingIssues.length === 0 ? 'ready' : ''}`} aria-hidden="true">
                  <span style={{ width: `${wizardReadinessPercent}%` }} />
                </div>
                <small>{eventBlockingIssues.length === 0 ? 'Sin bloqueos de cierre.' : `${eventBlockingIssues.length} bloqueo(s) antes de cerrar.`}</small>
                {firstBlockingIssue && (
                  <button className="secondary small guidance-jump" type="button" onClick={() => goToCalibrationStep(firstBlockingIssue.step)} disabled={eventSaving}>
                    Ir al primer bloqueo · Paso {firstBlockingIssue.step + 1}
                  </button>
                )}
              </div>
            </div>
            <div ref={calibrationStepAnchorRef} className="calibration-step-anchor" aria-hidden="true" />

            <form className="stack" onSubmit={handleEventSubmit} aria-busy={eventSaving}>
              {calibrationStep === 0 && <div className="card operational-context-card">
                <div className="card-tag">Paso 1</div>
                <h2>Contexto operativo</h2>
                <p className="hint compact-top">Confirmá el equipo, la fecha y la tolerancia antes de iniciar los controles.</p>
                <div className="context-selector-grid compact-top">
                  <div className={`context-select-card ${selectedEquipment ? 'selected' : ''}`}>
                    <div className="context-select-heading">
                      <span>Equipo</span>
                      <strong>{selectedEquipment ? `${selectedEquipment.beltCode} / ${selectedEquipment.scaleName}` : 'Seleccionar balanza'}</strong>
                    </div>
                    <label className="label">Balanza</label>
                    <select className="input" value={selectedEquipmentId} onChange={(e) => setSelectedEquipmentId(e.target.value)} disabled={eventSaving}>
                      <option value="">Seleccionar balanza</option>
                      {equipment.map((item) => (
                        <option key={item.id} value={item.id}>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</option>
                      ))}
                    </select>
                    <small>{selectedEquipment ? `${selectedEquipment.plant} / ${selectedEquipment.line}` : 'Base del evento'}</small>
                  </div>
                  <div className={`context-select-card ${selectedChain ? 'selected' : ''}`}>
                    <div className="context-select-heading">
                      <span>Patron</span>
                      <strong>{selectedChain ? selectedChain.name : 'Seleccionar cadena'}</strong>
                    </div>
                    <label className="label">Cadena usada</label>
                    <select
                      className="input"
                      value={selectedChainId}
                      onChange={(e) => {
                        const nextId = e.target.value
                        setSelectedChainId(nextId)
                        const chain = chains.find((item) => item.id === nextId)
                        if (!chain) {
                          setEventForm((current) => ({ ...current, chainId: '', chainName: '', chainLinearKgM: '' }))
                          return
                        }
                        applySelectedChainToEvent(chain)
                      }}
                      disabled={eventSaving}
                    >
                      <option value="">Seleccionar cadena</option>
                      {availableChains.map((item) => (
                        <option key={item.id} value={item.id}>{item.plant} / {item.name}</option>
                      ))}
                    </select>
                    <small>{selectedChain ? measureText(selectedChain.totalWeightKg, 'weightKg') : usingAllChainsFallback ? 'Mostrando todas las plantas' : 'Patron disponible'}</small>
                  </div>
                </div>
                <div className="grid two compact-top">
                  <Field label="Fecha y hora" type="datetime-local" value={eventForm.eventDate} onChange={(value) => setEventForm((current) => ({ ...current, eventDate: value }))} disabled={currentUser?.role !== 'admin'} hint={currentUser?.role !== 'admin' ? 'Fecha automatica al guardar' : undefined} />
                  <Field label="Tolerancia (%)" type="number" value={eventForm.tolerancePercent} onChange={(value) => setEventForm((current) => ({ ...current, tolerancePercent: value }))} />
                </div>
                {selectedEquipment && (
                  <div className="selected-equipment-visual compact-top">
                    <EquipmentPhoto
                      photoUrl={getEquipmentPhotoUrl(selectedEquipment.photoPath)}
                      label={selectedEquipment.scaleName}
                      status={selectedEquipmentMaintenance?.label || selectedEquipmentStatus}
                      onOpen={() => openEquipmentPhoto(selectedEquipment)}
                    />
                    <div className="grid four">
                      <Metric label="Puente" value={measureText(selectedEquipment.bridgeLengthM, 'lengthM')} />
                      <Metric label="Velocidad" value={measureText(selectedEquipment.nominalSpeedMs, 'speedMs')} />
                      <Metric label="Capacidad" value={measureText(selectedEquipment.nominalCapacityTph, 'flowTph')} />
                      <Metric label="Origen velocidad" value={selectedEquipment.speedSource} />
                      <Metric label="Frecuencia control" value={`${selectedEquipment.checkIntervalDays || DEFAULT_CHECK_INTERVAL_DAYS} dias`} />
                      <Metric label="Dias restantes" value={selectedEquipmentMaintenance?.daysText || '-'} />
                    </div>
                  </div>
                )}
                {selectedChain && (
                  <div className="grid three compact-top">
                    <Metric label="Cadena" value={selectedChain.name} />
                    <Metric label={measureUnit('linearWeightKgM')} value={measureNumber(selectedChain.linearWeightKgM, 'linearWeightKgM', 6)} />
                    <Metric label="Peso total" value={measureText(selectedChain.totalWeightKg, 'weightKg')} />
                  </div>
                )}
              </div>}

              {calibrationStep === 1 && <CollapsibleCard title="Paso 2 · Inspeccion previa" hint="Checks obligatorios antes de calibrar." defaultOpen>
                <div className="card-tag">Paso 2</div>
                <h2>Inspeccion previa</h2>
                <div className="row wrap compact-top">
                  <p className="hint">Obligatoria antes de calibrar. Si algo no cumple, primero hay que corregirlo.</p>
                  <button className="secondary small" type="button" onClick={markPrecheckAsPassed} disabled={precheckPassed}>
                    <ClipboardCheck className="action-icon" aria-hidden="true" />Marcar todo OK
                  </button>
                </div>
                <div className="grid two">
                  <CheckField label="Banda vacia" checked={eventForm.precheckBeltEmpty} onChange={(checked) => setEventForm((current) => ({ ...current, precheckBeltEmpty: checked }))} />
                  <CheckField label="Banda limpia" checked={eventForm.precheckBeltClean} onChange={(checked) => setEventForm((current) => ({ ...current, precheckBeltClean: checked }))} />
                  <CheckField label="Sin acumulacion de material" checked={eventForm.precheckNoMaterialBuildup} onChange={(checked) => setEventForm((current) => ({ ...current, precheckNoMaterialBuildup: checked }))} />
                  <CheckField label="Rolos y distancia de puente de pesaje OK" checked={eventForm.precheckIdlersOk} onChange={(checked) => setEventForm((current) => ({ ...current, precheckIdlersOk: checked }))} />
                  <CheckField label="Estructura sin vibraciones anormales" checked={eventForm.precheckStructureOk} onChange={(checked) => setEventForm((current) => ({ ...current, precheckStructureOk: checked }))} />
                  <CheckField label="Sensor de velocidad OK" checked={eventForm.precheckSpeedSensorOk} onChange={(checked) => setEventForm((current) => ({ ...current, precheckSpeedSensorOk: checked }))} />
                </div>
                <TextArea label="Observaciones de inspeccion" value={eventForm.precheckNotes} onChange={(value) => setEventForm((current) => ({ ...current, precheckNotes: value }))} />
                <div className="result-row"><span>Estado inspeccion</span><strong>{precheckPassed ? 'Completa' : 'Incompleta'}</strong></div>
              </CollapsibleCard>}

              {calibrationStep === 2 && <CollapsibleCard title="Paso 3 · Cero" hint="Registro del cero observado." defaultOpen>
                <div className="card-tag">Paso 3</div>
                <h2>Cero</h2>
                <p className="hint">Siempre se realiza antes de calibrar. Marca cero realizado para poder avanzar y registra el valor observado con su unidad.</p>
                <div className="grid two">
                  <CheckField label="Cero realizado" checked={eventForm.zeroCompleted} onChange={(checked) => setEventForm((current) => ({ ...current, zeroCompleted: checked }))} />
                  <Field label="Valor observado" type="number" value={eventForm.zeroBeforeValue} onChange={(value) => setEventForm((current) => ({ ...current, zeroBeforeValue: value }))} />
                  <div>
                    <label className="label">Unidad / referencia visible</label>
                    <select className="input" value={eventForm.zeroDisplayUnit} onChange={(e) => setEventForm((current) => ({ ...current, zeroDisplayUnit: e.target.value }))}>
                      <option value="mV">mV</option>
                      <option value={measureUnit('weightKg')}>{measureUnit('weightKg')}</option>
                      <option value="cuentas">Cuentas</option>
                      <option value="no_visible">No visible en controlador</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                </div>
                <div className="grid three compact-top">
                  <Metric label="Valor observado" value={eventForm.zeroBeforeValue || '-'} />
                  <Metric label="Unidad" value={eventForm.zeroDisplayUnit || '-'} />
                  <Metric label="Realizado" value={eventForm.zeroCompleted ? 'Si' : 'No'} />
                </div>
                <TextArea label="Observaciones de cero" value={eventForm.zeroNotes} onChange={(value) => setEventForm((current) => ({ ...current, zeroNotes: value }))} />
              </CollapsibleCard>}

              {calibrationStep === 3 && <CollapsibleCard title="Paso 4 · Foto de parametros" hint="Datos del controlador al momento de calibrar." defaultOpen>
                <div className="card-tag">Paso 4</div>
                <h2>Foto de parametros</h2>
                <p className="hint">El factor de calibracion actual es obligatorio: debe ser el factor que esta cargado en el controlador antes de validar con material real.</p>
                <div className="grid two">
                  <Field label="Factor calibracion actual" type="number" value={eventForm.calibrationFactor} onChange={(value) => setEventForm((current) => ({ ...current, calibrationFactor: value }))} />
                  <Field label="Cero" type="number" value={eventForm.zeroValue} onChange={(value) => setEventForm((current) => ({ ...current, zeroValue: value }))} />
                  <Field label={measureLabel('Puente pesaje', 'lengthM')} type="number" value={measureInput(eventForm.snapshotBridgeLengthM, 'lengthM')} onChange={(value) => setEventForm((current) => ({ ...current, snapshotBridgeLengthM: parseMeasure(value, 'lengthM') }))} />
                  <Field label={measureLabel('Velocidad nominal', 'speedMs')} type="number" value={measureInput(eventForm.snapshotNominalSpeedMs, 'speedMs')} onChange={(value) => setEventForm((current) => ({ ...current, snapshotNominalSpeedMs: parseMeasure(value, 'speedMs') }))} />
                  <Field label="Unidades" value={eventForm.units} onChange={(value) => setEventForm((current) => ({ ...current, units: value }))} />
                  <div className="system-field">
                    <span>Cambio registrado por</span>
                    <strong>{currentUser.username}</strong>
                  </div>
                </div>
                <TextArea label="Parametros extra" value={eventForm.extraParameters} onChange={(value) => setEventForm((current) => ({ ...current, extraParameters: value }))} />
                <div className="result-row"><span>Base para material real</span><strong>{toNumber(eventForm.calibrationFactor) > 0 ? eventForm.calibrationFactor : 'Pendiente'}</strong></div>
              </CollapsibleCard>}

              {calibrationStep === 4 && <CollapsibleCard title="Paso 5 · Span con cadena" hint="Lectura promedio contra peso patron." defaultOpen>
                <div className="card-tag">Paso 5</div>
                <h2>Span con peso patron (cadena)</h2>
                <div className="grid two">
                  <Field label={measureLabel('Peso lineal de cadena', 'linearWeightKgM')} type="number" value={measureInput(eventForm.chainLinearKgM, 'linearWeightKgM')} onChange={(value) => setEventForm((current) => ({ ...current, chainLinearKgM: parseMeasure(value, 'linearWeightKgM') }))} />
                  <Field label="Tiempo de test (min)" type="number" value={eventForm.passCount} onChange={(value) => setEventForm((current) => ({ ...current, passCount: value }))} />
                  <Field label={measureLabel('Promedio lectura controlador', 'linearWeightKgM')} type="number" value={measureInput(eventForm.avgControllerReadingKgM, 'linearWeightKgM')} onChange={(value) => setEventForm((current) => ({ ...current, avgControllerReadingKgM: parseMeasure(value, 'linearWeightKgM') }))} />
                  <Field label="Factor provisorio" type="number" value={eventForm.provisionalFactor} onChange={(value) => setEventForm((current) => ({ ...current, provisionalFactor: value }))} />
                </div>
                <div className="grid three compact-top">
                  <Metric label="Error promedio" value={`${round(avgErrorPct)} %`} />
                  <Metric label="Referencia cadena" value={measureText(toNumber(eventForm.chainLinearKgM) || 0, 'linearWeightKgM')} />
                  <Metric label="Promedio controlador" value={measureText(toNumber(eventForm.avgControllerReadingKgM) || 0, 'linearWeightKgM')} />
                </div>
              </CollapsibleCard>}

              {calibrationStep === 5 && <CollapsibleCard title="Paso 6 · Acumulado" hint="Control de totalizador y factor de ajuste." defaultOpen>
                <div className="card-tag">Paso 6</div>
                <h2>Acumulado y factor de ajuste</h2>
                <div className="grid two">
                  <Field label={measureLabel('Caudal leido', 'flowTph')} type="number" value={measureInput(eventForm.expectedFlowTph, 'flowTph')} onChange={(value) => setEventForm((current) => ({ ...current, expectedFlowTph: parseMeasure(value, 'flowTph') }))} />
                  <Field label="Tiempo de prueba (min)" type="number" value={eventForm.accumulatedTestMinutes} onChange={(value) => setEventForm((current) => ({ ...current, accumulatedTestMinutes: value }))} />
                  <Field label={measureLabel('Acumulado indicado', 'massT')} type="number" value={measureInput(eventForm.accumulatedIndicatedTotal, 'massT')} onChange={(value) => setEventForm((current) => ({ ...current, accumulatedIndicatedTotal: parseMeasure(value, 'massT') }))} />
                  <Field label="Factor ajuste antes" type="number" value={eventForm.adjustmentFactorBefore} onChange={(value) => setEventForm((current) => ({ ...current, adjustmentFactorBefore: value }))} />
                </div>
                <div className="grid four compact-top">
                  <Metric label={`Acumulado esperado (${measureUnit('massT')})`} value={eventForm.expectedFlowTph && eventForm.accumulatedTestMinutes ? measureNumber((toNumber(eventForm.expectedFlowTph) * toNumber(eventForm.accumulatedTestMinutes)) / 60, 'massT', 6) : '-'} />
                  <Metric label="Error acumulado" value={(() => {
                    if (!eventForm.expectedFlowTph || !eventForm.accumulatedTestMinutes || !eventForm.accumulatedIndicatedTotal) return '-'
                    const expectedTotal = (toNumber(eventForm.expectedFlowTph) * toNumber(eventForm.accumulatedTestMinutes)) / 60
                    const indicated = toNumber(eventForm.accumulatedIndicatedTotal)
                    if (expectedTotal === 0) return '-'
                    const errorPct = ((indicated - expectedTotal) / expectedTotal) * 100
                    return `${round(errorPct, 3)} %`
                  })()} />
                  <Metric label="Factor ajuste sugerido" value={(() => {
                    if (!eventForm.expectedFlowTph || !eventForm.accumulatedTestMinutes || !eventForm.accumulatedIndicatedTotal || !eventForm.adjustmentFactorBefore) return '-'
                    const expectedTotal = (toNumber(eventForm.expectedFlowTph) * toNumber(eventForm.accumulatedTestMinutes)) / 60
                    const indicated = toNumber(eventForm.accumulatedIndicatedTotal)
                    if (indicated === 0) return '-'
                    return String(round(toNumber(eventForm.adjustmentFactorBefore) * (expectedTotal / indicated), 6))
                  })()} />
                  <Metric label="Regla" value="Si el instantaneo esta bien, corregir con factor de ajuste" />
                </div>
              </CollapsibleCard>}

              {calibrationStep === 6 && <CollapsibleCard title="Paso 7 · Material real" hint="Validacion contra peso externo real." defaultOpen>
                <div className="card-tag">Paso 7</div>
                <h2>Validacion con material real</h2>
                <p className="hint">Registrá la primera pasada como control usando el factor actual cargado en el Paso 4. Si queda fuera de tolerancia, ajustá el factor en el controlador y agregá una verificacion post-ajuste.</p>
                {!requiresFullCalibration && <p className="hint">Esta balanza ya tiene calibracion previa: podés cerrar el evento como control preventivo solo con material real, sin repetir cadena ni acumulado.</p>}
                <div className="grid three compact-top">
                  <Metric label="Factor base Paso 4" value={materialFactorBefore > 0 ? String(materialFactorBefore) : 'Pendiente'} />
                  <Metric label="Tolerancia" value={`${eventForm.tolerancePercent || 1} %`} />
                  <Metric label="Referencia" value="Peso externo vs controlador" />
                </div>
                <div className="material-flow-guide compact-top">
                  <div>
                    <span>1</span>
                    <strong>Control inicial</strong>
                    <p>Primera comparacion contra peso externo con el factor del Paso 4. Si queda dentro de tolerancia y no tocás el factor, esta pasada alcanza.</p>
                  </div>
                  <div>
                    <span>2</span>
                    <strong>Ajuste</strong>
                    <p>Si corregís el factor del controlador, cargá ese factor como final y prepará una pasada posterior.</p>
                  </div>
                  <div>
                    <span>3</span>
                    <strong>Verificacion</strong>
                    <p>La pasada post-ajuste confirma que el cambio quedó dentro de tolerancia antes de guardar.</p>
                  </div>
                </div>
                {[1, 2, 3].slice(0, materialPassCount).map((passNumber) => {
                  const prefix = `materialPass${passNumber}` as 'materialPass1' | 'materialPass2' | 'materialPass3'
                  const pass = materialPasses[passNumber - 1]
                  const passFactorValue = passNumber === 1 ? eventForm.calibrationFactor : eventForm[`${prefix}Factor`]
                  const passComplete = Boolean(pass.externalWeightKg && pass.beltWeightKg)
                  const passWithinTolerance = passComplete && Math.abs(pass.errorPct) <= toNumber(eventForm.tolerancePercent || 1)
                  return (
                    <div className="material-pass-card" key={passNumber}>
                      <div className="row wrap">
                        <div>
                          <span className="section-kicker">{passNumber === 1 ? 'Control inicial' : 'Verificacion post-ajuste'}</span>
                          <h3>Pasada {passNumber}</h3>
                        </div>
                        <strong className={passWithinTolerance ? 'status-pill success' : 'status-pill'}>
                          {pass.externalWeightKg && pass.beltWeightKg ? `${round(pass.errorPct)} %` : 'Pendiente'}
                        </strong>
                      </div>
                      <p className="hint compact-top">
                        {passNumber === 1
                          ? 'Usala como referencia inicial. Si no hay ajuste y el error cumple tolerancia, no hace falta agregar otra pasada.'
                          : 'Usala despues de modificar el factor del controlador; registrá el factor realmente usado en esta verificacion.'}
                      </p>
                      <div className="grid two compact-top">
                        <Field label={measureLabel('Peso balanza certificada', 'weightKg')} type="number" value={measureInput(eventForm[`${prefix}ExternalWeightKg`], 'weightKg')} onChange={(value) => setEventForm((current) => ({ ...current, [`${prefix}ExternalWeightKg`]: parseMeasure(value, 'weightKg') }))} />
                        <Field label={measureLabel('Peso indicado controlador', 'weightKg')} type="number" value={measureInput(eventForm[`${prefix}BeltWeightKg`], 'weightKg')} onChange={(value) => setEventForm((current) => ({ ...current, [`${prefix}BeltWeightKg`]: parseMeasure(value, 'weightKg') }))} />
                        <Field
                          label={passNumber === 1 ? 'Factor usado (Paso 4)' : 'Factor usado post-ajuste'}
                          type="number"
                          value={passFactorValue}
                          onChange={(value) => setEventForm((current) => ({ ...current, [`${prefix}Factor`]: value }))}
                          disabled={passNumber === 1}
                          hint={passNumber === 1 ? 'Se toma del factor actual registrado en Paso 4.' : undefined}
                        />
                        <TextArea label="Nota de pasada" value={eventForm[`${prefix}Notes`]} onChange={(value) => setEventForm((current) => ({ ...current, [`${prefix}Notes`]: value }))} />
                      </div>
                    </div>
                  )
                })}
                {finalMaterialPass && Math.abs(materialErrorPct) <= toNumber(eventForm.tolerancePercent || 1) && !materialAdjustmentApplied && (
                  <div className="material-next-step success compact-top">
                    <strong>Una pasada alcanza</strong>
                    <p>El control inicial queda dentro de tolerancia y no se registró ajuste de factor. Podés pasar al cierre sin agregar verificacion post-ajuste.</p>
                  </div>
                )}
                {finalMaterialPass && Math.abs(materialErrorPct) > toNumber(eventForm.tolerancePercent || 1) && (
                  <div className="material-next-step warning compact-top">
                    <strong>Fuera de tolerancia</strong>
                    <p>Si vas a corregir el factor, agregá una verificacion post-ajuste. Si no se corrige, el evento cerrará como fuera de tolerancia.</p>
                  </div>
                )}
                {materialAdjustmentApplied && completeMaterialPasses.length < 2 && (
                  <div className="material-next-step warning compact-top">
                    <strong>Falta verificar el ajuste</strong>
                    <p>Hay un cambio de factor registrado. Agregá una pasada post-ajuste para confirmar el resultado antes de cerrar.</p>
                  </div>
                )}
                <div className="row wrap compact-top">
                  {materialPassCount < 3 && <button className="secondary" type="button" onClick={() => setMaterialPassCount((current) => Math.min(current + 1, 3))}>Agregar verificacion post-ajuste</button>}
                  {materialPassCount > 1 && <button className="secondary danger" type="button" onClick={() => setMaterialPassCount((current) => Math.max(current - 1, 1))}>Quitar ultima pasada</button>}
                </div>
                <div className="grid four compact-top">
                  <Metric label="Resultado final" value={finalMaterialPass ? outcomeLabel(materialOutcome) : '-'} />
                  <Metric label="Error final" value={finalMaterialPass ? `${round(materialErrorPct)} %` : '-'} />
                  <Metric label="Ajuste aplicado" value={materialAdjustmentApplied ? 'Si' : 'No'} />
                  <Metric label="Factor sugerido" value={suggestedFactor ? String(round(suggestedFactor, 6)) : '-'} />
                </div>
              </CollapsibleCard>}

              {calibrationStep === 7 && <div className="card">
                <div className="card-tag">Paso 8</div>
                <h2>Revision final y aprobacion</h2>
                <p className="hint compact-top">Antes de guardar, revisa que el resultado, las pasadas y el factor final coincidan con lo que queda cargado en el controlador.</p>
                <div className={`final-factor-panel compact-top ${eventBlockingIssues.length === 0 ? 'ready' : ''}`}>
                  <div className="final-factor-copy">
                    <span className="section-kicker">Cierre del controlador</span>
                    <h3>Factor final de calibracion</h3>
                    <p>Este es el valor que debe quedar cargado en el controlador al cerrar el evento.</p>
                  </div>
                  <div className="final-factor-entry">
                    <Field label="Valor final cargado" type="number" value={eventForm.finalFactor} onChange={(value) => setEventForm((current) => ({ ...current, finalFactor: value }))} />
                    <div className="final-factor-meta">
                      <span>{eventBlockingIssues.length === 0 ? 'Listo para guardar' : `${eventBlockingIssues.length} bloqueo(s)`}</span>
                      <span>Responsable: {currentUser.username}</span>
                    </div>
                  </div>
                </div>
                <div className="grid three compact-top">
                  <Metric label="Resultado material" value={finalMaterialPass ? outcomeLabel(materialOutcome) : '-'} />
                  <Metric label="Error final" value={finalMaterialPass ? `${round(materialErrorPct)} %` : '-'} />
                  <Metric label="Ajuste aplicado" value={materialAdjustmentApplied ? 'Si' : 'No'} />
                </div>
                <div className="closure-review compact-top">
                  <span className="section-kicker">Revision de cierre</span>
                  <div className="grid four compact-top">
                    <Metric label="Equipo" value={selectedEquipment ? `${selectedEquipment.beltCode} / ${selectedEquipment.scaleName}` : '-'} />
                    <Metric label="Resultado" value={finalMaterialPass ? outcomeLabel(materialOutcome) : '-'} />
                    <Metric label="Error final" value={finalMaterialPass ? `${round(materialErrorPct)} %` : '-'} />
                    <Metric label="Bloqueos" value={String(eventBlockingIssues.length)} />
                  </div>
                  <div className="grid four compact-top">
                    <Metric label="Cero" value={eventForm.zeroCompleted ? 'Registrado' : 'Pendiente'} />
                    <Metric label="Factor Paso 4" value={eventForm.calibrationFactor ? String(eventForm.calibrationFactor) : '-'} />
                    <Metric label="Cadena" value={!requiresFullCalibration ? 'No requerida' : eventForm.chainLinearKgM ? measureText(toNumber(eventForm.chainLinearKgM), 'linearWeightKgM') : '-'} />
                    <Metric label="Caudal" value={!requiresFullCalibration ? 'No requerido' : eventForm.expectedFlowTph ? measureText(toNumber(eventForm.expectedFlowTph), 'flowTph') : '-'} />
                  </div>
                  <div className="grid four compact-top">
                    <Metric label="Acum. tiempo" value={!requiresFullCalibration ? 'No requerido' : eventForm.accumulatedTestMinutes ? `${eventForm.accumulatedTestMinutes} min` : '-'} />
                    <Metric label="Acum. indicado" value={!requiresFullCalibration ? 'No requerido' : eventForm.accumulatedIndicatedTotal ? measureText(toNumber(eventForm.accumulatedIndicatedTotal), 'massT') : '-'} />
                    <Metric label="Factor final" value={eventForm.finalFactor ? String(eventForm.finalFactor) : '-'} />
                    <Metric label="Responsable" value={currentUser.username} />
                  </div>
                  {completeMaterialPasses.length > 0 && (
                    <div className="grid four compact-top">
                      {completeMaterialPasses.slice(0, 3).map((pass, i) => (
                        <Metric
                          key={pass.index}
                          label={`Pasada ${i + 1}`}
                          value={pass.factorUsed ? `Ext: ${measureText(pass.externalWeightKg, 'weightKg')} | Ctrl: ${measureText(pass.beltWeightKg, 'weightKg')} | Error: ${round(pass.errorPct)} % | Factor: ${pass.factorUsed}` : '-'}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <TextArea label="Observaciones" value={eventForm.notes} onChange={(value) => setEventForm((current) => ({ ...current, notes: value }))} />
                {automaticDiagnosis.length > 0 && (
                  <div className="warning-panel">
                    <strong>Diagnostico automatico</strong>
                    <ul>
                      {automaticDiagnosis.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {eventSubmitAttempted && eventBlockingIssues.length > 0 && (
                  <div className="warning-panel">
                    <strong>Faltan datos obligatorios para cerrar el evento</strong>
                    <ul>
                      {eventBlockingIssues.map((issue) => (
                        <li key={issue.message}>{issue.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button className="primary" type="submit" disabled={eventSaving}><Save className="action-icon" aria-hidden="true" />{eventSaving ? 'Guardando...' : 'Guardar evento'}</button>
              </div>}
            </form>
            <div className="wizard-actions card">
              <button className="secondary" type="button" onClick={goToPreviousCalibrationStep} disabled={eventSaving || calibrationStep === 0}>Anterior</button>
              {hasEventDraft && <button className="secondary danger" type="button" onClick={() => clearEventDraft()} disabled={eventSaving}><Trash2 className="action-icon" aria-hidden="true" />Descartar borrador</button>}
              {calibrationStep < calibrationSteps.length - 1 && <button className="primary" type="button" onClick={goToNextCalibrationStep} disabled={eventSaving}>Siguiente</button>}
            </div>
          </section>
        )}

        {screen === 'herramientas' && (
          <section className="stack screen-shell">
            <div className="screen-banner">
              <span className="section-kicker">Calculadoras de campo</span>
              <h2>Velocidad, cadena y factor</h2>
              <p>Tomá datos en piso y trasladá resultados al evento sin rehacer cuentas manuales.</p>
            </div>
            <div className="card">
              <label className="label">Balanza</label>
              <select className="input" value={selectedEquipmentId} onChange={(e) => setSelectedEquipmentId(e.target.value)}>
                <option value="">Seleccionar balanza</option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</option>
                ))}
              </select>
              {selectedEquipment && (
                <div className="selected-equipment-visual compact-top">
                  <EquipmentPhoto
                    photoUrl={getEquipmentPhotoUrl(selectedEquipment.photoPath)}
                    label={selectedEquipment.scaleName}
                    status={selectedEquipmentStatus}
                    onOpen={() => openEquipmentPhoto(selectedEquipment)}
                  />
                  <div className="grid four">
                    <Metric label="Diametro RPM" value={measureText(selectedEquipment.rpmRollDiameterMm || 0, 'lengthMm')} />
                    <Metric label="Largo cinta" value={measureText(selectedEquipment.beltLengthM || 0, 'lengthM')} />
                    <Metric label="Puente" value={measureText(selectedEquipment.bridgeLengthM || 0, 'lengthM')} />
                    <Metric label="Velocidad nominal" value={measureText(selectedEquipment.nominalSpeedMs || 0, 'speedMs')} />
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <label className="label">Cadena de calibracion</label>
              <select
                className="input"
                value={selectedChainId}
                onChange={(e) => {
                  const nextId = e.target.value
                  setSelectedChainId(nextId)
                  const chain = chains.find((item) => item.id === nextId)
                  if (!chain) return
                  setChainToolForm((current) => ({
                    ...current,
                    chainLengthM: String(chain.totalLengthM || ''),
                    chainWeightKg: String(chain.totalWeightKg || ''),
                  }))
                }}
              >
                <option value="">Seleccionar cadena</option>
                {availableChains.map((item) => (
                  <option key={item.id} value={item.id}>{item.plant} / {item.name}</option>
                ))}
              </select>
              {usingAllChainsFallback && <p className="hint compact-top">No hay cadenas para esta planta. Se muestran todas las disponibles.</p>}
              {selectedChain && (
                <div className="grid three compact-top">
                  <Metric label={measureUnit('linearWeightKgM')} value={measureNumber(selectedChain.linearWeightKgM, 'linearWeightKgM', 6)} />
                  <Metric label="Largo total" value={measureText(selectedChain.totalLengthM, 'lengthM')} />
                  <Metric label="Peso total" value={measureText(selectedChain.totalWeightKg, 'weightKg')} />
                </div>
              )}
            </div>

            <CollapsibleCard title="Velocidad por RPM" hint="Calculo rapido desde RPM de rolo." defaultOpen={false}>
              <h2>Velocidad por RPM</h2>
              <div className="grid two">
                <Field label="RPM del rolo" type="number" value={rpmToolForm.rpm} onChange={(value) => setRpmToolForm((current) => ({ ...current, rpm: value }))} />
                <Field label={measureLabel('Velocidad indicada', 'speedMs')} type="number" value={measureInput(rpmToolForm.indicatedSpeedMs, 'speedMs')} onChange={(value) => setRpmToolForm((current) => ({ ...current, indicatedSpeedMs: parseMeasure(value, 'speedMs') }))} />
              </div>
              <div className="grid four compact-top">
                <Metric label={measureUnit('speedMs')} value={rpmToolResult ? measureNumber(rpmToolResult.speedMs, 'speedMs', 6) : '-'} />
                <Metric label={unitSystem === 'metric' ? 'm/min' : 'ft/s'} value={rpmToolResult ? String(round(unitSystem === 'metric' ? rpmToolResult.speedMmin : toDisplayMeasure(rpmToolResult.speedMs, 'lengthM', unitSystem), 3)) : '-'} />
                <Metric label={unitSystem === 'metric' ? 'm/h' : 'ft/h'} value={rpmToolResult ? String(round(unitSystem === 'metric' ? rpmToolResult.speedMh : toDisplayMeasure(rpmToolResult.speedMh, 'lengthM', unitSystem), 1)) : '-'} />
                <Metric label="Error %" value={rpmToolResult && rpmToolForm.indicatedSpeedMs ? `${round(rpmToolResult.errorPct, 3)} %` : '-'} />
              </div>
              <button className="secondary" disabled={!rpmToolResult || !canOperate} onClick={() => rpmToolResult && applyMeasuredSpeed(rpmToolResult.speedMs)}>
                <ClipboardCheck className="action-icon" aria-hidden="true" />
                Usar velocidad en evento
              </button>
            </CollapsibleCard>

            <CollapsibleCard title="Velocidad por vuelta completa" hint="Calculo desde largo de cinta y tiempo de vuelta." defaultOpen={false}>
              <h2>Velocidad por vuelta completa</h2>
              <div className="grid two">
                <Field label="Tiempo por vuelta (s)" type="number" value={loopToolForm.loopTimeSeconds} onChange={(value) => setLoopToolForm((current) => ({ ...current, loopTimeSeconds: value }))} />
                <Field label={measureLabel('Velocidad indicada', 'speedMs')} type="number" value={measureInput(loopToolForm.indicatedSpeedMs, 'speedMs')} onChange={(value) => setLoopToolForm((current) => ({ ...current, indicatedSpeedMs: parseMeasure(value, 'speedMs') }))} />
              </div>
              <div className="grid four compact-top">
                <Metric label={measureUnit('speedMs')} value={loopToolResult ? measureNumber(loopToolResult.speedMs, 'speedMs', 6) : '-'} />
                <Metric label={unitSystem === 'metric' ? 'm/min' : 'ft/s'} value={loopToolResult ? String(round(unitSystem === 'metric' ? loopToolResult.speedMmin : toDisplayMeasure(loopToolResult.speedMs, 'lengthM', unitSystem), 3)) : '-'} />
                <Metric label={unitSystem === 'metric' ? 'm/h' : 'ft/h'} value={loopToolResult ? String(round(unitSystem === 'metric' ? loopToolResult.speedMh : toDisplayMeasure(loopToolResult.speedMh, 'lengthM', unitSystem), 1)) : '-'} />
                <Metric label="Error %" value={loopToolResult && loopToolForm.indicatedSpeedMs ? `${round(loopToolResult.errorPct, 3)} %` : '-'} />
              </div>
              <button className="secondary" disabled={!loopToolResult || !canOperate} onClick={() => loopToolResult && applyMeasuredSpeed(loopToolResult.speedMs)}>
                <ClipboardCheck className="action-icon" aria-hidden="true" />
                Usar velocidad en evento
              </button>
            </CollapsibleCard>

            <CollapsibleCard title="Cadena de calibracion" hint="Caudal esperado y peso lineal desde cadena patron." defaultOpen={false}>
              <h2>Cadena de calibracion</h2>
              <div className="grid two">
                <Field label={measureLabel('Largo total cadena', 'lengthM')} type="number" value={measureInput(chainToolForm.chainLengthM, 'lengthM')} onChange={(value) => setChainToolForm((current) => ({ ...current, chainLengthM: parseMeasure(value, 'lengthM') }))} />
                <Field label={measureLabel('Peso total cadena', 'weightKg')} type="number" value={measureInput(chainToolForm.chainWeightKg, 'weightKg')} onChange={(value) => setChainToolForm((current) => ({ ...current, chainWeightKg: parseMeasure(value, 'weightKg') }))} />
                <Field label={measureLabel('Largo tren pesaje', 'lengthM')} type="number" value={measureInput(chainToolForm.trainLengthM, 'lengthM')} onChange={(value) => setChainToolForm((current) => ({ ...current, trainLengthM: parseMeasure(value, 'lengthM') }))} />
                <Field label={measureLabel('Velocidad', 'speedMs')} type="number" value={measureInput(chainToolForm.speedMs, 'speedMs')} onChange={(value) => setChainToolForm((current) => ({ ...current, speedMs: parseMeasure(value, 'speedMs') }))} />
              </div>
              <div className="grid three compact-top">
                <Metric label={measureUnit('linearWeightKgM')} value={chainToolResult ? measureNumber(chainToolResult.kgPerMeter, 'linearWeightKgM', 6) : '-'} />
                <Metric label={`Carga sobre tren (${measureUnit('weightKg')})`} value={chainToolResult ? measureNumber(chainToolResult.kgOnTrain, 'weightKg', 3) : '-'} />
                <Metric label={`Caudal esperado (${measureUnit('flowTph')})`} value={chainToolResult ? measureNumber(chainToolResult.tph, 'flowTph', 3) : '-'} />
              </div>
              <button className="secondary" disabled={!chainToolResult || !canOperate} onClick={applyChainToEvent}>
                <ClipboardCheck className="action-icon" aria-hidden="true" />
                Usar datos en evento
              </button>
            </CollapsibleCard>

            <CollapsibleCard title="Acumulado" hint="Control de totalizador y factor de ajuste." defaultOpen={false}>
              <h2>Acumulado</h2>
              <div className="grid two">
                <Field label={measureLabel('Caudal esperado', 'flowTph')} type="number" value={measureInput(accumulatedToolForm.expectedFlowTph, 'flowTph')} onChange={(value) => setAccumulatedToolForm((current) => ({ ...current, expectedFlowTph: parseMeasure(value, 'flowTph') }))} />
                <Field label="Tiempo de prueba (min)" type="number" value={accumulatedToolForm.testMinutes} onChange={(value) => setAccumulatedToolForm((current) => ({ ...current, testMinutes: value }))} />
                <Field label={measureLabel('Acumulado indicado', 'massT')} type="number" value={measureInput(accumulatedToolForm.indicatedTotal, 'massT')} onChange={(value) => setAccumulatedToolForm((current) => ({ ...current, indicatedTotal: parseMeasure(value, 'massT') }))} />
                <Field label="Factor ajuste actual" type="number" value={accumulatedToolForm.adjustmentFactorCurrent} onChange={(value) => setAccumulatedToolForm((current) => ({ ...current, adjustmentFactorCurrent: value }))} />
              </div>
              <div className="grid four compact-top">
                <Metric label={`Acumulado esperado (${measureUnit('massT')})`} value={accumulatedToolResult ? measureNumber(accumulatedToolResult.expectedTotal, 'massT', 6) : '-'} />
                <Metric label="Error %" value={accumulatedToolResult ? `${round(accumulatedToolResult.errorPct, 3)} %` : '-'} />
                <Metric label="Factor ajuste sugerido" value={accumulatedToolResult ? String(round(accumulatedToolResult.suggestedAdjustmentFactor, 6)) : '-'} />
                <Metric label="Diagnostico" value={accumulatedToolResult ? (Math.abs(accumulatedToolResult.errorPct) > 2 ? 'Revisar/ajustar acumulado' : 'Acumulado coherente') : '-'} />
              </div>
              <button className="secondary" disabled={!accumulatedToolResult || !canOperate} onClick={applyAccumulatedToEvent}>
                <ClipboardCheck className="action-icon" aria-hidden="true" />
                Usar acumulado en evento
              </button>
            </CollapsibleCard>

            <CollapsibleCard title="Factor de correccion" hint="Nuevo factor desde peso real contra peso indicado." defaultOpen={false}>
              <h2>Factor de correccion</h2>
              <div className="grid two">
                <Field label="Factor actual" type="number" value={factorToolForm.currentFactor} onChange={(value) => setFactorToolForm((current) => ({ ...current, currentFactor: value }))} />
                <Field label={measureLabel('Peso medido por balanza', 'weightKg')} type="number" value={measureInput(factorToolForm.controllerWeightKg, 'weightKg')} onChange={(value) => setFactorToolForm((current) => ({ ...current, controllerWeightKg: parseMeasure(value, 'weightKg') }))} />
                <Field label={measureLabel('Peso real externo', 'weightKg')} type="number" value={measureInput(factorToolForm.realWeightKg, 'weightKg')} onChange={(value) => setFactorToolForm((current) => ({ ...current, realWeightKg: parseMeasure(value, 'weightKg') }))} />
              </div>
              <div className="grid four compact-top">
                <Metric label="Factor nuevo" value={factorToolResult ? String(round(factorToolResult.newFactor, 6)) : '-'} />
                <Metric label={`Diferencia (${measureUnit('weightKg')})`} value={factorToolResult ? measureNumber(factorToolResult.diffKg, 'weightKg', 3) : '-'} />
                <Metric label="Error %" value={factorToolResult ? `${round(factorToolResult.errorPct, 3)} %` : '-'} />
                <Metric label="Recomendacion" value={factorToolResult ? factorToolResult.recommendation : '-'} />
              </div>
              <button className="secondary" disabled={!factorToolResult || !canOperate} onClick={applyFactorToEvent}>
                <ClipboardCheck className="action-icon" aria-hidden="true" />
                Usar factor en evento
              </button>
            </CollapsibleCard>
          </section>
        )}

        {screen === 'historial' && (
          <section className="stack screen-shell">
            <div className="screen-banner">
              <span className="section-kicker">Trazabilidad</span>
              <h2>Historial de calibraciones</h2>
              <p>Leé eventos previos, errores, motivos de ajuste y estado operativo con precisión histórica.</p>
            </div>
            <div className="card">
              <h2>Historial de eventos</h2>
              <div className="history-summary compact-top">
                <Metric label="Eventos filtrados" value={String(filteredEvents.length)} />
                <Metric label="Mostrando" value={`${paginatedEvents.length}/${filteredEvents.length}`} />
                <Metric label="Fuera tolerancia" value={String(historySummary.outOfTolerance)} />
                <Metric label="Conformes" value={String(historySummary.compliant)} />
              </div>
              <div className="grid three compact-top">
                <div>
                  <label className="label">Balanza</label>
                  <select className="input" value={historyEquipmentId} onChange={(e) => setHistoryEquipmentId(e.target.value)}>
                    <option value="todos">Todas</option>
                    {equipment.map((item) => (
                      <option key={item.id} value={item.id}>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select className="input" value={historyStatusFilter} onChange={(e) => setHistoryStatusFilter(e.target.value)}>
                    <option value="todos">Todos</option>
                    <option value="success">Conforme / calibrada</option>
                    <option value="warning">Pendiente</option>
                    <option value="danger">Fuera de tolerancia</option>
                  </select>
                </div>
                <div>
                  <label className="label">Mes</label>
                  <select className="input" value={historyMonthFilter} onChange={(e) => setHistoryMonthFilter(e.target.value)}>
                    <option value="todos">Todos</option>
                    {historyMonths.map((month) => <option key={month} value={month}>{month}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <HistoryPager page={historyPage} pageSize={HISTORY_PAGE_SIZE} totalItems={filteredEvents.length} onPageChange={setHistoryPage} />

            <Suspense fallback={<div className="card">Cargando historial...</div>}>
              {paginatedEvents.map((item) => {
                const equipmentItem = equipmentById.get(item.equipmentId)
                const materialSummary = getEventMaterialOutcome(item)
                return (
                  <HistoryEventCard
                    key={item.id}
                    item={item}
                    equipmentItem={equipmentItem}
                    materialSummary={materialSummary}
                    statusClass={statusClass}
                    photoUrl={equipmentItem ? getEquipmentPhotoUrl(equipmentItem.photoPath) : ''}
                    canDelete={canDelete}
                    onOpenPhoto={() => equipmentItem && openEquipmentPhoto(equipmentItem)}
                    onPrint={() => printCalibrationReport(item, equipmentItem)}
                    onDelete={() => handleDeleteEvent(item.id)}
                    formatDateTime={formatDateTime}
                    formatWeight={(value) => measureText(value, 'weightKg')}
                  />
                )
              })}
            </Suspense>

            {filteredEvents.length > HISTORY_PAGE_SIZE && (
              <HistoryPager page={historyPage} pageSize={HISTORY_PAGE_SIZE} totalItems={filteredEvents.length} onPageChange={setHistoryPage} />
            )}

            {filteredEvents.length === 0 && <div className="card">No hay eventos con esos filtros.</div>}
          </section>
        )}

{screen === 'usuarios' && canManageUsers && (
          <section className="stack screen-shell">
            <div className="screen-banner">
              <span className="section-kicker">Administracion</span>
              <h2>Gestion de usuarios</h2>
              <p>Alta y baja de usuarios usando autenticacion online y perfiles con rol operativo.</p>
            </div>
            <div className="card stack">
              <h2>Crear usuario</h2>
              <form className="stack" onSubmit={handleUserSubmit}>
                <div className="grid two">
                  <Field label="Email" type="email" value={userForm.email} onChange={(value) => setUserForm((current) => ({ ...current, email: value }))} />
                  <Field label="Nombre visible" value={userForm.username} onChange={(value) => setUserForm((current) => ({ ...current, username: value }))} />
                  <Field label="Contraseña" type="password" value={userForm.password} onChange={(value) => setUserForm((current) => ({ ...current, password: value }))} />
                  <div>
                    <label className="label">Rol</label>
                    <select className="input" value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value as UserRole }))}>
                      <option value="viewer">Consulta</option>
                      <option value="tecnico">Tecnico</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <button className="primary" type="submit" disabled={userManagementLoading}><Users className="action-icon" aria-hidden="true" />Crear usuario</button>
              </form>
            </div>
            <div className="card stack">
              <div className="row wrap">
                <div>
                  <h2>Usuarios activos</h2>
                  <p className="hint">Los cambios se aplican sobre el servidor de usuarios.</p>
                </div>
                <button className="secondary small" onClick={loadManagedUsers} disabled={userManagementLoading}><Settings2 className="action-icon" aria-hidden="true" />Actualizar</button>
              </div>
              {managedUsers.map((user) => (
                <div className="result-row" key={user.id}>
                  <span>{user.username || user.email} · {user.email} · {user.role}</span>
                  <button className="secondary small danger" disabled={user.id === currentUser.id || userManagementLoading} onClick={() => handleDeleteUser(user)}><Trash2 className="action-icon" aria-hidden="true" />Eliminar</button>
                </div>
              ))}
              {managedUsers.length === 0 && <div className="result-row"><span>No hay usuarios cargados o no se cargo la lista.</span><strong>-</strong></div>}
            </div>
            <div className="card stack">
              <div className="row wrap">
                <div>
                  <h2>Sesiones</h2>
                  <p className="hint">Registro de ingresos y cierres de sesion de todos los usuarios.</p>
                </div>
                <div className="row gap">
                  <button className={`secondary small ${!sessionsTab ? 'primary' : ''}`} onClick={() => { setSessionsTab(false); void loadManagedUsers() }} disabled={userManagementLoading}>Usuarios</button>
                  <button className={`secondary small ${sessionsTab ? 'primary' : ''}`} onClick={() => { setSessionsTab(true); void loadSessionLogs() }} disabled={userManagementLoading}>Sesiones</button>
                  {sessionsTab && <button className="secondary small danger" onClick={handleClearSessionLogs} disabled={userManagementLoading}>Borrar registros</button>}
                </div>
              </div>
              {!sessionsTab ? null : (
                <>
                  {sessionLogs.length > 0 && (
                    <div className="session-table">
                      <div className="session-row session-row-head">
                        <span>Usuario</span>
                        <span>Inicio</span>
                        <span>Cierre</span>
                        <span>Dispositivo</span>
                      </div>
                      {sessionLogs.map((log) => (
                        <div className="session-row" key={log.id}>
                          <span>{log.username || 'Desconocido'}</span>
                          <span>{log.login_at ? formatDateTime(log.login_at) : '-'}</span>
                          <span>{log.logout_at ? formatDateTime(log.logout_at) : 'Abierta'}</span>
                          <span>{getSessionDevice(log.user_agent)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {sessionLogs.length === 0 && <div className="result-row"><span>No hay sesiones registradas.</span><strong>-</strong></div>}
                </>
              )}
            </div>
          </section>
        )}

      </main>

      <nav className={`bottom-nav ${canManageUsers ? 'six' : canOperate ? 'five' : canReview ? 'four' : 'three'}`} aria-label="Navegacion principal">
        <button type="button" className={navItemClass('dashboard')} aria-current={screen === 'dashboard' ? 'page' : undefined} onClick={() => handleNavSelect('dashboard')}><Scale className="nav-icon" aria-hidden="true" />Inicio</button>
        {canReview && <button type="button" className={navItemClass('balanzas')} aria-current={screen === 'balanzas' ? 'page' : undefined} onClick={() => handleNavSelect('balanzas')}><Scale className="nav-icon" aria-hidden="true" />Balanzas</button>}
        <button type="button" className={navItemClass('herramientas')} aria-current={screen === 'herramientas' ? 'page' : undefined} onClick={() => handleNavSelect('herramientas')}><Wrench className="nav-icon" aria-hidden="true" />Herramientas</button>
        {canOperate && <button type="button" className={navItemClass('nueva')} aria-current={screen === 'nueva' ? 'page' : undefined} onClick={() => handleNavSelect('nueva')}><ClipboardCheck className="nav-icon" aria-hidden="true" />Nueva</button>}
        <button type="button" className={navItemClass('historial')} aria-current={screen === 'historial' ? 'page' : undefined} onClick={() => handleNavSelect('historial')}><History className="nav-icon" aria-hidden="true" />Historial</button>
        {canManageUsers && <button type="button" className={navItemClass('usuarios')} aria-current={screen === 'usuarios' ? 'page' : undefined} onClick={() => handleNavSelect('usuarios')}><Users className="nav-icon" aria-hidden="true" />Usuarios</button>}
      </nav>
    </div>
  )
}

function CollapsibleCard({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className="card stack collapsible-card" open={defaultOpen}>
      <summary className="collapsible-summary">
        <span>
          <strong>{title}</strong>
          {hint && <small>{hint}</small>}
        </span>
        <span className="collapsible-indicator">Abrir</span>
      </summary>
      <div className="collapsible-body">
        {children}
      </div>
    </details>
  )
}

type FieldProps = { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean; hint?: string }

function Field({ label, value, onChange, type = 'text', disabled, hint }: FieldProps) {
  const id = useId()
  const isNumeric = type === 'number'
  const inputType = isNumeric ? 'text' : type
  const inputMode = isNumeric ? 'decimal' : type === 'email' ? 'email' : undefined
  const [draftValue, setDraftValue] = useState(value)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (!isEditing) setDraftValue(value)
  }, [isEditing, value])

  const handleChange = (rawValue: string) => {
    if (!isNumeric) {
      onChange(rawValue)
      return
    }

    const normalizedValue = normalizeDecimalInput(rawValue)
    setDraftValue(normalizedValue)
    onChange(normalizedValue)
  }

  const handleFocus = () => {
    if (!isNumeric) return
    setIsEditing(true)
    setDraftValue(normalizeDecimalInput(value))
  }

  const handleBlur = () => {
    if (!isNumeric) return
    setIsEditing(false)
  }

  const inputValue = isNumeric && isEditing ? draftValue : value

  return (
    <div className="field-shell">
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" type={inputType} inputMode={inputMode} value={inputValue} onChange={(event) => handleChange(event.target.value)} onFocus={handleFocus} onBlur={handleBlur} disabled={disabled} />
      {hint && <p className="hint compact-top">{hint}</p>}
    </div>
  )
}

function TextArea({ label, value, onChange }: Omit<FieldProps, 'type'>) {
  const id = useId()
  return (
    <div className="field-shell">
      <label className="label" htmlFor={id}>{label}</label>
      <textarea id={id} className="input textarea" value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
    </div>
  )
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="check-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export default App
