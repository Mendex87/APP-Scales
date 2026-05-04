import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1'

type SheetsEventSummary = {
  id: string
  eventDate: string
  equipmentId: string
  plant: string
  line: string
  beltCode: string
  scaleName: string
  result: string
  finalErrorPct: number
  tolerancePct: number
  withinTolerance: boolean
  finalExternalWeightKg: number
  finalBeltWeightKg: number
  finalFactor: number
  inspectionOk: boolean
  technician: string
  diagnosisSummary: string
  notesSummary: string
  syncedAt: string
}

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

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables.')
    }

    if (!sheetsWebhookUrl || !sheetsToken) {
      throw new Error('Missing Google Sheets sync configuration.')
    }

    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) {
      throw new Error('Unauthorized.')
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !['admin', 'tecnico'].includes(String(profile?.role || ''))) {
      throw new Error('Only admins and technicians can export events to Sheets.')
    }

    const body = await req.json()
    const event = validateEventSummary(body?.event)

    const response = await fetch(sheetsWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Calibra-Token': sheetsToken,
      },
      body: JSON.stringify({ token: sheetsToken, event }),
    })

    const responseText = await response.text()
    if (!response.ok) {
      throw new Error(`Google Sheets returned ${response.status}: ${responseText}`)
    }

    let parsed: { ok?: boolean; message?: string } = {}
    try {
      parsed = JSON.parse(responseText)
    } catch {
      parsed = { ok: true, message: responseText || 'Resumen exportado a Google Sheets.' }
    }

    if (parsed.ok === false) {
      throw new Error(parsed.message || 'Google Sheets rejected the event summary.')
    }

    return json({ ok: true, message: parsed.message || 'Resumen exportado a Google Sheets.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    return json({ ok: false, message }, 400)
  }
})

function validateEventSummary(value: unknown): SheetsEventSummary {
  if (!value || typeof value !== 'object') throw new Error('Missing event summary.')
  const item = value as Record<string, unknown>
  const required = ['id', 'eventDate', 'equipmentId', 'plant', 'line', 'beltCode', 'scaleName', 'result', 'technician', 'syncedAt']
  for (const key of required) {
    if (!String(item[key] || '').trim()) throw new Error(`Missing event.${key}.`)
  }

  return {
    id: String(item.id),
    eventDate: String(item.eventDate),
    equipmentId: String(item.equipmentId),
    plant: String(item.plant),
    line: String(item.line),
    beltCode: String(item.beltCode),
    scaleName: String(item.scaleName),
    result: String(item.result),
    finalErrorPct: toFiniteNumber(item.finalErrorPct),
    tolerancePct: toFiniteNumber(item.tolerancePct),
    withinTolerance: Boolean(item.withinTolerance),
    finalExternalWeightKg: toFiniteNumber(item.finalExternalWeightKg),
    finalBeltWeightKg: toFiniteNumber(item.finalBeltWeightKg),
    finalFactor: toFiniteNumber(item.finalFactor),
    inspectionOk: Boolean(item.inspectionOk),
    technician: String(item.technician),
    diagnosisSummary: String(item.diagnosisSummary || ''),
    notesSummary: String(item.notesSummary || ''),
    syncedAt: String(item.syncedAt),
  }
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
