/**
 * Modal compartido para mostrar alertas del inventario:
 * - Observaciones pendientes (bloqueantes)
 * - Notas (informativas, trazabilidad)
 * - Bienes con estado M
 *
 * Usado en Inventario Físico e Inventario Regionales.
 */

import { useState, useEffect } from 'react'
import type { RegistroObservacion } from '../../services/observacionesInventarioService'
import { obtenerNotas, filtrarRegistrosVisibles, obtenerBloqueantesVisibles } from '../../services/observacionesInventarioService'
import FloatingField from '../ui/FloatingField'

interface BienEstadoM {
  placa: string
  descripcion: string
  nombre_responsable?: string
}

interface ModalAlertasProps {
  isOpen: boolean
  registros: RegistroObservacion[]
  bienesEstadoM: BienEstadoM[]
  onClose: () => void
  /** Callback para navegar/scroll a un bien específico en la tabla */
  onIrABien?: (placa: string) => void
  /** Servicio activo: filtra lo que muestra la campana (igual que el bloqueo). */
  servicio?: string
  /** Cédula del usuario activo: filtra la campana por servicio + usuario. */
  cedula?: string
}

type TabAlertas = 'observaciones' | 'notas' | 'estado-m'

export default function ModalAlertas({ isOpen, registros, bienesEstadoM, onClose, onIrABien, servicio, cedula }: ModalAlertasProps) {
  const [tab, setTab] = useState<TabAlertas>('observaciones')
  const [filtro, setFiltro] = useState('')

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // La campana muestra EXACTAMENTE lo que bloquea el guardado: observaciones
  // bloqueantes (pendiente/en_gestion) visibles para el servicio activo + cédula.
  // Las notas se filtran con el mismo criterio (las automáticas quedan visibles).
  const observaciones = obtenerBloqueantesVisibles(registros, { servicio, cedula })
  const notas = filtrarRegistrosVisibles(obtenerNotas(registros), { servicio, cedula })

  const filtrar = (texto: string) => {
    if (!filtro.trim()) return true
    return texto.toLowerCase().includes(filtro.trim().toLowerCase())
  }

  const obsFiltradas = observaciones.filter(r => filtrar(`${r.placa} ${r.texto} ${r.descripcionBien}`))
  const notasFiltradas = notas.filter(r => filtrar(`${r.placa} ${r.texto} ${r.descripcionBien}`))
  const malEstadoFiltrados = bienesEstadoM.filter(b => filtrar(`${b.placa} ${b.descripcion} ${b.nombre_responsable || ''}`))

  return (
    <div className="inventario-fisico__modal-overlay">
      <div className="inventario-fisico__modal" style={{ maxWidth: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="inventario-fisico__modal-header">
          <h5>Alertas del Inventario</h5>
          <button className="inventario-fisico__modal-close" onClick={onClose}>×</button>
        </div>

        {/* Tabs pill */}
        <div style={{ padding: '0.75rem 1.5rem 0' }}>
          <div style={{ display: 'flex', gap: '0.4rem', padding: '0.3rem', background: 'rgb(48 61 80 / 0.06)', borderRadius: '50px', width: 'fit-content', marginBottom: '0.75rem' }}>
            <button
              onClick={() => setTab('observaciones')}
              style={{ padding: '0.4rem 0.9rem', border: 'none', borderRadius: '50px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: tab === 'observaciones' ? '#d13c47' : 'transparent', color: tab === 'observaciones' ? '#fff' : '#5c6474', boxShadow: tab === 'observaciones' ? '0 2px 6px rgb(209 60 71 / 0.3)' : 'none' }}
            >
              Observaciones ({observaciones.length})
            </button>
            <button
              onClick={() => setTab('notas')}
              style={{ padding: '0.4rem 0.9rem', border: 'none', borderRadius: '50px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: tab === 'notas' ? '#303d50' : 'transparent', color: tab === 'notas' ? '#fff' : '#5c6474', boxShadow: tab === 'notas' ? '0 2px 6px rgb(48 61 80 / 0.3)' : 'none' }}
            >
              Notas ({notas.length})
            </button>
            <button
              onClick={() => setTab('estado-m')}
              style={{ padding: '0.4rem 0.9rem', border: 'none', borderRadius: '50px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: tab === 'estado-m' ? '#e65100' : 'transparent', color: tab === 'estado-m' ? '#fff' : '#5c6474', boxShadow: tab === 'estado-m' ? '0 2px 6px rgb(230 81 0 / 0.3)' : 'none' }}
            >
              Estado M ({bienesEstadoM.length})
            </button>
          </div>

          {/* Filtro con floating label */}
          <div style={{ marginBottom: '0.5rem' }}>
            <FloatingField label="Filtrar por placa, descripción o texto" required={false} tieneValor={!!filtro}>
              <input
                type="text"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value.slice(0, 50))}
                maxLength={50}
                placeholder=" "
                style={{ width: '100%', height: '44px', padding: '0.5rem 0.75rem 0', border: '1px solid rgb(48 61 80 / 0.25)', borderRadius: '8px', fontSize: '0.85rem', background: '#fff', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#303d50'; e.currentTarget.style.boxShadow = '0 0 0 3px rgb(48 61 80 / 0.12)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgb(48 61 80 / 0.25)'; e.currentTarget.style.boxShadow = 'none' }}
              />
            </FloatingField>
          </div>
        </div>

        <div style={{ padding: '0.5rem 1.5rem', overflow: 'auto', flex: 1 }}>

          {/* TAB: Observaciones pendientes */}
          {tab === 'observaciones' && (
            obsFiltradas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.4 }}>&#10003;</div>
                <p style={{ color: '#2e7d32', fontSize: '0.88rem', fontWeight: 600, margin: 0 }}>
                  {observaciones.length === 0 ? 'Sin observaciones pendientes' : 'Sin resultados para el filtro'}
                </p>
                {observaciones.length === 0 && <p style={{ color: '#6c757d', fontSize: '0.78rem', margin: '0.3rem 0 0' }}>El inventario puede continuar sin bloqueos.</p>}
              </div>
            ) : (
              obsFiltradas.map(obs => (
                <div
                  key={obs.id}
                  style={{ display: 'flex', gap: '0.65rem', padding: '0.7rem 0.85rem', background: '#fff', border: '1px solid #f5c6cb', borderLeft: '4px solid #d13c47', borderRadius: '8px', marginBottom: '0.6rem', cursor: onIrABien ? 'pointer' : 'default', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onClick={() => { if (onIrABien) { onIrABien(obs.placa); onClose() } }}
                  onMouseEnter={(e) => { if (onIrABien) { e.currentTarget.style.transform = 'translateX(3px)'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(209,60,71,0.12)' } }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
                  title={onIrABien ? 'Click para ir al bien en la tabla' : undefined}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <span style={{ background: '#d13c47', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px', fontFamily: 'monospace' }}>{obs.placa}</span>
                      <span style={{ fontSize: '0.75rem', color: '#5c6474', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{obs.descripcionBien}</span>
                    </div>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.85rem', color: '#212529', lineHeight: 1.4 }}>{obs.texto}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#6c757d' }}>
                        {new Date(obs.fechaCreacion).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {onIrABien && <span style={{ fontSize: '0.68rem', color: '#d13c47', fontWeight: 500 }}>Click para ubicar &#8594;</span>}
                    </div>
                  </div>
                </div>
              ))
            )
          )}

          {/* TAB: Notas */}
          {tab === 'notas' && (
            notasFiltradas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.4 }}>&#128221;</div>
                <p style={{ color: '#5c6474', fontSize: '0.88rem', fontWeight: 600, margin: 0 }}>
                  {notas.length === 0 ? 'No hay notas registradas' : 'Sin resultados para el filtro'}
                </p>
              </div>
            ) : (
              notasFiltradas.map(nota => (
                <div
                  key={nota.id}
                  style={{ display: 'flex', gap: '0.65rem', padding: '0.7rem 0.85rem', background: '#fff', border: '1px solid #c3d4f7', borderLeft: '4px solid #1565c0', borderRadius: '8px', marginBottom: '0.6rem', cursor: onIrABien ? 'pointer' : 'default', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onClick={() => { if (onIrABien) { onIrABien(nota.placa); onClose() } }}
                  onMouseEnter={(e) => { if (onIrABien) { e.currentTarget.style.transform = 'translateX(3px)'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(21,101,192,0.12)' } }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
                  title={onIrABien ? 'Click para ir al bien en la tabla' : undefined}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <span style={{ background: '#1565c0', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px', fontFamily: 'monospace' }}>{nota.placa}</span>
                      <span style={{ fontSize: '0.75rem', color: '#5c6474', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nota.descripcionBien}</span>
                      {nota.contexto && <span style={{ fontSize: '0.65rem', color: '#1565c0', background: '#e3f2fd', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>{nota.contexto}</span>}
                    </div>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.85rem', color: '#212529', lineHeight: 1.4 }}>{nota.texto}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#6c757d' }}>
                        {new Date(nota.fechaCreacion).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {nota.fechaResolucion && ' (resuelta)'}
                      </span>
                      {onIrABien && <span style={{ fontSize: '0.68rem', color: '#1565c0', fontWeight: 500 }}>Click para ubicar &#8594;</span>}
                    </div>
                  </div>
                </div>
              ))
            )
          )}

          {/* TAB: Estado M */}
          {tab === 'estado-m' && (
            malEstadoFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.4 }}>&#9989;</div>
                <p style={{ color: '#2e7d32', fontSize: '0.88rem', fontWeight: 600, margin: 0 }}>
                  {bienesEstadoM.length === 0 ? 'No hay bienes con estado malo' : 'Sin resultados para el filtro'}
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#e65100', color: 'white' }}>
                  <tr>
                    <th style={{ padding: '0.5rem' }}>#</th>
                    <th style={{ padding: '0.5rem' }}>Placa</th>
                    <th style={{ padding: '0.5rem' }}>Descripción</th>
                    <th style={{ padding: '0.5rem' }}>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {malEstadoFiltrados.map((b, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: '#fff5f5' }}>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>{i + 1}</td>
                      <td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>{b.placa}</td>
                      <td style={{ padding: '0.35rem 0.5rem' }}>{b.descripcion || '--'}</td>
                      <td style={{ padding: '0.35rem 0.5rem' }}>{b.nombre_responsable || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>

        <div className="inventario-fisico__modal-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderTop: '1px solid rgb(48 61 80 / 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.75rem' }}>
            {observaciones.length > 0 && <span style={{ background: '#fce4ec', color: '#d13c47', padding: '0.2rem 0.5rem', borderRadius: '12px', fontWeight: 600 }}>{observaciones.length} obs.</span>}
            {notas.length > 0 && <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '0.2rem 0.5rem', borderRadius: '12px', fontWeight: 600 }}>{notas.length} notas</span>}
            {bienesEstadoM.length > 0 && <span style={{ background: '#fff3e0', color: '#e65100', padding: '0.2rem 0.5rem', borderRadius: '12px', fontWeight: 600 }}>{bienesEstadoM.length} estado M</span>}
            {observaciones.length === 0 && notas.length === 0 && bienesEstadoM.length === 0 && <span style={{ color: '#6c757d' }}>Sin alertas</span>}
          </div>
          <button className="floresta-busqueda__btn" onClick={onClose} style={{ padding: '0.4rem 1.25rem', borderRadius: '6px' }}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
