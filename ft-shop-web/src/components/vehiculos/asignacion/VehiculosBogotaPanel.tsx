/**
 * VehiculosBogotaPanel.tsx
 *
 * Panel CENTRAL del módulo de asignación de vehículos Bogotá: tablero de
 * inventariadores (tarjetas) + botón de repartición equilibrada con preview.
 * El catálogo vive en el panel lateral derecho de GestionUnp (no aquí).
 */

import { useState, useMemo } from 'react'
import { FaScaleBalanced, FaCarSide, FaMotorcycle, FaListCheck } from 'react-icons/fa6'
import VehiculosBogotaTarjeta from './VehiculosBogotaTarjeta'
import VehiculosBogotaStats from './VehiculosBogotaStats'
import ModalConfirmarAccion from '../../common/ModalConfirmarAccion'
import type { UseVehiculosBogota, PreviewReparticion } from '../../../hooks/useVehiculosBogota'
import './VehiculosBogota.css'

/** Tipo de lista de pendientes a mostrar en el modal de detalle de stats. */
type DetalleStats = 'pendientes' | 'motos' | 'carros'

interface Props {
  ctrl: UseVehiculosBogota
}

export default function VehiculosBogotaPanel({ ctrl }: Props) {
  const {
    vehiculos, cargando, inventariadores, estaInventariada, asignarPlaca, quitarPlaca, moverPlaca, quitarInventariador,
    calcularPreviewReparticion, aplicarReparticion, motosPendientes, carrosPendientes, placaResaltada,
  } = ctrl

  const [preview, setPreview] = useState<PreviewReparticion | null>(null)
  // Lista de pendientes abierta al hacer clic en una mini-card de stats.
  const [detalle, setDetalle] = useState<DetalleStats | null>(null)
  // Confirmación antes de quitar un inventariador (acción destructiva).
  const [confirmarQuitar, setConfirmarQuitar] = useState<{ username: string; nombre: string } | null>(null)

  const abrirPreview = () => {
    const p = calcularPreviewReparticion()
    if (p) setPreview(p)
  }
  const confirmarReparticion = () => { aplicarReparticion(); setPreview(null) }

  const hayInventariadores = inventariadores.length > 0
  const totalPendientes = motosPendientes.length + carrosPendientes.length

  // Mapa placa → descripción para cruzar las placas pendientes del hook con el
  // catálogo de vehículos y mostrar la descripción en el modal de detalle.
  const descripcionPorPlaca = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const v of vehiculos) mapa.set(v.placa, v.descripcion || '')
    return mapa
  }, [vehiculos])

  // Lista a mostrar según la mini-card clicada (placas + descripción).
  const detalleLista = useMemo(() => {
    if (!detalle) return []
    const placas = detalle === 'motos' ? motosPendientes
      : detalle === 'carros' ? carrosPendientes
      : [...motosPendientes, ...carrosPendientes]
    return placas.map((placa) => ({ placa, descripcion: descripcionPorPlaca.get(placa) || '—' }))
  }, [detalle, motosPendientes, carrosPendientes, descripcionPorPlaca])

  return (
    <div className="vbog-central">
      {/* Header */}
      <header className="vbog-header">
        <h4 className="vbog-header__titulo">Vehículos de Bogotá por inventariador</h4>
        <p className="vbog-header__desc">
          Agregue inventariadores desde el catálogo (derecha) y arrastre placas sobre cada uno,
          o use "Repartir equitativamente" para dividir la flota pendiente entre todos.
          Cada inventariador solo verá sus vehículos al inventariar Bogotá.
        </p>
      </header>

      {/* Barra de acciones */}
      {hayInventariadores && (
        <div className="vbog-acciones">
          <div className="vbog-repartir-wrap">
            <button className="vbog-btn-repartir" onClick={abrirPreview} disabled={totalPendientes === 0}>
              <FaScaleBalanced size={15} /> Repartir equitativamente
            </button>
            {/* Tooltip elegante (CSS puro, sin title nativo) */}
            <span className="vbog-tooltip" role="tooltip">
              Divide la flota pendiente de Bogotá entre los inventariadores, equilibrando
              motos y carros. Reemplaza las asignaciones actuales.
            </span>
          </div>

          {cargando ? (
            /* Mientras carga: spinner + skeleton (mismo patrón que PanelContadoresRegional) */
            <div className="vbog-stats-cargando">
              <span className="gi-contadores-spinner" aria-hidden="true" />
              <span className="vbog-stats-cargando__texto">Cargando…</span>
              <div className="vbog-stats" aria-hidden="true">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="vbog-stat-card vbog-stat-card--skeleton">
                    <div className="gi-skeleton-bar" style={{ width: '2.2rem', height: '1.4rem' }} />
                    <div className="gi-skeleton-bar" style={{ width: '70%' }} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <VehiculosBogotaStats
              totalPendientes={totalPendientes}
              totalMotos={motosPendientes.length}
              totalCarros={carrosPendientes.length}
              onDetalle={setDetalle}
            />
          )}
        </div>
      )}

      {/* Tablero */}
      {!hayInventariadores ? (
        <div className="vbog-vacio">
          <p style={{ margin: '0 0 0.35rem', fontWeight: 600, color: '#303d50', fontSize: '0.95rem' }}>Aún no hay inventariadores</p>
          <p style={{ margin: 0, color: '#6c757d', fontSize: '0.83rem' }}>
            Abra el catálogo (derecha), pestaña <strong>Inventariadores</strong>, busque una persona y agréguela.
          </p>
        </div>
      ) : (
        <div className="vbog-grid">
          {inventariadores.map((inv) => (
            <VehiculosBogotaTarjeta
              key={inv.usuario.username || inv.usuario.uuidUsuario}
              inv={inv}
              estaInventariada={estaInventariada}
              placaResaltada={placaResaltada}
              onAsignar={(placa) => inv.usuario.username && asignarPlaca(inv.usuario.username, placa)}
              onQuitarPlaca={(placa) => inv.usuario.username && quitarPlaca(inv.usuario.username, placa)}
              onMoverDesde={(placa, origen) => inv.usuario.username && moverPlaca(placa, origen, inv.usuario.username)}
              onQuitarInventariador={() => inv.usuario.username && setConfirmarQuitar({ username: inv.usuario.username, nombre: inv.usuario.nombreCompleto })}
            />
          ))}
        </div>
      )}

      {/* Modal de preview de repartición */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }} onClick={() => setPreview(null)}>
          <div style={{ background: 'white', borderRadius: '14px', maxWidth: '520px', width: '100%', padding: '1.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.25rem', fontWeight: 700, color: '#303d50' }}>Repartir equitativamente</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#64748b' }}>
              Se repartirán {preview.totalMotos} motos y {preview.totalCarros} carros pendientes.
              Esto <strong>reemplaza</strong> las asignaciones actuales.
            </p>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '1.25rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#64748b' }}>Inventariador</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: '#64748b' }}>Motos</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: '#64748b' }}>Carros</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem 0.75rem', color: '#64748b' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.porInventariador.map((p) => (
                    <tr key={p.username} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#303d50', fontWeight: 600 }}>{p.nombre}</td>
                      <td style={{ textAlign: 'center', padding: '0.5rem' }}>{p.motos}</td>
                      <td style={{ textAlign: 'center', padding: '0.5rem' }}>{p.carros}</td>
                      <td style={{ textAlign: 'center', padding: '0.5rem 0.75rem', fontWeight: 700, color: '#1565c0' }}>{p.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setPreview(null)} style={{ padding: '0.6rem 1.4rem', border: '2px solid #cbd5e1', background: 'white', color: '#64748b', borderRadius: '9px', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={confirmarReparticion} style={{ padding: '0.6rem 1.4rem', border: 'none', background: '#16a34a', color: 'white', borderRadius: '9px', cursor: 'pointer', fontWeight: 700 }}>Confirmar repartición</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalle de pendientes (al hacer clic en una mini-card de stats) */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }} onClick={() => setDetalle(null)}>
          <div style={{ background: 'white', borderRadius: '14px', maxWidth: '460px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.3rem', fontSize: '1.15rem', fontWeight: 700, color: '#303d50', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {detalle === 'motos' ? <FaMotorcycle size={16} color="#1565c0" />
                : detalle === 'carros' ? <FaCarSide size={16} color="#15803d" />
                : <FaListCheck size={16} color="#d97706" />}
              {detalle === 'motos' ? 'Motos pendientes' : detalle === 'carros' ? 'Carros pendientes' : 'Vehículos pendientes'}
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748b' }}>
              {detalleLista.length} vehículo{detalleLista.length === 1 ? '' : 's'} sin inventariar.
            </p>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.5rem' }}>
              {detalleLista.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '1rem' }}>No hay vehículos pendientes.</p>
              ) : detalleLista.map((v) => (
                <div key={v.placa} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.6rem', borderRadius: '8px', background: '#f8fafc' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#303d50', minWidth: '5.5rem' }}>{v.placa}</span>
                  <span style={{ fontSize: '0.76rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.descripcion}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setDetalle(null)} style={{ padding: '0.55rem 1.4rem', border: 'none', background: '#303d50', color: 'white', borderRadius: '9px', cursor: 'pointer', fontWeight: 700 }}>Cerrar</button>
            </div>
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
