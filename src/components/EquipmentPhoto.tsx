type EquipmentPhotoProps = {
  photoUrl: string
  label: string
  status: string
  compact?: boolean
  onOpen: () => void
}

export function EquipmentPhoto({ photoUrl, label, status, compact = false, onOpen }: EquipmentPhotoProps) {
  const initials = label.trim().slice(0, 2).toUpperCase() || 'BD'

  return (
    <button
      className={`equipment-photo ${compact ? 'equipment-photo-compact' : ''}`}
      type="button"
      onClick={photoUrl ? onOpen : undefined}
      disabled={!photoUrl}
      title={photoUrl ? 'Ampliar foto' : 'Sin foto cargada'}
    >
      {photoUrl ? <img src={photoUrl} alt={label} loading="lazy" decoding="async" /> : <span>{initials}</span>}
      <strong>{status}</strong>
    </button>
  )
}
