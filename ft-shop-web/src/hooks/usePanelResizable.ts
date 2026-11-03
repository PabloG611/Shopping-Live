/**
 * usePanelResizable.ts
 *
 * Maneja el ancho arrastrable de un panel lateral derecho (consulta-lateral--der).
 * Devuelve el ancho actual y un handler onMouseDown para la manija de arrastre.
 * El ancho se conserva en localStorage por clave.
 */

import { useState, useRef, useCallback } from 'react'

interface Opciones {
  /** Clave de localStorage para recordar el ancho. */
  storageKey: string
  /** Ancho por defecto en px. */
  defecto?: number
  /** Ancho mínimo en px. */
  min?: number
  /** Ancho máximo en px. */
  max?: number
}

export function usePanelResizable({ storageKey, defecto = 300, min = 240, max = 640 }: Opciones) {
  const [ancho, setAncho] = useState<number>(() => {
    try {
      const guardado = localStorage.getItem(storageKey)
      const n = guardado ? parseInt(guardado, 10) : NaN
      if (!Number.isNaN(n)) return Math.min(max, Math.max(min, n))
    } catch { /* ignore */ }
    return defecto
  })
  // Ref con el último ancho, para persistir al soltar sin recrear el listener.
  const anchoRef = useRef(ancho)
  anchoRef.current = ancho

  // Lógica común de arrastre: funciona para ratón (mouse) y para dedo (touch).
  // `startX` es la coordenada X inicial del puntero; luego seguimos su movimiento.
  const arrastrarDesde = useCallback((startX: number, esTouch: boolean) => {
    const startW = anchoRef.current
    if (!esTouch) {
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    const aplicarDelta = (clientX: number) => {
      // El panel está a la derecha: arrastrar hacia la izquierda lo agranda.
      const delta = startX - clientX
      setAncho(Math.min(max, Math.max(min, startW + delta)))
    }

    const onMouseMove = (ev: MouseEvent) => aplicarDelta(ev.clientX)
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 0) {
        // Evita el scroll de la página mientras se redimensiona con el dedo.
        ev.preventDefault()
        aplicarDelta(ev.touches[0].clientX)
      }
    }
    const finalizar = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', finalizar)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', finalizar)
      document.removeEventListener('touchcancel', finalizar)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try { localStorage.setItem(storageKey, String(anchoRef.current)) } catch { /* ignore */ }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', finalizar)
    // passive: false para poder llamar preventDefault() y no hacer scroll.
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', finalizar)
    document.addEventListener('touchcancel', finalizar)
  }, [min, max, storageKey])

  // Inicia el arrastre con RATÓN desde la manija (orilla izquierda del panel).
  const iniciarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    arrastrarDesde(e.clientX, false)
  }, [arrastrarDesde])

  // Inicia el arrastre TÁCTIL (tablet/móvil) desde la manija.
  const iniciarResizeTouch = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) return
    arrastrarDesde(e.touches[0].clientX, true)
  }, [arrastrarDesde])

  return { ancho, iniciarResize, iniciarResizeTouch }
}
