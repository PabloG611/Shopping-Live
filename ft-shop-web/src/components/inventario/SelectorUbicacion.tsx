/**
 * Selector de ubicación con búsqueda y navegación por teclado.
 * Mismo estilo visual que SelectorRegional.
 * Usado en Inventario Regional.
 */
import { useState, useRef, useEffect, useCallback } from 'react'

export interface Ubicacion {
  id: number
  codigo?: string
  nombre?: string
  label: string
}

interface SelectorUbicacionProps {
  ubicaciones: Ubicacion[]
  valor: Ubicacion | null
  onChange: (ubicacion: Ubicacion | null) => void
  placeholder?: string
  cargando?: boolean
}

export default function SelectorUbicacion({ ubicaciones, valor, onChange, placeholder = 'Buscar ubicación...', cargando = false }: SelectorUbicacionProps) {
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [indiceActivo, setIndiceActivo] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoSeleccionadoRef = useRef(false)

  // Cerrar al click fuera
  useEffect(() => {
    if (!abierto) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [abierto])

  const filtradas = ubicaciones.filter(u => {
    if (!busqueda.trim()) return true
    const t = busqueda.trim().toLowerCase()
    return u.label.toLowerCase().includes(t)
  }).slice(0, 20)

  // Auto-seleccionar si hay exactamente 1 coincidencia mientras se busca
  // Auto-seleccionar si hay exactamente 1 coincidencia mientras se busca
  useEffect(() => {
    if (!busqueda.trim() || autoSeleccionadoRef.current) return
    if (filtradas.length === 1 && filtradas[0].id !== valor?.id) {
      autoSeleccionadoRef.current = true
      seleccionar(filtradas[0])
    }
  }, [busqueda, filtradas.length])

  const handleBusquedaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    autoSeleccionadoRef.current = false
    setBusqueda(e.target.value)
    setIndiceActivo(-1)
  }, [])

  const seleccionar = (ubicacion: Ubicacion) => {
    onChange(ubicacion)
    setAbierto(false)
    setBusqueda('')
    setIndiceActivo(-1)
  }

  const limpiar = () => {
    onChange(null)
    setBusqueda('')
    setIndiceActivo(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!abierto && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault()
      setAbierto(true)
      return
    }
    if (!abierto) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndiceActivo(prev => (prev + 1) % filtradas.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndiceActivo(prev => (prev - 1 + filtradas.length) % filtradas.length)
    } else if (e.key === 'Enter' && indiceActivo >= 0) {
      e.preventDefault()
      seleccionar(filtradas[indiceActivo])
    } else if (e.key === 'Escape') {
      setAbierto(false)
      setBusqueda('')
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }} data-selector="ubicacion">
      {/* Input / display */}
      <div
        onClick={() => { setAbierto(!abierto); setTimeout(() => inputRef.current?.focus(), 80) }}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem 0.75rem',
          border: '2px solid ' + (abierto ? '#303d50' : '#dee2e6'),
          borderRadius: '8px',
          cursor: 'pointer',
          background: 'white',
          transition: 'border-color 0.2s',
          gap: '0.5rem',
        }}
      >
        {/* Icono edificio/ubicación */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5c6474" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
          <path d="M9 22v-4h6v4" />
          <path d="M8 6h.01" />
          <path d="M16 6h.01" />
          <path d="M12 6h.01" />
          <path d="M12 10h.01" />
          <path d="M12 14h.01" />
          <path d="M16 10h.01" />
          <path d="M16 14h.01" />
          <path d="M8 10h.01" />
          <path d="M8 14h.01" />
        </svg>

        {abierto ? (
          <input
            ref={inputRef}
            type="text"
            value={busqueda}
            maxLength={20}
            onChange={handleBusquedaChange}
            onKeyDown={handleKeyDown}
            placeholder={cargando ? 'Cargando ubicaciones...' : placeholder}
            autoFocus
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.85rem', background: 'transparent' }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: '0.85rem', color: valor ? '#303d50' : '#6c757d', fontWeight: valor ? 600 : 400 }}>
            {valor ? valor.label : placeholder}
          </span>
        )}

        {/* Botón limpiar o flecha */}
        {valor && !abierto ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); limpiar() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.2rem', fontSize: '0.9rem', color: '#6c757d', lineHeight: 1 }}
            title="Quitar ubicación"
          >
            ×
          </button>
        ) : (
          <span style={{ fontSize: '0.6rem', color: '#6c757d' }}>{abierto ? '▲' : '▼'}</span>
        )}
      </div>

      {/* Dropdown */}
      {abierto && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 9999,
          background: 'white',
          border: '1px solid #dee2e6',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: '280px',
          overflowY: 'auto',
        }}>
          {cargando ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#6c757d', fontSize: '0.82rem' }}>
              Cargando ubicaciones...
            </div>
          ) : filtradas.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#6c757d', fontSize: '0.82rem' }}>
              {busqueda.trim() ? 'No se encontraron coincidencias' : 'Sin ubicaciones disponibles'}
            </div>
          ) : (
            filtradas.map((u, i) => {
              const esActivo = i === indiceActivo
              const esSeleccionado = valor?.id === u.id

              return (
                <button
                  key={u.id}
                  onClick={() => seleccionar(u)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: 'none',
                    borderBottom: '1px solid #f8f9fa',
                    background: esActivo ? '#e3f2fd' : esSeleccionado ? '#f0f7ff' : 'white',
                    cursor: 'pointer',
                    fontSize: '0.83rem',
                    fontWeight: esSeleccionado ? 600 : 400,
                    color: '#303d50',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { setIndiceActivo(i); if (!esSeleccionado) e.currentTarget.style.background = '#f8f9fa' }}
                  onMouseLeave={(e) => { if (!esActivo && !esSeleccionado) e.currentTarget.style.background = 'white' }}
                >
                  <span>{u.label}</span>
                  {esSeleccionado && <span style={{ fontSize: '0.75rem', color: '#2e7d32' }}>✓</span>}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
