/**
 * Selector de ubicación con búsqueda por código o nombre.
 * Filtra localmente sobre el catálogo ya cargado (UBICACION de Activos Fijos).
 * Uso: edición individual por fila y aplicación masiva desde el input maestro.
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import type { UbicacionOption } from '../../services/adminBaseDatosService'

interface SelectorUbicacionProps {
  /** Catálogo completo de ubicaciones (cargado una vez por el padre) */
  ubicaciones: UbicacionOption[]
  /** ubicacionId actualmente seleccionado (o null si sin ubicación) */
  valor: number | null
  /** Callback al seleccionar (o limpiar con null) */
  onSeleccionar: (ubicacionId: number | null, label: string | null) => void
  placeholder?: string
  autoFocus?: boolean
  /** Estilo compacto para usar dentro de la tabla */
  compacto?: boolean
}

export default function SelectorUbicacion({
  ubicaciones,
  valor,
  onSeleccionar,
  placeholder = 'Buscar ubicación...',
  autoFocus = false,
  compacto = false,
}: SelectorUbicacionProps) {
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [indiceActivo, setIndiceActivo] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Label de la ubicación actualmente seleccionada
  const seleccionada = useMemo(
    () => (valor != null ? ubicaciones.find(u => u.ubicacionId === valor) ?? null : null),
    [valor, ubicaciones]
  )

  // Resultados filtrados localmente (máx 50 para no saturar el DOM)
  const resultados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return ubicaciones.slice(0, 50)
    return ubicaciones
      .filter(u => u.label.toLowerCase().includes(t))
      .slice(0, 50)
  }, [busqueda, ubicaciones])

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(timer)
    }
  }, [autoFocus])

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!abierto) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [abierto])

  const seleccionar = (u: UbicacionOption | null) => {
    onSeleccionar(u ? u.ubicacionId : null, u ? u.label : null)
    setBusqueda('')
    setAbierto(false)
    setIndiceActivo(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!abierto) {
      if (e.key === 'ArrowDown') { setAbierto(true) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndiceActivo(prev => (prev + 1) % Math.max(resultados.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndiceActivo(prev => (prev - 1 + resultados.length) % Math.max(resultados.length, 1))
    } else if (e.key === 'Enter' && indiceActivo >= 0 && resultados[indiceActivo]) {
      e.preventDefault()
      seleccionar(resultados[indiceActivo])
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  const fontSize = compacto ? '0.8rem' : '0.85rem'
  const padding = compacto ? '0.35rem 0.5rem' : '0.5rem 0.75rem'

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }} data-selector="ubicacion">
      <div
        onClick={() => { setAbierto(true); setTimeout(() => inputRef.current?.focus(), 40) }}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding,
          border: '1.5px solid ' + (abierto ? '#303d50' : '#cbd5e1'),
          borderRadius: '7px',
          cursor: 'text',
          background: 'white',
          gap: '0.4rem',
          transition: 'border-color 0.15s',
        }}
      >
        {abierto ? (
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setIndiceActivo(-1) }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize, background: 'transparent', minWidth: 0 }}
          />
        ) : (
          <span style={{
            flex: 1, fontSize,
            color: seleccionada ? '#1e293b' : '#9ca3af',
            fontWeight: seleccionada ? 500 : 400,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {seleccionada ? seleccionada.label : '— Sin ubicación —'}
          </span>
        )}

        {seleccionada && !abierto && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); seleccionar(null) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.15rem', fontSize: '0.9rem', color: '#6c757d', lineHeight: 1 }}
            title="Quitar ubicación"
          >
            ×
          </button>
        )}
      </div>

      {abierto && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 3px)',
          left: 0,
          right: 0,
          zIndex: 1000,
          background: 'white',
          border: '1px solid #dee2e6',
          borderRadius: '9px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: '240px',
          overflowY: 'auto',
        }}>
          {/* Opción para limpiar */}
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); seleccionar(null) }}
            style={{
              display: 'block', width: '100%', padding: '0.5rem 0.75rem',
              border: 'none', borderBottom: '1px solid #f1f5f9', background: 'white',
              cursor: 'pointer', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'left', fontStyle: 'italic',
            }}
          >
            — Sin ubicación —
          </button>

          {resultados.length === 0 ? (
            <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
              Sin coincidencias
            </div>
          ) : (
            resultados.map((u, i) => {
              const esActivo = i === indiceActivo
              const esSeleccionada = u.ubicacionId === valor
              return (
                <button
                  key={u.ubicacionId}
                  onMouseDown={(e) => { e.preventDefault(); seleccionar(u) }}
                  onMouseEnter={() => setIndiceActivo(i)}
                  style={{
                    display: 'block', width: '100%', padding: '0.5rem 0.75rem',
                    border: 'none', borderBottom: '1px solid #f8f9fa',
                    background: esActivo ? '#e3f2fd' : (esSeleccionada ? '#f0fdf4' : 'white'),
                    cursor: 'pointer', fontSize: '0.82rem', color: '#303d50', textAlign: 'left',
                    fontWeight: esSeleccionada ? 600 : 400,
                  }}
                >
                  {u.label}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
