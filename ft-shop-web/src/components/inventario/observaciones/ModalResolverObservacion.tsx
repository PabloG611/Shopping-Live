/**
 * Modal de resolución de una observación (rol gestor). Registro OBLIGATORIO de
 * la solución: acción + detalle. También permite rechazar/cancelar con motivo.
 */
import { useState } from 'react'
import { FaXmark } from 'react-icons/fa6'
import {
  resolverObservacionBackend,
  cerrarObservacion,
  type ObservacionBackend,
} from '../../../services/observacionesApiService'
import { getAuthUserFullName, getAuthUserCedula } from '../../../utils/authState'
import './ModalResolverObservacion.css'

interface Props {
  observacion: ObservacionBackend
  onClose: () => void
  onResuelta: () => void
  onError: (msg: string) => void
}

export default function ModalResolverObservacion({ observacion: o, onClose, onResuelta, onError }: Props) {
  const [accion, setAccion] = useState('')
  const [detalle, setDetalle] = useState('')
  const [valorNuevo, setValorNuevo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [modo, setModo] = useState<'resolver' | 'rechazar'>('resolver')

  const esDescripcion = o.tipo === 'cambio_descripcion'

  const handleResolver = async () => {
    if (!accion.trim()) { onError('Indique la acción realizada.'); return }
    if (detalle.trim().length < 10) { onError('El detalle de la solución es obligatorio (mín. 10 caracteres).'); return }
    setEnviando(true)
    const res = await resolverObservacionBackend(o.id, {
      resuelto_por_cedula: getAuthUserCedula(),
      resuelto_por_nombre: getAuthUserFullName(),
      accion_realizada: accion.trim(),
      detalle_solucion: detalle.trim(),
      valor_anterior: o.descripcion_bien,
      valor_nuevo: valorNuevo.trim(),
    })
    setEnviando(false)
    if (!res.ok) { onError(res.error || 'No se pudo resolver.'); return }
    onResuelta()
  }

  const handleRechazar = async () => {
    if (detalle.trim().length < 5) { onError('Indique el motivo del rechazo.'); return }
    setEnviando(true)
    const res = await cerrarObservacion(o.id, 'rechazar', detalle.trim(), getAuthUserCedula(), getAuthUserFullName())
    setEnviando(false)
    if (!res.ok) { onError(res.error || 'No se pudo rechazar.'); return }
    onResuelta()
  }

  return (
    <div className="obs-res-overlay" onClick={enviando ? undefined : onClose}>
      <div className="obs-res-modal" onClick={(e) => e.stopPropagation()}>
        <div className="obs-res-header">
          <div>
            <h5 className="obs-res-header__titulo">Resolver observación</h5>
            <p className="obs-res-header__sub">{o.tipo_display} · <strong>{o.placa}</strong></p>
          </div>
          <button className="obs-res-header__close" onClick={onClose} disabled={enviando}><FaXmark size={16} /></button>
        </div>

        <div className="obs-res-body">
          {/* Resumen de la novedad */}
          <div className="obs-res-resumen">
            {o.subtipo && <span className="obs-res-chip">{o.subtipo}</span>}
            <p className="obs-res-resumen__desc">{o.descripcion_bien || 'Sin descripción'}</p>
            {o.texto && <p className="obs-res-resumen__texto">{o.texto}</p>}
            <p className="obs-res-resumen__meta">Reportó: {o.reportado_por_nombre || '—'} · {o.servicio || 'Sin servicio'}</p>
          </div>

          {/* Conmutador resolver / rechazar */}
          <div className="obs-res-modo">
            <button type="button" className={`obs-res-modo__btn${modo === 'resolver' ? ' is-active' : ''}`} onClick={() => setModo('resolver')}>Resolver</button>
            <button type="button" className={`obs-res-modo__btn is-rechazar${modo === 'rechazar' ? ' is-active' : ''}`} onClick={() => setModo('rechazar')}>Rechazar</button>
          </div>

          {modo === 'resolver' ? (
            <>
              <label className="obs-res-label">Acción realizada *</label>
              <input className="obs-res-input" value={accion} onChange={(e) => setAccion(e.target.value)} placeholder={esDescripcion ? 'Ej: Descripción actualizada en el sistema' : 'Ej: Placa impresa y entregada'} maxLength={200} />

              {esDescripcion && (
                <>
                  <label className="obs-res-label">Descripción correcta (valor nuevo)</label>
                  <input className="obs-res-input" value={valorNuevo} onChange={(e) => setValorNuevo(e.target.value)} placeholder="Ej: Silla ergonómica" maxLength={200} />
                </>
              )}

              <label className="obs-res-label">Detalle de la solución *</label>
              <textarea className="obs-res-textarea" rows={3} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Describa cómo se solucionó la novedad…" maxLength={500} />
              <div className="obs-res-contador">{detalle.trim().length}/500 (mín. 10)</div>
            </>
          ) : (
            <>
              <label className="obs-res-label">Motivo del rechazo *</label>
              <textarea className="obs-res-textarea" rows={3} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Explique por qué se rechaza esta observación…" maxLength={500} />
            </>
          )}
        </div>

        <div className="obs-res-footer">
          <button className="obs-res-btn obs-res-btn--cancel" onClick={onClose} disabled={enviando}>Cancelar</button>
          {modo === 'resolver' ? (
            <button className="obs-res-btn obs-res-btn--ok" onClick={() => void handleResolver()} disabled={enviando}>
              {enviando ? 'Guardando…' : 'Marcar como Resuelta'}
            </button>
          ) : (
            <button className="obs-res-btn obs-res-btn--danger" onClick={() => void handleRechazar()} disabled={enviando}>
              {enviando ? 'Guardando…' : 'Rechazar observación'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
