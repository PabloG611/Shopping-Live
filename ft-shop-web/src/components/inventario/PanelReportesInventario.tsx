/**
 * Panel de reportes de inventarios realizados.
 * Reutilizable: se puede montar en cualquier página.
 * Llama a /almacen/admin/listar-inventarios/ y muestra la lista + detalle inline.
 */
import { useState, useEffect } from 'react'
import { FaChevronRight, FaEye, FaEyeSlash, FaTrashCan, FaLocationDot, FaFilePdf } from 'react-icons/fa6'
import ModalConfirmarAccion from '../common/ModalConfirmarAccion'
import ModalPdfConsolidado from './ModalPdfConsolidado'
import { getAuthUserCedula } from '../../utils/authState'
import { obtenerConfiguracionSesion } from '../../services/consultaBienesService'

interface Props {
  toast: { success: (m: string) => void; error: (m: string) => void; warning: (m: string) => void; info: (m: string) => void }
}

export default function PanelReportesInventario({ toast }: Props) {
  const [inventarios, setInventarios] = useState<any[]>([])
  const [cargando, setCargando] = useState(false)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [filtroCedula, setFiltroCedula] = useState('')
  const [filtroPlaca, setFiltroPlaca] = useState('')
  const [resultadoPlaca, setResultadoPlaca] = useState<any | null>(null)
  // Estado de la búsqueda de placa: 'idle' | 'buscando' | 'listo'
  const [estadoBusquedaPlaca, setEstadoBusquedaPlaca] = useState<'idle' | 'buscando' | 'listo'>('idle')
  // Grupos regionales EXPANDIDOS (el Set contiene los abiertos). Inicia vacío:
  // todos colapsados por defecto; el usuario decide cuál abrir.
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set())
  // Detalle inline expandible por inventario (reemplaza el modal).
  const [filasExpandidas, setFilasExpandidas] = useState<Set<string>>(new Set())
  const [detallePorId, setDetallePorId] = useState<Record<string, { cargando: boolean; sesion: any | null; bienes: any[] }>>({})
  const [eliminarReporte, setEliminarReporte] = useState<{ id: string; nombre: string } | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [mostrarModalPdfConsolidado, setMostrarModalPdfConsolidado] = useState(false)
  // Total REAL de bienes por servicio (fuente de verdad: contar-bienes-servicio).
  // Mapa codigo -> cantidad. Denominador consistente para todos los grupos/filas.
  const [totalPorServicio, setTotalPorServicio] = useState<Record<string, number>>({})

  const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

  const cargarInventarios = async () => {
    setCargando(true)
    try {
      // solo_mios: cada usuario ve únicamente los inventarios que él registró.
      // Debe usarse la cédula REAL del usuario logueado (no el UUID id_busuario),
      // para que cruce con las cédulas guardadas. Fallback a getAuthUserCedula() si falla.
      let cedula = ''
      try { cedula = (await obtenerConfiguracionSesion()).numeroIdentificacionSesion || '' } catch { cedula = getAuthUserCedula() }
      const qs = `anio=${anio}${cedula ? `&solo_mios=${encodeURIComponent(cedula)}` : ''}`
      const res = await fetch(`${API_URL}/almacen/admin/listar-inventarios/?${qs}`)
      if (res.ok) { const data = await res.json(); setInventarios(data.inventarios || []) }
    } catch { /* silenciar */ }
    setCargando(false)
  }

  // Conteo real de bienes por servicio (todos los servicios en una sola llamada).
  // Es la fuente de verdad para el denominador "inventariados / total del servicio".
  const cargarTotalesServicio = async () => {
    try {
      const res = await fetch(`${API_URL}/almacen/admin/contar-bienes-servicio/`)
      if (!res.ok) return
      const data = await res.json()
      const mapa: Record<string, number> = {}
      for (const s of (data.servicios || [])) {
        if (s.codigo) mapa[String(s.codigo).trim()] = s.cantidad ?? 0
      }
      setTotalPorServicio(mapa)
    } catch { /* silenciar */ }
  }

  /** Total real de bienes de un servicio por su código (ej: "4000-DSG"). */
  const totalRealDeServicio = (codigoServicio: string): number | null => {
    const cod = (codigoServicio || '').trim()
    if (!cod) return null
    const t = totalPorServicio[cod]
    return typeof t === 'number' ? t : null
  }

  /** Alterna el detalle inline de un inventario; carga bajo demanda y cachea. */
  const toggleDetalle = async (sesionId: string) => {
    const estaAbierta = filasExpandidas.has(sesionId)
    setFilasExpandidas(prev => {
      const next = new Set(prev)
      if (next.has(sesionId)) next.delete(sesionId)
      else next.add(sesionId)
      return next
    })
    if (!estaAbierta && !detallePorId[sesionId]) {
      setDetallePorId(prev => ({ ...prev, [sesionId]: { cargando: true, sesion: null, bienes: [] } }))
      try {
        const res = await fetch(`${API_URL}/almacen/admin/detalle-inventario/${sesionId}/`)
        if (res.ok) {
          const data = await res.json()
          setDetallePorId(prev => ({ ...prev, [sesionId]: { cargando: false, sesion: data.sesion, bienes: data.bienes || [] } }))
        } else {
          setDetallePorId(prev => ({ ...prev, [sesionId]: { cargando: false, sesion: null, bienes: [] } }))
        }
      } catch {
        setDetallePorId(prev => ({ ...prev, [sesionId]: { cargando: false, sesion: null, bienes: [] } }))
      }
    }
  }

  const eliminarInventario = async () => {
    if (!eliminarReporte) return
    setEliminando(true)
    try {
      const res = await fetch(`${API_URL}/almacen/admin/eliminar-inventario/${eliminarReporte.id}/`, { method: 'DELETE' })
      if (res.ok) { setInventarios(prev => prev.filter(inv => inv.id !== eliminarReporte.id)); setEliminarReporte(null); toast.success('Inventario eliminado') }
      else { toast.error('Error al eliminar'); setEliminarReporte(null) }
    } catch { toast.error('Error de conexión'); setEliminarReporte(null) }
    setEliminando(false)
  }

  useEffect(() => { cargarInventarios() }, [anio])
  useEffect(() => { cargarTotalesServicio() }, [])

  // Búsqueda dinámica de placa dentro de los inventarios REPORTADOS (debounce).
  // Consulta las lecturas del año en BD local y muestra en cuál inventario está.
  useEffect(() => {
    const placa = filtroPlaca.trim()
    if (!placa) { setResultadoPlaca(null); setEstadoBusquedaPlaca('idle'); return }
    let cancelado = false
    setEstadoBusquedaPlaca('buscando')
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/almacen/admin/buscar-placa-inventario/?placa=${encodeURIComponent(placa)}&anio=${anio}`)
        const data = res.ok ? await res.json() : null
        if (cancelado) return
        if (data?.encontrado) {
          setResultadoPlaca({
            placa,
            encontrado: true,
            inventario: data.inventario_nombre || '',
            inventarioId: data.inventario_id || '',
            servicio: data.servicio || '',
            fecha: data.fecha || '',
            responsable: data.responsable || '',
          })
        } else {
          setResultadoPlaca({ placa, encontrado: false })
        }
      } catch {
        if (!cancelado) setResultadoPlaca({ placa, encontrado: false })
      } finally {
        if (!cancelado) setEstadoBusquedaPlaca('listo')
      }
    }, 350)
    return () => { cancelado = true; clearTimeout(t) }
  }, [filtroPlaca, anio]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Abre (expande) el inventario donde está la placa y despliega su grupo. */
  const irAlInventario = async (inventarioId: string, servicio: string) => {
    if (!inventarioId) return
    // Expandir el grupo regional que contiene ese servicio.
    const grupo = resolverGrupo(servicio || '')
    setGruposExpandidos(prev => new Set(prev).add(grupo))
    // Abrir el detalle de esa sesión (carga bajo demanda) si no está abierto.
    if (!filasExpandidas.has(inventarioId)) {
      await toggleDetalle(inventarioId)
    }
    // Desplazar hasta la fila.
    setTimeout(() => {
      document.getElementById(`gi-rep-item-${inventarioId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
  }

  // WebSocket para actualización en tiempo real
  useEffect(() => {
    const wsEndpoint = import.meta.env.VITE_APP_REDIS_ENDPOINT
    if (!wsEndpoint) return
    let ws: WebSocket | null = null
    let pingInterval: number | undefined
    let reconnectTimeout: number | undefined
    let intentionalClose = false
    const connect = () => {
      try {
        ws = new WebSocket(`${wsEndpoint}/almacen`)
        ws.onopen = () => { pingInterval = window.setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })) }, 25_000) }
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'ping' || data.type === 'pong') return
            const key = data.action_key || data.action || data.tipo
            if (key === 'inventario_registrado' || key === 'inventario_eliminado') cargarInventarios()
          } catch { /* silenciar */ }
        }
        ws.onerror = () => {}
        ws.onclose = () => { clearInterval(pingInterval); if (!intentionalClose) reconnectTimeout = window.setTimeout(connect, 5000) }
      } catch { /* silenciar */ }
    }
    connect()
    return () => { intentionalClose = true; clearInterval(pingInterval); clearTimeout(reconnectTimeout); if (ws && ws.readyState === WebSocket.OPEN) ws.close() }
  }, [anio])

  const inventariosFiltrados = filtroCedula.trim()
    ? inventarios.filter(inv => { const obs = inv.observaciones || ''; return obs.includes(filtroCedula.trim()) || (inv.cedula || '').includes(filtroCedula.trim()) })
    : inventarios

  // Mapeo de servicios a su GURP real
  const SERVICIO_A_GURP: Record<string, string> = {
    '3000-ENLARIOHACHA': 'GURP Barranquilla',
    '3000-ENLSANTAMARTA': 'GURP Barranquilla',
    '3000-ENLVALLEDUPAR': 'GURP Barranquilla',
    '3000-GURPBLLA': 'GURP Barranquilla',
    '3000-ENLARM': 'GURP Cali',
    '3000-ENLB/TURA': 'GURP Cali',
    '3000-ENLMANIZALES': 'GURP Cali',
    '3000-ENLPEREI': 'GURP Cali',
    '3000-GURPCALI': 'GURP Cali',
    '3000-ENLMONT': 'GURP Cartagena',
    '3000-ENLSINCE': 'GURP Cartagena',
    '3000-GURPCAR': 'GURP Cartagena',
    '3000-ENLB/MEJA': 'GURP Cúcuta',
    '3000-ENLB/MANGA': 'GURP Cúcuta',
    '3000-GURPCUC': 'GURP Cúcuta',
    '3000-ENLMOCOA': 'GURP Florencia',
    '3000-GURPFLO': 'GURP Florencia',
    '3000-ENLAPAR': 'GURP Medellín',
    '3000-ENLQUIBDO': 'GURP Medellín',
    '3000-GURPMED': 'GURP Medellín',
    '3000-ENLIBAGUE': 'GURP Neiva',
    '3000-GURPNEIVA': 'GURP Neiva',
    '3000-ENLPASTO': 'GURP Popayán',
    '3000-ENLTUM': 'GURP Popayán',
    '3000-GURPPO': 'GURP Popayán',
    '3000-ENLARAUCA': 'GURP Villavicencio',
    '3000-ENLYOPAL': 'GURP Villavicencio',
    '3000-GURPVILLA': 'GURP Villavicencio',
    '3000-ENLTUNJA': 'Tunja',
  }
  const resolverGrupo = (servicio: string): string => {
    const codigo = servicio.split(' ')[0].trim()
    return SERVICIO_A_GURP[codigo] || servicio
  }

  // Agrupar por GURP regional. totalBienes = inventariados; totalServicioReal =
  // suma de los totales reales (fuente de verdad) de los servicios del grupo.
  const gruposRegional = new Map<string, { servicios: Map<string, any[]>; totalBienes: number; totalServicioReal: number | null }>()
  for (const inv of inventariosFiltrados) {
    const srv = inv.servicio || (inv.nombre || '').match(/- (\d{4}-\w+)/)?.[1] || 'Sin servicio'
    const codigoRegional = resolverGrupo(srv)
    if (!gruposRegional.has(codigoRegional)) {
      gruposRegional.set(codigoRegional, { servicios: new Map(), totalBienes: 0, totalServicioReal: null })
    }
    const grupo = gruposRegional.get(codigoRegional)!
    if (!grupo.servicios.has(srv)) grupo.servicios.set(srv, [])
    grupo.servicios.get(srv)!.push(inv)
    grupo.totalBienes += (inv.total_bienes || 0)
  }
  // Denominador real por grupo: suma de totales reales de sus servicios únicos.
  for (const [, grupo] of gruposRegional) {
    let suma = 0
    let hayAlguno = false
    for (const srvKey of grupo.servicios.keys()) {
      const cod = srvKey.split(' ')[0].trim()
      const t = totalRealDeServicio(cod)
      if (t !== null) { suma += t; hayAlguno = true }
    }
    grupo.totalServicioReal = hayAlguno ? suma : null
  }

  /** Extrae datos legibles de un inventario desde su cadena de observaciones. */
  const parsearInventario = (inv: any) => {
    const obs = inv.observaciones || ''
    const sedeMatch = obs.match(/Sede:\s*([^|]+)/)
    const ubicMatch = obs.match(/Ubicaci[oó]n:\s*([^|]+)/)
    const col1Match = obs.match(/Colaborador 1:\s*([^|]+?)(?:\s*\||$)/)
    const col2Match = obs.match(/Colaborador 2:\s*([^|]+?)(?:\s*\||\s*$)/)
    const servicioMatch = (inv.nombre || '').match(/- (\d{4}-\w+)/)
    const codigoServicio = inv.servicio || (servicioMatch ? servicioMatch[1] : '')
    return {
      sede: sedeMatch ? sedeMatch[1].trim() : '--',
      ubicacion: ubicMatch ? ubicMatch[1].trim() : '',
      col1: col1Match ? col1Match[1].trim() : '',
      col2: col2Match ? col2Match[1].trim() : '',
      fecha: inv.fecha ? inv.fecha.split(' ')[0] : '--',
      servicio: codigoServicio,
      esRegional: (inv.nombre || '').toLowerCase().includes('regional'),
    }
  }

  /** Fila de un inventario (acordeón). Al pulsar el ojo despliega su detalle. */
  const renderInventario = (inv: any) => {
    const d = parsearInventario(inv)
    const expandida = filasExpandidas.has(inv.id)
    // Denominador consistente: total real del servicio (fuente de verdad).
    const totalReal = totalRealDeServicio(d.servicio) ?? inv.total_servicio ?? null

    // Resaltar la fila si es el inventario donde se encontró la placa buscada.
    const esResultadoPlaca = !!resultadoPlaca?.encontrado && resultadoPlaca.inventarioId === inv.id

    return (
      <div key={inv.id} id={`gi-rep-item-${inv.id}`} className={`gi-rep-item${expandida ? ' is-open' : ''}${esResultadoPlaca ? ' is-resaltado' : ''}`}>
        <div className="gi-rep-item__row">
          <div className="gi-rep-item__main">
            <span className="gi-rep-item__sede">{d.sede}</span>
            {d.ubicacion && <span className="gi-rep-item__ubic">{d.ubicacion}</span>}
            {d.servicio && <span className="gi-rep-item__srv">{d.servicio}</span>}
          </div>
          <div className="gi-rep-item__meta">
            <span className="gi-rep-item__meta-label">Responsable</span>
            <span className="gi-rep-item__meta-val">{inv.responsable || '--'}</span>
          </div>
          <div className="gi-rep-item__meta">
            <span className="gi-rep-item__meta-label">Fecha</span>
            <span className="gi-rep-item__meta-val">{d.fecha}</span>
          </div>
          <div className="gi-rep-item__bienes">
            <span className="gi-rep-item__bienes-num">{inv.total_bienes}{totalReal ? <span className="gi-rep-item__bienes-tot">/{totalReal}</span> : ''}</span>
            <span className="gi-rep-item__bienes-lbl">inventariados</span>
          </div>
          <span className={`gi-rep-tipo${d.esRegional ? ' is-reg' : ''}`}>{d.esRegional ? 'Regional' : 'Sede'}</span>
          <div className="gi-rep-item__acciones">
            <button
              type="button"
              className={`gi-rep-icon-btn${expandida ? ' is-active' : ''}`}
              onClick={() => toggleDetalle(inv.id)}
              title={expandida ? 'Ocultar detalle' : 'Ver detalle'}
              aria-expanded={expandida}
            >
              {expandida ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
            </button>
            <button
              type="button"
              className="gi-rep-icon-btn gi-rep-icon-btn--danger"
              onClick={() => setEliminarReporte({ id: inv.id, nombre: d.sede })}
              title="Eliminar"
            >
              <FaTrashCan size={13} />
            </button>
          </div>
        </div>

        {expandida && <div className="gi-rep-item__detalle">{renderDetalleInline(inv.id)}</div>}
      </div>
    )
  }

  /** Detalle inline: quiénes realizaron el acta + lista de bienes (tabla ligera). */
  const renderDetalleInline = (sesionId: string) => {
    const detalle = detallePorId[sesionId]
    if (!detalle || detalle.cargando) {
      return <div className="gi-rep-detalle__cargando">Cargando detalle…</div>
    }
    const s = detalle.sesion
    const bienes = detalle.bienes

    const realizadores = s ? [
      s.colaborador1_nombre ? { nombre: s.colaborador1_nombre, cargo: s.colaborador1_cargo } : null,
      s.colaborador2_nombre ? { nombre: s.colaborador2_nombre, cargo: s.colaborador2_cargo } : null,
    ].filter(Boolean) as { nombre: string; cargo: string }[] : []

    return (
      <>
        {realizadores.length > 0 && (
          <div className="gi-rep-realizado">
            <span className="gi-rep-realizado__label">Realizado por</span>
            <div className="gi-rep-realizado__chips">
              {realizadores.map((r, idx) => (
                <span key={idx} className="gi-rep-realizado__chip">
                  {r.nombre}{r.cargo ? <span className="gi-rep-realizado__cargo"> · {r.cargo}</span> : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="gi-rep-bienes-titulo">
          Bienes inventariados
          <span className="gi-rep-bienes-count">{bienes.length}</span>
        </div>

        {bienes.length === 0 ? (
          <p className="gi-rep-vacio">Este inventario no tiene bienes registrados.</p>
        ) : (
          <div className="gi-rep-lista" role="table">
            <div className="gi-rep-lista__head" role="row">
              <span className="gi-rep-c-idx">#</span>
              <span className="gi-rep-c-placa">Placa</span>
              <span className="gi-rep-c-est">Est.</span>
              <span className="gi-rep-c-desc">Descripción</span>
              <span className="gi-rep-c-serial">Serial</span>
              <span className="gi-rep-c-resp">Responsable</span>
              <span className="gi-rep-c-cust">Custodio</span>
              <span className="gi-rep-c-ubic">Ubicación</span>
              <span className="gi-rep-c-fecha">Fecha lectura</span>
              <span className="gi-rep-c-nota">Nota</span>
            </div>
            {bienes.map((b: any, i: number) => renderFilaBien(b, i))}
          </div>
        )}
      </>
    )
  }

  /** Fila de un bien en la tabla ligera del detalle. Trae toda su información. */
  const renderFilaBien = (b: any, i: number) => {
    const est = (b.estado_bien || b.estado || 'B').toString().toUpperCase()
    const estClase = est === 'B' ? 'is-b' : est === 'R' ? 'is-r' : 'is-m'
    return (
      <div key={i} className={`gi-rep-lista__row${est === 'M' ? ' is-malo' : ''}`} role="row">
        <span className="gi-rep-c-idx" data-label="#">{i + 1}</span>
        <span className="gi-rep-c-placa" data-label="Placa">
          {b.placa || '—'}
          {b.es_sobrante && <span className="gi-rep-tag-sobrante">Sobrante</span>}
        </span>
        <span className="gi-rep-c-est" data-label="Estado"><span className={`gi-rep-est ${estClase}`}>{est}</span></span>
        <span className="gi-rep-c-desc" data-label="Descripción">{b.descripcion || '—'}</span>
        <span className="gi-rep-c-serial" data-label="Serial">{b.serial || 'N/A'}</span>
        <span className="gi-rep-c-resp" data-label="Responsable">
          {b.responsable || '—'}
          {b.cedula && <span className="gi-rep-c-cc">CC {b.cedula}</span>}
        </span>
        <span className="gi-rep-c-cust" data-label="Custodio">
          {b.custodio_nombre
            ? <>{b.custodio_nombre}{b.custodio_cedula && <span className="gi-rep-c-cc">CC {b.custodio_cedula}</span>}</>
            : <span className="gi-rep-c-dash">—</span>}
        </span>
        <span className="gi-rep-c-ubic" data-label="Ubicación">{b.ubicacion || '—'}</span>
        <span className="gi-rep-c-fecha" data-label="Fecha lectura">{b.fecha_lectura || '—'}</span>
        <span className="gi-rep-c-nota" data-label="Nota">{b.observacion || '—'}</span>
      </div>
    )
  }

  return (
    <div className="gi-rep">
      {/* Filtros — barra compacta */}
      <div className="gi-rep-filtros">
        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="gi-rep-filtros__anio">
          {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="gi-rep-filtros__sep" />
        <input
          type="text"
          value={filtroCedula}
          onChange={(e) => setFiltroCedula(e.target.value.replace(/\D/g, ''))}
          placeholder="CC Responsable"
          maxLength={12}
          inputMode="numeric"
          className="gi-rep-filtros__input"
          style={{ width: '150px' }}
        />
        <div className="gi-rep-placa-box">
          <input
            type="text"
            value={filtroPlaca}
            onChange={(e) => setFiltroPlaca(e.target.value.toUpperCase())}
            placeholder="Buscar placa inventariada"
            maxLength={10}
            className="gi-rep-filtros__input"
            style={{ width: '190px', paddingRight: '26px' }}
          />
          {estadoBusquedaPlaca === 'buscando' && <span className="gi-rep-placa-box__spinner" aria-hidden />}
        </div>
        {(filtroCedula || filtroPlaca) && (
          <button onClick={() => { setFiltroCedula(''); setFiltroPlaca(''); setResultadoPlaca(null); setEstadoBusquedaPlaca('idle') }} className="gi-rep-filtros__limpiar">
            Limpiar
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span className="gi-rep-filtros__count">{inventariosFiltrados.length} inventario{inventariosFiltrados.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Resultado de la búsqueda de placa — tarjeta dinámica */}
      {filtroPlaca.trim() && (
        estadoBusquedaPlaca === 'buscando' && !resultadoPlaca ? (
          <div className="gi-rep-placa-card is-loading">
            <span className="gi-rep-placa-card__spinner" aria-hidden />
            <span>Buscando <strong>{filtroPlaca.trim()}</strong> en los inventarios de {anio}…</span>
          </div>
        ) : resultadoPlaca?.encontrado ? (
          <div className="gi-rep-placa-card is-ok">
            <div className="gi-rep-placa-card__icon" aria-hidden>✓</div>
            <div className="gi-rep-placa-card__body">
              <div className="gi-rep-placa-card__title">
                <span className="gi-rep-placa-card__placa">{resultadoPlaca.placa}</span>
                <span className="gi-rep-placa-card__ok-txt">inventariada</span>
              </div>
              <div className="gi-rep-placa-card__meta">
                {resultadoPlaca.servicio && <span><b>Servicio:</b> {resultadoPlaca.servicio}</span>}
                {resultadoPlaca.responsable && <span><b>Responsable:</b> {resultadoPlaca.responsable}</span>}
                {resultadoPlaca.fecha && <span><b>Fecha:</b> {resultadoPlaca.fecha}</span>}
              </div>
            </div>
            {resultadoPlaca.inventarioId && (
              <button
                type="button"
                className="gi-rep-placa-card__btn"
                onClick={() => irAlInventario(resultadoPlaca.inventarioId, resultadoPlaca.servicio)}
              >
                Ver inventario
              </button>
            )}
          </div>
        ) : resultadoPlaca && !resultadoPlaca.encontrado ? (
          <div className="gi-rep-placa-card is-no">
            <div className="gi-rep-placa-card__icon" aria-hidden>!</div>
            <div className="gi-rep-placa-card__body">
              <div className="gi-rep-placa-card__title">
                <span className="gi-rep-placa-card__placa">{resultadoPlaca.placa}</span>
                <span className="gi-rep-placa-card__no-txt">no encontrada</span>
              </div>
              <div className="gi-rep-placa-card__meta">
                <span>No aparece en ningún inventario reportado del año {anio}.</span>
              </div>
            </div>
          </div>
        ) : null
      )}

      {/* Loading / vacío */}
      {cargando && <p className="gi-rep-msg">Cargando inventarios...</p>}
      {!cargando && inventariosFiltrados.length === 0 && (
        <p className="gi-rep-msg">{filtroCedula ? `No hay inventarios para la cédula ${filtroCedula} en ${anio}.` : `No hay inventarios registrados para el año ${anio}.`}</p>
      )}

      {/* Lista de grupos regionales (acordeón) */}
      {!cargando && inventariosFiltrados.length > 0 && (
        <div className="gi-rep-grupos">
          {Array.from(gruposRegional.entries()).map(([codigoRegional, grupo]) => {
            const colapsado = !gruposExpandidos.has(codigoRegional)
            const todosInvs: any[] = []
            for (const invs of grupo.servicios.values()) todosInvs.push(...invs)
            const cantServicios = grupo.servicios.size

            return (
              <section key={codigoRegional} className={`gi-rep-grupo${colapsado ? ' is-colapsado' : ''}`}>
                <button
                  type="button"
                  className="gi-rep-grupo__header"
                  onClick={() => setGruposExpandidos(prev => { const next = new Set(prev); if (next.has(codigoRegional)) next.delete(codigoRegional); else next.add(codigoRegional); return next })}
                >
                  <FaChevronRight className="gi-rep-grupo__chevron" size={12} />
                  <span className="gi-rep-grupo__icono"><FaLocationDot size={13} /></span>
                  <div className="gi-rep-grupo__texto">
                    <span className="gi-rep-grupo__titulo">{codigoRegional}</span>
                    <span className="gi-rep-grupo__sub">
                      {todosInvs.length} inventario{todosInvs.length !== 1 ? 's' : ''}{cantServicios > 1 ? ` · ${cantServicios} enlaces` : ''}
                    </span>
                  </div>
                  <span className="gi-rep-grupo__badge">
                    <span className="gi-rep-grupo__badge-num">{grupo.totalBienes}{grupo.totalServicioReal ? `/${grupo.totalServicioReal}` : ''}</span>
                    <span className="gi-rep-grupo__badge-lbl">inventariados</span>
                  </span>
                </button>

                {!colapsado && (
                  <div className="gi-rep-grupo__body">
                    {todosInvs.map(renderInventario)}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Botón generar PDF consolidado */}
      {inventarios.length > 0 && (
        <div className="gi-rep-pdf-wrap">
          <button onClick={() => setMostrarModalPdfConsolidado(true)} className="gi-rep-pdf-btn">
            <FaFilePdf size={13} /> Generar PDF
          </button>
        </div>
      )}

      {/* Modal confirmar eliminación */}
      <ModalConfirmarAccion
        isOpen={!!eliminarReporte}
        titulo="Eliminar Inventario"
        mensaje={`¿Está seguro de eliminar el inventario de "${eliminarReporte?.nombre || ''}"?`}
        advertencia="Esta acción no se puede deshacer. Se eliminarán todos los bienes registrados."
        textoConfirmar={eliminando ? 'Eliminando...' : 'Sí, eliminar'}
        color="#dc3545"
        onConfirmar={eliminarInventario}
        onCancelar={() => setEliminarReporte(null)}
      />

      {/* Modal PDF consolidado */}
      <ModalPdfConsolidado
        isOpen={mostrarModalPdfConsolidado}
        onClose={() => setMostrarModalPdfConsolidado(false)}
        inventarios={inventarios}
        onSuccess={(msg) => toast.success(msg)}
        onError={(msg) => toast.error(msg)}
      />
    </div>
  )
}
