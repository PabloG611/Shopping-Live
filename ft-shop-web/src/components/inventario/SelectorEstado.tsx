/**
 * Selector de estado del bien (B/R/M) con dropdown custom.
 * Usa un portal (document.body) para que el dropdown no se corte por overflow de la tabla.
 * Usado en Inventario Físico e Inventario Regional.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

type EstadoBien = 'B' | 'R' | 'M'

interface SelectorEstadoProps {
  valor: EstadoBien
  onChange: (nuevoEstado: EstadoBien) => void
}

const ESTADOS: { key: EstadoBien; label: string; color: string; bg: string; border: string }[] = [
  { key: 'B', label: 'Bueno', color: '#155724', bg: '#d4edda', border: '#a5d6a7' },
  { key: 'R', label: 'Regular', color: '#856404', bg: '#fff3cd', border: '#ffc107' },
  { key: 'M', label: 'Malo', color: '#721c24', bg: '#f8d7da', border: '#f5c6cb' },
]

export default function SelectorEstado({ valor, onChange }: SelectorEstadoProps) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const calcularPosicion = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2,
    })
  }, [])

  const abrir = () => {
    calcularPosicion()
    setAbierto(true)
  }

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!abierto) return
    const handleClickFuera = (e: MouseEvent) => {
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return
      // No cerrar si el click es dentro del dropdown (portal)
      const target = e.target as HTMLElement
      if (target.closest('[data-selector-estado-dropdown]')) return
      setAbierto(false)
    }
    const handleScroll = () => setAbierto(false)
    document.addEventListener('mousedown', handleClickFuera)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickFuera)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [abierto])

  const actual = ESTADOS.find(e => e.key === valor) || ESTADOS[0]

  return (
    <>
      {/* Pill del estado actual */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => abierto ? setAbierto(false) : abrir()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          padding: '0.3rem 0.6rem',
          fontSize: '0.78rem',
          fontWeight: 700,
          border: `2px solid ${actual.border}`,
          borderRadius: '6px',
          background: actual.bg,
          color: actual.color,
          cursor: 'pointer',
          transition: 'all 0.15s',
          minWidth: '42px',
          justifyContent: 'center',
        }}
        title={`Estado: ${actual.label} — Click para cambiar`}
      >
        {actual.key}
        <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>▼</span>
      </button>

      {/* Dropdown via portal */}
      {abierto && createPortal(
        <div data-selector-estado-dropdown style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          transform: 'translateX(-50%)',
          zIndex: 99999,
          background: 'white',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          overflow: 'hidden',
          minWidth: '100px',
          animation: 'fadeIn 0.12s ease-out',
        }}>
          {ESTADOS.map(est => {
            const esActual = est.key === valor
            return (
              <button
                key={est.key}
                type="button"
                onClick={() => {
                  if (!esActual) onChange(est.key)
                  setAbierto(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: 'none',
                  borderBottom: est.key !== 'M' ? '1px solid #f0f0f0' : 'none',
                  background: esActual ? est.bg : 'white',
                  cursor: esActual ? 'default' : 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: esActual ? 700 : 500,
                  color: esActual ? est.color : '#303d50',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!esActual) e.currentTarget.style.background = '#f8f9fa' }}
                onMouseLeave={(e) => { if (!esActual) e.currentTarget.style.background = 'white' }}
              >
                <span style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: est.bg,
                  border: `2px solid ${est.border}`,
                  flexShrink: 0,
                }} />
                <span>{est.label}</span>
                {esActual && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}
