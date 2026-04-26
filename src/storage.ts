import type { CalibrationEvent, Equipment, SyncSettings } from './types'

const EQUIPMENT_KEY = 'balanzas-equipment-v2'
const EVENTS_KEY = 'balanzas-events-v2'
const SETTINGS_KEY = 'balanzas-settings-v2'
const DEFAULT_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwGQ4PYavRs7B4YibAjYiKFXYjI8t6HvEcUja6fQ4ztot_pSIGpfMNHqei3rQTPsDR5/exec'

function parseStorage<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function loadEquipment(): Equipment[] {
  return parseStorage<Equipment[]>(EQUIPMENT_KEY, [])
}

export function saveEquipment(items: Equipment[]) {
  localStorage.setItem(EQUIPMENT_KEY, JSON.stringify(items))
}

export function loadEvents(): CalibrationEvent[] {
  return parseStorage<CalibrationEvent[]>(EVENTS_KEY, [])
}

export function saveEvents(items: CalibrationEvent[]) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(items))
}

export function loadSettings(): SyncSettings {
  const saved = parseStorage<SyncSettings>(SETTINGS_KEY, { googleScriptUrl: DEFAULT_GOOGLE_SCRIPT_URL })
  return {
    googleScriptUrl: saved.googleScriptUrl || DEFAULT_GOOGLE_SCRIPT_URL,
  }
}

export function saveSettings(settings: SyncSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
