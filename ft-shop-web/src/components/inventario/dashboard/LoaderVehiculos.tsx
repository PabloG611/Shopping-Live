/**
 * Loader para la carga del detalle de vehículos. Reemplaza el antiguo
 * TruckLoader por un skeleton de filas animado (shimmer), más limpio y acorde
 * al estilo del dashboard. Autónomo (su CSS vive en LoaderVehiculos.css).
 */
import './LoaderVehiculos.css'

export default function LoaderVehiculos({ filas = 6, mensaje = 'Consultando vehículos…' }: { filas?: number; mensaje?: string }) {
  return (
    <div className="veh-loader" role="status" aria-live="polite">
      <div className="veh-loader__cabecera">
        <span className="veh-loader__spinner" aria-hidden="true" />
        <span className="veh-loader__texto">{mensaje}</span>
      </div>
      <div className="veh-loader__filas" aria-hidden="true">
        {Array.from({ length: filas }).map((_, i) => (
          <div key={i} className="veh-loader__fila">
            <span className="veh-loader__barra veh-loader__barra--placa" />
            <span className="veh-loader__barra veh-loader__barra--desc" />
            <span className="veh-loader__barra veh-loader__barra--resp" />
            <span className="veh-loader__barra veh-loader__barra--estado" />
          </div>
        ))}
      </div>
    </div>
  )
}
