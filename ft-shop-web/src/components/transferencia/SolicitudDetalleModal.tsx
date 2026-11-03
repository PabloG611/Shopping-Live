import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa'

import { BienesTable } from '../bienes/BienesTable'
import { useModalAnimacionSalida } from '../../hooks/useModalAnimacionSalida'
import type { SolicitudTransferencia } from '../../types'

import '../../pages/PageLayout.css'
import './HistorialTransferencias.css'

function fechaSoloDia(iso: string): string {
  const d = new Date(iso)
  const fecha = d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const hora = d.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  return `${fecha}\n${hora}`
}

function etiquetaEstado(estado: SolicitudTransferencia['estado']): string {
  switch (estado) {
    case 'pendiente':
      return 'En proceso'
    case 'aceptada':
      return 'Aceptada'
    case 'rechazada':
      return 'Rechazada'
    default:
      return estado
  }
}

function claseEstado(estado: SolicitudTransferencia['estado']): string {
  return `historial__estado historial__estado--${estado}`
}

function textoPersonaDoc(p: SolicitudTransferencia['receptor']): string {
  return `${p.tipoIdentificacion ?? 'ID'} ${p.numeroIdentificacion}`
}

const OBS_RECHAZO_MIN = 30
const OBS_RECHAZO_MAX = 500

export interface SolicitudDetalleModalProps {
  solicitud: SolicitudTransferencia
  tituloId: string
  onCerrar: () => void
  habilitarFiltrosOpcionales?: boolean
  /** Muestra aceptar / rechazar cuando la solicitud está pendiente. */
  modoGestionAlmacen?: boolean
  onAceptar?: () => Promise<{ ok: boolean; mensaje?: string }>
  onRechazar?: (observacion: string) => Promise<{ ok: boolean; mensaje?: string }>
  /** Muestra cancelar transferencia cuando la solicitud está pendiente (vista usuario). */
  modoCancelar?: boolean
  onCancelar?: () => Promise<{ ok: boolean; mensaje?: string }>
}

export function SolicitudDetalleModal({
  solicitud: s,
  tituloId,
  onCerrar,
  habilitarFiltrosOpcionales = false,
  modoGestionAlmacen = false,
  onAceptar,
  onRechazar,
  modoCancelar = false,
  onCancelar,
}: SolicitudDetalleModalProps) {
  const { claseBackdrop, solicitarCierre, onFinAnimacionBackdrop } = useModalAnimacionSalida(onCerrar, s.codigo)
  const [obs, setObs] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [pasoRechazo, setPasoRechazo] = useState(false)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)

  const puedeGestionar =
    modoGestionAlmacen && s.estado === 'pendiente' && onAceptar && onRechazar

  const obsTrimLen = obs.trim().length
  const obsValidaParaEnviar = obsTrimLen >= OBS_RECHAZO_MIN && obsTrimLen <= OBS_RECHAZO_MAX

  useEffect(() => {
    setObs('')
    setMsg(null)
    setEnviando(false)
    setPasoRechazo(false)
  }, [s.codigo])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !enviando) solicitarCierre()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [solicitarCierre, enviando])

  const ejecutarAceptar = useCallback(async () => {
    if (!onAceptar) return
    setPasoRechazo(false)
    setObs('')
    setMsg(null)
    setEnviando(true)
    const r = await onAceptar()
    setEnviando(false)
    if (r.ok) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => solicitarCierre())
      })
    } else setMsg(r.mensaje ?? 'No se pudo aceptar.')
  }, [onAceptar, solicitarCierre])

  const enviarRechazo = useCallback(async () => {
    if (!onRechazar) return
    const t = obs.trim()
    if (t.length < OBS_RECHAZO_MIN || t.length > OBS_RECHAZO_MAX) return
    setMsg(null)
    setEnviando(true)
    const r = await onRechazar(t)
    setEnviando(false)
    if (r.ok) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => solicitarCierre())
      })
    } else setMsg(r.mensaje ?? 'No se pudo rechazar.')
  }, [onRechazar, obs, solicitarCierre])

  const cancelarRechazo = useCallback(() => {
    setPasoRechazo(false)
    setObs('')
    setMsg(null)
  }, [])

  return createPortal(
    <div
      className={`historial-modal-backdrop${claseBackdrop ? ` ${claseBackdrop}` : ''}`}
      role="presentation"
      onAnimationEnd={onFinAnimacionBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="historial-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="historial-modal__cabecera" style={{ justifyContent: 'center' }}>
          <h4 id={tituloId} className="historial-modal__titulo" style={{ textAlign: 'center', flex: 1 }}>
            Detalle de solicitud{' '}
            <span className="historial-modal__titulo-codigo" translate="no">
              {s.codigo}
            </span>
          </h4>
          <button
            type="button"
            className="historial-modal__cerrar"
            onClick={solicitarCierre}
            disabled={enviando}
            aria-label="Cerrar detalle"
          >
            ×
          </button>
        </header>

        <dl className="historial-modal__meta">
          <div>
            <dt>Fecha</dt>
            <dd style={{ whiteSpace: 'pre-line' }}>{fechaSoloDia(s.fechaISO)}</dd>
          </div>
          <div>
            <dt>Tipo de bienes</dt>
            <dd>{s.tipoBien === 'floresta' ? 'Floresta' : 'UNP'}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <span className={claseEstado(s.estado)}>{etiquetaEstado(s.estado)}</span>
            </dd>
          </div>
        </dl>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <section className="historial-modal__seccion" aria-labelledby={`${tituloId}-em`}>
            <h5 id={`${tituloId}-em`} className="historial-modal__subtitulo">
              Entregado por
            </h5>
            <p className="historial-modal__texto">
              <strong>{s.emisor.nombreCompleto}</strong>
              <br />
              <span className="historial-modal__muted">
                {s.emisor.tipoIdentificacion} {s.emisor.numeroIdentificacion}
              </span>
              {s.emisor.cargo ? (
                <>
                  <br />
                  <span className="historial-modal__rotulo-dato">Cargo:</span> {s.emisor.cargo}
                </>
              ) : null}
              {s.emisor.dependencia ? (
                <>
                  <br />
                  <span className="historial-modal__rotulo-dato">Dependencia:</span> {s.emisor.dependencia}
                </>
              ) : null}
              {s.emisor.grupo ? (
                <>
                  <br />
                  <span className="historial-modal__rotulo-dato">Grupo:</span> {s.emisor.grupo}
                </>
              ) : null}
              {s.emisor.sede ? (
                <>
                  <br />
                  <span className="historial-modal__rotulo-dato">Sede:</span> {s.emisor.sede}
                </>
              ) : null}
            </p>
          </section>

          <section className="historial-modal__seccion" aria-labelledby={`${tituloId}-rec`}>
            <h5 id={`${tituloId}-rec`} className="historial-modal__subtitulo">
              Recibido por
            </h5>
            <p className="historial-modal__texto">
              <strong>{s.receptor.nombreCompleto}</strong>
              <br />
              <span className="historial-modal__muted">{textoPersonaDoc(s.receptor)}</span>
              {s.receptor.cargo ? (
                <>
                  <br />
                  <span className="historial-modal__rotulo-dato">Cargo:</span> {s.receptor.cargo}
                </>
              ) : null}
              {s.receptor.dependencia ? (
                <>
                  <br />
                  <span className="historial-modal__rotulo-dato">Dependencia:</span> {s.receptor.dependencia}
                </>
              ) : null}
              {s.receptor.grupo ? (
                <>
                  <br />
                  <span className="historial-modal__rotulo-dato">Grupo:</span> {s.receptor.grupo}
                </>
              ) : null}
              {s.receptor.sede ? (
                <>
                  <br />
                  <span className="historial-modal__rotulo-dato">Sede:</span> {s.receptor.sede}
                </>
              ) : null}
            </p>
          </section>
        </div>

        {s.estado === 'rechazada' && s.observacionRechazo ? (
          <section className="historial-modal__seccion historial-modal__seccion--alerta" aria-labelledby={`${tituloId}-obs`}>
            <h5 id={`${tituloId}-obs`} className="historial-modal__subtitulo">
              Motivo del rechazo
            </h5>
            <p className="historial-modal__obs-rechazo">{s.observacionRechazo}</p>
          </section>
        ) : null}

        <div className="historial-modal__seccion" role="region" aria-label="Bienes incluidos en la solicitud">
          <BienesTable
            titulo={`Bienes incluidos (${s.bienes.length})`}
            ocultarTitulo={false}
            bienes={s.bienes}
            habilitarFiltrosOpcionales={habilitarFiltrosOpcionales}
            classNameWrap="historial-modal__bienes-wrap"
            classNameScroll="historial-modal__tabla-wrap"
            vacioMensaje="Sin bienes en la solicitud."
            ocultarExpandir
          />
        </div>

        {puedeGestionar ? (
          <section className="historial-modal__seccion historial-modal__gestion" aria-labelledby={`${tituloId}-gest`}>
            <h5 id={`${tituloId}-gest`} className="historial-modal__subtitulo">
              Gestionar solicitud
            </h5>
            {msg ? (
              <p className="page__error" role="alert">
                {msg}
              </p>
            ) : null}
            <div
              className={`historial-modal__gestion-fila${pasoRechazo ? ' historial-modal__gestion-fila--rechazo-abierto' : ''}`}
            >
              <button
                type="button"
                className="historial-modal__btn-decision historial-modal__btn-decision--aceptar"
                disabled={enviando}
                onClick={() => void ejecutarAceptar()}
              >
                <FaCheckCircle className="historial-modal__btn-decision__ico" aria-hidden />
                Aceptar transferencia
              </button>
              <button
                type="button"
                className={`historial-modal__btn-decision historial-modal__btn-decision--rechazar${pasoRechazo ? ' historial-modal__btn-decision--rechazar-activo' : ''}`}
                disabled={enviando || pasoRechazo}
                onClick={() => {
                  setMsg(null)
                  setPasoRechazo(true)
                }}
              >
                <FaTimesCircle
                  className={`historial-modal__btn-decision__ico${pasoRechazo ? ' historial-modal__btn-decision__ico--fade' : ''}`}
                  aria-hidden
                />
                Rechazar transferencia
              </button>
            </div>

            <div
              className={`historial-modal__rechazo-collapsible${pasoRechazo ? ' historial-modal__rechazo-collapsible--open' : ''}`}
              aria-hidden={!pasoRechazo}
            >
              <div className="historial-modal__rechazo-collapsible-inner">
                <div className="historial-modal__rechazo-form">
                  <label className="page__label" htmlFor={`${tituloId}-obs-rechazo`}>
                    Observaciones del rechazo
                  </label>
                  <textarea
                    id={`${tituloId}-obs-rechazo`}
                    className="page__textarea historial-modal__textarea-rechazo"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    placeholder="Describa el motivo del rechazo…"
                    disabled={!pasoRechazo || enviando}
                    maxLength={OBS_RECHAZO_MAX}
                    rows={5}
                    aria-invalid={obs.length > 0 && !obsValidaParaEnviar}
                  />
                  <p
                    className={
                      obsTrimLen > 0 && obsTrimLen < OBS_RECHAZO_MIN
                        ? 'historial-modal__conteo-obs historial-modal__conteo-obs--aviso'
                        : 'historial-modal__conteo-obs'
                    }
                  >
                    {obsTrimLen}/{OBS_RECHAZO_MAX} caracteres
                    {obsTrimLen > 0 && obsTrimLen < OBS_RECHAZO_MIN
                      ? ` · Faltan ${OBS_RECHAZO_MIN - obsTrimLen} para el mínimo (${OBS_RECHAZO_MIN})`
                      : null}
                  </p>
                  <div className="historial-modal__acciones historial-modal__acciones--rechazo-footer">
                    <button
                      type="button"
                      className="page__btn page__btn--secondary"
                      disabled={enviando || !pasoRechazo}
                      onClick={cancelarRechazo}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="page__btn page__btn--danger"
                      disabled={enviando || !pasoRechazo || !obsValidaParaEnviar}
                      onClick={() => void enviarRechazo()}
                    >
                      Enviar rechazo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* Cancelar transferencia (vista usuario) */}
        {modoCancelar && s.estado === 'pendiente' && onCancelar ? (
          <section className="historial-modal__seccion historial-modal__gestion" aria-labelledby={`${tituloId}-cancel`}>
            <h5 id={`${tituloId}-cancel`} className="historial-modal__subtitulo">
              Cancelar transferencia
            </h5>
            {msg && confirmandoCancelar ? (
              <p className="historial-modal__msg historial-modal__msg--error" role="alert">{msg}</p>
            ) : null}
            {!confirmandoCancelar ? (
              <div className="historial-modal__acciones">
                <button
                  type="button"
                  className="page__btn page__btn--danger"
                  disabled={enviando}
                  onClick={() => { setConfirmandoCancelar(true); setMsg(null) }}
                >
                  ✕ Cancelar esta transferencia
                </button>
              </div>
            ) : (
              <div className="historial-modal__cancelar-confirmar">
                <p className="historial-modal__cancelar-aviso">
                  ¿Está seguro de cancelar esta transferencia? Los bienes volverán a su inventario y la solicitud se eliminará.
                </p>
                <div className="historial-modal__acciones">
                  <button
                    type="button"
                    className="page__btn page__btn--secondary"
                    disabled={enviando}
                    onClick={() => { setConfirmandoCancelar(false); setMsg(null) }}
                  >
                    No, volver
                  </button>
                  <button
                    type="button"
                    className="page__btn page__btn--danger"
                    disabled={enviando}
                    onClick={async () => {
                      setEnviando(true)
                      setMsg(null)
                      const res = await onCancelar()
                      if (res.ok) {
                        solicitarCierre()
                      } else {
                        setMsg(res.mensaje ?? 'Error cancelando.')
                      }
                      setEnviando(false)
                    }}
                  >
                    Sí, cancelar transferencia
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
