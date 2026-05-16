import { DEFAULT_CHECK_INTERVAL_DAYS } from './types'
import type { CalibrationEvent, Chain, Equipment, PlantMapPoint, PlantMapPointType } from './types'

const EQUIPMENT_KEY = 'balanzas-equipment-v2'
const CHAINS_KEY = 'balanzas-chains-v1'
const EVENTS_KEY = 'balanzas-events-v2'
const PLANT_MAP_POINTS_KEY = 'calibracinta:plant-map-points:v1'
const PLANT_MAP_POINT_TYPES = new Set<PlantMapPointType>(['belt_scale', 'kiln_scale', 'dispatch_scale', 'truck_scale'])
const DEFAULT_PLANT_MAP_CREATED_AT = '2026-01-01T00:00:00.000Z'

export const DEFAULT_PLANT_MAP_POINTS: PlantMapPoint[] = [
  { id: 'cinta-23', label: 'Cinta 23', zone: 'Transporte principal', pointType: 'belt_scale', x: 30, y: 57, equipmentId: '', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'horno-1', label: 'Horno 1', zone: 'Secado', pointType: 'kiln_scale', x: 36, y: 40, equipmentId: '', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'horno-2', label: 'Horno 2', zone: 'Secado', pointType: 'kiln_scale', x: 47, y: 37, equipmentId: '', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'horno-3', label: 'Horno 3', zone: 'Secado', pointType: 'kiln_scale', x: 58, y: 34, equipmentId: '', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'despacho-1', label: 'Despacho 1', zone: 'Despacho', pointType: 'dispatch_scale', x: 68, y: 57, equipmentId: '', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'despacho-2', label: 'Despacho 2', zone: 'Despacho', pointType: 'dispatch_scale', x: 75, y: 53, equipmentId: '', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'despacho-3', label: 'Despacho 3', zone: 'Despacho', pointType: 'dispatch_scale', x: 82, y: 49, equipmentId: '', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'despacho-4', label: 'Despacho 4', zone: 'Despacho', pointType: 'dispatch_scale', x: 89, y: 45, equipmentId: '', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'bascula-1', label: 'Báscula 1', zone: 'Ingreso camiones', pointType: 'truck_scale', x: 66, y: 78, equipmentId: '', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'bascula-2', label: 'Báscula 2', zone: 'Egreso camiones', pointType: 'truck_scale', x: 78, y: 82, equipmentId: '', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
]

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

export function loadPlantMapPoints(): PlantMapPoint[] {
  const stored = parseStorage<PlantMapPoint[]>(PLANT_MAP_POINTS_KEY, [])
  const source = stored.length > 0 ? stored : DEFAULT_PLANT_MAP_POINTS
  return source.map(normalizePlantMapPoint)
}

export function savePlantMapPoints(items: PlantMapPoint[]) {
  localStorage.setItem(PLANT_MAP_POINTS_KEY, JSON.stringify(items.map(normalizePlantMapPoint)))
}

function normalizeEquipment(item: Equipment): Equipment {
  return {
    ...item,
    checkIntervalDays: Number.isFinite(item.checkIntervalDays) && item.checkIntervalDays > 0
      ? item.checkIntervalDays
      : DEFAULT_CHECK_INTERVAL_DAYS,
  }
}

function normalizePlantMapPoint(item: PlantMapPoint): PlantMapPoint {
  const pointType = PLANT_MAP_POINT_TYPES.has(item.pointType) ? item.pointType : 'belt_scale'
  const now = new Date().toISOString()
  return {
    id: item.id || crypto.randomUUID(),
    label: item.label || 'Punto operativo',
    zone: item.zone || 'Planta',
    pointType,
    x: clampPercent(item.x),
    y: clampPercent(item.y),
    equipmentId: item.equipmentId || '',
    annualCalibrationDate: item.annualCalibrationDate || '',
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || item.createdAt || now,
  }
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 50
  return Math.min(100, Math.max(0, value))
}
