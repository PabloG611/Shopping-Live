/**
 * Modal que muestra los bienes faltantes por inventariar, agrupados por servicio.
 * Cada servicio se presenta como un sub-grupo colapsable con su propio listado.
 */

import { useState, useMemo } from 'react'

interface BienFaltante {
  placa: string
  descripcion?: string
  responsable?: string
  cedula?: string
  servicio_codigo?: string
  servicio_nombre?: string
}

interface ModalFaltantesAgrupadoProps {
  isOpen: boolean
  bienes: BienFaltante[]
  cargando: boolean
  onClose: () => void
}

export default function ModalFaltantesAgrupado({ isOpen, bienes, cargando, onClose }: ModalFaltantesAgrupadoProps) {
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

  // Agrupar por servicio
  const grupos = useMemo(() => {
    const mapa = new Map<string, { codigo: string; nombre: string; bienes: BienFaltante[] }>()
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
    // Ordenar grupos por cantidad de bienes (mayor a menor)
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

  if (!isOpen) return null

  return (
    <div className="inventario-fisico__modal-overlay">
      <div className="inventario-fisico__modal" style={{ maxWidth: '800px', maxHeight: '85vh' }}>
        <div className="inventario-fisico__modal-header">
          <h5>Bienes faltantes por inventariar</h5>
          <button className="inventario-fisico__modal-close" onClick={onClose}>×</button>
        </div>
        <div className="inventario-fisico__modal-body" style={{ overflow: 'auto', maxHeight: '65vh' }}>
          {cargando ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>Cargando...</p>
          ) : bienes.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#2e7d32', fontWeight: 600 }}>Todos los bienes han sido inventariados.</p>
          ) : (
            <>
              {/* Barra de filtro y acciones */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  placeholder="Filtrar por placa, descripción, responsable, cédula o servicio..."
                  style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '0.85rem' }}
                  autoFocus
                />
                <button
                  onClick={expandirTodos}
                  style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  title="Expandir todos los grupos"
                >
                  Expandir
                </button>
                <button
                  onClick={colapsarTodos}
                  style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', background: '#f3e5f5', border: '1px solid #ce93d8', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  title="Colapsar todos los grupos"
                >
                  Colapsar
                </button>
              </div>

              {/* Resumen rápido */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: '#5c6474', background: '#fff3e0', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                  {grupos.length} servicio{grupos.length !== 1 ? 's' : ''} &middot; {bienesFiltrados.length} bienes faltantes
                </span>
              </div>

              {/* Grupos por servicio */}
              {grupos.map((grupo) => {
                const colapsado = gruposColapsados.has(grupo.codigo)
                return (
                  <div key={grupo.codigo} style={{ marginBottom: '0.75rem', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
                    {/* Header del grupo */}
                    <div
                      onClick={() => toggleGrupo(grupo.codigo)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 0.85rem',
                        background: '#fff8f0',
                        cursor: 'pointer',
                        borderBottom: colapsado ? 'none' : '1px solid #e0e0e0',
                        userSelect: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', transition: 'transform 0.2s', transform: colapsado ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                          ▼
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#303d50' }}>
                          {grupo.nombre}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#78909c', fontFamily: 'monospace' }}>
                          {grupo.codigo}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#fff', background: '#e65100', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 600 }}>
                        {grupo.bienes.length}
                      </span>
                    </div>

                    {/* Tabla de bienes del grupo */}
                    {!colapsado && (
                      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#303d50', color: 'white' }}>
                          <tr>
                            <th style={{ padding: '0.4rem 0.5rem', width: '35px' }}>#</th>
                            <th style={{ padding: '0.4rem 0.5rem' }}>Placa</th>
                            <th style={{ padding: '0.4rem 0.5rem' }}>Descripción</th>
                            <th style={{ padding: '0.4rem 0.5rem' }}>Responsable</th>
                            <th style={{ padding: '0.4rem 0.5rem' }}>Cédula</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.bienes.map((b, i) => (
                            <tr key={`${grupo.codigo}-${i}`} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                              <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center', color: '#6c757d' }}>{i + 1}</td>
                              <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>{b.placa}</td>
                              <td style={{ padding: '0.3rem 0.5rem' }}>{b.descripcion || '--'}</td>
                              <td style={{ padding: '0.3rem 0.5rem' }}>{b.responsable || '--'}</td>
                              <td style={{ padding: '0.3rem 0.5rem' }}>{b.cedula || '--'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })}

              {filtro && bienesFiltrados.length !== bienes.length && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#6c757d' }}>
                  Mostrando {bienesFiltrados.length} de {bienes.length} bienes (filtrado)
                </p>
              )}
            </>
          )}
        </div>
        <div className="inventario-fisico__modal-footer">
          <span style={{ fontSize: '0.85rem', color: '#5c6474' }}>
            {bienes.length} bienes faltantes en {grupos.length} servicio{grupos.length !== 1 ? 's' : ''}
          </span>
          <button className="floresta-busqueda__btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
