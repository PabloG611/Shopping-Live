/**
 * Modal compartido para editar el serial de un bien durante el inventario.
 * Usado en Inventario Físico e Inventario Regional.
 */
import { useState, useEffect } from 'react'

interface ModalEditarSerialProps {
  isOpen: boolean
  placa: string
  descripcion: string
  serialActual: string
  onGuardar: (nuevoSerial: string) => void
  onClose: () => void
}

export default function ModalEditarSerial({
  isOpen,
  placa,
  descripcion,
  serialActual,
  onGuardar,
  onClose,
}: ModalEditarSerialProps) {
  const [serial, setSerial] = useState(serialActual)

  useEffect(() => {
    if (isOpen) setSerial(serialActual)
  }, [isOpen, serialActual])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleGuardar = () => {
    onGuardar(serial)
    onClose()
  }

  return (
    <div className="inventario-fisico__modal-overlay">
      <div className="inventario-fisico__modal" style={{ maxWidth: '480px' }}>
        {/* Header */}
        <div className="inventario-fisico__modal-header">
          <h5>Editar Serial</h5>
          <button className="inventario-fisico__modal-close" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className="inventario-fisico__modal-body" style={{ padding: '1.5rem' }}>
          {/* Info del bien */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', borderRadius: '8px', marginBottom: '1.25rem', border: '1px solid #dee2e6' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#303d50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: 'white', fontSize: '0.8rem', fontWeight: 700 }}>#</span>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#303d50' }}>{placa}</p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#6c757d' }}>{descripcion || 'Sin descripción'}</p>
            </div>
          </div>

          {/* Input */}
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#303d50', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Serial del bien <span style={{ color: '#d13c47' }}>*</span>
          </label>
          <input
            type="text"
            value={serial}
            maxLength={15}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="Ej: BKTAR0AWYJL55H"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleGuardar() }}
            style={{
              width: '100%',
              padding: '0.7rem 0.9rem',
              fontSize: '1rem',
              fontFamily: 'ui-monospace, monospace',
              fontWeight: 600,
              letterSpacing: '0.04em',
              border: '2px solid #303d50',
              borderRadius: '8px',
              outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#1565c0'; e.currentTarget.style.boxShadow = '0 0 0 3px rgb(21 101 192 / 0.12)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#303d50'; e.currentTarget.style.boxShadow = 'none' }}
          />
          {serial !== serialActual && serial.trim() && (
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#1565c0', fontWeight: 500 }}>
              Cambiará de "{serialActual || 'N/A'}" → "{serial}"
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="inventario-fisico__modal-footer" style={{ justifyContent: 'center' }}>
          <button
            className="floresta-busqueda__btn"
            onClick={handleGuardar}
            disabled={!serial.trim()}
            style={{ background: serial.trim() ? '#303d50' : '#adb5bd' }}
          >
            Guardar
          </button>
          <button
            className="floresta-busqueda__btn"
            style={{ background: 'transparent', border: '2px solid #303d50', color: '#303d50' }}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
