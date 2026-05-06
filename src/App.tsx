import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, MouseEvent, ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import {
  ClipboardCheck,
  Download,
  History,
  Moon,
  Pencil,
  PlusCircle,
  Printer,
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
import {
  buildDeleteEquipmentSheetsPayload,
  buildDeleteEventSheetsPayload,
  deleteCalibrationEventRecord,
  deleteChainRecord,
  deleteEquipmentRecord,
  loadAppData,
  saveCalibrationEventRecord,
  saveChainRecord,
  saveEquipmentRecord,
  syncCalibrationEventToSheets,
  updateCalibrationEventSync,
} from './repository'
import type { SheetsEventPayload } from './repository'
import { loadChains, loadEquipment, loadEvents, saveChains, saveEquipment, saveEvents } from './storage'
import { isSupabaseConfigured, supabase } from './supabase'
import { DEFAULT_CHECK_INTERVAL_DAYS } from './types'
import type { CalibrationEvent, Chain, Equipment, MaterialOutcome, MaterialPass, SpeedSource } from './types'
import {
  computePercentError,
  computeSuggestedFactor,
  formatDateTime,
  generateEventCode,
  generateId,
  normalizeDecimalInput,
  nowLocalValue,
  round,
  toNumber,
} from './utils'

type Screen = 'dashboard' | 'balanzas' | 'herramientas' | 'nueva' | 'historial' | 'usuarios'
type ToastTone = 'info' | 'success' | 'warning' | 'error'
type AppTheme = 'light' | 'dark'
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

const APP_VERSION = 'v2.0.10'
const CALIBRATION_DRAFT_KEY = 'calibracinta:event-draft:v1'
const THEME_STORAGE_KEY = 'calibracinta:theme'

function getInitialTheme(): AppTheme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'dark' ? 'dark' : 'light'
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

type EventDraft = {
  eventForm: typeof defaultEventForm
  selectedEquipmentId: string
  selectedChainId: string
  materialPassCount: number
  savedAt: string
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

const DAY_MS = 24 * 60 * 60 * 1000
const DUE_SOON_DAYS = 7

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

function dateOnly(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function addDays(value: string, days: number) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

function formatDateOnly(value: Date) {
  return value.toLocaleDateString('es-AR')
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

  const dueDate = addDays(lastValidEvent.eventDate, intervalDays)
  const daysRemaining = Math.ceil((dateOnly(dueDate).getTime() - dateOnly(today).getTime()) / DAY_MS)
  const lastValidDateText = formatDateOnly(new Date(lastValidEvent.eventDate))
  const nextDueDateText = formatDateOnly(dueDate)

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

function formatSheetsDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
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
        <li>Supabase, RLS y datos</li>
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
          <tr><td>Tecnico</td><td>Crea equipos nuevos, cadenas, calibraciones, controles y usa herramientas.</td><td>Eliminar datos, gestionar usuarios o modificar administrativamente equipos existentes.</td></tr>
          <tr><td>Supervisor</td><td>Consulta balanzas, historial, reportes, herramientas y fotos.</td><td>Crear, editar o borrar registros operativos.</td></tr>
          <tr><td>Consulta</td><td>Acceso basico de lectura segun configuracion.</td><td>Operar calibraciones o administrar datos.</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>3. Ingreso y controles iniciales</h2>
      <ol>
        <li>Confirmar que la cabecera muestre la version esperada luego de cada deploy.</li>
        <li>Confirmar que el estado de base indique <code>DB: Supabase</code> para trabajo multi-dispositivo.</li>
        <li>Si se ve <code>DB: Local</code>, no asumir sincronizacion remota hasta resolver conectividad/configuracion.</li>
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
      <div class="callout ok">Los tecnicos pueden crear equipos, pero la edicion administrativa de equipos existentes queda reservada a admin por RLS.</div>
    </section>

    <section>
      <h2>6. Gestion de cadenas patron</h2>
      <p>Las cadenas se reutilizan en calibraciones. Mantener <code>kg/m</code>, largo, peso total y planta correctamente cargados evita errores de span.</p>
      <ul>
        <li>Si hay cadenas de la misma planta que la balanza, la app prioriza esas cadenas.</li>
        <li>Si una planta no tiene cadenas, se habilita fallback a todas las cadenas disponibles.</li>
        <li>Los eventos historicos conservan el nombre y kg/m usados aunque luego se edite la cadena.</li>
      </ul>
    </section>

    <section>
      <h2>7. Calibraciones y controles preventivos</h2>
      <p>El wizard se divide en ocho pasos: eleccion, inspeccion, cero, parametros, cadena, acumulado, material real y cierre. El cierre exige cargar explicitamente el <strong>Factor final</strong> que queda en el controlador.</p>
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
      </ul>
    </section>

    <section>
      <h2>9. Supabase, RLS y datos</h2>
      <p>La app usa Supabase para equipos, cadenas, eventos, perfiles y fotos. RLS es la capa que impide acciones fuera del rol.</p>
      <ul>
        <li>No usar service role en el navegador.</li>
        <li>Si aparece un error RLS, revisar tabla, accion y rol antes de cambiar policies.</li>
        <li>La Edge Function de usuarios usa <code>SERVICE_ROLE_KEY</code>.</li>
        <li>Google Sheets es salida operativa: <code>Eventos</code>, <code>Equipos</code>, <code>Dashboard</code>, <code>Alertas</code> y <code>Configuracion</code> se actualizan via Apps Script.</li>
        <li>Los borrados de eventos/equipos se notifican a Sheets mediante <code>sync-sheets-event</code>; si Sheets falla, Supabase queda como fuente de verdad y la app informa el error.</li>
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
        <li>Eliminar una balanza puede eliminar eventos asociados por cascada en Supabase.</li>
        <li>Eliminar una balanza o evento tambien intenta limpiar Google Sheets y reconstruir su dashboard externo.</li>
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
        <li>Cadenas tienen kg/m verificado.</li>
        <li>Eventos recientes tienen Factor final confirmado y guardado.</li>
        <li>Sheets muestra codigos cortos de equipo, dashboard y alertas actualizadas.</li>
        <li>Eventos fuera de tolerancia tienen seguimiento.</li>
        <li>Reportes importantes fueron impresos o guardados.</li>
        <li>No hay material admin publicado en rutas publicas.</li>
      </ol>
    </section>
  </main>
</body>
</html>`
}

function buildCalibrationReportHtml(item: CalibrationEvent, equipmentItem?: Equipment) {
  const materialSummary = getEventMaterialOutcome(item)
  const status = materialSummary.status
  const equipmentLabel = equipmentItem
    ? `${equipmentItem.plant} / ${equipmentItem.line} / ${equipmentItem.beltCode} / ${equipmentItem.scaleName}`
    : 'Equipo no encontrado'
  const materialPassRows = materialSummary.passes
    .map(
      (pass) => `<tr>
        <td>${reportValue(`Pasada ${pass.index}`)}</td>
        <td>${reportValue(`${pass.externalWeightKg} kg`)}</td>
        <td>${reportValue(`${pass.beltWeightKg} kg`)}</td>
        <td>${reportValue(pass.factorUsed || '-')}</td>
        <td>${reportValue(`${pass.errorPct} %`)}</td>
        <td>${reportValue(materialSummary.finalPass?.index === pass.index ? 'Final' : pass.index === 1 ? 'Control inicial' : 'Post-ajuste')}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte ${reportValue(item.id)}</title>
  <style>
    :root { font-family: Arial, sans-serif; color: #0c0b11; }
    body { margin: 0; padding: 28px; background: #f7f5ef; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 30px; text-transform: uppercase; letter-spacing: -0.02em; }
    h2 { margin-top: 22px; padding-bottom: 6px; border-bottom: 2px solid #ff5949; font-size: 18px; }
    .header { display: flex; justify-content: space-between; gap: 18px; padding-bottom: 18px; border-bottom: 3px solid #0c0b11; }
    .badge { display: inline-block; padding: 7px 10px; background: #ff5949; color: #0c0b11; font-weight: 700; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
    .grid div { min-height: 54px; padding: 10px; border: 1px solid #d4d0c6; background: #fff; }
    table { width: 100%; margin-top: 12px; border-collapse: collapse; background: #fff; }
    th, td { padding: 9px; border: 1px solid #d4d0c6; text-align: left; font-size: 13px; }
    th { background: #0c0b11; color: #f7f5ef; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
    span { display: block; color: #5c575c; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    strong { display: block; margin-top: 4px; font-size: 14px; }
    .notes { margin-top: 12px; padding: 12px; border: 1px solid #d4d0c6; background: #fff; white-space: pre-wrap; }
    @media print { body { padding: 0; background: #fff; } .no-print { display: none; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">Imprimir</button>
  <section class="header">
    <div>
      <span>Reporte de calibracion</span>
      <h1>${reportValue(item.id)}</h1>
      <p>${reportValue(equipmentLabel)}</p>
    </div>
    <div><span class="badge">${reportValue(status)}</span></div>
  </section>
  <h2>Resumen</h2>
  <div class="grid">
    ${reportRow('Fecha evento', formatDateTime(item.eventDate))}
    ${reportRow('Tecnico', item.approval.technician)}
    ${reportRow('Tolerancia', `${item.tolerancePercent} %`)}
    ${reportRow('Error cadena', `${item.chainSpan.avgErrorPct} %`)}
    ${reportRow('Error acumulado', `${item.accumulatedCheck.errorPct || 0} %`)}
    ${reportRow('Error material final', `${materialSummary.errorPct} %`)}
    ${reportRow('Resultado', materialSummary.status)}
    ${reportRow('Ajuste aplicado', materialSummary.adjustmentApplied ? 'Si' : 'No')}
    ${reportRow('Pasadas', materialSummary.passes.length)}
  </div>
  <h2>Inspeccion y cero</h2>
  <div class="grid">
    ${reportRow('Banda vacia', item.precheck.beltEmpty ? 'Si' : 'No')}
    ${reportRow('Banda limpia', item.precheck.beltClean ? 'Si' : 'No')}
    ${reportRow('Sin acumulacion', item.precheck.noMaterialBuildup ? 'Si' : 'No')}
    ${reportRow('Rolos y puente OK', item.precheck.idlersOk ? 'Si' : 'No')}
    ${reportRow('Estructura OK', item.precheck.structureOk ? 'Si' : 'No')}
    ${reportRow('Sensor velocidad OK', item.precheck.speedSensorOk ? 'Si' : 'No')}
    ${reportRow('Cero realizado', item.zeroCheck.completed ? 'Si' : 'No')}
    ${reportRow('Unidad cero', item.zeroCheck.displayUnit)}
    ${reportRow('Cero ajustado', item.zeroCheck.adjusted ? 'Si' : 'No')}
  </div>
  <h2>Parametros y span</h2>
  <div class="grid">
    ${reportRow('Factor calibracion', item.parameterSnapshot.calibrationFactor)}
    ${reportRow('Cero', item.parameterSnapshot.zeroValue)}
    ${reportRow('Span', item.parameterSnapshot.spanValue)}
    ${reportRow('Filtro', item.parameterSnapshot.filterValue)}
    ${reportRow('Puente', `${item.parameterSnapshot.bridgeLengthM} m`)}
    ${reportRow('Velocidad', `${item.parameterSnapshot.nominalSpeedMs} m/s`)}
    ${reportRow('Cadena', item.chainSpan.chainName)}
    ${reportRow('Kg/m cadena', item.chainSpan.chainLinearKgM)}
    ${reportRow('Lectura prom.', item.chainSpan.avgControllerReadingKgM)}
  </div>
  <h2>Pasadas con material certificado</h2>
  <table>
    <thead><tr><th>Pasada</th><th>Peso certificado</th><th>Controlador</th><th>Factor usado</th><th>Error</th><th>Rol</th></tr></thead>
    <tbody>${materialPassRows}</tbody>
  </table>
  <h2>Acumulado, material real y cierre</h2>
  <div class="grid">
    ${reportRow('Caudal esperado', `${item.accumulatedCheck.expectedFlowTph} tn/h`)}
    ${reportRow('Tiempo prueba', `${item.accumulatedCheck.testMinutes} min`)}
    ${reportRow('Total esperado', item.accumulatedCheck.expectedTotal)}
    ${reportRow('Total indicado', item.accumulatedCheck.indicatedTotal)}
    ${reportRow('Peso externo final', `${materialSummary.finalPass?.externalWeightKg ?? item.materialValidation.externalWeightKg} kg`)}
    ${reportRow('Peso balanza final', `${materialSummary.finalPass?.beltWeightKg ?? item.materialValidation.beltWeightKg} kg`)}
    ${reportRow('Factor anterior', item.finalAdjustment.factorBefore)}
    ${reportRow('Factor final', item.finalAdjustment.factorAfter)}
    ${reportRow('Aprobado', formatDateTime(item.approval.approvedAt))}
  </div>
  <h2>Notas</h2>
  <div class="notes"><strong>Diagnostico</strong><br />${reportValue(item.diagnosis || '-')}</div>
  <div class="notes"><strong>Observaciones</strong><br />${reportValue(item.notes || '-')}</div>
</body>
</html>`
}

function buildSheetsEventPayload(item: CalibrationEvent, equipmentItem: Equipment): SheetsEventPayload {
  const materialSummary = getEventMaterialOutcome(item)
  const finalPass = materialSummary.finalPass
  const inspectionOk =
    item.precheck.beltEmpty &&
    item.precheck.beltClean &&
    item.precheck.noMaterialBuildup &&
    item.precheck.idlersOk &&
    item.precheck.structureOk &&
    item.precheck.speedSensorOk
  const syncedAt = formatSheetsDateTime(new Date())

  return {
    event: {
      id: item.id,
      eventDate: formatSheetsDateTime(item.eventDate),
      equipmentId: item.equipmentId,
      plant: equipmentItem.plant,
      line: equipmentItem.line,
      beltCode: equipmentItem.beltCode,
      scaleName: equipmentItem.scaleName,
      result: materialSummary.status,
      finalErrorPct: round(materialSummary.errorPct),
      tolerancePct: item.tolerancePercent,
      withinTolerance: statusClass(materialSummary.status) !== 'danger',
      finalExternalWeightKg: finalPass?.externalWeightKg || item.materialValidation.externalWeightKg || 0,
      finalBeltWeightKg: finalPass?.beltWeightKg || item.materialValidation.beltWeightKg || 0,
      finalFactor: item.finalAdjustment.factorAfter,
      inspectionOk,
      technician: item.approval.technician,
      diagnosisSummary: item.diagnosis,
      notesSummary: item.notes,
      syncedAt,
    },
  }
}

function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [equipment, setEquipment] = useState<Equipment[]>(() => loadEquipment())
  const [chains, setChains] = useState<Chain[]>(() => loadChains())
  const [events, setEvents] = useState<CalibrationEvent[]>(() => loadEvents())
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('')
  const [selectedChainId, setSelectedChainId] = useState('')
  const [equipmentForm, setEquipmentForm] = useState(defaultEquipmentForm)
  const [chainForm, setChainForm] = useState(defaultChainForm)
  const [eventForm, setEventForm] = useState(defaultEventForm)
  const [calibrationStep, setCalibrationStep] = useState(0)
  const [materialPassCount, setMaterialPassCount] = useState(1)
  const [hasEventDraft, setHasEventDraft] = useState(() => Boolean(localStorage.getItem(CALIBRATION_DRAFT_KEY)))
  const [equipmentSubmitAttempted, setEquipmentSubmitAttempted] = useState(false)
  const [chainSubmitAttempted, setChainSubmitAttempted] = useState(false)
  const [eventSubmitAttempted, setEventSubmitAttempted] = useState(false)
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
  const [syncNotice, setSyncNotice] = useState('')
  const [loadingData, setLoadingData] = useState(true)
  const [dataSource, setDataSource] = useState<'local' | 'supabase'>('local')
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null)
  const [navPulseScreen, setNavPulseScreen] = useState<Screen | null>(null)
  const equipmentFormRef = useRef<HTMLDivElement | null>(null)
  const didMountScrollRef = useRef(false)
  const navPulseTimeoutRef = useRef<number | null>(null)
  const calibrationStepAnchorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [userForm, setUserForm] = useState({ email: '', username: '', password: '', role: 'viewer' as UserRole })
  const [userManagementLoading, setUserManagementLoading] = useState(false)

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
    let cancelled = false

    async function initializeAuth() {
      if (!supabase) {
        setAuthLoading(false)
        return
      }

      const { data } = await supabase.auth.getSession()
      if (!cancelled) {
        await loadAuthenticatedUser(data.session)
        setAuthLoading(false)
      }
    }

    void initializeAuth()

    const { data } = supabase?.auth.onAuthStateChange((_event, session) => {
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
    if (!syncNotice) return
    const tone: ToastTone = /^error|fallo/i.test(syncNotice)
      ? 'error'
      : /pendiente|incompleta/i.test(syncNotice)
        ? 'warning'
        : /ok|sincronizado|guardada|guardado|cargados/i.test(syncNotice)
          ? 'success'
          : 'info'

    const id = generateId()
    setToasts((current) => [...current, { id, message: syncNotice, tone }])
    const exitTimeoutId = window.setTimeout(() => {
      setToasts((current) => current.map((item) => (item.id === id ? { ...item, exiting: true } : item)))
    }, 3800)
    const removeTimeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
      setSyncNotice('')
    }, 4200)

    return () => {
      window.clearTimeout(exitTimeoutId)
      window.clearTimeout(removeTimeoutId)
    }
  }, [syncNotice])

  useEffect(() => {
    let cancelled = false

    async function initializeData() {
      try {
        const result = await loadAppData()
        if (cancelled) return
        setEquipment(result.equipment)
        setChains(result.chains || [])
        setEvents(result.events)
        setDataSource(result.source)
        if (!isSupabaseConfigured) {
          setSyncNotice('Supabase no está configurado. La app quedó en modo local.')
        }
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'No se pudo cargar la base remota.'
        setDataSource('local')
        setSyncNotice(`No se pudo conectar a Supabase: ${message}`)
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
      void loadManagedUsers()
    }
  }, [screen, canManageUsers])

  useEffect(() => {
    if (!currentUser) return
    if (!didMountScrollRef.current) {
      didMountScrollRef.current = true
      return
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isMobile = window.matchMedia('(max-width: 640px)').matches
    window.requestAnimationFrame(() => {
      if (isMobile && screen !== 'nueva') {
        const target = document.querySelector('#main-content .screen-banner') || document.querySelector('#main-content .screen-shell')
        target?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
        return
      }

      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
    })
  }, [screen, currentUser])

  useEffect(() => {
    if (screen !== 'nueva') return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isMobile = window.matchMedia('(max-width: 640px)').matches
    window.requestAnimationFrame(() => {
      const target = isMobile ? calibrationStepAnchorRef.current : document.querySelector('.wizard-panel')
      target?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
    })
  }, [screen, calibrationStep])

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

  const materialFactorBefore = toNumber(eventForm.provisionalFactor) || toNumber(eventForm.calibrationFactor) || 0

  const materialPasses = useMemo<MaterialPass[]>(() => {
    const rawPasses = [
      {
        index: 1,
        externalWeightKg: toNumber(eventForm.materialPass1ExternalWeightKg || eventForm.externalWeightKg) || 0,
        beltWeightKg: toNumber(eventForm.materialPass1BeltWeightKg || eventForm.beltWeightKg) || 0,
        factorUsed: toNumber(eventForm.materialPass1Factor) || materialFactorBefore,
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
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const withoutHistory = equipmentWithLastEvent.filter(({ lastEvent }) => !lastEvent).length
    const overdue = equipmentWithLastEvent.filter(({ maintenance }) => maintenance.status === 'overdue').length
    const dueSoon = equipmentWithLastEvent.filter(({ maintenance }) => maintenance.status === 'due_soon').length
    const upToDate = equipmentWithLastEvent.filter(({ maintenance }) => maintenance.status === 'ok').length
    const conform = events.filter((item) => getEventMaterialOutcome(item).outcome === 'control_conforme').length
    const calibrated = events.filter((item) => getEventMaterialOutcome(item).outcome === 'calibrada_ajustada').length
    const monthEvents = events.filter((item) => item.eventDate.slice(0, 7) === currentMonth).length
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

  const zeroDrift = useMemo(() => {
    const before = toNumber(eventForm.zeroBeforeValue)
    const after = toNumber(eventForm.zeroAfterValue)
    if (!Number.isFinite(before) || !Number.isFinite(after)) return null
    return after - before
  }, [eventForm.zeroBeforeValue, eventForm.zeroAfterValue])

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
    const issues: string[] = []
    if (!selectedEquipment) issues.push('Seleccioná una balanza.')
    if (!precheckPassed) issues.push('Completá toda la inspeccion previa.')
    if (!eventForm.zeroCompleted) issues.push('Debés registrar el cero antes de calibrar.')
    if (!currentUser?.username.trim()) issues.push('Falta usuario responsable logueado.')
    if (requiresFullCalibration) {
      if (!(toNumber(eventForm.chainLinearKgM) > 0)) issues.push('Falta el kg/m de cadena.')
      if (!(toNumber(eventForm.avgControllerReadingKgM) > 0)) issues.push('Falta el promedio de lectura del controlador.')
      if (!(toNumber(eventForm.expectedFlowTph) > 0)) issues.push('Falta el caudal esperado.')
      if (!(toNumber(eventForm.accumulatedTestMinutes) > 0)) issues.push('Falta el tiempo de prueba.')
      if (!(toNumber(eventForm.accumulatedIndicatedTotal) > 0)) issues.push('Falta el acumulado indicado.')
    }
    if (!finalMaterialPass) issues.push('Falta una pasada completa con material real.')
    if (completeMaterialPasses.some((pass) => pass.index > 1 && !(pass.factorUsed > 0))) issues.push('Falta el factor usado en una verificacion post-ajuste.')
    if (materialAdjustmentApplied && completeMaterialPasses.length < 2) issues.push('Si se ajusta el factor, falta una pasada posterior de verificacion.')
    if (!(toNumber(eventForm.finalFactor) > 0)) issues.push('Falta el factor de calibracion final.')
    return issues
  }, [completeMaterialPasses, currentUser, eventForm, finalMaterialPass, materialAdjustmentApplied, materialFactorBefore, precheckPassed, requiresFullCalibration, selectedEquipment, suggestedFactor])

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
        Boolean(selectedEquipment && eventForm.eventDate && toNumber(eventForm.tolerancePercent) > 0),
        precheckPassed,
        eventForm.zeroCompleted,
        Boolean(toNumber(eventForm.calibrationFactor) || toNumber(eventForm.zeroValue) || toNumber(eventForm.spanValue) || eventForm.extraParameters.trim()),
        !requiresFullCalibration || (toNumber(eventForm.chainLinearKgM) > 0 && toNumber(eventForm.avgControllerReadingKgM) > 0),
        !requiresFullCalibration || (toNumber(eventForm.expectedFlowTph) > 0 && toNumber(eventForm.accumulatedTestMinutes) > 0 && toNumber(eventForm.accumulatedIndicatedTotal) > 0),
        Boolean(finalMaterialPass),
        eventBlockingIssues.length === 0,
      ][index]
      const warning = index === 4 || index === 5 ? requiresFullCalibration && !fullCalibrationReady : false
      return { step, complete, warning }
    })
  }, [eventBlockingIssues.length, eventForm, finalMaterialPass, precheckPassed, requiresFullCalibration, selectedEquipment])

  const wizardReadinessPercent = Math.round((calibrationStepStates.filter(({ complete }) => complete).length / calibrationSteps.length) * 100)
  const wizardStepCue = [
    selectedEquipment ? `Equipo activo: ${selectedEquipment.beltCode} / ${selectedEquipment.scaleName}. ${selectedEquipmentMaintenance?.detail || ''}` : 'Selecciona una balanza para iniciar el circuito.',
    precheckPassed ? 'Inspeccion completa. El equipo esta en condicion de medicion.' : 'Completa los seis checks mecanicos antes de avanzar.',
    eventForm.zeroCompleted ? 'Cero registrado. Continua con la foto de parametros.' : 'Registra el cero del controlador antes de medir.',
    eventForm.calibrationFactor || eventForm.zeroValue || eventForm.spanValue || eventForm.extraParameters ? 'Parametros capturados para trazabilidad.' : 'Deja una foto tecnica de los parametros visibles.',
    !requiresFullCalibration ? 'Cadena no requerida para este control preventivo.' : toNumber(eventForm.chainLinearKgM) > 0 && toNumber(eventForm.avgControllerReadingKgM) > 0 ? 'Span con cadena registrado.' : 'Carga kg/m de cadena y promedio del controlador.',
    !requiresFullCalibration ? 'Acumulado no requerido para este control preventivo.' : toNumber(eventForm.expectedFlowTph) > 0 && toNumber(eventForm.accumulatedTestMinutes) > 0 && toNumber(eventForm.accumulatedIndicatedTotal) > 0 ? 'Acumulado registrado.' : 'Completa caudal, tiempo y acumulado indicado.',
    finalMaterialPass ? `Ultima pasada: ${round(materialErrorPct)} % de error.` : 'Carga al menos una pasada completa con material real.',
    eventBlockingIssues.length === 0 ? 'Evento listo para guardar con factor final confirmado.' : eventBlockingIssues[0],
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
    return Array.from(new Set(events.map((item) => item.eventDate.slice(0, 7)).filter(Boolean))).sort().reverse()
  }, [events])

  const filteredEvents = useMemo(() => {
    return events
      .filter((item) => {
        const matchesEquipment = historyEquipmentId === 'todos' || item.equipmentId === historyEquipmentId
        const materialSummary = getEventMaterialOutcome(item)
        const statusKey = statusClass(materialSummary.status)
        const matchesStatus = historyStatusFilter === 'todos' || statusKey === historyStatusFilter
        const matchesMonth = historyMonthFilter === 'todos' || item.eventDate.slice(0, 7) === historyMonthFilter
        return matchesEquipment && matchesStatus && matchesMonth
      })
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
  }, [events, historyEquipmentId, historyMonthFilter, historyStatusFilter])

  function resetEventForm() {
    setEventForm({ ...defaultEventForm, eventDate: nowLocalValue() })
    setCalibrationStep(0)
    setMaterialPassCount(1)
    setEventSubmitAttempted(false)
  }

  function saveEventDraft() {
    const draft: EventDraft = {
      eventForm,
      selectedEquipmentId,
      selectedChainId,
      materialPassCount,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(CALIBRATION_DRAFT_KEY, JSON.stringify(draft))
    setHasEventDraft(true)
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
      setSyncNotice(`Borrador recuperado (${formatDateTime(draft.savedAt)}).`)
    } catch {
      localStorage.removeItem(CALIBRATION_DRAFT_KEY)
      setHasEventDraft(false)
      setSyncNotice('El borrador local estaba dañado y fue descartado.')
    }
  }

  function clearEventDraft(showNotice = true) {
    localStorage.removeItem(CALIBRATION_DRAFT_KEY)
    setHasEventDraft(false)
    if (showNotice) setSyncNotice('Borrador local descartado.')
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
    reportWindow.document.write(buildCalibrationReportHtml(item, equipmentItem))
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

  async function loadAuthenticatedUser(session: Session | null) {
    if (!session?.user || !supabase) {
      setCurrentUser(null)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('username, role')
      .eq('id', session.user.id)
      .single()

    if (error || !data) {
      setCurrentUser(null)
      setSyncNotice('Tu usuario no tiene perfil asignado. Contactá a un administrador.')
      return
    }

    setCurrentUser({
      id: session.user.id,
      email: session.user.email || '',
      username: data.username || session.user.email || 'Usuario',
      role: data.role as UserRole,
    })
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    if (!supabase) {
      setSyncNotice('Supabase Auth no está configurado.')
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    })

    if (error) {
      setSyncNotice(`Error de acceso: ${error.message}`)
      return
    }

    await loadAuthenticatedUser(data.session)
    setLoginEmail('')
    setLoginPassword('')
    setScreen('dashboard')
    setSyncNotice('Sesion iniciada.')
  }

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut()
    }
    setCurrentUser(null)
    setScreen('dashboard')
    setSyncNotice('Sesion cerrada.')
  }

  function primeEventForm(item: Equipment) {
    const plantChain = chains.find((chain) => chain.plant.trim().toLowerCase() === item.plant.trim().toLowerCase())
    if (plantChain) {
      setSelectedChainId(plantChain.id)
    }
    setSelectedEquipmentId(item.id)
    setEventForm({
      ...defaultEventForm,
      eventDate: nowLocalValue(),
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
    window.setTimeout(() => equipmentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
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
          ? `Balanza ${editingEquipmentId ? 'actualizada' : 'guardada'} en Supabase.`
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
      setSyncNotice(result.source === 'supabase' ? 'Cadena guardada en Supabase.' : 'Cadena guardada solo localmente.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la cadena.'
      setSyncNotice(`Error al guardar cadena: ${message}`)
    }
  }

  async function handleEventSubmit(event: FormEvent) {
    event.preventDefault()
    setEventSubmitAttempted(true)
    if (eventBlockingIssues.length > 0) return
    if (!selectedEquipment) return

    const factorBeforeAdjustment = materialFactorBefore
    const factorAfterAdjustment = toNumber(eventForm.finalFactor)

    const record: CalibrationEvent = {
      id: generateEventCode(eventForm.eventDate, events),
      equipmentId: selectedEquipment.id,
      createdAt: new Date().toISOString(),
      eventDate: new Date(eventForm.eventDate).toISOString(),
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
        afterValue: eventForm.zeroAfterValue.trim(),
        adjusted: eventForm.zeroAdjusted,
        notes: eventForm.zeroNotes.trim(),
      },
      parameterSnapshot: {
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
        approvedAt: new Date(eventForm.eventDate).toISOString(),
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

    try {
      const result = await saveCalibrationEventRecord(record)
      setEvents((current) => [record, ...current.filter((item) => item.id !== record.id)])
      clearEventDraft(false)
      resetEventForm()
      setScreen('historial')
      setDataSource(result.source)
      setSyncNotice(
        result.source === 'supabase'
          ? `Evento ${record.id} guardado en Supabase.`
          : `Evento ${record.id} guardado solo localmente.`,
      )

      if (result.source === 'supabase') {
        try {
          const payload = buildSheetsEventPayload(record, selectedEquipment)
          const sheetsResult = await syncCalibrationEventToSheets(payload)
          const syncValues = {
            syncStatus: 'sincronizado' as const,
            syncMessage: sheetsResult.message,
            syncedAt: new Date().toISOString(),
          }
          await updateCalibrationEventSync(record.id, syncValues)
          setEvents((current) => current.map((item) => (item.id === record.id ? { ...item, ...syncValues } : item)))
          setSyncNotice(`Evento ${record.id} guardado y exportado a Google Sheets.`)
        } catch (syncError) {
          const syncMessage = syncError instanceof Error ? syncError.message : 'No se pudo exportar a Google Sheets.'
          const syncValues = {
            syncStatus: 'error' as const,
            syncMessage,
            syncedAt: new Date().toISOString(),
          }
          try {
            await updateCalibrationEventSync(record.id, syncValues)
          } catch {
            // El evento ya quedo guardado; si falla el marcado de sync, se informa el error original de Sheets.
          }
          setEvents((current) => current.map((item) => (item.id === record.id ? { ...item, ...syncValues } : item)))
          setSyncNotice(`Evento ${record.id} guardado. Error al exportar a Sheets: ${syncMessage}`)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el evento.'
      setSyncNotice(`Error al guardar evento: ${message}`)
      return
    }

  }

  async function handleDeleteEvent(eventId: string) {
    const targetEvent = events.find((item) => item.id === eventId)
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
          if (result.source === 'supabase' && targetEvent) {
            try {
              await syncCalibrationEventToSheets(buildDeleteEventSheetsPayload(eventId, targetEvent.equipmentId))
              setSyncNotice(`Evento ${eventId} eliminado y actualizado en Google Sheets.`)
            } catch (syncError) {
              const syncMessage = syncError instanceof Error ? syncError.message : 'No se pudo actualizar Google Sheets.'
              setSyncNotice(`Evento ${eventId} eliminado. Error al actualizar Sheets: ${syncMessage}`)
            }
          } else {
            setSyncNotice(`Evento ${eventId} eliminado.`)
          }
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
          if (result.source === 'supabase') {
            try {
              await syncCalibrationEventToSheets(buildDeleteEquipmentSheetsPayload(item.id))
              setSyncNotice(`Balanza ${item.scaleName} dada de baja y actualizada en Google Sheets.`)
            } catch (syncError) {
              const syncMessage = syncError instanceof Error ? syncError.message : 'No se pudo actualizar Google Sheets.'
              setSyncNotice(`Balanza ${item.scaleName} dada de baja. Error al actualizar Sheets: ${syncMessage}`)
            }
          } else {
            setSyncNotice(`Balanza ${item.scaleName} dada de baja.`)
          }
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
      detail: 'Los eventos historicos conservaran el nombre y kg/m registrados. Esta accion no se puede deshacer.',
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

  if (authLoading) {
    return (
      <div className="app-shell auth-shell">
        <section className="auth-card">
          <div className="brand-kicker">Acceso protegido</div>
          <h1>CalibraCinta</h1>
          <p>Cargando sesión...</p>
        </section>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="public-shell">
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
            <div className="login-status"><span></span> Supabase online</div>
            <div className="brand-kicker">Acceso protegido</div>
            <h2>Ingresar</h2>
            <p>Operadores habilitados pueden cargar controles, revisar historial y emitir reportes de campo.</p>
            <form className="stack" onSubmit={handleLogin}>
              <Field label="Email" type="email" value={loginEmail} onChange={setLoginEmail} />
              <Field label="Contraseña" type="password" value={loginPassword} onChange={setLoginPassword} />
              <button className="primary" type="submit">Ingresar</button>
            </form>
            <div className="login-footnote">Roles: admin, tecnico, supervisor y consulta.</div>
          </div>
        </section>

        <section className="public-grid" aria-label="Modulos principales">
          <div className="card"><span className="section-kicker">Campo</span><h2>Flujo guiado</h2><p className="hint">Validaciones paso a paso para reducir omisiones durante la intervencion.</p></div>
          <div className="card"><span className="section-kicker">Trazabilidad</span><h2>Eventos auditables</h2><p className="hint">Factores, errores, tecnico responsable y diagnostico quedan listos para reporte.</p></div>
          <div className="card"><span className="section-kicker">Operacion</span><h2>Estado del parque</h2><p className="hint">KPIs, semaforos y filtros para priorizar equipos con accion recomendada.</p></div>
        </section>
      </div>
    )
  }

  const manualHref = '/manual/tecnico/'

  const handleActionPulse = (event: MouseEvent<HTMLDivElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement | HTMLAnchorElement>('.primary, .secondary')
      : null
    if (!target || target.classList.contains('nav-item') || target.classList.contains('theme-toggle')) return
    if (target instanceof HTMLButtonElement && (target.disabled || target.type === 'submit')) return

    target.classList.remove('action-pulse')
    void target.offsetWidth
    target.classList.add('action-pulse')
    window.setTimeout(() => target.classList.remove('action-pulse'), 780)
  }

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
        </div>
        <div className="topbar-actions">
          <div className="chip version-chip">{APP_VERSION}</div>
          <div className="chip">{currentUser.username} · {currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'tecnico' ? 'Tecnico' : currentUser.role === 'supervisor' ? 'Supervisor' : 'Consulta'}</div>
          <div className={`chip ${dataSource === 'supabase' ? 'sincronizado' : 'pendiente'}`}>
            {dataSource === 'supabase' ? 'DB: Supabase' : 'DB: Local'}
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
          <button className="secondary small" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <section className="hero-strip">
        <div className="hero-panel hero-panel-primary">
          <span>Base activa</span>
          <strong>{dataSource === 'supabase' ? 'Supabase Online' : 'Modo Local'}</strong>
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

      <section className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone} ${toast.exiting ? 'toast-exiting' : ''}`}>
            <span className="toast-dot" />
            <p>{toast.message}</p>
            <span className="toast-progress" />
          </div>
        ))}
      </section>

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
                  <div><span>Fuente</span><strong>{dataSource === 'supabase' ? 'Supabase' : 'Local'}</strong></div>
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
                  <Field label="Ancho cinta (mm)" type="number" value={equipmentForm.beltWidthMm} onChange={(value) => setEquipmentForm((current) => ({ ...current, beltWidthMm: value }))} />
                  <Field label="Largo cinta (m)" type="number" value={equipmentForm.beltLengthM} onChange={(value) => setEquipmentForm((current) => ({ ...current, beltLengthM: value }))} />
                  <Field label="Capacidad nominal (t/h)" type="number" value={equipmentForm.nominalCapacityTph} onChange={(value) => setEquipmentForm((current) => ({ ...current, nominalCapacityTph: value }))} />
                  <Field label="Distancia puente pesaje (m)" type="number" value={equipmentForm.bridgeLengthM} onChange={(value) => setEquipmentForm((current) => ({ ...current, bridgeLengthM: value }))} />
                  <Field label="Velocidad nominal (m/s)" type="number" value={equipmentForm.nominalSpeedMs} onChange={(value) => setEquipmentForm((current) => ({ ...current, nominalSpeedMs: value }))} />
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
                  <div>
                    <label className="label">Unidad de acumulado</label>
                    <select className="input" value={equipmentForm.totalizerUnit} onChange={(e) => setEquipmentForm((current) => ({ ...current, totalizerUnit: e.target.value }))}>
                      <option value="tn">tn</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>
                  <Field label="Diametro rolo RPM (mm)" type="number" value={equipmentForm.rpmRollDiameterMm} onChange={(value) => setEquipmentForm((current) => ({ ...current, rpmRollDiameterMm: value }))} />
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
                  <Field label="Peso por metro (kg/m)" type="number" value={chainForm.linearWeightKgM} onChange={(value) => setChainForm((current) => ({ ...current, linearWeightKgM: value }))} />
                  <Field label="Largo total (m)" type="number" value={chainForm.totalLengthM} onChange={(value) => setChainForm((current) => ({ ...current, totalLengthM: value }))} />
                  <Field label="Peso total (kg)" type="number" value={chainForm.totalWeightKg} onChange={(value) => setChainForm((current) => ({ ...current, totalWeightKg: value }))} />
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
                      <strong>{item.linearWeightKgM} kg/m</strong>
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
                  {hasEventDraft && <button className="secondary small" type="button" onClick={loadEventDraft}><RotateCcw className="action-icon" aria-hidden="true" />Recuperar borrador</button>}
                  <button className="secondary small" type="button" onClick={saveEventDraft}><Save className="action-icon" aria-hidden="true" />Guardar borrador</button>
                </div>
              </div>
              <div className="wizard-progress" aria-hidden="true">
                <span style={{ width: `${((calibrationStep + 1) / calibrationSteps.length) * 100}%` }} />
              </div>
              <div className="wizard-steps" aria-label="Progreso de calibracion">
                {calibrationStepStates.map(({ step, complete, warning }, index) => (
                  <button
                    className={`wizard-step ${index === calibrationStep ? 'active' : complete ? 'complete' : warning ? 'warning' : ''}`}
                    key={step}
                    type="button"
                    onClick={() => setCalibrationStep(index)}
                    aria-current={index === calibrationStep ? 'step' : undefined}
                    title={complete ? 'Completo' : warning ? 'Con advertencia' : 'Pendiente'}
                  >
                    <span>{index + 1}</span>
                    {step}
                    <small>{complete ? 'Completo' : warning ? 'Advertencia' : 'Pendiente'}</small>
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
              </div>
            </div>
            <div ref={calibrationStepAnchorRef} className="calibration-step-anchor" aria-hidden="true" />

            {calibrationStep === 0 && <>
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
                    status={selectedEquipmentMaintenance?.label || selectedEquipmentStatus}
                    onOpen={() => openEquipmentPhoto(selectedEquipment)}
                  />
                  <div className="grid four">
                    <Metric label="Puente" value={`${selectedEquipment.bridgeLengthM} m`} />
                    <Metric label="Velocidad" value={`${selectedEquipment.nominalSpeedMs} m/s`} />
                    <Metric label="Capacidad" value={`${selectedEquipment.nominalCapacityTph} t/h`} />
                    <Metric label="Origen velocidad" value={selectedEquipment.speedSource} />
                    <Metric label="Frecuencia control" value={`${selectedEquipment.checkIntervalDays || DEFAULT_CHECK_INTERVAL_DAYS} dias`} />
                    <Metric label="Dias restantes" value={selectedEquipmentMaintenance?.daysText || '-'} />
                  </div>
                </div>
              )}
            </div>

            <div className="card">
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
              >
                <option value="">Seleccionar cadena</option>
                {availableChains.map((item) => (
                  <option key={item.id} value={item.id}>{item.plant} / {item.name}</option>
                ))}
              </select>
              {usingAllChainsFallback && <p className="hint compact-top">No hay cadenas para esta planta. Se muestran todas las disponibles.</p>}
              {selectedChain && (
                <div className="grid three compact-top">
                  <Metric label="Cadena" value={selectedChain.name} />
                  <Metric label="kg/m" value={String(selectedChain.linearWeightKgM)} />
                  <Metric label="Peso total" value={`${selectedChain.totalWeightKg} kg`} />
                </div>
              )}
            </div>
            </>}

            <form className="stack" onSubmit={handleEventSubmit}>
              {calibrationStep === 0 && <div className="card">
                <div className="card-tag">Paso 1</div>
                <h2>Eleccion de balanza/cinta</h2>
                <div className="grid two">
                  <Field label="Fecha y hora" type="datetime-local" value={eventForm.eventDate} onChange={(value) => setEventForm((current) => ({ ...current, eventDate: value }))} />
                  <Field label="Tolerancia (%)" type="number" value={eventForm.tolerancePercent} onChange={(value) => setEventForm((current) => ({ ...current, tolerancePercent: value }))} />
                </div>
              </div>}

              {calibrationStep === 1 && <CollapsibleCard title="Paso 2 · Inspeccion previa" hint="Checks obligatorios antes de calibrar." defaultOpen>
                <div className="card-tag">Paso 2</div>
                <h2>Inspeccion previa</h2>
                <p className="hint">Obligatoria antes de calibrar. Si algo no cumple, primero hay que corregirlo.</p>
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

              {calibrationStep === 2 && <CollapsibleCard title="Paso 3 · Cero" hint="Registro de cero y deriva visible." defaultOpen>
                <div className="card-tag">Paso 3</div>
                <h2>Cero</h2>
                <p className="hint">Siempre se realiza antes de calibrar. Si el controlador no muestra valor, registralo igual como completado y elegí la opcion correspondiente.</p>
                <div className="grid two">
                  <CheckField label="Cero realizado" checked={eventForm.zeroCompleted} onChange={(checked) => setEventForm((current) => ({ ...current, zeroCompleted: checked }))} />
                  <CheckField label="Cero ajustado" checked={eventForm.zeroAdjusted} onChange={(checked) => setEventForm((current) => ({ ...current, zeroAdjusted: checked }))} />
                  <div>
                    <label className="label">Unidad / referencia visible</label>
                    <select className="input" value={eventForm.zeroDisplayUnit} onChange={(e) => setEventForm((current) => ({ ...current, zeroDisplayUnit: e.target.value }))}>
                      <option value="mV">mV</option>
                      <option value="kg">kg</option>
                      <option value="cuentas">Cuentas</option>
                      <option value="no_visible">No visible en controlador</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <Field label="Valor antes del cero" value={eventForm.zeroBeforeValue} onChange={(value) => setEventForm((current) => ({ ...current, zeroBeforeValue: value }))} />
                  <Field label="Valor despues del cero" value={eventForm.zeroAfterValue} onChange={(value) => setEventForm((current) => ({ ...current, zeroAfterValue: value }))} />
                </div>
                <div className="grid three compact-top">
                  <Metric label="Unidad" value={eventForm.zeroDisplayUnit || '-'} />
                  <Metric label="Deriva" value={zeroDrift === null ? '-' : String(round(zeroDrift, 6))} />
                  <Metric label="Realizado" value={eventForm.zeroCompleted ? 'Si' : 'No'} />
                </div>
                <TextArea label="Observaciones de cero" value={eventForm.zeroNotes} onChange={(value) => setEventForm((current) => ({ ...current, zeroNotes: value }))} />
              </CollapsibleCard>}

              {calibrationStep === 3 && <CollapsibleCard title="Paso 4 · Foto de parametros" hint="Datos del controlador al momento de calibrar." defaultOpen>
                <div className="card-tag">Paso 4</div>
                <h2>Foto de parametros</h2>
                <div className="grid two">
                  <Field label="Factor calibracion" type="number" value={eventForm.calibrationFactor} onChange={(value) => setEventForm((current) => ({ ...current, calibrationFactor: value }))} />
                  <Field label="Cero" type="number" value={eventForm.zeroValue} onChange={(value) => setEventForm((current) => ({ ...current, zeroValue: value }))} />
                  <Field label="Span" type="number" value={eventForm.spanValue} onChange={(value) => setEventForm((current) => ({ ...current, spanValue: value }))} />
                  <Field label="Filtro" value={eventForm.filterValue} onChange={(value) => setEventForm((current) => ({ ...current, filterValue: value }))} />
                  <Field label="Puente pesaje (m)" type="number" value={eventForm.snapshotBridgeLengthM} onChange={(value) => setEventForm((current) => ({ ...current, snapshotBridgeLengthM: value }))} />
                  <Field label="Velocidad nominal (m/s)" type="number" value={eventForm.snapshotNominalSpeedMs} onChange={(value) => setEventForm((current) => ({ ...current, snapshotNominalSpeedMs: value }))} />
                  <Field label="Unidades" value={eventForm.units} onChange={(value) => setEventForm((current) => ({ ...current, units: value }))} />
                  <div className="system-field">
                    <span>Cambio registrado por</span>
                    <strong>{currentUser.username}</strong>
                  </div>
                </div>
                <TextArea label="Parametros extra" value={eventForm.extraParameters} onChange={(value) => setEventForm((current) => ({ ...current, extraParameters: value }))} />
              </CollapsibleCard>}

              {calibrationStep === 4 && <CollapsibleCard title="Paso 5 · Span con cadena" hint="Lectura promedio contra peso patron." defaultOpen>
                <div className="card-tag">Paso 5</div>
                <h2>Span con peso patron (cadena)</h2>
                <div className="grid two">
                  <Field label="Kg/m de cadena (editable)" type="number" value={eventForm.chainLinearKgM} onChange={(value) => setEventForm((current) => ({ ...current, chainLinearKgM: value }))} />
                  <Field label="Tiempo de test" type="number" value={eventForm.passCount} onChange={(value) => setEventForm((current) => ({ ...current, passCount: value }))} />
                  <Field label="Promedio lectura controlador (kg/m)" type="number" value={eventForm.avgControllerReadingKgM} onChange={(value) => setEventForm((current) => ({ ...current, avgControllerReadingKgM: value }))} />
                  <Field label="Factor provisorio" type="number" value={eventForm.provisionalFactor} onChange={(value) => setEventForm((current) => ({ ...current, provisionalFactor: value }))} />
                </div>
                <div className="grid three compact-top">
                  <Metric label="Error promedio" value={`${round(avgErrorPct)} %`} />
                  <Metric label="Referencia cadena" value={`${round(toNumber(eventForm.chainLinearKgM) || 0)} kg/m`} />
                  <Metric label="Promedio controlador" value={`${round(toNumber(eventForm.avgControllerReadingKgM) || 0)} kg/m`} />
                </div>
              </CollapsibleCard>}

              {calibrationStep === 5 && <CollapsibleCard title="Paso 6 · Acumulado" hint="Control de totalizador y factor de ajuste." defaultOpen>
                <div className="card-tag">Paso 6</div>
                <h2>Acumulado y factor de ajuste</h2>
                <div className="grid two">
                  <Field label="Caudal esperado (tn/h)" type="number" value={eventForm.expectedFlowTph} onChange={(value) => setEventForm((current) => ({ ...current, expectedFlowTph: value }))} />
                  <Field label="Tiempo de prueba (min)" type="number" value={eventForm.accumulatedTestMinutes} onChange={(value) => setEventForm((current) => ({ ...current, accumulatedTestMinutes: value }))} />
                  <Field label={`Acumulado indicado (${selectedEquipment?.totalizerUnit || 'tn'})`} type="number" value={eventForm.accumulatedIndicatedTotal} onChange={(value) => setEventForm((current) => ({ ...current, accumulatedIndicatedTotal: value }))} />
                  <Field label="Factor ajuste antes" type="number" value={eventForm.adjustmentFactorBefore} onChange={(value) => setEventForm((current) => ({ ...current, adjustmentFactorBefore: value }))} />
                </div>
                <div className="grid four compact-top">
                  <Metric label="Acumulado esperado" value={eventForm.expectedFlowTph && eventForm.accumulatedTestMinutes ? String(round((toNumber(eventForm.expectedFlowTph) * toNumber(eventForm.accumulatedTestMinutes)) / 60, 6)) : '-'} />
                  <Metric label="Error acumulado" value={eventForm.expectedFlowTph && eventForm.accumulatedTestMinutes && eventForm.accumulatedIndicatedTotal ? `${round((((toNumber(eventForm.accumulatedIndicatedTotal) - ((toNumber(eventForm.expectedFlowTph) * toNumber(eventForm.accumulatedTestMinutes)) / 60)) / ((toNumber(eventForm.expectedFlowTph) * toNumber(eventForm.accumulatedTestMinutes)) / 60)) * 100), 3)} %` : '-'} />
                  <Metric label="Factor ajuste sugerido" value={eventForm.expectedFlowTph && eventForm.accumulatedTestMinutes && eventForm.accumulatedIndicatedTotal && eventForm.adjustmentFactorBefore ? String(round(toNumber(eventForm.adjustmentFactorBefore) * ((((toNumber(eventForm.expectedFlowTph) * toNumber(eventForm.accumulatedTestMinutes)) / 60) / toNumber(eventForm.accumulatedIndicatedTotal))), 6)) : '-'} />
                  <Metric label="Regla" value="Si el instantaneo esta bien, corregir con factor de ajuste" />
                </div>
              </CollapsibleCard>}

              {calibrationStep === 6 && <CollapsibleCard title="Paso 7 · Material real" hint="Validacion contra peso externo real." defaultOpen>
                <div className="card-tag">Paso 7</div>
                <h2>Validacion con material real</h2>
                <p className="hint">Registrá la primera pasada como control. Si queda fuera de tolerancia, ajustá el factor en el controlador y agregá una verificacion post-ajuste.</p>
                {!requiresFullCalibration && <p className="hint">Esta balanza ya tiene calibracion previa: podés cerrar el evento como control preventivo solo con material real, sin repetir cadena ni acumulado.</p>}
                {[1, 2, 3].slice(0, materialPassCount).map((passNumber) => {
                  const prefix = `materialPass${passNumber}` as 'materialPass1' | 'materialPass2' | 'materialPass3'
                  const pass = materialPasses[passNumber - 1]
                  return (
                    <div className="material-pass-card" key={passNumber}>
                      <div className="row wrap">
                        <div>
                          <span className="section-kicker">{passNumber === 1 ? 'Control inicial' : 'Verificacion post-ajuste'}</span>
                          <h3>Pasada {passNumber}</h3>
                        </div>
                        <strong className={Math.abs(pass.errorPct) <= toNumber(eventForm.tolerancePercent || 1) && pass.externalWeightKg && pass.beltWeightKg ? 'status-pill success' : 'status-pill'}>
                          {pass.externalWeightKg && pass.beltWeightKg ? `${round(pass.errorPct)} %` : 'Pendiente'}
                        </strong>
                      </div>
                      <div className="grid two compact-top">
                        <Field label="Peso balanza certificada (kg)" type="number" value={eventForm[`${prefix}ExternalWeightKg`]} onChange={(value) => setEventForm((current) => ({ ...current, [`${prefix}ExternalWeightKg`]: value }))} />
                        <Field label="Peso indicado controlador (kg)" type="number" value={eventForm[`${prefix}BeltWeightKg`]} onChange={(value) => setEventForm((current) => ({ ...current, [`${prefix}BeltWeightKg`]: value }))} />
                        <Field label="Factor usado" type="number" value={eventForm[`${prefix}Factor`]} onChange={(value) => setEventForm((current) => ({ ...current, [`${prefix}Factor`]: value }))} />
                        <TextArea label="Nota de pasada" value={eventForm[`${prefix}Notes`]} onChange={(value) => setEventForm((current) => ({ ...current, [`${prefix}Notes`]: value }))} />
                      </div>
                    </div>
                  )
                })}
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
                <h2>Ajuste final y aprobacion</h2>
                <div className="grid three compact-top">
                  <Metric label="Resultado material" value={finalMaterialPass ? outcomeLabel(materialOutcome) : '-'} />
                  <Metric label="Error final" value={finalMaterialPass ? `${round(materialErrorPct)} %` : '-'} />
                  <Metric label="Ajuste aplicado" value={materialAdjustmentApplied ? 'Si' : 'No'} />
                </div>
                <div className="grid two">
                  <Field label="Factor final" type="number" value={eventForm.finalFactor} onChange={(value) => setEventForm((current) => ({ ...current, finalFactor: value }))} />
                  <div className="system-field">
                    <span>Responsable tecnico</span>
                    <strong>{currentUser.username}</strong>
                  </div>
                </div>
                <p className="hint compact-top">El factor final es obligatorio: debe coincidir con el factor que queda cargado en el controlador al cerrar el evento.</p>
                <div className="pre-report compact-top">
                  <span className="section-kicker">Pre-reporte</span>
                  <div className="grid four compact-top">
                    <Metric label="Equipo" value={selectedEquipment ? `${selectedEquipment.beltCode} / ${selectedEquipment.scaleName}` : '-'} />
                    <Metric label="Resultado" value={finalMaterialPass ? outcomeLabel(materialOutcome) : '-'} />
                    <Metric label="Error final" value={finalMaterialPass ? `${round(materialErrorPct)} %` : '-'} />
                    <Metric label="Bloqueos" value={String(eventBlockingIssues.length)} />
                  </div>
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
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button className="primary" type="submit"><Save className="action-icon" aria-hidden="true" />Guardar evento</button>
              </div>}
            </form>
            <div className="wizard-actions card">
              <button className="secondary" type="button" onClick={goToPreviousCalibrationStep} disabled={calibrationStep === 0}>Anterior</button>
              {hasEventDraft && <button className="secondary danger" type="button" onClick={() => clearEventDraft()}><Trash2 className="action-icon" aria-hidden="true" />Descartar borrador</button>}
              {calibrationStep < calibrationSteps.length - 1 && <button className="primary" type="button" onClick={goToNextCalibrationStep}>Siguiente</button>}
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
                    <Metric label="Diametro RPM" value={`${selectedEquipment.rpmRollDiameterMm || 0} mm`} />
                    <Metric label="Largo cinta" value={`${selectedEquipment.beltLengthM || 0} m`} />
                    <Metric label="Puente" value={`${selectedEquipment.bridgeLengthM || 0} m`} />
                    <Metric label="Velocidad nominal" value={`${selectedEquipment.nominalSpeedMs || 0} m/s`} />
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
                  <Metric label="kg/m" value={String(selectedChain.linearWeightKgM)} />
                  <Metric label="Largo total" value={`${selectedChain.totalLengthM} m`} />
                  <Metric label="Peso total" value={`${selectedChain.totalWeightKg} kg`} />
                </div>
              )}
            </div>

            <CollapsibleCard title="Velocidad por RPM" hint="Calculo rapido desde RPM de rolo." defaultOpen={false}>
              <h2>Velocidad por RPM</h2>
              <div className="grid two">
                <Field label="RPM del rolo" type="number" value={rpmToolForm.rpm} onChange={(value) => setRpmToolForm((current) => ({ ...current, rpm: value }))} />
                <Field label="Velocidad indicada (m/s)" type="number" value={rpmToolForm.indicatedSpeedMs} onChange={(value) => setRpmToolForm((current) => ({ ...current, indicatedSpeedMs: value }))} />
              </div>
              <div className="grid four compact-top">
                <Metric label="m/s" value={rpmToolResult ? String(round(rpmToolResult.speedMs, 6)) : '-'} />
                <Metric label="m/min" value={rpmToolResult ? String(round(rpmToolResult.speedMmin, 3)) : '-'} />
                <Metric label="m/h" value={rpmToolResult ? String(round(rpmToolResult.speedMh, 1)) : '-'} />
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
                <Field label="Velocidad indicada (m/s)" type="number" value={loopToolForm.indicatedSpeedMs} onChange={(value) => setLoopToolForm((current) => ({ ...current, indicatedSpeedMs: value }))} />
              </div>
              <div className="grid four compact-top">
                <Metric label="m/s" value={loopToolResult ? String(round(loopToolResult.speedMs, 6)) : '-'} />
                <Metric label="m/min" value={loopToolResult ? String(round(loopToolResult.speedMmin, 3)) : '-'} />
                <Metric label="m/h" value={loopToolResult ? String(round(loopToolResult.speedMh, 1)) : '-'} />
                <Metric label="Error %" value={loopToolResult && loopToolForm.indicatedSpeedMs ? `${round(loopToolResult.errorPct, 3)} %` : '-'} />
              </div>
              <button className="secondary" disabled={!loopToolResult || !canOperate} onClick={() => loopToolResult && applyMeasuredSpeed(loopToolResult.speedMs)}>
                <ClipboardCheck className="action-icon" aria-hidden="true" />
                Usar velocidad en evento
              </button>
            </CollapsibleCard>

            <CollapsibleCard title="Cadena de calibracion" hint="Caudal esperado y kg/m desde cadena patron." defaultOpen={false}>
              <h2>Cadena de calibracion</h2>
              <div className="grid two">
                <Field label="Largo total cadena (m)" type="number" value={chainToolForm.chainLengthM} onChange={(value) => setChainToolForm((current) => ({ ...current, chainLengthM: value }))} />
                <Field label="Peso total cadena (kg)" type="number" value={chainToolForm.chainWeightKg} onChange={(value) => setChainToolForm((current) => ({ ...current, chainWeightKg: value }))} />
                <Field label="Largo tren pesaje (m)" type="number" value={chainToolForm.trainLengthM} onChange={(value) => setChainToolForm((current) => ({ ...current, trainLengthM: value }))} />
                <Field label="Velocidad (m/s)" type="number" value={chainToolForm.speedMs} onChange={(value) => setChainToolForm((current) => ({ ...current, speedMs: value }))} />
              </div>
              <div className="grid three compact-top">
                <Metric label="kg/m" value={chainToolResult ? String(round(chainToolResult.kgPerMeter, 6)) : '-'} />
                <Metric label="kg sobre tren" value={chainToolResult ? String(round(chainToolResult.kgOnTrain, 3)) : '-'} />
                <Metric label="Caudal esperado t/h" value={chainToolResult ? String(round(chainToolResult.tph, 3)) : '-'} />
              </div>
              <button className="secondary" disabled={!chainToolResult || !canOperate} onClick={applyChainToEvent}>
                <ClipboardCheck className="action-icon" aria-hidden="true" />
                Usar datos en evento
              </button>
            </CollapsibleCard>

            <CollapsibleCard title="Acumulado" hint="Control de totalizador y factor de ajuste." defaultOpen={false}>
              <h2>Acumulado</h2>
              <div className="grid two">
                <Field label="Caudal esperado (tn/h)" type="number" value={accumulatedToolForm.expectedFlowTph} onChange={(value) => setAccumulatedToolForm((current) => ({ ...current, expectedFlowTph: value }))} />
                <Field label="Tiempo de prueba (min)" type="number" value={accumulatedToolForm.testMinutes} onChange={(value) => setAccumulatedToolForm((current) => ({ ...current, testMinutes: value }))} />
                <Field label={`Acumulado indicado (${selectedEquipment?.totalizerUnit || 'tn'})`} type="number" value={accumulatedToolForm.indicatedTotal} onChange={(value) => setAccumulatedToolForm((current) => ({ ...current, indicatedTotal: value }))} />
                <Field label="Factor ajuste actual" type="number" value={accumulatedToolForm.adjustmentFactorCurrent} onChange={(value) => setAccumulatedToolForm((current) => ({ ...current, adjustmentFactorCurrent: value }))} />
              </div>
              <div className="grid four compact-top">
                <Metric label="Acumulado esperado" value={accumulatedToolResult ? String(round(accumulatedToolResult.expectedTotal, 6)) : '-'} />
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
                <Field label="Peso medido por balanza (kg)" type="number" value={factorToolForm.controllerWeightKg} onChange={(value) => setFactorToolForm((current) => ({ ...current, controllerWeightKg: value }))} />
                <Field label="Peso real externo (kg)" type="number" value={factorToolForm.realWeightKg} onChange={(value) => setFactorToolForm((current) => ({ ...current, realWeightKg: value }))} />
              </div>
              <div className="grid four compact-top">
                <Metric label="Factor nuevo" value={factorToolResult ? String(round(factorToolResult.newFactor, 6)) : '-'} />
                <Metric label="Diferencia kg" value={factorToolResult ? String(round(factorToolResult.diffKg, 3)) : '-'} />
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
                <Metric label="Fuera tolerancia" value={String(filteredEvents.filter((item) => statusClass(getEventMaterialOutcome(item).status) === 'danger').length)} />
                <Metric label="Conformes" value={String(filteredEvents.filter((item) => statusClass(getEventMaterialOutcome(item).status) === 'success').length)} />
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

            {filteredEvents.map((item) => {
              const equipmentItem = equipment.find((row) => row.id === item.equipmentId)
              const materialSummary = getEventMaterialOutcome(item)
              const statusText = materialSummary.status
              return (
                <div className={`card stack history-card status-${statusClass(statusText)}`} key={item.id}>
                  <div className="row wrap">
                    <div className="equipment-card-head">
                      {equipmentItem && (
                        <EquipmentPhoto
                          photoUrl={getEquipmentPhotoUrl(equipmentItem.photoPath)}
                          label={equipmentItem.scaleName}
                          status={statusText}
                          compact
                          onOpen={() => openEquipmentPhoto(equipmentItem)}
                        />
                      )}
                      <div>
                        <span className="section-kicker">{statusText}</span>
                        <h3>{item.id}</h3>
                        <p className="hint">{equipmentItem ? `${equipmentItem.plant} / ${equipmentItem.line} / ${equipmentItem.beltCode} / ${equipmentItem.scaleName}` : 'Equipo no encontrado'}</p>
                      </div>
                    </div>
                    <div className="row compact-actions">
                      <button className="secondary small" type="button" onClick={() => printCalibrationReport(item, equipmentItem)}>
                        <Printer className="action-icon" aria-hidden="true" />Imprimir reporte
                      </button>
                      {canDelete && (
                        <button className="secondary small danger" type="button" onClick={() => handleDeleteEvent(item.id)}>
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="hint">{formatDateTime(item.eventDate)} | {item.approval.technician}</p>
                  <details className="inline-details">
                    <summary>Ver detalle</summary>
                    <div className="grid four compact-top">
                      <Metric label="Error cadena" value={`${item.chainSpan.avgErrorPct} %`} />
                      <Metric label="Error acumulado" value={`${item.accumulatedCheck.errorPct || 0} %`} />
                      <Metric label="Error material final" value={`${materialSummary.errorPct} %`} />
                      <Metric label="Factor final" value={String(item.finalAdjustment.factorAfter)} />
                      <Metric label="Pasadas" value={String(materialSummary.passes.length)} />
                      <Metric label="Ajuste" value={materialSummary.adjustmentApplied ? 'Si' : 'No'} />
                      <Metric label="Accion recomendada" value={statusClass(statusText) === 'danger' ? 'Revisar desvio' : statusClass(statusText) === 'warning' ? 'Cargar control' : 'Seguimiento normal'} />
                    </div>
                    <div className="material-pass-list compact-top">
                      {materialSummary.passes.map((pass) => (
                        <div className="result-row" key={`${item.id}-${pass.index}`}>
                          <span>Pasada {pass.index} {materialSummary.finalPass?.index === pass.index ? '· final' : ''}</span>
                          <strong>{pass.externalWeightKg} kg cert. / {pass.beltWeightKg} kg ctrl. / {pass.errorPct} %</strong>
                        </div>
                      ))}
                    </div>
                    {item.diagnosis && <p className="hint compact-top">Diagnostico: {item.diagnosis}</p>}
                    {item.finalAdjustment.reason && <p className="hint">Motivo ajuste: {item.finalAdjustment.reason}</p>}
                    {item.notes && <p>{item.notes}</p>}
                  </details>
                </div>
              )
            })}

            {filteredEvents.length === 0 && <div className="card">No hay eventos con esos filtros.</div>}
          </section>
        )}

        {screen === 'usuarios' && canManageUsers && (
          <section className="stack screen-shell">
            <div className="screen-banner">
              <span className="section-kicker">Administracion</span>
              <h2>Gestion de usuarios</h2>
              <p>Alta y baja de usuarios usando Supabase Auth y perfiles con rol operativo.</p>
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
                  <p className="hint">Los cambios se aplican sobre Supabase Auth.</p>
                </div>
                <button className="secondary small" onClick={loadManagedUsers} disabled={userManagementLoading}><Settings2 className="action-icon" aria-hidden="true" />Actualizar</button>
              </div>
              {managedUsers.map((user) => (
                <div className="result-row" key={user.id}>
                  <span>{user.username || user.email} · {user.email} · {user.role}</span>
                  <button className="secondary small danger" disabled={user.id === currentUser.id || userManagementLoading} onClick={() => handleDeleteUser(user)}><Trash2 className="action-icon" aria-hidden="true" />Eliminar</button>
                </div>
              ))}
              {managedUsers.length === 0 && <div className="result-row"><span>No hay usuarios cargados o no se cargó la lista.</span><strong>-</strong></div>}
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

function EquipmentPhoto({
  photoUrl,
  label,
  status,
  compact = false,
  onOpen,
}: {
  photoUrl: string
  label: string
  status: string
  compact?: boolean
  onOpen: () => void
}) {
  const initials = label.trim().slice(0, 2).toUpperCase() || 'BD'
  return (
    <button
      className={`equipment-photo ${compact ? 'equipment-photo-compact' : ''}`}
      type="button"
      onClick={photoUrl ? onOpen : undefined}
      disabled={!photoUrl}
      title={photoUrl ? 'Ampliar foto' : 'Sin foto cargada'}
    >
      {photoUrl ? <img src={photoUrl} alt={label} /> : <span>{initials}</span>}
      <strong>{status}</strong>
    </button>
  )
}

type FieldProps = { label: string; value: string; onChange: (value: string) => void; type?: string }

function Field({ label, value, onChange, type = 'text' }: FieldProps) {
  const id = useId()
  const inputType = type === 'number' ? 'text' : type
  const inputMode = type === 'number' ? 'decimal' : type === 'email' ? 'email' : undefined
  const handleChange = (rawValue: string) => {
    onChange(type === 'number' ? normalizeDecimalInput(rawValue) : rawValue)
  }
  return (
    <div className="field-shell">
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" type={inputType} inputMode={inputMode} value={value} onChange={(event) => handleChange(event.target.value)} />
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default App
