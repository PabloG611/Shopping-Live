/**
 * Dot naranja pulsante con tooltip elegante que escapa del overflow de la tabla.
 * El tooltip se posiciona con position:fixed relativo al cursor.
 */
import { useState, useCallback } from 'react'

interface ObsDotTooltipProps {
  texto: string
  onClick: () => void
}

export default function ObsDotTooltip({ texto, onClick }: ObsDotTooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setPos(null)
  }, [])

  const textoCorto = texto.length > 140 ? texto.substring(0, 140) + '…' : texto

  return (
    <>
      <span
        className="bienes-table__obs-dot"
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        aria-label={`Observación: ${textoCorto}`}
      />

      {pos && (
        <div
          style={{
            position: 'fixed',
            left: pos.x + 14,
            top: pos.y - 10,
            zIndex: 9999,
            pointerEvents: 'none',
            // Glassmorphism
            background: 'rgba(24, 30, 42, 0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
            padding: '0.5rem 0.75rem',
            maxWidth: '220px',
            // Texto
            color: '#e8eaf0',
            fontSize: '0.72rem',
            fontWeight: 400,
            lineHeight: 1.55,
            letterSpacing: '0.01em',
            // Prevenir que se corte
            wordBreak: 'break-word',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ff6d00', flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#ff9a4d' }}>
              Observación pendiente
            </span>
          </div>
          <span style={{ color: '#c8cdd8' }}>{textoCorto}</span>
        </div>
      )}
    </>
  )
}
