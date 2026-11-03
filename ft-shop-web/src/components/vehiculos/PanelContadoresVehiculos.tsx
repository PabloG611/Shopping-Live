/**
 * Panel de contadores contextual para el módulo de Vehículos.
 * - Vista lista: cards clicables (estilo gi-stat-card de inventario principal/
 *   regional). Al pulsar una card se abre un detalle in-panel con la LISTA real
 *   de vehículos (cuáles están inventariados, cuáles faltan, cuáles en proceso),
 *   con filtro por placa/descripción y botón "Volver a contadores".
 *   Si todavía no se ha cargado un servicio, muestra un estado vacío que invita
 *   a seleccionar/buscar uno (en vez de mostrar ceros sin contexto).
 * - Vista checklist: muestra progreso del vehículo actual (items, fotos, paso).
 *
 * Los contadores se adaptan solos al servicio: las listas vienen de los
 * vehículos efectivamente cargados (Bogotá = placas asignadas; resto de
 * regionales = flota completa del servicio), así que el "total" ya es el
 * universo de trabajo correcto para cada caso.
 */

import { useState } from 'react'
import { FaArrowLeft, FaMagnifyingGlass } from 'react-icons/fa6'
import { FaCarSide, FaCircleCheck, FaTriangleExclamation, FaUserClock } from 'react-icons/fa6'
import type { Vehiculo } from '../../services/vehiculosService'
import type { VehiculoContador } from './InventarioVehiculos'
import BuscarVehiculoPorPlaca from './BuscarVehiculoPorPlaca'

type NivelDetalle = null | 'todos' | 'inventariados' | 'pendientes' | 'enProceso' | 'buscarPlaca'

interface PanelContadoresVehiculosProps {
  vista: 'lista' | 'checklist' | 'historial'
  cargando?: boolean
  // Datos de lista
  totalVehiculos: number
  inventariados: number
  bloqueados: number
  listaInventariados?: Vehiculo[]
  listaPendientes?: Vehiculo[]
  listaEnProceso?: VehiculoContador[]
  servicioCargado?: boolean
  // Datos de checklist (cuando está inventariando)
  vehiculoPlaca?: string
  checklistProgreso?: { completados: number; total: number }
  fotosProgreso?: { tomadas: number; total: number }
  pasoActual?: number
}

export default function PanelContadoresVehiculos({
  vista,
  cargando = false,
  totalVehiculos,
  inventariados,
  bloqueados,
  listaInventariados = [],
  listaPendientes = [],
  listaEnProceso = [],
  servicioCargado = false,
  vehiculoPlaca,
  checklistProgreso,
  fotosProgreso,
  pasoActual,
}: PanelContadoresVehiculosProps) {

  const [nivelActivo, setNivelActivo] = useState<NivelDetalle>(null)
  const [filtro, setFiltro] = useState('')

  // Buscar por placa: consulta PUNTUAL, disponible SIEMPRE en la vista lista
  // (incluso sin servicio cargado), porque no depende de la flota cargada.
  if (vista === 'lista' && nivelActivo === 'buscarPlaca') {
    return <BuscarVehiculoPorPlaca onVolver={() => setNivelActivo(null)} />
  }

  // Estado de carga (solo en vista lista): mismo spinner + skeleton del regional
  if (cargando && vista === 'lista') {
    return (
      <div className="gi-panel-contadores">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1.25rem 0' }}>
          <span className="gi-contadores-spinner" aria-hidden="true" />
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Cargando contadores...</p>
        </div>
        <div className="gi-stat-cards" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
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

  if (vista === 'historial') {
    return (
      <div className="gi-panel-contadores" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '1rem' }}>
          Seleccione un inventario del historial para ver detalles.
        </p>
      </div>
    )
  }

  if (vista === 'checklist' && vehiculoPlaca) {
    const itemsPct = checklistProgreso ? Math.round((checklistProgreso.completados / checklistProgreso.total) * 100) : 0
    const fotosPct = fotosProgreso ? Math.round((fotosProgreso.tomadas / fotosProgreso.total) * 100) : 0

    return (
      <div className="gi-panel-contadores">
        <div style={{ padding: '0.5rem 0' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
            Progreso · {vehiculoPlaca}
          </div>

          {/* Paso actual */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem' }}>
            {[1, 2, 3].map(p => (
              <div key={p} style={{ flex: 1, height: '4px', borderRadius: '2px', background: (pasoActual ?? 1) >= p ? '#0f172a' : '#e2e8f0', transition: 'background 0.3s' }} />
            ))}
          </div>

          {/* Checklist progress */}
          <div className="gi-contador gi-contador--azul" style={{ cursor: 'default', marginBottom: '8px' }}>
            <div className="gi-contador__valor" style={{ fontSize: '1.1rem' }}>{itemsPct}%</div>
            <div className="gi-contador__info">
              <div className="gi-contador__label">Checklist</div>
              <div className="gi-contador__sub">{checklistProgreso?.completados ?? 0}/{checklistProgreso?.total ?? 0} items</div>
            </div>
          </div>

          {/* Fotos progress */}
          <div className="gi-contador gi-contador--verde" style={{ cursor: 'default', marginBottom: '8px' }}>
            <div className="gi-contador__valor" style={{ fontSize: '1.1rem' }}>{fotosProgreso?.tomadas ?? 0}/{fotosProgreso?.total ?? 0}</div>
            <div className="gi-contador__info">
              <div className="gi-contador__label">Fotos</div>
              <div className="gi-contador__sub">{fotosPct}% completado</div>
            </div>
          </div>

          {/* Paso label */}
          <div className="gi-contador gi-contador--gris" style={{ cursor: 'default' }}>
            <div className="gi-contador__valor" style={{ fontSize: '1rem' }}>{pasoActual ?? 1}/3</div>
            <div className="gi-contador__info">
              <div className="gi-contador__label">{pasoActual === 1 ? 'Checklist' : pasoActual === 2 ? 'Fotos' : 'Resumen'}</div>
              <div className="gi-contador__sub">Paso actual</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Vista lista ──────────────────────────────────────────────────────────

  // (B) Estado vacío: aún no se ha cargado un servicio. Avisamos en vez de
  // mostrar "Vehículos: 0 / Pendientes: 0" (que confunde al usuario).
  if (!servicioCargado) {
    return (
      <div className="gi-panel-contadores">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.9rem', padding: '2.5rem 1.25rem' }}>
          <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1565c0' }}>
            <FaCarSide size={30} />
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#334155', lineHeight: 1.35 }}>
            Aún no hay un servicio cargado
          </p>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5, maxWidth: 230 }}>
            Selecciona un servicio o regional y pulsa <strong>Cargar vehículos</strong> para ver los contadores aquí.
          </p>
          {/* La búsqueda por placa NO necesita servicio cargado: es puntual. */}
          <button
            type="button"
            className="gi-stat-card gi-stat-card--azul"
            onClick={() => setNivelActivo('buscarPlaca')}
            style={{ marginTop: '0.5rem', width: '100%', maxWidth: 260 }}
            title="Buscar un vehículo puntual por su placa"
          >
            <span className="gi-stat-card__icon"><FaMagnifyingGlass size={16} /></span>
            <span className="gi-stat-card__texto">
              <span className="gi-stat-card__label">Buscar por placa</span>
              <span className="gi-stat-card__sub">Consulta puntual de un vehículo</span>
            </span>
          </button>
        </div>
      </div>
    )
  }

  const pendientes = Math.max(0, totalVehiculos - inventariados)
  const pct = totalVehiculos > 0 ? Math.round((inventariados / totalVehiculos) * 100) : 0

  const handleClick = (nivel: Exclude<NivelDetalle, null>) => {
    if (nivelActivo === nivel) { setNivelActivo(null); setFiltro(''); return }
    setNivelActivo(nivel)
    setFiltro('')
  }

  const cerrar = () => { setNivelActivo(null); setFiltro('') }

  // ── Detalle in-panel: lista de placas del contador seleccionado ──
  // (buscarPlaca se maneja en su propio early return arriba; aquí solo niveles de lista)
  if (nivelActivo && nivelActivo !== 'buscarPlaca') {
    const nivelLista = nivelActivo // 'todos' | 'inventariados' | 'pendientes' | 'enProceso'
    const datos: { titulo: string; vehiculos: VehiculoContador[]; vacio: string } = (() => {
      switch (nivelLista) {
        case 'todos':
          return { titulo: `Vehículos del servicio · ${totalVehiculos}`, vehiculos: [...listaInventariados, ...listaPendientes], vacio: 'No hay vehículos cargados.' }
        case 'inventariados':
          return { titulo: `Inventariados · ${inventariados}`, vehiculos: listaInventariados, vacio: 'Aún no hay vehículos inventariados.' }
        case 'pendientes':
          return { titulo: `Pendientes · ${pendientes}`, vehiculos: listaPendientes, vacio: '¡No quedan vehículos pendientes!' }
        case 'enProceso':
          return { titulo: `En proceso · ${bloqueados}`, vehiculos: listaEnProceso, vacio: 'Ningún vehículo en proceso por otro usuario.' }
      }
    })()

    // Color del badge de placa según el nivel abierto.
    const badgeTema: Record<'todos' | 'inventariados' | 'pendientes' | 'enProceso', { bg: string; fg: string }> = {
      todos: { bg: '#e0edff', fg: '#1565c0' },
      inventariados: { bg: '#dcfce7', fg: '#15803d' },
      pendientes: { bg: '#fef3c7', fg: '#b45309' },
      enProceso: { bg: '#fee2e2', fg: '#dc2626' },
    }
    const tema = badgeTema[nivelLista]

    const q = filtro.trim().toLowerCase()
    const filtrados = q
      ? datos.vehiculos.filter(v =>
          (v.placa || '').toLowerCase().includes(q) ||
          (v.descripcion || '').toLowerCase().includes(q) ||
          (v.responsable_nombre || '').toLowerCase().includes(q) ||
          (v.responsable_cedula || '').includes(q))
      : datos.vehiculos

    return (
      <div className="gi-panel-contadores gi-panel-contadores--expandido">
        <div className="gi-panel-contadores__detalle">
          <div className="gi-reg-header">
            <button type="button" className="gi-reg-back" onClick={cerrar}>
              <FaArrowLeft size={13} />
              <span>Volver a contadores</span>
            </button>
          </div>

          <h3 className="gi-panel-contadores__detalle-titulo">{datos.titulo}</h3>

          {/* (D) Filtro compacto con icono de lupa */}
          <div className="gi-panel-contadores__filtro">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <FaMagnifyingGlass
                size={12}
                style={{ position: 'absolute', left: 10, color: '#94a3b8', pointerEvents: 'none' }}
              />
              <input
                type="text"
                placeholder="Filtrar por placa, descripción..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="consulta-lateral__filtro-input"
                style={{ paddingLeft: 30, paddingRight: filtro ? 30 : undefined, width: '100%' }}
              />
              {filtro && (
                <button
                  type="button"
                  onClick={() => setFiltro('')}
                  title="Limpiar filtro"
                  aria-label="Limpiar filtro"
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    width: 20, height: 20, borderRadius: '50%',
                    border: 'none', background: '#e2e8f0', color: '#475569',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '0.7rem', lineHeight: 1, padding: 0,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Lista */}
          <div className="gi-panel-contadores__detalle-body">
            {datos.vehiculos.length === 0
              ? <p className="gi-panel-contadores__detalle-hint">{datos.vacio}</p>
              : (
                <div className="gi-detalle-lista">
                  <div className="gi-detalle-lista__count">
                    {filtrados.length}{filtro ? ` de ${datos.vehiculos.length}` : ''} vehículo{datos.vehiculos.length === 1 ? '' : 's'}
                  </div>
                  <div className="gi-grupo__body">
                    {filtrados.map((v, i) => (
                      <div
                        key={`${v.placa}-${i}`}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 3,
                          padding: '8px 10px', marginBottom: 6,
                          background: '#fff', border: '1px solid #eef2f6', borderRadius: 8,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            display: 'inline-block', padding: '3px 8px', borderRadius: 5,
                            background: tema.bg, color: tema.fg,
                            fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.02em',
                          }}>
                            {v.placa}
                          </span>
                          <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.descripcion || '—'}
                          </span>
                        </div>
                        {v.responsable_nombre && (
                          <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                            Resp. {v.responsable_nombre}{v.responsable_cedula ? ` · ${v.responsable_cedula}` : ''}
                          </span>
                        )}
                        {nivelActivo === 'enProceso' && v.bloqueadoPor && (
                          <span style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 600 }}>
                            Inventariando: {v.bloqueadoPor}
                          </span>
                        )}
                      </div>
                    ))}
                    {filtrados.length === 0 && (
                      <p className="gi-panel-contadores__detalle-hint">Sin resultados para "{filtro}".</p>
                    )}
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    )
  }

  // ── Vista de cards (contadores) ──
  return (
    <div className="gi-panel-contadores">
      <div className="gi-stat-cards">
        <button
          type="button"
          className="gi-stat-card gi-stat-card--azul"
          onClick={() => handleClick('todos')}
          title="Ver todos los vehículos del servicio"
        >
          <span className="gi-stat-card__icon"><FaCarSide size={18} /></span>
          <span className="gi-stat-card__num">{totalVehiculos}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Vehículos</span>
            <span className="gi-stat-card__sub">En el servicio</span>
          </span>
        </button>

        <button
          type="button"
          className="gi-stat-card gi-stat-card--verde"
          onClick={() => handleClick('inventariados')}
          title="Ver vehículos ya inventariados"
        >
          <span className="gi-stat-card__icon"><FaCircleCheck size={18} /></span>
          <span className="gi-stat-card__num">{inventariados}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Inventariados</span>
            <span className="gi-stat-card__sub">{pct}% completado</span>
          </span>
        </button>

        {/* (C) Pendientes resaltada: es la card accionable clave */}
        <button
          type="button"
          className="gi-stat-card gi-stat-card--naranja"
          onClick={() => handleClick('pendientes')}
          title="Ver cuáles vehículos faltan por inventariar"
          style={pendientes > 0 ? { background: '#fffbeb', borderColor: '#fcd9b0' } : undefined}
        >
          <span className="gi-stat-card__icon"><FaTriangleExclamation size={18} /></span>
          <span className="gi-stat-card__num">{pendientes}</span>
          <span className="gi-stat-card__texto">
            <span className="gi-stat-card__label">Pendientes</span>
            <span className="gi-stat-card__sub" style={pendientes > 0 ? { color: '#b45309', fontWeight: 600 } : undefined}>
              {pendientes > 0 ? '👆 Toca para ver cuáles faltan' : 'Nada pendiente'}
            </span>
          </span>
        </button>

        {bloqueados > 0 && (
          <button
            type="button"
            className="gi-stat-card gi-stat-card--rojo"
            onClick={() => handleClick('enProceso')}
            title="Ver vehículos que otro usuario está inventariando"
          >
            <span className="gi-stat-card__icon"><FaUserClock size={18} /></span>
            <span className="gi-stat-card__num">{bloqueados}</span>
            <span className="gi-stat-card__texto">
              <span className="gi-stat-card__label">En proceso</span>
              <span className="gi-stat-card__sub">Otro usuario</span>
            </span>
          </button>
        )}

        {/* Buscar por placa: consulta puntual de cualquier vehículo. */}
        <button
          type="button"
          className="gi-stat-card gi-stat-card--azul"
          onClick={() => setNivelActivo('buscarPlaca')}
          title="Buscar un vehículo puntual por su placa"
        >
          <span className="gi-stat-card__icon"><FaMagnifyingGlass size={18} /></span>
          <span className="gi-stat-card__texto" style={{ alignItems: 'flex-start' }}>
            <span className="gi-stat-card__label">Buscar por placa</span>
            <span className="gi-stat-card__sub">Consulta puntual</span>
          </span>
        </button>
      </div>

      {/* (C) Barra de progreso del servicio */}
      {totalVehiculos > 0 && (
        <div style={{ padding: '0.9rem 0.25rem 0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155' }}>Progreso del servicio</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#15803d' }}>{pct}%</span>
          </div>
          <div style={{ height: 9, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: '#15803d', transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: '0.63rem', color: '#94a3b8', marginTop: 5 }}>
            {inventariados} de {totalVehiculos} vehículos inventariados
          </div>
        </div>
      )}
    </div>
  )
}
