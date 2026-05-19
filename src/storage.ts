import { DEFAULT_CHECK_INTERVAL_DAYS } from './types'
import type { CalibrationEvent, Chain, Equipment, PlantMapObject, PlantMapObjectType, PlantMapPlantId, PlantMapPoint, PlantMapPointType } from './types'

const EQUIPMENT_KEY = 'balanzas-equipment-v2'
const CHAINS_KEY = 'balanzas-chains-v1'
const EVENTS_KEY = 'balanzas-events-v2'
const PLANT_MAP_POINTS_KEY = 'calibracinta:plant-map-points:v1'
const PLANT_MAP_OBJECTS_KEY = 'calibracinta:plant-map-objects:v1'
const PLANT_MAP_INFRASTRUCTURE_KEY = 'calibracinta:plant-map-infrastructure:v1'
const PLANT_MAP_PLANTS = new Set<PlantMapPlantId>(['secado', 'lavado'])
const PLANT_MAP_POINT_TYPES = new Set<PlantMapPointType>(['belt_scale', 'kiln_scale', 'dispatch_scale', 'truck_scale'])
const PLANT_MAP_OBJECT_TYPES = new Set<PlantMapObjectType>([
  'stockpile',
  'belt',
  'kiln',
  'structure',
  'cabin',
  'silo',
  'dispatch_bin',
  'truck_scale',
  'block',
  'rectangular_silo',
  'rectangular_hopper',
  'belt_horizontal',
  'belt_inclined',
  'dispatch_belt',
  'truck',
  'yard',
  'floor',
  'zone',
  'marker',
])
const DEFAULT_PLANT_MAP_CREATED_AT = '2026-01-01T00:00:00.000Z'
const INFRASTRUCTURE_OBJECT_IDS = new Set(['floor-main', 'zone-stock', 'zone-process', 'zone-dispatch', 'zone-truck', 'road-truck', 'road-service', 'road-cross'])

export const DEFAULT_PLANT_MAP_POINTS: PlantMapPoint[] = [
  { id: 'cinta-23', plantId: 'secado', label: 'Cinta 23', zone: 'Transporte principal', pointType: 'belt_scale', x: 30, y: 57, equipmentId: '', objectId: 'belt-cinta-23', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'horno-1', plantId: 'secado', label: 'Horno 1', zone: 'Secado', pointType: 'kiln_scale', x: 36, y: 40, equipmentId: '', objectId: 'kiln-1', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'horno-2', plantId: 'secado', label: 'Horno 2', zone: 'Secado', pointType: 'kiln_scale', x: 47, y: 37, equipmentId: '', objectId: 'kiln-2', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'horno-3', plantId: 'secado', label: 'Horno 3', zone: 'Secado', pointType: 'kiln_scale', x: 58, y: 34, equipmentId: '', objectId: 'kiln-3', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'despacho-1', plantId: 'secado', label: 'Despacho 1', zone: 'Despacho', pointType: 'dispatch_scale', x: 68, y: 57, equipmentId: '', objectId: 'dispatch-1', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'despacho-2', plantId: 'secado', label: 'Despacho 2', zone: 'Despacho', pointType: 'dispatch_scale', x: 75, y: 53, equipmentId: '', objectId: 'dispatch-2', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'despacho-3', plantId: 'secado', label: 'Despacho 3', zone: 'Despacho', pointType: 'dispatch_scale', x: 82, y: 49, equipmentId: '', objectId: 'dispatch-3', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'despacho-4', plantId: 'secado', label: 'Despacho 4', zone: 'Despacho', pointType: 'dispatch_scale', x: 89, y: 45, equipmentId: '', objectId: 'dispatch-4', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'bascula-1', plantId: 'secado', label: 'Báscula 1', zone: 'Ingreso camiones', pointType: 'truck_scale', x: 66, y: 78, equipmentId: '', objectId: 'truck-scale-1', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'bascula-2', plantId: 'secado', label: 'Báscula 2', zone: 'Egreso camiones', pointType: 'truck_scale', x: 78, y: 82, equipmentId: '', objectId: 'truck-scale-2', annualCalibrationDate: '', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
]

const DEFAULT_PLANT_MAP_OBJECT_SEEDS: Array<Partial<PlantMapObject> & Pick<PlantMapObject, 'createdAt' | 'id' | 'label' | 'objectType' | 'rotationY' | 'scale' | 'updatedAt' | 'x' | 'z'>> = [
  { id: 'floor-main', label: 'Piso planta', objectType: 'floor', x: 0, z: 0, elevation: -0.09, rotationY: 0, scale: 1, width: 35, depth: 24, height: 0.18, color: '#d6d2c8', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'zone-stock', label: 'Zona acopios', objectType: 'zone', x: -7.3, z: -1.6, elevation: 0.03, rotationY: 0, scale: 1, width: 5.7, depth: 4.8, height: 0.05, color: '#c98500', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'zone-process', label: 'Zona proceso', objectType: 'zone', x: -1.6, z: -1.8, elevation: 0.03, rotationY: 0, scale: 1, width: 8, depth: 5.6, height: 0.05, color: '#ff5949', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'zone-dispatch', label: 'Zona despacho', objectType: 'zone', x: 6.3, z: -1.5, elevation: 0.03, rotationY: 0, scale: 1, width: 6.6, depth: 5.8, height: 0.05, color: '#5c9a68', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'zone-truck', label: 'Zona camiones', objectType: 'zone', x: 4.8, z: 4.65, elevation: 0.03, rotationY: 0, scale: 1, width: 9.8, depth: 2.7, height: 0.05, color: '#666a70', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'road-truck', label: 'Camino camiones', objectType: 'yard', x: 4.4, z: 4.95, elevation: 0.06, rotationY: -0.12, scale: 1, width: 20, depth: 1.45, height: 0.06, color: '#4b4c50', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'road-service', label: 'Camino servicio', objectType: 'yard', x: -1.8, z: 2.95, elevation: 0.06, rotationY: -0.28, scale: 1, width: 19, depth: 0.78, height: 0.05, color: '#4b4c50', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'road-cross', label: 'Camino transversal', objectType: 'yard', x: 7.6, z: 0.9, elevation: 0.06, rotationY: 0.14, scale: 1, width: 0.08, depth: 17, height: 0.07, color: '#4b4c50', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'stockpile-wet', label: 'Acopio humedo', objectType: 'stockpile', x: -8.1, z: 0.55, rotationY: 0.5, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'stockpile-washed', label: 'Acopio lavado', objectType: 'stockpile', x: -6.6, z: -2.2, rotationY: 0.5, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'mcc-room', label: 'Sala MCC', objectType: 'cabin', x: -8.9, z: 3.05, rotationY: -0.12, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'belt-cinta-23', label: 'Cinta 23', objectType: 'belt', x: -5.3, z: 1.3, rotationY: -0.24, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'belt-feed', label: 'Alimentacion hornos', objectType: 'belt', x: -2.9, z: -0.4, rotationY: -0.62, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'belt-transfer', label: 'Transferencia a silos', objectType: 'belt', x: 2.9, z: -0.15, rotationY: 0.26, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'belt-dispatch', label: 'Cinta despacho', objectType: 'belt', x: 6.5, z: 1.35, rotationY: -0.18, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'kiln-1', label: 'Horno 1', objectType: 'kiln', x: -3.4, z: -2.8, rotationY: -0.12, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'kiln-2', label: 'Horno 2', objectType: 'kiln', x: -0.65, z: -3.15, rotationY: -0.12, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'kiln-3', label: 'Horno 3', objectType: 'kiln', x: 2.1, z: -3.45, rotationY: -0.12, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'screen-house', label: 'Zarandas', objectType: 'structure', x: -0.9, z: 0.9, rotationY: -0.16, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'process-cabin', label: 'Cabina proceso', objectType: 'cabin', x: 1.8, z: 1.1, rotationY: -0.12, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'silo-a', label: 'Silo A', objectType: 'silo', x: 4.6, z: -2.65, rotationY: 0, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'silo-b', label: 'Silo B', objectType: 'silo', x: 6.1, z: -3.05, rotationY: 0, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'silo-c', label: 'Silo C', objectType: 'silo', x: 7.6, z: -3.18, rotationY: 0, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'silo-d', label: 'Silo D', objectType: 'silo', x: 9.1, z: -2.8, rotationY: 0, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'dispatch-1', label: 'Despacho 1', objectType: 'dispatch_bin', x: 4.6, z: 0.55, rotationY: 0, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'dispatch-2', label: 'Despacho 2', objectType: 'dispatch_bin', x: 6.15, z: 0.25, rotationY: 0, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'dispatch-3', label: 'Despacho 3', objectType: 'dispatch_bin', x: 7.7, z: -0.05, rotationY: 0, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'dispatch-4', label: 'Despacho 4', objectType: 'dispatch_bin', x: 9.25, z: 0.25, rotationY: 0, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'dispatch-cabin', label: 'Cabina despacho', objectType: 'cabin', x: 9.6, z: 2, rotationY: -0.12, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'truck-scale-1', label: 'Bascula 1', objectType: 'truck_scale', x: 3.4, z: 4.55, rotationY: -0.12, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'truck-scale-2', label: 'Bascula 2', objectType: 'truck_scale', x: 6.75, z: 5.05, rotationY: -0.12, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'scale-cabin-1', label: 'Cabina B1', objectType: 'cabin', x: 1.35, z: 4.05, rotationY: -0.12, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
  { id: 'scale-cabin-2', label: 'Cabina B2', objectType: 'cabin', x: 9.25, z: 4.55, rotationY: -0.12, scale: 1, createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
]

export const DEFAULT_PLANT_MAP_OBJECTS: PlantMapObject[] = DEFAULT_PLANT_MAP_OBJECT_SEEDS.map(normalizePlantMapObject)

const DEFAULT_LAVADO_PLANT_MAP_OBJECT_SEEDS: Array<Partial<PlantMapObject> & Pick<PlantMapObject, 'createdAt' | 'id' | 'label' | 'objectType' | 'plantId' | 'rotationY' | 'scale' | 'updatedAt' | 'x' | 'z'>> = [
  { id: 'lavado-floor-main', plantId: 'lavado', label: 'Base Lavado', objectType: 'floor', x: 0, z: 0, elevation: -0.09, rotationY: 0, scale: 1, width: 35, depth: 24, height: 0.18, color: '#d6d2c8', createdAt: DEFAULT_PLANT_MAP_CREATED_AT, updatedAt: DEFAULT_PLANT_MAP_CREATED_AT },
]

const DEFAULT_LAVADO_PLANT_MAP_OBJECTS: PlantMapObject[] = DEFAULT_LAVADO_PLANT_MAP_OBJECT_SEEDS.map(normalizePlantMapObject)

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
  return parseStorage<Partial<CalibrationEvent>[]>(EVENTS_KEY, []).map(normalizeEvent)
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

export function loadPlantMapObjects(): PlantMapObject[] {
  const stored = parseStorage<PlantMapObject[]>(PLANT_MAP_OBJECTS_KEY, [])
  const source = stored.length > 0 ? stored : DEFAULT_PLANT_MAP_OBJECTS
  const normalized = source.map(normalizePlantMapObject)
  const migrated = withLavadoBaseObjects(withInfrastructureObjects(normalized))
  if (migrated !== normalized) {
    localStorage.setItem(PLANT_MAP_OBJECTS_KEY, JSON.stringify(migrated.map(normalizePlantMapObject)))
  }
  return migrated
}

export function savePlantMapObjects(items: PlantMapObject[]) {
  localStorage.setItem(PLANT_MAP_OBJECTS_KEY, JSON.stringify(items.map(normalizePlantMapObject)))
}

function normalizeEquipment(item: Equipment): Equipment {
  return {
    ...item,
    checkIntervalDays: Number.isFinite(item.checkIntervalDays) && item.checkIntervalDays > 0
      ? item.checkIntervalDays
      : DEFAULT_CHECK_INTERVAL_DAYS,
  }
}

function normalizeEvent(item: Partial<CalibrationEvent>): CalibrationEvent {
  return {
    ...item,
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
  } as CalibrationEvent
}

function normalizePlantMapPoint(item: Partial<PlantMapPoint>): PlantMapPoint {
  const pointType = item.pointType && PLANT_MAP_POINT_TYPES.has(item.pointType) ? item.pointType : 'belt_scale'
  const now = new Date().toISOString()
  return {
    id: item.id || crypto.randomUUID(),
    plantId: normalizePlantMapPlantId(item.plantId),
    label: item.label || 'Punto operativo',
    zone: item.zone || 'Planta',
    pointType,
    x: clampPercent(item.x ?? 50),
    y: clampPercent(item.y ?? 50),
    equipmentId: item.equipmentId || '',
    objectId: item.objectId || '',
    annualCalibrationDate: item.annualCalibrationDate || '',
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || item.createdAt || now,
  }
}

function normalizePlantMapObject(item: Partial<PlantMapObject>): PlantMapObject {
  const objectType = item.objectType && PLANT_MAP_OBJECT_TYPES.has(item.objectType) ? item.objectType : 'structure'
  const defaults = getDefaultObjectShape(objectType)
  const now = new Date().toISOString()
  return {
    id: item.id || crypto.randomUUID(),
    plantId: normalizePlantMapPlantId(item.plantId),
    label: item.label || 'Objeto 3D',
    objectType,
    x: clampSceneCoordinate(item.x ?? 0),
    z: clampSceneCoordinate(item.z ?? 0),
    elevation: clampObjectElevation(item.elevation ?? defaults.elevation),
    rotationY: Number.isFinite(item.rotationY ?? Number.NaN) ? item.rotationY! : 0,
    scale: clampObjectScale(item.scale ?? 1),
    width: clampObjectDimension(item.width ?? defaults.width),
    depth: clampObjectDimension(item.depth ?? defaults.depth),
    height: clampObjectHeight(item.height ?? defaults.height),
    slope: clampObjectSlope(item.slope ?? defaults.slope),
    color: normalizeColor(item.color || defaults.color),
    modelPath: normalizeModelPath(item.modelPath || ''),
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || item.createdAt || now,
  }
}

function getDefaultObjectShape(type: PlantMapObjectType) {
  if (type === 'stockpile') return { elevation: 0, width: 2.7, depth: 2.1, height: 1.45, slope: 0, color: '#b87a32' }
  if (type === 'belt' || type === 'belt_horizontal') return { elevation: 0, width: 5.6, depth: 0.75, height: 0.35, slope: 0, color: '#17151a' }
  if (type === 'belt_inclined') return { elevation: 0, width: 5.6, depth: 0.75, height: 0.35, slope: 0.38, color: '#17151a' }
  if (type === 'dispatch_bin' || type === 'dispatch_belt') return { elevation: 0, width: 2.1, depth: 0.85, height: 0.45, slope: 0.22, color: '#5c9a68' }
  if (type === 'kiln') return { elevation: 0, width: 4.5, depth: 1.45, height: 1.5, slope: 0, color: '#d85f4f' }
  if (type === 'silo' || type === 'rectangular_silo') return { elevation: 0, width: 1.45, depth: 1.45, height: 3.8, slope: 0, color: '#dfe7e1' }
  if (type === 'rectangular_hopper') return { elevation: 0, width: 1.7, depth: 1.7, height: 1.8, slope: 0, color: '#8fa094' }
  if (type === 'cabin') return { elevation: 0, width: 1.45, depth: 1, height: 1.25, slope: 0, color: '#cbdde2' }
  if (type === 'truck' || type === 'truck_scale') return { elevation: 0, width: 3.9, depth: 1.25, height: 0.7, slope: 0, color: '#d6d2c8' }
  if (type === 'yard') return { elevation: 0, width: 5, depth: 3.2, height: 0.08, slope: 0, color: '#4b4c50' }
  if (type === 'floor') return { elevation: -0.09, width: 35, depth: 24, height: 0.18, slope: 0, color: '#d6d2c8' }
  if (type === 'zone') return { elevation: 0.03, width: 5.8, depth: 4.8, height: 0.05, slope: 0, color: '#c98500' }
  if (type === 'marker') return { elevation: 0, width: 0.55, depth: 0.55, height: 2, slope: 0, color: '#ff5949' }
  return { elevation: 0, width: 2.6, depth: 2.1, height: 1.7, slope: 0, color: '#aeb6b4' }
}

function withInfrastructureObjects(items: PlantMapObject[]) {
  if (localStorage.getItem(PLANT_MAP_INFRASTRUCTURE_KEY) === 'done') return items
  const currentIds = new Set(items.map((item) => item.id))
  const missing = DEFAULT_PLANT_MAP_OBJECTS.filter((item) => INFRASTRUCTURE_OBJECT_IDS.has(item.id) && !currentIds.has(item.id))
  localStorage.setItem(PLANT_MAP_INFRASTRUCTURE_KEY, 'done')
  return missing.length > 0 ? [...missing, ...items] : items
}

function withLavadoBaseObjects(items: PlantMapObject[]) {
  if (items.some((item) => item.plantId === 'lavado')) return items
  return [...items, ...DEFAULT_LAVADO_PLANT_MAP_OBJECTS]
}

function normalizePlantMapPlantId(value: unknown): PlantMapPlantId {
  return PLANT_MAP_PLANTS.has(value as PlantMapPlantId) ? value as PlantMapPlantId : 'secado'
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 50
  return Math.min(100, Math.max(0, value))
}

function clampSceneCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(18, Math.max(-18, value))
}

function clampObjectScale(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(3, Math.max(0.25, value))
}

function clampObjectElevation(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(8, Math.max(-1, value))
}

function clampObjectDimension(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(50, Math.max(0.08, value))
}

function clampObjectHeight(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(12, Math.max(0.01, value))
}

function clampObjectSlope(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1.2, Math.max(-1.2, value))
}

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#aeb6b4'
}

function normalizeModelPath(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('public/') ? `/${trimmed.slice('public/'.length)}` : trimmed
}
