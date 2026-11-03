import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import EcoTabla, { type EcoTablaColumna } from '../components/common/tabla/EcoTabla'
import BandejaObservaciones from '../components/inventario/observaciones/BandejaObservaciones'
import ModalResolverObservacion from '../components/inventario/observaciones/ModalResolverObservacion'
import type { ObservacionBackend } from '../services/observacionesApiService'
import { getAccessToken } from '../services/tokenStore'

import {
  florestaBuscarPorCedula,
  florestaBuscarPorPlaca,
  florestaTransferir,
  type BienFloresta,
  type BienFlorestaDetalle,
} from '../services/florestaService'

import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/common/ToastContainer'
import { GestionFaltantes } from '../components/admin/GestionFaltantes'
import { DocumentacionVehiculos } from '../components/admin/DocumentacionVehiculos'
import ControlSeguimiento from '../components/inventario/ControlSeguimiento'
import { ServiciosHabilitadosCentral, CatalogoServiciosPanel } from '../components/inventario/ServiciosHabilitados'
import { useServiciosHabilitados } from '../hooks/useServiciosHabilitados'
import VehiculosBogotaPanel from '../components/vehiculos/asignacion/VehiculosBogotaPanel'
import VehiculosBogotaCatalogo from '../components/vehiculos/asignacion/VehiculosBogotaCatalogo'
import { useVehiculosBogota } from '../hooks/useVehiculosBogota'
import { usePanelResizable } from '../hooks/usePanelResizable'
import '../components/vehiculos/asignacion/VehiculosBogota.css'
import DashboardInventario from '../components/inventario/DashboardInventario'
import ModalTransferir from '../components/inventario/ModalTransferir'
import ModalAgregarBien from '../components/inventario/ModalAgregarBien'
import SelectorCoordinador from '../components/inventario/SelectorCoordinador'
import FloatingField from '../components/ui/FloatingField'

import './ConsultaBienesPage.css'
import './TransferenciaBienesPage.css'
import './GestionUnp.css'
import './InventarioFisicoPage.css'


import { FaList, FaChartColumn, FaGaugeHigh, FaBoxOpen, FaClipboardList, FaFileLines, FaChevronLeft, FaChevronRight, FaSliders, FaCarSide, FaTriangleExclamation, FaFileExcel, FaMagnifyingGlass, FaArrowRotateLeft } from 'react-icons/fa6'

type PestanaGestion = 'reportes' | 'dashboard' | 'buscar' | 'faltantes' | 'documentacion' | 'servicios' | 'vehiculos-bogota'

export default function GestionUnpPage() {
  const [pestana, setPestana] = useState<PestanaGestion>('reportes')
  const [panelIzqAbierto, setPanelIzqAbierto] = useState(true)
  const [panelCatalogoAbierto, setPanelCatalogoAbierto] = useState(true)
  const toast = useToast()

  // Estado compartido de servicios habilitados (central + panel derecho)
  const serviciosCtrl = useServiciosHabilitados()
  // Estado compartido de asignación de vehículos Bogotá (central + panel derecho)
  const vehiculosBogotaCtrl = useVehiculosBogota()
  // Ancho arrastrable de cada panel lateral derecho (recordado en localStorage)
  const resizeServicios = usePanelResizable({ storageKey: 'gi_panel_servicios_ancho', defecto: 300 })
  const resizeVehiculos = usePanelResizable({ storageKey: 'gi_panel_vehiculos_ancho', defecto: 340 })
  // Panel derecho de métricas para la pestaña de Reportes.
  const resizeMetricas = usePanelResizable({ storageKey: 'gi_panel_metricas_ancho', defecto: 340 })
  const [panelMetricasAbierto, setPanelMetricasAbierto] = useState(false)
  // Panel derecho de resumen para la pestaña de Dashboard.
  const resizeDashboard = usePanelResizable({ storageKey: 'gi_panel_dashboard_ancho', defecto: 320 })
  const [panelDashboardAbierto, setPanelDashboardAbierto] = useState(true)

  const modulos = [
    { id: 'reportes' as const, label: 'Reportes', desc: 'Inventarios y estadísticas', icon: FaChartColumn },
    { id: 'dashboard' as const, label: 'Dashboard', desc: 'Indicadores y gráficas', icon: FaGaugeHigh },
    { id: 'buscar' as const, label: 'Validación de bienes', desc: 'Buscar y validar', icon: FaBoxOpen },
    { id: 'faltantes' as const, label: 'Bienes Faltantes', desc: 'Pendientes inventario', icon: FaClipboardList },
    { id: 'servicios' as const, label: 'Servicios habilitados', desc: 'Configurar inventario', icon: FaSliders },
    { id: 'vehiculos-bogota' as const, label: 'Vehículos Bogotá', desc: 'Asignar flota por inventariador', icon: FaCarSide },
    { id: 'documentacion' as const, label: 'Documentación', desc: 'Vehículos y docs', icon: FaFileLines },
  ]

  return (
    <div className="consulta-page">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Layout */}
      <div className="consulta-layout">

        {/* ── Panel Izquierdo: MÓDULOS ── */}
        <div className={`consulta-lateral consulta-lateral--izq${panelIzqAbierto ? '' : ' is-collapsed'}`}>
          {!panelIzqAbierto ? (
            <div className="consulta-lateral__tab-vertical" onClick={() => setPanelIzqAbierto(true)} role="button" tabIndex={0}>
              <span className="consulta-lateral__tab-icon"><FaList size={13} /></span>
              <span className="consulta-lateral__tab-text">Módulos</span>
            </div>
          ) : (
            <div className="consulta-lateral__panel">
              <div className="consulta-lateral__panel-header">
                <div className="consulta-lateral__panel-header-left">
                  <span className="consulta-lateral__panel-header-icon"><FaList size={13} /></span>
                  <h2 className="consulta-lateral__panel-header-title">Módulos</h2>
                </div>
                <button type="button" className="consulta-lateral__collapse-btn" onClick={() => setPanelIzqAbierto(false)} aria-label="Colapsar">
                  <FaChevronLeft size={10} />
                </button>
              </div>
              <div className="consulta-lateral__panel-body">
                {modulos.map(m => (
                  <button key={m.id} type="button" className={`gi-modulo-item${pestana === m.id ? ' is-active' : ''}`} onClick={() => setPestana(m.id)}>
                    <span className="gi-modulo-item__icon"><m.icon size={18} /></span>
                    <span className="gi-modulo-item__text">
                      <span className="gi-modulo-item__label">{m.label}</span>
                      <span className="gi-modulo-item__desc">{m.desc}</span>
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
            {pestana === 'reportes' && <PanelReportes toast={toast} onAbrirPanelMetricas={() => setPanelMetricasAbierto(true)} />}
            {pestana === 'dashboard' && <DashboardInventario onAbrirPanel={() => setPanelDashboardAbierto(true)} />}
            {pestana === 'buscar' && <PanelBuscar toast={toast} />}
            {pestana === 'faltantes' && <GestionFaltantes />}
            {pestana === 'servicios' && (
              <ServiciosHabilitadosCentral ctrl={serviciosCtrl} />
            )}
            {pestana === 'vehiculos-bogota' && (
              <VehiculosBogotaPanel ctrl={vehiculosBogotaCtrl} />
            )}
            {pestana === 'documentacion' && <DocumentacionVehiculos toast={toast} />}
          </div>
        </main>

        {/* ── Panel Derecho: CATÁLOGO (solo en Servicios habilitados) ── */}
        {pestana === 'servicios' && (
          <div
            className={`consulta-lateral consulta-lateral--der servicios-catalogo-der is-resizable${panelCatalogoAbierto ? '' : ' is-collapsed'}`}
            style={panelCatalogoAbierto ? { width: resizeServicios.ancho } : undefined}
          >
            {panelCatalogoAbierto && (
              <div className="pnl-resize-handle" onMouseDown={resizeServicios.iniciarResize} onTouchStart={resizeServicios.iniciarResizeTouch} title="Arrastrar para redimensionar" />
            )}
            {!panelCatalogoAbierto && (
              <div className="consulta-lateral__tab-vertical" onClick={() => setPanelCatalogoAbierto(true)} role="button" tabIndex={0} aria-label="Abrir catálogo de servicios" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPanelCatalogoAbierto(true) }}>
                <span className="consulta-lateral__tab-icon"><FaSliders size={13} /></span>
                <span className="consulta-lateral__tab-text">Catálogo</span>
              </div>
            )}
            <div className="consulta-lateral__panel" style={panelCatalogoAbierto ? undefined : { position: 'fixed', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
              <div className="consulta-lateral__panel-header">
                <div className="consulta-lateral__panel-header-left">
                  <span className="consulta-lateral__panel-header-icon"><FaSliders size={13} /></span>
                  <h2 className="consulta-lateral__panel-header-title">Catálogo</h2>
                </div>
                <button type="button" className="consulta-lateral__collapse-btn" onClick={() => setPanelCatalogoAbierto(false)} aria-label="Colapsar panel">
                  <FaChevronRight size={10} />
                </button>
              </div>
              <CatalogoServiciosPanel ctrl={serviciosCtrl} />
            </div>
          </div>
        )}

        {/* ── Panel Derecho: MÉTRICAS (solo en Reportes) ──
            Mismo patrón flotante (is-overlay) que Vehículos Bogotá. Su contenido
            lo renderiza ControlSeguimiento vía portal a #gi-reportes-metricas. */}
        {pestana === 'reportes' && (
          <div className={`consulta-lateral consulta-lateral--der vbog-catalogo-der is-overlay${panelMetricasAbierto ? '' : ' is-collapsed'}`}>
            {!panelMetricasAbierto && (
              <div className="consulta-lateral__tab-vertical" onClick={() => setPanelMetricasAbierto(true)} role="button" tabIndex={0} aria-label="Abrir panel de métricas" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPanelMetricasAbierto(true) }}>
                <span className="consulta-lateral__tab-icon"><FaChartColumn size={13} /></span>
                <span className="consulta-lateral__tab-text">Métricas</span>
              </div>
            )}
            <div className="consulta-lateral__panel" style={panelMetricasAbierto ? { width: resizeMetricas.ancho } : { position: 'fixed', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
              {panelMetricasAbierto && (
                <div className="pnl-resize-handle" onMouseDown={resizeMetricas.iniciarResize} onTouchStart={resizeMetricas.iniciarResizeTouch} title="Arrastrar para redimensionar" />
              )}
              <div className="consulta-lateral__panel-header">
                <div className="consulta-lateral__panel-header-left">
                  <span className="consulta-lateral__panel-header-icon"><FaChartColumn size={13} /></span>
                  <h2 className="consulta-lateral__panel-header-title">Métricas</h2>
                </div>
                <button type="button" className="consulta-lateral__collapse-btn" onClick={() => setPanelMetricasAbierto(false)} aria-label="Colapsar panel">
                  <FaChevronRight size={10} />
                </button>
              </div>
              <div className="consulta-lateral__panel-body" id="gi-reportes-metricas" />
            </div>
          </div>
        )}

        {/* ── Panel Derecho: RESUMEN (solo en Dashboard) ──
            Monta las cards de resumen (avance/inventariados/pendientes) vía
            portal a #gi-dashboard-cards desde DashboardInventario. */}
        {pestana === 'dashboard' && (
          <div className={`consulta-lateral consulta-lateral--der vbog-catalogo-der is-overlay${panelDashboardAbierto ? '' : ' is-collapsed'}`}>
            {!panelDashboardAbierto && (
              <div className="consulta-lateral__tab-vertical" onClick={() => setPanelDashboardAbierto(true)} role="button" tabIndex={0} aria-label="Abrir panel de resumen" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPanelDashboardAbierto(true) }}>
                <span className="consulta-lateral__tab-icon"><FaGaugeHigh size={13} /></span>
                <span className="consulta-lateral__tab-text">Resumen</span>
              </div>
            )}
            <div className="consulta-lateral__panel" style={panelDashboardAbierto ? { width: resizeDashboard.ancho } : { position: 'fixed', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
              {panelDashboardAbierto && (
                <div className="pnl-resize-handle" onMouseDown={resizeDashboard.iniciarResize} onTouchStart={resizeDashboard.iniciarResizeTouch} title="Arrastrar para redimensionar" />
              )}
              <div className="consulta-lateral__panel-header">
                <div className="consulta-lateral__panel-header-left">
                  <span className="consulta-lateral__panel-header-icon"><FaGaugeHigh size={13} /></span>
                  <h2 className="consulta-lateral__panel-header-title">Resumen</h2>
                </div>
                <button type="button" className="consulta-lateral__collapse-btn" onClick={() => setPanelDashboardAbierto(false)} aria-label="Colapsar panel">
                  <FaChevronRight size={10} />
                </button>
              </div>
              <div className="consulta-lateral__panel-body" id="gi-dashboard-cards" />
            </div>
          </div>
        )}

        {/* ── Panel Derecho: CATÁLOGO (solo en Vehículos Bogotá) ──
            Lleva la clase extra `vbog-catalogo-der is-overlay`: a diferencia del
            de servicios, este panel se SUPERPONE sobre el central (position
            absolute, ver VehiculosBogota.css) para no encoger el tablero. */}
        {pestana === 'vehiculos-bogota' && (
          <div
            className={`consulta-lateral consulta-lateral--der vbog-catalogo-der is-overlay${panelCatalogoAbierto ? '' : ' is-collapsed'}`}
          >
            {!panelCatalogoAbierto && (
              <div className="consulta-lateral__tab-vertical" onClick={() => setPanelCatalogoAbierto(true)} role="button" tabIndex={0} aria-label="Abrir catálogo de vehículos" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPanelCatalogoAbierto(true) }}>
                <span className="consulta-lateral__tab-icon"><FaCarSide size={13} /></span>
                <span className="consulta-lateral__tab-text">Catálogo</span>
              </div>
            )}
            {/* El panel flota sobre el central (overlay); su ancho es dinámico (resize). */}
            <div
              className="consulta-lateral__panel"
              style={panelCatalogoAbierto ? { width: resizeVehiculos.ancho } : { position: 'fixed', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
            >
              {panelCatalogoAbierto && (
                <div className="pnl-resize-handle" onMouseDown={resizeVehiculos.iniciarResize} onTouchStart={resizeVehiculos.iniciarResizeTouch} title="Arrastrar para redimensionar" />
              )}
              <div className="consulta-lateral__panel-header">
                <div className="consulta-lateral__panel-header-left">
                  <span className="consulta-lateral__panel-header-icon"><FaCarSide size={13} /></span>
                  <h2 className="consulta-lateral__panel-header-title">Catálogo</h2>
                </div>
                <button type="button" className="consulta-lateral__collapse-btn" onClick={() => setPanelCatalogoAbierto(false)} aria-label="Colapsar panel">
                  <FaChevronRight size={10} />
                </button>
              </div>
              <VehiculosBogotaCatalogo ctrl={vehiculosBogotaCtrl} />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}


// ─── PANEL BUSCAR / TRANSFERIR ─────────────────────────────────────────────────

function PanelBuscar({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [tipoBusqueda, setTipoBusqueda] = useState<'cedula' | 'placa'>('cedula')
  const [query, setQuery] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultadosCedula, setResultadosCedula] = useState<BienFloresta[] | null>(null)
  const [resultadoPlaca, setResultadoPlaca] = useState<BienFlorestaDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [placaTransferir, setPlacaTransferir] = useState<string | null>(null)
  const [mostrarModalAgregarBien, setMostrarModalAgregarBien] = useState(false)
  const [pendienteInventario, setPendienteInventario] = useState(false)
  const [marcandoInventario, setMarcandoInventario] = useState(false)

  const buscar = async (overrideQuery?: string) => {
    const q = overrideQuery ?? query
    if (!q.trim()) return
    setBuscando(true)
    setError(null)
    setResultadosCedula(null)
    setResultadoPlaca(null)

    if (tipoBusqueda === 'cedula') {
      const data = await florestaBuscarPorCedula(q.trim())
      if (data.length === 0) setError('No se encontraron bienes Floresta para esta cédula.')
      else setResultadosCedula(data)
    } else {
      const data = await florestaBuscarPorPlaca(q.trim())
      if (data) {
        setResultadoPlaca(data)
        setPendienteInventario(!data.inventariado)
      } else {
        try {
          const API_URL = import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/'
          await fetch(`${API_URL}/almacen/pendientes-inventario/?cedula=_PLACA_${q.trim()}`)
          const resBien = await fetch(`${API_URL}/almacen/admin/buscar-bien/?placa=${q.trim()}`)
          if (resBien.ok) {
            const json = await resBien.json()
            if (json.data) {
              const resPend = await fetch(`${API_URL}/almacen/pendientes-inventario/?cedula=${json.data.cedulaResponsable ?? ''}`)
              let esPendiente = false
              if (resPend.ok) {
                const jsonPend = await resPend.json()
                const placasPend: string[] = (jsonPend.data ?? []).map((p: { placa: string }) => p.placa)
                esPendiente = placasPend.includes(q.trim())
              }
              setPendienteInventario(esPendiente)
              setResultadoPlaca({
                placa: json.data.codigo,
                descripcion: json.data.desmat ?? '',
                responsable_nombre: json.data.responsable ?? '',
                responsable_cedula: json.data.cedulaResponsable ?? '',
                estado: 'activo',
                inventariado: !esPendiente,
                fecha_ultimo_movimiento: null,
                historial: [],
              })
            } else { setError('No se encontró bien con esa placa.') }
          } else { setError('No se encontró bien con esa placa.') }
        } catch { setError('No se encontró bien con esa placa.') }
      }
    }
    setBuscando(false)
  }

  return (
    <div className="transferencia-page__bloque-tab">
      <div className="floresta-busqueda">
        <fieldset className="floresta-busqueda__fieldset">
          <legend className="floresta-busqueda__legend">Buscar bien Floresta</legend>
          <div className="floresta-busqueda__fila">
            <div className="floresta-busqueda__campo">
              <FloatingField label="Buscar por" required tieneValor={!!tipoBusqueda}>
                <select id="floresta-tipo-busqueda" className="floresta-busqueda__select" value={tipoBusqueda} onChange={(e) => { setTipoBusqueda(e.target.value as 'cedula' | 'placa'); setResultadosCedula(null); setResultadoPlaca(null); setError(null) }}>
                  <option value="cedula">Cédula o nombre</option>
                  <option value="placa">Placa del bien</option>
                </select>
              </FloatingField>
            </div>
            {tipoBusqueda === 'placa' ? (
              <>
                <div className="floresta-busqueda__campo floresta-busqueda__campo--grow">
                  <FloatingField label="Placa" required tieneValor={!!query}>
                    <input id="floresta-query" className="floresta-busqueda__input" type="text" value={query} onChange={(e) => setQuery(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder=" " />
                  </FloatingField>
                </div>
                <div className="floresta-busqueda__campo floresta-busqueda__campo--btn">
                  <button className="floresta-busqueda__btn" onClick={() => buscar()} disabled={buscando || !query.trim()}>
                    {buscando ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="floresta-busqueda__campo floresta-busqueda__campo--grow">
                  <FloatingField label="Cédula o nombre" required tieneValor={true}>
                    <SelectorCoordinador valor={query} onChange={(cc) => setQuery(cc)} onSeleccionar={(t) => { setQuery(t.cedula); buscar(t.cedula) }} placeholder="Escriba cédula o nombre (mín. 3 caracteres)..." />
                  </FloatingField>
                </div>
                <div className="floresta-busqueda__campo floresta-busqueda__campo--btn">
                  <button className="floresta-busqueda__btn" onClick={() => buscar()} disabled={buscando || !query.trim()}>
                    {buscando ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </fieldset>
      </div>

      {error && <p style={{ color: '#d13c47', fontWeight: 500 }}>{error}</p>}

      {resultadosCedula && (
        <div className="bienes-table-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
            <h4 style={{ margin: 0 }}>Inventario Floresta</h4>
            <span style={{ background: '#303d50', color: 'white', borderRadius: '12px', padding: '0.1rem 0.55rem', fontSize: '0.72rem', fontWeight: 700 }}>
              {resultadosCedula.length} {resultadosCedula.length === 1 ? 'bien' : 'bienes'}
            </span>
          </div>
          <div className="bienes-table-frame">
            <table className="bienes-table bienes-table--head">
              <colgroup><col style={{ width: '8%' }} /><col /><col style={{ width: '20%' }} /><col style={{ width: '8%' }} /><col style={{ width: '10%' }} /><col style={{ width: '9%' }} /></colgroup>
              <thead><tr><th>Placa</th><th>Descripción</th><th>Responsable</th><th>Estado</th><th>Último mov.</th><th>Acción</th></tr></thead>
            </table>
            <div className="bienes-table-scroll" style={{ maxHeight: '400px' }}>
              <table className="bienes-table bienes-table--body">
                <colgroup><col style={{ width: '8%' }} /><col /><col style={{ width: '20%' }} /><col style={{ width: '8%' }} /><col style={{ width: '10%' }} /><col style={{ width: '9%' }} /></colgroup>
                <tbody>
                  {resultadosCedula.map((b) => (
                    <tr key={b.placa}>
                      <td className="bienes-table__placa">{b.placa}</td>
                      <td>{b.descripcion || '—'}</td>
                      <td>{b.responsable_nombre}</td>
                      <td><span className={`floresta-detalle__estado floresta-detalle__estado--${b.estado}`}>{b.estado}</span></td>
                      <td>{b.fecha_ultimo_movimiento ?? '—'}</td>
                      <td><button className="floresta-tabla__btn-accion" onClick={() => setPlacaTransferir(b.placa)}>Transferir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {resultadoPlaca && (
        <div className="floresta-detalle">
          <div className="floresta-detalle__card">
            <div className="floresta-detalle__header">
              <div>
                <h4 className="floresta-detalle__placa">{resultadoPlaca.placa}</h4>
                {resultadoPlaca.descripcion && <p className="floresta-detalle__descripcion">{resultadoPlaca.descripcion}</p>}
              </div>
              <span className={`floresta-detalle__estado floresta-detalle__estado--${resultadoPlaca.estado}`}>
                {resultadoPlaca.estado === 'activo' ? '● Activo' : resultadoPlaca.estado === 'almacen' ? '● En almacén' : '○ Baja'}
              </span>
            </div>
            <div className="floresta-detalle__info">
              <div className="floresta-detalle__info-item"><span className="floresta-detalle__info-label">Responsable</span><span className="floresta-detalle__info-value">{resultadoPlaca.responsable_nombre || 'Sin responsable'}</span></div>
              <div className="floresta-detalle__info-item"><span className="floresta-detalle__info-label">Cédula</span><span className="floresta-detalle__info-value">{resultadoPlaca.responsable_cedula || '—'}</span></div>
              <div className="floresta-detalle__info-item"><span className="floresta-detalle__info-label">Último movimiento</span><span className="floresta-detalle__info-value">{resultadoPlaca.fecha_ultimo_movimiento ?? '—'}</span></div>
              <div className="floresta-detalle__info-item"><span className="floresta-detalle__info-label">Estado inventario</span><span className="floresta-detalle__info-value">{pendienteInventario ? <span className="bienes-table__alerta-inventario" style={{ display: 'inline-block' }}>Faltante</span> : <span className="bienes-table__estado-inventariado" style={{ display: 'inline-block' }}>Inventariado</span>}</span></div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="floresta-detalle__btn-transferir" onClick={() => setPlacaTransferir(resultadoPlaca.placa)}>Transferir este bien</button>
              {pendienteInventario && (
                <button className="floresta-detalle__btn-inventariar" disabled={marcandoInventario} onClick={async () => {
                  setMarcandoInventario(true)
                  const API_URL = import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/'
                  try {
                    const res = await fetch(`${API_URL}/almacen/marcar-inventariado/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placa: resultadoPlaca.placa }) })
                    const json = await res.json()
                    if (res.ok && json.ok) { setPendienteInventario(false); toast.success('Bien marcado como inventariado correctamente.') }
                    else { toast.error(json.mensaje ?? 'Error al marcar como inventariado.') }
                  } catch { toast.error('Error de conexión.') }
                  setMarcandoInventario(false)
                }}>{marcandoInventario ? 'Procesando...' : 'Marcar como inventariado'}</button>
              )}
            </div>
          </div>

          <div className="floresta-detalle__historial">
            <h5 className="floresta-detalle__historial-titulo">Historial de movimientos<span className="floresta-detalle__historial-badge">{resultadoPlaca.historial.length}</span></h5>
            <div className="bienes-table-wrap" style={{ marginTop: 0 }}>
              <div className="bienes-table-frame">
                <table className="bienes-table bienes-table--head">
                  <colgroup><col style={{ width: '11%' }} /><col style={{ width: '13%' }} /><col style={{ width: '22%' }} /><col style={{ width: '10%' }} /><col style={{ width: '22%' }} /><col style={{ width: '10%' }} /><col style={{ width: '12%' }} /></colgroup>
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Origen</th><th>CC Origen</th><th>Destino</th><th>CC Destino</th><th>Fuente</th></tr></thead>
                </table>
                <div className="bienes-table-scroll" style={{ maxHeight: '300px' }}>
                  <table className="bienes-table bienes-table--body">
                    <colgroup><col style={{ width: '11%' }} /><col style={{ width: '13%' }} /><col style={{ width: '22%' }} /><col style={{ width: '10%' }} /><col style={{ width: '22%' }} /><col style={{ width: '10%' }} /><col style={{ width: '12%' }} /></colgroup>
                    <tbody>
                      {[...resultadoPlaca.historial].reverse().map((m, i) => (
                        <tr key={i}>
                          <td>{m.fecha}</td>
                          <td><span className={`floresta-detalle__tipo floresta-detalle__tipo--${m.tipo.toLowerCase()}`}>{m.tipo}</span></td>
                          <td>{m.origen_nombre}</td>
                          <td><small className="floresta-detalle__cc">{m.origen_cedula || '—'}</small></td>
                          <td>{m.destino_nombre}</td>
                          <td><small className="floresta-detalle__cc">{m.destino_cedula || '—'}</small></td>
                          <td><code className="bienes-table__code">{m.fuente}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {placaTransferir && (
        <ModalTransferir isOpen={!!placaTransferir} placa={placaTransferir}
          onConfirmar={async (nombre, cedula) => {
            const res = await florestaTransferir(placaTransferir!, nombre, cedula)
            if (res.ok) { toast.success('Transferencia realizada correctamente.'); setPlacaTransferir(null); if (tipoBusqueda === 'cedula' && query) { const data = await florestaBuscarPorCedula(query.trim()); setResultadosCedula(data.length > 0 ? data : null) } }
            else { toast.error(res.mensaje || 'Error al transferir') }
          }}
          onClose={() => setPlacaTransferir(null)}
        />
      )}

      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <button className="floresta-busqueda__btn" onClick={() => setMostrarModalAgregarBien(true)}>Agregar bien nuevo</button>
      </div>
      <ModalAgregarBien isOpen={mostrarModalAgregarBien} onClose={() => setMostrarModalAgregarBien(false)} onSuccess={(msg) => toast.success(msg)} onError={(msg) => toast.error(msg)} />
    </div>
  )
}


// ─── PANEL REPORTES ────────────────────────────────────────────────────────────

function PanelReportes({ toast, onAbrirPanelMetricas }: { toast: ReturnType<typeof useToast>; onAbrirPanelMetricas: () => void }) {
  const [bienesMalEstado, setBienesMalEstado] = useState<any[]>([])
  const [cargandoMalEstado, setCargandoMalEstado] = useState(false)
  const [tabReportes, setTabReportes] = useState<'mal-estado' | 'control' | 'observaciones'>('control')
  const [filtroBaja, setFiltroBaja] = useState('')
  // Bandeja de observaciones: modal de resolución + token para refrescar la lista.
  const [obsAResolver, setObsAResolver] = useState<ObservacionBackend | null>(null)
  const [obsRefrescar, setObsRefrescar] = useState(0)

  // Filtrado en vivo de bienes para baja (placa / responsable / ubicación / descripción).
  const bienesBajaFiltrados = useMemo(() => {
    const q = filtroBaja.trim().toLowerCase()
    if (!q) return bienesMalEstado
    return bienesMalEstado.filter((b: any) =>
      (b.placa || '').toLowerCase().includes(q) ||
      (b.descripcion || '').toLowerCase().includes(q) ||
      (b.responsable_nombre || '').toLowerCase().includes(q) ||
      (b.ubicacion || '').toLowerCase().includes(q) ||
      (b.reportado_por_nombre || '').toLowerCase().includes(q),
    )
  }, [bienesMalEstado, filtroBaja])

  // Revertir un bien de "mal estado" a Bueno.
  const revertirBienBaja = async (placa: string) => {
    try {
      const res = await fetch(`${API_URL}/almacen/admin/revertir-mal-estado/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placa }) })
      if (res.ok) { setBienesMalEstado(prev => prev.filter(x => x.placa !== placa)); toast.success(`Bien ${placa} revertido a estado Bueno`) }
      else toast.error('Error al revertir estado')
    } catch { toast.error('Error de conexión') }
  }

  // Exportar los bienes para baja a Excel (una hoja).
  const exportarBajaExcel = () => {
    if (bienesBajaFiltrados.length === 0) { toast.warning('No hay bienes para exportar.'); return }
    const filas = bienesBajaFiltrados.map((b: any) => ({
      'Placa': b.placa || '',
      'Descripción': b.descripcion || '',
      'Serial': b.serial || '',
      'Responsable': b.responsable_nombre || '',
      'Cédula responsable': b.responsable_cedula || '',
      'Ubicación': b.ubicacion || '',
      'Observación': b.observacion || '',
      'Reportado por': b.reportado_por_nombre || '',
      'Cédula reporta': b.reportado_por_cedula || '',
    }))
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 16 }, { wch: 26 }, { wch: 16 }, { wch: 24 }, { wch: 30 }, { wch: 26 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bienes para baja')
    XLSX.writeFile(wb, `bienes-para-baja-${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success(`Excel exportado: ${filas.length} bien(es).`)
  }

  // Columnas de la tabla reutilizable (EcoTabla).
  const columnasBaja: EcoTablaColumna<any>[] = [
    {
      key: 'placa', label: 'Placa', width: '9%', align: 'left',
      render: (b) => <span className="gi-baja-placa">{b.placa || '—'}</span>,
    },
    {
      key: 'descripcion', label: 'Descripción', width: '18%', align: 'left',
      render: (b) => (
        <div className="gi-baja-stack">
          <span className="gi-baja-fuerte">{b.descripcion || '—'}</span>
          {b.serial && b.serial !== 'N/A' && <span className="gi-baja-sub">Serial {b.serial}</span>}
        </div>
      ),
    },
    {
      key: 'responsable', label: 'Responsable', width: '16%', align: 'left',
      render: (b) => (
        <div className="gi-baja-stack">
          <span>{b.responsable_nombre || '—'}</span>
          {b.responsable_cedula && <span className="gi-baja-sub">CC {b.responsable_cedula}</span>}
        </div>
      ),
    },
    { key: 'ubicacion', label: 'Ubicación', width: '13%', align: 'left', render: (b) => <span>{b.ubicacion || '—'}</span> },
    { key: 'observacion', label: 'Observación', width: '17%', align: 'left', render: (b) => <span className="gi-baja-obs" title={b.observacion || ''}>{b.observacion || '—'}</span> },
    {
      key: 'reportado', label: 'Reportado por', width: '15%', align: 'left',
      render: (b) => (
        <div className="gi-baja-stack">
          <span>{b.reportado_por_nombre || '—'}</span>
          {b.reportado_por_cedula && <span className="gi-baja-sub">CC {b.reportado_por_cedula}</span>}
        </div>
      ),
    },
    {
      key: 'accion', label: 'Acción', width: '9%', align: 'center',
      render: (b) => (
        <button type="button" className="gi-baja-revertir" onClick={() => revertirBienBaja(b.placa)} title="Cambiar a estado Bueno y quitar de bienes para baja">
          <FaArrowRotateLeft size={11} /> Revertir
        </button>
      ),
    },
  ]

  const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

  const cargarBienesMalEstado = async () => {
    setCargandoMalEstado(true)
    try {
      const res = await fetch(`${API_URL}/almacen/admin/bienes-mal-estado/`)
      if (res.ok) { const data = await res.json(); setBienesMalEstado(data.bienes || []) }
    } catch { /* silenciar */ }
    setCargandoMalEstado(false)
  }

  // Carga inicial de bienes en mal estado
  useEffect(() => { cargarBienesMalEstado() }, [])

  // WebSocket para actualización en tiempo real (solo bienes en mal estado)
  useEffect(() => {
    const wsEndpoint = import.meta.env.VITE_APP_REDIS_ENDPOINT
    if (!wsEndpoint) return
    let ws: WebSocket | null = null
    let pingInterval: number | undefined
    let reconnectTimeout: number | undefined
    let intentionalClose = false
    const connect = () => {
      try {
        // El consumer exige JWT en ?token=... para autenticar la conexión (BV-01).
        const token = getAccessToken()
        const wsUrl = token
          ? `${wsEndpoint}/almacen?token=${encodeURIComponent(token)}`
          : `${wsEndpoint}/almacen`
        ws = new WebSocket(wsUrl)
        ws.onopen = () => { pingInterval = window.setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })) }, 25_000) }
        ws.onmessage = (event) => { try { const data = JSON.parse(event.data); if (data.type === 'ping' || data.type === 'pong') return; const key = data.action_key || data.action || data.tipo; if (key === 'bien_mal_estado' || key === 'bien_revertido') cargarBienesMalEstado() } catch { /* silenciar */ } }
        ws.onerror = () => {}
        ws.onclose = () => { clearInterval(pingInterval); if (!intentionalClose) reconnectTimeout = window.setTimeout(connect, 5000) }
      } catch { /* silenciar */ }
    }
    connect()
    return () => { intentionalClose = true; clearInterval(pingInterval); clearTimeout(reconnectTimeout); if (ws && ws.readyState === WebSocket.OPEN) ws.close() }
  }, [])

  return (
    <div className="transferencia-page__bloque-tab">
      <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h4 style={{ margin: '0 0 0.5rem' }}>Reportes de Inventario Físico</h4>
        <p style={{ color: '#5c6474', margin: '0 0 1rem', fontSize: '0.9rem' }}>Consulte los bienes para dar de baja y el control de cobertura del inventario.</p>
        <div className="gi-rep-tabs">
          <button
            type="button"
            className={`gi-rep-tab-card${tabReportes === 'control' ? ' is-active' : ''}`}
            onClick={() => setTabReportes('control')}
          >
            <span className="gi-rep-tab-card__icon gi-rep-tab-card__icon--azul"><FaChartColumn size={22} /></span>
            <span className="gi-rep-tab-card__texto">
              <span className="gi-rep-tab-card__titulo">Control y Seguimiento</span>
              <span className="gi-rep-tab-card__sub">Cobertura del inventario físico</span>
            </span>
            {tabReportes === 'control' && <span className="gi-rep-tab-card__check">✓</span>}
          </button>
          <button
            type="button"
            className={`gi-rep-tab-card${tabReportes === 'mal-estado' ? ' is-active is-rojo' : ''}`}
            onClick={() => setTabReportes('mal-estado')}
          >
            <span className="gi-rep-tab-card__icon gi-rep-tab-card__icon--rojo"><FaTriangleExclamation size={22} /></span>
            <span className="gi-rep-tab-card__texto">
              <span className="gi-rep-tab-card__titulo">Bienes para baja ({bienesMalEstado.length})</span>
              <span className="gi-rep-tab-card__sub">Bienes en estado malo</span>
            </span>
            {tabReportes === 'mal-estado' && <span className="gi-rep-tab-card__check">✓</span>}
          </button>
          <button
            type="button"
            className={`gi-rep-tab-card${tabReportes === 'observaciones' ? ' is-active is-ambar' : ''}`}
            onClick={() => setTabReportes('observaciones')}
          >
            <span className="gi-rep-tab-card__icon gi-rep-tab-card__icon--ambar"><FaClipboardList size={22} /></span>
            <span className="gi-rep-tab-card__texto">
              <span className="gi-rep-tab-card__titulo">Observaciones por resolver</span>
              <span className="gi-rep-tab-card__sub">Novedades de la toma de inventario</span>
            </span>
            {tabReportes === 'observaciones' && <span className="gi-rep-tab-card__check">✓</span>}
          </button>
        </div>
      </div>

      {/* TAB: Bienes para baja */}
      {tabReportes === 'mal-estado' && (
        <>
          <p style={{ margin: '0 0 1rem', color: '#5c6474', fontSize: '0.9rem' }}>
            Bienes marcados como <strong style={{ color: '#d13c47' }}>estado MALO</strong> durante el inventario. Deben ser evaluados para dar de baja.
          </p>

          {/* Barra: buscador + contador + exportar + actualizar */}
          <div className="gi-baja-toolbar">
            <div className="gi-baja-search">
              <FaMagnifyingGlass size={12} className="gi-baja-search__icon" />
              <input
                type="text"
                value={filtroBaja}
                onChange={(e) => setFiltroBaja(e.target.value)}
                placeholder="Buscar placa, responsable, ubicación..."
                className="gi-baja-search__input"
              />
            </div>
            <span className="gi-baja-chip">{bienesBajaFiltrados.length} para baja</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="gi-control-btn gi-control-btn--excel" onClick={exportarBajaExcel} disabled={bienesBajaFiltrados.length === 0}>
              <FaFileExcel size={14} /> Exportar a Excel
            </button>
            <button type="button" className="gi-control-btn gi-control-btn--dark" onClick={cargarBienesMalEstado} disabled={cargandoMalEstado}>
              {cargandoMalEstado ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>

          <EcoTabla
            columns={columnasBaja}
            data={bienesBajaFiltrados}
            getRowKey={(b, i) => b.placa || i}
            isLoading={cargandoMalEstado}
            emptyMessage={filtroBaja ? `Sin resultados para "${filtroBaja}".` : 'No hay bienes en mal estado registrados.'}
            getRowClassName={() => 'gi-baja-row'}
            maxHeight="440px"
            className="gi-baja-eco"
          />

          {bienesBajaFiltrados.length > 0 && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: '#d13c47', fontWeight: 600 }}>
              Total: {bienesBajaFiltrados.length} bien(es) para revisión de baja
            </p>
          )}
        </>
      )}

      {/* TAB: Control y Seguimiento */}
      {tabReportes === 'control' && <ControlSeguimiento onAbrirPanelMetricas={onAbrirPanelMetricas} />}

      {/* TAB: Observaciones por resolver (bandeja del gestor) */}
      {tabReportes === 'observaciones' && (
        <BandejaObservaciones
          refrescarToken={obsRefrescar}
          onResolver={(obs) => setObsAResolver(obs)}
        />
      )}

      {/* Modal de resolución de observación */}
      {obsAResolver && (
        <ModalResolverObservacion
          observacion={obsAResolver}
          onClose={() => setObsAResolver(null)}
          onResuelta={() => { setObsAResolver(null); setObsRefrescar(t => t + 1); toast.success('Observación resuelta') }}
          onError={(msg) => toast.error(msg)}
        />
      )}

    </div>
  )
}
