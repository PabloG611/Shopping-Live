/**
 * Bandeja "Observaciones por Resolver" (tab de Reportes, solo gestor).
 * Lista las observaciones que escalan (cambio de placa / servicio / descripción)
 * agrupadas por TIPO → servicio → usuario que reportó.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { FaTag, FaRightLeft, FaPenToSquare, FaArrowsRotate } from 'react-icons/fa6'
import {
  cargarBandejaObservaciones,
  type ObservacionBackend,
  type TipoObservacionBackend,
} from '../../../services/observacionesApiService'
import GrupoObservaciones from './GrupoObservaciones'
import './BandejaObservaciones.css'

interface Props {
  onResolver: (obs: ObservacionBackend) => void
  /** Para refrescar desde fuera (p. ej. tras resolver). */
  refrescarToken?: number
}

const GRUPOS: { tipo: TipoObservacionBackend; label: string; icon: React.ReactNode; color: string }[] = [
  { tipo: 'cambio_placa', label: 'Cambio de placa', icon: <FaTag size={14} />, color: '#d97706' },
  { tipo: 'cambio_servicio', label: 'Cambio de servicio', icon: <FaRightLeft size={14} />, color: '#1565c0' },
  { tipo: 'cambio_descripcion', label: 'Cambio de descripción', icon: <FaPenToSquare size={14} />, color: '#7c3aed' },
]

export default function BandejaObservaciones({ onResolver, refrescarToken }: Props) {
  const [observaciones, setObservaciones] = useState<ObservacionBackend[]>([])
  const [conteo, setConteo] = useState<Record<string, number>>({})
  const [cargando, setCargando] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState<'activas' | 'resueltas'>('activas')
  // Filtros de triage del gestor: usuario que reportó y servicio. Vacío = todos.
  // El endpoint de bandeja no acepta estos parámetros, así que se filtra en
  // cliente para que el gestor pueda aislar las observaciones de un usuario o
  // servicio en lugar de verlas todas mezcladas.
  const [filtroUsuario, setFiltroUsuario] = useState<string>('')
  const [filtroServicio, setFiltroServicio] = useState<string>('')

  const cargar = useCallback(async () => {
    setCargando(true)
    const estado = filtroEstado === 'resueltas' ? 'resuelta' : ''
    const res = await cargarBandejaObservaciones(estado)
    setObservaciones(res.observaciones)
    setConteo(res.conteo_por_tipo)
    setCargando(false)
  }, [filtroEstado])

  useEffect(() => { void cargar() }, [cargar, refrescarToken])

  // Opciones de usuario (quien reportó) y servicio presentes en la bandeja.
  const usuariosDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const o of observaciones) {
      const u = (o.reportado_por_nombre || o.reportado_por_cedula || '').trim()
      if (u) set.add(u)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [observaciones])

  const serviciosDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const o of observaciones) {
      const s = (o.servicio || '').trim()
      if (s) set.add(s)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [observaciones])

  // Observaciones tras aplicar los filtros de usuario y servicio.
  const observacionesFiltradas = useMemo(() => {
    const u = filtroUsuario.trim().toLowerCase()
    const s = filtroServicio.trim().toLowerCase()
    return observaciones.filter((o) => {
      if (u) {
        const reporta = (o.reportado_por_nombre || o.reportado_por_cedula || '').trim().toLowerCase()
        if (reporta !== u) return false
      }
      if (s && (o.servicio || '').trim().toLowerCase() !== s) return false
      return true
    })
  }, [observaciones, filtroUsuario, filtroServicio])

  const totalActivas = useMemo(
    () => Object.values(conteo).reduce((a, b) => a + b, 0),
    [conteo],
  )

  return (
    <div className="gi-band">
      {/* Barra: filtro estado + total + actualizar */}
      <div className="gi-band-toolbar">
        <div className="gi-band-tabs2">
          <button type="button" className={`gi-band-tab2${filtroEstado === 'activas' ? ' is-active' : ''}`} onClick={() => setFiltroEstado('activas')}>
            Por resolver{filtroEstado === 'activas' && totalActivas > 0 ? ` (${totalActivas})` : ''}
          </button>
          <button type="button" className={`gi-band-tab2${filtroEstado === 'resueltas' ? ' is-active' : ''}`} onClick={() => setFiltroEstado('resueltas')}>
            Resueltas
          </button>
        </div>
        {/* Filtros de triage: por usuario que reportó y por servicio. */}
        <select
          className="gi-band-filtro"
          value={filtroUsuario}
          onChange={(e) => setFiltroUsuario(e.target.value)}
          title="Filtrar por usuario que reportó"
        >
          <option value="">Todos los usuarios</option>
          {usuariosDisponibles.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select
          className="gi-band-filtro"
          value={filtroServicio}
          onChange={(e) => setFiltroServicio(e.target.value)}
          title="Filtrar por servicio"
        >
          <option value="">Todos los servicios</option>
          {serviciosDisponibles.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button type="button" className="gi-band-refresh" onClick={() => void cargar()} disabled={cargando}>
          <FaArrowsRotate size={12} /> {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {cargando && observaciones.length === 0 ? (
        <p className="gi-band-msg">Cargando observaciones…</p>
      ) : observacionesFiltradas.length === 0 ? (
        <div className="gi-band-vacio">
          <p className="gi-band-vacio__titulo">
            {observaciones.length > 0
              ? 'No hay observaciones para el filtro seleccionado'
              : filtroEstado === 'resueltas' ? 'No hay observaciones resueltas' : '✓ No hay observaciones por resolver'}
          </p>
          <p className="gi-band-vacio__sub">Las novedades de cambio de placa, servicio o descripción aparecerán aquí.</p>
        </div>
      ) : (
        <div className="gi-band-grupos">
          {GRUPOS.map(g => {
            const items = observacionesFiltradas.filter(o => o.tipo === g.tipo)
            if (items.length === 0) return null
            return (
              <GrupoObservaciones
                key={g.tipo}
                titulo={g.label}
                icon={g.icon}
                color={g.color}
                observaciones={items}
                resueltas={filtroEstado === 'resueltas'}
                onResolver={onResolver}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
