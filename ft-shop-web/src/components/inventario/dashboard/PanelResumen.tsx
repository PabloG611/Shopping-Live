/**
 * Panel lateral unificado del Dashboard. Vive en el panel derecho reutilizable
 * (portal). Tiene varios "niveles":
 *  - home: 4 cards clicables (estilo gi-stat-card) — Avance, Inventariados,
 *    Pendientes, Vehículos.
 *  - avance / inventariados / pendientes: resumen con lista de servicios.
 *  - vehiculos: desglose de vehículos (filtros + tabla + export).
 *  - servicio (servicioAbierto != null): pendientes de un servicio concreto.
 *
 * Es presentacional: recibe datos y callbacks del DashboardInventario.
 */
import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { FaArrowLeft, FaMagnifyingGlass } from 'react-icons/fa6'
import { FaClipboardCheck, FaBoxOpen, FaExclamationTriangle, FaCar } from 'react-icons/fa'
import LoaderVehiculos from './LoaderVehiculos'
import type { BienPendiente } from '../../../services/controlSeguimientoService'
import type { VehiculoDashboardDetalle, ResumenVehiculosDashboard } from '../../../services/vehiculosService'

export type NivelResumen = 'home' | 'avance' | 'inventariados' | 'pendientes' | 'vehiculos'

export interface ServicioResumen {
  codigo: string
  nombre: string
  cantidad: number
  inventariados: number
  pendientes: number
  porcentaje: number
}

interface PanelResumenProps {
  nivel: NivelResumen
  setNivel: (n: NivelResumen) => void
  // Totales
  porcentajeGlobal: number
  totalInventariados: number
  totalBienes: number
  totalPendientes: number
  servicios: ServicioResumen[]
  // Vehículos
  resumenVehiculos: ResumenVehiculosDashboard
  vehiculosDetalle: VehiculoDashboardDetalle[] | null
  vehiculosGrupos: Record<string, number>
  cargandoVehiculos: boolean
  gruposSeleccionados: Set<string>
  setGruposSeleccionados: (s: Set<string>) => void
  dropdownGruposAbierto: boolean
  setDropdownGruposAbierto: (v: boolean) => void
  filtroBusquedaVehiculos: string
  setFiltroBusquedaVehiculos: (v: string) => void
  onCargarVehiculos: () => void
  // Detalle de un servicio (pendientes)
  servicioAbierto: string | null
  servicioData?: ServicioResumen
  pendientes: BienPendiente[]
  cargandoServicioDet: boolean
  totalServicioDet: number
  filtroServicio: string
  setFiltroServicio: (codigo: string, v: string) => void
  onCerrarServicio: () => void
  // Navegar a un servicio (desde la lista del nivel)
  onAbrirServicio: (codigo: string) => void
}

export default function PanelResumen(props: PanelResumenProps) {
  const { nivel, setNivel } = props

  // Si hay un servicio abierto, ese detalle manda sobre el nivel.
  if (props.servicioAbierto && props.servicioData) {
    return <DetalleServicio {...props} />
  }

  if (nivel === 'vehiculos') return <DetalleVehiculos {...props} />
  if (nivel === 'avance' || nivel === 'inventariados' || nivel === 'pendientes') {
    return <DetalleServiciosLista {...props} />
  }

  // ── Nivel HOME: 4 cards ──
  const pctPend = props.totalBienes > 0 ? Math.round((props.totalPendientes / props.totalBienes) * 100) : 0
  return (
    <div className="gi-panel-contadores">
      <div className="gi-stat-cards">
        <button type="button" className="gi-stat-card gi-stat-card--azul" onClick={() => setNivel('avance')} title="Avance global del inventario físico">
          <span className="gi-stat-card__icon"><FaClipboardCheck size={18} /></span>
          <span className="gi-stat-card__num">{props.porcentajeGlobal}%</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Avance global</span>
            <span className="gi-stat-card__sub">{props.servicios.length} servicios</span>
          </span>
        </button>
        <button type="button" className="gi-stat-card gi-stat-card--verde" onClick={() => setNivel('inventariados')} title="Bienes inventariados">
          <span className="gi-stat-card__icon"><FaBoxOpen size={18} /></span>
          <span className="gi-stat-card__num">{props.totalInventariados.toLocaleString()}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Inventariados</span>
            <span className="gi-stat-card__sub">de {props.totalBienes.toLocaleString()} bienes</span>
          </span>
        </button>
        <button type="button" className="gi-stat-card gi-stat-card--naranja" onClick={() => setNivel('pendientes')} title="Bienes pendientes por inventariar">
          <span className="gi-stat-card__icon"><FaExclamationTriangle size={18} /></span>
          <span className="gi-stat-card__num">{props.totalPendientes.toLocaleString()}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Pendientes</span>
            <span className="gi-stat-card__sub">{pctPend}% del total</span>
          </span>
        </button>
        <button type="button" className="gi-stat-card gi-stat-card--morado" onClick={() => { setNivel('vehiculos'); props.onCargarVehiculos() }} title="Vehículos inventariados">
          <span className="gi-stat-card__icon"><FaCar size={18} /></span>
          <span className="gi-stat-card__num">{props.resumenVehiculos.inventariados}/{props.resumenVehiculos.total_vehiculos}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Vehículos</span>
            <span className="gi-stat-card__sub">{props.resumenVehiculos.porcentaje}% · toca para ver</span>
          </span>
        </button>
      </div>
    </div>
  )
}

/* ── Encabezado reutilizable del detalle in-panel ── */
function CabeceraDetalle({ titulo, onVolver }: { titulo: string; onVolver: () => void }) {
  return (
    <>
      <div className="gi-reg-header">
        <button type="button" className="gi-reg-back" onClick={onVolver}>
          <FaArrowLeft size={13} /><span>Volver</span>
        </button>
      </div>
      <h3 className="gi-panel-contadores__detalle-titulo">{titulo}</h3>
    </>
  )
}

/* ── Nivel avance/inventariados/pendientes: lista de servicios ── */
function DetalleServiciosLista(props: PanelResumenProps) {
  const { nivel, servicios, onAbrirServicio, setNivel } = props
  const titulo = nivel === 'avance' ? `Avance global · ${props.porcentajeGlobal}%`
    : nivel === 'inventariados' ? `Inventariados · ${props.totalInventariados.toLocaleString()}`
    : `Pendientes · ${props.totalPendientes.toLocaleString()}`

  // Ordenar según el nivel.
  const lista = useMemo(() => {
    const copia = [...servicios]
    if (nivel === 'pendientes') return copia.sort((a, b) => b.pendientes - a.pendientes)
    if (nivel === 'inventariados') return copia.sort((a, b) => b.inventariados - a.inventariados)
    return copia.sort((a, b) => a.porcentaje - b.porcentaje)
  }, [servicios, nivel])

  return (
    <div className="gi-panel-contadores gi-panel-contadores--expandido">
      <div className="gi-panel-contadores__detalle">
        <CabeceraDetalle titulo={titulo} onVolver={() => setNivel('home')} />
        <div className="gi-panel-contadores__detalle-body">
          {lista.length === 0 ? (
            <p className="gi-panel-contadores__detalle-hint">No hay servicios con inventario.</p>
          ) : (
            <div className="gi-detalle-lista">
              <div className="gi-detalle-lista__count">{lista.length} servicio{lista.length !== 1 ? 's' : ''}</div>
              <div className="gi-dash-srv-cards">
                {lista.map((s) => {
                  const color = s.porcentaje >= 100 ? '#15803d' : s.porcentaje >= 50 ? '#1565c0' : s.porcentaje > 0 ? '#d97706' : '#94a3b8'
                  return (
                    <button key={s.codigo} type="button" className="gi-dash-srv-card" onClick={() => onAbrirServicio(s.codigo)} title="Ver pendientes de este servicio">
                      <div className="gi-dash-srv-card__head">
                        <span className="gi-dash-srv-card__nombre">{s.nombre}</span>
                        <span className="gi-dash-srv-card__pct" style={{ color }}>{s.porcentaje}%</span>
                      </div>
                      <div className="gi-dash-srv-card__barra"><div className="gi-dash-srv-card__barra-fill" style={{ width: `${s.porcentaje}%`, background: color }} /></div>
                      <div className="gi-dash-srv-card__nums">
                        <span className="gi-dash-srv-card__num"><b>{s.cantidad}</b> total</span>
                        <span className="gi-dash-srv-card__num gi-dash-srv-card__num--ok"><b>{s.inventariados}</b> inv.</span>
                        <span className="gi-dash-srv-card__num gi-dash-srv-card__num--pend"><b>{s.pendientes}</b> pend.</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Nivel vehículos: desglose con filtros + tabla + export ── */
function DetalleVehiculos(props: PanelResumenProps) {
  const {
    vehiculosDetalle, vehiculosGrupos, cargandoVehiculos, gruposSeleccionados, setGruposSeleccionados,
    dropdownGruposAbierto, setDropdownGruposAbierto, filtroBusquedaVehiculos, setFiltroBusquedaVehiculos,
    resumenVehiculos, onCargarVehiculos, setNivel,
  } = props

  // Tab por estado: todos / realizados (inventariados) / pendientes.
  const [tabEstado, setTabEstado] = useState<'todos' | 'realizados' | 'pendientes'>('todos')

  // Base: aplica grupos + buscador (sin el tab de estado todavía).
  const base = useMemo(() => (vehiculosDetalle ?? []).filter(v => {
    if (gruposSeleccionados.size > 0 && !gruposSeleccionados.has(v.grupo)) return false
    if (filtroBusquedaVehiculos) {
      const q = filtroBusquedaVehiculos
      if (!v.placa.toUpperCase().includes(q) && !v.descripcion.toUpperCase().includes(q)) return false
    }
    return true
  }), [vehiculosDetalle, gruposSeleccionados, filtroBusquedaVehiculos])

  const invBase = base.filter(v => v.inventariado).length
  const pendBase = base.length - invBase

  // Lista final: filtra la base por el tab de estado activo.
  const filtrados = useMemo(() => {
    if (tabEstado === 'realizados') return base.filter(v => v.inventariado)
    if (tabEstado === 'pendientes') return base.filter(v => !v.inventariado)
    return base
  }, [base, tabEstado])

  const exportar = () => {
    const data = filtrados.map(v => ({
      'Placa': v.placa, 'Descripción': v.descripcion, 'Responsable': v.responsable || '',
      'CC Responsable': v.responsable_cedula || '', 'Regional': v.regional || '',
      'Ubicación': v.ubicacion ? v.ubicacion.replace(/^\d+\s*-\s*/, '') : '', 'Grupo Contable': v.grupo,
      'Estado': v.inventariado ? 'Inventariado' : 'Pendiente',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Vehículos')
    XLSX.writeFile(wb, `Vehiculos_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="gi-panel-contadores gi-panel-contadores--expandido">
      <div className="gi-panel-contadores__detalle">
        <CabeceraDetalle titulo={`Vehículos · ${resumenVehiculos.inventariados}/${resumenVehiculos.total_vehiculos}`} onVolver={() => setNivel('home')} />
        <div className="gi-panel-contadores__detalle-body">
          {cargandoVehiculos ? (
            <LoaderVehiculos filas={6} mensaje="Consultando vehículos…" />
          ) : !vehiculosDetalle || vehiculosDetalle.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
              <p style={{ fontWeight: 600, margin: '0 0 0.3rem' }}>No se pudo obtener el detalle</p>
              <p style={{ fontSize: '0.75rem', margin: '0 0 0.75rem' }}>Verifique la conexión a Firebird.</p>
              <button onClick={onCargarVehiculos} className="gi-dash-btn gi-dash-btn--morado">Reintentar</button>
            </div>
          ) : (
            <>
              {/* Filtros */}
              <div className="gi-dash-veh-filtros">
                <div style={{ position: 'relative' }}>
                  <button className="gi-dash-veh-select" type="button" onClick={() => setDropdownGruposAbierto(!dropdownGruposAbierto)}>
                    <span>{gruposSeleccionados.size} de {Object.keys(vehiculosGrupos).length} grupos</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.6rem', opacity: 0.7 }}>{dropdownGruposAbierto ? '▲' : '▼'}</span>
                  </button>
                  {dropdownGruposAbierto && (
                    <div className="gi-dash-veh-dropdown">
                      <div className="gi-dash-veh-dropdown-acciones">
                        <button onClick={() => setGruposSeleccionados(new Set(Object.keys(vehiculosGrupos)))}>Todos</button>
                        <button onClick={() => setGruposSeleccionados(new Set())}>Ninguno</button>
                        <button onClick={() => setGruposSeleccionados(new Set(Object.keys(vehiculosGrupos).filter(g => !g.includes('BOTE') && !g.includes('MOTOR FUERA'))))}>Solo vehículos</button>
                      </div>
                      {Object.entries(vehiculosGrupos).sort(([, a], [, b]) => b - a).map(([grupo, cant]) => (
                        <label key={grupo} className="gi-dash-veh-dropdown-item">
                          <input type="checkbox" checked={gruposSeleccionados.has(grupo)} onChange={() => {
                            const n = new Set(gruposSeleccionados)
                            if (n.has(grupo)) n.delete(grupo); else n.add(grupo)
                            setGruposSeleccionados(n)
                          }} />
                          <span className="gi-dash-veh-dropdown-label">{grupo}</span>
                          <span className="gi-dash-veh-dropdown-count">{cant}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="gi-dash-veh-buscar">
                  <FaMagnifyingGlass size={11} className="gi-dash-veh-buscar-icon" />
                  <input className="gi-dash-veh-input" type="text" placeholder="Buscar placa o descripción..." value={filtroBusquedaVehiculos} onChange={(e) => setFiltroBusquedaVehiculos(e.target.value.toUpperCase())} />
                </div>
              </div>

              {/* Tab por estado: Todos / Pendientes / Realizados */}
              <div className="gi-dash-veh-tabs">
                <button type="button" className={`gi-dash-veh-tab${tabEstado === 'todos' ? ' is-active' : ''}`} onClick={() => setTabEstado('todos')}>
                  Todos <span className="gi-dash-veh-tab__n">{base.length}</span>
                </button>
                <button type="button" className={`gi-dash-veh-tab gi-dash-veh-tab--pend${tabEstado === 'pendientes' ? ' is-active' : ''}`} onClick={() => setTabEstado('pendientes')}>
                  Pendientes <span className="gi-dash-veh-tab__n">{pendBase}</span>
                </button>
                <button type="button" className={`gi-dash-veh-tab gi-dash-veh-tab--ok${tabEstado === 'realizados' ? ' is-active' : ''}`} onClick={() => setTabEstado('realizados')}>
                  Realizados <span className="gi-dash-veh-tab__n">{invBase}</span>
                </button>
              </div>

              {/* Resumen + export */}
              <div className="gi-dash-veh-resumen">
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {filtrados.length} vehículo{filtrados.length !== 1 ? 's' : ''}
                </span>
                <button onClick={exportar} className="gi-dash-btn gi-dash-btn--verde">Exportar Excel</button>
              </div>

              {/* Lista tipo tarjeta */}
              <div className="gi-detalle-lista">
                <div className="gi-grupo__body">
                  {filtrados.map((v, i) => (
                    <div key={i} className={`gi-dash-veh-item${v.inventariado ? ' is-ok' : ''}`}>
                      <div className="gi-dash-veh-item__top">
                        <span className="gi-dash-veh-item__placa">{v.placa}</span>
                        <span className={`gi-dash-veh-pill${v.inventariado ? ' is-ok' : ' is-pend'}`}>
                          {v.inventariado ? '✓ Inventariado' : '● Pendiente'}
                        </span>
                      </div>
                      <span className="gi-dash-veh-item__desc">{v.descripcion}</span>
                      {v.responsable && <span className="gi-dash-veh-item__resp">{v.responsable}{v.responsable_cedula ? ` · CC ${v.responsable_cedula}` : ''}</span>}
                      {(v.regional || v.ubicacion) && <span className="gi-dash-veh-item__ubic">{v.regional || ''}{v.ubicacion ? ` · ${v.ubicacion.replace(/^\d+\s*-\s*/, '')}` : ''}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Detalle de un servicio: pendientes ── */
function DetalleServicio(props: PanelResumenProps) {
  const { servicioData, pendientes, cargandoServicioDet, totalServicioDet, filtroServicio, setFiltroServicio, onCerrarServicio } = props
  const s = servicioData!
  const q = filtroServicio.trim().toLowerCase()
  const filtrados = q
    ? pendientes.filter(b => b.placa.toLowerCase().includes(q) || b.descripcion.toLowerCase().includes(q) || (b.responsable ?? '').toLowerCase().includes(q))
    : pendientes

  return (
    <div className="gi-panel-contadores gi-panel-contadores--expandido">
      <div className="gi-panel-contadores__detalle">
        <div className="gi-reg-header">
          <button type="button" className="gi-reg-back" onClick={onCerrarServicio}>
            <FaArrowLeft size={13} /><span>Volver</span>
          </button>
        </div>
        <h3 className="gi-panel-contadores__detalle-titulo">{s.nombre}</h3>
        <p className="gi-dash-srv-sub">{s.inventariados} de {s.cantidad} inventariados · {s.pendientes} pendientes</p>

        <div className="gi-panel-contadores__filtro">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <FaMagnifyingGlass size={12} style={{ position: 'absolute', left: 10, color: '#94a3b8', pointerEvents: 'none' }} />
            <input type="text" placeholder="Buscar placa, descripción..." value={filtroServicio} onChange={(e) => setFiltroServicio(s.codigo, e.target.value)} className="consulta-lateral__filtro-input" style={{ paddingLeft: 30, width: '100%' }} />
          </div>
        </div>

        <div className="gi-panel-contadores__detalle-body">
          {cargandoServicioDet && pendientes.length === 0 ? (
            <p className="gi-panel-contadores__detalle-hint">Cargando bienes pendientes…</p>
          ) : pendientes.length === 0 ? (
            <p className="gi-panel-contadores__detalle-hint">{s.pendientes === 0 ? '✓ Todos los bienes de este servicio están inventariados.' : 'No se pudieron cargar los pendientes.'}</p>
          ) : (
            <div className="gi-dash-lista">
              <div className="gi-dash-lista__count">
                {q ? `${filtrados.length} de ${pendientes.length}` : `${pendientes.length} cargados`} de ~{totalServicioDet} en el servicio
              </div>
              {filtrados.map((b, i) => (
                <div key={`${b.placa}-${i}`} className="gi-dash-veh-item is-pend-left">
                  <div className="gi-dash-veh-item__top">
                    <span className="gi-dash-veh-item__placa">{b.placa}</span>
                    <span className="gi-dash-veh-pill is-pend">● Pendiente</span>
                  </div>
                  <span className="gi-dash-veh-item__desc">{b.descripcion || '—'}</span>
                  {b.responsable && <span className="gi-dash-veh-item__resp">{b.responsable}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
