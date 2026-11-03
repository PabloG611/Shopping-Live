import { useState } from 'react'
import { EncabezadoV2 } from 'react-ecosistema-unp/ui'
import { FaList, FaChevronLeft } from 'react-icons/fa6'
import { FaArrowLeft, FaIdCard, FaBarcode, FaTimes, FaUsers } from 'react-icons/fa'

import { ConsultaMasiva } from '../components/bienes/ConsultaMasiva'
import { ToastContainer } from '../components/common/ToastContainer'
import { PersonaAvatarChip } from '../components/common/PersonaAvatarChip'
import { useToast } from '../hooks/useToast'
import { consultarBienesPorCedula, consultarBienPorPlaca, consultarPendientesInventario, type ResultadoConsultaPlaca } from '../services/consultaBienesService'
import type { Bien, ResultadoConsulta } from '../types'
import { MAX_CEDULA_DIGITOS, sanitizarCedula } from '../utils/sanitizarCedula'

import './ConsultaBienesPage.css'

type AccionConsulta = 'cedula' | 'placa' | 'masivo'
type PestanaResultado = 'normal' | 'floresta'

function getEstadoBien(bien: Bien, placasPendientes: Set<string>) {
  if (bien.ultimoPrefijo === 'CB') return { label: 'BAJA CONFIRMADA', clase: 'cb-bien-estado--baja' }
  if (bien.ultimoPrefijo === 'BJ') return { label: 'CON PROCESO DE BJ', clase: 'cb-bien-estado--proceso' }
  if (bien.pendienteInventario || placasPendientes.has(bien.placa))
    return { label: 'FALTANTE', clase: 'cb-bien-estado--faltante' }
  return { label: 'INVENTARIADO', clase: 'cb-bien-estado--ok' }
}

/** Agrupa los bienes por dependencia, preservando el orden de aparición. */
function agruparPorDependencia(bienes: Bien[]): Array<{ dependencia: string; bienes: Bien[] }> {
  const mapa = new Map<string, Bien[]>()
  for (const bien of bienes) {
    const dep = (bien.nombreDependencia || 'Sin dependencia').trim() || 'Sin dependencia'
    const grupo = mapa.get(dep)
    if (grupo) grupo.push(bien)
    else mapa.set(dep, [bien])
  }
  return Array.from(mapa.entries()).map(([dependencia, bienes]) => ({ dependencia, bienes }))
}

export default function ConsultaBienesPage() {
  // Paneles colapsables
  const [panelIzqAbierto, setPanelIzqAbierto] = useState(true)

  // Acción activa en el panel izquierdo
  const [accionActiva, setAccionActiva] = useState<AccionConsulta>('cedula')

  // Campos de búsqueda
  const [cedula, setCedula] = useState('')
  const [placa, setPlaca] = useState('')
  const toast = useToast()
  const [cargando, setCargando] = useState(false)

  // Resultados
  const [resultado, setResultado] = useState<ResultadoConsulta | null>(null)
  const [resultadoPlaca, setResultadoPlaca] = useState<ResultadoConsultaPlaca | null>(null)
  const [placasPendientes, setPlacasPendientes] = useState<Set<string>>(new Set())
  const [pestana, setPestana] = useState<PestanaResultado>('normal')

  // Buscar por cédula
  const buscarPorCedula = async (valor?: string) => {
    toast.clearWarnings()
    const limpio = sanitizarCedula(valor ?? cedula)
    if (!limpio) { toast.error('Ingrese un número de cédula.'); return }
    setCargando(true)
    try {
      const r = await consultarBienesPorCedula(limpio)
      if (!r) {
        toast.error('No se encontraron bienes asociados a esa identificación.')
        setResultado(null)
      } else if (r.bienesNormal.length === 0 && r.bienesFloresta.length === 0) {
        toast.warning(`No se encontraron bienes asignados a ${r.persona.nombreCompleto} (CC ${limpio}).`)
        setResultado(null)
      } else {
        setResultado(r)
        setResultadoPlaca(null)
        setPestana('normal')
        const pend = await consultarPendientesInventario(limpio)
        setPlacasPendientes(new Set(pend))
      }
    } catch {
      toast.error('No se pudo cargar la información. Verifique su conexión.')
      setResultado(null)
    } finally { setCargando(false) }
  }

  // Buscar por placa
  const buscarPorPlaca = async (valor?: string) => {
    toast.clearWarnings()
    const limpio = (valor ?? placa).trim()
    if (!limpio) { toast.error('Ingrese un número de placa.'); return }
    setCargando(true)
    try {
      const r = await consultarBienPorPlaca(limpio)
      if (!r) {
        toast.error('No se encontró un bien con esa placa.')
        setResultadoPlaca(null)
      } else {
        setResultadoPlaca(r)
        setResultado(null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al consultar placa.')
      setResultadoPlaca(null)
    } finally { setCargando(false) }
  }

  const volver = () => {
    toast.clearWarnings()
    setResultado(null)
    setResultadoPlaca(null)
  }

  const seleccionarAccion = (accion: AccionConsulta) => {
    toast.clearWarnings()
    setAccionActiva(accion)
    setResultado(null)
    setResultadoPlaca(null)
    setCedula('')
    setPlaca('')
  }

  const hayResultado = resultado || resultadoPlaca
  const bienesMostrar = resultado
    ? (pestana === 'normal' ? resultado.bienesNormal : resultado.bienesFloresta)
    : []

  const acciones = [
    { id: 'cedula' as const, label: 'Consulta por Cédula', icon: FaIdCard },
    { id: 'placa' as const, label: 'Consulta por Placa', icon: FaBarcode },
    { id: 'masivo' as const, label: 'Consulta Masiva', icon: FaUsers },
  ]

  return (
    <div className="consulta-page">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="consulta-page__header">
        <EncabezadoV2 eyebrow="Direccion Logistica y Financiera" title="Consulta de Bienes" subtitle="Consulte la información y el detalle de los bienes." hasMargin={false} />
      </div>

      {/* Layout 3 columnas */}
      <div className="consulta-layout">

        {/* ── Panel Izquierdo: FORMULARIOS (acciones) ── */}
        <div className={`consulta-lateral consulta-lateral--izq${panelIzqAbierto ? '' : ' is-collapsed'}`}>
          {!panelIzqAbierto ? (
            <div className="consulta-lateral__tab-vertical" onClick={() => setPanelIzqAbierto(true)} role="button" tabIndex={0} aria-label="Abrir panel consultas" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPanelIzqAbierto(true) }}>
              <span className="consulta-lateral__tab-icon"><FaList size={13} /></span>
              <span className="consulta-lateral__tab-text">Consultas</span>
            </div>
          ) : (
            <div className="consulta-lateral__panel">
              <div className="consulta-lateral__panel-header">
                <div className="consulta-lateral__panel-header-left">
                  <span className="consulta-lateral__panel-header-icon"><FaList size={13} /></span>
                  <h2 className="consulta-lateral__panel-header-title">Consultas</h2>
                </div>
                <button type="button" className="consulta-lateral__collapse-btn" onClick={() => setPanelIzqAbierto(false)} aria-label="Colapsar panel">
                  <FaChevronLeft size={10} />
                </button>
              </div>

              <div className="consulta-lateral__panel-body">
                {acciones.map((a) => (
                  <button key={a.id} type="button" className={`consulta-lateral__item${accionActiva === a.id ? ' is-active' : ''}`} onClick={() => seleccionarAccion(a.id)}>
                    <span className="consulta-lateral__item-icon"><a.icon size={18} /></span>
                    <span className="consulta-lateral__item-text">
                      <span className="consulta-lateral__item-label">{a.label}</span>
                      {accionActiva === a.id && hayResultado && <span className="consulta-lateral__item-sub">con resultados</span>}
                    </span>
                  </button>
                ))}
              </div>


            </div>
          )}
        </div>

        {/* ── Panel Central ── */}
        <main className="consulta-central">
          <div className="consulta-central__body">

            {/* ─── Sin resultado: mostrar solo el input de la acción activa ─── */}
            {!hayResultado && accionActiva === 'cedula' && (
              <div className="consulta-central__search-area">
                <p className="consulta-central__lead">
                  Ingrese el número de cédula para ver el inventario de bienes registrados.
                </p>
                <div className="consulta-central__input-wrap">
                  <FaIdCard className="consulta-central__input-icon" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={MAX_CEDULA_DIGITOS}
                    className="consulta-central__input"
                    placeholder="Cédula de ciudadanía..."
                    autoComplete="off"
                    value={cedula}
                    onChange={(e) => setCedula(sanitizarCedula(e.target.value))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscarPorCedula() } }}
                  />
                  {cedula.length > 0 && <FaTimes className="consulta-central__input-clear" onClick={() => setCedula('')} />}
                </div>
                <button type="button" className="consulta-central__search-btn" onClick={() => void buscarPorCedula()} disabled={cargando}>
                  {cargando ? 'Consultando…' : 'Consultar'}
                </button>
              </div>
            )}

            {!hayResultado && accionActiva === 'placa' && (
              <div className="consulta-central__search-area">
                <p className="consulta-central__lead">
                  Ingrese el número de placa para consultar la información del bien.
                </p>
                <div className="consulta-central__input-wrap">
                  <FaBarcode className="consulta-central__input-icon" />
                  <input
                    type="text"
                    maxLength={20}
                    className="consulta-central__input"
                    placeholder="Número de placa..."
                    autoComplete="off"
                    value={placa}
                    onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscarPorPlaca() } }}
                  />
                  {placa.length > 0 && <FaTimes className="consulta-central__input-clear" onClick={() => setPlaca('')} />}
                </div>
                <button type="button" className="consulta-central__search-btn" onClick={() => void buscarPorPlaca()} disabled={cargando}>
                  {cargando ? 'Consultando…' : 'Consultar'}
                </button>
              </div>
            )}

            {!hayResultado && accionActiva === 'masivo' && (
              <div className="consulta-central__masivo-wrap">
                <ConsultaMasiva
                  onError={(msg) => toast.error(msg)}
                  onWarning={(msg) => toast.warning(msg)}
                />
              </div>
            )}

            {/* ─── Resultado por cédula: cards de bienes ─── */}
            {resultado && (
              <>
                <div className="consulta-central__results-header">
                  <PersonaAvatarChip nombreCompleto={resultado.persona.nombreCompleto} cedula={resultado.persona.numeroIdentificacion} grupo={resultado.persona.dependencia || resultado.persona.grupo || resultado.bienesNormal[0]?.nombreDependencia || ''} />
                  <button type="button" className="consulta-central__results-back" onClick={volver}>
                    <FaArrowLeft size={10} /> Nueva consulta
                  </button>
                </div>

                {/* Tabs UNP / Floresta */}
                <div className="consulta-central__tabs">
                  <button type="button" className={`consulta-central__tab${pestana === 'normal' ? ' consulta-central__tab--activa' : ''}`} onClick={() => setPestana('normal')}>
                    Bienes UNP <span className="consulta-central__tab-badge">{resultado.bienesNormal.length}</span>
                  </button>
                  <button type="button" className={`consulta-central__tab${pestana === 'floresta' ? ' consulta-central__tab--activa' : ''}`} onClick={() => setPestana('floresta')}>
                    Bienes Floresta <span className="consulta-central__tab-badge">{resultado.bienesFloresta.length}</span>
                  </button>
                </div>

                {/* Bienes agrupados por dependencia — cards en 2 columnas */}
                {bienesMostrar.length === 0 ? (
                  <div className="consulta-central__empty">
                    <p className="consulta-central__empty-desc">No hay bienes en esta categoría.</p>
                  </div>
                ) : (
                  <div className="cb-grupos">
                    {agruparPorDependencia(bienesMostrar).map((grupo) => (
                      <section key={grupo.dependencia} className="cb-grupo">
                        {/* Encabezado de la dependencia (una sola vez) */}
                        <div className="cb-grupo__head">
                          <span className="cb-grupo__dep-icon" aria-hidden="true">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
                              <path d="M9 9v.01" /><path d="M9 12v.01" /><path d="M9 15v.01" /><path d="M9 18v.01" />
                            </svg>
                          </span>
                          <span className="cb-grupo__dep-nombre">{grupo.dependencia}</span>
                          <span className="cb-grupo__dep-count">{grupo.bienes.length} {grupo.bienes.length === 1 ? 'bien' : 'bienes'}</span>
                        </div>

                        {/* Cards en 2 columnas, sin repetir la dependencia */}
                        <div className="cb-grupo__cards">
                          {grupo.bienes.map((bien) => {
                            const estado = getEstadoBien(bien, placasPendientes)
                            return (
                              <div key={bien.placa} className="cb-bien-card2">
                                {/* Fila superior: placa protagonista + estado */}
                                <div className="cb-bien-card2__head">
                                  <span className="cb-bien-card2__placa">{bien.placa}</span>
                                  <span className={`cb-bien-card2__estado ${estado.clase}`}>{estado.label}</span>
                                </div>
                                {/* Descripción — mismo peso visual que la placa */}
                                <div className="cb-bien-card2__desc">{bien.descripcion}</div>
                                {/* Pie: metadatos secundarios */}
                                <div className="cb-bien-card2__foot">
                                  <div className="cb-bien-card2__field">
                                    <span className="cb-bien-card2__label">Serial</span>
                                    <span className="cb-bien-card2__value cb-bien-card2__value--mono">{bien.serial || 'N/A'}</span>
                                  </div>
                                  {bien.valorActual != null && bien.valorActual > 0 && (
                                    <div className="cb-bien-card2__field cb-bien-card2__field--right">
                                      <span className="cb-bien-card2__label">Valor</span>
                                      <span className="cb-bien-card2__value cb-bien-card2__value--money">$ {bien.valorActual.toLocaleString('es-CO')}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ─── Resultado por placa: estilo detalle-bien ─── */}
            {resultadoPlaca && (
              <>
                <div className="consulta-central__results-header">
                  <h3 className="consulta-central__results-title">Detalle del bien</h3>
                  <button type="button" className="consulta-central__results-back" onClick={volver}>
                    <FaArrowLeft size={10} /> Nueva consulta
                  </button>
                </div>

                <div className="cb-detalle-bien">
                  <div className="cb-detalle-bien__hero">
                    <span className="cb-detalle-bien__placa">{resultadoPlaca.placa}</span>
                    <span className={`cb-detalle-bien__estado-badge ${resultadoPlaca.ultimoPrefijo === 'CB' ? 'cb-bien-estado--baja' : resultadoPlaca.ultimoPrefijo === 'BJ' ? 'cb-bien-estado--proceso' : resultadoPlaca.pendienteInventario ? 'cb-bien-estado--faltante' : 'cb-bien-estado--ok'}`}>
                      {resultadoPlaca.ultimoPrefijo === 'BJ' ? 'CON PROCESO DE BJ' : resultadoPlaca.ultimoPrefijo === 'CB' ? 'BAJA CONFIRMADA' : resultadoPlaca.pendienteInventario ? 'FALTANTE' : 'INVENTARIADO'}
                    </span>
                  </div>
                  <h2 className="cb-detalle-bien__titulo">{resultadoPlaca.descripcion}</h2>

                  <div className="cb-detalle-bien__campos">
                    <div className="cb-detalle-bien__campo">
                      <span className="cb-detalle-bien__campo-label">Responsable</span>
                      <span className="cb-detalle-bien__campo-valor">{resultadoPlaca.responsable || 'Sin asignar'}</span>
                    </div>
                    <div className="cb-detalle-bien__campo">
                      <span className="cb-detalle-bien__campo-label">Identificación</span>
                      <span className="cb-detalle-bien__campo-valor">{resultadoPlaca.cedulaResponsable ? `CC ${resultadoPlaca.cedulaResponsable}` : 'N/A'}</span>
                    </div>
                    <div className="cb-detalle-bien__campo">
                      <span className="cb-detalle-bien__campo-label">Dependencia</span>
                      <span className="cb-detalle-bien__campo-valor">{resultadoPlaca.dependencia || 'Sin dependencia'}</span>
                    </div>
                    <div className="cb-detalle-bien__campo">
                      <span className="cb-detalle-bien__campo-label">Código dependencia</span>
                      <span className="cb-detalle-bien__campo-valor">{resultadoPlaca.codigoDependencia || 'N/A'}</span>
                    </div>
                    <div className="cb-detalle-bien__campo">
                      <span className="cb-detalle-bien__campo-label">Serial</span>
                      <span className="cb-detalle-bien__campo-valor">{resultadoPlaca.serial || 'N/A'}</span>
                    </div>
                    <div className="cb-detalle-bien__campo">
                      <span className="cb-detalle-bien__campo-label">Valor actual</span>
                      <span className="cb-detalle-bien__campo-valor">{resultadoPlaca.valorActual != null ? `$ ${resultadoPlaca.valorActual.toLocaleString('es-CO')}` : 'No disponible'}</span>
                    </div>
                  </div>

                  {resultadoPlaca.ultimoPrefijo && (resultadoPlaca.ultimoPrefijo === 'BJ' || resultadoPlaca.ultimoPrefijo === 'CB') && (
                    <div className={`cb-detalle-bien__alerta ${resultadoPlaca.ultimoPrefijo === 'CB' ? 'cb-detalle-bien__alerta--danger' : 'cb-detalle-bien__alerta--warning'}`}>
                      <strong>{resultadoPlaca.ultimoPrefijo === 'BJ' ? 'Con proceso de BJ' : 'Baja confirmada'}:</strong>{' '}
                      {resultadoPlaca.ultimoPrefijo === 'BJ' ? 'Este bien tiene un documento de baja (BJ) pero aún no ha sido confirmado (CB).' : 'Este bien ya fue dado de baja definitivamente.'}
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        </main>

      </div>
    </div>
  )
}
