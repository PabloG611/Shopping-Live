/**
 * Modal para transferir un bien Floresta a otro responsable.
 * Usa SelectorCoordinador para buscar por cédula o nombre.
 * Escape cierra, Enter confirma.
 */

import { useState, useEffect, useCallback } from 'react'
import SelectorCoordinador from './SelectorCoordinador'
import type { TerceroFirebird } from './SelectorCoordinador'

interface ModalTransferirProps {
  isOpen: boolean
  placa: string
  onConfirmar: (nombre: string, cedula: string) => Promise<void>
  onClose: () => void
}

export default function ModalTransferir({ isOpen, placa, onConfirmar, onClose }: ModalTransferirProps) {
  const [nombre, setNombre] = useState('')
  const [cedula, setCedula] = useState('')
  const [transfiriendo, setTransfiriendo] = useState(false)

  // Limpiar al abrir
  useEffect(() => {
    if (isOpen) {
      setNombre('')
      setCedula('')
      setTransfiriendo(false)
    }
  }, [isOpen])

  const puedeConfirmar = nombre.trim() !== '' && cedula.trim() !== '' && !transfiriendo

  const confirmar = useCallback(async () => {
    if (!puedeConfirmar) return
    setTransfiriendo(true)
    await onConfirmar(nombre.trim(), cedula.trim())
    setTransfiriendo(false)
  }, [puedeConfirmar, nombre, cedula, onConfirmar])

  // Escape cierra, Enter confirma
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && puedeConfirmar) confirmar()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose, puedeConfirmar, confirmar])

  if (!isOpen) return null

  const handleSeleccionar = (t: TerceroFirebird) => {
    setNombre(t.nombre)
    setCedula(t.cedula)
  }

  return (
    <div className="inventario-fisico__modal-overlay">
      <div className="inventario-fisico__modal" style={{ maxWidth: '500px' }}>
        <div className="inventario-fisico__modal-header">
          <h5>Transferir bien {placa}</h5>
          <button className="inventario-fisico__modal-close" onClick={onClose}>×</button>
        </div>

        <div className="inventario-fisico__modal-body" style={{ padding: '1.2rem 1.5rem' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#303d50', display: 'block', marginBottom: '0.4rem' }}>
            Nuevo responsable
          </label>
          <SelectorCoordinador
            valor={cedula}
            onChange={(cc) => setCedula(cc)}
            onSeleccionar={handleSeleccionar}
            placeholder="Buscar por cédula o nombre (mín. 3 caracteres)..."
          />
          {nombre && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#2e7d32', fontWeight: 600 }}>
              {nombre} — CC {cedula}
            </div>
          )}
        </div>

        <div className="inventario-fisico__modal-footer" style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
          <button
            className="floresta-busqueda__btn"
            style={{ background: 'transparent', border: '2px solid #303d50', color: '#303d50', borderRadius: '6px' }}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="floresta-busqueda__btn"
            onClick={confirmar}
            disabled={!puedeConfirmar}
          >
            {transfiriendo ? 'Transfiriendo...' : 'Confirmar transferencia'}
          </button>
        </div>
      </div>
    </div>
  )
}
