/**
 * ModalPlacaDuplicada — Modal de alerta cuando se detecta una placa duplicada.
 * Usado en inventario principal (UNP) y regional.
 *
 * Usa el MISMO patrón de overlay que los demás modales de inventario
 * (inventario-fisico__modal-overlay) para garantizar que siempre se muestre
 * igual que ModalEditarSerial, ModalUbicacion, etc.
 */
import { useEffect, useRef } from 'react'
import { FaTriangleExclamation } from 'react-icons/fa6'

interface ModalPlacaDuplicadaProps {
  /** Mensaje completo de la alerta (ej: "PLACA DUPLICADA: 2001011 ya fue procesada — Ubicación: X. Revise..."). */
  mensaje: string
  onCerrar: () => void
}

export default function ModalPlacaDuplicada({ mensaje, onCerrar }: ModalPlacaDuplicadaProps) {
  // Candado: ignora cualquier intento de cierre durante los primeros 500ms tras
  // abrir. Evita que un evento residual (click/foco/efecto) cierre el modal
  // inmediatamente después de mostrarse.
  const puedeCerrarRef = useRef(false)
  useEffect(() => {
    puedeCerrarRef.current = false
    const t = setTimeout(() => { puedeCerrarRef.current = true }, 500)
    return () => clearTimeout(t)
  }, [])
  const cerrarProtegido = () => { if (puedeCerrarRef.current) onCerrar() }

  // Placa: primer token que parece placa (F + dígitos, o secuencia de dígitos).
  const mPlaca = mensaje.match(/\b(F?\d{3,})\b/)
  const placa = mPlaca ? mPlaca[1] : ''

  // Ubicación: si el mensaje trae "Ubicación: ...", extraerla como dato aparte.
  const mUbic = mensaje.match(/Ubicaci[oó]n:\s*([^.]+)/i)
  const ubicacion = mUbic ? mUbic[1].trim() : ''

  // Mensaje limpio: quitar prefijo, placa y el fragmento de ubicación.
  const texto = mensaje
    .replace(/PLACA DUPLICADA:\s*/i, '')
    .replace(placa, '')
    .replace(/[—-]?\s*Ubicaci[oó]n:\s*[^.]+\.?/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[—-]\s*/, '')
    .trim()

  return (
    // NO cerrar al hacer click en el overlay: el mismo Enter/click que dispara
    // el escaneo se propagaba al overlay recién montado y lo cerraba al instante
    // (~30ms). Solo se cierra con el botón "Entendido" o con Escape.
    <div className="inventario-fisico__modal-overlay">
      <div
        className="inventario-fisico__modal"
        role="alertdialog"
        aria-label="Placa duplicada"
        style={{ maxWidth: '420px' }}
      >
        {/* Header rojo de alerta */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '1.5rem 1.25rem 1.25rem',
            background: 'linear-gradient(160deg, #ef4444 0%, #dc2626 100%)',
            color: '#fff',
          }}
        >
          <span
            aria-hidden
            style={{
              width: '52px',
              height: '52px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)',
              fontSize: '1.4rem',
            }}
          >
            <FaTriangleExclamation />
          </span>
          <h5 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Placa duplicada</h5>
          <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.9, fontWeight: 500 }}>
            Se detectó un posible bien repetido
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '1.4rem 1.5rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
          {placa && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.2rem',
                padding: '0.7rem 1.6rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '14px',
              }}
            >
              <span style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#b91c1c' }}>Placa</span>
              <span style={{ fontSize: '1.9rem', fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>{placa}</span>
            </div>
          )}

          <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.45, color: '#334155', textAlign: 'center' }}>
            {texto || 'Ya fue procesada en esta sesión.'}
          </p>

          {ubicacion && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.25rem',
                width: '100%',
                padding: '0.7rem 0.9rem',
                background: '#f8fafc',
                border: '1px solid #eef2f7',
                borderRadius: '10px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>Ubicación</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', lineHeight: 1.35 }}>{ubicacion}</span>
            </div>
          )}

          <p style={{ margin: '0.15rem 0 0', fontSize: '0.76rem', color: '#94a3b8', textAlign: 'center' }}>
            Subsanar de inmediato esta novedad.
          </p>
        </div>

        {/* Footer */}
        <div className="inventario-fisico__modal-footer" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="floresta-busqueda__btn"
            style={{ background: '#303d50' }}
            onClick={cerrarProtegido}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
