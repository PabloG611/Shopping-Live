/**
 * Selector de regional/servicio con búsqueda y navegación por teclado.
 * Reemplaza el <select> nativo por un dropdown custom.
 * Usado en Inventario Regional y Vehículos.
 */
import { useState, useRef, useEffect, useCallback } from 'react'

export interface Regional {
  codigo: string
  nombre: string
}

interface SelectorRegionalProps {
  regionales: Regional[]
  valor: string
  onChange: (codigo: string) => void
  placeholder?: string
}

export default function SelectorRegional({ regionales, valor, onChange, placeholder = 'Buscar regional...' }: SelectorRegionalProps) {
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false)
        setBusqueda('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
    }
  }, [abierto])

  const seleccionada = regionales.find(r => r.codigo === valor)

  const filtradas = regionales.filter(r => {
    if (!busqueda.trim()) return true
    const t = busqueda.trim().toLowerCase()
    return r.nombre.toLowerCase().includes(t) || r.codigo.toLowerCase().includes(t)
  })

  // Auto-seleccionar si hay exactamente 1 coincidencia mientras se busca
  useEffect(() => {
    if (!busqueda.trim() || autoSeleccionadoRef.current) return
    if (filtradas.length === 1 && filtradas[0].codigo !== valor) {
      autoSeleccionadoRef.current = true
      seleccionar(filtradas[0].codigo)
    }
  }, [busqueda, filtradas.length])

  // Reset flag when busqueda changes
  const handleBusquedaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    autoSeleccionadoRef.current = false
    setBusqueda(e.target.value)
    setIndiceActivo(-1)
  }, [])

  const seleccionar = (codigo: string) => {
    onChange(codigo)
    setAbierto(false)
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
      seleccionar(filtradas[indiceActivo].codigo)
    } else if (e.key === 'Escape') {
      setAbierto(false)
      setBusqueda('')
    }
  }

  // Categorizar
  const getCategoria = (codigo: string) => {
    const cod = codigo.replace('3000-', '')
    if (cod.startsWith('ENL')) return 'Enlace'
    if (cod.startsWith('GURP')) return 'Grupo Regional'
    return 'Otro'
  }

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }} data-selector="regional">
      {/* Input / display */}
      <div
        onClick={() => {
          if (!abierto) {
            setAbierto(true)
            // Usar setTimeout mayor que el handler del escáner (50ms) para ganar la carrera de foco
            setTimeout(() => {
              inputRef.current?.focus()
            }, 80)
          }
        }}
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
        {/* Icono */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5c6474" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>

        {abierto ? (
          <input
            ref={inputRef}
            type="text"
            value={busqueda}
            onChange={handleBusquedaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.85rem', background: 'transparent' }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: '0.85rem', color: seleccionada ? '#303d50' : '#6c757d', fontWeight: seleccionada ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {seleccionada ? `${seleccionada.nombre} (${seleccionada.codigo})` : placeholder}
          </span>
        )}

        <span style={{ fontSize: '0.6rem', color: '#6c757d' }}>{abierto ? '▲' : '▼'}</span>
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
          {filtradas.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#6c757d', fontSize: '0.82rem' }}>
              No se encontraron coincidencias
            </div>
          ) : (
            (() => {
              let ultimaCategoria = ''
              return filtradas.map((r, i) => {
                const cat = getCategoria(r.codigo)
                const mostrarHeader = cat !== ultimaCategoria
                ultimaCategoria = cat
                const esActivo = i === indiceActivo
                const esSeleccionado = r.codigo === valor

                return (
                  <div key={r.codigo}>
                    {mostrarHeader && (
                      <div style={{ padding: '0.5rem 0.75rem', background: '#e9ecef', fontSize: '0.72rem', fontWeight: 800, color: '#303d50', textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', top: 0, borderTop: i > 0 ? '2px solid #adb5bd' : 'none', borderBottom: '1px solid #ced4da', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ width: '3px', height: '14px', borderRadius: '2px', background: cat === 'Enlace' ? '#2563eb' : cat === 'Grupo Regional' ? '#7c3aed' : '#64748b' }} />
                        {cat}
                      </div>
                    )}
                    <button
                      onClick={() => seleccionar(r.codigo)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '0.5rem 0.75rem',
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
                      <span>{r.nombre}</span>
                      <span style={{ fontSize: '0.7rem', color: '#6c757d' }}>{r.codigo.replace('3000-', '')}</span>
                    </button>
                  </div>
                )
              })
            })()
          )}
        </div>
      )}
    </div>
  )
}
