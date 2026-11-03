import { useState, useMemo, useEffect, useRef } from 'react'
import { FaChevronDown, FaChevronUp, FaMagnifyingGlass } from 'react-icons/fa6'
import type { UseServiciosHabilitados, InventariadorAsignacion } from '../../hooks/useServiciosHabilitados'
import { buscarUsuariosEcosistema, type UsuarioEcosistema } from '../../services/controlSeguimientoService'
import type { Servicio } from '../../services/controlSeguimientoService'

/**
 * "Servicios habilitados" — contenido del panel CENTRAL.
 *
 * El panel central es SIEMPRE el tablero de inventariadores: cada inventariador
 * agregado (desde el catálogo derecho) aparece como una sección; se arrastran
 * servicios sobre cada uno para habilitárselos. La habilitación es por usuario.
 */
export function ServiciosHabilitadosCentral({
  ctrl,
}: {
  ctrl: UseServiciosHabilitados
}) {
  const {
    servicios, inventariadores, quitarInventariador,
    asignarServicioAInventariador, quitarServicioDeInventariador,
  } = ctrl

  const [filtro, setFiltro] = useState('')
  // Set de usernames plegados manualmente.
  const [plegados, setPlegados] = useState<Set<string>>(new Set())

  const filtroNorm = filtro.trim().toLowerCase()

  // Mapa código→nombre para poder buscar por nombre de servicio.
  const nombrePorCodigo = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of servicios) m.set(s.codigo, s.nombre)
    return m
  }, [servicios])

  // Con filtro activo: qué inventariadores tienen algún servicio que coincida.
  const coincidePorUsuario = useMemo(() => {
    const m = new Map<string, boolean>()
    if (!filtroNorm) return m
    for (const inv of inventariadores) {
      const key = inv.usuario.username || inv.usuario.uuidUsuario
      const tiene = inv.servicios.some((c) => {
        const nom = (nombrePorCodigo.get(c) || '').toLowerCase()
        return c.toLowerCase().includes(filtroNorm) || nom.includes(filtroNorm)
      })
      m.set(key, tiene)
    }
    return m
  }, [filtroNorm, inventariadores, nombrePorCodigo])

  const totalCoincidencias = useMemo(
    () => (filtroNorm ? [...coincidePorUsuario.values()].filter(Boolean).length : 0),
    [filtroNorm, coincidePorUsuario],
  )

  const togglePlegado = (key: string) => {
    setPlegados((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <header style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 1.25rem' }}>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 700, color: '#303d50' }}>Servicios por inventariador</h4>
        <p style={{ color: '#5c6474', margin: 0, fontSize: '0.92rem', lineHeight: 1.6 }}>
          Agregue inventariadores desde el catálogo (derecha) y arrastre servicios sobre cada uno
          para habilitárselos. Cada inventariador solo verá sus servicios al inventariar.
        </p>
      </header>

      {/* Barra: filtro por servicio + acciones */}
      {inventariadores.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
            <FaMagnifyingGlass size={13} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar servicio por código o nombre (para ver quién lo tiene)..."
              maxLength={40}
              style={{ width: '100%', padding: '0.6rem 2.2rem 0.6rem 2.2rem', border: '1px solid #dee2e6', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', background: 'white' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#1565c0' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#dee2e6' }}
            />
            {filtro && (
              <button
                onClick={() => setFiltro('')}
                title="Limpiar filtro"
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
              >×</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={() => setPlegados(new Set(inventariadores.map((i) => i.usuario.username || i.usuario.uuidUsuario)))}
              style={colapsarBtnStyle}
              title="Plegar todas"
            ><FaChevronUp size={11} /> Plegar todo</button>
            <button
              onClick={() => setPlegados(new Set())}
              style={colapsarBtnStyle}
              title="Desplegar todas"
            ><FaChevronDown size={11} /> Desplegar todo</button>
          </div>
        </div>
      )}

      {filtroNorm && inventariadores.length > 0 && (
        <p style={{ margin: '-0.4rem 0 0.9rem', fontSize: '0.82rem', color: totalCoincidencias > 0 ? '#1565c0' : '#b45309', fontWeight: 600 }}>
          {totalCoincidencias > 0
            ? `${totalCoincidencias} inventariador(es) con un servicio que coincide con "${filtro.trim()}".`
            : `Ningún inventariador tiene un servicio que coincida con "${filtro.trim()}".`}
        </p>
      )}

      {inventariadores.length === 0 ? (
        <div style={{ ...emptyBoxStyle, marginTop: '1rem' }}>
          <p style={{ margin: '0 0 0.35rem', fontWeight: 600, color: '#303d50', fontSize: '0.95rem' }}>Aún no hay inventariadores</p>
          <p style={{ margin: 0, color: '#6c757d', fontSize: '0.83rem' }}>
            Vaya al panel de la derecha, pestaña <strong>Inventariadores</strong>, busque una persona y agréguela.
            Aparecerá aquí para asignarle servicios.
          </p>
        </div>
      ) : (
        // Layout masonry con CSS columns: acomoda las tarjetas verticalmente
        // sin dejar huecos entre tarjetas de distinta altura.
        <div style={{ columnWidth: '380px', columnGap: '1.25rem', paddingBottom: '1rem' }}>
          {inventariadores.map((inv) => {
            const key = inv.usuario.username || inv.usuario.uuidUsuario
            const coincide = filtroNorm ? (coincidePorUsuario.get(key) ?? false) : null
            return (
              <div key={key} style={{ breakInside: 'avoid', marginBottom: '1.25rem' }}>
                <SubPanelInventariador
                  inv={inv}
                  servicios={servicios}
                  plegado={plegados.has(key)}
                  onTogglePlegado={() => togglePlegado(key)}
                  filtro={filtroNorm}
                  coincide={coincide}
                  onAsignar={(codigo) => inv.usuario.username && asignarServicioAInventariador(inv.usuario.username, codigo)}
                  onQuitarServicio={(codigo) => inv.usuario.username && quitarServicioDeInventariador(inv.usuario.username, codigo)}
                  onQuitarInventariador={() => inv.usuario.username && quitarInventariador(inv.usuario.username)}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const colapsarBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
  padding: '0.55rem 0.8rem', background: 'white', color: '#475569',
  border: '1px solid #dee2e6', borderRadius: '10px', cursor: 'pointer',
  fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap',
}

/* Sub-panel de un inventariador (drop target propio) */
function SubPanelInventariador({
  inv, servicios, plegado, onTogglePlegado, filtro, coincide,
  onAsignar, onQuitarServicio, onQuitarInventariador,
}: {
  inv: InventariadorAsignacion
  servicios: Servicio[]
  plegado: boolean
  onTogglePlegado: () => void
  filtro: string
  coincide: boolean | null
  onAsignar: (codigo: string) => void
  onQuitarServicio: (codigo: string) => void
  onQuitarInventariador: () => void
}) {
  const [dropActivo, setDropActivo] = useState(false)
  const sinUsuario = !inv.usuario.username

  const asignadosVisibles = useMemo(() => {
    return servicios
      .filter((s) => inv.servicios.includes(s.codigo))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
  }, [servicios, inv.servicios])

  // Con filtro activo, la tarjeta se atenúa si no coincide y se resalta si coincide.
  const atenuado = coincide === false
  const resaltado = coincide === true
  // Un servicio individual coincide con el filtro (para resaltarlo dentro de la lista).
  const servicioCoincide = (codigo: string, nombre: string) =>
    !!filtro && (codigo.toLowerCase().includes(filtro) || nombre.toLowerCase().includes(filtro))

  const onOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!dropActivo) setDropActivo(true)
  }
  const onLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActivo(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const codigo = e.dataTransfer.getData('text/plain')
    if (codigo && !sinUsuario) onAsignar(codigo)
    setDropActivo(false)
  }

  const borde = dropActivo ? '1px solid #303d50' : resaltado ? '1px solid #1565c0' : '1px solid #e2e8f0'
  const sombra = dropActivo
    ? '0 4px 14px rgba(48,61,80,0.18)'
    : resaltado ? '0 0 0 3px rgba(21,101,192,0.15), 0 2px 8px rgba(0,0,0,0.06)' : '0 2px 8px rgba(0,0,0,0.05)'

  return (
    <div style={{ background: 'white', border: borde, borderRadius: '14px', boxShadow: sombra, overflow: 'hidden', transition: 'box-shadow 0.15s, border-color 0.15s, opacity 0.15s', opacity: atenuado ? 0.45 : 1 }}>
      {/* Cabecera del inventariador (click para plegar/desplegar) */}
      <div
        onClick={onTogglePlegado}
        title={plegado ? 'Desplegar' : 'Plegar'}
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.95rem 1.1rem', background: '#f8fafc', borderBottom: plegado ? 'none' : '1px solid #eef2f7', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#303d50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 700, flexShrink: 0 }}>
          {(inv.usuario.nombreCompleto.charAt(0) || '?').toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#303d50', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.usuario.nombreCompleto}</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>{inv.usuario.username ? `@${inv.usuario.username}` : <span style={{ color: '#d97706' }}>sin usuario del ecosistema</span>}</div>
        </div>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1565c0', background: '#e3f2fd', padding: '0.3rem 0.65rem', borderRadius: '10px', flexShrink: 0 }}>{inv.servicios.length}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePlegado() }}
          title={plegado ? 'Desplegar' : 'Plegar'}
          style={{ background: 'transparent', border: 'none', color: '#64748b', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          {plegado ? <FaChevronDown size={13} /> : <FaChevronUp size={13} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onQuitarInventariador() }}
          title="Quitar inventariador del tablero"
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
        >
          ×
        </button>
      </div>

      {/* Zona drop del inventariador (oculta si está plegado) */}
      {!plegado && (
      <div
        onDragOver={onOver}
        onDragLeave={onLeave}
        onDrop={onDrop}
        style={{
          padding: '0.9rem',
          minHeight: '180px',
          background: dropActivo ? 'rgba(48,61,80,0.04)' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        {inv.cargando ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '2rem 0' }}>Cargando...</p>
        ) : sinUsuario ? (
          <p style={{ textAlign: 'center', color: '#b45309', fontSize: '0.82rem', padding: '1.5rem 0.75rem', background: '#fef3c7', borderRadius: '10px' }}>
            Este usuario no tiene login del ecosistema, no se le pueden asignar servicios.
          </p>
        ) : inv.servicios.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '2rem 0.75rem', lineHeight: 1.6, border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
            Arrastre servicios aquí para asignárselos.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {asignadosVisibles.map((s) => {
              const match = servicioCoincide(s.codigo, s.nombre)
              return (
              <div key={s.codigo} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.7rem', background: match ? '#fff8e1' : '#f1f8f2', border: match ? '1px solid #f5c518' : '1px solid #c8e6c9', borderRadius: '10px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#303d50' }}>{s.codigo}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6c757d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nombre}</div>
                </div>
                <button
                  onClick={() => onQuitarServicio(s.codigo)}
                  title="Quitar servicio"
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', width: '26px', height: '26px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.05rem', lineHeight: 1, flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
                >
                  ×
                </button>
              </div>
              )
            })}
          </div>
        )}
      </div>
      )}
    </div>
  )
}

/**
 * Catálogo de servicios — contenido del panel DERECHO.
 * Tabs: "Servicios" (lista arrastrable) e "Inventariadores" (buscador para
 * agregar usuarios al tablero central). La lista de servicios está siempre
 * visible y se arrastra hacia los sub-paneles de inventariador del centro.
 */
export function CatalogoServiciosPanel({ ctrl }: { ctrl: UseServiciosHabilitados }) {
  const {
    servicios, cargando,
    vista, setVista, inventariadores, agregarInventariador, quitarInventariador,
  } = ctrl
  const [filtroCatalogo, setFiltroCatalogo] = useState('')
  const [arrastrando, setArrastrando] = useState<string | null>(null)

  // Códigos ya asignados a algún inventariador (para marcarlos como referencia).
  const codigosAsignados = useMemo(() => {
    const set = new Set<string>()
    for (const inv of inventariadores) for (const c of inv.servicios) set.add(c)
    return set
  }, [inventariadores])

  const catalogoVisible = useMemo(() => {
    const t = filtroCatalogo.trim().toLowerCase()
    return servicios
      .filter((s) => !t || s.codigo.toLowerCase().includes(t) || s.nombre.toLowerCase().includes(t))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
  }, [servicios, filtroCatalogo])

  const onDragStart = (codigo: string) => (e: React.DragEvent) => {
    setArrastrando(codigo)
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', codigo)
  }
  const onDragEnd = () => setArrastrando(null)

  // Se puede arrastrar cuando hay al menos un inventariador en el tablero central.
  const hayInventariadores = inventariadores.length > 0

  return (
    <>
      {/* Tabs Servicios / Inventariadores — estilo segmentado (pills) */}
      <div style={{ padding: '1rem 1rem 0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', background: '#eef2f7', padding: '0.35rem', borderRadius: '12px' }}>
          {([['servicio', 'Servicios'], ['inventariador', 'Inventariadores']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setVista(t)}
              style={{
                flex: 1, padding: '0.65rem 0.5rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
                borderRadius: '9px', border: 'none',
                background: vista === t ? '#303d50' : 'transparent',
                color: vista === t ? '#fff' : '#64748b',
                boxShadow: vista === t ? '0 1px 4px rgba(48,61,80,0.3)' : 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {vista === 'servicio' ? (
        <>
          {/* Cabecera: filtro de servicios */}
          <div style={{ padding: '0 1rem 0.85rem', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <input
              type="text"
              value={filtroCatalogo}
              onChange={(e) => setFiltroCatalogo(e.target.value)}
              placeholder="Filtrar servicios por código o nombre..."
              maxLength={30}
              style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #dee2e6', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#1565c0' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#dee2e6' }}
            />
            <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8', lineHeight: 1.4 }}>
              {hayInventariadores
                ? 'Arrastre un servicio sobre un inventariador del panel central.'
                : 'Agregue un inventariador (pestaña Inventariadores) para poder asignar servicios.'}
            </p>
          </div>

          {/* Lista de servicios (arrastrable hacia el centro) */}
          <div className="consulta-lateral__panel-body">
            {cargando ? (
              <p style={{ textAlign: 'center', color: '#6c757d', fontSize: '0.8rem', padding: '1.5rem 0.5rem' }}>Cargando servicios...</p>
            ) : catalogoVisible.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#6c757d', fontSize: '0.8rem', padding: '1.5rem 0.5rem' }}>Sin resultados para "{filtroCatalogo}".</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {catalogoVisible.map((s) => {
                  const yaAsignado = codigosAsignados.has(s.codigo)
                  const esteArrastrando = arrastrando === s.codigo
                  return (
                    <div
                      key={s.codigo}
                      draggable={hayInventariadores}
                      onDragStart={hayInventariadores ? onDragStart(s.codigo) : undefined}
                      onDragEnd={onDragEnd}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.7rem 0.75rem',
                        borderRadius: '10px',
                        border: '1px solid ' + (yaAsignado ? '#c8e6c9' : '#e2e8f0'),
                        background: yaAsignado ? '#f1f8f2' : 'white',
                        opacity: esteArrastrando ? 0.5 : 1,
                        cursor: hayInventariadores ? 'grab' : 'default',
                      }}
                      title={hayInventariadores ? 'Arrastre sobre un inventariador' : 'Agregue un inventariador primero'}
                    >
                      {hayInventariadores && <span style={{ color: '#b0b8c4', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>⠿</span>}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#303d50' }}>{s.codigo}</div>
                        <div style={{ fontSize: '0.76rem', color: '#6c757d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nombre}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#303d50' }}>{s.cantidad < 0 ? '...' : s.cantidad.toLocaleString()}</div>
                        <span style={tipoBadge(s.es_bodega)}>{s.es_bodega ? 'Bodega' : 'Servicio'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Cabecera: buscador para agregar inventariadores */}
          <div style={{ padding: '0 1rem 0.85rem', borderBottom: '1px solid #f0f0f0' }}>
            <SelectorUsuarioEcosistema
              yaAgregados={inventariadores.map((i) => i.usuario.username || '')}
              onAgregar={agregarInventariador}
            />
          </div>

          {/* Lista de inventariadores agregados */}
          <div className="consulta-lateral__panel-body" style={{ padding: '0.85rem 1rem' }}>
            {inventariadores.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#6c757d', fontSize: '0.85rem', padding: '2rem 0.5rem', lineHeight: 1.6 }}>
                Busque una persona arriba para agregarla como inventariador. Aparecerá en el panel central.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {inventariadores.map((inv) => (
                  <div
                    key={inv.usuario.username || inv.usuario.uuidUsuario}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.75rem 0.85rem', border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#303d50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem', fontWeight: 700, flexShrink: 0 }}>
                      {(inv.usuario.nombreCompleto.charAt(0) || '?').toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#303d50', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.usuario.nombreCompleto}</div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
                        {inv.usuario.username ? `@${inv.usuario.username}` : <span style={{ color: '#d97706' }}>sin usuario</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1565c0', marginTop: '3px' }}>
                        {inv.servicios.length} servicio(s) asignado(s)
                      </div>
                    </div>
                    <button
                      onClick={() => inv.usuario.username && quitarInventariador(inv.usuario.username)}
                      title="Quitar inventariador"
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

const emptyBoxStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '2.5rem 1.5rem',
  background: '#f8f9fa',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  color: '#6c757d',
  fontSize: '0.88rem',
}

function tipoBadge(esBodega: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    marginTop: '0.15rem',
    padding: '0.1rem 0.35rem',
    borderRadius: '4px',
    fontSize: '0.6rem',
    fontWeight: 600,
    background: esBodega ? '#fff3cd' : '#d4edda',
    color: esBodega ? '#856404' : '#155724',
    whiteSpace: 'nowrap',
  }
}

/**
 * Buscador de usuarios del ecosistema (directorio activo).
 * Autocompletado por nombre o correo (mín. 3 caracteres, debounce 400ms).
 * Al seleccionar, AGREGA el usuario al tablero (permite varios).
 */
function SelectorUsuarioEcosistema({
  yaAgregados,
  onAgregar,
}: {
  yaAgregados: string[]
  onAgregar: (u: UsuarioEcosistema) => void
}) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<UsuarioEcosistema[]>([])
  const [buscando, setBuscando] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = texto.trim()
    if (q.length < 3) { setResultados([]); return }
    debounceRef.current = setTimeout(() => {
      setBuscando(true)
      void buscarUsuariosEcosistema(q).then((r) => {
        setResultados(r)
        setBuscando(false)
        setAbierto(true)
      })
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [texto])

  const agregar = (u: UsuarioEcosistema) => {
    onAgregar(u)
    setTexto('')
    setResultados([])
    setAbierto(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => { if (resultados.length > 0) setAbierto(true) }}
        placeholder="Buscar inventariador para agregar..."
        style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid #dee2e6', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
        onBlur={(e) => { e.currentTarget.style.borderColor = '#dee2e6'; setTimeout(() => setAbierto(false), 150) }}
      />
      {abierto && (buscando || resultados.length > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: '2px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '240px', overflowY: 'auto' }}>
          {buscando ? (
            <div style={{ padding: '0.6rem', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>Buscando...</div>
          ) : (
            resultados.map((u) => {
              const yaEsta = !!u.username && yaAgregados.includes(u.username)
              return (
                <div
                  key={u.uuidUsuario}
                  onMouseDown={() => { if (!yaEsta) agregar(u) }}
                  style={{ padding: '0.65rem 0.75rem', cursor: yaEsta ? 'default' : 'pointer', borderBottom: '1px solid #f1f5f9', opacity: yaEsta ? 0.55 : 1 }}
                  onMouseEnter={(e) => { if (!yaEsta) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#303d50' }}>
                    {u.nombreCompleto}
                    {yaEsta && <span style={{ fontSize: '0.68rem', color: '#16a34a', marginLeft: '0.4rem' }}>ya agregado</span>}
                  </div>
                  <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '2px' }}>
                    {u.username ? `@${u.username}` : <span style={{ color: '#d97706' }}>sin usuario del ecosistema</span>}
                    {u.email ? ` · ${u.email}` : ''}
                  </div>
                </div>
              )
            })
          )}
          {!buscando && resultados.length === 0 && (
            <div style={{ padding: '0.6rem', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>Sin coincidencias</div>
          )}
        </div>
      )}
    </div>
  )
}
