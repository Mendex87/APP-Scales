type HistoryPagerProps = {
  page: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
}

export function HistoryPager({ page, pageSize, totalItems, onPageChange }: HistoryPagerProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = Math.min(safePage * pageSize, totalItems)

  return (
    <div className="history-pager row wrap" aria-label="Paginacion de historial">
      <p className="hint">Mostrando {start}-{end} de {totalItems} eventos</p>
      {totalItems > pageSize && (
        <div className="row compact-actions">
          <button className="secondary small" type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
            Anterior
          </button>
          <span className="chip">Pagina {safePage} de {totalPages}</span>
          <button className="secondary small" type="button" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)}>
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}
