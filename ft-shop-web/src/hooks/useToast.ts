/**
 * useToast — Hook de notificaciones que usa Sileo como backend.
 * Ya no necesita <ToastContainer> — Sileo tiene su propio <Toaster> global en App.tsx.
 */
import { useCallback, useRef } from 'react'
import { sileo, type SileoOptions } from 'sileo'

type ToastVariant = 'success' | 'error' | 'info' | 'warning' | 'critical'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

const TITULOS: Record<ToastVariant, string> = {
  success: 'Éxito',
  error: 'Error',
  info: 'Información',
  warning: 'Atención',
  critical: 'Error crítico',
}

// Duración por defecto (ms) para los toasts que ANTES usaban `duration: null`
// (warning/critical/confirm). En sileo 0.1.5 el toast de tipo `action`
// respeta el `duration` numérico y se autocierra, así que ya NO se apilan
// indefinidamente. Se conserva el botón "Entendido" para cerrarlos a mano.
const DURACION_WARNING = 6000
const DURACION_CRITICAL = 8000
const DURACION_CONFIRM = 10000

// Límite de toasts de acción (warning/critical/confirm) visibles a la vez.
// sileo 0.1.5 NO expone un prop de máximo en <Toaster>, así que el tope se
// controla aquí: al superarlo, se cierra el más antiguo antes de abrir el nuevo.
const MAX_TOASTS_ACCION = 3

/** Color de fondo del toast (relleno del SVG de Sileo) según la variante. */
const FONDO: Record<ToastVariant, string> = {
  success: '#e9f9ef', // verde suave
  error: '#fdecec', // rojo/rosado suave
  info: '#e8f1fd', // azul suave
  warning: '#fef6e7', // ámbar suave
  critical: '#fdecec', // rojo/rosado suave
}

export function useToast() {
  // Ids de los toasts de acción activos (warning/critical/confirm). Se usan
  // tanto para limpiarlos como para aplicar el tope de simultáneos.
  const warningToastIds = useRef<string[]>([])

  const dismissWarning = useCallback((toastId: string) => {
    sileo.dismiss(toastId)
    warningToastIds.current = warningToastIds.current.filter((id) => id !== toastId)
  }, [])

  const clearWarnings = useCallback(() => {
    const toastIds = warningToastIds.current
    warningToastIds.current = []

    toastIds.forEach((toastId) => sileo.dismiss(toastId))
  }, [])

  // Registra un nuevo toast de acción y cierra los más antiguos si se supera el
  // tope de simultáneos, para que no se apilen en pantalla.
  const registrarToastAccion = useCallback((toastId: string) => {
    warningToastIds.current.push(toastId)
    while (warningToastIds.current.length > MAX_TOASTS_ACCION) {
      const masAntiguo = warningToastIds.current.shift()
      if (masAntiguo) sileo.dismiss(masAntiguo)
    }
  }, [])

  const addToast = useCallback((message: string, variant: ToastVariant, duration?: number) => {
    const id = `${Date.now()}-${Math.random()}`

    // NOTA: los toasts genéricos (validaciones de UI, éxito, avisos triviales)
    // ya NO se replican a la campana del ecosistema. La campana queda reservada
    // solo para alertas de negocio, que se envían explícitamente mediante
    // `alertaInventario.*` (placa duplicada, bien de baja, bodega, etc.).
    // Esto evita saturar la bandeja con mensajes como "Seleccione un servicio".

    // Warning y critical: usar sileo.action con botón "Entendido". Ahora con
    // duración finita (sileo 0.1.5 autocierra el toast de acción cuando el
    // `duration` es numérico) para que no se queden apilados en pantalla.
    if (variant === 'warning' || variant === 'critical') {
      const duracionAccion = variant === 'critical' ? DURACION_CRITICAL : DURACION_WARNING
      const toastId = sileo.action({
        id,
        title: TITULOS[variant],
        description: message,
        position: 'top-center',
        duration: duration ?? duracionAccion,
        fill: FONDO[variant],
        button: {
          title: 'Entendido',
          onClick: () => dismissWarning(toastId),
        },
      } as SileoOptions & { id: string })
      registrarToastAccion(toastId)
      return id
    }

    // success/info/error: duración por defecto de 8s si no se indica otra.
    const opts = {
      title: TITULOS[variant],
      description: message,
      position: 'top-center' as const,
      duration: duration ?? 8000,
      fill: FONDO[variant],
    }

    switch (variant) {
      case 'success': sileo.success(opts); break
      case 'error': sileo.error(opts); break
      case 'info': sileo.info(opts); break
    }
    return id
  }, [dismissWarning, registrarToastAccion])

  /** Toast de confirmación con acción. Da un margen amplio para interactuar,
   * pero con duración finita para que no se quede apilado si el usuario lo
   * ignora. También respeta el tope de toasts de acción simultáneos. */
  const confirm = useCallback((message: string, onAccept: () => void, options?: { label?: string }) => {
    const toastId = (sileo as any).action({
      title: 'Confirmar',
      description: message,
      position: 'top-center',
      duration: DURACION_CONFIRM,
      fill: '#e8f1fd',
      button: {
        title: options?.label || 'Aceptar',
        onClick: () => {
          if (typeof (sileo as any).dismiss === 'function') {
            (sileo as any).dismiss(toastId)
            warningToastIds.current = warningToastIds.current.filter((id) => id !== toastId)
          } else {
            sileo.clear()
            warningToastIds.current = []
          }
          setTimeout(() => onAccept(), 150)
        },
      },
    })
    registrarToastAccion(toastId)
  }, [registrarToastAccion])

  return {
    toasts: [] as Toast[],
    removeToast: (_id?: string) => {},
    success: (msg: string, duration?: number) => addToast(msg, 'success', duration),
    error: (msg: string, duration?: number) => addToast(msg, 'error', duration),
    info: (msg: string, duration?: number) => addToast(msg, 'info', duration),
    warning: (msg: string, duration?: number) => addToast(msg, 'warning', duration),
    critical: (msg: string, duration?: number) => addToast(msg, 'critical', duration),
    confirm,
    clearWarnings,
  }
}
