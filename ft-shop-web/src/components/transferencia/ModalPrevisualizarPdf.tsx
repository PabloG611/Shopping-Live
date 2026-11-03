import { FaTimes, FaDownload, FaSpinner } from 'react-icons/fa'
import { useMemo, useState } from 'react'
import './ModalPrevisualizarPdf.css'

type PdfPreviewModo = 'transfer' | 'history'

interface ModalPrevisualizarPdfProps {
  pdfDataUrl: string
  nombreArchivo: string
  modo: PdfPreviewModo
  procesando?: boolean
  onDescargar: () => void
  onCerrar: () => void
}

/**
 * Convierte un data URL de PDF a un Blob URL.
 * Los navegadores en tablets no renderizan PDFs inline con data: URLs,
 * pero sí con blob: URLs.
 */
function dataUrlToBlobUrl(dataUrl: string): string {
  try {
    const parts = dataUrl.split(',')
    if (parts.length < 2) return dataUrl
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf'
    const bstr = atob(parts[1])
    const u8arr = new Uint8Array(bstr.length)
    for (let i = 0; i < bstr.length; i++) {
      u8arr[i] = bstr.charCodeAt(i)
    }
    const blob = new Blob([u8arr], { type: mime })
    return URL.createObjectURL(blob)
  } catch {
    return dataUrl
  }
}

/** Detecta si estamos en un dispositivo móvil/tablet (sin visor PDF nativo en iframe) */
function esMobileOTablet(): boolean {
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)
}

export function ModalPrevisualizarPdf({
  pdfDataUrl,
  nombreArchivo,
  modo,
  procesando = false,
  onDescargar,
  onCerrar,
}: ModalPrevisualizarPdfProps) {
  const bloqueado = modo === 'transfer' && procesando
  const [iframeError, setIframeError] = useState(false)
  const isMobile = useMemo(() => esMobileOTablet(), [])

  // Convertir data URL a Blob URL para compatibilidad con tablets
  const blobUrl = useMemo(() => {
    if (pdfDataUrl.startsWith('data:')) {
      return dataUrlToBlobUrl(pdfDataUrl)
    }
    return pdfDataUrl
  }, [pdfDataUrl])

  // URL para abrir en nueva pestaña (descarga directa)
  const handleAbrirEnNuevaPestana = () => {
    const url = blobUrl.split('#')[0]
    window.open(url, '_blank')
  }

  return (
    <div
      className="pdf-preview-overlay"
      onClick={bloqueado ? undefined : onCerrar}
    >
      <div
        className="pdf-preview-modal"
        onClick={(e) => e.stopPropagation()}
        aria-busy={bloqueado}
      >
        <div className="pdf-preview-header">
          <h3 className="pdf-preview-title">{nombreArchivo.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()}</h3>
          <div className="pdf-preview-actions">
            <button
              type="button"
              className="pdf-preview-btn pdf-preview-btn--download"
              onClick={onDescargar}
              disabled={bloqueado}
            >
              {bloqueado ? (
                <><FaSpinner className="pdf-preview-spinner" /> Registrando…</>
              ) : (
                <><FaDownload /> Descargar</>
              )}
            </button>
            <button
              type="button"
              className="pdf-preview-btn pdf-preview-btn--close"
              onClick={onCerrar}
              disabled={bloqueado}
              aria-label="Cerrar vista previa"
            >
              <FaTimes />
            </button>
          </div>
        </div>
        <div className="pdf-preview-body">
          {/* En móviles/tablets, mostrar fallback con opción de abrir en nueva pestaña */}
          {(isMobile || iframeError) ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.2rem', padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem' }}>📄</div>
              <p style={{ fontSize: '1rem', fontWeight: 600, color: '#334155', margin: 0 }}>
                El PDF se generó correctamente
              </p>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0, maxWidth: '320px' }}>
                Su dispositivo no permite previsualizar PDFs directamente. Puede abrirlo en una nueva pestaña o descargarlo.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={handleAbrirEnNuevaPestana}
                  style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', fontWeight: 600, background: '#303d50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Abrir PDF en nueva pestaña
                </button>
                <button
                  type="button"
                  onClick={onDescargar}
                  disabled={bloqueado}
                  style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', fontWeight: 600, background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: bloqueado ? 'not-allowed' : 'pointer', opacity: bloqueado ? 0.6 : 1 }}
                >
                  {bloqueado ? 'Registrando...' : 'Descargar y Guardar'}
                </button>
              </div>
            </div>
          ) : (
            <iframe
              src={`${blobUrl}#toolbar=0&navpanes=0`}
              className="pdf-preview-iframe"
              title="Vista previa del PDF"
              style={{ width: '100%', height: '100%', border: 'none' }}
              onError={() => setIframeError(true)}
              onLoad={(e) => {
                // Algunos navegadores cargan el iframe pero muestran página en blanco
                // Detectar si el contenido está vacío (heurística)
                try {
                  const iframe = e.currentTarget
                  // Si después de 2s el iframe no tiene contenido visible, mostrar fallback
                  setTimeout(() => {
                    try {
                      if (iframe.contentDocument?.body?.innerText === '' && iframe.contentDocument?.body?.children.length === 0) {
                        setIframeError(true)
                      }
                    } catch {
                      // Cross-origin - no podemos acceder, asumimos que está bien
                    }
                  }, 2000)
                } catch {
                  // Ignore
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
