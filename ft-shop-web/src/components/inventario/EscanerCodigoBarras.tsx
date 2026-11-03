/**
 * Componente compacto de escáner de código de barras / placa.
 * Usado en Inventario Físico e Inventario Regional.
 */
import { forwardRef } from 'react'

interface EscanerCodigoBarrasProps {
  valor: string
  onChange: (valor: string) => void
  onProcesar: () => void
  procesando?: boolean
  deshabilitado?: boolean
  placeholder?: string
  id?: string
  onSinPlaca?: () => void
  onCargaMasiva?: () => void
}

const EscanerCodigoBarras = forwardRef<HTMLInputElement, EscanerCodigoBarrasProps>(({
  valor,
  onChange,
  onProcesar,
  procesando = false,
  deshabilitado = false,
  placeholder = 'Escanee o escriba placa/serial...',
  id = 'codigo-barras',
  onSinPlaca,
  onCargaMasiva,
}, ref) => {
  return (
    <div className="escaner-row" style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.4rem',
      padding: '0.35rem 0.6rem',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}>
      {/* Icono de escáner */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.2rem 0.3rem', color: '#64748b' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
      </div>

      {/* Input */}
      <input
        ref={ref}
        id={id}
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === 'Enter') onProcesar() }}
        placeholder={placeholder}
        autoComplete="off"
        disabled={procesando || deshabilitado}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          fontSize: '0.88rem',
          fontWeight: 500,
          letterSpacing: '0.01em',
          textTransform: 'uppercase',
          background: 'transparent',
          padding: '0.35rem 0',
          color: '#1e293b',
        }}
      />

      {/* Botón procesar */}
      <button
        type="button"
        onClick={onProcesar}
        disabled={procesando || !valor.trim()}
        style={{
          padding: '0.38rem 0.85rem',
          fontSize: '0.78rem',
          fontWeight: 600,
          border: 'none',
          borderRadius: '6px',
          background: procesando || !valor.trim() ? '#e2e8f0' : '#475569',
          color: procesando || !valor.trim() ? '#94a3b8' : 'white',
          cursor: procesando || !valor.trim() ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        {procesando ? '...' : 'Agregar'}
      </button>

      {/* Botón carga masiva */}
      {onCargaMasiva && (
        <button
          type="button"
          onClick={onCargaMasiva}
          title="Carga masiva: pegar múltiples placas de una vez"
          style={{
            padding: '0.38rem 0.6rem',
            fontSize: '0.72rem',
            fontWeight: 600,
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            background: 'white',
            color: '#475569',
            cursor: 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = '#94a3b8' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#cbd5e1' }}
        >
          Masivo
        </button>
      )}

      {/* Botón agregar bien sin placa */}
      {onSinPlaca && (
        <button
          type="button"
          onClick={onSinPlaca}
          title="Agregar bien sin placa"
          style={{
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #fed7aa',
            borderRadius: '50%',
            background: '#fff7ed',
            color: '#ea580c',
            cursor: 'pointer',
            transition: 'transform 0.15s, background 0.15s',
            fontSize: '1.1rem',
            fontWeight: 700,
            lineHeight: 1,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.background = '#ffedd5' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = '#fff7ed' }}
        >
          +
        </button>
      )}
    </div>
  )
})

EscanerCodigoBarras.displayName = 'EscanerCodigoBarras'
export default EscanerCodigoBarras
