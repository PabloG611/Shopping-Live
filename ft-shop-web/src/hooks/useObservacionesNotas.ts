/**
 * Hook compartido para registros de observaciones y notas del inventario.
 * Usado por PanelCargaMasiva y PanelInventarioRegionales.
 *
 * Centraliza: registros, actualización y persistencia en localStorage.
 */

import { useState, useCallback } from 'react'
import {
  type RegistroObservacion,
  guardarRegistrosEnStorage,
  cargarRegistrosDesdeStorage,
  limpiarRegistrosStorage,
} from '../services/observacionesInventarioService'

export interface UseObservacionesNotasOptions {
  /** Key de localStorage para este panel. Si se provee, usa esa key en vez de la default del servicio */
  storageKey?: string
}

export interface UseObservacionesNotasReturn {
  registrosObsNotas: RegistroObservacion[]
  setRegistrosObsNotas: React.Dispatch<React.SetStateAction<RegistroObservacion[]>>
  /** Actualiza los registros y los persiste */
  actualizarRegistros: (nuevos: RegistroObservacion[]) => void
  /** Limpia todos los registros (y localStorage) */
  limpiarRegistros: () => void
}

export function useObservacionesNotas(options: UseObservacionesNotasOptions = {}): UseObservacionesNotasReturn {
  const { storageKey } = options

  const [registrosObsNotas, setRegistrosObsNotas] = useState<RegistroObservacion[]>(() => {
    if (storageKey) {
      try {
        const data = localStorage.getItem(storageKey)
        return data ? JSON.parse(data) : []
      } catch { return [] }
    }
    return cargarRegistrosDesdeStorage()
  })

  // ─── Actualizar registros con persistencia ───────────────────────────────
  const actualizarRegistros = useCallback((nuevos: RegistroObservacion[]) => {
    setRegistrosObsNotas(nuevos)
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(nuevos)) } catch { /* silenciar */ }
    } else {
      guardarRegistrosEnStorage(nuevos)
    }
  }, [storageKey])

  // ─── Limpiar registros ───────────────────────────────────────────────────
  const limpiarRegistros = useCallback(() => {
    setRegistrosObsNotas([])
    if (storageKey) {
      try { localStorage.removeItem(storageKey) } catch { /* silenciar */ }
    } else {
      limpiarRegistrosStorage()
    }
  }, [storageKey])

  return {
    registrosObsNotas,
    setRegistrosObsNotas,
    actualizarRegistros,
    limpiarRegistros,
  }
}
