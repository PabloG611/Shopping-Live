/**
 * VehiculosBogotaCatalogo.tsx
 *
 * Panel DERECHO del módulo de asignación de vehículos Bogotá.
 * Dos tabs:
 *  - "Vehículos": lista de placas de Bogotá (arrastrables al tablero central).
 *    Las ya inventariadas se muestran con badge y no son arrastrables.
 *  - "Inventariadores": buscador para agregar personas al tablero.
 */

import { useState, useMemo } from 'react'
import { FaCarSide, FaMotorcycle, FaMagnifyingGlass, FaCheck, FaCircleCheck, FaPlus, FaTrashCan, FaUserGroup } from 'react-icons/fa6'
import { Animacion } from 'react-ecosistema-unp/ui'
import ModalConfirmarAccion from '../../common/ModalConfirmarAccion'
import { esMoto } from '../../../services/vehiculosService'
import { buscarUsuariosEcosistema, type UsuarioEcosistema } from '../../../services/controlSeguimientoService'
import type { UseVehiculosBogota } from '../../../hooks/useVehiculosBogota'

export default function VehiculosBogotaCatalogo({ ctrl }: { ctrl: UseVehiculosBogota }) {
  const { vehiculos, cargando, vista, setVista, inventariadores, estaInventariada, inventariadorDePlaca, resaltarPlaca, agregarInventariador, quitarInventariador } = ctrl
  const [filtroVeh, setFiltroVeh] = useState('')
  const [filtroUsr, setFiltroUsr] = useState('')
  const [resultUsr, setResultUsr] = useState<UsuarioEcosistema[]>([])
  const [buscandoUsr, setBuscandoUsr] = useState(false)
  // Confirmación antes de quitar un inventariador (acción destructiva)
  const [confirmarQuitar, setConfirmarQuitar] = useState<{ username: string; nombre: string } | null>(null)

  const hayInventariadores = inventariadores.length > 0

  // Placas ya asignadas a algún inventariador (para marcarlas en el catálogo)
  const placasAsignadas = useMemo(() => {
    const set = new Set<string>()
    for (const inv of inventariadores) for (const p of inv.placas) set.add(p)
    return set
  }, [inventariadores])

  const vehiculosVisibles = useMemo(() => {
    const t = filtroVeh.trim().toLowerCase()
    if (!t) return vehiculos
    return vehiculos.filter((v) =>
      v.placa.toLowerCase().includes(t) || (v.descripcion || '').toLowerCase().includes(t),
    )
  }, [vehiculos, filtroVeh])

  const buscarUsuarios = (q: string) => {
    setFiltroUsr(q)
    if (q.trim().length < 3) { setResultUsr([]); return }
    setBuscandoUsr(true)
    void buscarUsuariosEcosistema(q).then((res) => { setResultUsr(res); setBuscandoUsr(false) })
  }

  const onDragStart = (placa: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', placa)
  }

  // Clic en una placa asignada del catálogo: ubica LA PLACA concreta dentro del
  // tablero central (scroll + resaltado temporal de esa placa). Marca la placa
  // en el hook para disparar su animación de pulso.
  const ubicarPlacaAsignada = (placa: string) => {
    resaltarPlaca(placa)
    // El scroll debe ir a la placa específica, no solo a la tarjeta.
    requestAnimationFrame(() => {
      const el = document.getElementById(`vbog-placa-${placa}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  return (
    <div className="vbog-catalogo-body">
      {/* Tabs */}
      <div style={{ padding: '1rem 1rem 0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', background: '#eef2f7', padding: '0.35rem', borderRadius: '12px' }}>
          {([['vehiculo', 'Vehículos'], ['inventariador', 'Inventariadores']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setVista(t)}
              style={{
                flex: 1, padding: '0.5rem', border: 'none', borderRadius: '9px', cursor: 'pointer',
                fontWeight: 700, fontSize: '0.82rem',
                background: vista === t ? 'white' : 'transparent',
                color: vista === t ? '#303d50' : '#64748b',
                boxShadow: vista === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB Vehículos */}
      {vista === 'vehiculo' && (
        <div className="vbog-catalogo-tab">
          <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
            <FaMagnifyingGlass size={12} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={filtroVeh}
              onChange={(e) => setFiltroVeh(e.target.value)}
              placeholder="Buscar placa o descripción…"
              style={{ width: '100%', padding: '0.5rem 0.6rem 0.5rem 1.9rem', border: '1px solid #dee2e6', borderRadius: '9px', fontSize: '0.82rem', boxSizing: 'border-box' }}
            />
          </div>
          <p style={{ margin: '0 0 0.6rem', fontSize: '0.74rem', color: '#94a3b8', lineHeight: 1.4 }}>
            {hayInventariadores
              ? 'Arrastre una placa sobre un inventariador del panel central.'
              : 'Agregue un inventariador (pestaña Inventariadores) para poder asignar.'}
          </p>
          {cargando ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', gap: '0.5rem' }}>
              <Animacion type="colibri" />
              <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Cargando vehículos…</span>
            </div>
          ) : (
            <div className="vbog-catalogo-lista">
              {vehiculosVisibles.map((v) => {
                const inventariada = estaInventariada(v.placa)
                const asignada = placasAsignadas.has(v.placa)
                const invAsignado = asignada ? inventariadorDePlaca(v.placa) : null
                const arrastrable = hayInventariadores && !inventariada
                return (
                  <div
                    key={v.placa}
                    draggable={arrastrable}
                    onDragStart={arrastrable ? onDragStart(v.placa) : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.5rem 0.6rem', borderRadius: '9px',
                      border: '1px solid ' + (inventariada ? '#e2e8f0' : asignada ? '#c7dbff' : '#e2e8f0'),
                      background: inventariada ? '#f8fafc' : asignada ? '#f1f8f2' : 'white',
                      cursor: arrastrable ? 'grab' : 'default',
                      opacity: inventariada ? 0.6 : 1,
                    }}
                  >
                    {esMoto(v.placa) ? <FaMotorcycle size={12} color="#64748b" /> : <FaCarSide size={12} color="#64748b" />}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#303d50', textDecoration: inventariada ? 'line-through' : 'none' }}>{v.placa}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.descripcion || '—'}</div>
                    </div>
                    {inventariada && (
                      <span style={{ fontSize: '0.64rem', fontWeight: 800, color: 'white', background: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0, boxShadow: '0 1px 3px rgba(22,163,74,0.3)' }}>
                        <FaCircleCheck size={10} /> Inventariado
                      </span>
                    )}
                    {!inventariada && asignada && (
                      <span className="vbog-asignada-wrap">
                        <button
                          type="button"
                          className="vbog-asignada-badge"
                          onClick={() => ubicarPlacaAsignada(v.placa)}
                        >
                          Asignada
                        </button>
                        {invAsignado && (
                          <span className="vbog-asignada-pop" role="tooltip">
                            <span className="vbog-asignada-pop__nombre">{invAsignado.usuario.nombreCompleto}</span>
                            {invAsignado.usuario.username && (
                              <span className="vbog-asignada-pop__user">@{invAsignado.usuario.username}</span>
                            )}
                            <span className="vbog-asignada-pop__hint">Clic para ubicar la placa</span>
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )
              })}
              {vehiculosVisibles.length === 0 && (
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem', padding: '1rem' }}>Sin coincidencias.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB Inventariadores */}
      {vista === 'inventariador' && (
        <div className="vbog-catalogo-tab">
          {/* Inventariadores ya agregados */}
          {inventariadores.length > 0 && (
            <div style={{ marginBottom: '0.85rem' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <FaUserGroup size={11} /> Agregados ({inventariadores.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {inventariadores.map((inv) => (
                  <div
                    key={inv.usuario.username || inv.usuario.uuidUsuario}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.6rem', borderRadius: '9px', border: '1px solid #c7dbff', background: '#f0f6ff' }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#303d50', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.usuario.nombreCompleto}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>@{inv.usuario.username} · {inv.placas.length} placa(s)</div>
                    </div>
                    <button
                      type="button"
                      className="vbog-btn-eliminar"
                      onClick={() => inv.usuario.username && setConfirmarQuitar({ username: inv.usuario.username, nombre: inv.usuario.nombreCompleto })}
                      title="Quitar inventariador"
                    >
                      <FaTrashCan size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ margin: '0 0 0.5rem', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Agregar inventariador</p>
          <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
            <FaMagnifyingGlass size={12} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={filtroUsr}
              onChange={(e) => buscarUsuarios(e.target.value)}
              placeholder="Buscar por nombre o usuario (mín. 3)…"
              style={{ width: '100%', padding: '0.5rem 0.6rem 0.5rem 1.9rem', border: '1px solid #dee2e6', borderRadius: '9px', fontSize: '0.82rem', boxSizing: 'border-box' }}
            />
          </div>
          {buscandoUsr && <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Buscando…</p>}
          <div className="vbog-catalogo-lista">
            {resultUsr.map((u) => {
              const yaEsta = inventariadores.some((i) => i.usuario.username === u.username)
              return (
                <button
                  key={u.uuidUsuario}
                  type="button"
                  disabled={yaEsta || !u.username}
                  onClick={() => agregarInventariador(u)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left',
                    padding: '0.5rem 0.6rem', borderRadius: '9px', border: '1px solid #e2e8f0',
                    background: yaEsta ? '#f1f8f2' : 'white', cursor: yaEsta || !u.username ? 'default' : 'pointer',
                    opacity: !u.username ? 0.5 : 1, width: '100%',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#303d50' }}>{u.nombreCompleto}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{u.username ? `@${u.username}` : 'sin usuario'}</div>
                  </div>
                  {yaEsta
                    ? <FaCheck size={12} color="#16a34a" />
                    : u.username && <FaPlus size={12} color="#1565c0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Confirmación de quitar inventariador */}
      <ModalConfirmarAccion
        isOpen={confirmarQuitar !== null}
        titulo="Quitar inventariador"
        mensaje="¿Está seguro de quitar a este inventariador del tablero?"
        destacado={confirmarQuitar?.nombre}
        advertencia="Se eliminará su asignación de vehículos de Bogotá. Esta acción no se puede deshacer."
        textoConfirmar="Sí, quitar"
        color="#dc2626"
        onConfirmar={() => { if (confirmarQuitar) quitarInventariador(confirmarQuitar.username); setConfirmarQuitar(null) }}
        onCancelar={() => setConfirmarQuitar(null)}
      />
    </div>
  )
}
