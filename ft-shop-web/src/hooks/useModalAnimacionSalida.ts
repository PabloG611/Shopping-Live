import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

const MS_CIERRE_RESPALDO = 380
/** Debe cubrir la animación larga de salida (backdrop + margen). */
const MS_CIERRE_RESPALDO_LENTO = 720

/**
 * Cierra el modal con animación de salida y llama a `onCerrar` al terminar.
 * `resetKey` (p. ej. código de solicitud) reinicia el estado interno si el modal
 * muestra otro registro sin desmontarse.
 *
 * `solicitarCierreLento` alarga la animación de salida (opcional).
 */
export function useModalAnimacionSalida(onCerrar: () => void, resetKey?: string) {
  const [saliendo, setSaliendo] = useState(false)
  const saliendoRef = useRef(false)
  const salidaLentaRef = useRef(false)
  const yaInvocoCierre = useRef(false)
  const timerRespaldoRef = useRef<number | null>(null)

  const limpiarTimerRespaldo = useCallback(() => {
    if (timerRespaldoRef.current !== null) {
      window.clearTimeout(timerRespaldoRef.current)
      timerRespaldoRef.current = null
    }
  }, [])

  const finalizarCierre = useCallback(() => {
    if (yaInvocoCierre.current) return
    yaInvocoCierre.current = true
    saliendoRef.current = false
    limpiarTimerRespaldo()
    onCerrar()
  }, [onCerrar, limpiarTimerRespaldo])

  useEffect(() => {
    if (resetKey === undefined) return
    yaInvocoCierre.current = false
    saliendoRef.current = false
    salidaLentaRef.current = false
    limpiarTimerRespaldo()
    setSaliendo(false)
  }, [resetKey, limpiarTimerRespaldo])

  const iniciarCierre = useCallback(
    (lento: boolean) => {
      if (yaInvocoCierre.current || saliendoRef.current) return
      salidaLentaRef.current = lento
      saliendoRef.current = true
      flushSync(() => setSaliendo(true))
      limpiarTimerRespaldo()
      const ms = lento ? MS_CIERRE_RESPALDO_LENTO : MS_CIERRE_RESPALDO
      timerRespaldoRef.current = window.setTimeout(() => {
        timerRespaldoRef.current = null
        finalizarCierre()
      }, ms)
    },
    [finalizarCierre, limpiarTimerRespaldo],
  )

  const solicitarCierre = useCallback(() => iniciarCierre(false), [iniciarCierre])
  const solicitarCierreLento = useCallback(() => iniciarCierre(true), [iniciarCierre])

  const onFinAnimacionBackdrop = useCallback(
    (e: React.AnimationEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return
      if (!saliendoRef.current) return
      const nombres = String(e.animationName)
        .split(',')
        .map((n) => n.trim())
      const esSalidaBackdrop = nombres.some((n) => n.includes('backdrop-dim-out'))
      if (!esSalidaBackdrop) return
      limpiarTimerRespaldo()
      finalizarCierre()
    },
    [finalizarCierre, limpiarTimerRespaldo],
  )

  useEffect(() => {
    return () => limpiarTimerRespaldo()
  }, [limpiarTimerRespaldo])

  const claseBackdrop = saliendo
    ? `historial-modal-backdrop--saliendo${salidaLentaRef.current ? ' historial-modal-backdrop--saliendo--lento' : ''}`
    : ''

  return {
    saliendo,
    claseBackdrop,
    solicitarCierre,
    solicitarCierreLento,
    onFinAnimacionBackdrop,
  }
}
