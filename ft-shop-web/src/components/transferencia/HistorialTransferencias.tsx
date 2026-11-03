import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { FaEye, FaFilePdf } from 'react-icons/fa'

import { useTheadFiltrosCabecal } from '../../hooks/useTheadFiltrosCabecal'
import { TablaFiltrosCurtain } from '../ui/TablaFiltros'
import type { SolicitudTransferencia } from '../../types'
import { cumpleFiltroFechaFlexible, cumpleFiltroTexto } from '../../utils/tablaFiltros'

import '../bienes/BienesTable.css'
import './HistorialTransferencias.css'
import { SolicitudDetalleModal } from './SolicitudDetalleModal'

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

interface HistorialTransferenciasProps {
  items: SolicitudTransferencia[]
  ocultarTitulo?: boolean
  habilitarFiltrosOpcionales?: boolean
  mensajeListaVacia?: string
  onVerPdf?: (solicitud: SolicitudTransferencia) => void
  /** Permite cancelar solicitudes pendientes (vista usuario). */
  onCancelar?: (codigo: string) => Promise<{ ok: boolean; mensaje?: string }>
  /** Indica si se está regenerando un PDF (deshabilita botones). */
  regenerandoPdf?: boolean
  /** Callback para recargar la lista de transferencias cuando llegue una notificación WebSocket. */
  onRecargar?: () => void
  /** IDs de transferencias que un admin está revisando actualmente */
  transferenciasRevisando?: Set<string>
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

function textoPersona(nombre: string, tipo: string, numero: string): string {
  return `${nombre} · ${tipo} ${numero}`
}

export function HistorialTransferencias({
  items,
  ocultarTitulo,
  habilitarFiltrosOpcionales = false,
  mensajeListaVacia,
  onVerPdf,
  onCancelar,
  regenerandoPdf = false,
  onRecargar: _onRecargar,
  transferenciasRevisando,
}: HistorialTransferenciasProps) {
  const uid = useId()
  const [detalle, setDetalle] = useState<SolicitudTransferencia | null>(null)
  const tituloModalId = `${uid}-detalle-titulo`
  const idPanel = `${uid}-hist-filtros-panel`
  const idBoton = `${uid}-hist-filtros-btn`
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [fCodigo, setFCodigo] = useState('')
  const [fFecha, setFFecha] = useState('')
  const [fEmisor, setFEmisor] = useState('')
  const [fReceptor, setFReceptor] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fEstado, setFEstado] = useState('')

  // Conectar al WebSocket para recibir notificaciones en tiempo real
  // TEMPORAL: Desactivado desde .env (VITE_WEBSOCKET_ENABLED=false)
  // El WebSocket se maneja en TransferenciasProvider - no duplicar aquí

  useEffect(() => {
    if (!filtrosAbiertos) {
      setFCodigo('')
      setFFecha('')
      setFEmisor('')
      setFReceptor('')
      setFTipo('')
      setFEstado('')
    }
  }, [filtrosAbiertos])

  const cabFiltros = useTheadFiltrosCabecal(!!habilitarFiltrosOpcionales, [filtrosAbiertos, items.length])

  const abrirDetalle = useCallback((s: SolicitudTransferencia) => {
    setDetalle(s)
  }, [])

  const ordenado = useMemo(
    () => [...items].sort((a, b) => new Date(b.fechaISO).getTime() - new Date(a.fechaISO).getTime()),
    [items],
  )

  const filas = useMemo(() => {
    return ordenado.filter((s) => {
      if (!cumpleFiltroTexto(fCodigo, s.codigo)) return false
      if (!cumpleFiltroFechaFlexible(fFecha, s.fechaISO, fechaSoloDia(s.fechaISO))) return false
      if (
        !cumpleFiltroTexto(
          fEmisor,
          textoPersona(s.emisor.nombreCompleto, s.emisor.tipoIdentificacion, s.emisor.numeroIdentificacion),
        )
      )
        return false
      if (
        !cumpleFiltroTexto(
          fReceptor,
          textoPersona(s.receptor.nombreCompleto, s.receptor.tipoIdentificacion, s.receptor.numeroIdentificacion),
        )
      )
        return false
      if (!cumpleFiltroTexto(fTipo, s.tipoBien === 'floresta' ? 'Floresta' : 'UNP')) return false
      if (!cumpleFiltroTexto(fEstado, etiquetaEstado(s.estado))) return false
      return true
    })
  }, [ordenado, fCodigo, fFecha, fEmisor, fReceptor, fTipo, fEstado])

  const tablaHistorial = (
    <table className="bienes-table">
      <thead ref={cabFiltros.theadRef} onMouseEnter={cabFiltros.onEntrarThead}>
        <tr>
          <th scope="col">Código</th>
          <th scope="col">Fecha</th>
          <th scope="col" className="historial__th--persona">
            Entregado por
          </th>
          <th scope="col" className="historial__th--persona">
            Recibido por
          </th>
          <th scope="col">Tipo</th>
          <th scope="col" className="historial__th--estado">
            Estado
          </th>
          <th scope="col" className="historial__th--detalle">
            Detalle
          </th>
          {onVerPdf && (
            <th scope="col" className="historial__th--detalle">
              PDF
            </th>
          )}
        </tr>
        {habilitarFiltrosOpcionales && filtrosAbiertos ? (
          <tr className="tabla-filtros__fila" aria-label="Filtros por columna">
            <th scope="col">
              <label className="bienes-table-wrap__titulo--accesible-oculto" htmlFor={`${uid}-hf-cod`}>
                Filtrar código
              </label>
              <input
                id={`${uid}-hf-cod`}
                className="tabla-filtros__input"
                type="search"
                placeholder="Buscar…"
                value={fCodigo}
                onChange={(e) => setFCodigo(e.target.value)}
                autoComplete="off"
              />
            </th>
            <th scope="col">
              <label className="bienes-table-wrap__titulo--accesible-oculto" htmlFor={`${uid}-hf-fec`}>
                Filtrar fecha
              </label>
              <input
                id={`${uid}-hf-fec`}
                className="tabla-filtros__input"
                type="search"
                placeholder="dd/mm/aaaa, año…"
                title="Coincide con la fecha mostrada, año o parte del registro ISO"
                value={fFecha}
                onChange={(e) => setFFecha(e.target.value)}
                autoComplete="off"
              />
            </th>
            <th scope="col" className="historial__th--persona">
              <label className="bienes-table-wrap__titulo--accesible-oculto" htmlFor={`${uid}-hf-em`}>
                Filtrar entregado por
              </label>
              <input
                id={`${uid}-hf-em`}
                className="tabla-filtros__input"
                type="search"
                placeholder="Nombre o documento…"
                value={fEmisor}
                onChange={(e) => setFEmisor(e.target.value)}
                autoComplete="off"
              />
            </th>
            <th scope="col" className="historial__th--persona">
              <label className="bienes-table-wrap__titulo--accesible-oculto" htmlFor={`${uid}-hf-rec`}>
                Filtrar recibido por
              </label>
              <input
                id={`${uid}-hf-rec`}
                className="tabla-filtros__input"
                type="search"
                placeholder="Nombre o documento…"
                value={fReceptor}
                onChange={(e) => setFReceptor(e.target.value)}
                autoComplete="off"
              />
            </th>
            <th scope="col">
              <label className="bienes-table-wrap__titulo--accesible-oculto" htmlFor={`${uid}-hf-tip`}>
                Filtrar tipo
              </label>
              <input
                id={`${uid}-hf-tip`}
                className="tabla-filtros__input"
                type="search"
                placeholder="UNP, Floresta…"
                value={fTipo}
                onChange={(e) => setFTipo(e.target.value)}
                autoComplete="off"
              />
            </th>
            <th scope="col" className="historial__th--estado">
              <label className="bienes-table-wrap__titulo--accesible-oculto" htmlFor={`${uid}-hf-est`}>
                Filtrar estado
              </label>
              <input
                id={`${uid}-hf-est`}
                className="tabla-filtros__input"
                type="search"
                placeholder="En proceso, Aceptada…"
                value={fEstado}
                onChange={(e) => setFEstado(e.target.value)}
                autoComplete="off"
              />
            </th>
            <th className="historial__th--detalle tabla-filtros__th--sin-filtro" scope="col" aria-hidden="true" />
            {onVerPdf && (
              <th className="historial__th--detalle tabla-filtros__th--sin-filtro" scope="col" aria-hidden="true" />
            )}
          </tr>
        ) : null}
      </thead>
      <tbody>
        {filas.length === 0 ? (
          <tr>
            <td className="bienes-table__sin-resultados" colSpan={onVerPdf ? 8 : 7}>
              Ninguna solicitud coincide con los filtros actuales.
            </td>
          </tr>
        ) : (
          filas.map((s) => (
            <tr key={s.codigo}>
              <td>
                <code className="bienes-table__code">{s.codigo}</code>
              </td>
              <td style={{ whiteSpace: 'pre-line' }}>{fechaSoloDia(s.fechaISO)}</td>
              <td className="historial__td--persona">
                {textoPersona(s.emisor.nombreCompleto, s.emisor.tipoIdentificacion, s.emisor.numeroIdentificacion)}
              </td>
              <td className="historial__td--persona">
                {textoPersona(
                  s.receptor.nombreCompleto,
                  s.receptor.tipoIdentificacion,
                  s.receptor.numeroIdentificacion,
                )}
              </td>
              <td>{s.tipoBien === 'floresta' ? 'Floresta' : 'UNP'}</td>
              <td className="historial__td--estado">
                {transferenciasRevisando?.has(s.codigo) ? (
                  <span className="historial__estado historial__estado--revisando">
                    Revisando<span className="historial__typing-dots"><span>.</span><span>.</span><span>.</span></span>
                  </span>
                ) : (
                  <span className={claseEstado(s.estado)}>{etiquetaEstado(s.estado)}</span>
                )}
              </td>
              <td className="historial__td--detalle">
                <button
                  type="button"
                  className="historial__btn-icono-detalle"
                  onClick={() => abrirDetalle(s)}
                  aria-label={
                    s.estado === 'rechazada'
                      ? `Ver detalle de la solicitud ${s.codigo}, incluye motivo del rechazo`
                      : `Ver detalle de la solicitud ${s.codigo}`
                  }
                >
                  <FaEye aria-hidden />
                </button>
              </td>
              {onVerPdf && (
                <td className="historial__td--detalle">
                  <button
                    type="button"
                    className="historial__btn-icono-detalle"
                    onClick={() => onVerPdf(s)}
                    disabled={regenerandoPdf}
                    aria-label={`Ver PDF de la solicitud ${s.codigo}`}
                    title={regenerandoPdf ? "Regenerando PDF..." : "Ver PDF"}
                  >
                    <FaFilePdf aria-hidden />
                  </button>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )

  if (items.length === 0) {
    return (
      <section
        className="historial"
        aria-labelledby={ocultarTitulo ? undefined : 'historial-titulo'}
        aria-label={ocultarTitulo ? 'Historial de transferencias' : undefined}
      >
        {!ocultarTitulo && (
          <h3 id="historial-titulo" className="historial__titulo">
            Historial de transferencias
          </h3>
        )}
        <p className="historial__vacio">
          {mensajeListaVacia ?? 'Aún no registra solicitudes de transferencia.'}
        </p>
      </section>
    )
  }

  return (
    <section
      className="historial"
      aria-labelledby={ocultarTitulo ? undefined : 'historial-titulo'}
      aria-label={ocultarTitulo ? 'Historial de transferencias' : undefined}
    >
      {detalle ? (
        <SolicitudDetalleModal
          solicitud={detalle}
          tituloId={tituloModalId}
          onCerrar={() => setDetalle(null)}
          habilitarFiltrosOpcionales={habilitarFiltrosOpcionales}
          modoCancelar={!!onCancelar}
          onCancelar={onCancelar ? () => onCancelar(detalle.codigo) : undefined}
        />
      ) : null}

      {!ocultarTitulo && (
        <h3 id="historial-titulo" className="historial__titulo">
          Historial de transferencias
        </h3>
      )}
      <div className="bienes-table-wrap historial__bienes-wrap">
        {habilitarFiltrosOpcionales ? (
          <div
            ref={cabFiltros.hostRef}
            className="tabla-filtros-outer-host historial__tabla-envoltorio tabla-filtros-scroll-host"
            id={idPanel}
            onMouseMove={cabFiltros.onMovimientoHost}
            onMouseLeave={cabFiltros.onSalidaHost}
          >
            <div ref={cabFiltros.paneRef} className="bienes-table-scroll">
              {tablaHistorial}
            </div>
            <TablaFiltrosCurtain
              muestra={cabFiltros.sobreCabecera}
              caja={cabFiltros.caja}
              expandido={filtrosAbiertos}
              onToggle={() => setFiltrosAbiertos((v) => !v)}
              idBoton={idBoton}
              idPanel={idPanel}
            />
          </div>
        ) : (
          <div
            ref={cabFiltros.hostRef}
            className="bienes-table-scroll historial__tabla-envoltorio"
            id={idPanel}
          >
            {tablaHistorial}
          </div>
        )}
      </div>
    </section>
  )
}
