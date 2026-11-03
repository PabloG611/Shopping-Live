/**
 * VehiculosBogotaTarjeta.tsx
 *
 * Tarjeta de un inventariador en el tablero de asignación de vehículos Bogotá.
 * Muestra sus placas asignadas y acepta placas arrastradas desde el catálogo.
 * Las placas ya inventariadas se muestran tachadas (trazabilidad) pero no se
 * eliminan automáticamente.
 */

import { useState } from 'react'
import { FaMotorcycle, FaCarSide, FaXmark, FaTrashCan } from 'react-icons/fa6'
import { esMoto } from '../../../services/vehiculosService'
import type { InventariadorVehiculos } from '../../../hooks/useVehiculosBogota'

interface Props {
  inv: InventariadorVehiculos
  estaInventariada: (placa: string) => boolean
  onAsignar: (placa: string) => void
  onQuitarPlaca: (placa: string) => void
  onQuitarInventariador: () => void
  /** Mueve una placa desde otro inventariador a este (drag entre tarjetas). */
  onMoverDesde?: (placa: string, usernameOrigen: string) => void
  /** Placa a resaltar brevemente dentro de la tarjeta (clic desde catálogo). */
  placaResaltada?: string | null
}

export default function VehiculosBogotaTarjeta({
  inv, estaInventariada, onAsignar, onQuitarPlaca, onQuitarInventariador, onMoverDesde, placaResaltada,
}: Props) {
  const [dropActivo, setDropActivo] = useState(false)
  const sinUsuario = !inv.usuario.username

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropActivo(false)
    if (sinUsuario) return
    const placa = e.dataTransfer.getData('text/plain')
    if (!placa) return
    // Si la placa viene de OTRO inventariador, se mueve (quita del origen y suma
    // aquí). Si viene del catálogo (sin origen) se asigna normalmente.
    const origen = e.dataTransfer.getData('application/x-vbog-origen')
    if (origen && origen !== inv.usuario.username) {
      onMoverDesde?.(placa, origen)
    } else if (!origen) {
      onAsignar(placa)
    }
  }

  const totalMotos = inv.placas.filter((p) => esMoto(p)).length
  const totalCarros = inv.placas.length - totalMotos

  return (
    <div
      id={inv.usuario.username ? `vbog-tarjeta-${inv.usuario.username}` : undefined}
      className="vbog-tarjeta"
      onDragOver={(e) => { if (!sinUsuario) { e.preventDefault(); setDropActivo(true) } }}
      onDragLeave={() => setDropActivo(false)}
      onDrop={handleDrop}
      style={{
        breakInside: 'avoid', marginBottom: '1.25rem',
        border: dropActivo ? '2px dashed #1565c0' : '1px solid #e2e8f0',
        borderRadius: '14px', background: dropActivo ? '#eff6ff' : 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'all 0.15s',
      }}
    >
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#303d50', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {inv.usuario.nombreCompleto}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
            {inv.usuario.username
              ? `@${inv.usuario.username}`
              : <span style={{ color: '#d97706' }}>sin usuario del ecosistema</span>}
          </div>
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1565c0', background: '#e3f2fd', padding: '0.25rem 0.55rem', borderRadius: '10px', flexShrink: 0, display: 'flex', gap: '0.4rem' }}>
          <span title="Motos"><FaMotorcycle size={11} /> {totalMotos}</span>
          <span title="Carros"><FaCarSide size={11} /> {totalCarros}</span>
        </span>
        <button
          type="button"
          className="vbog-btn-eliminar"
          onClick={onQuitarInventariador}
          title="Quitar inventariador"
        >
          <FaTrashCan size={13} />
        </button>
      </div>

      {/* Cuerpo: placas asignadas */}
      <div style={{ padding: '0.75rem 1rem' }}>
        {sinUsuario ? (
          <p style={{ textAlign: 'center', color: '#b45309', fontSize: '0.82rem', padding: '1rem 0.5rem', background: '#fef3c7', borderRadius: '10px', margin: 0 }}>
            Este usuario no tiene login del ecosistema, no se le pueden asignar vehículos.
          </p>
        ) : inv.placas.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem', padding: '1.25rem 0.5rem', margin: 0 }}>
            Arrastre placas aquí o use "Repartir equitativamente".
          </p>
        ) : (
          <div className="vbog-placas-grid">
            {inv.placas.map((placa) => {
              const inventariada = estaInventariada(placa)
              const resaltada = placaResaltada === placa
              const moto = esMoto(placa)
              return (
                <div
                  key={placa}
                  id={`vbog-placa-${placa}`}
                  className={`vbog-placa${moto ? ' vbog-placa--moto' : ''}${inventariada ? ' vbog-placa--inventariada' : ''}${resaltada ? ' vbog-placa--resaltada' : ''}`}
                  title={inventariada ? `${placa} · ya inventariada` : `${placa} · arrastre para reasignar`}
                  // Solo las placas NO inventariadas se pueden mover a otro inventariador.
                  draggable={!inventariada}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', placa)
                    e.dataTransfer.setData('application/x-vbog-origen', inv.usuario.username || '')
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  style={{ cursor: inventariada ? 'default' : 'grab' }}
                >
                  <span className="vbog-placa__pais">
                    {moto ? <FaMotorcycle size={8} /> : <FaCarSide size={8} />} COLOMBIA
                  </span>
                  <span className="vbog-placa__num">{placa}</span>
                  {inventariada && <span className="vbog-placa__sello">INVENTARIADO</span>}
                  <button
                    type="button"
                    className="vbog-placa__quitar"
                    onClick={() => onQuitarPlaca(placa)}
                    title="Quitar placa"
                  >
                    <FaXmark size={10} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
