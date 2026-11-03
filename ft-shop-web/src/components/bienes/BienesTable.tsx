import { useEffect, useId, useMemo, useState } from 'react'
import { FaExpand, FaCompress } from 'react-icons/fa'

import { useTheadFiltrosCabecal } from '../../hooks/useTheadFiltrosCabecal'
import { TablaFiltrosCurtain } from '../ui/TablaFiltros'
import type { Bien } from '../../types'
import { cumpleFiltroTexto } from '../../utils/tablaFiltros'
import TruckLoader from './TruckLoader'

import './BienesTable.css'

interface BienesTableProps {
  titulo: string
  /** Si es true, el título queda solo para lectores de pantalla (pestañas u otros títulos visibles). */
  ocultarTitulo?: boolean
  bienes: Bien[]
  seleccionables?: boolean
  /** Contenido extra renderizado arriba de la tabla (conteos, alertas, etc.) */
  headerExtra?: React.ReactNode
  /** Placas seleccionadas (la placa es la clave única del bien en inventario). */
  placasSeleccionadas?: Set<string>
  onToggleSeleccion?: (placa: string) => void
  /** Placas de bienes en proceso de transferencia (deshabilitados, resaltados). */
  placasDeshabilitadas?: Set<string>
  /** Placas de bienes bloqueados por inventario pendiente (no se pueden seleccionar, alerta). */
  placasBloqueadas?: Set<string>
  vacioMensaje?: string
  /**
   * Muestra un botón para desplegar/ocultar filtros y búsqueda por columna.
   * Por defecto desactivado para no alterar vistas que no lo soliciten.
   */
  habilitarFiltrosOpcionales?: boolean
  /** Clases extra en el contenedor `section` (p. ej. modal). */
  classNameWrap?: string
  /** Clases extra en el `div` con scroll horizontal. */
  classNameScroll?: string
  /** Oculta el botón de expandir (útil dentro de modales). */
  ocultarExpandir?: boolean
}

export function BienesTable({
  titulo,
  ocultarTitulo = false,
  bienes,
  seleccionables = false,
  headerExtra,
  placasSeleccionadas,
  onToggleSeleccion,
  placasDeshabilitadas,
  placasBloqueadas,
  vacioMensaje = 'No hay bienes en esta categoría.',
  habilitarFiltrosOpcionales = false,
  classNameWrap,
  classNameScroll,
  ocultarExpandir = false,
}: BienesTableProps) {
  const headingId = useId()
  const uid = useId()
  const idPanel = `${uid}-filtros-panel`
  const idBoton = `${uid}-filtros-btn`
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [tablaExpandida, setTablaExpandida] = useState(false)
  const [fPlaca, setFPlaca] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fSerial, setFSerial] = useState('')
  const [fCodigo, setFCodigo] = useState('')

  useEffect(() => {
    if (!filtrosAbiertos) {
      setFPlaca('')
      setFDesc('')
      setFSerial('')
      setFCodigo('')
    }
  }, [filtrosAbiertos])

  const cabFiltros = useTheadFiltrosCabecal(!!habilitarFiltrosOpcionales, [filtrosAbiertos, bienes.length, seleccionables])

  const bienesFiltrados = useMemo(() => {
    return bienes.filter(
      (b) =>
        cumpleFiltroTexto(fPlaca, b.placa) &&
        cumpleFiltroTexto(fDesc, b.descripcion) &&
        cumpleFiltroTexto(fSerial, b.serial ?? '—') &&
        cumpleFiltroTexto(fCodigo, b.codigo),
    )
  }, [bienes, fPlaca, fDesc, fSerial, fCodigo])

  // Separar bienes activos de los que están en proceso de baja
  const bienesActivos = useMemo(() => bienesFiltrados.filter(b => b.ultimoPrefijo !== 'BJ'), [bienesFiltrados])
  const bienesBaja = useMemo(() => bienesFiltrados.filter(b => b.ultimoPrefijo === 'BJ'), [bienesFiltrados])

  const mostrarTabla = bienes.length > 0
  const hayResultadosFiltro = bienesFiltrados.length > 0
  const colSpanTotal = seleccionables ? 5 : 4

  const colGroup = (
    <colgroup>
      {seleccionables && <col style={{ width: '3rem' }} />}
      <col style={{ width: '9%' }} />
      <col style={{ width: '40%' }} />
      <col style={{ width: '18%' }} />
      <col style={{ width: '33%' }} />
    </colgroup>
  )

  const renderFila = (b: Bien) => {
    const sel = placasSeleccionadas?.has(b.placa) ?? false
    const enProceso = placasDeshabilitadas?.has(b.placa) ?? false
    const bloqueado = b.pendienteInventario ?? (placasBloqueadas?.has(b.placa) ?? false)
    const esBaja = b.ultimoPrefijo === 'BJ'
    const rowClass = esBaja
      ? 'bienes-table__row--baja'
      : bloqueado
        ? 'bienes-table__row--bloqueado'
        : enProceso
          ? 'bienes-table__row--en-proceso'
          : sel
            ? 'bienes-table__row--selected'
            : undefined
    return (
      <tr key={b.placa} className={rowClass}>
        {seleccionables && (
          <td>
            <input
              type="checkbox"
              className="bienes-table__check"
              checked={sel}
              disabled={enProceso || bloqueado || esBaja}
              onChange={() => onToggleSeleccion?.(b.placa)}
              aria-label={esBaja
                ? `Bien placa ${b.placa} en proceso de baja (BJ)`
                : bloqueado
                  ? `Bien placa ${b.placa} bloqueado - faltante`
                  : enProceso
                    ? `Bien placa ${b.placa} en proceso de transferencia`
                    : `Seleccionar bien placa ${b.placa}, dependencia ${b.codigo}`}
            />
          </td>
        )}
        <td
          className="bienes-table__placa"
          data-placa={b.placa}
          onMouseEnter={(e) => {
            const span = e.currentTarget.querySelector('span')
            if (span && span.scrollWidth > span.clientWidth) {
              e.currentTarget.classList.add('bienes-table__placa--truncada')
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.classList.remove('bienes-table__placa--truncada')
          }}
        ><span className="bienes-table__placa-text">{b.placa}</span></td>
        <td>{b.descripcion}</td>
        <td>{b.serial ?? '—'}</td>
        <td>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <code className="bienes-table__code">{b.codigo}</code>
            {b.nombreDependencia && (
              <span style={{ fontSize: '0.85em', color: '#666' }}>{b.nombreDependencia}</span>
            )}
          </div>
          {esBaja && (
            <span className="bienes-table__alerta-baja" title="Bien en proceso de baja (BJ) — pendiente de confirmación">BJ - Proceso de Baja</span>
          )}
          {enProceso && !esBaja && (
            <span className="bienes-table__icono-proceso" title="En proceso de transferencia">
              <TruckLoader />
            </span>
          )}
          {bloqueado && !esBaja && (
            <span className="bienes-table__alerta-inventario" title="Faltante - No se puede transferir">Faltante</span>
          )}
          {!bloqueado && !enProceso && !esBaja && (
            <span className="bienes-table__estado-inventariado">Inventariado</span>
          )}
        </td>
      </tr>
    )
  }

  const tablaBody = (
    <table className="bienes-table bienes-table--body">
      {colGroup}
      <tbody>
        {!hayResultadosFiltro ? (
          <tr>
            <td className="bienes-table__sin-resultados" colSpan={colSpanTotal}>
              Ningún bien coincide con los filtros actuales.
            </td>
          </tr>
        ) : (
          <>
            {bienesActivos.map(renderFila)}
            {bienesBaja.length > 0 && (
              <>
                <tr className="bienes-table__separador-baja">
                  <td colSpan={colSpanTotal}>
                    <div className="bienes-table__separador-baja-content">
                      <span className="bienes-table__separador-baja-linea" />
                      <span className="bienes-table__separador-baja-texto">En proceso de baja ({bienesBaja.length})</span>
                      <span className="bienes-table__separador-baja-linea" />
                    </div>
                  </td>
                </tr>
                {bienesBaja.map(renderFila)}
              </>
            )}
          </>
        )}
      </tbody>
    </table>
  )

  const tablaHead = (
    <table className="bienes-table bienes-table--head">
      {colGroup}
      <thead ref={cabFiltros.theadRef} onMouseEnter={cabFiltros.onEntrarThead}>
        <tr>
          {seleccionables && <th className="bienes-table__th-check" scope="col" />}
          <th scope="col">Placa</th>
          <th scope="col">Descripción</th>
          <th scope="col">Serial</th>
          <th scope="col">Dependencia</th>
        </tr>
        {habilitarFiltrosOpcionales && filtrosAbiertos ? (
          <tr className="tabla-filtros__fila" aria-label="Filtros por columna">
            {seleccionables && (
              <th className="tabla-filtros__th--sin-filtro" scope="col" aria-hidden="true" />
            )}
            <th scope="col">
              <label className="bienes-table-wrap__titulo--accesible-oculto" htmlFor={`${uid}-f-placa`}>
                Filtrar placa
              </label>
              <input
                id={`${uid}-f-placa`}
                className="tabla-filtros__input"
                type="search"
                placeholder="Buscar…"
                value={fPlaca}
                onChange={(e) => setFPlaca(e.target.value)}
                autoComplete="off"
              />
            </th>
            <th scope="col">
              <label className="bienes-table-wrap__titulo--accesible-oculto" htmlFor={`${uid}-f-desc`}>
                Filtrar descripción
              </label>
              <input
                id={`${uid}-f-desc`}
                className="tabla-filtros__input"
                type="search"
                placeholder="Buscar…"
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                autoComplete="off"
              />
            </th>
            <th scope="col">
              <label className="bienes-table-wrap__titulo--accesible-oculto" htmlFor={`${uid}-f-ser`}>
                Filtrar serial
              </label>
              <input
                id={`${uid}-f-ser`}
                className="tabla-filtros__input"
                type="search"
                placeholder="Buscar…"
                value={fSerial}
                onChange={(e) => setFSerial(e.target.value)}
                autoComplete="off"
              />
            </th>
            <th scope="col">
              <label className="bienes-table-wrap__titulo--accesible-oculto" htmlFor={`${uid}-f-cod`}>
                Filtrar dependencia
              </label>
              <input
                id={`${uid}-f-cod`}
                className="tabla-filtros__input"
                type="search"
                placeholder="Buscar…"
                value={fCodigo}
                onChange={(e) => setFCodigo(e.target.value)}
                autoComplete="off"
              />
            </th>
          </tr>
        ) : null}
      </thead>
    </table>
  )

  return (
    <section className={['bienes-table-wrap', classNameWrap].filter(Boolean).join(' ')} aria-labelledby={headingId}>
      <h3
        className={`bienes-table-wrap__titulo${ocultarTitulo ? ' bienes-table-wrap__titulo--accesible-oculto' : ''}`}
        id={headingId}
      >
        {titulo}
      </h3>
      {headerExtra}
      {!mostrarTabla ? (
        <p className="bienes-table-wrap__vacio">{vacioMensaje}</p>
      ) : (
        <>
          {habilitarFiltrosOpcionales ? (
            <div
              ref={cabFiltros.hostRef}
              className={['tabla-filtros-outer-host bienes-table-frame', classNameScroll, 'tabla-filtros-scroll-host'].filter(Boolean).join(' ')}
              id={idPanel}
              onMouseMove={cabFiltros.onMovimientoHost}
              onMouseLeave={cabFiltros.onSalidaHost}
            >
              <div ref={cabFiltros.paneRef}>
                {tablaHead}
              </div>
              <div className="bienes-table-scroll" style={{ maxHeight: tablaExpandida ? '80vh' : '500px' }}>
                {tablaBody}
              </div>
              {!ocultarExpandir && (
                <button
                  type="button"
                  className="bienes-table-expand-btn"
                  onClick={() => setTablaExpandida(!tablaExpandida)}
                  title={tablaExpandida ? 'Contraer tabla' : 'Expandir tabla'}
                >
                  {tablaExpandida ? <FaCompress /> : <FaExpand />}
                </button>
              )}
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
              className="bienes-table-frame"
              id={idPanel}
            >
              {tablaHead}
              <div className={['bienes-table-scroll', classNameScroll].filter(Boolean).join(' ')} style={{ maxHeight: tablaExpandida ? '80vh' : '500px' }}>
                {tablaBody}
              </div>
              {!ocultarExpandir && (
                <button
                  type="button"
                  className="bienes-table-expand-btn"
                  onClick={() => setTablaExpandida(!tablaExpandida)}
                  title={tablaExpandida ? 'Contraer tabla' : 'Expandir tabla'}
                >
                  {tablaExpandida ? <FaCompress /> : <FaExpand />}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
