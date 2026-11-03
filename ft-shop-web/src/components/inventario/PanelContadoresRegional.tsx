import { useState, useMemo } from 'react'
import { FaArrowLeft, FaChevronDown, FaChevronRight, FaFileExcel } from 'react-icons/fa'
// Iconos fa6 para las mini-cards (mismo estilo que el panel principal).
import { FaBoxOpen, FaCircleCheck, FaTriangleExclamation, FaLayerGroup, FaBell } from 'react-icons/fa6'
import { obtenerObservacionesPendientes, obtenerNotas } from '../../services/observacionesInventarioService'

interface PanelContadoresRegionalProps {
  cargando?: boolean
  totalBienes: number
  totalInventariados: number
  totalFaltantes: number
  totalSobrantes: number
  totalAlertas: number
  obsActivas: number
  bienesEstadoM: number
  // Datos para drill-down Total Bienes
  bienesRegional: any[]
  bienesExcluidos: Set<string>
  bienesInventariados: any[]
  placasYaReportadas: Set<string>
  onExcluirBien?: (placa: string) => void
  onIncluirBien?: (placa: string) => void
  onExcluirTodos?: (placas: string[]) => void
  onIncluirTodos?: () => void
  onExportarBienes?: () => void
  // Datos para drill-down Inventariados
  bienesInventariadosRegional?: any[]
  cargandoInventariados?: boolean
  onClickInventariados?: () => void
  // Datos para drill-down Sobrantes
  servicioSeleccionado?: string
  // Datos para drill-down Alertas
  registrosObsNotas?: any[]
  onIrABien?: (placa: string) => void
}

type NivelDetalle = null | 'total' | 'inventariados' | 'faltantes' | 'sobrantes' | 'alertas'

export default function PanelContadoresRegional({
  cargando = false,
  totalBienes,
  totalInventariados,
  totalFaltantes,
  totalSobrantes,
  totalAlertas,
  obsActivas,
  bienesEstadoM,
  bienesRegional,
  bienesExcluidos,
  bienesInventariados,
  placasYaReportadas,
  onExcluirBien,
  onIncluirBien,
  onExcluirTodos,
  onIncluirTodos,
  onExportarBienes,
  bienesInventariadosRegional = [],
  cargandoInventariados = false,
  onClickInventariados,
  servicioSeleccionado = '',
  registrosObsNotas = [],
  onIrABien,
}: PanelContadoresRegionalProps) {
  const [nivelActivo, setNivelActivo] = useState<NivelDetalle>(null)
  const [filtro, setFiltro] = useState('')

  const handleClick = (nivel: NivelDetalle) => {
    if (nivelActivo === nivel) { setNivelActivo(null); setFiltro(''); return }
    setNivelActivo(nivel)
    setFiltro('')
    if (nivel === 'inventariados') onClickInventariados?.()
  }

  const cerrar = () => { setNivelActivo(null); setFiltro('') }

  // ─── Estado de carga: spinner + skeleton (la mascota vive en el panel central) ───
  if (cargando) {
    return (
      <div className="gi-panel-contadores">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1.25rem 0' }}>
          <span className="gi-contadores-spinner" aria-hidden="true" />
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Cargando contadores...</p>
        </div>
        <div className="gi-contadores-grid" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="gi-contador gi-contadores-skeleton">
              <div className="gi-contador__valor gi-skeleton-bar" style={{ width: '2.2rem' }} />
              <div className="gi-contador__info">
                <div className="gi-contador__label gi-skeleton-bar" style={{ width: '70%' }} />
                <div className="gi-contador__sub gi-skeleton-bar" style={{ width: '45%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Modo expandido: drill-down inline ───
  if (nivelActivo) {
    return (
      <div className="gi-panel-contadores gi-panel-contadores--expandido">
        <div className="gi-panel-contadores__detalle">
          {/* Cabecera: botón volver grande y claro (jerarquía nivel 1) */}
          <div className="gi-reg-header">
            <button type="button" className="gi-reg-back" onClick={cerrar}>
              <FaArrowLeft size={12} />
              <span>Volver a contadores</span>
            </button>
            {/* En niveles distintos de 'total' el título va aquí; en 'total' se
                muestra debajo del filtro (dentro de DetalleTotalBienes). */}
            {nivelActivo !== 'total' && (
              <h3 className="gi-reg-header__titulo">
                {nivelActivo === 'inventariados' && `Bienes inventariados · ${totalInventariados.toLocaleString()}`}
                {nivelActivo === 'faltantes' && `Bienes faltantes · ${totalFaltantes.toLocaleString()}`}
                {nivelActivo === 'sobrantes' && `Fuera de lista · ${totalSobrantes.toLocaleString()}`}
                {nivelActivo === 'alertas' && `Alertas · ${totalAlertas}`}
              </h3>
            )}
          </div>

          {/* El filtro compartido se oculta en 'total': ese detalle renderiza su
              propio filtro DEBAJO de las tabs y la barra de acciones. */}
          {nivelActivo !== 'total' && (
            <div className="gi-panel-contadores__filtro">
              <input
                type="text"
                placeholder="Filtrar por placa, descripción..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="consulta-lateral__filtro-input"
              />
            </div>
          )}

          <div className="gi-panel-contadores__detalle-body">
            {nivelActivo === 'total' && (
              <DetalleTotalBienes
                bienesRegional={bienesRegional}
                bienesExcluidos={bienesExcluidos}
                bienesInventariados={bienesInventariados}
                placasYaReportadas={placasYaReportadas}
                filtro={filtro}
                onFiltroChange={setFiltro}
                onExcluirBien={onExcluirBien}
                onIncluirBien={onIncluirBien}
                onExcluirTodos={onExcluirTodos}
                onIncluirTodos={onIncluirTodos}
                onExportar={onExportarBienes}
              />
            )}
            {nivelActivo === 'inventariados' && (
              <DetalleInventariados
                bienes={bienesInventariadosRegional}
                cargando={cargandoInventariados}
                filtro={filtro}
              />
            )}
            {nivelActivo === 'faltantes' && (
              <DetalleFaltantes
                bienesRegional={bienesRegional}
                bienesExcluidos={bienesExcluidos}
                bienesInventariados={bienesInventariados}
                placasYaReportadas={placasYaReportadas}
                filtro={filtro}
              />
            )}
            {nivelActivo === 'sobrantes' && (
              <DetalleSobrantes
                bienesInventariados={bienesInventariados}
                bienesRegional={bienesRegional}
                bienesExcluidos={bienesExcluidos}
                servicioSeleccionado={servicioSeleccionado}
                filtro={filtro}
              />
            )}
            {nivelActivo === 'alertas' && (
              <DetalleAlertasRegional
                registros={registrosObsNotas}
                bienesEstadoM={bienesInventariados.filter(b => b.estado === 'M').map(b => ({ placa: b.placa, descripcion: b.descripcion, nombre_responsable: b.nombre_responsable }))}
                filtro={filtro}
                onIrABien={onIrABien}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  // Sublabel de alertas (obs / M / OK), mismo criterio que el panel principal.
  const subAlertasReg = `${obsActivas > 0 ? `${obsActivas} obs` : ''}${obsActivas > 0 && bienesEstadoM > 0 ? ' + ' : ''}${bienesEstadoM > 0 ? `${bienesEstadoM} para baja` : ''}${totalAlertas === 0 ? 'OK' : ''}`
  const enSesionReg = bienesInventariados.filter(b => !b.placa.startsWith('SP-') && bienesRegional.some((br: any) => br.placa === b.placa) && !bienesExcluidos.has(b.placa)).length

  // ─── Estado normal: cards en cascada vertical (mismo look que el principal) ───
  return (
    <div className="gi-panel-contadores">
      <div className="gi-stat-cards">
        <button type="button" className="gi-stat-card gi-stat-card--azul" onClick={() => handleClick('total')}>
          <span className="gi-stat-card__icon"><FaBoxOpen size={24} /></span>
          <span className="gi-stat-card__num">{totalBienes.toLocaleString()}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Por inventariar</span>
            <span className="gi-stat-card__sub">del servicio/ubicación</span>
          </span>
        </button>
        <button type="button" className="gi-stat-card gi-stat-card--verde" onClick={() => handleClick('inventariados')}>
          <span className="gi-stat-card__icon"><FaCircleCheck size={24} /></span>
          <span className="gi-stat-card__num">{totalInventariados.toLocaleString()}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Inventariados</span>
            <span className="gi-stat-card__sub">{enSesionReg} en sesión</span>
          </span>
        </button>
        <button type="button" className="gi-stat-card gi-stat-card--naranja" onClick={() => handleClick('faltantes')}>
          <span className="gi-stat-card__icon"><FaTriangleExclamation size={24} /></span>
          <span className="gi-stat-card__num">{totalFaltantes.toLocaleString()}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Faltantes</span>
            <span className="gi-stat-card__sub">por inventariar</span>
          </span>
        </button>
        <button type="button" className="gi-stat-card gi-stat-card--morado" onClick={() => handleClick('sobrantes')}>
          <span className="gi-stat-card__icon"><FaLayerGroup size={24} /></span>
          <span className="gi-stat-card__num">{totalSobrantes.toLocaleString()}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Novedades</span>
            <span className="gi-stat-card__sub">Bienes que no coinciden con el filtro digitado</span>
          </span>
        </button>
        <button type="button" className="gi-stat-card gi-stat-card--rojo" onClick={() => handleClick('alertas')}>
          <span className="gi-stat-card__icon"><FaBell size={24} /></span>
          <span className="gi-stat-card__num">{totalAlertas}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Alertas</span>
            <span className="gi-stat-card__sub">{subAlertasReg}</span>
          </span>
        </button>
      </div>
    </div>
  )
}


/* ── Sub-componente: Total Bienes con tabs incluidos/excluidos ── */
function DetalleTotalBienes({ bienesRegional, bienesExcluidos, bienesInventariados, placasYaReportadas, filtro, onFiltroChange, onExcluirBien, onIncluirBien, onExcluirTodos, onExportar }: {
  bienesRegional: any[]
  bienesExcluidos: Set<string>
  bienesInventariados: any[]
  placasYaReportadas: Set<string>
  filtro: string
  onFiltroChange?: (v: string) => void
  onExcluirBien?: (placa: string) => void
  onIncluirBien?: (placa: string) => void
  onExcluirTodos?: (placas: string[]) => void
  onIncluirTodos?: () => void
  onExportar?: () => void
}) {
  const [tab, setTab] = useState<'incluidos' | 'excluidos'>('incluidos')
  // Confirmación antes de quitar del inventario los bienes visibles.
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)
  // Confirmación antes de excluir UN bien concreto (clic en su checkbox).
  const [confirmarQuitarUno, setConfirmarQuitarUno] = useState<{ placa: string; descripcion: string } | null>(null)

  const bienesFiltrados = useMemo(() => {
    const lista = tab === 'incluidos'
      ? bienesRegional.filter(b => !bienesExcluidos.has(b.placa))
      : bienesRegional.filter(b => bienesExcluidos.has(b.placa))
    if (!filtro.trim()) return lista
    const q = filtro.toLowerCase()
    return lista.filter((b: any) =>
      (b.placa || '').toLowerCase().includes(q) ||
      (b.descripcion || '').toLowerCase().includes(q) ||
      (b.responsable || '').toLowerCase().includes(q) ||
      (b.cedula || '').includes(q)
    )
  }, [bienesRegional, bienesExcluidos, filtro, tab])

  // Los totales se cuentan sobre las placas ÚNICAS que REALMENTE existen en la
  // lista actual (bienesRegional). Antes se usaba bienesExcluidos.size, que podía
  // incluir placas "fantasma" (exclusiones persistidas o auto-excluidos de otra
  // sesión que ya no están en la lista), inflando "Excluidos" (108) frente a lo
  // que realmente se ve en la pestaña (~50).
  const { totalIncluidos, totalExcluidos } = useMemo(() => {
    const placasUnicas = new Set<string>()
    for (const b of bienesRegional) {
      const p = (b.placa || '').trim()
      if (p) placasUnicas.add(p)
    }
    let inc = 0, exc = 0
    for (const p of placasUnicas) {
      if (bienesExcluidos.has(p)) exc++
      else inc++
    }
    return { totalIncluidos: inc, totalExcluidos: exc }
  }, [bienesRegional, bienesExcluidos])

  // Placas ÚNICAS que se quitarían con la acción "Quitar del inventario":
  // las visibles en la pestaña "incluidos" (respetando el filtro), sin repetir.
  // Se usa tanto para el número del botón/modal como para la acción, de modo que
  // el conteo mostrado y lo que realmente se excluye siempre coincidan.
  const placasAQuitar = useMemo(() => {
    if (tab !== 'incluidos') return [] as string[]
    return Array.from(new Set(bienesFiltrados.map(b => (b.placa || '').trim()).filter(Boolean)))
  }, [bienesFiltrados, tab])

  return (
    <div className="gi-detalle-lista">
      {/* Tabs */}
      <div className="gi-reg-tabs">
        <button
          type="button"
          className={`gi-reg-tab gi-reg-tab--incluidos${tab === 'incluidos' ? ' is-active' : ''}`}
          onClick={() => setTab('incluidos')}
        >
          A inventariar
          <span className="gi-reg-tab__count">{totalIncluidos}</span>
        </button>
        <button
          type="button"
          className={`gi-reg-tab gi-reg-tab--excluidos${tab === 'excluidos' ? ' is-active' : ''}${totalExcluidos > 0 ? ' has-items' : ''}`}
          onClick={() => setTab('excluidos')}
        >
          Excluidos
          <span className="gi-reg-tab__count">{totalExcluidos}</span>
        </button>
      </div>

      {/* Barra de acciones (Exportar / Quitar del inventario) centrada.
          El total se muestra en el título de la lista, no se repite aquí. */}
      <div className="gi-reg-acciones">
        {tab === 'incluidos' && totalIncluidos > 0 && onExportar && (
          <button type="button" className="gi-reg-accion gi-reg-accion--excel" title="Exportar a Excel los bienes a inventariar" onClick={() => onExportar()}>
            <FaFileExcel size={12} /> Exportar
          </button>
        )}
        {tab === 'incluidos' && placasAQuitar.length > 0 && (
          <button
            type="button"
            className="gi-reg-accion gi-reg-accion--quitar"
            title="Quita de la lista de inventario los bienes que se están mostrando"
            onClick={() => setConfirmarQuitar(true)}
          >
            Quitar del inventario ({placasAQuitar.length})
          </button>
        )}

      </div>

      {/* Filtro: debajo de las acciones */}
      <div className="gi-panel-contadores__filtro" style={{ marginBottom: '0.6rem' }}>
        <input
          type="text"
          placeholder="Filtrar por placa, descripción..."
          value={filtro}
          onChange={(e) => onFiltroChange?.(e.target.value)}
          className="consulta-lateral__filtro-input"
        />
      </div>

      {/* Título de la lista: debajo del filtro (jerarquía) */}
      <div className="gi-reg-lista-titulo">
        <span className="gi-reg-lista-titulo__label">
          {tab === 'incluidos' ? 'Bienes por inventariar' : 'Bienes excluidos'}
        </span>
        <span className="gi-reg-lista-titulo__num">
          {filtro.trim()
            ? `${tab === 'incluidos' ? placasAQuitar.length : bienesFiltrados.length} de ${tab === 'incluidos' ? totalIncluidos : totalExcluidos}`
            : (tab === 'incluidos' ? totalIncluidos : totalExcluidos)}
        </span>
      </div>

      {/* Modal de confirmación para excluir UN bien concreto */}
      {confirmarQuitarUno && (
        <div className="gi-reg-confirm__backdrop" onClick={() => setConfirmarQuitarUno(null)}>
          <div className="gi-reg-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="gi-reg-confirm__icon">⚠️</div>
            <h4 className="gi-reg-confirm__title">Excluir del inventario</h4>
            <p className="gi-reg-confirm__text">
              Se quitará el bien <strong>{confirmarQuitarUno.placa}</strong>
              {confirmarQuitarUno.descripcion ? ` (${confirmarQuitarUno.descripcion})` : ''} de la lista a inventariar.
              Pasará a la pestaña <strong>Excluidos</strong> y podrás volver a incluirlo cuando quieras. ¿Deseas continuar?
            </p>
            <div className="gi-reg-confirm__actions">
              <button type="button" className="gi-reg-confirm__btn gi-reg-confirm__btn--cancel" onClick={() => setConfirmarQuitarUno(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="gi-reg-confirm__btn gi-reg-confirm__btn--danger"
                onClick={() => { onExcluirBien?.(confirmarQuitarUno.placa); setConfirmarQuitarUno(null) }}
              >
                Sí, excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para quitar del inventario */}
      {confirmarQuitar && (
        <div className="gi-reg-confirm__backdrop" onClick={() => setConfirmarQuitar(false)}>
          <div className="gi-reg-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="gi-reg-confirm__icon">⚠️</div>
            <h4 className="gi-reg-confirm__title">Quitar del inventario</h4>
            <p className="gi-reg-confirm__text">
              Se quitarán <strong>{placasAQuitar.length}</strong> bien{placasAQuitar.length === 1 ? '' : 'es'} de la lista a inventariar
              {filtro.trim() ? ' (los que coinciden con el filtro actual)' : ''}. Pasarán a la pestaña <strong>Excluidos</strong>
              {' '}y podrás volver a incluirlos cuando quieras. ¿Deseas continuar?
            </p>
            <div className="gi-reg-confirm__actions">
              <button type="button" className="gi-reg-confirm__btn gi-reg-confirm__btn--cancel" onClick={() => setConfirmarQuitar(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="gi-reg-confirm__btn gi-reg-confirm__btn--danger"
                onClick={() => { onExcluirTodos?.(placasAQuitar); setConfirmarQuitar(false) }}
              >
                Sí, quitar {placasAQuitar.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {bienesFiltrados.length === 0 ? (
        <p className="gi-panel-contadores__detalle-hint">{tab === 'incluidos' ? 'No hay bienes.' : 'No hay bienes excluidos.'}</p>
      ) : (
        bienesFiltrados.map((b: any, i: number) => {
          const yaInventariado = bienesInventariados.some(bi => bi.placa === b.placa)
          const yaReportado = placasYaReportadas.has(b.placa)
          const incluido = tab === 'incluidos'
          return (
            <label key={`${b.placa}-${i}`} className={`gi-reg-bien${(yaInventariado || yaReportado) ? ' is-ok' : ''}${incluido ? ' is-incluido' : ' is-excluido'}`}>
              <input
                type="checkbox"
                className="gi-reg-bien__check"
                checked={incluido}
                onChange={() => incluido
                  ? setConfirmarQuitarUno({ placa: b.placa, descripcion: b.descripcion || '' })
                  : onIncluirBien?.(b.placa)}
              />
              <span className="gi-reg-bien__box" aria-hidden="true" />
              <span className="gi-reg-bien__info">
                <span className="gi-reg-bien__placa">
                  {b.placa}
                  {(yaInventariado || yaReportado) && <span className="gi-reg-bien__ok" title="Ya inventariado/reportado">✓</span>}
                </span>
                <span className="gi-reg-bien__desc">{b.descripcion || '—'}</span>
              </span>
            </label>
          )
        })
      )}
    </div>
  )
}


/* ── Sub-componente: Detalle Inventariados (agrupado por servicio) ── */
function DetalleInventariados({ bienes, cargando, filtro }: {
  bienes: any[]
  cargando: boolean
  filtro: string
}) {
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())

  const filtrados = useMemo(() => {
    if (!filtro.trim()) return bienes
    const q = filtro.toLowerCase()
    return bienes.filter((b: any) =>
      (b.placa || '').toLowerCase().includes(q) ||
      (b.descripcion || '').toLowerCase().includes(q) ||
      (b.responsable || '').toLowerCase().includes(q) ||
      (b.cedula || '').includes(q) ||
      (b.servicio_nombre || '').toLowerCase().includes(q)
    )
  }, [bienes, filtro])

  const grupos = useMemo(() => {
    const mapa = new Map<string, { codigo: string; nombre: string; bienes: any[]; esSobrante: boolean }>()
    for (const b of filtrados) {
      const key = b.servicio_codigo || 'SIN_SERVICIO'
      if (!mapa.has(key)) mapa.set(key, { codigo: key, nombre: b.servicio_nombre || 'Sin servicio', bienes: [], esSobrante: !!b.es_sobrante })
      mapa.get(key)!.bienes.push(b)
    }
    return Array.from(mapa.values()).sort((a, b) => {
      if (a.esSobrante !== b.esSobrante) return a.esSobrante ? 1 : -1
      return b.bienes.length - a.bienes.length
    })
  }, [filtrados])

  const toggleGrupo = (codigo: string) => {
    setColapsados(prev => { const n = new Set(prev); if (n.has(codigo)) n.delete(codigo); else n.add(codigo); return n })
  }

  if (cargando) return <p className="gi-panel-contadores__detalle-hint">Cargando...</p>
  if (bienes.length === 0) return <p className="gi-panel-contadores__detalle-hint">No hay bienes inventariados aún.</p>

  return (
    <div className="gi-detalle-lista">
      <div className="gi-detalle-lista__count">
        {filtrados.length}{filtro ? ` de ${bienes.length}` : ''} bienes · {grupos.length} grupo{grupos.length !== 1 ? 's' : ''}
      </div>

      {grupos.map((grupo) => {
        const isCollapsed = colapsados.has(grupo.codigo)
        const tipoGrupo = grupo.esSobrante ? 'faltante' : 'inventariado'
        return (
          <div key={grupo.codigo} className="gi-grupo">
            <button type="button" className={`gi-grupo__header gi-grupo__header--${tipoGrupo}`} onClick={() => toggleGrupo(grupo.codigo)}>
              <span className="gi-grupo__chevron">{isCollapsed ? <FaChevronRight size={8} /> : <FaChevronDown size={8} />}</span>
              <span className="gi-grupo__nombre">{grupo.nombre}</span>
              <span className="gi-grupo__codigo">{grupo.codigo}</span>
              {grupo.esSobrante && <span style={{ fontSize: '0.6rem', background: '#f3e5f5', color: '#7b1fa2', padding: '0.1rem 0.3rem', borderRadius: '3px', fontWeight: 700 }}>SOBRANTE</span>}
              <span className="gi-grupo__badge">{grupo.bienes.length}</span>
            </button>
            {!isCollapsed && (
              <div className="gi-grupo__body">
                {grupo.bienes.map((b: any, i: number) => (
                  <div key={`${b.placa}-${i}`} className="gi-grupo__item">
                    <span className="gi-grupo__item-placa">{b.placa}</span>
                    <span className="gi-grupo__item-desc">{b.descripcion || '—'}</span>
                    {(b.responsable || b.nombre_responsable) && (
                      <span className="gi-grupo__item-resp">{b.responsable || b.nombre_responsable}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


/* ── Sub-componente: Detalle Faltantes (bienes no inventariados) ── */
function DetalleFaltantes({ bienesRegional, bienesExcluidos, bienesInventariados, placasYaReportadas, filtro }: {
  bienesRegional: any[]
  bienesExcluidos: Set<string>
  bienesInventariados: any[]
  placasYaReportadas: Set<string>
  filtro: string
}) {
  const faltantes = useMemo(() => {
    return bienesRegional.filter(b =>
      !bienesExcluidos.has(b.placa) &&
      !bienesInventariados.some(bi => bi.placa === b.placa) &&
      !placasYaReportadas.has(b.placa)
    )
  }, [bienesRegional, bienesExcluidos, bienesInventariados, placasYaReportadas])

  const filtrados = useMemo(() => {
    if (!filtro.trim()) return faltantes
    const q = filtro.toLowerCase()
    return faltantes.filter((b: any) =>
      (b.placa || '').toLowerCase().includes(q) ||
      (b.descripcion || '').toLowerCase().includes(q) ||
      (b.responsable || '').toLowerCase().includes(q) ||
      (b.cedula || '').includes(q)
    )
  }, [faltantes, filtro])

  if (faltantes.length === 0) return <p className="gi-panel-contadores__detalle-hint" style={{ color: '#2e7d32' }}>Todos los bienes han sido inventariados.</p>

  return (
    <div className="gi-detalle-lista">
      <div className="gi-detalle-lista__count">{filtrados.length}{filtro ? ` de ${faltantes.length}` : ''} bienes faltantes</div>
      {filtrados.map((b: any, i: number) => (
        <div key={`${b.placa}-${i}`} className="gi-grupo__item">
          <span className="gi-grupo__item-placa">{b.placa}</span>
          <span className="gi-grupo__item-desc">{b.descripcion || '—'}</span>
          {b.responsable && <span className="gi-grupo__item-resp">{b.responsable}</span>}
        </div>
      ))}
    </div>
  )
}


/* ── Sub-componente: Detalle Sobrantes ── */
function DetalleSobrantes({ bienesInventariados, bienesRegional, bienesExcluidos, servicioSeleccionado, filtro }: {
  bienesInventariados: any[]
  bienesRegional: any[]
  bienesExcluidos: Set<string>
  servicioSeleccionado: string
  filtro: string
}) {
  const sobrantes = useMemo(() => {
    return bienesInventariados.filter(b =>
      !b.placa.startsWith('SP-') &&
      (!bienesRegional.some((br: any) => br.placa === b.placa) || bienesExcluidos.has(b.placa))
    )
  }, [bienesInventariados, bienesRegional, bienesExcluidos])

  const filtrados = useMemo(() => {
    if (!filtro.trim()) return sobrantes
    const q = filtro.toLowerCase()
    return sobrantes.filter((b: any) =>
      (b.placa || '').toLowerCase().includes(q) ||
      (b.descripcion || '').toLowerCase().includes(q) ||
      (b.nombre_responsable || '').toLowerCase().includes(q) ||
      (b.servicio || '').toLowerCase().includes(q)
    )
  }, [sobrantes, filtro])

  if (sobrantes.length === 0) return <p className="gi-panel-contadores__detalle-hint">No hay bienes fuera de lista.</p>

  return (
    <div className="gi-detalle-lista">
      <p style={{ fontSize: '0.72rem', color: '#5c6474', margin: '0 0 0.5rem' }}>
        Bienes escaneados que <strong>no estaban</strong> en la lista de este servicio/ubicación{servicioSeleccionado ? ` (${servicioSeleccionado})` : ''}.
      </p>
      <div className="gi-detalle-lista__count">{filtrados.length}{filtro ? ` de ${sobrantes.length}` : ''} fuera de lista</div>
      {filtrados.map((b: any, i: number) => (
        <div key={`${b.placa}-${i}`} className="gi-grupo__item" style={{ borderLeft: '3px solid #9c27b0' }}>
          <span className="gi-grupo__item-placa">{b.placa}</span>
          <span className="gi-grupo__item-desc">{b.descripcion || '—'}</span>
          <span className="gi-grupo__item-resp" style={{ color: '#9c27b0', fontWeight: 600 }}>{b.servicio || 'Desconocido'}</span>
        </div>
      ))}
    </div>
  )
}


/* ── Sub-componente: Detalle Alertas Regional (obs + notas + estado M) ── */
function DetalleAlertasRegional({ registros, bienesEstadoM, filtro, onIrABien }: {
  registros: any[]
  bienesEstadoM: { placa: string; descripcion: string; nombre_responsable?: string }[]
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

      <div className="gi-alertas__body">
        {tab === 'obs' && (
          obsFiltradas.length === 0
            ? <p className="gi-panel-contadores__detalle-hint">{observaciones.length === 0 ? 'Sin observaciones pendientes' : 'Sin resultados'}</p>
            : obsFiltradas.map(obs => (
              <div key={obs.id} className="gi-alertas__item gi-alertas__item--obs" onClick={() => onIrABien?.(obs.placa)}>
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
              <div key={nota.id} className="gi-alertas__item gi-alertas__item--nota" onClick={() => onIrABien?.(nota.placa)}>
                <div className="gi-alertas__item-top">
                  <span className="gi-alertas__item-placa gi-alertas__item-placa--nota">{nota.placa}</span>
                  <span className="gi-alertas__item-fecha">{new Date(nota.fechaCreacion).toLocaleDateString('es-CO')}</span>
                </div>
                <p className="gi-alertas__item-texto">{nota.texto}</p>
              </div>
            ))
        )}

        {tab === 'estado-m' && (
          estadoMFiltrados.length === 0
            ? <p className="gi-panel-contadores__detalle-hint">{bienesEstadoM.length === 0 ? 'Sin bienes para baja' : 'Sin resultados'}</p>
            : estadoMFiltrados.map((b, i) => {
              const motivo = motivoPorPlaca[(b.placa || '').trim()] || ''
              return (
                <div key={i} className="gi-alertas__item gi-alertas__item--m" onClick={() => onIrABien?.(b.placa)}>
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
