export const DEFAULT_CHECK_INTERVAL_DAYS = 30

export type SpeedSource = 'automatica' | 'calculada' | 'rpm'
export type SyncStatus = 'pendiente' | 'sincronizado' | 'error'

export type Equipment = {
  id: string
  plant: string
  line: string
  beltCode: string
  scaleName: string
  controllerModel: string
  controllerSerial: string
  beltWidthMm: number
  beltLengthM: number
  nominalCapacityTph: number
  bridgeLengthM: number
  nominalSpeedMs: number
  speedSource: SpeedSource
  rpmRollDiameterMm: number
  calibrationFactorCurrent: number
  adjustmentFactorCurrent: number
  checkIntervalDays: number
  totalizerUnit: string
  photoPath: string
  notes: string
  createdAt: string
}

export type Chain = {
  id: string
  plant: string
  name: string
  linearWeightKgM: number
  totalLengthM: number
  totalWeightKg: number
  notes: string
  createdAt: string
}

export type ParameterSnapshot = {
  calibrationFactor: number
  zeroValue: number
  spanValue: number
  filterValue: string
  bridgeLengthM: number
  nominalSpeedMs: number
  units: string
  internalConstants: string
  extraParameters: string
  changedBy: string
  changedReason: string
}

export type Precheck = {
  beltEmpty: boolean
  beltClean: boolean
  noMaterialBuildup: boolean
  idlersOk: boolean
  structureOk: boolean
  speedSensorOk: boolean
  notes: string
}

export type ZeroCheck = {
  completed: boolean
  displayUnit: string
  beforeValue: string
  afterValue: string
  adjusted: boolean
  notes: string
}

export type ChainSpan = {
  chainId: string
  chainName: string
  chainLinearKgM: number
  passCount: number
  avgControllerReadingKgM: number
  avgErrorPct: number
  provisionalFactor: number
}

export type MaterialValidation = {
  externalWeightKg: number
  beltWeightKg: number
  errorPct: number
  factorBefore: number
  factorSuggested: number
  passes?: MaterialPass[]
  finalPassIndex?: number
  adjustmentApplied?: boolean
  outcome?: MaterialOutcome
}

export type MaterialOutcome = 'control_conforme' | 'calibrada_ajustada' | 'fuera_tolerancia' | 'ajuste_sin_verificacion'

export type MaterialPass = {
  index: number
  externalWeightKg: number
  beltWeightKg: number
  factorUsed: number
  errorPct: number
  notes: string
}

export type AccumulatedCheck = {
  expectedFlowTph: number
  testMinutes: number
  expectedTotal: number
  indicatedTotal: number
  errorPct: number
  adjustmentFactorBefore: number
  adjustmentFactorSuggested: number
}

export type FinalAdjustment = {
  factorBefore: number
  factorAfter: number
  reason: string
}

export type Approval = {
  technician: string
  approvedAt: string
}

export type CalibrationEvent = {
  id: string
  equipmentId: string
  createdAt: string
  eventDate: string
  tolerancePercent: number
  precheck: Precheck
  zeroCheck: ZeroCheck
  parameterSnapshot: ParameterSnapshot
  chainSpan: ChainSpan
  accumulatedCheck: AccumulatedCheck
  materialValidation: MaterialValidation
  finalAdjustment: FinalAdjustment
  approval: Approval
  diagnosis: string
  notes: string
  syncStatus: SyncStatus
  syncMessage: string
  syncedAt: string
}

