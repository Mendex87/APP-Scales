import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  loadAppData,
  saveCalibrationEventRecord,
  saveEquipmentRecord,
  testSupabaseConnection,
  updateCalibrationEventSync,
} from './repository'
import { loadEquipment, loadEvents, loadSettings, saveEquipment, saveEvents, saveSettings } from './storage'
import { isSupabaseConfigured } from './supabase'
import type { CalibrationEvent, Equipment, SpeedSource, SyncStatus } from './types'
import {
  buildSyncPayload,
  computePercentError,
  computeStatusLabel,
  computeSuggestedFactor,
  formatDateTime,
  generateEventCode,
  generateId,
  nowLocalValue,
  round,
} from './utils'

type Screen = 'balanzas' | 'herramientas' | 'nueva' | 'historial' | 'sheets'
const APP_VERSION = 'v0.3.0'

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
  notes: '',
}

const defaultEventForm = {
  eventDate: nowLocalValue(),
  tolerancePercent: '1',
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
  chainLinearKgM: '',
  passCount: '',
  avgControllerReadingKgM: '',
  provisionalFactor: '',
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

function App() {
  const [screen, setScreen] = useState<Screen>('balanzas')
  const [equipment, setEquipment] = useState<Equipment[]>(() => loadEquipment())
  const [events, setEvents] = useState<CalibrationEvent[]>(() => loadEvents())
  const [settings, setSettings] = useState(() => loadSettings())
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('')
  const [equipmentForm, setEquipmentForm] = useState(defaultEquipmentForm)
  const [eventForm, setEventForm] = useState(defaultEventForm)
  const [rpmToolForm, setRpmToolForm] = useState(defaultRpmToolForm)
  const [loopToolForm, setLoopToolForm] = useState(defaultLoopToolForm)
  const [chainToolForm, setChainToolForm] = useState(defaultChainToolForm)
  const [factorToolForm, setFactorToolForm] = useState(defaultFactorToolForm)
  const [historyEquipmentId, setHistoryEquipmentId] = useState('todos')
  const [historyStatus, setHistoryStatus] = useState('todos')
  const [syncNotice, setSyncNotice] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [testingSupabase, setTestingSupabase] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [dataSource, setDataSource] = useState<'local' | 'supabase'>('local')

  useEffect(() => {
    saveEquipment(equipment)
  }, [equipment])

  useEffect(() => {
    saveEvents(events)
  }, [events])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    let cancelled = false

    async function initializeData() {
      try {
        const result = await loadAppData()
        if (cancelled) return
        setEquipment(result.equipment)
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

  const selectedEquipment = useMemo(
    () => equipment.find((item) => item.id === selectedEquipmentId),
    [equipment, selectedEquipmentId],
  )

  useEffect(() => {
    if (!selectedEquipment) return

    setChainToolForm((current) => ({
      ...current,
      trainLengthM: current.trainLengthM || String(selectedEquipment.bridgeLengthM || ''),
      speedMs: current.speedMs || String(selectedEquipment.nominalSpeedMs || ''),
    }))
  }, [selectedEquipment])

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

  const pendingCount = useMemo(() => events.filter((item) => item.syncStatus !== 'sincronizado').length, [events])

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

  const filteredEvents = useMemo(() => {
    return events
      .filter((item) => {
        const matchesEquipment = historyEquipmentId === 'todos' || item.equipmentId === historyEquipmentId
        const matchesStatus = historyStatus === 'todos' || item.syncStatus === historyStatus
        return matchesEquipment && matchesStatus
      })
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
  }, [events, historyEquipmentId, historyStatus])

  function resetEventForm() {
    setEventForm({ ...defaultEventForm, eventDate: nowLocalValue() })
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
      chainLinearKgM: String(round(chainToolResult.kgPerMeter, 6)),
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

  async function handleEquipmentSubmit(event: FormEvent) {
    event.preventDefault()

    const nextEquipment: Equipment = {
      id: generateId(),
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
      notes: equipmentForm.notes.trim(),
      createdAt: new Date().toISOString(),
    }

    if (!nextEquipment.beltCode || !nextEquipment.scaleName || !nextEquipment.controllerModel) return

    try {
      const result = await saveEquipmentRecord(nextEquipment)
      setEquipment((current) => [nextEquipment, ...current.filter((item) => item.id !== nextEquipment.id)])
      setSelectedEquipmentId(nextEquipment.id)
      setEquipmentForm(defaultEquipmentForm)
      setDataSource(result.source)
      setSyncNotice(
        result.source === 'supabase' ? 'Balanza guardada en Supabase.' : 'Balanza guardada solo localmente.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la balanza.'
      setSyncNotice(`Error al guardar balanza: ${message}`)
    }
  }

  async function syncEventRecord(record: CalibrationEvent, equipmentItem: Equipment) {
    if (!settings.googleScriptUrl.trim()) {
      throw new Error('Configurá la URL del Apps Script.')
    }

    const response = await fetch(settings.googleScriptUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(buildSyncPayload(equipmentItem, record)),
    })

    if (!response.ok) {
      throw new Error(`Google Sheets devolvió ${response.status}.`)
    }
  }

  async function testSheetsConnection() {
    if (!settings.googleScriptUrl.trim()) {
      setSyncNotice('Pegá primero la URL de Apps Script.')
      return
    }

    setTestingConnection(true)
    setSyncNotice('Probando conexion con Google Sheets...')

    try {
      const response = await fetch(settings.googleScriptUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ping' }),
      })

      if (!response.ok) {
        throw new Error(`Google Sheets devolvió ${response.status}.`)
      }

      const text = await response.text()
      const payload = JSON.parse(text) as { ok?: boolean; message?: string }
      if (!payload.ok) {
        throw new Error(payload.message || 'La conexion no fue aceptada por Apps Script.')
      }

      setSyncNotice('Conexion con Google Sheets OK.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo conectar.'
      setSyncNotice(`Fallo la prueba de conexion: ${message}`)
    } finally {
      setTestingConnection(false)
    }
  }

  async function handleTestSupabase() {
    setTestingSupabase(true)
    setSyncNotice('Probando conexion con Supabase...')

    try {
      const result = await testSupabaseConnection()
      setSyncNotice(result.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo probar Supabase.'
      setSyncNotice(`Fallo la prueba de Supabase: ${message}`)
    } finally {
      setTestingSupabase(false)
    }
  }

  async function handleEventSubmit(event: FormEvent) {
    event.preventDefault()
    if (!selectedEquipment) return

    const factorBeforeAdjustment = Number(eventForm.provisionalFactor) || Number(eventForm.calibrationFactor) || 0
    const factorAfterAdjustment = Number(eventForm.finalFactor) || suggestedFactor || factorBeforeAdjustment

    const record: CalibrationEvent = {
      id: generateEventCode(eventForm.eventDate, events),
      equipmentId: selectedEquipment.id,
      createdAt: new Date().toISOString(),
      eventDate: new Date(eventForm.eventDate).toISOString(),
      tolerancePercent: Number(eventForm.tolerancePercent) || 1,
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
        changedBy: eventForm.changedBy.trim(),
        changedReason: eventForm.changedReason.trim(),
      },
      chainSpan: {
        chainLinearKgM: Number(eventForm.chainLinearKgM) || 0,
        passCount: Number(eventForm.passCount) || 0,
        avgControllerReadingKgM: Number(eventForm.avgControllerReadingKgM) || 0,
        avgErrorPct: round(avgErrorPct),
        provisionalFactor: Number(eventForm.provisionalFactor) || Number(eventForm.calibrationFactor) || 0,
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
        technician: eventForm.technician.trim(),
        approvedAt: new Date(eventForm.eventDate).toISOString(),
      },
      notes: eventForm.notes.trim(),
      syncStatus: 'pendiente',
      syncMessage: '',
      syncedAt: '',
    }

    if (!record.approval.technician || !record.chainSpan.avgControllerReadingKgM || !record.materialValidation.externalWeightKg) {
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

    try {
      await syncEventRecord(record, selectedEquipment)
      await updateCalibrationEventSync(record.id, {
        syncStatus: 'sincronizado',
        syncMessage: 'Enviado a Google Sheets.',
        syncedAt: new Date().toISOString(),
      })
      setEvents((current) =>
        current.map((item) =>
          item.id === record.id
            ? { ...item, syncStatus: 'sincronizado', syncMessage: 'Enviado a Google Sheets.', syncedAt: new Date().toISOString() }
            : item,
        ),
      )
      setSyncNotice(`Evento ${record.id} sincronizado.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo sincronizar.'
      try {
        await updateCalibrationEventSync(record.id, {
          syncStatus: 'error',
          syncMessage: message,
          syncedAt: '',
        })
      } catch {
        // Keep local state updated even if remote sync status cannot be written.
      }
      setEvents((current) =>
        current.map((item) =>
          item.id === record.id ? { ...item, syncStatus: 'error', syncMessage: message } : item,
        ),
      )
      setSyncNotice(`Evento ${record.id} quedó pendiente: ${message}`)
    }
  }

  async function syncPendingEvents() {
    if (!settings.googleScriptUrl.trim()) {
      setScreen('sheets')
      setSyncNotice('Falta configurar la URL de Apps Script.')
      return
    }

    setSyncing(true)
    setSyncNotice('Sincronizando eventos pendientes...')

    for (const record of events.filter((item) => item.syncStatus !== 'sincronizado')) {
      const equipmentItem = equipment.find((item) => item.id === record.equipmentId)
      if (!equipmentItem) continue

      try {
        await syncEventRecord(record, equipmentItem)
        await updateCalibrationEventSync(record.id, {
          syncStatus: 'sincronizado',
          syncMessage: 'Enviado a Google Sheets.',
          syncedAt: new Date().toISOString(),
        })
        setEvents((current) =>
          current.map((item) =>
            item.id === record.id
              ? { ...item, syncStatus: 'sincronizado', syncMessage: 'Enviado a Google Sheets.', syncedAt: new Date().toISOString() }
              : item,
          ),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo sincronizar.'
        try {
          await updateCalibrationEventSync(record.id, {
            syncStatus: 'error',
            syncMessage: message,
            syncedAt: '',
          })
        } catch {
          // Keep local state updated even if remote sync status cannot be written.
        }
        setEvents((current) =>
          current.map((item) => (item.id === record.id ? { ...item, syncStatus: 'error', syncMessage: message } : item)),
        )
      }
    }

    setSyncing(false)
    setSyncNotice('Sincronización finalizada.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Balanzas Dinamicas</h1>
          <p>Trazabilidad de seteo, Span con peso patron, material real y ajuste final.</p>
        </div>
        <div className="topbar-actions">
          <div className="chip version-chip">{APP_VERSION}</div>
          <div className={`chip ${dataSource === 'supabase' ? 'sincronizado' : 'pendiente'}`}>
            {dataSource === 'supabase' ? 'DB: Supabase' : 'DB: Local'}
          </div>
          <div className="chip">Pendientes: {pendingCount}</div>
          <button className="secondary small" onClick={syncPendingEvents} disabled={syncing || pendingCount === 0}>
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </header>

      {syncNotice && <div className="notice">{syncNotice}</div>}

      {loadingData && <div className="notice">Cargando datos...</div>}

      <main className="content">
        {screen === 'balanzas' && (
          <section className="stack">
            <div className="card stack">
              <div className="row wrap">
                <div>
                  <h2>Listado de balanzas</h2>
                  <p className="hint">La app arranca mostrando equipos y su ultimo estado conocido.</p>
                </div>
                <button className="secondary" onClick={() => setScreen('nueva')}>
                  Nueva calibracion
                </button>
              </div>
              <form className="stack" onSubmit={handleEquipmentSubmit}>
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
                  <div>
                    <label className="label">Origen velocidad</label>
                    <select className="input" value={equipmentForm.speedSource} onChange={(e) => setEquipmentForm((current) => ({ ...current, speedSource: e.target.value as SpeedSource }))}>
                      <option value="automatica">Automatica</option>
                      <option value="calculada">Calculada</option>
                      <option value="rpm">RPM</option>
                    </select>
                  </div>
                  <Field label="Diametro rolo RPM (mm)" type="number" value={equipmentForm.rpmRollDiameterMm} onChange={(value) => setEquipmentForm((current) => ({ ...current, rpmRollDiameterMm: value }))} />
                </div>
                <TextArea label="Observaciones del equipo" value={equipmentForm.notes} onChange={(value) => setEquipmentForm((current) => ({ ...current, notes: value }))} />
                <button className="primary" type="submit">Guardar balanza</button>
              </form>
            </div>

            <div className="stack">
              {equipmentWithLastEvent.map(({ item, lastEvent }) => {
                const statusText = lastEvent
                  ? computeStatusLabel(lastEvent.materialValidation.errorPct, lastEvent.tolerancePercent)
                  : 'Sin calibraciones'
                return (
                  <div className="card" key={item.id}>
                    <div className="row wrap">
                      <div>
                        <h3>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</h3>
                        <p className="hint">{item.controllerModel} {item.controllerSerial ? `| ${item.controllerSerial}` : ''}</p>
                      </div>
                      <button className="secondary small" onClick={() => primeEventForm(item)}>Nueva calibracion</button>
                    </div>
                    <div className="grid four compact-top">
                      <Metric label="Ultimo factor" value={lastEvent ? String(lastEvent.finalAdjustment.factorAfter) : '-'} />
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

        {screen === 'nueva' && (
          <section className="stack">
            <div className="card">
              <label className="label">Balanza</label>
              <select className="input" value={selectedEquipmentId} onChange={(e) => setSelectedEquipmentId(e.target.value)}>
                <option value="">Seleccionar balanza</option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</option>
                ))}
              </select>
              {selectedEquipment && (
                <div className="grid four compact-top">
                  <Metric label="Puente" value={`${selectedEquipment.bridgeLengthM} m`} />
                  <Metric label="Velocidad" value={`${selectedEquipment.nominalSpeedMs} m/s`} />
                  <Metric label="Capacidad" value={`${selectedEquipment.nominalCapacityTph} t/h`} />
                  <Metric label="Origen velocidad" value={selectedEquipment.speedSource} />
                </div>
              )}
            </div>

            <form className="stack" onSubmit={handleEventSubmit}>
              <div className="card">
                <h2>Evento de calibracion</h2>
                <div className="grid two">
                  <Field label="Fecha y hora" type="datetime-local" value={eventForm.eventDate} onChange={(value) => setEventForm((current) => ({ ...current, eventDate: value }))} />
                  <Field label="Tolerancia (%)" type="number" value={eventForm.tolerancePercent} onChange={(value) => setEventForm((current) => ({ ...current, tolerancePercent: value }))} />
                </div>
              </div>

              <div className="card">
                <h2>Foto de parametros</h2>
                <div className="grid two">
                  <Field label="Factor calibracion" type="number" value={eventForm.calibrationFactor} onChange={(value) => setEventForm((current) => ({ ...current, calibrationFactor: value }))} />
                  <Field label="Cero" type="number" value={eventForm.zeroValue} onChange={(value) => setEventForm((current) => ({ ...current, zeroValue: value }))} />
                  <Field label="Span" type="number" value={eventForm.spanValue} onChange={(value) => setEventForm((current) => ({ ...current, spanValue: value }))} />
                  <Field label="Filtro" value={eventForm.filterValue} onChange={(value) => setEventForm((current) => ({ ...current, filterValue: value }))} />
                  <Field label="Puente pesaje (m)" type="number" value={eventForm.snapshotBridgeLengthM} onChange={(value) => setEventForm((current) => ({ ...current, snapshotBridgeLengthM: value }))} />
                  <Field label="Velocidad nominal (m/s)" type="number" value={eventForm.snapshotNominalSpeedMs} onChange={(value) => setEventForm((current) => ({ ...current, snapshotNominalSpeedMs: value }))} />
                  <Field label="Unidades" value={eventForm.units} onChange={(value) => setEventForm((current) => ({ ...current, units: value }))} />
                  <Field label="Quien cambio" value={eventForm.changedBy} onChange={(value) => setEventForm((current) => ({ ...current, changedBy: value }))} />
                </div>
                <TextArea label="Constantes internas" value={eventForm.internalConstants} onChange={(value) => setEventForm((current) => ({ ...current, internalConstants: value }))} />
                <TextArea label="Parametros extra" value={eventForm.extraParameters} onChange={(value) => setEventForm((current) => ({ ...current, extraParameters: value }))} />
                <TextArea label="Motivo del cambio de parametros" value={eventForm.changedReason} onChange={(value) => setEventForm((current) => ({ ...current, changedReason: value }))} />
              </div>

              <div className="card">
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
              </div>

              <div className="card">
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
              </div>

              <div className="card">
                <h2>Ajuste final y aprobacion</h2>
                <div className="grid two">
                  <Field label="Factor final" type="number" value={eventForm.finalFactor} onChange={(value) => setEventForm((current) => ({ ...current, finalFactor: value }))} />
                  <Field label="Tecnico" value={eventForm.technician} onChange={(value) => setEventForm((current) => ({ ...current, technician: value }))} />
                </div>
                <TextArea label="Motivo del ajuste" value={eventForm.adjustmentReason} onChange={(value) => setEventForm((current) => ({ ...current, adjustmentReason: value }))} />
                <TextArea label="Observaciones" value={eventForm.notes} onChange={(value) => setEventForm((current) => ({ ...current, notes: value }))} />
                <button className="primary" type="submit" disabled={!selectedEquipment}>Guardar evento</button>
              </div>
            </form>
          </section>
        )}

        {screen === 'herramientas' && (
          <section className="stack">
            <div className="card">
              <label className="label">Balanza</label>
              <select className="input" value={selectedEquipmentId} onChange={(e) => setSelectedEquipmentId(e.target.value)}>
                <option value="">Seleccionar balanza</option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>{item.plant} / {item.line} / {item.beltCode} / {item.scaleName}</option>
                ))}
              </select>
              {selectedEquipment && (
                <div className="grid four compact-top">
                  <Metric label="Diametro RPM" value={`${selectedEquipment.rpmRollDiameterMm || 0} mm`} />
                  <Metric label="Largo cinta" value={`${selectedEquipment.beltLengthM || 0} m`} />
                  <Metric label="Puente" value={`${selectedEquipment.bridgeLengthM || 0} m`} />
                  <Metric label="Velocidad nominal" value={`${selectedEquipment.nominalSpeedMs || 0} m/s`} />
                </div>
              )}
            </div>

            <div className="card stack">
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
              <button className="secondary" disabled={!rpmToolResult} onClick={() => rpmToolResult && applyMeasuredSpeed(rpmToolResult.speedMs)}>
                Usar velocidad en evento
              </button>
            </div>

            <div className="card stack">
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
              <button className="secondary" disabled={!loopToolResult} onClick={() => loopToolResult && applyMeasuredSpeed(loopToolResult.speedMs)}>
                Usar velocidad en evento
              </button>
            </div>

            <div className="card stack">
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
              <button className="secondary" disabled={!chainToolResult} onClick={applyChainToEvent}>
                Usar datos en evento
              </button>
            </div>

            <div className="card stack">
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
              <button className="secondary" disabled={!factorToolResult} onClick={applyFactorToEvent}>
                Usar factor en evento
              </button>
            </div>
          </section>
        )}

        {screen === 'historial' && (
          <section className="stack">
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
                <div>
                  <label className="label">Sincronizacion</label>
                  <select className="input" value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)}>
                    <option value="todos">Todos</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="sincronizado">Sincronizado</option>
                    <option value="error">Error</option>
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
                    <div>
                      <h3>{item.id}</h3>
                      <p className="hint">{equipmentItem ? `${equipmentItem.plant} / ${equipmentItem.line} / ${equipmentItem.beltCode} / ${equipmentItem.scaleName}` : 'Equipo no encontrado'}</p>
                    </div>
                    <StatusBadge status={item.syncStatus} />
                  </div>
                  <p className="hint">{formatDateTime(item.eventDate)} | {item.approval.technician}</p>
                  <div className="grid four compact-top">
                    <Metric label="Error cadena" value={`${item.chainSpan.avgErrorPct} %`} />
                    <Metric label="Error material" value={`${item.materialValidation.errorPct} %`} />
                    <Metric label="Factor final" value={String(item.finalAdjustment.factorAfter)} />
                    <Metric label="Estado" value={statusText} />
                  </div>
                  {item.finalAdjustment.reason && <p className="hint">Motivo ajuste: {item.finalAdjustment.reason}</p>}
                  {item.syncMessage && <p className="hint">{item.syncMessage}</p>}
                  {item.notes && <p>{item.notes}</p>}
                </div>
              )
            })}

            {filteredEvents.length === 0 && <div className="card">No hay eventos con esos filtros.</div>}
          </section>
        )}

        {screen === 'sheets' && (
          <section className="stack">
            <div className="card stack">
              <h2>Google Sheets</h2>
              <p className="hint">La sincronizacion manda cada evento a varias hojas: equipos, eventos, parametros, span, material real y ajustes.</p>
              <Field label="URL de Apps Script" value={settings.googleScriptUrl} onChange={(value) => setSettings((current) => ({ ...current, googleScriptUrl: value }))} />
              <button className="secondary" onClick={testSheetsConnection} disabled={testingConnection}>
                {testingConnection ? 'Probando...' : 'Probar conexion'}
              </button>
              <button className="primary" onClick={syncPendingEvents} disabled={syncing || pendingCount === 0}>{syncing ? 'Sincronizando...' : 'Enviar pendientes'}</button>
            </div>

            <div className="card stack">
              <h2>Resumen</h2>
              <div className="result-row"><span>Base principal</span><strong>{dataSource === 'supabase' ? 'Supabase' : 'Local'}</strong></div>
              <div className="result-row"><span>Supabase configurado</span><strong>{isSupabaseConfigured ? 'Si' : 'No'}</strong></div>
              <div className="result-row"><span>Balanzas</span><strong>{equipment.length}</strong></div>
              <div className="result-row"><span>Eventos</span><strong>{events.length}</strong></div>
              <div className="result-row"><span>Pendientes</span><strong>{pendingCount}</strong></div>
              <button className="secondary" onClick={handleTestSupabase} disabled={testingSupabase}>
                {testingSupabase ? 'Probando Supabase...' : 'Probar Supabase'}
              </button>
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav five">
        <button className={screen === 'balanzas' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('balanzas')}>Balanzas</button>
        <button className={screen === 'herramientas' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('herramientas')}>Herramientas</button>
        <button className={screen === 'nueva' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('nueva')}>Nueva</button>
        <button className={screen === 'historial' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('historial')}>Historial</button>
        <button className={screen === 'sheets' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('sheets')}>Sheets</button>
      </nav>
    </div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatusBadge({ status }: { status: SyncStatus }) {
  return <span className={`chip ${status}`}>{status}</span>
}

export default App
