import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
    const sheetsWebhookUrl = Deno.env.get('GOOGLE_SHEETS_WEBHOOK_URL')
    const sheetsToken = Deno.env.get('GOOGLE_SHEETS_TOKEN')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables.')
    }

    if (!sheetsWebhookUrl || !sheetsToken) {
      throw new Error('Missing Google Sheets sync configuration.')
    }

    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey || '', {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) {
      throw new Error('Unauthorized.')
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    const role = String(profile?.role || '')
    if (!['admin', 'tecnico'].includes(role)) {
      throw new Error('Only admins and technicians can export events to Sheets.')
    }

    const body = await req.json()

    if (!body || typeof body !== 'object') {
      throw new Error('Missing request body.')
    }

    const action = String(body.action || 'upsert_event')

    if (action === 'upsert_event') {
      const eventId = String(body.eventId || '').trim()
      if (!eventId) {
        throw new Error('Missing eventId.')
      }

      const { data: event, error: eventError } = await adminClient
        .from('calibration_events')
        .select('*')
        .eq('id', eventId)
        .single()

      if (eventError || !event) {
        throw new Error('Event not found.')
      }

      const { data: equipment, error: equipError } = await adminClient
        .from('equipments')
        .select('*')
        .eq('id', event.equipment_id)
        .single()

      if (equipError || !equipment) {
        throw new Error('Equipment not found for this event.')
      }

      const sheetsPayload = buildSheetsPayload(event, equipment)

      const response = await fetch(sheetsWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Calibra-Token': sheetsToken,
        },
        body: JSON.stringify({ token: sheetsToken, action: 'upsert_event', event: sheetsPayload }),
      })

      const responseText = await response.text()
      if (!response.ok) {
        throw new Error(`Google Sheets returned ${response.status}: ${responseText}`)
      }

      let parsed: { ok?: boolean; message?: string } = {}
      try {
        parsed = JSON.parse(responseText)
      } catch {
        parsed = { ok: true, message: responseText || 'Google Sheets actualizado.' }
      }

      if (parsed.ok === false) {
        throw new Error(parsed.message || 'Google Sheets rejected the event summary.')
      }

      return json({ ok: true, message: parsed.message || 'Google Sheets actualizado.' })
    }

    if (action === 'delete_event') {
      if (role !== 'admin') {
        throw new Error('Only admins can delete events from Sheets.')
      }
      const eventId = String(body.eventId || '').trim()
      const equipmentId = String(body.equipmentId || '').trim()
      if (!eventId || !equipmentId) {
        throw new Error('Missing eventId or equipmentId.')
      }

      const response = await fetch(sheetsWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Calibra-Token': sheetsToken,
        },
        body: JSON.stringify({ token: sheetsToken, action: 'delete_event', eventId, equipmentId }),
      })

      const responseText = await response.text()
      if (!response.ok) {
        throw new Error(`Google Sheets returned ${response.status}: ${responseText}`)
      }

      return json({ ok: true, message: 'Evento eliminado de Google Sheets.' })
    }

    if (action === 'delete_equipment') {
      if (role !== 'admin') {
        throw new Error('Only admins can delete equipment from Sheets.')
      }
      const equipmentId = String(body.equipmentId || '').trim()
      if (!equipmentId) {
        throw new Error('Missing equipmentId.')
      }

      const response = await fetch(sheetsWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Calibra-Token': sheetsToken,
        },
        body: JSON.stringify({ token: sheetsToken, action: 'delete_equipment', equipmentId }),
      })

      const responseText = await response.text()
      if (!response.ok) {
        throw new Error(`Google Sheets returned ${response.status}: ${responseText}`)
      }

      return json({ ok: true, message: 'Equipo eliminado de Google Sheets.' })
    }

    throw new Error(`Unsupported action: ${action}.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    return json({ ok: false, message }, 400)
  }
})

function buildSheetsPayload(event: Record<string, unknown>, equipment: Record<string, unknown>) {
  const materialValidation = (event.material_validation || {}) as Record<string, unknown>
  const finalAdjustment = (event.final_adjustment || {}) as Record<string, unknown>
  const precheck = (event.precheck || {}) as Record<string, unknown>
  const chainSpan = (event.chain_span || {}) as Record<string, unknown>

  const inspectionOk = Boolean(
    precheck.beltEmpty && precheck.beltClean && precheck.noMaterialBuildup &&
    precheck.idlersOk && precheck.structureOk && precheck.speedSensorOk
  )

  const errorPct = toFiniteNumber(materialValidation.errorPct)
  const tolerancePct = toFiniteNumber(event.tolerance_percent)
  const status = getMaterialOutcome(materialValidation, errorPct, tolerancePct)

  const syncedAt = formatSheetDateTime(new Date().toISOString())
  const eventDate = formatSheetDateTime(String(event.event_date))

  return {
    id: String(event.id),
    eventDate,
    equipmentId: String(event.equipment_id),
    plant: String(equipment.plant || ''),
    line: String(equipment.line || ''),
    beltCode: String(equipment.belt_code || ''),
    scaleName: String(equipment.scale_name || ''),
    result: status,
    finalErrorPct: errorPct,
    tolerancePct,
    withinTolerance: Math.abs(errorPct) <= tolerancePct,
    finalExternalWeightKg: toFiniteNumber(materialValidation.externalWeightKg),
    finalBeltWeightKg: toFiniteNumber(materialValidation.beltWeightKg),
    finalFactor: toFiniteNumber(finalAdjustment.factorAfter),
    inspectionOk,
    technician: String((event.approval as Record<string, unknown>)?.technician || ''),
    diagnosisSummary: String(event.diagnosis || ''),
    notesSummary: String(event.notes || ''),
    syncedAt,
  }
}

function getMaterialOutcome(materialValidation: Record<string, unknown>, errorPct: number, tolerancePct: number) {
  const outcome = String(materialValidation.outcome || '')
  if (outcome === 'control_conforme') return 'Control conforme'
  if (outcome === 'calibrada_ajustada') return 'Calibrada'
  if (outcome === 'fuera_tolerancia') return 'Fuera de tolerancia'
  if (outcome === 'ajuste_sin_verificacion') return 'Ajuste sin verificacion'
  if (Math.abs(errorPct) <= tolerancePct) return 'Control conforme'
  return 'Fuera de tolerancia'
}

function formatSheetDateTime(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(trimmed)) return trimmed

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (isoMatch) {
    const [, year, month, day, hours, minutes] = isoMatch
    return `${day}/${month}/${year} ${hours}:${minutes}`
  }

  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return trimmed
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}