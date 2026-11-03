/**
 * VehiculosBogotaStats.tsx
 *
 * Tres mini-cards clicables de la barra de acciones del panel central:
 * pendientes / motos / carros. Al hacer clic en una, el panel abre el modal
 * de detalle con la lista de esos vehículos (lo maneja el padre vía onDetalle).
 */

import { FaCarSide, FaMotorcycle, FaListCheck } from 'react-icons/fa6'

/** Tipo de lista de pendientes que se solicita al hacer clic. */
type DetalleStats = 'pendientes' | 'motos' | 'carros'

interface Props {
  totalPendientes: number
  totalMotos: number
  totalCarros: number
  onDetalle: (tipo: DetalleStats) => void
}

export default function VehiculosBogotaStats({ totalPendientes, totalMotos, totalCarros, onDetalle }: Props) {
  return (
    <div className="vbog-stats">
      <button type="button" className="vbog-stat-card vbog-stat-card--pendientes" onClick={() => onDetalle('pendientes')}>
        <span className="vbog-stat-card__icon"><FaListCheck size={16} /></span>
        <span className="vbog-stat-card__num">{totalPendientes}</span>
        <span className="vbog-stat-card__label">Pendientes</span>
      </button>
      <button type="button" className="vbog-stat-card vbog-stat-card--motos" onClick={() => onDetalle('motos')}>
        <span className="vbog-stat-card__icon"><FaMotorcycle size={16} /></span>
        <span className="vbog-stat-card__num">{totalMotos}</span>
        <span className="vbog-stat-card__label">Motos</span>
      </button>
      <button type="button" className="vbog-stat-card vbog-stat-card--carros" onClick={() => onDetalle('carros')}>
        <span className="vbog-stat-card__icon"><FaCarSide size={16} /></span>
        <span className="vbog-stat-card__num">{totalCarros}</span>
        <span className="vbog-stat-card__label">Carros</span>
      </button>
    </div>
  )
}
