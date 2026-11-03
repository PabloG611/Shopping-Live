/**
 * ModalEcoTabla — Envoltura modal reutilizable para mostrar una EcoTabla (o
 * cualquier contenido) en un overlay. No conoce la lógica de la tabla: solo la
 * presenta en un diálogo con título y cierre. Así la misma tabla sirve en línea
 * o como modal sin duplicar nada.
 */
import { useEffect, type ReactNode } from 'react'
import { FaXmark } from 'react-icons/fa6'
import './ModalEcoTabla.css'

interface ModalEcoTablaProps {
  isOpen: boolean
  onClose: () => void
  titulo: ReactNode
  subtitulo?: ReactNode
  /** Acciones opcionales en la cabecera (botones, filtros, etc.). */
  acciones?: ReactNode
  children: ReactNode
  /** Ancho máximo del modal. Default: '1100px'. */
  maxWidth?: string
}

export default function ModalEcoTabla({
  isOpen,
  onClose,
  titulo,
  subtitulo,
  acciones,
  children,
  maxWidth = '1100px',
}: ModalEcoTablaProps) {
  // Cerrar con Escape.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="eco-modal-tabla__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="eco-modal-tabla" style={{ maxWidth }}>
        <div className="eco-modal-tabla__header">
          <div className="eco-modal-tabla__titulos">
            <h5 className="eco-modal-tabla__titulo">{titulo}</h5>
            {subtitulo && <p className="eco-modal-tabla__sub">{subtitulo}</p>}
          </div>
          {acciones && <div className="eco-modal-tabla__acciones">{acciones}</div>}
          <button type="button" className="eco-modal-tabla__cerrar" onClick={onClose} aria-label="Cerrar">
            <FaXmark size={16} />
          </button>
        </div>
        <div className="eco-modal-tabla__body">{children}</div>
      </div>
    </div>
  )
}
