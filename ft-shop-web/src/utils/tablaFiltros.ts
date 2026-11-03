/** Fecha local yyyy-mm-dd a partir de un ISO (para comparar con input type="date"). */
export function fechaIsoALocalYmd(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Búsqueda por subcadena (insensible a mayúsculas). Filtro vacío = coincide siempre. */
export function cumpleFiltroTexto(filtro: string, valorMostrado: string): boolean {
  const f = filtro.trim().toLowerCase()
  if (!f) return true
  return valorMostrado.toLowerCase().includes(f)
}

/** Filtro vacío = coincide. Valor del input type="date" yyyy-mm-dd = día exacto en hora local. */
export function cumpleFiltroFechaDiaLocal(filtroYmd: string, fechaISO: string): boolean {
  const f = filtroYmd.trim()
  if (!f) return true
  return fechaIsoALocalYmd(fechaISO) === f
}

/** Texto libre sobre fecha mostrada, yyyy-mm-dd local o fragmento del ISO. */
export function cumpleFiltroFechaFlexible(filtro: string, fechaISO: string, fechaMostrada: string): boolean {
  const f = filtro.trim().toLowerCase()
  if (!f) return true
  const ymd = fechaIsoALocalYmd(fechaISO).toLowerCase()
  return (
    fechaMostrada.toLowerCase().includes(f) ||
    ymd.includes(f) ||
    fechaISO.toLowerCase().includes(f)
  )
}
