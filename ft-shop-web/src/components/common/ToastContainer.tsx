import { Toast, type ToastVariant } from './Toast'
import './Toast.css'

export type { ToastVariant }

export interface ToastData {
  id: string
  message: string
  variant: ToastVariant
  duration?: number
  requireConfirm?: boolean
}

interface ToastContainerProps {
  toasts: ToastData[]
  onRemove: (id: string) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div 
      className="toast-container"
      style={{
        position: 'fixed',
        top: '90px',
        right: '5px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pointerEvents: 'none'
      }}
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          duration={toast.duration}
          requireConfirm={toast.requireConfirm}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  )
}
