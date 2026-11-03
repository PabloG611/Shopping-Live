/**
 * Avatar interactivo del usuario logueado.
 * Hover: la animación Lottie se expande desde el círculo y se muestra grande
 * junto con la info del usuario.
 */

import { useEffect, useRef, useState } from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { useTransferencias } from '../../context/useTransferencias'

const LOTTIE_WAVING_URL = 'https://lottie.host/12686dc7-83ca-43cc-ba65-12abeaca6374/qGxTZs23jY.json'

function getNombreCorto(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/)
  if (partes.length >= 4) return `${partes[2]} ${partes[0]}`
  if (partes.length === 3) return `${partes[2]} ${partes[0]}`
  return partes.slice(0, 2).join(' ')
}

function getInitials(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/)
  if (partes.length >= 4) return `${partes[2][0]}${partes[0][0]}`
  return partes.slice(0, 2).map(p => p[0]).join('')
}

export function UserAvatarChip() {
  const { sesionUsuario } = useTransferencias()
  const [hover, setHover] = useState(false)
  const [showWave, setShowWave] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  // Mostrar animación al inicio y cada 15 segundos por 4 segundos
  useEffect(() => {
    const timeout = setTimeout(() => setShowWave(false), 4000)
    intervalRef.current = setInterval(() => {
      setShowWave(true)
      setTimeout(() => setShowWave(false), 4000)
    }, 15000)
    return () => {
      clearTimeout(timeout)
      clearInterval(intervalRef.current)
    }
  }, [])

  if (!sesionUsuario) return null

  const nombreCorto = getNombreCorto(sesionUsuario.nombreCompleto)
  const initials = getInitials(sesionUsuario.nombreCompleto)

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => setHover(h => !h)}
    >
      {/* Chip compacto */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.35rem 0.9rem 0.35rem 0.35rem',
        background: hover ? 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)' : '#f8fafc',
        border: `1.5px solid ${hover ? '#818cf8' : '#e2e8f0'}`,
        borderRadius: '50px', cursor: 'pointer',
        transition: 'all 0.25s ease',
        boxShadow: hover ? '0 4px 16px rgba(99,102,241,0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        {/* Círculo con Lottie o iniciales */}
        <div style={{
          width: '46px', height: '46px', borderRadius: '50%',
          background: (showWave && !hover) ? 'transparent' : 'linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 700, fontSize: '0.82rem',
          position: 'relative',
          boxShadow: (showWave && !hover) ? 'none' : '0 2px 8px rgba(79,70,229,0.3)',
          overflow: 'visible',
          transition: 'background 0.4s, box-shadow 0.4s',
        }}>
          {showWave && !hover ? (
            <DotLottieReact
              src={LOTTIE_WAVING_URL}
              loop
              autoplay
              style={{
                width: '82px', height: '82px',
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                animation: 'avatarBreath 3s ease-in-out infinite',
              }}
            />
          ) : (
            initials
          )}
        </div>
        {/* Indicador online - fuera del círculo para que siempre se vea */}
        <div style={{
          position: 'absolute', bottom: '-2px', left: '36px',
          width: '10px', height: '10px', borderRadius: '50%',
          background: '#22c55e', border: '2px solid white',
          animation: 'onlinePulse 2s ease-in-out infinite',
          zIndex: 2,
          display: showWave ? 'none' : 'block',
        }} />

        {/* Nombre */}
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>{nombreCorto}</span>
          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>En línea</span>
        </div>
      </div>

      {/* Panel expandido al hover con Lottie grande */}
      {hover && (
        <div className="user-avatar-popup" style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'white', border: '1px solid #e2e8f0',
          borderRadius: '16px', padding: '0',
          boxShadow: '0 16px 48px rgba(0,0,0,0.14), 0 0 0 1px rgba(99,102,241,0.06)',
          zIndex: 100, width: '280px', overflow: 'hidden',
          animation: 'panelPopIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transformOrigin: 'top right',
        }}>
          {/* Lottie grande arriba */}
          <div style={{
            background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0.5rem 0',
          }}>
            <DotLottieReact
              src={LOTTIE_WAVING_URL}
              loop
              autoplay
              style={{ width: '180px', height: '180px' }}
            />
          </div>

          {/* Info del usuario */}
          <div style={{ padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.15rem' }}>
              {sesionUsuario.nombreCompleto}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.6rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              Sesión activa
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16"/><path d="M17 4v16"/></svg>
                <span style={{ fontSize: '0.76rem', color: '#475569' }}>CC {sesionUsuario.numeroIdentificacion}</span>
              </div>
              {sesionUsuario.cargo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
                  <span style={{ fontSize: '0.76rem', color: '#475569' }}>{sesionUsuario.cargo}</span>
                </div>
              )}
              {sesionUsuario.dependencia && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  <span style={{ fontSize: '0.76rem', color: '#475569' }}>{sesionUsuario.dependencia}</span>
                </div>
              )}
              {sesionUsuario.grupo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#4f46e5', background: '#eef2ff', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #e0e7ff' }}>
                    {sesionUsuario.grupo}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes onlinePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
          50% { box-shadow: 0 0 0 4px rgba(34,197,94,0); }
        }
        @keyframes panelPopIn {
          from { opacity: 0; transform: scale(0.8) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes avatarBreath {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.12); }
        }
      `}</style>
    </div>
  )
}
