import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  deleteCalibrationEventRecord,
  deleteEquipmentRecord,
  loadAppData,
  saveCalibrationEventRecord,
  saveChainRecord,
  saveEquipmentRecord,
} from './repository'
import { loadChains, loadEquipment, loadEvents, saveChains, saveEquipment, saveEvents } from './storage'
import { isSupabaseConfigured, supabase } from './supabase'
import type { CalibrationEvent, Chain, Equipment, SpeedSource } from './types'
import {
  computePercentError,
  computeStatusLabel,
  computeSuggestedFactor,
  formatDateTime,
  generateEventCode,
  generateId,
  nowLocalValue,
  round,
} from './utils'

type Screen = 'balanzas' | 'herramientas' | 'nueva' | 'historial' | 'usuarios'
type ToastTone = 'info' | 'success' | 'warning' | 'error'

type Toast = {
  id: string
  message: string
  tone: ToastTone
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

const APP_VERSION = 'v0.14.0'

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

function App() {
  const [screen, setScreen] = useState<Screen>('balanzas')
  const [equipment, setEquipment] = useState<Equipment[]>(() => loadEquipment())
  const [chains, setChains] = useState<Chain[]>(() => loadChains())
  const [events, setEvents] = useState<CalibrationEvent[]>(() => loadEvents())
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('')
  const [selectedChainId, setSelectedChainId] = useState('')
  const [equipmentForm, setEquipmentForm] = useState(defaultEquipmentForm)
  const [chainForm, setChainForm] = useState(defaultChainForm)
  const [eventForm, setEventForm] = useState(defaultEventForm)
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
  const [syncNotice, setSyncNotice] = useState('')
  const [loadingData, setLoadingData] = useState(true)
  const [dataSource, setDataSource] = useState<'local' | 'supabase'>('local')
  const [toasts, setToasts] = useState<Toast[]>([])
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
    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4200)

    return () => window.clearTimeout(timeoutId)
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
        if (result.source === 'supabase') {
          setSyncNotice('Datos cargados desde Supabase.')
        } else if (!isSupabaseConfigured) {
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
      setScreen(currentUser.role === 'viewer' ? 'herramientas' : 'balanzas')
    }
    if (currentUser.role === 'viewer' && (screen === 'balanzas' || screen === 'nueva')) {
      setScreen('herramientas')
    }
    if (currentUser.role === 'supervisor' && screen === 'nueva') {
      setScreen('balanzas')
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
    ? computeStatusLabel(selectedEquipmentLastEvent.materialValidation.errorPct, selectedEquipmentLastEvent.tolerancePercent)
    : 'Sin calibrar'

  const selectedChain = useMemo(() => chains.find((item) => item.id === selectedChainId), [chains, selectedChainId])
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

  const equipmentWithLastEvent = useMemo(() => {
    return equipment.map((item) => {
      const lastEvent = events
        .filter((eventItem) => eventItem.equipmentId === item.id)
        .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())[0]
      return { item, lastEvent }
    })
  }, [equipment, events])

  const avgErrorPct = useMemo(
    () => computePercentError(Number(eventForm.chainLinearKgM) || 0, Number(eventForm.avgControllerReadingKgM) || 0),
    [eventForm.chainLinearKgM, eventForm.avgControllerReadingKgM],
  )

  const materialErrorPct = useMemo(
    () => computePercentError(Number(eventForm.externalWeightKg) || 0, Number(eventForm.beltWeightKg) || 0),
    [eventForm.externalWeightKg, eventForm.beltWeightKg],
  )

  const suggestedFactor = useMemo(
    () =>
      computeSuggestedFactor(
        Number(eventForm.provisionalFactor) || Number(eventForm.calibrationFactor) || 0,
        Number(eventForm.externalWeightKg) || 0,
        Number(eventForm.beltWeightKg) || 0,
      ),
    [
      eventForm.provisionalFactor,
      eventForm.calibrationFactor,
      eventForm.externalWeightKg,
      eventForm.beltWeightKg,
    ],
  )

  const outOfToleranceCount = useMemo(
    () => events.filter((item) => Math.abs(item.materialValidation.errorPct) > item.tolerancePercent).length,
    [events],
  )

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
    const before = Number(eventForm.zeroBeforeValue)
    const after = Number(eventForm.zeroAfterValue)
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
    if (!(Number(equipmentForm.bridgeLengthM) > 0)) issues.push('La distancia de puente debe ser mayor a 0.')
    if (!(Number(equipmentForm.nominalSpeedMs) > 0)) issues.push('La velocidad nominal debe ser mayor a 0.')
    return issues
  }, [equipmentForm])

  const chainBlockingIssues = useMemo(() => {
    const issues: string[] = []
    if (!chainForm.plant.trim()) issues.push('Falta planta.')
    if (!chainForm.name.trim()) issues.push('Falta nombre de cadena.')
    if (!(Number(chainForm.linearWeightKgM) > 0)) issues.push('El peso por metro debe ser mayor a 0.')
    return issues
  }, [chainForm])

  const eventBlockingIssues = useMemo(() => {
    const issues: string[] = []
    if (!selectedEquipment) issues.push('Seleccioná una balanza.')
    if (!precheckPassed) issues.push('Completá toda la inspeccion previa.')
    if (!eventForm.zeroCompleted) issues.push('Debés registrar el cero antes de calibrar.')
    if (!currentUser?.username.trim()) issues.push('Falta usuario responsable logueado.')
    if (!(Number(eventForm.chainLinearKgM) > 0)) issues.push('Falta el kg/m de cadena.')
    if (!(Number(eventForm.avgControllerReadingKgM) > 0)) issues.push('Falta el promedio de lectura del controlador.')
    if (!(Number(eventForm.expectedFlowTph) > 0)) issues.push('Falta el caudal esperado.')
    if (!(Number(eventForm.accumulatedTestMinutes) > 0)) issues.push('Falta el tiempo de prueba.')
    if (!(Number(eventForm.accumulatedIndicatedTotal) > 0)) issues.push('Falta el acumulado indicado.')
    if (!(Number(eventForm.externalWeightKg) > 0)) issues.push('Falta el peso real externo.')
    if (!(Number(eventForm.beltWeightKg) > 0)) issues.push('Falta el peso medido por balanza.')
    if (!(Number(eventForm.finalFactor || suggestedFactor) > 0)) issues.push('Falta el factor final o sugerido.')
    return issues
  }, [currentUser, eventForm, precheckPassed, selectedEquipment, suggestedFactor])

  const rpmToolResult = useMemo(() => {
    const diameterMm = selectedEquipment?.rpmRollDiameterMm || 0
    const rpm = Number(rpmToolForm.rpm) || 0
    const indicated = Number(rpmToolForm.indicatedSpeedMs) || 0
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
    const loopTimeSeconds = Number(loopToolForm.loopTimeSeconds) || 0
    const indicated = Number(loopToolForm.indicatedSpeedMs) || 0
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
    const chainLengthM = Number(chainToolForm.chainLengthM) || 0
    const chainWeightKg = Number(chainToolForm.chainWeightKg) || 0
    const trainLengthM = Number(chainToolForm.trainLengthM) || 0
    const speedMs = Number(chainToolForm.speedMs) || 0
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
    const currentFactor = Number(factorToolForm.currentFactor) || 0
    const controllerWeightKg = Number(factorToolForm.controllerWeightKg) || 0
    const realWeightKg = Number(factorToolForm.realWeightKg) || 0
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
    const expectedFlowTph = Number(accumulatedToolForm.expectedFlowTph) || 0
    const testMinutes = Number(accumulatedToolForm.testMinutes) || 0
    const indicatedTotal = Number(accumulatedToolForm.indicatedTotal) || 0
    const adjustmentFactorCurrent = Number(accumulatedToolForm.adjustmentFactorCurrent) || 0
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
    return messages
  }, [rpmToolResult, selectedEquipment, chainToolResult, eventForm.avgControllerReadingKgM, avgErrorPct, accumulatedToolResult, eventForm.zeroCompleted])

  const filteredEvents = useMemo(() => {
    return events
      .filter((item) => {
        const matchesEquipment = historyEquipmentId === 'todos' || item.equipmentId === historyEquipmentId
        return matchesEquipment
      })
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
  }, [events, historyEquipmentId])

  function resetEventForm() {
    setEventForm({ ...defaultEventForm, eventDate: nowLocalValue() })
    setEventSubmitAttempted(false)
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
    setScreen('balanzas')
    setSyncNotice('Sesion iniciada.')
  }

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut()
    }
    setCurrentUser(null)
    setScreen('balanzas')
    setSyncNotice('Sesion cerrada.')
  }

  function primeEventForm(item: Equipment) {
    setSelectedEquipmentId(item.id)
    setEventForm({
      ...defaultEventForm,
      eventDate: nowLocalValue(),
      snapshotBridgeLengthM: String(item.bridgeLengthM || ''),
      snapshotNominalSpeedMs: String(item.nominalSpeedMs || ''),
    })
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
        beltWidthMm: Number(equipmentForm.beltWidthMm) || 0,
        beltLengthM: Number(equipmentForm.beltLengthM) || 0,
        nominalCapacityTph: Number(equipmentForm.nominalCapacityTph) || 0,
        bridgeLengthM: Number(equipmentForm.bridgeLengthM) || 0,
        nominalSpeedMs: Number(equipmentForm.nominalSpeedMs) || 0,
        speedSource: equipmentForm.speedSource,
        rpmRollDiameterMm: Number(equipmentForm.rpmRollDiameterMm) || 0,
        calibrationFactorCurrent: Number(equipmentForm.calibrationFactorCurrent) || 0,
        adjustmentFactorCurrent: Number(equipmentForm.adjustmentFactorCurrent) || 1,
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
      linearWeightKgM: Number(chainForm.linearWeightKgM) || 0,
      totalLengthM: Number(chainForm.totalLengthM) || 0,
      totalWeightKg: Number(chainForm.totalWeightKg) || 0,
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

    const factorBeforeAdjustment = Number(eventForm.provisionalFactor) || Number(eventForm.calibrationFactor) || 0
    const factorAfterAdjustment = Number(eventForm.finalFactor) || suggestedFactor || factorBeforeAdjustment

    const record: CalibrationEvent = {
      id: generateEventCode(eventForm.eventDate, events),
      equipmentId: selectedEquipment.id,
      createdAt: new Date().toISOString(),
      eventDate: new Date(eventForm.eventDate).toISOString(),
      tolerancePercent: Number(eventForm.tolerancePercent) || 1,
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
        calibrationFactor: Number(eventForm.calibrationFactor) || 0,
        zeroValue: Number(eventForm.zeroValue) || 0,
        spanValue: Number(eventForm.spanValue) || 0,
        filterValue: eventForm.filterValue.trim(),
        bridgeLengthM: Number(eventForm.snapshotBridgeLengthM) || 0,
        nominalSpeedMs: Number(eventForm.snapshotNominalSpeedMs) || 0,
        units: eventForm.units.trim(),
        internalConstants: eventForm.internalConstants.trim(),
        extraParameters: eventForm.extraParameters.trim(),
        changedBy: currentUser?.username || '',
        changedReason: eventForm.changedReason.trim(),
      },
      chainSpan: {
        chainId: eventForm.chainId.trim(),
        chainName: eventForm.chainName.trim(),
        chainLinearKgM: Number(eventForm.chainLinearKgM) || 0,
        passCount: Number(eventForm.passCount) || 0,
        avgControllerReadingKgM: Number(eventForm.avgControllerReadingKgM) || 0,
        avgErrorPct: round(avgErrorPct),
        provisionalFactor: Number(eventForm.provisionalFactor) || Number(eventForm.calibrationFactor) || 0,
      },
      accumulatedCheck: {
        expectedFlowTph: Number(eventForm.expectedFlowTph) || 0,
        testMinutes: Number(eventForm.accumulatedTestMinutes) || 0,
        expectedTotal: ((Number(eventForm.expectedFlowTph) || 0) * (Number(eventForm.accumulatedTestMinutes) || 0)) / 60,
        indicatedTotal: Number(eventForm.accumulatedIndicatedTotal) || 0,
        errorPct:
          Number(eventForm.expectedFlowTph) > 0 && Number(eventForm.accumulatedTestMinutes) > 0 && Number(eventForm.accumulatedIndicatedTotal) > 0
            ? round(
                ((Number(eventForm.accumulatedIndicatedTotal) -
                  ((Number(eventForm.expectedFlowTph) * Number(eventForm.accumulatedTestMinutes)) / 60)) /
                  ((Number(eventForm.expectedFlowTph) * Number(eventForm.accumulatedTestMinutes)) / 60)) *
                  100,
              )
            : 0,
        adjustmentFactorBefore: Number(eventForm.adjustmentFactorBefore) || selectedEquipment.adjustmentFactorCurrent || 1,
        adjustmentFactorSuggested:
          Number(eventForm.expectedFlowTph) > 0 && Number(eventForm.accumulatedTestMinutes) > 0 && Number(eventForm.accumulatedIndicatedTotal) > 0
            ? round(
                (Number(eventForm.adjustmentFactorBefore) || selectedEquipment.adjustmentFactorCurrent || 1) *
                  ((((Number(eventForm.expectedFlowTph) || 0) * (Number(eventForm.accumulatedTestMinutes) || 0)) / 60) /
                    (Number(eventForm.accumulatedIndicatedTotal) || 1)),
                6,
              )
            : 0,
      },
      materialValidation: {
        externalWeightKg: Number(eventForm.externalWeightKg) || 0,
        beltWeightKg: Number(eventForm.beltWeightKg) || 0,
        errorPct: round(materialErrorPct),
        factorBefore: factorBeforeAdjustment,
        factorSuggested: round(suggestedFactor, 6),
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
      !record.chainSpan.avgControllerReadingKgM ||
      !record.materialValidation.externalWeightKg ||
      !record.precheck.beltEmpty ||
      !record.precheck.beltClean ||
      !record.precheck.noMaterialBuildup ||
      !record.precheck.idlersOk ||
      !record.precheck.structureOk ||
      !record.precheck.speedSensorOk ||
      !record.zeroCheck.completed ||
      !record.accumulatedCheck.expectedFlowTph ||
      !record.accumulatedCheck.testMinutes ||
      !record.accumulatedCheck.indicatedTotal
    ) {
      return
    }

    try {
      await saveEquipmentRecord(selectedEquipment)
      const result = await saveCalibrationEventRecord(record)
      setEvents((current) => [record, ...current.filter((item) => item.id !== record.id)])
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
    const confirmed = window.confirm(`Eliminar definitivamente el evento ${eventId}? Esta accion no se puede deshacer.`)
    if (!confirmed) return

    try {
      const result = await deleteCalibrationEventRecord(eventId)
      setEvents((current) => current.filter((item) => item.id !== eventId))
      setDataSource(result.source)
      setSyncNotice(`Evento ${eventId} eliminado.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar el evento.'
      setSyncNotice(`Error al eliminar evento: ${message}`)
    }
  }

  async function handleDeleteEquipment(item: Equipment) {
    const relatedEvents = events.filter((eventItem) => eventItem.equipmentId === item.id).length
    const confirmed = window.confirm(
      `Dar de baja definitivamente la balanza ${item.plant} / ${item.line} / ${item.beltCode} / ${item.scaleName}?` +
        (relatedEvents > 0 ? ` Tambien se eliminaran ${relatedEvents} eventos asociados.` : '') +
        ' Esta accion no se puede deshacer.',
    )
    if (!confirmed) return

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
    if (user.id === currentUser?.id) {
      setSyncNotice('No podés eliminar tu propio usuario activo.')
      return
    }
    const confirmed = window.confirm(`Eliminar definitivamente el usuario ${user.email}? Esta accion no se puede deshacer.`)
    if (!confirmed) return

    setUserManagementLoading(true)
    try {
      const { error } = await supabase.functions.invoke('manage-users', {
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
      <div className="app-shell auth-shell">
        <section className="auth-card">
          <div className="brand-kicker">Acceso protegido</div>
          <h1>CalibraCinta</h1>
          <p>Ingresá para operar la plataforma de calibración y trazabilidad de balanzas dinámicas.</p>
          <form className="stack" onSubmit={handleLogin}>
            <Field label="Email" type="email" value={loginEmail} onChange={setLoginEmail} />
            <Field label="Contraseña" type="password" value={loginPassword} onChange={setLoginPassword} />
            <button className="primary" type="submit">Ingresar</button>
          </form>
        </section>
      </div>
    )
  }

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
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <span className="toast-dot" />
            <p>{toast.message}</p>
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

      {syncNotice && <div className="notice">{syncNotice}</div>}

      {loadingData && <div className="notice">Cargando datos...</div>}

      <main className="content">
        {screen === 'balanzas' && canReview && (
          <section className="stack screen-shell">
            <div className="screen-banner">
              <span className="section-kicker">Parque instalado</span>
              <h2>Listado de balanzas y estado operativo</h2>
              <p>Alta de equipos, lectura rápida de último error, factor y estado general de cada instalación.</p>
            </div>
            <CollapsibleCard title="Listado de balanzas" hint="Alta de equipos y datos tecnicos principales." defaultOpen={equipment.length === 0}>
                <div className="row wrap">
                  <div>
                    <h2>{editingEquipmentId ? 'Editar balanza' : 'Listado de balanzas'}</h2>
                    <p className="hint">{editingEquipmentId ? 'Actualizá datos tecnicos y foto del equipo.' : 'La app arranca mostrando equipos y su ultimo estado conocido.'}</p>
                  </div>
                  {canOperate && <button className="secondary" onClick={() => setScreen('nueva')}>
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
                  <button className="primary" type="submit">{editingEquipmentId ? 'Actualizar balanza' : 'Guardar balanza'}</button>
                  {editingEquipmentId && <button className="secondary" type="button" onClick={resetEquipmentForm}>Cancelar edicion</button>}
                </div>
              </form>}
            </CollapsibleCard>

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
                <button className="primary" type="submit">Guardar cadena</button>
              </form>}
              <div className="stack compact-top">
                {chains.map((item) => (
                  <div className="result-row" key={item.id}>
                    <span>{item.plant} / {item.name}</span>
                    <strong>{item.linearWeightKgM} kg/m</strong>
                  </div>
                ))}
                {chains.length === 0 && <div className="result-row"><span>No hay cadenas cargadas.</span><strong>-</strong></div>}
              </div>
            </CollapsibleCard>

            <div className="stack">
              {equipmentWithLastEvent.map(({ item, lastEvent }) => {
                const statusText = lastEvent
                  ? computeStatusLabel(lastEvent.materialValidation.errorPct, lastEvent.tolerancePercent)
                  : 'Sin calibraciones'
                return (
                  <div className="card" key={item.id}>
                    <div className="row wrap">
                      <div className="equipment-card-head">
                        <EquipmentPhoto
                          photoUrl={getEquipmentPhotoUrl(item.photoPath)}
                          label={item.scaleName}
                          status={statusText}
                          compact
                          onOpen={() => openEquipmentPhoto(item)}
                        />
                        <div>
                          <h3>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</h3>
                          <p className="hint">{item.controllerModel} {item.controllerSerial ? `| ${item.controllerSerial}` : ''}</p>
                        </div>
                      </div>
                      <div className="row compact-actions">
                        {canOperate && <button className="secondary small" onClick={() => primeEventForm(item)}>Nueva calibracion</button>}
                        {canDelete && <button className="secondary small" onClick={() => primeEquipmentEdit(item)}>Editar</button>}
                        {canDelete && <button className="secondary small danger" onClick={() => handleDeleteEquipment(item)}>Dar de baja</button>}
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
              <span className="section-kicker">Evento de calibracion</span>
              <h2>Secuencia real de trabajo</h2>
              <p>Inspección previa, cero, parámetros, span con cadena, material real y ajuste final en un solo circuito técnico.</p>
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
                  if (!chain) return
                  setEventForm((current) => ({
                    ...current,
                    chainId: chain.id,
                    chainName: chain.name,
                    chainLinearKgM: current.chainLinearKgM || String(chain.linearWeightKgM),
                  }))
                }}
              >
                <option value="">Seleccionar cadena</option>
                {chains
                  .filter((item) => !selectedEquipment || item.plant.trim().toLowerCase() === selectedEquipment.plant.trim().toLowerCase())
                  .map((item) => (
                    <option key={item.id} value={item.id}>{item.plant} / {item.name}</option>
                  ))}
              </select>
              {selectedChain && (
                <div className="grid three compact-top">
                  <Metric label="Cadena" value={selectedChain.name} />
                  <Metric label="kg/m" value={String(selectedChain.linearWeightKgM)} />
                  <Metric label="Peso total" value={`${selectedChain.totalWeightKg} kg`} />
                </div>
              )}
            </div>

            <form className="stack" onSubmit={handleEventSubmit}>
              <div className="card">
                <div className="card-tag">Paso 1</div>
                <h2>Evento de calibracion</h2>
                <div className="grid two">
                  <Field label="Fecha y hora" type="datetime-local" value={eventForm.eventDate} onChange={(value) => setEventForm((current) => ({ ...current, eventDate: value }))} />
                  <Field label="Tolerancia (%)" type="number" value={eventForm.tolerancePercent} onChange={(value) => setEventForm((current) => ({ ...current, tolerancePercent: value }))} />
                </div>
              </div>

              <CollapsibleCard title="Paso 2 · Inspeccion previa" hint="Checks obligatorios antes de calibrar." defaultOpen={false}>
                <div className="card-tag">Paso 2</div>
                <h2>Inspeccion previa</h2>
                <p className="hint">Obligatoria antes de calibrar. Si algo no cumple, primero hay que corregirlo.</p>
                <div className="grid two">
                  <CheckField label="Banda vacia" checked={eventForm.precheckBeltEmpty} onChange={(checked) => setEventForm((current) => ({ ...current, precheckBeltEmpty: checked }))} />
                  <CheckField label="Banda limpia" checked={eventForm.precheckBeltClean} onChange={(checked) => setEventForm((current) => ({ ...current, precheckBeltClean: checked }))} />
                  <CheckField label="Sin acumulacion de material" checked={eventForm.precheckNoMaterialBuildup} onChange={(checked) => setEventForm((current) => ({ ...current, precheckNoMaterialBuildup: checked }))} />
                  <CheckField label="Rolos e idlers OK" checked={eventForm.precheckIdlersOk} onChange={(checked) => setEventForm((current) => ({ ...current, precheckIdlersOk: checked }))} />
                  <CheckField label="Estructura sin vibraciones anormales" checked={eventForm.precheckStructureOk} onChange={(checked) => setEventForm((current) => ({ ...current, precheckStructureOk: checked }))} />
                  <CheckField label="Sensor de velocidad OK" checked={eventForm.precheckSpeedSensorOk} onChange={(checked) => setEventForm((current) => ({ ...current, precheckSpeedSensorOk: checked }))} />
                </div>
                <TextArea label="Observaciones de inspeccion" value={eventForm.precheckNotes} onChange={(value) => setEventForm((current) => ({ ...current, precheckNotes: value }))} />
                <div className="result-row"><span>Estado inspeccion</span><strong>{precheckPassed ? 'Completa' : 'Incompleta'}</strong></div>
              </CollapsibleCard>

              <CollapsibleCard title="Paso 3 · Cero" hint="Registro de cero y deriva visible." defaultOpen={false}>
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
              </CollapsibleCard>

              <CollapsibleCard title="Paso 4 · Foto de parametros" hint="Datos del controlador al momento de calibrar." defaultOpen={false}>
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
                <TextArea label="Constantes internas" value={eventForm.internalConstants} onChange={(value) => setEventForm((current) => ({ ...current, internalConstants: value }))} />
                <TextArea label="Parametros extra" value={eventForm.extraParameters} onChange={(value) => setEventForm((current) => ({ ...current, extraParameters: value }))} />
                <TextArea label="Motivo del cambio de parametros" value={eventForm.changedReason} onChange={(value) => setEventForm((current) => ({ ...current, changedReason: value }))} />
              </CollapsibleCard>

              <CollapsibleCard title="Paso 5 · Span con cadena" hint="Lectura promedio contra peso patron." defaultOpen={false}>
                <div className="card-tag">Paso 5</div>
                <h2>Span con peso patron (cadena)</h2>
                <div className="grid two">
                  <Field label="Kg/m de cadena" type="number" value={eventForm.chainLinearKgM} onChange={(value) => setEventForm((current) => ({ ...current, chainLinearKgM: value }))} />
                  <Field label="Cantidad de pasadas" type="number" value={eventForm.passCount} onChange={(value) => setEventForm((current) => ({ ...current, passCount: value }))} />
                  <Field label="Promedio lectura controlador (kg/m)" type="number" value={eventForm.avgControllerReadingKgM} onChange={(value) => setEventForm((current) => ({ ...current, avgControllerReadingKgM: value }))} />
                  <Field label="Factor provisorio" type="number" value={eventForm.provisionalFactor} onChange={(value) => setEventForm((current) => ({ ...current, provisionalFactor: value }))} />
                </div>
                <div className="grid three compact-top">
                  <Metric label="Error promedio" value={`${round(avgErrorPct)} %`} />
                  <Metric label="Referencia cadena" value={`${round(Number(eventForm.chainLinearKgM) || 0)} kg/m`} />
                  <Metric label="Promedio controlador" value={`${round(Number(eventForm.avgControllerReadingKgM) || 0)} kg/m`} />
                </div>
              </CollapsibleCard>

              <CollapsibleCard title="Paso 6 · Acumulado" hint="Control de totalizador y factor de ajuste." defaultOpen={false}>
                <div className="card-tag">Paso 6</div>
                <h2>Acumulado y factor de ajuste</h2>
                <div className="grid two">
                  <Field label="Caudal esperado (tn/h)" type="number" value={eventForm.expectedFlowTph} onChange={(value) => setEventForm((current) => ({ ...current, expectedFlowTph: value }))} />
                  <Field label="Tiempo de prueba (min)" type="number" value={eventForm.accumulatedTestMinutes} onChange={(value) => setEventForm((current) => ({ ...current, accumulatedTestMinutes: value }))} />
                  <Field label={`Acumulado indicado (${selectedEquipment?.totalizerUnit || 'tn'})`} type="number" value={eventForm.accumulatedIndicatedTotal} onChange={(value) => setEventForm((current) => ({ ...current, accumulatedIndicatedTotal: value }))} />
                  <Field label="Factor ajuste antes" type="number" value={eventForm.adjustmentFactorBefore} onChange={(value) => setEventForm((current) => ({ ...current, adjustmentFactorBefore: value }))} />
                </div>
                <div className="grid four compact-top">
                  <Metric label="Acumulado esperado" value={eventForm.expectedFlowTph && eventForm.accumulatedTestMinutes ? String(round((Number(eventForm.expectedFlowTph) * Number(eventForm.accumulatedTestMinutes)) / 60, 6)) : '-'} />
                  <Metric label="Error acumulado" value={eventForm.expectedFlowTph && eventForm.accumulatedTestMinutes && eventForm.accumulatedIndicatedTotal ? `${round((((Number(eventForm.accumulatedIndicatedTotal) - ((Number(eventForm.expectedFlowTph) * Number(eventForm.accumulatedTestMinutes)) / 60)) / ((Number(eventForm.expectedFlowTph) * Number(eventForm.accumulatedTestMinutes)) / 60)) * 100), 3)} %` : '-'} />
                  <Metric label="Factor ajuste sugerido" value={eventForm.expectedFlowTph && eventForm.accumulatedTestMinutes && eventForm.accumulatedIndicatedTotal && eventForm.adjustmentFactorBefore ? String(round(Number(eventForm.adjustmentFactorBefore) * ((((Number(eventForm.expectedFlowTph) * Number(eventForm.accumulatedTestMinutes)) / 60) / Number(eventForm.accumulatedIndicatedTotal))), 6)) : '-'} />
                  <Metric label="Regla" value="Si el instantaneo esta bien, corregir con factor de ajuste" />
                </div>
              </CollapsibleCard>

              <CollapsibleCard title="Paso 7 · Material real" hint="Validacion contra peso externo real." defaultOpen={false}>
                <div className="card-tag">Paso 7</div>
                <h2>Validacion con material real</h2>
                <div className="grid two">
                  <Field label="Peso externo real (kg)" type="number" value={eventForm.externalWeightKg} onChange={(value) => setEventForm((current) => ({ ...current, externalWeightKg: value }))} />
                  <Field label="Peso medido por balanza (kg)" type="number" value={eventForm.beltWeightKg} onChange={(value) => setEventForm((current) => ({ ...current, beltWeightKg: value }))} />
                </div>
                <div className="grid three compact-top">
                  <Metric label="Error material real" value={`${round(materialErrorPct)} %`} />
                  <Metric label="Factor anterior" value={String(round(Number(eventForm.provisionalFactor) || Number(eventForm.calibrationFactor) || 0, 6))} />
                  <Metric label="Factor sugerido" value={String(round(suggestedFactor, 6))} />
                </div>
              </CollapsibleCard>

              <div className="card">
                <div className="card-tag">Paso 8</div>
                <h2>Ajuste final y aprobacion</h2>
                <div className="grid two">
                  <Field label="Factor final" type="number" value={eventForm.finalFactor} onChange={(value) => setEventForm((current) => ({ ...current, finalFactor: value }))} />
                  <div className="system-field">
                    <span>Responsable tecnico</span>
                    <strong>{currentUser.username}</strong>
                  </div>
                </div>
                <TextArea label="Motivo del ajuste" value={eventForm.adjustmentReason} onChange={(value) => setEventForm((current) => ({ ...current, adjustmentReason: value }))} />
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
                <button className="primary" type="submit">Guardar evento</button>
              </div>
            </form>
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
                {chains
                  .filter((item) => !selectedEquipment || item.plant.trim().toLowerCase() === selectedEquipment.plant.trim().toLowerCase())
                  .map((item) => (
                    <option key={item.id} value={item.id}>{item.plant} / {item.name}</option>
                  ))}
              </select>
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
              <div className="grid two">
                <div>
                  <label className="label">Balanza</label>
                  <select className="input" value={historyEquipmentId} onChange={(e) => setHistoryEquipmentId(e.target.value)}>
                    <option value="todos">Todas</option>
                    {equipment.map((item) => (
                      <option key={item.id} value={item.id}>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {filteredEvents.map((item) => {
              const equipmentItem = equipment.find((row) => row.id === item.equipmentId)
              const statusText = computeStatusLabel(item.materialValidation.errorPct, item.tolerancePercent)
              return (
                <div className="card stack" key={item.id}>
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
                        <h3>{item.id}</h3>
                        <p className="hint">{equipmentItem ? `${equipmentItem.plant} / ${equipmentItem.line} / ${equipmentItem.beltCode} / ${equipmentItem.scaleName}` : 'Equipo no encontrado'}</p>
                      </div>
                    </div>
                    {canDelete && (
                      <button className="secondary small danger" onClick={() => handleDeleteEvent(item.id)}>
                        Eliminar
                      </button>
                    )}
                  </div>
                  <p className="hint">{formatDateTime(item.eventDate)} | {item.approval.technician}</p>
                  <details className="inline-details">
                    <summary>Ver detalle</summary>
                    <div className="grid four compact-top">
                      <Metric label="Error cadena" value={`${item.chainSpan.avgErrorPct} %`} />
                      <Metric label="Error acumulado" value={`${item.accumulatedCheck.errorPct || 0} %`} />
                      <Metric label="Error material" value={`${item.materialValidation.errorPct} %`} />
                      <Metric label="Factor final" value={String(item.finalAdjustment.factorAfter)} />
                      <Metric label="Estado" value={statusText} />
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
                <button className="primary" type="submit" disabled={userManagementLoading}>Crear usuario</button>
              </form>
            </div>
            <div className="card stack">
              <div className="row wrap">
                <div>
                  <h2>Usuarios activos</h2>
                  <p className="hint">Los cambios se aplican sobre Supabase Auth.</p>
                </div>
                <button className="secondary small" onClick={loadManagedUsers} disabled={userManagementLoading}>Actualizar</button>
              </div>
              {managedUsers.map((user) => (
                <div className="result-row" key={user.id}>
                  <span>{user.username || user.email} · {user.email} · {user.role}</span>
                  <button className="secondary small danger" disabled={user.id === currentUser.id || userManagementLoading} onClick={() => handleDeleteUser(user)}>Eliminar</button>
                </div>
              ))}
              {managedUsers.length === 0 && <div className="result-row"><span>No hay usuarios cargados o no se cargó la lista.</span><strong>-</strong></div>}
            </div>
          </section>
        )}

      </main>

      <nav className={`bottom-nav ${canManageUsers ? 'five' : canOperate ? 'four' : canReview ? 'three' : 'two'}`}>
        {canReview && <button className={screen === 'balanzas' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('balanzas')}>Balanzas</button>}
        <button className={screen === 'herramientas' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('herramientas')}>Herramientas</button>
        {canOperate && <button className={screen === 'nueva' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('nueva')}>Nueva</button>}
        <button className={screen === 'historial' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('historial')}>Historial</button>
        {canManageUsers && <button className={screen === 'usuarios' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('usuarios')}>Usuarios</button>}
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
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
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
