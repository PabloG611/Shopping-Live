import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { FaClipboardList, FaFilePdf, FaUser } from 'react-icons/fa6'

import { EncabezadoV2 } from 'react-ecosistema-unp/ui'
import { notificacion } from '../services/notificacionService'
import { useTransferencias } from '../context/useTransferencias'
import { marcarRevisandoTransferencia } from '../services/transferenciasEnvioService'
import { generarPdfPreview, descargarDesdeBase64 } from '../services/pdfTransferenciaService'
import { UserAvatarChip } from '../components/common/UserAvatarChip'
import type { EstadoSolicitud, SolicitudTransferencia } from '../types'

import './TransferenciaBienesPage.css'

const OBS_RECHAZO_MIN = 10
const OBS_RECHAZO_MAX = 500

type PestanaAdmin = 'solicitudes' | 'historico'

function etiquetaEstado(estado: EstadoSolicitud): string {
  switch (estado) { case 'pendiente': return 'Pendiente'; case 'aceptada': return 'Aceptada'; case 'rechazada': return 'Rechazada'; default: return estado }
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AdminAlmacenPage() {
  const uid = useId()

  const { solicitudes, refrescarSolicitudes, aceptarSolicitud, rechazarSolicitud } = useTransferencias()

  const [pestana, setPestana] = useState<PestanaAdmin>('solicitudes')
  const [seleccionada, setSeleccionada] = useState<SolicitudTransferencia | null>(null)
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pasoRechazo, setPasoRechazo] = useState(false)
  const [pasoAceptar, setPasoAceptar] = useState(false)
  const [tnsPrefijo, setTnsPrefijo] = useState('TR')
  const [tnsNumero, setTnsNumero] = useState('')
  const [pdfHistorial, setPdfHistorial] = useState<{ pdfDataUrl: string; nombreArchivo: string } | null>(null)
  const [regenerandoPdf, setRegenerandoPdf] = useState(false)

  useEffect(() => { void refrescarSolicitudes() }, [refrescarSolicitudes])

  const pendientes = useMemo(() => solicitudes.filter((s) => s.estado === 'pendiente').sort((a, b) => new Date(a.fechaISO).getTime() - new Date(b.fechaISO).getTime()), [solicitudes])
  const historico = useMemo(() => solicitudes.filter((s) => s.estado !== 'pendiente').sort((a, b) => new Date(b.fechaISO).getTime() - new Date(a.fechaISO).getTime()), [solicitudes])
  const listaActual = pestana === 'solicitudes' ? pendientes : historico

  // Al seleccionar una solicitud, marcar como revisando
  const seleccionar = useCallback((s: SolicitudTransferencia) => {
    if (seleccionada?.codigo) marcarRevisandoTransferencia(seleccionada.codigo, false)
    setSeleccionada(s)
    setObs(''); setPasoRechazo(false); setPasoAceptar(false); setTnsNumero(''); setPdfHistorial(null)
    if (s.estado === 'pendiente') marcarRevisandoTransferencia(s.codigo, true)
  }, [seleccionada])

  // Limpiar al desmontar
  useEffect(() => {
    return () => { if (seleccionada?.codigo && seleccionada.estado === 'pendiente') marcarRevisandoTransferencia(seleccionada.codigo, false) }
  }, [seleccionada])

  const ejecutarAceptar = async () => {
    if (!seleccionada || !tnsNumero.trim()) return
    setEnviando(true)
    const consecutivo = `${tnsPrefijo}-${tnsNumero.trim()}`
    const r = await aceptarSolicitud(seleccionada.codigo, consecutivo)
    setEnviando(false)
    if (r.ok) { notificacion.exito('Transferencia aceptada'); setSeleccionada(null); setPasoAceptar(false); setTnsNumero('') }
    else notificacion.error(r.mensaje ?? 'Error al aceptar')
  }

  const enviarRechazo = async () => {
    if (!seleccionada) return
    const t = obs.trim()
    if (t.length < OBS_RECHAZO_MIN || t.length > OBS_RECHAZO_MAX) return
    setEnviando(true)
    const r = await rechazarSolicitud(seleccionada.codigo, t)
    setEnviando(false)
    if (r.ok) { notificacion.exito('Transferencia rechazada'); setSeleccionada(null) }
    else notificacion.error(r.mensaje ?? 'Error al rechazar')
  }

  const abrirPdf = async (s: SolicitudTransferencia) => {
    if (regenerandoPdf) return
    if (s.pdfBase64) { setPdfHistorial({ pdfDataUrl: `data:application/pdf;base64,${s.pdfBase64}`, nombreArchivo: s.nombreArchivoPdf || `Transferencia-${s.codigo}.pdf` }); return }
    setRegenerandoPdf(true)
    try {
      const res = await generarPdfPreview(s.codigo, s.emisor, s.receptor, s.bienes)
      setPdfHistorial({ pdfDataUrl: res.pdfDataUrl, nombreArchivo: res.nombreArchivo })
    } catch { notificacion.error('No se pudo generar el PDF') }
    finally { setRegenerandoPdf(false) }
  }

  const obsTrimLen = obs.trim().length
  const obsValida = obsTrimLen >= OBS_RECHAZO_MIN && obsTrimLen <= OBS_RECHAZO_MAX

  return (
    <div className="transferencia-shell">


      {/* Header */}
      <div className="transferencia-shell__header">
        <EncabezadoV2 eyebrow="Direccion Logistica y Financiera" title="Administrador de Transferencias" subtitle="Gestione las solicitudes pendientes y consulte el histórico." hasMargin={false} />
        <div className="transferencia-shell__avatar"><UserAvatarChip /></div>
      </div>

      {/* Layout 2 paneles */}
      <div className="transferencia-layout transferencia-layout--admin">
        {/* Panel Izquierdo: Lista de solicitudes */}
        <aside className="transferencia-panel tb-sidebar">
          <div className="tb-sidebar__tabs">
            <button type="button" className={`tb-sidebar__tab${pestana === 'solicitudes' ? ' is-active' : ''}`} onClick={() => setPestana('solicitudes')}>
              Pendientes <span className="tb-sidebar__tab-count">{pendientes.length}</span>
            </button>
            <button type="button" className={`tb-sidebar__tab${pestana === 'historico' ? ' is-active' : ''}`} onClick={() => setPestana('historico')}>
              Histórico <span className="tb-sidebar__tab-count">{historico.length}</span>
            </button>
          </div>

          <div className="tb-sidebar__list">
            {listaActual.length === 0 ? (
              <div className="tb-empty"><p className="tb-empty__desc">{pestana === 'solicitudes' ? 'No hay solicitudes pendientes.' : 'No hay registros en el histórico.'}</p></div>
            ) : (
              listaActual.map((s) => {
                const isActive = seleccionada?.codigo === s.codigo
                return (
                  <button key={s.codigo} type="button" className={`tb-card${isActive ? ' is-selected' : ''}`} onClick={() => seleccionar(s)}>
                    <div className="tb-card__data">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span className="tb-card__placa">{s.codigo}</span>
                        <span className={`tb-card__estado tb-card__estado--${s.estado === 'pendiente' ? 'proceso' : s.estado === 'aceptada' ? 'ok' : 'faltante'}`}>{etiquetaEstado(s.estado)}</span>
                      </div>
                      <span className="tb-card__desc" style={{ whiteSpace: 'normal' }}>{s.emisor.nombreCompleto}</span>
                      <span style={{ fontSize: '0.65rem', color: '#667d96' }}>→ {s.receptor.nombreCompleto}</span>
                      <div className="tb-card__meta">
                        <span>{formatFecha(s.fechaISO)}</span>
                        <span className="tb-card__meta-sep">·</span>
                        <span>{s.bienes.length} bienes</span>
                        <span className="tb-card__meta-sep">·</span>
                        <span>{s.tipoBien === 'floresta' ? 'Floresta' : 'UNP'}</span>
                      </div>
                      {s.emisor.dependencia && <span className="tb-card__meta" style={{ marginTop: 2 }}>{s.emisor.dependencia}</span>}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* Panel Central: Detalle de solicitud */}
        <main className="transferencia-panel tb-central">
          {pdfHistorial ? (
            <>
              <div className="tb-central__header"><div><h3 className="tb-central__title">Formato PDF — {seleccionada?.codigo}</h3></div></div>
              <div className="tb-central__body tb-central__body--pdf">
                <div className="tb-pdf-inline">
                  <div className="tb-pdf-inline__frame"><iframe src={pdfHistorial.pdfDataUrl} title="PDF" /></div>
                  <div className="tb-pdf-inline__actions">
                    <button type="button" className="tb-btn tb-btn--secondary" onClick={() => setPdfHistorial(null)}>Volver al detalle</button>
                    <button type="button" className="tb-btn tb-btn--secondary" onClick={() => descargarDesdeBase64(pdfHistorial.pdfDataUrl, pdfHistorial.nombreArchivo)}>Descargar PDF</button>
                  </div>
                </div>
              </div>
            </>
          ) : !seleccionada ? (
            <>
              <div className="tb-central__header"><div><h3 className="tb-central__title">Detalle de solicitud</h3><p className="tb-central__subtitle">Seleccione una solicitud del panel izquierdo.</p></div></div>
              <div className="tb-central__body">
                <div className="tb-empty">
                  <div className="tb-empty__icon"><FaClipboardList /></div>
                  <strong className="tb-empty__title">Ninguna solicitud seleccionada</strong>
                  <p className="tb-empty__desc">Haga clic en una solicitud para ver su detalle y gestionarla.</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="tb-central__header tb-central__header--solicitud">
                <div className="tb-central__solicitud-info">
                  <h3 className="tb-central__title">Solicitud {seleccionada.codigo}</h3>
                  <p className="tb-central__subtitle">{formatFecha(seleccionada.fechaISO)} · {seleccionada.tipoBien === 'floresta' ? 'Floresta' : 'UNP'}</p>
                </div>
                <button type="button" className="tb-btn tb-btn--secondary" onClick={() => void abrirPdf(seleccionada)} disabled={regenerandoPdf}>
                  <FaFilePdf size={11} /> {regenerandoPdf ? 'Cargando...' : 'Ver PDF'}
                </button>
              </div>
              <div className="tb-central__body">
                {/* Personas */}
                <div className="tb-confirmar__personas">
                  <div className="tb-confirmar__persona tb-confirmar__persona--emisor">
                    <div className="tb-confirmar__persona-badge"><FaUser size={14} /></div>
                    <h4 className="tb-confirmar__persona-titulo">Entregado por</h4>
                    <p className="tb-confirmar__persona-nombre">{seleccionada.emisor.nombreCompleto}</p>
                    <p className="tb-confirmar__persona-doc">{seleccionada.emisor.tipoIdentificacion} {seleccionada.emisor.numeroIdentificacion}</p>
                    <div className="tb-confirmar__persona-datos">
                      {seleccionada.emisor.cargo && <span><strong>Cargo:</strong> {seleccionada.emisor.cargo}</span>}
                      {seleccionada.emisor.dependencia && <span><strong>Dep:</strong> {seleccionada.emisor.dependencia}</span>}
                      {seleccionada.emisor.grupo && <span><strong>Grupo:</strong> {seleccionada.emisor.grupo}</span>}
                    </div>
                  </div>
                  <div className="tb-confirmar__persona-arrow">→</div>
                  <div className="tb-confirmar__persona tb-confirmar__persona--receptor">
                    <div className="tb-confirmar__persona-badge"><FaUser size={14} /></div>
                    <h4 className="tb-confirmar__persona-titulo">Quien recibe</h4>
                    <p className="tb-confirmar__persona-nombre">{seleccionada.receptor.nombreCompleto}</p>
                    <p className="tb-confirmar__persona-doc">{seleccionada.receptor.tipoIdentificacion} {seleccionada.receptor.numeroIdentificacion}</p>
                    <div className="tb-confirmar__persona-datos">
                      {seleccionada.receptor.cargo && <span><strong>Cargo:</strong> {seleccionada.receptor.cargo}</span>}
                      {seleccionada.receptor.dependencia && <span><strong>Dep:</strong> {seleccionada.receptor.dependencia}</span>}
                      {seleccionada.receptor.grupo && <span><strong>Grupo:</strong> {seleccionada.receptor.grupo}</span>}
                      {seleccionada.receptor.sede && <span><strong>Sede:</strong> {seleccionada.receptor.sede}</span>}
                    </div>
                  </div>
                </div>

                {/* Rechazo previo */}
                {seleccionada.estado === 'rechazada' && seleccionada.observacionRechazo && (
                  <div className="tb-seguimiento-rechazo" style={{ marginBottom: 12 }}>
                    <strong>Motivo del rechazo:</strong> {seleccionada.observacionRechazo}
                  </div>
                )}

                {/* Bienes */}
                <div className="tb-confirmar__bienes">
                  <h4 className="tb-confirmar__bienes-titulo">Bienes incluidos ({seleccionada.bienes.length})</h4>
                  <div className="tb-confirmar__bienes-grid">
                    {seleccionada.bienes.map((b) => (
                      <div key={b.placa} className="tb-confirmar__bien-card">
                        <div className="tb-confirmar__bien-card-header">
                          <code className="tb-confirmar__bien-card-placa">{b.placa}</code>
                          <span className={`tb-confirmar__bien-card-tipo${b.tipo === 'floresta' ? ' tb-confirmar__bien-card-tipo--floresta' : ''}`}>{b.tipo === 'floresta' ? 'Floresta' : 'UNP'}</span>
                        </div>
                        <p className="tb-confirmar__bien-card-desc">{b.descripcion}</p>
                        <div className="tb-confirmar__bien-card-meta">
                          <span>Serial: {b.serial || 'N/A'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gestión: Aceptar / Rechazar (solo pendientes) */}
                {seleccionada.estado === 'pendiente' && (
                  <div className="tb-admin-gestion">
                    <h4 className="tb-admin-gestion__titulo">Gestionar solicitud</h4>

                    {!pasoRechazo && !pasoAceptar && (
                      <div className="tb-admin-gestion__botones">
                        <button type="button" className="tb-btn tb-btn--confirm" onClick={() => setPasoAceptar(true)} disabled={enviando}>
                          Aceptar transferencia
                        </button>
                        <button type="button" className="tb-btn tb-btn--danger" onClick={() => { setPasoRechazo(true); setTimeout(() => document.getElementById(`${uid}-obs`)?.focus(), 100) }} disabled={enviando}>
                          Rechazar transferencia
                        </button>
                      </div>
                    )}

                    {/* Flujo aceptar: pedir consecutivo TNS */}
                    {pasoAceptar && (
                      <div className="tb-admin-gestion__aceptar">
                        <label className="tb-admin-gestion__label" htmlFor={`${uid}-tns`}>Consecutivo TNS (obligatorio) *</label>
                        <div className="tb-admin-gestion__tns-row">
                          <select className="tb-admin-gestion__tns-select" value={tnsPrefijo} onChange={(e) => setTnsPrefijo(e.target.value)}>
                            <option value="TR">TR</option>
                            <option value="TS">TS</option>
                          </select>
                          <input id={`${uid}-tns`} className="tb-admin-gestion__tns-input" type="text" placeholder="Número..." value={tnsNumero} onChange={(e) => setTnsNumero(e.target.value.replace(/\D/g, ''))} disabled={enviando} />
                        </div>
                        <div className="tb-admin-gestion__rechazo-actions">
                          <button type="button" className="tb-btn tb-btn--secondary" onClick={() => { setPasoAceptar(false); setTnsNumero('') }} disabled={enviando}>Cancelar</button>
                          <button type="button" className="tb-btn tb-btn--confirm" onClick={() => void ejecutarAceptar()} disabled={enviando || !tnsNumero.trim()}>Confirmar aceptación</button>
                        </div>
                      </div>
                    )}

                    {/* Flujo rechazar */}
                    {pasoRechazo && (
                      <div className="tb-admin-gestion__rechazo">
                        <label className="tb-admin-gestion__label" htmlFor={`${uid}-obs`}>Motivo del rechazo *</label>
                        <textarea id={`${uid}-obs`} className="tb-admin-gestion__textarea" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Describa el motivo..." maxLength={OBS_RECHAZO_MAX} rows={3} disabled={enviando} />
                        <p className="tb-admin-gestion__conteo">{obsTrimLen}/{OBS_RECHAZO_MAX}{obsTrimLen > 0 && obsTrimLen < OBS_RECHAZO_MIN ? ` · Mínimo ${OBS_RECHAZO_MIN} caracteres` : ''}</p>
                        <div className="tb-admin-gestion__rechazo-actions">
                          <button type="button" className="tb-btn tb-btn--secondary" onClick={() => { setPasoRechazo(false); setObs('') }} disabled={enviando}>Cancelar</button>
                          <button type="button" className="tb-btn tb-btn--danger" onClick={() => void enviarRechazo()} disabled={enviando || !obsValida}>Enviar rechazo</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
