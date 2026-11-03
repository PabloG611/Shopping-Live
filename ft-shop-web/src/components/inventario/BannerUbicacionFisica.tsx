/**
 * BannerUbicacionFisica — Ubicación física de la sesión
 *
 * Input compacto que se muestra junto al banner de "persona presente". El
 * inventarista escribe una ubicación física (ej. "Piso 3 - Oficina 302") y
 * todos los bienes que se agreguen a la tabla se asocian a esa ubicación.
 *
 * Si se deja vacío, cada bien conserva su ubicación de origen (como antes).
 */

import { useState, useEffect } from 'react'

interface BannerUbicacionFisicaProps {
  ubicacion: string
  onCambiar: (ubicacion: string) => void
  /** Cuando va dentro de un recuadro compartido, quita el margen exterior. */
  embedded?: boolean
}

export default function BannerUbicacionFisica({ ubicacion, onCambiar, embedded }: BannerUbicacionFisicaProps) {
  // Buffer local para no re-renderizar el padre en cada tecla.
  const [valor, setValor] = useState(ubicacion)

  useEffect(() => { setValor(ubicacion) }, [ubicacion])

  const confirmar = () => {
    const limpio = valor.trim()
    if (limpio !== ubicacion) onCambiar(limpio)
  }

  const tieneUbicacion = ubicacion.trim().length > 0

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', justifyContent: 'center',
      padding: '7px 10px', marginBottom: embedded ? 0 : '8px',
      background: tieneUbicacion ? '#dbeafe' : '#eff6ff',
      border: `1px solid ${tieneUbicacion ? '#60a5fa' : '#bfdbfe'}`,
      borderLeft: `3px solid ${tieneUbicacion ? '#2563eb' : '#3b82f6'}`,
      borderRadius: '8px',
    }}>
      {/* Título del campo */}
      <span style={{
        fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.04em', color: '#1e40af',
      }}>
        Indicaciones generales
      </span>
      {/* Input (misma altura que el selector de persona) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          type="text"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar() } }}
          placeholder="Ubicación relativa del bien (ej: cerca al ascensor, al lado de la oficina del director, cuarto técnico)"
          title="Referencia de dónde está físicamente el bien dentro del sitio (ubicación relativa). Si la deja vacía, cada bien conserva su ubicación de origen."
          className="banner-ubic-input"
          style={{
            flex: 1, minWidth: 0, padding: '0.5rem 0.75rem', fontSize: '0.85rem',
            border: '1px solid #cbd5e1', borderRadius: '8px',
            background: '#fff', color: '#303d50', fontWeight: 600, outline: 'none',
          }}
        />
        {tieneUbicacion && (
          <button
            type="button"
            onClick={() => { setValor(''); onCambiar('') }}
            title="Quitar ubicación física"
            style={{
              width: '28px', height: '34px', borderRadius: '6px',
              border: '1px solid #fca5a5', background: '#fff',
              color: '#dc2626', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
