/**
 * Modal que muestra los bienes inventariados agrupados por servicio.
 * Cada servicio se presenta como un sub-grupo colapsable con su propio listado.
 */

import { useState, useMemo, useEffect } from 'react'

interface BienInventariado {
  placa: string
  descripcion?: string
  responsable?: string
  cedula?: string
  servicio_codigo?: string
  servicio_nombre?: string
  inventariado_en_servicio?: string
  inventariado_en_nombre?: string
  servicio_real_codigo?: string
  servicio_real_nombre?: string
  es_sobrante?: boolean
}

interface ModalInventariadosAgrupadoProps {
  isOpen: boolean
  bienes: BienInventariado[]
  cargando: boolean
  onClose: () => void
  serviciosHabilitados?: string[]
}

export default function ModalInventariadosAgrupado({ isOpen, bienes, cargando, onClose, serviciosHabilitados = [] }: ModalInventariadosAgrupadoProps) {
  const [filtro, setFiltro] = useState('')
  const [gruposColapsados, setGruposColapsados] = useState<Set<string>>(new Set())

  const bienesFiltrados = useMemo(() => {
    if (!filtro.trim()) return bienes
    const t = filtro.trim().toLowerCase()
    return bienes.filter(b =>
      (b.placa || '').toLowerCase().includes(t) ||
      (b.descripcion || '').toLowerCase().includes(t) ||
      (b.responsable || '').toLowerCase().includes(t) ||
      (b.cedula || '').includes(t) ||
      (b.servicio_nombre || '').toLowerCase().includes(t) ||
      (b.servicio_codigo || '').toLowerCase().includes(t)
    )
  }, [bienes, filtro])

  const grupos = useMemo(() => {
    const mapa = new Map<string, { codigo: string; nombre: string; bienes: BienInventariado[] }>()
    for (const bien of bienesFiltrados) {
      const key = bien.servicio_codigo || 'SIN_SERVICIO'
      if (!mapa.has(key)) {
        mapa.set(key, {
          codigo: bien.servicio_codigo || 'SIN_SERVICIO',
          nombre: bien.servicio_nombre || 'Sin servicio asignado',
          bienes: [],
        })
      }
      mapa.get(key)!.bienes.push(bien)
    }
    for (const grupo of mapa.values()) {
      grupo.bienes.sort((a, b) => {
        const aSob = a.es_sobrante ? 1 : 0
        const bSob = b.es_sobrante ? 1 : 0
        return aSob - bSob
      })
    }
    return Array.from(mapa.values()).sort((a, b) => b.bienes.length - a.bienes.length)
  }, [bienesFiltrados])

  const toggleGrupo = (codigo: string) => {
    setGruposColapsados(prev => {
      const next = new Set(prev)
      if (next.has(codigo)) next.delete(codigo)
      else next.add(codigo)
      return next
    })
  }

  const expandirTodos = () => setGruposColapsados(new Set())
  const colapsarTodos = () => setGruposColapsados(new Set(grupos.map(g => g.codigo)))

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const totalInventariados = bienes.filter(b => !b.es_sobrante).length
  const totalSobrantes = bienes.filter(b => b.es_sobrante).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99990,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: '100%', maxWidth: '860px', maxHeight: '88vh',
        background: '#fff', borderRadius: '16px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.18), 0 8px 16px rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div>
              <h5 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Bienes inventariados</h5>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {totalInventariados} registrado{totalInventariados !== 1 ? 's' : ''}{totalSobrantes > 0 ? ` · ${totalSobrantes} sobrante${totalSobrantes !== 1 ? 's' : ''}` : ''} · {grupos.length} servicio{grupos.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#64748b', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#1e293b' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b' }}
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar por placa, descripción, responsable..."
              autoFocus
              style={{
                width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem',
                background: '#f8fafc', outline: 'none', transition: 'all 0.15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.background = '#fff' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc' }}
            />
          </div>
          <button
            onClick={expandirTodos}
            style={{ padding: '0.45rem 0.7rem', fontSize: '0.72rem', fontWeight: 600, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc' }}
          >
            Expandir
          </button>
          <button
            onClick={colapsarTodos}
            style={{ padding: '0.45rem 0.7rem', fontSize: '0.72rem', fontWeight: 600, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc' }}
          >
            Colapsar
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem' }}>
          {cargando ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#059669', borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ margin: 0, fontSize: '0.85rem' }}>Cargando bienes...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          ) : bienes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>No hay bienes inventariados aún.</p>
            </div>
          ) : (
            <>
              {/* Grupos */}
              {grupos.map((grupo) => {
                const colapsado = gruposColapsados.has(grupo.codigo)
                const esSobrante = grupo.bienes.every(b => b.es_sobrante)

                return (
                  <div key={grupo.codigo} style={{ marginBottom: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    {/* Group header */}
                    <div
                      onClick={() => toggleGrupo(grupo.codigo)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.65rem 1rem', cursor: 'pointer', userSelect: 'none',
                        background: esSobrante ? '#faf5ff' : '#f8fafc',
                        borderLeft: `4px solid ${esSobrante ? '#a855f7' : '#059669'}`,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = esSobrante ? '#f3e8ff' : '#f1f5f9' }}
                      onMouseLeave={e => { e.currentTarget.style.background = esSobrante ? '#faf5ff' : '#f8fafc' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', transition: 'transform 0.2s', transform: colapsado ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>{grupo.nombre}</span>
                            {esSobrante && (
                              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>SOBRANTES</span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{grupo.codigo}</span>
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 700, color: '#fff', minWidth: '26px', textAlign: 'center',
                        background: esSobrante ? '#a855f7' : '#059669',
                        padding: '0.2rem 0.55rem', borderRadius: '12px',
                      }}>
                        {grupo.bienes.length}
                      </span>
                    </div>

                    {/* Table */}
                    {!colapsado && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', width: '36px' }}>#</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Placa</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Descripción</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Servicio</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Responsable</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Cédula</th>
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.bienes.map((b, i) => (
                              <tr key={`${grupo.codigo}-${i}`} style={{ borderBottom: '1px solid #f1f5f9', background: b.es_sobrante ? '#fefce8' : i % 2 === 0 ? '#fff' : '#fafbfd' }}>
                                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.72rem' }}>{i + 1}</td>
                                <td style={{ padding: '0.45rem 0.6rem' }}>
                                  <span style={{ fontWeight: 600, color: '#1e293b', fontFamily: 'monospace', fontSize: '0.8rem' }}>{b.placa}</span>
                                  {b.es_sobrante && (
                                    <span style={{ marginLeft: '0.4rem', fontSize: '0.58rem', fontWeight: 700, color: '#a855f7', background: '#faf5ff', padding: '0.1rem 0.3rem', borderRadius: '3px', border: '1px solid #e9d5ff', verticalAlign: 'middle' }}>
                                      SOBRANTE
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '0.45rem 0.6rem', color: '#475569', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.descripcion || '—'}</td>
                                <td style={{ padding: '0.45rem 0.6rem' }}>
                                  {renderServicioBadge(b, serviciosHabilitados)}
                                </td>
                                <td style={{ padding: '0.45rem 0.6rem', color: '#475569' }}>{b.responsable || '—'}</td>
                                <td style={{ padding: '0.45rem 0.6rem', color: '#64748b', fontFamily: 'monospace', fontSize: '0.75rem' }}>{b.cedula || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}

              {filtro && bienesFiltrados.length !== bienes.length && (
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
                  Mostrando {bienesFiltrados.length} de {bienes.length} bienes
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.85rem 1.5rem', borderTop: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669' }} />
              {totalInventariados} inventariado{totalInventariados !== 1 ? 's' : ''}
            </span>
            {totalSobrantes > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#a855f7', fontWeight: 600 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a855f7' }} />
                {totalSobrantes} sobrante{totalSobrantes !== 1 ? 's' : ''}
              </span>
            )}
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{bienes.length} total</span>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.5rem', fontSize: '0.82rem', fontWeight: 600,
              background: '#1e293b', color: '#fff', border: 'none', borderRadius: '8px',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#334155' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1e293b' }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Badge de servicio con contraste adecuado */
function renderServicioBadge(b: BienInventariado, serviciosHabilitados: string[]) {
  const codigo = b.servicio_real_codigo || b.servicio_codigo || ''
  if (!codigo) return <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>
  const esDelServicio = serviciosHabilitados.length === 0 || serviciosHabilitados.includes(codigo)
  if (esDelServicio) {
    return (
      <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '4px', padding: '0.15rem 0.4rem', fontWeight: 600, color: '#065f46' }}>
        {codigo}
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', padding: '0.15rem 0.4rem', fontWeight: 600, color: '#92400e' }}>
      <span style={{ fontFamily: 'monospace' }}>{codigo}</span>
      <span style={{ fontSize: '0.6rem', fontWeight: 500, color: '#b45309', opacity: 0.8 }}>↗</span>
    </span>
  )
}
