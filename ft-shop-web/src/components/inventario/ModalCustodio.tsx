/**
 * Modal para asignar custodio/usuario a un bien.
 * Diferencia visualmente entre RESPONSABLE (quien sacó el bien de almacén)
 * y USUARIO (quien realmente tiene y usa el bien).
 */

import { useEffect } from 'react'
import SelectorCoordinador from './SelectorCoordinador'
import type { TerceroFirebird } from './SelectorCoordinador'

interface ModalCustodioProps {
  isOpen: boolean
  placa: string
  descripcion: string
  responsable: string
  cedulaResponsable?: string
  custodioActual?: { nombre: string; cedula: string } | null
  onAsignar: (nombre: string, cedula: string) => void
  onQuitar: () => void
  onClose: () => void
  onSuccess?: (msg: string) => void
  onWarning?: (msg: string) => void
  onError?: (msg: string) => void
}

export default function ModalCustodio({
  isOpen,
  placa,
  descripcion,
  responsable,
  cedulaResponsable,
  custodioActual,
  onAsignar,
  onQuitar,
  onClose,
  onSuccess,
}: ModalCustodioProps) {

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSeleccionar = (t: TerceroFirebird) => {
    onAsignar(t.nombre, t.cedula)
    onSuccess?.(`Usuario asignado: ${t.nombre}`)
    onClose()
  }

  const tieneUsuario = !!custodioActual?.nombre

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99990,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: '100%', maxWidth: '520px', maxHeight: '85vh',
        background: '#fff', borderRadius: '16px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.18), 0 8px 16px rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        margin: '0 16px',
      }}>

        {/* Header */}
        <div style={{
          padding: '1.1rem 1.5rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h5 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>
              Responsable y Usuario
            </h5>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              Verifique quién tiene el bien físicamente
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '30px', height: '30px', borderRadius: '8px',
              border: 'none', background: '#f1f5f9', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', color: '#64748b', transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#1e293b' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.2rem 1.5rem', overflow: 'auto', flex: 1 }}>

          {/* ─── Placa y descripción centradas ─── */}
          <div style={{ textAlign: 'center', marginBottom: '18px' }}>
            <span style={{
              display: 'inline-block',
              fontWeight: 800, color: '#0d47a1', fontSize: '1.15rem',
              fontFamily: 'ui-monospace, Consolas, monospace',
              background: 'rgba(13, 71, 161, 0.06)', padding: '6px 16px',
              borderRadius: '8px', letterSpacing: '0.03em',
            }}>{placa}</span>
            <p style={{
              margin: '8px 0 0', fontSize: '0.88rem', fontWeight: 600,
              color: '#334155', lineHeight: 1.3,
            }}>{descripcion || '—'}</p>
          </div>

          {/* ─── SECCIÓN: RESPONSABLE ─── */}
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: '10px', padding: '14px 16px', marginBottom: '12px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
            }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '6px',
                background: '#334155', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <span style={{
                fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: '#475569',
              }}>Responsable</span>
            </div>
            <div style={{ paddingLeft: '30px' }}>
              <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                {responsable || '—'}
              </p>
              {cedulaResponsable && (
                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                  CC {cedulaResponsable}
                </p>
              )}
            </div>
          </div>

          {/* ─── SECCIÓN: USUARIO ─── */}
          <div style={{
            background: tieneUsuario ? '#f8fafc' : '#fffbeb',
            border: `1px solid ${tieneUsuario ? '#e2e8f0' : '#fde68a'}`,
            borderRadius: '10px', padding: '14px 16px', marginBottom: '16px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
            }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '6px',
                background: tieneUsuario ? '#059669' : '#d97706',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <span style={{
                fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: tieneUsuario ? '#475569' : '#92400e',
              }}>Usuario</span>
              <span style={{
                fontSize: '0.58rem', color: '#94a3b8', fontStyle: 'italic',
              }}>Quien tiene el bien</span>
            </div>
            <div style={{ paddingLeft: '30px' }}>
              {tieneUsuario ? (
                <>
                  <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                    {custodioActual!.nombre}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                    CC {custodioActual!.cedula}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#92400e', fontWeight: 500 }}>
                  Sin asignar
                </p>
              )}
            </div>
          </div>

          {/* ─── Buscador ─── */}
          <div style={{
            background: '#fff', border: '1px solid #e2e8f0',
            borderRadius: '10px', padding: '14px 16px',
          }}>
            <label style={{
              fontSize: '0.78rem', fontWeight: 700, color: '#334155',
              display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {tieneUsuario ? 'Cambiar usuario' : 'Asignar usuario'}
            </label>
            <SelectorCoordinador
              valor=""
              onChange={() => {}}
              onSeleccionar={handleSeleccionar}
              placeholder="Cédula o nombre (mín. 3 caracteres)..."
              autoFocus
            />
            <p style={{
              fontSize: '0.66rem', color: '#94a3b8', margin: '0.4rem 0 0',
            }}>
              Busque por cédula o nombre y seleccione del listado.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.85rem 1.5rem', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'center', gap: '10px',
          background: '#f8fafc', flexWrap: 'wrap',
        }}>
          {tieneUsuario && (
            <button
              onClick={() => { onQuitar(); onSuccess?.('Usuario removido'); onClose() }}
              style={{
                padding: '0.55rem 1.4rem', fontSize: '0.82rem', fontWeight: 600,
                borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                background: 'transparent', border: '1.5px solid #ef4444', color: '#ef4444',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ef4444' }}
            >
              Quitar usuario
            </button>
          )}
          {responsable && !tieneUsuario && (
            <button
              onClick={() => {
                onAsignar(responsable, cedulaResponsable || '')
                onSuccess?.(`Responsable confirmado como usuario`)
                onClose()
              }}
              style={{
                padding: '0.55rem 1.4rem', fontSize: '0.82rem', fontWeight: 600,
                borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                background: 'transparent', border: '1.5px solid #059669', color: '#059669',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#059669'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#059669' }}
            >
              Responsable = Usuario
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '0.55rem 1.8rem', fontSize: '0.82rem', fontWeight: 600,
              borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
              background: '#1e293b', border: '1.5px solid #1e293b', color: '#fff',
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
