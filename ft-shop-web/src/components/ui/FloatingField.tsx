/**
 * Wrapper para floating label sobre cualquier selector o input.
 * El label empieza dentro del campo y sube animado cuando:
 * - El campo tiene foco (activo=true)
 * - El campo tiene valor (tieneValor=true)
 */
import { useState } from 'react'

interface FloatingFieldProps {
  label: string
  required?: boolean
  tieneValor: boolean
  children: React.ReactNode
}

export default function FloatingField({ label, required = false, tieneValor, children }: FloatingFieldProps) {
  const [focused, setFocused] = useState(false)
  const activo = focused || tieneValor

  return (
    <div
      style={{ position: 'relative' }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      {/* Label flotante */}
      <span
        style={{
          position: 'absolute',
          left: '0.75rem',
          top: activo ? '-0.55rem' : '50%',
          transform: activo ? 'none' : 'translateY(-50%)',
          fontSize: activo ? '0.68rem' : '0.82rem',
          fontWeight: activo ? 700 : 400,
          color: focused ? '#303d50' : activo ? '#5c6474' : '#6c757d',
          background: activo ? 'white' : 'transparent',
          padding: activo ? '0 0.3rem' : '0',
          zIndex: activo ? 10 : 0,
          pointerEvents: 'none',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          letterSpacing: activo ? '0.02em' : 'normal',
          textTransform: activo ? 'uppercase' : 'none',
        }}
      >
        {label}{required && <span style={{ color: '#d32f2f', marginLeft: '2px' }}>*</span>}
      </span>

      {/* Contenido (selector o input) */}
      {children}
    </div>
  )
}
