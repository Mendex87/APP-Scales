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

export type ChainSpan = {
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
  parameterSnapshot: ParameterSnapshot
  chainSpan: ChainSpan
  materialValidation: MaterialValidation
  finalAdjustment: FinalAdjustment
  approval: Approval
  notes: string
  syncStatus: SyncStatus
  syncMessage: string
  syncedAt: string
}

export type SyncSettings = {
  googleScriptUrl: string
}

export type SheetsSyncPayload = {
  action: 'syncCalibrationEvent' | 'ping'
  equipment: Equipment
  event: CalibrationEvent
}
