import { useMemo, useState, useEffect, lazy, Suspense } from 'react'
import { FaUsersViewfinder, FaArrowsRotate, FaChevronRight, FaAnglesUp, FaAnglesDown } from 'react-icons/fa6'

const SelectorCoordinadorLazy = lazy(() => import('./SelectorCoordinador'))

export interface DetalleCoordinadorProps {
  coordinadorSeleccionado: { nombre: string; cedula: string } | null | undefined
  bienes: any[]
  cargando: boolean
  filtro: string
  placasCubiertas: Set<string>
  onBuscarPorCedula?: (cedula: string) => void
  onLimpiar?: () => void
  /**
   * Modo de presentación amplia (panel central grande). Cuando es true, la
   * lista de bienes por servicio se muestra en una rejilla multi-columna para
   * aprovechar el ancho disponible. Por defecto false (panel derecho angosto).
   */
  grande?: boolean
  /**
   * Callback para actualizar el texto del filtro. Cuando se provee (modo
   * grande), el buscador de bienes se renderiza junto a la lista de bienes.
   */
  onFiltroChange?: (valor: string) => void
  /**
   * Callback para "inventariar" un bien desde el módulo de coordinador. Cuando
   * se provee (modo grande), cada fila muestra un botón Inventariar. El bien se
   * agrega a la Toma de inventario principal.
   */
  onInventariar?: (bien: any) => void
  /** Placas que están en proceso de inventariado (para deshabilitar el botón). */
  inventariando?: Set<string>
}

/**
 * Detalle de Coordinador: buscador + ficha + bienes pendientes agrupados por
 * servicio. Es un componente presentacional (recibe todo por props, sin fetch
 * propio), por lo que se reutiliza tanto en el panel derecho de contadores
 * (modo compacto) como en el panel central (modo `grande`).
 */
export default function DetalleCoordinador({
  coordinadorSeleccionado, bienes, cargando, filtro, placasCubiertas, onBuscarPorCedula, onLimpiar, grande = false, onFiltroChange, onInventariar, inventariando,
}: DetalleCoordinadorProps) {
  // Bienes del coordinador que aún NO han sido inventariados/escaneados → los que faltan.
  const pendientes = useMemo(
    () => bienes.filter((b: any) => !placasCubiertas.has((b.placa || '').trim())),
    [bienes, placasCubiertas]
  )

  // Aplicar filtro de texto sobre los pendientes
  const filtrados = useMemo(() => {
    if (!filtro.trim()) return pendientes
    const q = filtro.toLowerCase()
    return pendientes.filter((b: any) =>
      (b.placa || '').toLowerCase().includes(q) ||
      (b.descripcion || '').toLowerCase().includes(q) ||
      (b.serial || '').toLowerCase().includes(q) ||
      (b.servicio || '').toLowerCase().includes(q) ||
      (b.servicio_nombre || '').toLowerCase().includes(q)
    )
  }, [pendientes, filtro])

  // Agrupar por servicio para mostrar a qué servicio pertenece cada bien
  const grupos = useMemo(() => {
    const map = new Map<string, { nombre: string; bienes: any[] }>()
    for (const b of filtrados) {
      const cod = (b.servicio || 'SIN_CODIGO').trim()
      if (!map.has(cod)) map.set(cod, { nombre: (b.servicio_nombre || '').trim(), bienes: [] })
      map.get(cod)!.bienes.push(b)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtrados])

  // Acordeón por servicio (solo modo grande): Set con los códigos EXPANDIDOS.
  // Por defecto todos abiertos; al cambiar los grupos (nuevo coordinador o
  // filtro) se reinicia para que los servicios resultantes queden visibles.
  const [serviciosAbiertos, setServiciosAbiertos] = useState<Set<string>>(new Set())
  useEffect(() => {
    setServiciosAbiertos(new Set(grupos.map(([codigo]) => codigo)))
  }, [grupos])

  const alternarServicio = (codigo: string) => {
    setServiciosAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(codigo)) next.delete(codigo)
      else next.add(codigo)
      return next
    })
  }
  const expandirTodos = () => setServiciosAbiertos(new Set(grupos.map(([codigo]) => codigo)))
  const plegarTodos = () => setServiciosAbiertos(new Set())
  const todosAbiertos = grupos.length > 0 && serviciosAbiertos.size === grupos.length

  return (
    <div className={`gi-detalle-coord${grande ? ' gi-detalle-coord--grande' : ''}`}>
      {/* Buscador con autocompletado (todos los servicios) */}
      {!coordinadorSeleccionado && (
        grande ? (
          /* Modo grande: estado inicial con zona destacada centrada */
          <div className="gi-coord-inicio">
            <div className="gi-coord-inicio__icono"><FaUsersViewfinder size={36} /></div>
            <h4 className="gi-coord-inicio__titulo">Busque un coordinador</h4>
            <p className="gi-coord-inicio__texto">
              Escriba la cédula o el nombre del coordinador para ver todos los bienes que tiene
              asignados, agrupados por servicio.
            </p>
            <div className="gi-coord-inicio__campo">
              <label className="gi-detalle-coord__label">Coordinador</label>
              <Suspense fallback={<input className="consulta-lateral__filtro-input" placeholder="Cargando..." disabled />}>
                <SelectorCoordinadorLazy
                  valor=""
                  onChange={() => {}}
                  onSeleccionar={(t) => onBuscarPorCedula?.(t.cedula)}
                  placeholder="Cédula o nombre del coordinador..."
                />
              </Suspense>
            </div>
          </div>
        ) : (
          <div className="gi-detalle-coord__buscador">
            <label className="gi-detalle-coord__label">Buscar coordinador</label>
            <Suspense fallback={<input className="consulta-lateral__filtro-input" placeholder="Cargando..." disabled />}>
              <SelectorCoordinadorLazy
                valor=""
                onChange={() => {}}
                onSeleccionar={(t) => onBuscarPorCedula?.(t.cedula)}
                placeholder="Cédula o nombre del coordinador..."
              />
            </Suspense>
          </div>
        )
      )}

      {/* Coordinador seleccionado — ficha destacada */}
      {coordinadorSeleccionado && (
        <div className="gi-coord-ficha">
          <div className="gi-coord-ficha__top">
            <div className="gi-coord-ficha__avatar">
              {coordinadorSeleccionado.nombre.trim().charAt(0).toUpperCase() || '?'}
            </div>
            <div className="gi-coord-ficha__datos">
              <span className="gi-coord-ficha__label">Coordinador</span>
              <span className="gi-coord-ficha__nombre">{coordinadorSeleccionado.nombre}</span>
              <span className="gi-coord-ficha__cc">CC {coordinadorSeleccionado.cedula}</span>
            </div>
            {/* En modo grande el badge de pendientes va inline en esta fila */}
            {grande && !cargando && bienes.length > 0 && (
              <span className="gi-detalle-coord__badge gi-detalle-coord__badge--pend">{pendientes.length} pendiente(s)</span>
            )}
            <button type="button" className="gi-detalle-coord__limpiar" onClick={() => onLimpiar?.()}>
              {grande && <FaArrowsRotate size={13} />}
              Buscar otro coordinador
            </button>
          </div>

          {/* Contador resumen (modo compacto): solo pendientes */}
          {!grande && !cargando && bienes.length > 0 && (
            <div className="gi-detalle-coord__badges">
              <span className="gi-detalle-coord__badge gi-detalle-coord__badge--pend">{pendientes.length} pendiente(s)</span>
            </div>
          )}
        </div>
      )}

      {/* Cargando */}
      {cargando && <p className="gi-panel-contadores__detalle-hint">Cargando bienes...</p>}

      {/* Encabezado de la lista de bienes pendientes + filtro (modo grande) */}
      {coordinadorSeleccionado && !cargando && bienes.length > 0 && (
        <div className="gi-coord-lista__barra">
          <div className="gi-coord-lista__titulo">
            Bienes por inventariar
            <span className="gi-coord-lista__titulo-count">{pendientes.length}</span>
          </div>
          {grande && onFiltroChange && (
            <input
              type="text"
              className="gi-coord-lista__filtro"
              placeholder="Filtrar por placa, serial o descripción..."
              value={filtro}
              onChange={(e) => onFiltroChange(e.target.value)}
            />
          )}
        </div>
      )}

      {/* Resultados agrupados por servicio */}
      {coordinadorSeleccionado && !cargando && pendientes.length > 0 && (
        grupos.length === 0
          ? <p className="gi-panel-contadores__detalle-hint">Sin resultados para el filtro.</p>
          : grande
            /* Modo grande: cada servicio es una SECCIÓN con su tabla de bienes */
            ? (
              <div className="gi-coord-secciones">
                {/* Control para plegar/expandir todos los servicios a la vez */}
                {grupos.length > 1 && (
                  <div className="gi-coord-secciones__barra">
                    <span className="gi-coord-secciones__info">{grupos.length} servicio(s)</span>
                    <button
                      type="button"
                      className="gi-coord-secciones__toggle"
                      onClick={() => (todosAbiertos ? plegarTodos() : expandirTodos())}
                    >
                      {todosAbiertos ? <><FaAnglesUp size={12} /> Plegar todos</> : <><FaAnglesDown size={12} /> Expandir todos</>}
                    </button>
                  </div>
                )}
                {grupos.map(([codigo, grupo]) => {
                  const abierto = serviciosAbiertos.has(codigo)
                  return (
                  <section key={codigo} className={`gi-coord-seccion${abierto ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="gi-coord-seccion__header"
                      onClick={() => alternarServicio(codigo)}
                      aria-expanded={abierto}
                    >
                      <FaChevronRight size={11} className={`gi-coord-seccion__chevron${abierto ? ' is-open' : ''}`} />
                      <span className="gi-coord-seccion__badge-serv">Servicio</span>
                      <span className="gi-coord-seccion__codigo">{codigo}</span>
                      {grupo.nombre && <span className="gi-coord-seccion__nombre">{grupo.nombre}</span>}
                      <span className="gi-coord-seccion__count">{grupo.bienes.length} bien(es)</span>
                    </button>
                    {abierto && (
                    <div className="gi-coord-tabla-wrap">
                      <table className="gi-coord-tabla">
                        <thead>
                          <tr>
                            <th className="gi-coord-tabla__th-placa">Placa</th>
                            <th>Descripción</th>
                            <th className="gi-coord-tabla__th-serial">Serial</th>
                            {onInventariar && <th className="gi-coord-tabla__th-accion">Acción</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.bienes.map((b: any, i: number) => {
                            const placa = (b.placa || '').trim()
                            const enProceso = inventariando?.has(placa) ?? false
                            return (
                              <tr key={`${codigo}-${placa}-${i}`}>
                                <td className="gi-coord-tabla__placa">{b.placa || '—'}</td>
                                <td className="gi-coord-tabla__desc">{b.descripcion || '—'}</td>
                                <td className="gi-coord-tabla__serial">{b.serial || '—'}</td>
                                {onInventariar && (
                                  <td className="gi-coord-tabla__accion">
                                    <button
                                      type="button"
                                      className="gi-coord-inventariar-btn"
                                      disabled={enProceso}
                                      onClick={() => onInventariar(b)}
                                    >
                                      {enProceso ? 'Agregando…' : 'Incluir al inventario'}
                                    </button>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </section>
                  )
                })}
              </div>
            )
            /* Modo compacto (panel derecho): tarjeta por grupo como antes */
            : grupos.map(([codigo, grupo]) => (
              <div key={codigo} className="gi-coord-grupo">
                <div className="gi-coord-grupo__header">
                  <span className="gi-coord-grupo__header-titulo">
                    <strong>{codigo}</strong>
                    {grupo.nombre && <span className="gi-coord-grupo__header-nombre"> · {grupo.nombre}</span>}
                  </span>
                  <span className="gi-coord-grupo__header-count">{grupo.bienes.length}</span>
                </div>
                <div className="gi-coord-grupo__body">
                  {grupo.bienes.map((b: any, i: number) => (
                    <div key={`${codigo}-${b.placa}-${i}`} className="gi-coord-bien">
                      <div className="gi-coord-bien__linea">
                        <span className="gi-coord-bien__campo-label">Placa</span>
                        <span className="gi-coord-bien__placa">{b.placa || '—'}</span>
                      </div>
                      <div className="gi-coord-bien__linea gi-coord-bien__linea--desc">
                        <span className="gi-coord-bien__campo-label">Descrip.</span>
                        <span className="gi-coord-bien__desc">{b.descripcion || '—'}</span>
                      </div>
                      {b.serial && (
                        <div className="gi-coord-bien__linea">
                          <span className="gi-coord-bien__campo-label">Serial</span>
                          <span className="gi-coord-bien__serial">{b.serial}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
      )}

      {/* Todos ya inventariados */}
      {coordinadorSeleccionado && !cargando && bienes.length > 0 && pendientes.length === 0 && (
        <p className="gi-panel-contadores__detalle-hint">Todos los bienes de este coordinador ya fueron inventariados.</p>
      )}

      {/* Sin bienes */}
      {coordinadorSeleccionado && !cargando && bienes.length === 0 && (
        <p className="gi-panel-contadores__detalle-hint">No se encontraron bienes de este coordinador.</p>
      )}
    </div>
  )
}
