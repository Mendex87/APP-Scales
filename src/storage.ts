import { DEFAULT_CHECK_INTERVAL_DAYS } from './types'
import type { CalibrationEvent, Chain, Equipment } from './types'

const EQUIPMENT_KEY = 'balanzas-equipment-v2'
const CHAINS_KEY = 'balanzas-chains-v1'
const EVENTS_KEY = 'balanzas-events-v2'

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
  return parseStorage<Equipment[]>(EQUIPMENT_KEY, []).map(normalizeEquipment)
}

export function saveEquipment(items: Equipment[]) {
  localStorage.setItem(EQUIPMENT_KEY, JSON.stringify(items))
}

export function loadChains(): Chain[] {
  return parseStorage<Chain[]>(CHAINS_KEY, [])
}

export function saveChains(items: Chain[]) {
  localStorage.setItem(CHAINS_KEY, JSON.stringify(items))
}

export function loadEvents(): CalibrationEvent[] {
  return parseStorage<CalibrationEvent[]>(EVENTS_KEY, [])
}

export function saveEvents(items: CalibrationEvent[]) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(items))
}

function normalizeEquipment(item: Equipment): Equipment {
  return {
    ...item,
    checkIntervalDays: Number.isFinite(item.checkIntervalDays) && item.checkIntervalDays > 0
      ? item.checkIntervalDays
      : DEFAULT_CHECK_INTERVAL_DAYS,
  }
}
