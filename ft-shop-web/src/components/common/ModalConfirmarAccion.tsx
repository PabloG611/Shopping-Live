/**
 * Modal genérico de confirmación de acción.
 * Diseño elegante: ícono de alerta en acento de color, jerarquía clara,
 * caja de advertencia suave. El color se usa como acento (no como banda sólida).
 * Reutilizable en Inventario Físico, Regional y cualquier otro flujo.
 */
import { FaTriangleExclamation } from 'react-icons/fa6'
import './ModalConfirmarAccion.css'

interface ModalConfirmarAccionProps {
  isOpen: boolean
  titulo?: string
  mensaje: string
  /** Número o texto destacado (ej: "2 registros") */
  destacado?: string
  /** Texto de advertencia en el box inferior */
  advertencia?: string
  textoConfirmar?: string
  textoCancelar?: string
  /** Color de acento (ícono, destacado y botón confirmar) */
  color?: string
  loading?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

export default function ModalConfirmarAccion({
  isOpen,
  titulo = 'Confirmar acción',
  mensaje,
  destacado,
  advertencia,
  textoConfirmar = 'Sí, continuar',
  textoCancelar = 'Cancelar',
  color = '#e65100',
  loading = false,
  onConfirmar,
  onCancelar,
}: ModalConfirmarAccionProps) {
  if (!isOpen) return null

  return (
    <div className="gi-confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancelar() }}>
      <div className="gi-confirm" role="dialog" aria-modal="true">
        {/* Acento superior de color (alerta) */}
        <div className="gi-confirm__accent" style={{ background: color }} />

        {/* Encabezado: ícono + título */}
        <div className="gi-confirm__header">
          <span className="gi-confirm__icono" style={{ background: `${color}1a`, color }}>
            <FaTriangleExclamation size={22} />
          </span>
          <h5 className="gi-confirm__titulo">{titulo}</h5>
        </div>

        {/* Cuerpo */}
        <div className="gi-confirm__body">
          <p className="gi-confirm__mensaje">{mensaje}</p>
          {destacado && (
            <span className="gi-confirm__destacado" style={{ color, background: `${color}14`, borderColor: `${color}33` }}>
              {destacado}
            </span>
          )}
          {advertencia && (
            <div className="gi-confirm__advertencia" style={{ background: `${color}0f`, borderColor: `${color}33`, color }}>
              {advertencia}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="gi-confirm__footer">
          <button
            type="button"
            className="gi-confirm__btn gi-confirm__btn--cancelar"
            onClick={onCancelar}
            disabled={loading}
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            className="gi-confirm__btn gi-confirm__btn--confirmar"
            style={{ background: color, borderColor: color }}
            onClick={onConfirmar}
            disabled={loading}
          >
            {loading ? 'Procesando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
