import { useEffect, useRef, useState } from 'react'
import { FaCheckCircle, FaExclamationCircle, FaExclamationTriangle, FaInfoCircle, FaTimes } from 'react-icons/fa'
import './Toast.css'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning' | 'critical'

export interface ToastProps {
  message: string
  variant: ToastVariant
  duration?: number
  requireConfirm?: boolean
  onClose: () => void
}

export function Toast({ message, variant, duration = 8000, requireConfirm = false, onClose }: ToastProps) {
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(100)
  const [isExiting, setIsExiting] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const remainingTimeRef = useRef<number>(duration)

  // Agregar estilos de animación al head
  useEffect(() => {
    const styleId = 'toast-animations'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        @keyframes slideInRight {
          0% {
            transform: translateX(100%);
            opacity: 0;
          }
          50% {
            transform: translateX(-10px);
          }
          70% {
            transform: translateX(5px);
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
        @keyframes pulse {
          0%, 100% { 
            transform: scale(1);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
          }
          50% { 
            transform: scale(1.05);
            box-shadow: 0 12px 32px rgba(239, 68, 68, 0.25), 0 4px 12px rgba(239, 68, 68, 0.15);
          }
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  useEffect(() => {
    // Si duration es Infinity, no iniciar timer automático
    if (duration === Infinity) {
      setProgress(100)
      return
    }

    const startTimer = () => {
      startTimeRef.current = Date.now()
      
      // Timer para cerrar el toast
      timerRef.current = setTimeout(() => {
        handleClose()
      }, remainingTimeRef.current)

      // Interval para actualizar la barra de progreso
      progressIntervalRef.current = setInterval(() => {
        if (!isPaused) {
          const elapsed = Date.now() - startTimeRef.current
          const remaining = Math.max(0, remainingTimeRef.current - elapsed)
          const progressPercent = (remaining / duration) * 100
          setProgress(progressPercent)
        }
      }, 16) // ~60fps
    }

    const pauseTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      const elapsed = Date.now() - startTimeRef.current
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed)
    }

    if (isPaused) {
      pauseTimer()
    } else {
      startTimer()
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [isPaused, duration])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => {
      onClose()
    }, 300)
  }

  // Paleta por tipo de notificación: fondo tintado + acento (borde/ícono/barra)
  const estilosVariante: Record<ToastVariant, { fondo: string; borde: string; acento: string; texto: string }> = {
    success:  { fondo: '#ecfdf5', borde: '#10b981', acento: '#059669', texto: '#065f46' },
    error:    { fondo: '#fef2f2', borde: '#ef4444', acento: '#dc2626', texto: '#7f1d1d' },
    warning:  { fondo: '#fffbeb', borde: '#f59e0b', acento: '#d97706', texto: '#78350f' },
    info:     { fondo: '#eff6ff', borde: '#3b82f6', acento: '#2563eb', texto: '#1e3a8a' },
    critical: { fondo: '#fef2f2', borde: '#dc2626', acento: '#b91c1c', texto: '#7f1d1d' },
  }
  const paleta = estilosVariante[variant] ?? estilosVariante.info

  const getIcon = () => {
    switch (variant) {
      case 'success':
        return <FaCheckCircle className="toast-icon" style={{ color: paleta.acento }} />
      case 'error':
      case 'critical':
        return <FaExclamationCircle className="toast-icon" style={{ color: paleta.acento }} />
      case 'info':
        return <FaInfoCircle className="toast-icon" style={{ color: paleta.acento }} />
      case 'warning':
        return <FaExclamationTriangle className="toast-icon" style={{ color: paleta.acento }} />
      default:
        return null
    }
  }

  const getAnimation = () => {
    if (isExiting) return 'slideOutRight 0.3s cubic-bezier(0.4, 0, 1, 1) forwards'
    if (isShaking) return 'pulse 1s ease-in-out 2'
    return 'slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
  }

  // Activar pulso después de que termine la animación de entrada
  useEffect(() => {
    const pulseTimer = setTimeout(() => {
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 1000)
    }, 600)

    return () => clearTimeout(pulseTimer)
  }, [])

  return (
    <div 
      className={`toast ${variant} ${isExiting ? 'exiting' : ''} ${isShaking ? 'shaking' : ''}`}
      role="alert"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        position: 'relative',
        minWidth: '280px',
        maxWidth: '400px',
        padding: requireConfirm ? '16px 20px 50px 20px' : '16px 20px 20px 20px',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        animation: getAnimation(),
        background: paleta.fondo,
        border: `1px solid ${paleta.borde}`,
        borderLeft: `5px solid ${paleta.acento}`,
        pointerEvents: 'auto',
        overflow: 'hidden',
        boxShadow: requireConfirm 
          ? '0 12px 40px rgba(220, 38, 38, 0.3), 0 4px 12px rgba(0, 0, 0, 0.15)' 
          : '0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)'
      }}
    >
      {getIcon()}
      <div className="toast-content" style={{ flex: 1, color: paleta.texto, fontSize: '14px', lineHeight: '1.5', fontWeight: 600 }}>{message}</div>
      
      {/* Botón X solo si NO requiere confirmación */}
      {!requireConfirm && (
        <button
          type="button"
          className="toast-close"
          onClick={handleClose}
          aria-label="Cerrar notificación"
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            borderRadius: '4px',
            flexShrink: 0
          }}
        >
          <FaTimes />
        </button>
      )}
      
      {/* Botón de confirmación de lectura para alertas críticas */}
      {requireConfirm && (
        <button
          type="button"
          onClick={handleClose}
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            padding: '6px 20px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.2s',
            letterSpacing: '0.02em'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#b91c1c' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#dc2626' }}
        >
          Entendido ✓
        </button>
      )}
      
      {/* Barra de progreso solo si no requiere confirmación */}
      {!requireConfirm && (
        <div 
          className="toast-progress-bar" 
          style={{ 
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '4px',
            width: `${progress}%`,
            backgroundColor: paleta.acento
          }} 
        />
      )}
    </div>
  )
}
