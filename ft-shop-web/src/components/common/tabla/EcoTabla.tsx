/**
 * EcoTabla — Tabla de datos propia del proyecto, inspirada en el EcoDataTable
 * del ecosistema (react-ecosistema-unp). Conserva la MISMA estética (tokens y
 * clases eco-data-table-*) pero es autónoma (sin react-bootstrap ni react-router)
 * y adaptada a nuestras necesidades: celdas interactivas por columna
 * (renderComponent / onCellClick), resaltado de fila, paginación cliente,
 * estados de carga/vacío. Se puede usar en línea o dentro de un modal
 * (ver ModalEcoTabla).
 *
 * Es DATA-DRIVEN: cada pantalla define sus columnas y cómo se pinta cada celda,
 * por lo que sirve para inventario principal, regional, reportes, etc.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import './EcoTabla.css'

export interface EcoTablaColumna<T> {
  /** Clave única de la columna (y acceso por defecto a row[key]). */
  key: string
  /** Encabezado visible. */
  label: ReactNode
  /** Ancho CSS de la columna (ej. '12%', '120px'). Opcional. */
  width?: string
  /** Alineación del contenido. Default: 'center'. */
  align?: 'left' | 'center' | 'right'
  /** Render personalizado de la celda. Si se omite, muestra row[key]. */
  render?: (row: T, index: number) => ReactNode
  /** Si se define, toda la celda es clickeable (estilo enlace azul). */
  onCellClick?: (row: T, index: number) => void
  /** Quitar el padding de la celda (para controles que ocupan toda la celda). */
  noPadding?: boolean
}

export interface EcoTablaProps<T> {
  columns: EcoTablaColumna<T>[]
  data: T[]
  /** Clave única por fila (para React key y para el id del DOM). */
  getRowKey: (row: T, index: number) => string | number
  /** Estado de carga: muestra el skeleton/placeholder. */
  isLoading?: boolean
  /** Mensaje cuando no hay filas. */
  emptyMessage?: ReactNode
  /** Estilo por fila (ej. resaltar). */
  getRowClassName?: (row: T, index: number) => string | undefined
  getRowStyle?: (row: T, index: number) => CSSProperties | undefined
  /** Prefijo del id del DOM de cada fila (para scroll externo). Default: 'eco-row'. */
  rowIdPrefix?: string
  /** Índice (en data) de la fila a la que hacer auto-scroll (último agregado). */
  scrollToIndex?: number | null
  /** Alto máximo del área scrolleable. Default: '680px'. */
  maxHeight?: string
  /** Paginación cliente. Si se omite, muestra todas las filas. */
  pageSize?: number
  /** Header sticky. Default: true. */
  stickyHeader?: boolean
  className?: string
}

export default function EcoTabla<T>({
  columns,
  data,
  getRowKey,
  isLoading = false,
  emptyMessage = 'No se encontraron registros para mostrar.',
  getRowClassName,
  getRowStyle,
  rowIdPrefix = 'eco-row',
  scrollToIndex = null,
  maxHeight = '680px',
  pageSize,
  stickyHeader = true,
  className = '',
}: EcoTablaProps<T>) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [pagina, setPagina] = useState(0)

  // Paginación cliente (opcional). Sin pageSize, se muestran todas.
  const totalPaginas = pageSize ? Math.max(1, Math.ceil(data.length / pageSize)) : 1
  const paginaSegura = Math.min(pagina, totalPaginas - 1)
  const filasVisibles = useMemo(() => {
    if (!pageSize) return data.map((row, i) => ({ row, i }))
    const inicio = paginaSegura * pageSize
    return data.slice(inicio, inicio + pageSize).map((row, k) => ({ row, i: inicio + k }))
  }, [data, pageSize, paginaSegura])

  // Si cambia el total y la página queda fuera de rango, corregir.
  useEffect(() => {
    if (paginaSegura !== pagina) setPagina(paginaSegura)
  }, [paginaSegura, pagina])

  // Si el índice a resaltar cae en otra página, saltar a esa página primero
  // (para que el auto-scroll pueda encontrar la fila en el DOM).
  useEffect(() => {
    if (scrollToIndex === null || scrollToIndex === undefined || !pageSize) return
    const paginaDestino = Math.floor(scrollToIndex / pageSize)
    if (paginaDestino !== paginaSegura) setPagina(paginaDestino)
  }, [scrollToIndex, pageSize, paginaSegura])

  // Auto-scroll a la fila indicada (último bien agregado). Busca el ancestro
  // scrolleable real para no mover la página entera.
  useEffect(() => {
    if (scrollToIndex === null || scrollToIndex === undefined) return
    const t = window.setTimeout(() => {
      const el = document.getElementById(`${rowIdPrefix}-${scrollToIndex}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 120)
    return () => window.clearTimeout(t)
  }, [scrollToIndex, rowIdPrefix])

  const wrapperClass = ['eco-data-table', stickyHeader ? 'eco-data-table--sticky' : '', className].filter(Boolean).join(' ')

  if (isLoading) {
    return (
      <div className={wrapperClass}>
        <div className="eco-data-table-loading">
          <span className="eco-tabla-spinner" aria-hidden="true" />
          <span>Cargando registros…</span>
        </div>
      </div>
    )
  }

  const alinear = (a?: 'left' | 'center' | 'right') => (a ? { textAlign: a } as CSSProperties : undefined)

  return (
    <div className={wrapperClass}>
      <div
        ref={bodyRef}
        className={`eco-data-table-body-wrap${stickyHeader ? ' eco-data-table-body-wrap--sticky' : ''}`}
        style={{ maxHeight }}
      >
        <div className="eco-data-table-body-content">
          <table className="eco-data-table-grid">
            <colgroup>
              {columns.map((c) => (
                <col key={c.key} style={c.width ? { width: c.width } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={alinear(c.align)}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasVisibles.length > 0 ? (
                filasVisibles.map(({ row, i }) => {
                  const rowKey = getRowKey(row, i)
                  const extraClass = getRowClassName?.(row, i)
                  return (
                    <tr
                      key={rowKey}
                      id={`${rowIdPrefix}-${i}`}
                      className={extraClass || undefined}
                      style={getRowStyle?.(row, i)}
                    >
                      {columns.map((col) => {
                        const interactive = Boolean(col.onCellClick)
                        const contenido = col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? '')
                        return (
                          <td
                            key={col.key}
                            className={[
                              col.noPadding ? 'eco-data-table-cell--no-padding' : '',
                              interactive ? 'eco-data-table-cell--interactive' : '',
                            ].filter(Boolean).join(' ') || undefined}
                            style={alinear(col.align)}
                            onClick={interactive ? (e) => { e.stopPropagation(); col.onCellClick?.(row, i) } : undefined}
                            role={interactive ? 'button' : undefined}
                            tabIndex={interactive ? 0 : undefined}
                            onKeyDown={interactive ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); col.onCellClick?.(row, i) }
                            } : undefined}
                          >
                            {interactive ? <span className="eco-data-table-cell__link-text">{contenido}</span> : contenido}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={columns.length} className="eco-data-table-empty">{emptyMessage}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación cliente (solo si hay más de una página). */}
      {pageSize && totalPaginas > 1 && (
        <div className="eco-tabla-footer">
          <button
            type="button"
            className="eco-tabla-pag-btn"
            disabled={paginaSegura === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            ‹ Anterior
          </button>
          <span className="eco-tabla-pag-info">Página {paginaSegura + 1} de {totalPaginas} · {data.length} registros</span>
          <button
            type="button"
            className="eco-tabla-pag-btn"
            disabled={paginaSegura >= totalPaginas - 1}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
          >
            Siguiente ›
          </button>
        </div>
      )}
    </div>
  )
}
