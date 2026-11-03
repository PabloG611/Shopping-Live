/**
 * Modal compartido para cambiar ubicación de un bien.
 * Tabs: Ubicación TNS (autocomplete de Firebird) / Ubicación Física (texto libre).
 * Usado en Inventario Físico e Inventario Regionales.
 */

import { useState } from 'react'
import SelectorUbicacion, { type Ubicacion } from './SelectorUbicacion'
import ModalConfirmarAccion from '../common/ModalConfirmarAccion'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

interface ModalUbicacionProps {
  isOpen: boolean
  placa: string
  descripcion: string
  ubicacionActual: string
  /** Lista de ubicaciones TNS cargadas globalmente */
  ubicacionesTNS: { id: number; label: string }[]
  onGuardar: (nuevaUbicacion: string) => void
  onGuardarTNS: (ubicacionLabel: string, ubicacionId: number) => void
  onClose: () => void
  onSuccess?: (msg: string) => void
  onWarning?: (msg: string) => void
}

type TabUbicacion = 'tns' | 'fisica'

export default function ModalUbicacion({
  isOpen,
  placa,
  descripcion,
  ubicacionActual,
  ubicacionesTNS,
  onGuardar,
  onGuardarTNS,
  onClose,
  onSuccess,
  onWarning,
}: ModalUbicacionProps) {
  const [tab, setTab] = useState<TabUbicacion>('tns')
  const [ubicacionFisica, setUbicacionFisica] = useState('')
  // Cambio pendiente de confirmación. Mientras exista, se muestra el modal de
  // confirmación y NO se aplica nada (ni Firebird, ni onGuardar, ni la nota
  // automática que crea el componente padre).
  const [cambioPendiente, setCambioPendiente] = useState<
    | { tipo: 'tns'; ubicacion: Ubicacion }
    | { tipo: 'fisica'; valor: string }
    | null
  >(null)
  const [aplicando, setAplicando] = useState(false)

  if (!isOpen) return null

  // Paso 1: el usuario elige una ubicación TNS → se pide confirmación.
  const handleSeleccionarTNS = (u: Ubicacion | null) => {
    if (!u) return
    setCambioPendiente({ tipo: 'tns', ubicacion: u })
  }

  // Paso 1: el usuario escribe la ubicación física → se pide confirmación.
  const handleGuardarFisica = () => {
    const valor = ubicacionFisica.trim()
    if (!valor) return
    setCambioPendiente({ tipo: 'fisica', valor })
  }

  // Paso 2 (TNS): solo tras confirmar se aplica el cambio y se actualiza Firebird.
  const aplicarTNS = async (u: Ubicacion) => {
    setAplicando(true)

    onGuardar(u.label)

    // Actualizar en Firebird
    try {
      await fetch(`${API_URL}/almacen/admin/actualizar-ubicacion/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa, ubicacion_id: u.id })
      })
      onSuccess?.(`Ubicación TNS actualizada: ${u.label}`)
    } catch {
      onWarning?.('Error actualizando en TNS')
    }

    onGuardarTNS(u.label, u.id)
    setAplicando(false)
    setCambioPendiente(null)
    onClose()
  }

  // Paso 2 (física): solo tras confirmar se aplica el cambio.
  const aplicarFisica = (valor: string) => {
    onGuardar(valor)
    onSuccess?.('Ubicación física guardada')
    setCambioPendiente(null)
    onClose()
  }

  // Confirmación: ejecuta la aplicación real según el tipo de cambio pendiente.
  const confirmarCambio = () => {
    if (!cambioPendiente) return
    if (cambioPendiente.tipo === 'tns') void aplicarTNS(cambioPendiente.ubicacion)
    else aplicarFisica(cambioPendiente.valor)
  }

  const ubicacionNueva = cambioPendiente
    ? (cambioPendiente.tipo === 'tns' ? cambioPendiente.ubicacion.label : cambioPendiente.valor)
    : ''

  return (
    <div className="inventario-fisico__modal-overlay" data-modal-ubicacion="true">
      <div className="inventario-fisico__modal" style={{ maxWidth: '550px' }}>
        <div className="inventario-fisico__modal-header">
          <h5>Cambiar Ubicación</h5>
          <button className="inventario-fisico__modal-close" onClick={onClose}>×</button>
        </div>

        <div className="inventario-fisico__modal-body">
          {/* Info del bien */}
          <div style={{ background: '#f8f9fa', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.2rem', border: '1px solid #dee2e6' }}>
            <div style={{ fontSize: '0.78rem', color: '#6c757d' }}>Placa</div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#303d50' }}>{placa}</div>
            <div style={{ fontSize: '0.82rem', color: '#5c6474', marginTop: '0.2rem' }}>{descripcion || '--'}</div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
              <span style={{ color: '#6c757d' }}>Ubicación actual: </span>
              <strong>{ubicacionActual || 'Sin ubicación'}</strong>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '2px solid #dee2e6', marginBottom: '1.2rem' }}>
            <button
              onClick={() => setTab('tns')}
              style={{ padding: '0.5rem 1rem', background: 'transparent', border: 'none', borderBottom: tab === 'tns' ? '3px solid #303d50' : '3px solid transparent', fontWeight: tab === 'tns' ? 700 : 400, cursor: 'pointer', fontSize: '0.85rem', color: tab === 'tns' ? '#303d50' : '#5c6474' }}
            >
              Ubicación TNS
            </button>
            <button
              onClick={() => setTab('fisica')}
              style={{ padding: '0.5rem 1rem', background: 'transparent', border: 'none', borderBottom: tab === 'fisica' ? '3px solid #303d50' : '3px solid transparent', fontWeight: tab === 'fisica' ? 700 : 400, cursor: 'pointer', fontSize: '0.85rem', color: tab === 'fisica' ? '#303d50' : '#5c6474' }}
            >
              Ubicación Física
            </button>
          </div>

          {/* Tab TNS */}
          {tab === 'tns' && (
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#303d50', display: 'block', marginBottom: '0.4rem' }}>
                Buscar ubicación en TNS
              </label>
              <SelectorUbicacion
                ubicaciones={ubicacionesTNS}
                valor={null}
                onChange={handleSeleccionarTNS}
                placeholder="Buscar ubicación (ej: BOGOTA, MEDELLIN)..."
              />
              <p style={{ fontSize: '0.7rem', color: '#6c757d', margin: '0.4rem 0 0' }}>Seleccione para actualizar en Firebird.</p>
            </div>
          )}

          {/* Tab Física */}
          {tab === 'fisica' && (
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#303d50', display: 'block', marginBottom: '0.4rem' }}>
                Ubicación física (referencia local)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Ej: Oficina 301, Piso 2..."
                  value={ubicacionFisica}
                  maxLength={50}
                  onChange={(e) => setUbicacionFisica(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGuardarFisica() }}
                  style={{ flex: 1, padding: '0.55rem 0.75rem', border: '2px solid #dee2e6', borderRadius: '8px', fontSize: '0.85rem', transition: 'border-color 0.2s' }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#303d50'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#dee2e6'}
                  autoFocus
                />
                <button
                  className="floresta-busqueda__btn"
                  style={{ fontSize: '0.82rem', padding: '0.5rem 1rem', borderRadius: '8px' }}
                  onClick={handleGuardarFisica}
                  disabled={!ubicacionFisica.trim()}
                >
                  Guardar
                </button>
              </div>
              <p style={{ fontSize: '0.7rem', color: '#6c757d', margin: '0.4rem 0 0' }}>Solo referencia local, no modifica TNS.</p>
            </div>
          )}
        </div>

        <div className="inventario-fisico__modal-footer">
          <button className="floresta-busqueda__btn" style={{ background: 'transparent', border: '2px solid #303d50', color: '#303d50', borderRadius: '8px' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>

      {/* Confirmación del cambio de ubicación: solo tras aceptar se aplica. */}
      <ModalConfirmarAccion
        isOpen={!!cambioPendiente}
        titulo="Confirmar cambio de ubicación"
        mensaje={`¿Confirma el cambio de ubicación de "${ubicacionActual || 'Sin ubicación'}" a "${ubicacionNueva}"?`}
        destacado={placa}
        textoConfirmar="Sí, cambiar ubicación"
        textoCancelar="Cancelar"
        color="#303d50"
        loading={aplicando}
        onConfirmar={confirmarCambio}
        onCancelar={() => { if (!aplicando) setCambioPendiente(null) }}
      />
    </div>
  )
}
