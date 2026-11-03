/**
 * BotonesInventario — Toolbar flotante de acciones del inventario.
 * Se posiciona como barra fija al fondo del contenido.
 */
import { FaSave, FaFileExcel, FaTrashAlt, FaExclamationTriangle } from 'react-icons/fa'

export interface BotonesInventarioProps {
  cantidadBienes: number
  hayObservacionesBloqueantes: boolean
  labelGuardar?: string
  onGuardar: () => void
  onExcelProvisional: () => void
  onLimpiar: () => void
}

export default function BotonesInventario({
  cantidadBienes,
  hayObservacionesBloqueantes,
  labelGuardar = 'Guardar Inventario',
  onGuardar,
  onExcelProvisional,
  onLimpiar,
}: BotonesInventarioProps) {
  return (
    <div className="inv-toolbar">
      {/* Alerta bloqueante */}
      {hayObservacionesBloqueantes && (
        <div className="inv-toolbar__alerta">
          <FaExclamationTriangle size={12} />
          <span>Observaciones pendientes — resuelva antes de guardar</span>
        </div>
      )}

      {/* Barra de acciones */}
      <div className="inv-toolbar__bar">
        {/* Secundario: Excel */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            className="inv-toolbar__btn inv-toolbar__btn--excel"
            onClick={onExcelProvisional}
            disabled={cantidadBienes === 0}
            onMouseEnter={(e) => {
              const tooltip = e.currentTarget.parentElement?.querySelector('.inv-toolbar__tooltip') as HTMLElement
              if (tooltip) tooltip.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              const tooltip = e.currentTarget.parentElement?.querySelector('.inv-toolbar__tooltip') as HTMLElement
              if (tooltip) tooltip.style.opacity = '0'
            }}
          >
            <FaFileExcel size={13} />
            <span className="inv-toolbar__btn-label">Excel</span>
          </button>
          <span className="inv-toolbar__tooltip" style={{
            position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
            background: '#1e293b', color: '#fff', fontSize: '0.72rem', fontWeight: 500,
            padding: '0.45rem 0.75rem', borderRadius: '8px', whiteSpace: 'nowrap',
            opacity: 0, transition: 'opacity 0.2s ease', pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            Descarga un Excel provisional con los bienes escaneados hasta el momento
            <span style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              border: '6px solid transparent', borderTopColor: '#1e293b',
            }} />
          </span>
        </div>

        {/* Principal: Guardar */}
        <button
          type="button"
          className="inv-toolbar__btn inv-toolbar__btn--guardar"
          onClick={onGuardar}
          disabled={cantidadBienes === 0}
        >
          <FaSave size={14} />
          <span className="inv-toolbar__btn-text">{labelGuardar}</span>
          <span className="inv-toolbar__btn-count">{cantidadBienes}</span>
        </button>

        {/* Secundario: Limpiar */}
        <button
          type="button"
          className="inv-toolbar__btn inv-toolbar__btn--limpiar"
          onClick={onLimpiar}
          disabled={cantidadBienes === 0}
        >
          <FaTrashAlt size={12} />
          <span className="inv-toolbar__btn-label">Limpiar</span>
        </button>
      </div>
    </div>
  )
}
