import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Animacion } from 'react-ecosistema-unp/ui'
import { FaBoxOpen, FaLayerGroup, FaClipboardList, FaBarcode, FaFileExcel, FaArrowLeft, FaUser, FaMagnifyingGlass } from 'react-icons/fa6'
import ModalExcelControl from './ModalExcelControl'
import {
  type BienInventariado,
  type BienPendiente,
  type Categoria,
  categorizarBien,
  labelCategoria,
  cargarBienesInventariadosAnio,
  cargarBienesPendientesServicio,
} from '../../services/controlSeguimientoService'

/**
 * Control y Seguimiento — vista de cobertura del inventario físico.
 *
 * - Métricas en un panel lateral derecho FLOTANTE y redimensionable (mismo
 *   patrón reutilizable de AdminFlorestaPage / Vehículos). Cada métrica es
 *   clicable y abre su detalle in-panel.
 * - Acordeón servicio → sesión → bienes, mostrando "Realizado por" (1 o 2
 *   colaboradores) por sesión.
 * - Filtro por usuario (colaboradores de los inventarios): un inventario con
 *   dos colaboradores aparece si CUALQUIERA de los dos coincide.
 * - Exportación a Excel (una sola hoja) mediante modal.
 */

interface SesionAgrupada {
  nombre: string
  fecha: string
  bienes: BienInventariado[]
  colaborador1?: string
  colaborador1Cargo?: string
  colaborador2?: string
  colaborador2Cargo?: string
}
interface ServicioAgrupado {
  servicio: string
  sesiones: SesionAgrupada[]
  totalBienes: number
}

type NivelPanel = null | 'bienes' | 'servicios' | 'sesiones' | 'sinPlaca'

export default function ControlSeguimiento({ onAbrirPanelMetricas }: { onAbrirPanelMetricas?: () => void }) {
  const [bienesInventariados, setBienesInventariados] = useState<BienInventariado[]>([])
  const [placasInventariadas, setPlacasInventariadas] = useState<Set<string>>(new Set())
  const [cargandoBienes, setCargandoBienes] = useState(false)
  const [filtroDescripcion, setFiltroDescripcion] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<Categoria>('todos')
  const [usuarioFiltro, setUsuarioFiltro] = useState<string>('')
  const [gruposAbiertos, setGruposAbiertos] = useState<Set<string>>(new Set())

  // Detalle de pendientes del servicio seleccionado
  const [servicioDetalle, setServicioDetalle] = useState<string | null>(null)
  const [bienesServicioDetalle, setBienesServicioDetalle] = useState<BienPendiente[]>([])
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  // Nivel de detalle del panel de métricas (el panel lo monta la página; aquí
  // solo decidimos qué mostrar y pedimos abrirlo).
  const [nivelPanel, setNivelPanel] = useState<NivelPanel>(null)
  const [filtroPanel, setFiltroPanel] = useState('')

  // Modal Excel
  const [modalExcel, setModalExcel] = useState(false)
  const [toastMsg, setToastMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)

  // Cargar bienes inventariados del año
  useEffect(() => {
    const cargar = async () => {
      setCargandoBienes(true)
      const { bienes, placas } = await cargarBienesInventariadosAnio()
      setBienesInventariados(bienes)
      setPlacasInventariadas(placas)
      setCargandoBienes(false)
    }
    void cargar()
  }, [])

  // Auto-ocultar el toast ligero.
  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(null), 3500)
    return () => clearTimeout(t)
  }, [toastMsg])

  // Lista de usuarios (colaboradores) distintos presentes en los inventarios.
  const usuariosDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const b of bienesInventariados) {
      if (b.sesion_colaborador1_nombre) set.add(b.sesion_colaborador1_nombre.trim())
      if (b.sesion_colaborador2_nombre) set.add(b.sesion_colaborador2_nombre.trim())
    }
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b))
  }, [bienesInventariados])

  // ¿El bien pertenece a una sesión realizada por el usuario filtrado?
  // Match OR: aparece si CUALQUIERA de los dos colaboradores coincide.
  const coincideUsuario = (b: BienInventariado): boolean => {
    if (!usuarioFiltro) return true
    const u = usuarioFiltro.trim().toLowerCase()
    return (b.sesion_colaborador1_nombre || '').trim().toLowerCase() === u ||
      (b.sesion_colaborador2_nombre || '').trim().toLowerCase() === u
  }

  // Filtrar bienes (categoría + texto + usuario)
  const bienesFiltrados = useMemo(() => bienesInventariados.filter((b) => {
    if (!coincideUsuario(b)) return false
    if (categoriaFiltro !== 'todos' && categorizarBien(b.placa) !== categoriaFiltro) return false
    if (filtroDescripcion.trim()) {
      const t = filtroDescripcion.trim().toLowerCase()
      return (b.placa || '').toLowerCase().includes(t) ||
        (b.descripcion || '').toLowerCase().includes(t) ||
        (b.responsable || '').toLowerCase().includes(t)
    }
    return true
  }), [bienesInventariados, categoriaFiltro, filtroDescripcion, usuarioFiltro]) // eslint-disable-line react-hooks/exhaustive-deps

  // Agrupar por servicio → sesión (incluye colaboradores de la sesión)
  const serviciosAgrupados: ServicioAgrupado[] = useMemo(() => {
    const mapa: Record<string, Record<string, { fecha: string; bienes: BienInventariado[]; col1?: string; col1c?: string; col2?: string; col2c?: string }>> = {}
    bienesFiltrados.forEach((b) => {
      const svc = b.sesion_servicio || ''
      const ses = b.sesion_nombre || 'Sin sesión'
      const groupKey = svc || ses
      if (!mapa[groupKey]) mapa[groupKey] = {}
      if (!mapa[groupKey][ses]) {
        mapa[groupKey][ses] = {
          fecha: b.sesion_fecha || '',
          bienes: [],
          col1: b.sesion_colaborador1_nombre || '',
          col1c: b.sesion_colaborador1_cargo || '',
          col2: b.sesion_colaborador2_nombre || '',
          col2c: b.sesion_colaborador2_cargo || '',
        }
      }
      mapa[groupKey][ses].bienes.push(b)
    })
    return Object.entries(mapa)
      .map(([servicio, sesiones]) => ({
        servicio,
        sesiones: Object.entries(sesiones).map(([nombre, data]) => ({
          nombre, fecha: data.fecha, bienes: data.bienes,
          colaborador1: data.col1, colaborador1Cargo: data.col1c,
          colaborador2: data.col2, colaborador2Cargo: data.col2c,
        })),
        totalBienes: Object.values(sesiones).reduce((acc, s) => acc + s.bienes.length, 0),
      }))
      .sort((a, b) => b.totalBienes - a.totalBienes)
  }, [bienesFiltrados])

  // Contadores por categoría (respetan el filtro de usuario)
  const bienesParaConteo = useMemo(
    () => bienesInventariados.filter(coincideUsuario),
    [bienesInventariados, usuarioFiltro], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const conteoCategoria = useMemo(() => ({
    todos: bienesParaConteo.length,
    floresta: bienesParaConteo.filter((b) => categorizarBien(b.placa) === 'floresta').length,
    unp: bienesParaConteo.filter((b) => categorizarBien(b.placa) === 'unp').length,
    comodato: bienesParaConteo.filter((b) => categorizarBien(b.placa) === 'comodato').length,
    sin_placa: bienesParaConteo.filter((b) => categorizarBien(b.placa) === 'sin_placa').length,
  }), [bienesParaConteo])

  const totalSesiones = useMemo(
    () => serviciosAgrupados.reduce((acc, g) => acc + g.sesiones.length, 0),
    [serviciosAgrupados],
  )

  const toggleGrupo = (key: string) => setGruposAbiertos((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  // Ver pendientes de un servicio (toggle)
  const verPendientesServicio = async (codigo: string) => {
    if (servicioDetalle === codigo) {
      setServicioDetalle(null)
      setBienesServicioDetalle([])
      return
    }
    setServicioDetalle(codigo)
    setCargandoDetalle(true)
    setBienesServicioDetalle([])
    const pendientes = await cargarBienesPendientesServicio(codigo, placasInventariadas)
    setBienesServicioDetalle(pendientes)
    setCargandoDetalle(false)
  }

  // Abrir el panel en un nivel concreto (desde las cards clicables).
  // El panel vive en la página; le pedimos abrirlo y fijamos el nivel.
  const abrirPanel = (nivel: Exclude<NivelPanel, null>) => {
    setNivelPanel(nivel)
    setFiltroPanel('')
    onAbrirPanelMetricas?.()
  }

  // ── Datos para el detalle del panel según el nivel ──
  const detallePanel = useMemo(() => {
    const q = filtroPanel.trim().toLowerCase()
    const filtraBien = (b: BienInventariado) => !q ||
      (b.placa || '').toLowerCase().includes(q) ||
      (b.descripcion || '').toLowerCase().includes(q) ||
      (b.responsable || '').toLowerCase().includes(q)

    if (nivelPanel === 'bienes') {
      return { titulo: `Bienes inventariados · ${bienesParaConteo.length}`, items: bienesParaConteo.filter(filtraBien) }
    }
    if (nivelPanel === 'sinPlaca') {
      const sinPlaca = bienesParaConteo.filter(b => categorizarBien(b.placa) === 'sin_placa')
      return { titulo: `Sin placa · ${sinPlaca.length}`, items: sinPlaca.filter(filtraBien) }
    }
    return { titulo: '', items: [] as BienInventariado[] }
  }, [nivelPanel, filtroPanel, bienesParaConteo])

  return (
    <div className="gi-control">
      {/* Barra de acciones: filtro usuario + exportar Excel */}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <FiltroUsuario
          usuarios={usuariosDisponibles}
          valor={usuarioFiltro}
          onChange={setUsuarioFiltro}
        />
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setModalExcel(true)}
          className="gi-control-btn gi-control-btn--excel"
          disabled={bienesInventariados.length === 0}
          title="Exportar los bienes inventariados a Excel"
        >
          <FaFileExcel size={14} /> Exportar a Excel
        </button>
      </div>

      {/* Filtros de categoría + texto */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {(['todos', 'unp', 'floresta', 'comodato', 'sin_placa'] as Categoria[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoriaFiltro(cat)}
            style={{
              padding: '0.4rem 0.75rem', fontSize: '0.78rem', fontWeight: 600,
              border: categoriaFiltro === cat ? 'none' : '1px solid #dee2e6',
              borderRadius: '20px',
              background: categoriaFiltro === cat ? '#303d50' : 'white',
              color: categoriaFiltro === cat ? 'white' : '#5c6474',
              cursor: 'pointer', transition: 'all 0.15s ease',
              boxShadow: categoriaFiltro === cat ? '0 2px 6px rgba(48,61,80,0.2)' : 'none',
            }}
          >
            {labelCategoria(cat)} ({conteoCategoria[cat]})
          </button>
        ))}
        <input
          type="text"
          value={filtroDescripcion}
          onChange={(e) => setFiltroDescripcion(e.target.value)}
          placeholder="Filtrar por placa, descripción o responsable..."
          style={{ flex: 1, minWidth: '220px', padding: '0.45rem 0.85rem', border: '1px solid #dee2e6', borderRadius: '20px', fontSize: '0.82rem', outline: 'none', transition: 'border-color 0.15s' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#303d50' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#dee2e6' }}
        />
        <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 'auto' }}>
          {bienesFiltrados.length} bien{bienesFiltrados.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Acordeón servicio → sesión → bienes */}
      {cargandoBienes ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem', minHeight: 'calc(100vh - 420px)' }}>
          <Animacion type="colibri" width={220} />
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '1rem 0 0', fontWeight: 500 }}>Cargando bienes inventariados...</p>
        </div>
      ) : serviciosAgrupados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 2rem', background: '#f8f9fa', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <p style={{ color: '#6c757d', fontSize: '0.88rem', margin: 0 }}>No hay bienes inventariados que coincidan con los filtros.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {serviciosAgrupados.map((svcGroup) => {
            const svcKey = svcGroup.servicio
            const svcAbierto = gruposAbiertos.has(`svc:${svcKey}`)
            const detalleAbierto = servicioDetalle === svcKey
            return (
              <div key={svcKey} className={`gi-ctrl-grupo${svcAbierto ? ' is-open' : ''}`}>
                {/* Barra del servicio */}
                <div className="gi-ctrl-grupo__bar">
                  <div onClick={() => toggleGrupo(`svc:${svcKey}`)} className="gi-ctrl-grupo__main">
                    <span className={`gi-ctrl-grupo__chevron${svcAbierto ? ' is-open' : ''}`}>▶</span>
                    <span className="gi-ctrl-grupo__icon"><FaLayerGroup size={13} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="gi-ctrl-grupo__titulo">{svcGroup.servicio || 'Sin servicio'}</div>
                      <div className="gi-ctrl-grupo__sub">{svcGroup.sesiones.length} inventario{svcGroup.sesiones.length !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span className="gi-ctrl-grupo__badge">{svcGroup.totalBienes.toLocaleString()} bienes</span>
                    {svcKey && (
                      <button
                        onClick={() => void verPendientesServicio(svcKey)}
                        className={`gi-ctrl-pend-btn${detalleAbierto ? ' is-active' : ''}`}
                        title="Ver bienes pendientes por inventariar en este servicio"
                      >
                        {detalleAbierto ? 'Ocultar pendientes' : 'Ver pendientes'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Panel de pendientes del servicio */}
                {detalleAbierto && (
                  <div style={{ borderTop: '1px solid #eef2f7', background: '#fbfcfe' }}>
                    {cargandoDetalle ? (
                      <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#6c757d' }}>Consultando bienes pendientes...</div>
                    ) : bienesServicioDetalle.length === 0 ? (
                      <div style={{ padding: '0.85rem', textAlign: 'center', color: '#2e7d32', fontSize: '0.82rem', fontWeight: 600 }}>✓ Todos los bienes de este servicio están inventariados</div>
                    ) : (
                      <div style={{ padding: '0.75rem 1rem 0.9rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#fde8d7', color: '#c2410c', fontSize: '0.72rem', fontWeight: 700 }}>!</span>
                          <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#334155' }}>{bienesServicioDetalle.length} bien(es) pendiente(s) por inventariar</span>
                        </div>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                          <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                  <th style={pendTh}>Placa</th><th style={pendTh}>Descripción</th><th style={pendTh}>Responsable</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bienesServicioDetalle.map((b, idx) => (
                                  <tr key={idx} style={{ borderTop: '1px solid #eef2f7' }}>
                                    <td style={{ ...pendTd, fontWeight: 700, color: '#1e3a5f', whiteSpace: 'nowrap' }}>{b.placa}</td>
                                    <td style={{ ...pendTd, color: '#5c6474' }}>{b.descripcion || '--'}</td>
                                    <td style={pendTd}>
                                      {b.responsable ? (
                                        <span style={{ color: '#334155' }}>{b.responsable}{b.cedula && <span style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8' }}>CC {b.cedula}</span>}</span>
                                      ) : <span style={{ color: '#adb5bd' }}>--</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sesiones del servicio */}
                {svcAbierto && (
                  <div>
                    {svcGroup.sesiones.map((sesion) => {
                      const sesKey = `${svcKey}::${sesion.nombre}`
                      const sesAbierta = gruposAbiertos.has(sesKey)
                      const realizadores = [
                        sesion.colaborador1 ? { nombre: sesion.colaborador1, cargo: sesion.colaborador1Cargo } : null,
                        sesion.colaborador2 ? { nombre: sesion.colaborador2, cargo: sesion.colaborador2Cargo } : null,
                      ].filter(Boolean) as { nombre: string; cargo?: string }[]
                      return (
                        <div key={sesion.nombre}>
                          <div onClick={() => toggleGrupo(sesKey)} className="gi-ctrl-sesion__bar">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.62rem' }}>{sesAbierta ? '▼' : '▶'}</span>
                              <span className="gi-ctrl-sesion__nombre">{sesion.nombre}</span>
                              {sesion.fecha && <span className="gi-ctrl-sesion__fecha">— {sesion.fecha}</span>}
                              {realizadores.length > 0 && (
                                <span className="gi-ctrl-sesion__realizado">
                                  <FaUser size={9} />
                                  {realizadores.map((r, i) => (
                                    <span key={i} className="gi-ctrl-chip">{r.nombre}{r.cargo ? <span className="gi-ctrl-chip__cargo"> · {r.cargo}</span> : ''}</span>
                                  ))}
                                </span>
                              )}
                            </div>
                            <span className="gi-ctrl-sesion__badge">{sesion.bienes.length}</span>
                          </div>

                          {sesAbierta && (
                            <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f8f9fa' }}>
                                  <th style={thStyle}>Placa</th><th style={thStyle}>Descripción</th><th style={thStyle}>Responsable</th>
                                  <th style={{ ...thStyle, textAlign: 'center' }}>Est.</th><th style={{ ...thStyle, textAlign: 'center' }}>Tipo</th><th style={thStyle}>Fecha</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sesion.bienes.map((b, idx) => {
                                  const cat = categorizarBien(b.placa)
                                  return (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                                      <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>{b.placa || '--'}</td>
                                      <td style={{ padding: '0.3rem 0.5rem' }}>{b.descripcion || '--'}</td>
                                      <td style={{ padding: '0.3rem 0.5rem' }}>{b.responsable || '--'}</td>
                                      <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                        <span style={{ padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700, background: b.estado_bien === 'M' ? '#f8d7da' : b.estado_bien === 'R' ? '#fff3cd' : '#d4edda', color: b.estado_bien === 'M' ? '#721c24' : b.estado_bien === 'R' ? '#856404' : '#155724' }}>{b.estado_bien || 'B'}</span>
                                      </td>
                                      <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                        <span style={{ padding: '0.1rem 0.3rem', borderRadius: '3px', background: cat === 'floresta' ? '#e8f5e9' : cat === 'comodato' ? '#e3f2fd' : cat === 'sin_placa' ? '#fff3e0' : '#f3e5f5', fontSize: '0.65rem', fontWeight: 600 }}>{labelCategoria(cat)}</span>
                                      </td>
                                      <td style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', color: '#6c757d' }}>{b.fecha_lectura || '--'}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Contenido del panel de métricas (portal al panel derecho de la página) ── */}
      {(() => {
        const target = document.getElementById('gi-reportes-metricas')
        if (!target) return null
        return createPortal(
          <>
            {nivelPanel && (nivelPanel === 'bienes' || nivelPanel === 'sinPlaca') ? (
              <div className="gi-panel-contadores gi-panel-contadores--expandido">
                <div className="gi-panel-contadores__detalle">
                  <div className="gi-reg-header">
                    <button type="button" className="gi-reg-back" onClick={() => { setNivelPanel(null); setFiltroPanel('') }}>
                      <FaArrowLeft size={13} /><span>Volver a métricas</span>
                    </button>
                  </div>
                  <h3 className="gi-panel-contadores__detalle-titulo">{detallePanel.titulo}</h3>
                  <div className="gi-panel-contadores__filtro">
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <FaMagnifyingGlass size={12} style={{ position: 'absolute', left: 10, color: '#94a3b8', pointerEvents: 'none' }} />
                      <input type="text" placeholder="Filtrar por placa, descripción..." value={filtroPanel} onChange={(e) => setFiltroPanel(e.target.value)} className="consulta-lateral__filtro-input" style={{ paddingLeft: 30, width: '100%' }} />
                    </div>
                  </div>
                  <div className="gi-panel-contadores__detalle-body">
                    {detallePanel.items.length === 0 ? (
                      <p className="gi-panel-contadores__detalle-hint">Sin resultados.</p>
                    ) : (
                      <div className="gi-detalle-lista">
                        <div className="gi-detalle-lista__count">{detallePanel.items.length} bien{detallePanel.items.length !== 1 ? 'es' : ''}</div>
                        <div className="gi-grupo__body">
                          {detallePanel.items.map((b, i) => (
                            <div key={`${b.placa}-${i}`} className="gi-grupo__item">
                              <span className="gi-grupo__item-placa">{b.placa || 'Sin placa'}</span>
                              <span className="gi-grupo__item-desc">{b.descripcion || '—'}</span>
                              {b.responsable && <span className="gi-grupo__item-resp">{b.responsable}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : nivelPanel === 'servicios' ? (
              <PanelListaServicios servicios={serviciosAgrupados} onVolver={() => setNivelPanel(null)} />
            ) : nivelPanel === 'sesiones' ? (
              <PanelListaSesiones servicios={serviciosAgrupados} onVolver={() => setNivelPanel(null)} />
            ) : (
              <div className="gi-panel-contadores">
                <div className="gi-stat-cards">
                  <button type="button" className="gi-stat-card gi-stat-card--azul" onClick={() => abrirPanel('bienes')}>
                    <span className="gi-stat-card__icon"><FaBoxOpen size={18} /></span>
                    <span className="gi-stat-card__num">{bienesParaConteo.length}</span>
                    <span className="gi-stat-card__texto"><span className="gi-stat-card__label">Bienes inventariados</span><span className="gi-stat-card__sub">Toca para ver la lista</span></span>
                  </button>
                  <button type="button" className="gi-stat-card gi-stat-card--gris" onClick={() => abrirPanel('servicios')}>
                    <span className="gi-stat-card__icon"><FaLayerGroup size={18} /></span>
                    <span className="gi-stat-card__num">{serviciosAgrupados.length}</span>
                    <span className="gi-stat-card__texto"><span className="gi-stat-card__label">Servicios con inventario</span><span className="gi-stat-card__sub">Toca para ver cuáles</span></span>
                  </button>
                  <button type="button" className="gi-stat-card gi-stat-card--verde" onClick={() => abrirPanel('sesiones')}>
                    <span className="gi-stat-card__icon"><FaClipboardList size={18} /></span>
                    <span className="gi-stat-card__num">{totalSesiones}</span>
                    <span className="gi-stat-card__texto"><span className="gi-stat-card__label">Sesiones registradas</span><span className="gi-stat-card__sub">Toca para ver el detalle</span></span>
                  </button>
                  <button type="button" className="gi-stat-card gi-stat-card--naranja" onClick={() => abrirPanel('sinPlaca')}>
                    <span className="gi-stat-card__icon"><FaBarcode size={18} /></span>
                    <span className="gi-stat-card__num">{conteoCategoria.sin_placa}</span>
                    <span className="gi-stat-card__texto"><span className="gi-stat-card__label">Sin placa</span><span className="gi-stat-card__sub">Toca para ver cuáles</span></span>
                  </button>
                </div>
              </div>
            )}
          </>,
          target,
        )
      })()}

      {/* Modal exportar Excel */}
      <ModalExcelControl
        isOpen={modalExcel}
        onClose={() => setModalExcel(false)}
        bienes={bienesFiltrados}
        onSuccess={(m) => setToastMsg({ tipo: 'ok', texto: m })}
        onError={(m) => setToastMsg({ tipo: 'err', texto: m })}
      />

      {/* Toast ligero */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, padding: '0.7rem 1.1rem', borderRadius: 10, color: '#fff', fontSize: '0.85rem', fontWeight: 600, background: toastMsg.tipo === 'ok' ? '#1d6f42' : '#dc2626', boxShadow: '0 6px 20px rgba(0,0,0,0.2)' }}>
          {toastMsg.texto}
        </div>
      )}
    </div>
  )
}

/* ── Lista de servicios en el panel ── */
function PanelListaServicios({ servicios, onVolver }: { servicios: ServicioAgrupado[]; onVolver: () => void }) {
  return (
    <div className="gi-panel-contadores gi-panel-contadores--expandido">
      <div className="gi-panel-contadores__detalle">
        <div className="gi-reg-header">
          <button type="button" className="gi-reg-back" onClick={onVolver}><FaArrowLeft size={13} /><span>Volver a métricas</span></button>
        </div>
        <h3 className="gi-panel-contadores__detalle-titulo">Servicios con inventario · {servicios.length}</h3>
        <div className="gi-panel-contadores__detalle-body">
          <div className="gi-detalle-lista">
            <div className="gi-grupo__body">
              {servicios.map((s, i) => (
                <div key={i} className="gi-grupo__item gi-grupo__item--row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="gi-grupo__item-placa">{s.servicio || 'Sin servicio'}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1565c0' }}>{s.totalBienes} bienes</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Lista de sesiones en el panel ── */
function PanelListaSesiones({ servicios, onVolver }: { servicios: ServicioAgrupado[]; onVolver: () => void }) {
  const sesiones = servicios.flatMap(s => s.sesiones.map(ses => ({ ...ses, servicio: s.servicio })))
  return (
    <div className="gi-panel-contadores gi-panel-contadores--expandido">
      <div className="gi-panel-contadores__detalle">
        <div className="gi-reg-header">
          <button type="button" className="gi-reg-back" onClick={onVolver}><FaArrowLeft size={13} /><span>Volver a métricas</span></button>
        </div>
        <h3 className="gi-panel-contadores__detalle-titulo">Sesiones registradas · {sesiones.length}</h3>
        <div className="gi-panel-contadores__detalle-body">
          <div className="gi-detalle-lista">
            <div className="gi-grupo__body">
              {sesiones.map((ses, i) => {
                const quien = [ses.colaborador1, ses.colaborador2].filter(Boolean).join(' · ')
                return (
                  <div key={i} className="gi-grupo__item">
                    <span className="gi-grupo__item-placa">{ses.nombre}</span>
                    <span className="gi-grupo__item-desc">{ses.servicio || 'Sin servicio'}{ses.fecha ? ` · ${ses.fecha}` : ''}</span>
                    {quien && <span className="gi-grupo__item-resp">Realizado por {quien}</span>}
                    <span className="gi-grupo__item-resp" style={{ color: '#1565c0', fontWeight: 600 }}>{ses.bienes.length} bienes</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Filtro por usuario (selector elegante con búsqueda) ── */
function FiltroUsuario({ usuarios, valor, onChange }: { usuarios: string[]; valor: string; onChange: (u: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return q ? usuarios.filter(u => u.toLowerCase().includes(q)) : usuarios
  }, [usuarios, busqueda])

  return (
    <div className="gi-ctrl-userfilter">
      <span className="gi-ctrl-userfilter__label"><FaUser size={11} /> Usuario</span>
      <div style={{ position: 'relative' }}>
        <button type="button" className="gi-ctrl-userfilter__btn" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
          <span>{valor || 'Todos los usuarios'}</span>
          <span style={{ fontSize: '0.65rem', color: '#64748b', transform: abierto ? 'rotate(180deg)' : undefined }}>▾</span>
        </button>
        {abierto && (
          <>
            <div className="veh-buscarpor__backdrop" onClick={() => setAbierto(false)} />
            <div className="gi-ctrl-userfilter__menu">
              <div style={{ position: 'relative', marginBottom: 6 }}>
                <FaMagnifyingGlass size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input type="text" autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar usuario..." className="gi-ctrl-userfilter__search" />
              </div>
              <button type="button" className={`gi-ctrl-userfilter__item${!valor ? ' is-active' : ''}`} onClick={() => { onChange(''); setAbierto(false); setBusqueda('') }}>
                Todos los usuarios {!valor && <span className="gi-ctrl-userfilter__check">✓</span>}
              </button>
              {filtrados.map((u) => (
                <button key={u} type="button" className={`gi-ctrl-userfilter__item${valor === u ? ' is-active' : ''}`} onClick={() => { onChange(u); setAbierto(false); setBusqueda('') }}>
                  {u} {valor === u && <span className="gi-ctrl-userfilter__check">✓</span>}
                </button>
              ))}
              {filtrados.length === 0 && <p style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0.5rem', margin: 0, textAlign: 'center' }}>Sin usuarios</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = { padding: '0.35rem 0.5rem', textAlign: 'left', fontWeight: 600, color: '#495057' }
const pendTh: React.CSSProperties = { padding: '0.5rem 0.85rem', textAlign: 'left', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }
const pendTd: React.CSSProperties = { padding: '0.5rem 0.85rem', verticalAlign: 'middle' }


