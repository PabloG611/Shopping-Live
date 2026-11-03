/**
 * Modal compartido para mostrar bienes faltantes por inventariar.
 * Usado en Inventario Regionales (lista plana sin agrupación por servicio).
 */

import { useState } from 'react'

interface BienFaltante {
  placa: string
  descripcion?: string
  responsable?: string
  cedula?: string
}

interface ModalFaltantesProps {
  isOpen: boolean
  bienes: BienFaltante[]
  cargando: boolean
  onClose: () => void
  titulo?: string
  mensajeVacio?: string
}

export default function ModalFaltantes({ isOpen, bienes, cargando, onClose, titulo, mensajeVacio }: ModalFaltantesProps) {
  const [filtro, setFiltro] = useState('')

  if (!isOpen) return null

  const bienesFiltrados = filtro.trim()
    ? bienes.filter(b => {
        const t = filtro.trim().toLowerCase()
        return (b.placa || '').toLowerCase().includes(t) ||
               (b.descripcion || '').toLowerCase().includes(t) ||
               (b.responsable || '').toLowerCase().includes(t) ||
               (b.cedula || '').includes(t)
      })
    : bienes

  return (
    <div className="inventario-fisico__modal-overlay">
      <div className="inventario-fisico__modal" style={{ maxWidth: '700px', maxHeight: '80vh' }}>
        <div className="inventario-fisico__modal-header">
          <h5>{titulo || 'Bienes faltantes por inventariar'}</h5>
          <button className="inventario-fisico__modal-close" onClick={onClose}>×</button>
        </div>
        <div className="inventario-fisico__modal-body" style={{ overflow: 'auto', maxHeight: '60vh' }}>
          {cargando ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>Cargando...</p>
          ) : bienes.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#2e7d32', fontWeight: 600 }}>{mensajeVacio || 'Todos los bienes han sido inventariados.'}</p>
          ) : (
            <>
              <input
                type="text"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Filtrar por placa, descripción, responsable o cédula..."
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '0.75rem' }}
                autoFocus
              />
              <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#303d50', color: 'white' }}>
                  <tr>
                    <th style={{ padding: '0.5rem' }}>#</th>
                    <th style={{ padding: '0.5rem' }}>Placa</th>
                    <th style={{ padding: '0.5rem' }}>Descripción</th>
                    <th style={{ padding: '0.5rem' }}>Responsable</th>
                    <th style={{ padding: '0.5rem' }}>Cédula</th>
                  </tr>
                </thead>
                <tbody>
                  {bienesFiltrados.map((b, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center', color: '#6c757d' }}>{i + 1}</td>
                      <td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>{b.placa}</td>
                      <td style={{ padding: '0.35rem 0.5rem' }}>{b.descripcion || '--'}</td>
                      <td style={{ padding: '0.35rem 0.5rem' }}>{b.responsable || '--'}</td>
                      <td style={{ padding: '0.35rem 0.5rem' }}>{b.cedula || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtro && bienesFiltrados.length !== bienes.length && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#6c757d' }}>
                  Mostrando {bienesFiltrados.length} de {bienes.length}
                </p>
              )}
            </>
          )}
        </div>
        <div className="inventario-fisico__modal-footer">
          <span style={{ fontSize: '0.85rem', color: '#5c6474' }}>{bienes.length} {titulo ? 'bienes' : 'bienes faltantes'}</span>
          <button className="floresta-busqueda__btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
