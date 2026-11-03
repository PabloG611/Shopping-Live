/**
 * BannerPersonaPresente — Modo Delegación
 * 
 * Banner compacto que se muestra encima del escáner. El inventarista indica
 * quién está presente entregando los bienes. Todos los bienes escaneados
 * se auto-asignan a esa persona como "usuario" (custodio).
 * 
 * Si no se selecciona a nadie, los bienes entran sin custodio (como antes).
 */

import { useState } from 'react'
import SelectorCoordinador from './SelectorCoordinador'
import type { TerceroFirebird } from './SelectorCoordinador'

interface PersonaPresente {
  nombre: string
  cedula: string
}

interface BannerPersonaPresenteProps {
  personaPresente: PersonaPresente | null
  onCambiar: (persona: PersonaPresente | null) => void
  /** Cuando va dentro de un recuadro compartido, quita el margen exterior. */
  embedded?: boolean
}

export default function BannerPersonaPresente({ personaPresente, onCambiar, embedded }: BannerPersonaPresenteProps) {
  const [editando, setEditando] = useState(false)

  const handleSeleccionar = (t: TerceroFirebird) => {
    onCambiar({ nombre: t.nombre, cedula: t.cedula })
    setEditando(false)
  }

  const handleQuitar = () => {
    onCambiar(null)
    setEditando(false)
  }

  // Estado: persona seleccionada — mostrar chip compacto
  if (personaPresente && !editando) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', justifyContent: 'center',
        padding: '7px 10px', marginBottom: embedded ? 0 : '8px',
        background: '#dcfce7',
        border: '1px solid #4ade80', borderLeft: '3px solid #16a34a',
        borderRadius: '8px',
      }}>
        {/* Título del campo */}
        <span style={{
          fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.04em', color: '#166534',
        }}>
          ¿Quién tiene los bienes?
        </span>
        {/* Nombre + acciones (misma altura que el input) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '34px' }}>
          <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {personaPresente.nombre}
            <span style={{ fontWeight: 500, color: '#64748b', marginLeft: '6px', fontSize: '0.72rem' }}>
              CC {personaPresente.cedula}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setEditando(true)}
            style={{
              padding: '5px 10px', fontSize: '0.72rem', fontWeight: 600,
              border: '1px solid #86efac', borderRadius: '6px',
              background: '#fff', color: '#166534', cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={handleQuitar}
            title="Quitar persona presente"
            style={{
              width: '28px', height: '30px', borderRadius: '6px',
              border: '1px solid #fca5a5', background: '#fff',
              color: '#dc2626', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  // Estado: sin persona o editando — título + selector (misma estructura que ubicación)
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', justifyContent: 'center',
      padding: '7px 10px', marginBottom: embedded ? 0 : '8px',
      background: editando ? '#fff' : '#fef3c7',
      border: `1px solid ${editando ? '#cbd5e1' : '#f59e0b'}`,
      borderLeft: `3px solid ${editando ? '#365072' : '#d97706'}`,
      borderRadius: '8px',
    }}>
      {/* Título del campo */}
      <span style={{
        fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.04em', color: '#92400e',
      }}>
        ¿Quién tiene los bienes?
      </span>
      {/* Selector (misma altura que el input de ubicación) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SelectorCoordinador
            valor=""
            onChange={() => {}}
            onSeleccionar={handleSeleccionar}
            placeholder="Cédula o nombre de quien tiene los bienes..."
          />
        </div>
        {editando && (
          <button
            type="button"
            onClick={() => setEditando(false)}
            style={{
              padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 600,
              border: '1px solid #e2e8f0', borderRadius: '8px',
              background: '#f8fafc', color: '#64748b', cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}
