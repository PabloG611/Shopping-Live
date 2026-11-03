/**
 * Avatar chip genérico para mostrar datos de cualquier persona (no solo el logueado).
 * Mismo estilo que UserAvatarChip pero recibe nombre y cédula como props.
 */

import { useState } from 'react'

interface Props {
  nombreCompleto: string
  cedula: string
  grupo?: string
}

function getNombreCorto(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/)
  if (partes.length >= 4) return `${partes[2]} ${partes[0]}`
  if (partes.length === 3) return `${partes[2]} ${partes[0]}`
  return partes.slice(0, 2).join(' ')
}

function getInitials(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/)
  if (partes.length >= 4) return `${partes[2][0]}${partes[0][0]}`
  return partes.slice(0, 2).map(p => p[0]).join('')
}

export function PersonaAvatarChip({ nombreCompleto, cedula, grupo }: Props) {
  const [hover, setHover] = useState(false)

  if (!nombreCompleto) return null

  const nombreCorto = getNombreCorto(nombreCompleto)
  const initials = getInitials(nombreCompleto)

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.3rem 0.75rem 0.3rem 0.3rem',
        background: hover ? 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)' : '#f8fafc',
        border: `1.5px solid ${hover ? '#818cf8' : '#e2e8f0'}`,
        borderRadius: '50px',
        transition: 'all 0.25s ease',
        boxShadow: hover ? '0 4px 12px rgba(99,102,241,0.12)' : 'none',
      }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 700, fontSize: '0.72rem',
          boxShadow: '0 2px 6px rgba(79,70,229,0.25)',
        }}>
          {initials}
        </div>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
          {nombreCorto}
        </span>
      </div>

      {hover && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          background: 'white', border: '1px solid #e2e8f0',
          borderRadius: '12px', padding: '0.75rem 1rem',
          boxShadow: '0 10px 32px rgba(0,0,0,0.1)',
          zIndex: 100, minWidth: '220px', textAlign: 'center',
          animation: 'personaChipIn 0.2s ease',
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.2rem' }}>
            {nombreCompleto}
          </div>
          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>CC {cedula}</div>
          {grupo && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', fontWeight: 600, color: '#4f46e5', background: '#eef2ff', padding: '0.15rem 0.45rem', borderRadius: '4px', display: 'inline-block', border: '1px solid #e0e7ff' }}>
              {grupo}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes personaChipIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
