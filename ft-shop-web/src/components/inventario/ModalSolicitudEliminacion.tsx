/**
 * Modal para solicitudes de eliminación colaborativa.
 * Cuando un participante quiere eliminar un bien o limpiar el inventario,
 * este modal aparece al otro participante para aprobar o rechazar la acción.
 */

export type TipoSolicitudEliminacion = 'eliminar_bien' | 'limpiar_inventario'

export interface SolicitudEliminacion {
  id: string
  tipo: TipoSolicitudEliminacion
  solicitante: string
  solicitante_cedula: string
  /** Placa del bien (solo para eliminar_bien) */
  placa?: string
  /** Descripción del bien (solo para eliminar_bien) */
  descripcion?: string
  /** Total de bienes que se eliminarían (solo para limpiar_inventario) */
  total_bienes?: number
  timestamp: string
}

interface ModalSolicitudEliminacionProps {
  isOpen: boolean
  solicitud: SolicitudEliminacion | null
  onAprobar: (solicitud: SolicitudEliminacion) => void
  onRechazar: (solicitud: SolicitudEliminacion) => void
}

export default function ModalSolicitudEliminacion({
  isOpen,
  solicitud,
  onAprobar,
  onRechazar,
}: ModalSolicitudEliminacionProps) {
  if (!isOpen || !solicitud) return null

  const esLimpiar = solicitud.tipo === 'limpiar_inventario'
  const titulo = esLimpiar ? 'Solicitud: Limpiar inventario' : 'Solicitud: Eliminar bien'
  const color = esLimpiar ? '#e65100' : '#dc3545'

  return (
    <div className="inventario-fisico__modal-overlay">
      <div className="inventario-fisico__modal" style={{ maxWidth: '480px' }}>
        <div
          className="inventario-fisico__modal-header"
          style={{ background: color, color: 'white', justifyContent: 'center' }}
        >
          <h5 style={{ textAlign: 'center', width: '100%' }}>{titulo}</h5>
        </div>

        <div className="inventario-fisico__modal-body" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ marginBottom: '1rem' }}>
            <span
              style={{
                display: 'inline-block',
                background: '#f0f4ff',
                border: '1px solid #c3d4f7',
                borderRadius: '20px',
                padding: '0.3rem 0.8rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#303d50',
              }}
            >
              {solicitud.solicitante}
            </span>
          </div>

          {esLimpiar ? (
            <>
              <p style={{ marginBottom: '0.5rem', color: '#303d50', fontSize: '0.95rem' }}>
                Solicita <strong>limpiar todo el inventario</strong>
              </p>
              {solicitud.total_bienes != null && (
                <p style={{ fontWeight: 700, fontSize: '1.1rem', color, marginBottom: '0.75rem' }}>
                  {solicitud.total_bienes} bienes se eliminarán
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ marginBottom: '0.5rem', color: '#303d50', fontSize: '0.95rem' }}>
                Solicita <strong>eliminar</strong> el siguiente bien:
              </p>
              <p style={{ fontWeight: 700, fontSize: '1rem', color, marginBottom: '0.25rem' }}>
                {solicitud.placa}
              </p>
              {solicitud.descripcion && (
                <p style={{ fontSize: '0.82rem', color: '#6c757d', marginBottom: '0.75rem' }}>
                  {solicitud.descripcion}
                </p>
              )}
            </>
          )}

          <div
            style={{
              background: `${color}12`,
              border: `1px solid ${color}40`,
              borderRadius: '6px',
              padding: '0.6rem',
              fontSize: '0.8rem',
              color,
              marginTop: '0.5rem',
            }}
          >
            Se requiere aprobación de ambos participantes para realizar esta acción.
          </div>
        </div>

        <div className="inventario-fisico__modal-footer" style={{ justifyContent: 'center', gap: '0.75rem' }}>
          <button
            className="floresta-busqueda__btn"
            style={{
              background: 'transparent',
              border: '2px solid #303d50',
              color: '#303d50',
              padding: '0.5rem 1.5rem',
            }}
            onClick={() => onRechazar(solicitud)}
          >
            Rechazar
          </button>
          <button
            className="floresta-busqueda__btn"
            style={{ background: color, padding: '0.5rem 1.5rem' }}
            onClick={() => onAprobar(solicitud)}
          >
            Aprobar
          </button>
        </div>
      </div>
    </div>
  )
}
