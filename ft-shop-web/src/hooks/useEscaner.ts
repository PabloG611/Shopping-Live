/**
 * Hook compartido para el estado y manejo del escáner de código de barras.
 * Usado por PanelCargaMasiva y PanelInventarioRegionales.
 *
 * Centraliza: codigoBarras, procesando, alertaDuplicado,
 * inputRef, manejo de foco, y detección de duplicados.
 */

import { useState, useRef, useCallback } from 'react'
import type { BienInventario } from '../services/inventarioFisicoService'

export interface UseEscanerReturn {
  /** Ref del input de código de barras para manejo de foco */
  inputRef: React.RefObject<HTMLInputElement | null>
  /** Valor actual del input */
  codigoBarras: string
  setCodigoBarras: React.Dispatch<React.SetStateAction<string>>
  /** Indica si se está procesando una búsqueda */
  procesando: boolean
  setProcesando: React.Dispatch<React.SetStateAction<boolean>>
  /** Mensaje de alerta cuando se detecta una placa duplicada */
  alertaDuplicado: string | null
  setAlertaDuplicado: React.Dispatch<React.SetStateAction<string | null>>
  /** Devuelve el foco al input del escáner tras un delay */
  devolverFoco: (delay?: number) => void
  /** Verifica si una placa ya fue procesada. Retorna el mensaje si es duplicada, null si no */
  verificarDuplicado: (placa: string, bienesInventariados: BienInventario[]) => string | null
  /** Limpia el input y devuelve foco */
  resetEscaner: (delay?: number) => void
}

export function useEscaner(): UseEscanerReturn {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [codigoBarras, setCodigoBarras] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [alertaDuplicado, setAlertaDuplicado] = useState<string | null>(null)

  // ─── Devolver foco al input ──────────────────────────────────────────────
  const devolverFoco = useCallback((delay = 100) => {
    setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true })
    }, delay)
  }, [])

  // ─── Verificar si placa es duplicada ─────────────────────────────────────
  const verificarDuplicado = useCallback((placa: string, bienesInventariados: BienInventario[]): string | null => {
    const placaDuplicada = bienesInventariados.find(b => b.placa === placa)
    if (placaDuplicada) {
      const ubicacionInfo = placaDuplicada.ubicacion ? ` — Ubicación: ${placaDuplicada.ubicacion}` : ''
      return `PLACA DUPLICADA: ${placa} ya fue procesada${ubicacionInfo}. Revise si es un error.`
    }
    return null
  }, [])

  // ─── Reset: limpiar input y devolver foco ────────────────────────────────
  const resetEscaner = useCallback((delay = 100) => {
    setCodigoBarras('')
    setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true })
    }, delay)
  }, [])

  return {
    inputRef,
    codigoBarras,
    setCodigoBarras,
    procesando,
    setProcesando,
    alertaDuplicado,
    setAlertaDuplicado,
    devolverFoco,
    verificarDuplicado,
    resetEscaner,
  }
}
