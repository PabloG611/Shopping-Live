/**
 * Camioncito animado CSS puro para indicar "en proceso de transferencia".
 * Inspirado en el Loader Truck de WiWeb (Facebook).
 * Tamaño compacto para usar inline en tablas.
 */
import './TruckLoader.css'

export default function TruckLoader() {
  return (
    <div className="truck-loader" aria-hidden="true" title="En proceso de transferencia">
      <div className="truck-loader__road">
        <div className="truck-loader__road-line" />
      </div>
      {/* Postes de luz que pasan */}
      <div className="truck-loader__posts">
        <div className="truck-loader__post" />
        <div className="truck-loader__post" />
        <div className="truck-loader__post" />
      </div>
      <div className="truck-loader__truck">
        <div className="truck-loader__cabin">
          <div className="truck-loader__window" />
        </div>
        <div className="truck-loader__cargo" />
        <div className="truck-loader__wheel truck-loader__wheel--front" />
        <div className="truck-loader__wheel truck-loader__wheel--back" />
        <div className="truck-loader__exhaust" />
      </div>
    </div>
  )
}
