import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ClipboardCheck,
  Download,
  History,
  Pencil,
  PlusCircle,
  Printer,
  RotateCcw,
  Save,
  Scale,
  Settings2,
  Trash2,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react'
import {
  deleteCalibrationEventRecord,
  deleteChainRecord,
  deleteEquipmentRecord,
  loadAppData,
  saveCalibrationEventRecord,
  saveChainRecord,
  saveEquipmentRecord,
} from './repository'
import { loadChains, loadEquipment, loadEvents, saveChains, saveEquipment, saveEvents } from './storage'
import { isSupabaseConfigured, supabase } from './supabase'
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

const APP_VERSION = 'v1.1.21'
const CALIBRATION_DRAFT_KEY = 'calibracinta:event-draft:v1'

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

function buildAdminManualHtml(user: AuthUser) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex, nofollow, noarchive" />
  <title>Manual administrador Calibra Cinta</title>
  <style>
    :root { font-family: Arial, sans-serif; color: #0c0b11; }
    body { margin: 0; padding: 28px; background: #f7f5ef; }
    main { max-width: 920px; margin: 0 auto; background: #faf9f6; border: 1px solid rgba(12, 11, 17, 0.18); padding: 28px; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 34px; line-height: 0.95; text-transform: uppercase; letter-spacing: -0.03em; }
    h2 { margin-top: 26px; padding-bottom: 6px; border-bottom: 2px solid #ff5949; font-size: 18px; }
    p, li { color: #2e2930; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 18px 0 22px; }
    .meta div { padding: 10px; background: #f0efeb; border: 1px solid rgba(12, 11, 17, 0.12); }
    .meta span { display: block; color: #737074; font-size: 12px; text-transform: uppercase; }
    .meta strong { display: block; margin-top: 3px; }
    .warning { margin-top: 18px; padding: 12px; background: #fff3d6; border: 1px solid rgba(201, 133, 0, 0.45); }
    @media print { body { background: #fff; padding: 0; } main { border: 0; } }
  </style>
</head>
<body>
  <main>
    <h1>Manual administrador Calibra Cinta</h1>
    <p>Guia resumida para administracion operativa. Documento generado dentro de una sesion admin autenticada.</p>
    <section class="meta">
      <div><span>Usuario</span><strong>${reportValue(user.username)}</strong></div>
      <div><span>Rol</span><strong>${reportValue(user.role)}</strong></div>
      <div><span>Version</span><strong>${APP_VERSION}</strong></div>
    </section>
    <section class="warning">Este material no se publica como recurso estatico. Usarlo solo para administracion interna.</section>
    <h2>1. Roles y permisos</h2>
    <ul>
      <li><strong>Admin:</strong> gestiona usuarios, equipos, cadenas, eventos y eliminaciones.</li>
      <li><strong>Tecnico:</strong> crea equipos/cadenas/eventos y opera calibraciones.</li>
      <li><strong>Supervisor:</strong> revisa informacion, fotos, historial y reportes.</li>
      <li><strong>Consulta:</strong> acceso basico de lectura.</li>
    </ul>
    <h2>2. Gestion segura</h2>
    <ul>
      <li>Crear usuarios solo con rol necesario para su trabajo.</li>
      <li>Eliminar registros solo cuando exista confirmacion operativa.</li>
      <li>Ante errores RLS, revisar rol del usuario y accion intentada antes de modificar policies.</li>
      <li>No compartir capturas o documentos administrativos fuera del equipo responsable.</li>
    </ul>
    <h2>3. Balanzas, cadenas y eventos</h2>
    <ul>
      <li>Los equipos y cadenas son datos maestros; mantener nombres, plantas y kg/m consistentes.</li>
      <li>Los eventos historicos deben conservarse para trazabilidad, incluso si un desvio ya fue corregido.</li>
      <li>El dashboard muestra el estado actual por ultimo evento de cada balanza.</li>
    </ul>
    <h2>4. Reportes y auditoria</h2>
    <ul>
      <li>Usar historial para imprimir reportes de calibracion o control preventivo.</li>
      <li>Registrar observaciones cuando haya ajustes, condiciones anormales o uso de cadenas de otra planta.</li>
      <li>Confirmar que la version visible coincida con el ultimo despliegue de Vercel.</li>
    </ul>
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
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null)
  const equipmentFormRef = useRef<HTMLDivElement | null>(null)
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
      const lastEvent = events
        .filter((eventItem) => eventItem.equipmentId === item.id)
        .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())[0]
      return { item, lastEvent }
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
    const conform = events.filter((item) => getEventMaterialOutcome(item).outcome === 'control_conforme').length
    const calibrated = events.filter((item) => getEventMaterialOutcome(item).outcome === 'calibrada_ajustada').length
    const monthEvents = events.filter((item) => item.eventDate.slice(0, 7) === currentMonth).length
    const nextAction = outOfToleranceCount > 0
      ? 'Revisar equipos fuera de tolerancia'
      : withoutHistory > 0
        ? 'Completar primera calibracion'
        : 'Mantener controles preventivos'
    return { withoutHistory, conform, calibrated, monthEvents, nextAction }
  }, [equipmentWithLastEvent, events, outOfToleranceCount])

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
    if (!(toNumber(eventForm.finalFactor) || finalMaterialPass?.factorUsed || suggestedFactor || materialFactorBefore)) issues.push('Falta el factor final o usado en la pasada final.')
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
    const factorAfterAdjustment = materialOutcome === 'control_conforme'
      ? factorBeforeAdjustment
      : toNumber(eventForm.finalFactor) || finalMaterialPass?.factorUsed || suggestedFactor || factorBeforeAdjustment

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
    } catch (error) {
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-kicker">Control Metrologico Industrial</div>
          <h1>Balanzas Dinamicas</h1>
          <p>Trazabilidad de seteo, Span con peso patron, material real y ajuste final.</p>
        </div>
        <div className="topbar-actions">
          <div className="chip version-chip">{APP_VERSION}</div>
          <div className="chip">{currentUser.username} · {currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'tecnico' ? 'Tecnico' : currentUser.role === 'supervisor' ? 'Supervisor' : 'Consulta'}</div>
          <div className={`chip ${dataSource === 'supabase' ? 'sincronizado' : 'pendiente'}`}>
            {dataSource === 'supabase' ? 'DB: Supabase' : 'DB: Local'}
          </div>
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

      {loadingData && <div className="notice">Cargando datos...</div>}

      <main className="content">
        {screen === 'dashboard' && (
          <section className="stack screen-shell">
            <div className="screen-banner dashboard-banner">
              <span className="section-kicker">Panel operativo</span>
              <h2>Estado del parque en una mirada</h2>
              <p>Priorizá equipos, controles pendientes y desvíos antes de entrar al detalle técnico.</p>
            </div>
            <div className="dashboard-grid">
              <div className="dashboard-card primary-dashboard-card">
                <span>Accion recomendada</span>
                <strong>{dashboardStats.nextAction}</strong>
                <p>{outOfToleranceCount > 0 ? 'Hay eventos que requieren seguimiento.' : 'El parque no muestra desvíos abiertos según el historial cargado.'}</p>
              </div>
              <Metric label="Balanzas" value={String(equipment.length)} />
              <Metric label="Sin historial" value={String(dashboardStats.withoutHistory)} />
              <Metric label="Eventos del mes" value={String(dashboardStats.monthEvents)} />
              <Metric label="Fuera tolerancia" value={String(outOfToleranceCount)} />
              <Metric label="Controles conformes" value={String(dashboardStats.conform)} />
              <Metric label="Calibradas" value={String(dashboardStats.calibrated)} />
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
              {equipmentWithLastEvent.slice(0, 4).map(({ item, lastEvent }) => {
                const statusText = lastEvent ? getEventMaterialOutcome(lastEvent).status : 'Sin calibraciones'
                return (
                  <div className={`card equipment-card status-${statusClass(statusText)}`} key={item.id}>
                    <div className="equipment-card-header">
                      <div className="equipment-card-head">
                        <EquipmentPhoto photoUrl={getEquipmentPhotoUrl(item.photoPath)} label={item.scaleName} status={statusText} compact onOpen={() => openEquipmentPhoto(item)} />
                        <div>
                          <span className="section-kicker">{statusText}</span>
                          <h3>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</h3>
                          <p className="hint">{lastEvent ? `Ultimo error: ${getEventMaterialOutcome(lastEvent).errorPct} %` : 'Requiere primera carga/calibracion.'}</p>
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
              {equipmentWithLastEvent.map(({ item, lastEvent }) => {
                const statusText = lastEvent
                  ? getEventMaterialOutcome(lastEvent).status
                  : 'Sin calibraciones'
                return (
                  <div className={`card equipment-card status-${statusClass(statusText)}`} key={item.id}>
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
                      <Metric label="Ultima calibracion" value={lastEvent ? formatDateTime(lastEvent.eventDate) : '-'} />
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
              <div className="wizard-steps" aria-label="Progreso de calibracion">
                {calibrationStepStates.map(({ step, complete, warning }, index) => (
                  <button
                    className={`wizard-step ${index === calibrationStep ? 'active' : complete ? 'complete' : warning ? 'warning' : ''}`}
                    key={step}
                    type="button"
                    onClick={() => setCalibrationStep(index)}
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
              </div>
            </div>

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
                    status={selectedEquipmentStatus}
                    onOpen={() => openEquipmentPhoto(selectedEquipment)}
                  />
                  <div className="grid four">
                    <Metric label="Puente" value={`${selectedEquipment.bridgeLengthM} m`} />
                    <Metric label="Velocidad" value={`${selectedEquipment.nominalSpeedMs} m/s`} />
                    <Metric label="Capacidad" value={`${selectedEquipment.nominalCapacityTph} t/h`} />
                    <Metric label="Origen velocidad" value={selectedEquipment.speedSource} />
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

      <nav className={`bottom-nav ${canManageUsers ? 'six' : canOperate ? 'five' : canReview ? 'four' : 'three'}`}>
        <button className={screen === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('dashboard')}><Scale className="nav-icon" aria-hidden="true" />Inicio</button>
        {canReview && <button className={screen === 'balanzas' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('balanzas')}><Scale className="nav-icon" aria-hidden="true" />Balanzas</button>}
        <button className={screen === 'herramientas' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('herramientas')}><Wrench className="nav-icon" aria-hidden="true" />Herramientas</button>
        {canOperate && <button className={screen === 'nueva' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('nueva')}><ClipboardCheck className="nav-icon" aria-hidden="true" />Nueva</button>}
        <button className={screen === 'historial' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('historial')}><History className="nav-icon" aria-hidden="true" />Historial</button>
        {canManageUsers && <button className={screen === 'usuarios' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('usuarios')}><Users className="nav-icon" aria-hidden="true" />Usuarios</button>}
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
  const inputType = type === 'number' ? 'text' : type
  const inputMode = type === 'number' ? 'decimal' : type === 'email' ? 'email' : undefined
  const handleChange = (rawValue: string) => {
    onChange(type === 'number' ? normalizeDecimalInput(rawValue) : rawValue)
  }
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={inputType} inputMode={inputMode} value={value} onChange={(event) => handleChange(event.target.value)} />
    </div>
  )
}

function TextArea({ label, value, onChange }: Omit<FieldProps, 'type'>) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea className="input textarea" value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
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

