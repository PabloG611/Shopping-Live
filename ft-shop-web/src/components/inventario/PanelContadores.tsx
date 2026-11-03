import { useState, useMemo, useEffect, useRef } from 'react'
import { FaArrowLeft, FaChevronDown, FaChevronRight } from 'react-icons/fa'
// Iconos fa6 para las mini-cards tipo píldora (estilo Vehículos Bogotá)
import { FaBoxOpen, FaCircleCheck, FaTriangleExclamation, FaBell, FaUser, FaPlus } from 'react-icons/fa6'
import { obtenerObservacionesPendientes, obtenerNotas } from '../../services/observacionesInventarioService'
import DetalleCoordinador from './DetalleCoordinador'

interface ConteoInventario {
  servicios: any[]
  total_activos: number
  total_inventariados: number
  anio: number
}

interface PanelContadoresProps {
  conteoInventario: ConteoInventario | null
  totalPorInventariar: number
  inventariadosServicio: number
  pendientes: number
  totalAlertas: number
  obsActivas: number
  bienesEstadoM: number
  serviciosIncluidos: any[]
  hayServicioActivo: boolean
  servicioActivo: any | null
  serviciosExcluidos: string[]
  bienesInventariados: any[]
  placasYaInventariadas: Set<string>
  bienesInventariadosFisico?: any[]
  cargandoInventariadosFisico?: boolean
  bienesFaltantesFisico?: any[]
  cargandoFaltantesFisico?: boolean
  /** Agrega un bien faltante al inventario (reutiliza el flujo de escaneo). */
  onAgregarFaltante?: (bien: any) => void
  // Alertas
  registrosObsNotas?: any[]
  bienesEstadoMData?: any[]
  onIrABien?: (placa: string) => void
  // Servicios (por inventariar)
  serviciosHabilitados?: string[]
  onToggleServicio?: (codigo: string) => void
  onToggleTodosServicios?: (incluir: boolean, codigos: string[]) => void
  onVerBienesServicio?: (codigo: string) => Promise<any[]>
  // Coordinador
  coordinadorSeleccionado?: { nombre: string; cedula: string } | null
  bienesCoordinadorModal?: any[]
  cargandoBienesCoordinador?: boolean
  onBuscarCoordinadorPorCedula?: (cedula: string) => void
  onLimpiarCoordinador?: () => void
  onClickServicios: () => void
  onClickInventariados: () => void
  onClickFaltantes: () => void
  onClickAlertas: () => void
  onClickCoordinador: () => void
  /**
   * Nivel de detalle controlado desde el padre (opcional). Si se provee junto
   * con onNivelActivoChange, el panel es "controlado" y su estado sobrevive a
   * remounts (p. ej. el portal de contadores se re-monta al escanear un bien).
   * Si no se provee, el panel usa estado interno (comportamiento previo).
   */
  nivelActivoControlado?: null | 'servicios' | 'inventariados' | 'faltantes' | 'alertas' | 'coordinador'
  onNivelActivoChange?: (nivel: null | 'servicios' | 'inventariados' | 'faltantes' | 'alertas' | 'coordinador') => void
}

type NivelDetalle = null | 'servicios' | 'inventariados' | 'faltantes' | 'alertas' | 'coordinador'

export default function PanelContadores({
  conteoInventario,
  totalPorInventariar,
  inventariadosServicio,
  pendientes,
  totalAlertas,
  obsActivas,
  bienesEstadoM,
  bienesInventariados,
  placasYaInventariadas,
  serviciosExcluidos,
  bienesInventariadosFisico = [],
  cargandoInventariadosFisico = false,
  bienesFaltantesFisico = [],
  cargandoFaltantesFisico = false,
  onAgregarFaltante,
  registrosObsNotas: registrosObs = [],
  bienesEstadoMData = [],
  onIrABien,
  serviciosHabilitados = [],
  onToggleServicio,
  onToggleTodosServicios,
  onVerBienesServicio,
  coordinadorSeleccionado = null,
  bienesCoordinadorModal = [],
  cargandoBienesCoordinador = false,
  onLimpiarCoordinador,
  onBuscarCoordinadorPorCedula,
  nivelActivoControlado,
  onNivelActivoChange,
  onClickServicios,
  onClickInventariados,
  onClickFaltantes,
  onClickAlertas,
  onClickCoordinador,
}: PanelContadoresProps) {
  const [nivelActivoInterno, setNivelActivoInterno] = useState<NivelDetalle>(null)
  // Modo controlado: si el padre pasa onNivelActivoChange, el estado vive arriba
  // y sobrevive a remounts del portal (evita que se colapse al escanear un bien).
  const esControlado = typeof onNivelActivoChange === 'function'
  const nivelActivo: NivelDetalle = esControlado ? (nivelActivoControlado ?? null) : nivelActivoInterno
  const setNivelActivo = (nivel: NivelDetalle) => {
    if (esControlado) onNivelActivoChange!(nivel)
    else setNivelActivoInterno(nivel)
  }
  const [filtro, setFiltro] = useState('')

  // Placas ya cubiertas: inventariadas globalmente (año) + escaneadas en la sesión actual.
  // Sirve para descontar del modal de coordinador los bienes que ya se registraron.
  const placasCubiertasCoordinador = useMemo(() => new Set<string>([
    ...Array.from(placasYaInventariadas ?? []),
    ...bienesInventariados.map((b: any) => (b.placa || '').trim()),
  ]), [placasYaInventariadas, bienesInventariados])

  // Lista de faltantes SIN los bienes que ya se escanearon en esta sesión (o ya
  // inventariados). Así, al agregar un bien, desaparece del contador de faltantes.
  const faltantesFiltrados = useMemo(
    () => bienesFaltantesFisico.filter((b: any) => !placasCubiertasCoordinador.has((b.placa || '').trim())),
    [bienesFaltantesFisico, placasCubiertasCoordinador],
  )

  // Orden de los contadores para navegación con teclado
  const NIVELES: Exclude<NivelDetalle, null>[] = ['servicios', 'inventariados', 'faltantes', 'alertas', 'coordinador']
  const [indiceFoco, setIndiceFoco] = useState(0)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const handleClick = (nivel: NivelDetalle) => {
    if (nivelActivo === nivel) { setNivelActivo(null); setFiltro(''); return }
    setNivelActivo(nivel)
    setFiltro('')
    switch (nivel) {
      case 'servicios': onClickServicios(); break
      case 'inventariados': onClickInventariados(); break
      case 'faltantes': onClickFaltantes(); break
      case 'alertas': onClickAlertas(); break
      case 'coordinador': onClickCoordinador(); break
    }
  }

  const cerrar = () => { setNivelActivo(null); setFiltro('') }

  // Navegación por teclado del panel de contadores.
  // - Sin detalle abierto: flechas mueven el foco entre contadores, Enter abre.
  // - Con detalle abierto: flechas ↑/↓ scrollean la lista, Escape cierra.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // No interferir cuando el usuario escribe en un input/textarea (filtro, buscador)
      const target = e.target as HTMLElement
      const escribiendo = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')

      if (nivelActivo) {
        // Detalle abierto
        if (e.key === 'Escape') { e.preventDefault(); cerrar(); return }
        if (escribiendo) return
        const body = bodyRef.current
        if (!body) return
        if (e.key === 'ArrowDown') { e.preventDefault(); body.scrollBy({ top: 60, behavior: 'smooth' }) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); body.scrollBy({ top: -60, behavior: 'smooth' }) }
        else if (e.key === 'PageDown') { e.preventDefault(); body.scrollBy({ top: body.clientHeight * 0.8, behavior: 'smooth' }) }
        else if (e.key === 'PageUp') { e.preventDefault(); body.scrollBy({ top: -body.clientHeight * 0.8, behavior: 'smooth' }) }
        return
      }

      // Vista de contadores (sin detalle)
      if (escribiendo) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        setIndiceFoco(prev => (prev + 1) % NIVELES.length)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setIndiceFoco(prev => (prev - 1 + NIVELES.length) % NIVELES.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleClick(NIVELES[indiceFoco])
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [nivelActivo, indiceFoco]) // eslint-disable-line react-hooks/exhaustive-deps

  // Si hay detalle activo, ocultar contadores
  if (nivelActivo) {
    return (
      <div className="gi-panel-contadores gi-panel-contadores--expandido">
        <div className="gi-panel-contadores__detalle">
          <div className="gi-reg-header">
            <button type="button" className="gi-reg-back" onClick={cerrar}>
              <FaArrowLeft size={13} />
              <span>Volver a contadores</span>
            </button>
          </div>

          {/* Título */}
          <h3 className="gi-panel-contadores__detalle-titulo">
            {nivelActivo === 'servicios' && `Bienes por inventariar · ${conteoInventario ? totalPorInventariar.toLocaleString() : '...'}`}
            {nivelActivo === 'inventariados' && `Bienes inventariados · ${conteoInventario ? inventariadosServicio.toLocaleString() : '...'}`}
            {nivelActivo === 'faltantes' && `Bienes faltantes · ${conteoInventario ? pendientes.toLocaleString() : '...'}`}
            {nivelActivo === 'alertas' && `Alertas · ${totalAlertas}`}
            {nivelActivo === 'coordinador' && 'Buscar por Coordinador'}
          </h3>

          {/* Filtro (no mostrar en coordinador, tiene su propio buscador) */}
          {nivelActivo !== 'coordinador' && (
          <div className="gi-panel-contadores__filtro" style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Filtrar por placa, descripción..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="consulta-lateral__filtro-input"
              style={filtro ? { paddingRight: '30px' } : undefined}
            />
            {filtro && (
              <button
                type="button"
                onClick={() => setFiltro('')}
                title="Limpiar filtro"
                aria-label="Limpiar filtro"
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  width: '20px', height: '20px', borderRadius: '50%',
                  border: 'none', background: '#e2e8f0', color: '#475569',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '0.7rem', lineHeight: 1, padding: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#cbd5e1' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#e2e8f0' }}
              >
                ✕
              </button>
            )}
          </div>
          )}

          {/* Contenido */}
          <div className="gi-panel-contadores__detalle-body" ref={bodyRef}>
            {nivelActivo === 'inventariados' && (
              <ListaAgrupadaPorServicio bienes={bienesInventariadosFisico} cargando={cargandoInventariadosFisico} filtro={filtro} tipo="inventariado" campoServicio="servicio_codigo" campoNombreServicio="servicio_nombre" />
            )}
            {nivelActivo === 'faltantes' && (
              <ListaAgrupadaPorServicio bienes={faltantesFiltrados} cargando={cargandoFaltantesFisico} filtro={filtro} tipo="faltante" campoServicio="servicio_codigo" campoNombreServicio="servicio_nombre" onAgregarFaltante={onAgregarFaltante} />
            )}
            {nivelActivo === 'servicios' && (
              <DetalleServicios
                conteoInventario={conteoInventario}
                serviciosExcluidos={serviciosExcluidos}
                serviciosHabilitados={serviciosHabilitados}
                filtro={filtro}
                onToggle={onToggleServicio}
                onToggleTodos={onToggleTodosServicios}
                onVerBienes={onVerBienesServicio}
              />
            )}
            {nivelActivo === 'alertas' && (
              <DetalleAlertas registros={registrosObs} bienesEstadoM={bienesEstadoMData} filtro={filtro} onIrABien={onIrABien} />
            )}
            {nivelActivo === 'coordinador' && (
              <DetalleCoordinador
                coordinadorSeleccionado={coordinadorSeleccionado}
                bienes={bienesCoordinadorModal}
                cargando={cargandoBienesCoordinador}
                filtro={filtro}
                placasCubiertas={placasCubiertasCoordinador}
                onBuscarPorCedula={onBuscarCoordinadorPorCedula}
                onLimpiar={onLimpiarCoordinador}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  // Estado de carga: mismo patrón que el panel regional (spinner + skeleton de
  // cards en vertical), para que ambos paneles luzcan igual mientras cargan.
  if (!conteoInventario) {
    return (
      <div className="gi-panel-contadores">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1.25rem 0' }}>
          <span className="gi-contadores-spinner" aria-hidden="true" />
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Cargando contadores...</p>
        </div>
        <div className="gi-stat-cards" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="gi-stat-card gi-contadores-skeleton">
              <span className="gi-stat-card__num gi-skeleton-bar" style={{ width: '2.4rem', height: '2rem' }} />
              <span className="gi-stat-card__texto">
                <span className="gi-stat-card__label gi-skeleton-bar" style={{ width: '70%' }} />
                <span className="gi-stat-card__sub gi-skeleton-bar" style={{ width: '45%', marginTop: '6px' }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Clase de foco por teclado aplicada a la mini-card (anillo). Mantiene el
  // nombre/firma `focoClase`; solo cambia la clase emitida a la variante card.
  const focoClase = (nivel: Exclude<NivelDetalle, null>) => NIVELES[indiceFoco] === nivel ? ' gi-stat-card--foco' : ''

  // Sublabel de alertas (misma info que antes: obs / para baja / OK), preservado.
  const subAlertas = `${obsActivas > 0 ? `${obsActivas} obs` : ''}${obsActivas > 0 && bienesEstadoM > 0 ? ' + ' : ''}${bienesEstadoM > 0 ? `${bienesEstadoM} para baja` : ''}${totalAlertas === 0 ? 'OK' : ''}`

  return (
    <div className="gi-panel-contadores">
      <div className="gi-stat-cards">
        <button
          type="button"
          className={`gi-stat-card gi-stat-card--azul${focoClase('servicios')}`}
          onClick={() => handleClick('servicios')}
          title="Bienes por inventariar de los servicios habilitados"
        >
          <span className="gi-stat-card__icon"><FaBoxOpen size={18} /></span>
          <span className="gi-stat-card__num">{conteoInventario ? totalPorInventariar.toLocaleString() : '...'}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Por inventariar</span>
            <span className="gi-stat-card__sub">de los servicios habilitados</span>
          </span>
        </button>
        <button
          type="button"
          className={`gi-stat-card gi-stat-card--verde${focoClase('inventariados')}`}
          onClick={() => handleClick('inventariados')}
          title="Bienes inventariados de los servicios habilitados"
        >
          <span className="gi-stat-card__icon"><FaCircleCheck size={18} /></span>
          <span className="gi-stat-card__num">{conteoInventario ? inventariadosServicio.toLocaleString() : '...'}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Inventariados</span>
            <span className="gi-stat-card__sub">de los servicios habilitados · {bienesInventariados.length} en sesión</span>
          </span>
        </button>
        <button
          type="button"
          className={`gi-stat-card gi-stat-card--naranja${focoClase('faltantes')}`}
          onClick={() => handleClick('faltantes')}
          title="Bienes faltantes de los servicios habilitados"
        >
          <span className="gi-stat-card__icon"><FaTriangleExclamation size={18} /></span>
          <span className="gi-stat-card__num">{conteoInventario ? pendientes.toLocaleString() : '...'}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Faltantes</span>
            <span className="gi-stat-card__sub">del total esperado</span>
          </span>
        </button>
        <button
          type="button"
          className={`gi-stat-card gi-stat-card--rojo${focoClase('alertas')}`}
          onClick={() => handleClick('alertas')}
          title={`Alertas${subAlertas ? ` · ${subAlertas}` : ''}`}
        >
          <span className="gi-stat-card__icon"><FaBell size={18} /></span>
          <span className="gi-stat-card__num">{totalAlertas}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Alertas</span>
            <span className="gi-stat-card__sub">{subAlertas || 'obs / para baja'}</span>
          </span>
        </button>
        <button
          type="button"
          className={`gi-stat-card gi-stat-card--gris${focoClase('coordinador')}`}
          onClick={() => handleClick('coordinador')}
          title="Bienes a cargo del coordinador"
        >
          <span className="gi-stat-card__icon"><FaUser size={20} /></span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Coordinador</span>
            <span className="gi-stat-card__sub">Bienes a cargo del coordinador</span>
          </span>
        </button>
      </div>
      <div className="gi-contadores-hint">Usa ↑ ↓ para moverte · Enter para abrir · Esc para volver</div>
    </div>
  )
}

/* ── Lista agrupada por servicio ── */
function ListaAgrupadaPorServicio({ bienes, cargando, filtro, tipo, campoServicio, campoNombreServicio, onAgregarFaltante }: {
  bienes: any[]; cargando: boolean; filtro: string; tipo: 'inventariado' | 'faltante'; campoServicio: string; campoNombreServicio: string
  onAgregarFaltante?: (bien: any) => void
}) {
  // Todos los grupos inician colapsados; el usuario expande el que quiere
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())

  const filtrados = useMemo(() => {    if (!filtro.trim()) return bienes
    const q = filtro.toLowerCase()
    return bienes.filter((b: any) =>
      (b.placa || '').toLowerCase().includes(q) ||
      (b.descripcion || '').toLowerCase().includes(q) ||
      (b.responsable || b.nombre_responsable || '').toLowerCase().includes(q) ||
      (b.cedula || b.cedula_responsable || '').includes(q) ||
      (b[campoNombreServicio] || '').toLowerCase().includes(q) ||
      (b[campoServicio] || '').toLowerCase().includes(q)
    )
  }, [bienes, filtro, campoServicio, campoNombreServicio])

  const grupos = useMemo(() => {
    const mapa = new Map<string, { codigo: string; nombre: string; bienes: any[] }>()
    for (const b of filtrados) {
      const key = b[campoServicio] || 'SIN_SERVICIO'
      if (!mapa.has(key)) mapa.set(key, { codigo: key, nombre: b[campoNombreServicio] || 'Sin servicio', bienes: [] })
      mapa.get(key)!.bienes.push(b)
    }
    return Array.from(mapa.values()).sort((a, b) => b.bienes.length - a.bienes.length)
  }, [filtrados, campoServicio, campoNombreServicio])

  const toggleGrupo = (codigo: string) => {
    setColapsados(prev => { const n = new Set(prev); if (n.has(codigo)) n.delete(codigo); else n.add(codigo); return n })
  }

  // Colapsar todos los grupos SOLO cuando cambia el CONJUNTO de servicios
  // (no en cada escaneo). Antes dependía de `bienes`, que se reconstruye en
  // cada escaneo (faltantesFiltrados quita la placa recién escaneada), por lo
  // que el grupo que el usuario tenía abierto se plegaba en cada bien agregado.
  // Ahora usamos la "firma" de los códigos de servicio: mientras el usuario
  // escanea dentro de los mismos servicios, su grupo expandido se mantiene.
  const firmaServicios = grupos.map(g => g.codigo).sort().join('|')
  const firmaPrevRef = useRef<string | null>(null)
  useEffect(() => {
    if (grupos.length > 0 && firmaPrevRef.current !== firmaServicios) {
      setColapsados(new Set(grupos.map(g => g.codigo)))
    }
    firmaPrevRef.current = firmaServicios
  }, [firmaServicios]) // eslint-disable-line react-hooks/exhaustive-deps

  if (cargando) return <p className="gi-panel-contadores__detalle-hint">Cargando...</p>
  if (bienes.length === 0) return <p className="gi-panel-contadores__detalle-hint">No hay bienes {tipo === 'inventariado' ? 'inventariados' : 'faltantes'}.</p>

  // Cuando solo hay UN servicio, no tiene sentido el acordeón colapsable:
  // se muestran los bienes directamente (sin el header desplegable).
  const unicoServicio = grupos.length === 1

  if (unicoServicio) {
    const grupo = grupos[0]
    return (
      <div className="gi-detalle-lista">
        <div className="gi-detalle-lista__count">
          {filtrados.length}{filtro ? ` de ${bienes.length}` : ''} bienes · {grupo.nombre}
        </div>
        <div className="gi-pc-cards">
          {grupo.bienes.map((b: any, i: number) => <FilaBienCard key={`${b.placa}-${i}`} bien={b} tipo={tipo} onAgregarFaltante={onAgregarFaltante} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="gi-detalle-lista">
      <div className="gi-detalle-lista__count">{filtrados.length}{filtro ? ` de ${bienes.length}` : ''} bienes · {grupos.length} servicios</div>

      {grupos.map((grupo) => {
        const isCollapsed = colapsados.has(grupo.codigo)
        return (
          <div key={grupo.codigo} className="gi-grupo">
            <button type="button" className={`gi-grupo__header gi-grupo__header--${tipo}`} onClick={() => toggleGrupo(grupo.codigo)}>
              <span className="gi-grupo__chevron">{isCollapsed ? <FaChevronRight size={8} /> : <FaChevronDown size={8} />}</span>
              <span className="gi-grupo__nombre">{grupo.nombre}</span>
              <span className="gi-grupo__codigo">{grupo.codigo}</span>
              <span className="gi-grupo__badge">{grupo.bienes.length}</span>
            </button>
            {!isCollapsed && (
              <div className="gi-pc-cards">
                {grupo.bienes.map((b: any, i: number) => <FilaBienCard key={`${b.placa}-${i}`} bien={b} tipo={tipo} onAgregarFaltante={onAgregarFaltante} />)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


/* ── Tarjeta de un bien en el detalle de faltantes/inventariados ── */
function FilaBienCard({ bien, tipo, onAgregarFaltante }: { bien: any; tipo: 'inventariado' | 'faltante'; onAgregarFaltante?: (bien: any) => void }) {
  const responsable = bien.responsable || bien.nombre_responsable || ''
  const cedula = bien.cedula || bien.cedula_responsable || ''
  // Solo en faltantes y cuando el padre provee el callback: botón corto para
  // montar el bien en la tabla central reutilizando el flujo de escaneo.
  const puedeAgregar = tipo === 'faltante' && typeof onAgregarFaltante === 'function' && !!(bien.placa || '').trim()
  return (
    <div className={`gi-pc-card gi-pc-card--${tipo}`}>
      <div className="gi-pc-card__top">
        <span className="gi-pc-card__placa">{bien.placa || 'Sin placa'}</span>
        <span className={`gi-pc-card__pill gi-pc-card__pill--${tipo}`}>
          {tipo === 'inventariado' ? '✓ Inventariado' : '● Faltante'}
        </span>
      </div>
      <span className="gi-pc-card__desc">{bien.descripcion || '—'}</span>
      {responsable && (
        <span className="gi-pc-card__resp">{responsable}{cedula ? ` · CC ${cedula}` : ''}</span>
      )}
      {puedeAgregar && (
        <button
          type="button"
          className="gi-pc-card__agregar"
          onClick={() => onAgregarFaltante!(bien)}
          title="Agregar este bien al inventario"
        >
          <FaPlus size={10} />
          <span>Agregar</span>
        </button>
      )}
    </div>
  )
}


/* ── Sub-componente: Detalle Alertas con tabs ── */
function DetalleAlertas({ registros, bienesEstadoM, filtro, onIrABien }: {
  registros: any[]
  bienesEstadoM: any[]
  filtro: string
  onIrABien?: (placa: string) => void
}) {
  const [tab, setTab] = useState<'obs' | 'notas' | 'estado-m'>('obs')

  const observaciones = useMemo(() => obtenerObservacionesPendientes(registros), [registros])
  const notas = useMemo(() => obtenerNotas(registros), [registros])

  const filtrar = (texto: string) => {
    if (!filtro.trim()) return true
    return texto.toLowerCase().includes(filtro.trim().toLowerCase())
  }

  // Motivo de la baja = la nota registrada para esa placa (última nota gana).
  const motivoPorPlaca = useMemo(() => {
    const mapa: Record<string, string> = {}
    for (const n of notas) {
      const placa = (n.placa || '').trim()
      if (placa && n.texto) mapa[placa] = n.texto
    }
    return mapa
  }, [notas])

  const obsFiltradas = observaciones.filter(r => filtrar(`${r.placa} ${r.texto} ${r.descripcionBien}`))
  const notasFiltradas = notas.filter(r => filtrar(`${r.placa} ${r.texto} ${r.descripcionBien}`))
  const estadoMFiltrados = bienesEstadoM.filter(b => filtrar(`${b.placa} ${b.descripcion} ${b.nombre_responsable || ''} ${motivoPorPlaca[(b.placa || '').trim()] || ''}`))

  return (
    <div className="gi-alertas">
      {/* Tabs pill */}
      <div className="gi-alertas__tabs">
        <button type="button" className={`gi-alertas__tab gi-alertas__tab--obs${tab === 'obs' ? ' is-active' : ''}`} onClick={() => setTab('obs')}>
          Obs ({observaciones.length})
        </button>
        <button type="button" className={`gi-alertas__tab gi-alertas__tab--notas${tab === 'notas' ? ' is-active' : ''}`} onClick={() => setTab('notas')}>
          Notas ({notas.length})
        </button>
        <button type="button" className={`gi-alertas__tab gi-alertas__tab--m${tab === 'estado-m' ? ' is-active' : ''}`} onClick={() => setTab('estado-m')}>
          Para Baja ({bienesEstadoM.length})
        </button>
      </div>

      {/* Contenido */}
      <div className="gi-alertas__body">
        {tab === 'obs' && (
          obsFiltradas.length === 0
            ? <p className="gi-panel-contadores__detalle-hint">{observaciones.length === 0 ? 'Sin observaciones pendientes' : 'Sin resultados'}</p>
            : obsFiltradas.map(obs => (
              <div key={obs.id} className="gi-alertas__item gi-alertas__item--obs" onClick={() => { if (onIrABien) onIrABien(obs.placa) }}>
                <div className="gi-alertas__item-top">
                  <span className="gi-alertas__item-placa gi-alertas__item-placa--obs">{obs.placa}</span>
                  <span className="gi-alertas__item-fecha">{new Date(obs.fechaCreacion).toLocaleDateString('es-CO')}</span>
                </div>
                <p className="gi-alertas__item-texto">{obs.texto}</p>
                {obs.descripcionBien && <span className="gi-alertas__item-desc">{obs.descripcionBien}</span>}
              </div>
            ))
        )}

        {tab === 'notas' && (
          notasFiltradas.length === 0
            ? <p className="gi-panel-contadores__detalle-hint">{notas.length === 0 ? 'No hay notas' : 'Sin resultados'}</p>
            : notasFiltradas.map(nota => (
              <div key={nota.id} className="gi-alertas__item gi-alertas__item--nota" onClick={() => { if (onIrABien) onIrABien(nota.placa) }}>
                <div className="gi-alertas__item-top">
                  <span className="gi-alertas__item-placa gi-alertas__item-placa--nota">{nota.placa}</span>
                  <span className="gi-alertas__item-fecha">{new Date(nota.fechaCreacion).toLocaleDateString('es-CO')}</span>
                </div>
                <p className="gi-alertas__item-texto">{nota.texto}</p>
                {nota.automatica && (
                  <div className="gi-alertas__auto-row">
                    <span className="gi-alertas__auto-badge">Nota automática</span>
                  </div>
                )}
              </div>
            ))
        )}

        {tab === 'estado-m' && (
          estadoMFiltrados.length === 0
            ? <p className="gi-panel-contadores__detalle-hint">{bienesEstadoM.length === 0 ? 'Sin bienes para baja' : 'Sin resultados'}</p>
            : estadoMFiltrados.map((b, i) => {
              const motivo = motivoPorPlaca[(b.placa || '').trim()] || ''
              return (
                <div key={i} className="gi-alertas__item gi-alertas__item--m" onClick={() => { if (onIrABien) onIrABien(b.placa) }}>
                  <div className="gi-alertas__item-top">
                    <span className="gi-alertas__item-placa gi-alertas__item-placa--m">{b.placa}</span>
                    <span className="gi-alertas__item-badge-baja">Para baja</span>
                  </div>
                  {b.descripcion && <span className="gi-alertas__item-desc">{b.descripcion}</span>}
                  {b.nombre_responsable && <span className="gi-alertas__item-resp">{b.nombre_responsable}</span>}
                  {motivo
                    ? (
                      <div className="gi-alertas__item-motivo">
                        <span className="gi-alertas__item-motivo-label">Motivo de la baja</span>
                        <p className="gi-alertas__item-motivo-texto">{motivo}</p>
                      </div>
                    )
                    : <p className="gi-alertas__item-motivo-vacio">Sin motivo registrado</p>
                  }
                </div>
              )
            })
        )}
      </div>
    </div>
  )
}


/* ── Sub-componente: Detalle Servicios (Por inventariar) con drill-down ── */
function DetalleServicios({ conteoInventario, serviciosExcluidos, serviciosHabilitados, filtro, onToggle, onToggleTodos, onVerBienes }: {
  conteoInventario: any
  serviciosExcluidos: string[]
  serviciosHabilitados: string[]
  filtro: string
  onToggle?: (codigo: string) => void
  onToggleTodos?: (incluir: boolean, codigos: string[]) => void
  onVerBienes?: (codigo: string) => Promise<any[]>
}) {
  const [expandido, setExpandido] = useState<string | null>(null)
  const [bienesExpandido, setBienesExpandido] = useState<any[]>([])
  const [cargandoBienes, setCargandoBienes] = useState(false)
  // Caché local de bienes por servicio (para poder filtrar por PLACA, que vive en los bienes).
  const [bienesPorServicio, setBienesPorServicio] = useState<Record<string, any[]>>({})
  const [buscandoEnBienes, setBuscandoEnBienes] = useState(false)

  const serviciosBase = useMemo(() => {
    if (!conteoInventario) return []
    return conteoInventario.servicios
      .filter((s: any) => serviciosHabilitados.length > 0 ? serviciosHabilitados.includes(s.codigo) : false)
  }, [conteoInventario, serviciosHabilitados])

  const q = filtro.trim().toLowerCase()

  // Servicios que coinciden por CÓDIGO o NOMBRE del propio servicio.
  const coincideServicio = (s: any) => s.codigo.toLowerCase().includes(q) || s.nombre.toLowerCase().includes(q)

  // Al escribir un filtro, precargar los bienes de todos los servicios habilitados
  // (una sola vez cada uno) para poder buscar también por PLACA/descripción/responsable.
  // Sin esto, el filtro solo veía código/nombre del servicio y una placa daba "0 servicios".
  useEffect(() => {
    if (!q || !onVerBienes) return
    const faltantes = serviciosBase.filter((s: any) => !(s.codigo in bienesPorServicio))
    if (faltantes.length === 0) return
    let cancelado = false
    setBuscandoEnBienes(true)
    ;(async () => {
      const nuevos: Record<string, any[]> = {}
      for (const s of faltantes) {
        try {
          const bienes = await onVerBienes(s.codigo)
          nuevos[s.codigo] = Array.isArray(bienes) ? bienes : []
        } catch {
          nuevos[s.codigo] = []
        }
      }
      if (!cancelado) {
        setBienesPorServicio(prev => ({ ...prev, ...nuevos }))
        setBuscandoEnBienes(false)
      }
    })()
    return () => { cancelado = true }
  }, [q, serviciosBase, onVerBienes]) // eslint-disable-line react-hooks/exhaustive-deps

  const bienCoincide = (b: any) => {
    const placa = (b.placa || '').toLowerCase()
    const desc = (b.descripcion || '').toLowerCase()
    const resp = ((b.responsable || b.nombre_responsable) || '').toLowerCase()
    return placa.includes(q) || desc.includes(q) || resp.includes(q)
  }

  // Resultado del filtro: para cada servicio decide si se muestra y con qué bienes.
  // - Sin filtro: todos los servicios base, sin bienes coincidentes (se cargan al expandir).
  // - Con filtro: servicios que coinciden por nombre/código (todos sus bienes) o que
  //   tengan al menos un bien coincidente (solo esos bienes, auto-expandidos).
  const serviciosFiltrados = useMemo(() => {
    if (!q) return serviciosBase.map((s: any) => ({ servicio: s, bienesMatch: null as any[] | null }))
    const out: { servicio: any; bienesMatch: any[] | null }[] = []
    for (const s of serviciosBase) {
      const bienes = bienesPorServicio[s.codigo] || []
      const matchServicio = coincideServicio(s)
      const bienesMatch = bienes.filter(bienCoincide)
      if (matchServicio) {
        // Coincide el servicio entero: mostrarlo (con bienes coincidentes si los hay).
        out.push({ servicio: s, bienesMatch: bienesMatch.length > 0 ? bienesMatch : null })
      } else if (bienesMatch.length > 0) {
        out.push({ servicio: s, bienesMatch })
      }
    }
    return out
  }, [serviciosBase, q, bienesPorServicio]) // eslint-disable-line react-hooks/exhaustive-deps

  const codigosFiltrados = serviciosFiltrados.map((x: { servicio: any; bienesMatch: any[] | null }) => x.servicio.codigo)
  const todosIncluidos = serviciosFiltrados.every((x: { servicio: any; bienesMatch: any[] | null }) => !serviciosExcluidos.includes(x.servicio.codigo))

  const handleClickServicio = async (codigo: string) => {
    if (expandido === codigo) { setExpandido(null); setBienesExpandido([]); return }
    setExpandido(codigo)
    setBienesExpandido([])
    if (onVerBienes) {
      setCargandoBienes(true)
      const bienes = await onVerBienes(codigo)
      setBienesExpandido(bienes)
      setCargandoBienes(false)
    }
  }

  if (!conteoInventario) return <p className="gi-panel-contadores__detalle-hint">Cargando servicios...</p>
  if (serviciosBase.length === 0) return <p className="gi-panel-contadores__detalle-hint">No hay servicios habilitados.</p>

  return (
    <div className="gi-detalle-servicios">
      {/* Toggle todos */}
      <div className="gi-detalle-servicios__toggle-all">
        <label className="gi-detalle-servicios__check-label">
          <input
            type="checkbox"
            checked={todosIncluidos}
            onChange={() => onToggleTodos?.(!todosIncluidos, codigosFiltrados)}
          />
          <span>{todosIncluidos ? 'Deseleccionar todos' : 'Seleccionar todos'}</span>
        </label>
        <span className="gi-detalle-servicios__count">{serviciosFiltrados.length} servicios</span>
      </div>

      {/* Aviso de que se está buscando dentro de los bienes de cada servicio */}
      {q && buscandoEnBienes && serviciosFiltrados.length === 0 && (
        <p className="gi-panel-contadores__detalle-hint">Buscando placa en los servicios...</p>
      )}
      {q && !buscandoEnBienes && serviciosFiltrados.length === 0 && (
        <p className="gi-panel-contadores__detalle-hint">Sin coincidencias para “{filtro.trim()}”.</p>
      )}

      {/* Lista de servicios */}
      {serviciosFiltrados.map(({ servicio: s, bienesMatch }: { servicio: any; bienesMatch: any[] | null }) => {
        const incluido = !serviciosExcluidos.includes(s.codigo)
        // Si hay coincidencias de bienes por el filtro, se muestran auto-expandidas.
        const autoExpandidoPorFiltro = !!q && bienesMatch !== null
        const isExpanded = expandido === s.codigo || autoExpandidoPorFiltro
        // Qué bienes pintar: los coincidentes (filtro por placa) o los cargados al expandir.
        const bienesAMostrar = autoExpandidoPorFiltro ? (bienesMatch as any[]) : bienesExpandido
        const cargandoAqui = autoExpandidoPorFiltro ? false : (expandido === s.codigo && cargandoBienes)
        return (
          <div key={s.codigo} className={`gi-detalle-servicios__item-wrap${isExpanded ? ' is-expanded' : ''}`}>
            <div className={`gi-detalle-servicios__item${incluido ? '' : ' is-excluded'}`}>
              <label className="gi-detalle-servicios__item-check" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={incluido} onChange={() => onToggle?.(s.codigo)} />
              </label>
              <div className="gi-detalle-servicios__item-info" onClick={() => handleClickServicio(s.codigo)} style={{ cursor: 'pointer', flex: 1 }}>
                <span className="gi-detalle-servicios__item-nombre">{s.nombre}</span>
                <span className="gi-detalle-servicios__item-codigo">{s.codigo}</span>
              </div>
              <span className="gi-detalle-servicios__item-cantidad" onClick={() => handleClickServicio(s.codigo)} style={{ cursor: 'pointer' }}>
                {autoExpandidoPorFiltro ? (bienesMatch as any[]).length : s.cantidad}
                <span style={{ fontSize: '0.55rem', marginLeft: 3 }}>{isExpanded ? '▲' : '▼'}</span>
              </span>
            </div>
            {/* Bienes expandidos */}
            {isExpanded && (
              <div className="gi-detalle-servicios__bienes">
                {cargandoAqui ? (
                  <p className="gi-panel-contadores__detalle-hint">Cargando bienes...</p>
                ) : bienesAMostrar.length === 0 ? (
                  <p className="gi-panel-contadores__detalle-hint">Sin bienes en este servicio.</p>
                ) : (
                  bienesAMostrar.map((b: any, i: number) => (
                    <div key={`${b.placa}-${i}`} className="gi-grupo__item">
                      <span className="gi-grupo__item-placa">{b.placa}</span>
                      <span className="gi-grupo__item-desc">{b.descripcion || '—'}</span>
                      {(b.responsable || b.nombre_responsable) && <span className="gi-grupo__item-resp">{b.responsable || b.nombre_responsable}</span>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
