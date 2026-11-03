/**
 * Modal GRANDE que se muestra cuando un nuevo participante se une al inventario
 * colaborativo del MISMO servicio. Anuncia "Modo colaborativo activado".
 *
 * IMPORTANTE: mientras este modal esté abierto, el usuario NO puede agregar
 * placas (el bloqueo se controla en AdminFlorestaPage: si `nuevoParticipante`
 * != null, `procesarCodigoBarras` no procesa). El usuario DEBE dar "Entendido".
 */
import { FaUsers } from 'react-icons/fa6'
import type { ParticipanteSesion } from '../../hooks/useInventarioColaborativo'

interface ModalNuevoParticipanteProps {
  isOpen: boolean
  participante: ParticipanteSesion | null
  /** Nombre del servicio en el que se activó el modo colaborativo. */
  servicioNombre?: string
  onAceptar: () => void
}

export default function ModalNuevoParticipante({
  isOpen,
  participante,
  servicioNombre,
  onAceptar,
}: ModalNuevoParticipanteProps) {
  if (!isOpen || !participante) return null

  return (
    // Overlay a pantalla completa: tapa toda la UI para forzar el reconocimiento.
    // No se cierra al hacer click fuera; solo con el botón "Entendido".
    <div
      className="inventario-fisico__modal-overlay"
      style={{ background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(3px)' }}
    >
      <div
        className="inventario-fisico__modal"
        role="alertdialog"
        aria-label="Modo colaborativo activado"
        style={{ maxWidth: '560px', width: '92%', overflow: 'hidden' }}
      >
        {/* Header grande */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '2rem 1.5rem 1.6rem',
            background: 'linear-gradient(160deg, #16a34a 0%, #15803d 100%)',
            color: '#fff',
          }}
        >
          <span
            aria-hidden
            style={{
              width: '72px',
              height: '72px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)',
              fontSize: '2rem',
              animation: 'pulse-join 1.5s infinite',
            }}
          >
            <FaUsers />
          </span>
          <h4 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, textAlign: 'center' }}>
            Modo colaborativo activado
          </h4>
          <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.92, fontWeight: 500, textAlign: 'center' }}>
            Ahora comparten la misma toma de inventario en tiempo real
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '1.75rem 1.75rem 1rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 1rem', fontSize: '0.95rem', color: '#475569' }}>
            <strong style={{ color: '#15803d' }}>{participante.usuario}</strong> se conectó al servicio
            {servicioNombre ? <> <strong style={{ color: '#0f172a' }}>{servicioNombre}</strong></> : ' de inventario'}.
          </p>

          {/* Tarjeta del participante */}
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '14px',
              padding: '1.1rem 1.25rem',
              marginBottom: '1.25rem',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#166534', marginBottom: '0.35rem' }}>
              {participante.usuario}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
              {participante.grupo && (
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1565c0', background: '#e3f2fd', padding: '0.2rem 0.65rem', borderRadius: '12px' }}>
                  {participante.grupo}
                </span>
              )}
              {participante.cargo && (
                <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.65rem', borderRadius: '12px' }}>
                  {participante.cargo}
                </span>
              )}
            </div>
          </div>

          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
            Los bienes que registren se sincronizan entre ambos. Debe confirmar
            para continuar agregando placas.
          </p>
        </div>

        {/* Footer */}
        <div className="inventario-fisico__modal-footer" style={{ justifyContent: 'center', paddingBottom: '1.5rem' }}>
          <button
            type="button"
            className="floresta-busqueda__btn"
            style={{ background: '#15803d', padding: '0.65rem 2.5rem', fontSize: '0.95rem', fontWeight: 700 }}
            onClick={onAceptar}
          >
            Entendido, continuar
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse-join {
          0%, 100% { box-shadow: 0 4px 14px rgba(22, 163, 74, 0.35); }
          50% { box-shadow: 0 4px 26px rgba(22, 163, 74, 0.65); }
        }
      `}</style>
    </div>
  )
}
