import { Printer, Trash2 } from 'lucide-react'
import type { CalibrationEvent, Equipment, EventAttachment, MaterialPass } from '../types'
import { EquipmentPhoto } from './EquipmentPhoto'
import { Metric } from './Metric'

type MaterialSummary = {
  status: string
  errorPct: number
  passes: MaterialPass[]
  finalPass?: MaterialPass
  adjustmentApplied: boolean
}

type HistoryEventCardProps = {
  item: CalibrationEvent
  equipmentItem?: Equipment
  materialSummary: MaterialSummary
  statusClass: (status: string) => string
  photoUrl: string
  canDelete: boolean
  onOpenPhoto: () => void
  onPrintColor: () => void
  onPrintBlackAndWhite: () => void
  onDelete: () => void
  formatDateTime: (value: string) => string
  formatWeight: (value: number) => string
  getAttachmentUrl: (path: string) => string
  onOpenAttachment: (attachment: EventAttachment) => void
}

export function HistoryEventCard({
  item,
  equipmentItem,
  materialSummary,
  statusClass,
  photoUrl,
  canDelete,
  onOpenPhoto,
  onPrintColor,
  onPrintBlackAndWhite,
  onDelete,
  formatDateTime,
  formatWeight,
  getAttachmentUrl,
  onOpenAttachment,
}: HistoryEventCardProps) {
  const statusText = materialSummary.status
  const chainBridgeLengthM = item.chainSpan.bridgeLengthM || item.parameterSnapshot.bridgeLengthM || equipmentItem?.bridgeLengthM || 0
  const chainExpectedWeightKg = item.chainSpan.expectedControllerWeightKg || (item.chainSpan.chainLinearKgM && chainBridgeLengthM ? item.chainSpan.chainLinearKgM * chainBridgeLengthM : 0)
  const chainControllerWeightKg = item.chainSpan.controllerReadingWeightKg || 0
  const attachments = item.attachments || []

  return (
    <div className={`card stack history-card status-${statusClass(statusText)}`}>
      <div className="row wrap">
        <div className="equipment-card-head">
          {equipmentItem && (
            <EquipmentPhoto
              photoUrl={photoUrl}
              label={equipmentItem.scaleName}
              status={statusText}
              compact
              onOpen={onOpenPhoto}
            />
          )}
          <div>
            <span className="section-kicker">{statusText}</span>
            <h3>{item.id}</h3>
            <p className="hint">{equipmentItem ? `${equipmentItem.plant} / ${equipmentItem.line} / ${equipmentItem.beltCode} / ${equipmentItem.scaleName}` : 'Equipo no encontrado'}</p>
          </div>
        </div>
        <div className="row compact-actions">
          <button className="secondary small" type="button" onClick={onPrintColor}>
            <Printer className="action-icon" aria-hidden="true" />Imprimir color
          </button>
          <button className="secondary small" type="button" onClick={onPrintBlackAndWhite}>
            <Printer className="action-icon" aria-hidden="true" />Imprimir B/N
          </button>
          {canDelete && (
            <button className="secondary small danger" type="button" onClick={onDelete}>
              <Trash2 className="action-icon" aria-hidden="true" />Eliminar
            </button>
          )}
        </div>
      </div>
      <p className="hint">{formatDateTime(item.eventDate)} | {item.approval.technician}</p>
      <details className="inline-details">
        <summary>Ver detalle</summary>
        <div className="grid four compact-top">
          <Metric label="Error cadena" value={`${item.chainSpan.avgErrorPct} %`} />
          <Metric label="Cadena esperada" value={chainExpectedWeightKg ? formatWeight(chainExpectedWeightKg) : '-'} />
          <Metric label="Cadena controlador" value={chainControllerWeightKg ? formatWeight(chainControllerWeightKg) : '-'} />
          <Metric label="Error acumulado" value={`${item.accumulatedCheck.errorPct || 0} %`} />
          <Metric label="Error material final" value={`${materialSummary.errorPct} %`} />
          <Metric label="Factor final" value={String(item.finalAdjustment.factorAfter)} />
          <Metric label="Version app" value={item.appVersion || item.parameterSnapshot.appVersion || '-'} />
          <Metric label="Pasadas" value={String(materialSummary.passes.length)} />
          <Metric label="Ajuste" value={materialSummary.adjustmentApplied ? 'Si' : 'No'} />
          <Metric label="Accion recomendada" value={statusClass(statusText) === 'danger' ? 'Revisar desvio' : statusClass(statusText) === 'warning' ? 'Cargar control' : 'Seguimiento normal'} />
        </div>
        <div className="material-pass-list compact-top">
          {materialSummary.passes.map((pass) => (
            <div className="result-row material-pass-row" key={`${item.id}-${pass.index}`}>
              <span>Pasada {pass.index} {materialSummary.finalPass?.index === pass.index ? '· final' : ''}</span>
              <strong>{formatWeight(pass.externalWeightKg)} cert. / {formatWeight(pass.beltWeightKg)} ctrl. / {pass.errorPct} %</strong>
              {pass.notes && <p>Observacion: {pass.notes}</p>}
            </div>
          ))}
        </div>
        {attachments.length > 0 && (
          <div className="event-attachment-strip compact-top">
            {attachments.map((attachment, index) => {
              const attachmentUrl = getAttachmentUrl(attachment.path)
              return (
                <button className="event-attachment-history-thumb" type="button" key={attachment.id || attachment.path} onClick={() => onOpenAttachment(attachment)} disabled={!attachmentUrl}>
                  {attachmentUrl ? <img src={attachmentUrl} alt={attachment.name || `Foto ${index + 1}`} loading="lazy" decoding="async" /> : <span>Sin vista</span>}
                  <strong>{attachment.name || `Foto ${index + 1}`}</strong>
                </button>
              )
            })}
          </div>
        )}
        {item.diagnosis && <p className="hint compact-top">Diagnostico: {item.diagnosis}</p>}
        {item.finalAdjustment.reason && <p className="hint">Motivo ajuste: {item.finalAdjustment.reason}</p>}
        {item.notes && <p>{item.notes}</p>}
      </details>
    </div>
  )
}
