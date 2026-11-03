/**
 * Hook compartido para CRUD de bienes inventariados.
 * Usado por PanelCargaMasiva y PanelInventarioRegionales.
 *
 * Centraliza: editarEstado, editarSerial, editarUbicacion,
 * eliminarBien, agregarBienSinPlaca, limpiarInventario y persistencia opcional.
 */

import { useState, useCallback } from 'react'
import {
  type BienInventario,
  guardarBienesEnStorage,
  cargarBienesDesdeStorage,
  limpiarInventarioStorage,
} from '../services/inventarioFisicoService'

export interface UseInventarioBienesOptions {
  /** Si es true, persiste en localStorage automáticamente (usado en Físico). Default: false */
  persistir?: boolean
  /** Clave de localStorage personalizada (si no se pasa, usa la del servicio por defecto) */
  storageKey?: string
  /** Callback al cambiar estado a 'M' para notificar al usuario */
  onEstadoMalo?: (placa: string) => void
}

export interface UseInventarioBienesReturn {
  bienesInventariados: BienInventario[]
  setBienesInventariados: React.Dispatch<React.SetStateAction<BienInventario[]>>
  /** Actualiza la lista y persiste si la opción está habilitada */
  actualizarBienes: (bienes: BienInventario[]) => void
  /** Agrega un bien al final de la lista */
  agregarBien: (bien: BienInventario) => void
  editarEstado: (index: number, nuevoEstado: 'B' | 'R' | 'M') => void
  editarSerial: (index: number, nuevoSerial: string) => void
  editarUbicacion: (index: number, nuevaUbicacion: string) => void
  eliminarBien: (index: number) => void
  /** Agrega un bien sin placa con placa temporal SP-xxx */
  agregarBienSinPlaca: (bien: {
    descripcion: string
    ubicacion: string
    servicio: string
    custodio_nombre: string
    custodio_cedula: string
  }) => string
  /** Limpia toda la lista (y localStorage si persistir=true) */
  limpiarInventario: () => void
  /** Carga bienes guardados en localStorage (solo si persistir=true) */
  cargarDesdeStorage: () => BienInventario[]
  /** Índice del último bien agregado (para resaltar en tabla) */
  ultimoBienAgregadoIndex: number | null
  setUltimoBienAgregadoIndex: React.Dispatch<React.SetStateAction<number | null>>
}

export function useInventarioBienes(options: UseInventarioBienesOptions = {}): UseInventarioBienesReturn {
  const { persistir = false, storageKey, onEstadoMalo } = options

  const [bienesInventariados, setBienesInventariados] = useState<BienInventario[]>([])
  const [ultimoBienAgregadoIndex, setUltimoBienAgregadoIndex] = useState<number | null>(null)

  // Helpers de persistencia: usa storageKey personalizado si se provee, sino las funciones del servicio
  const guardar = useCallback((bienes: BienInventario[]) => {
    if (!persistir) return
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(bienes)) } catch { /* silenciar */ }
    } else {
      guardarBienesEnStorage(bienes)
    }
  }, [persistir, storageKey])

  const cargar = useCallback((): BienInventario[] => {
    if (!persistir) return []
    if (storageKey) {
      try {
        const data = localStorage.getItem(storageKey)
        return data ? JSON.parse(data) : []
      } catch { return [] }
    }
    return cargarBienesDesdeStorage()
  }, [persistir, storageKey])

  const limpiarStorage = useCallback(() => {
    if (!persistir) return
    if (storageKey) {
      localStorage.removeItem(storageKey)
    } else {
      limpiarInventarioStorage()
    }
  }, [persistir, storageKey])

  // ─── Actualizar lista (con persistencia opcional) ────────────────────────
  const actualizarBienes = useCallback((bienes: BienInventario[]) => {
    setBienesInventariados(bienes)
    guardar(bienes)
  }, [guardar])

  // ─── Agregar un bien al final ───────────────────────────────────────────
  const agregarBien = useCallback((bien: BienInventario) => {
    setBienesInventariados(prev => {
      const nuevaLista = [...prev, bien]
      guardar(nuevaLista)
      setUltimoBienAgregadoIndex(nuevaLista.length - 1)
      return nuevaLista
    })
  }, [guardar])

  // ─── Editar estado ───────────────────────────────────────────────────────
  const editarEstado = useCallback((index: number, nuevoEstado: 'B' | 'R' | 'M') => {
    setBienesInventariados(prev => {
      const nuevaLista = [...prev]
      nuevaLista[index].estado = nuevoEstado
      guardar(nuevaLista)
      return nuevaLista
    })
    if (nuevoEstado === 'M') {
      setTimeout(() => {
        setBienesInventariados(prev => {
          if (onEstadoMalo) onEstadoMalo(prev[index]?.placa ?? '')
          return prev
        })
      }, 0)
    }
  }, [guardar, onEstadoMalo])

  // ─── Editar serial ───────────────────────────────────────────────────────
  const editarSerial = useCallback((index: number, nuevoSerial: string) => {
    setBienesInventariados(prev => {
      const nuevaLista = [...prev]
      nuevaLista[index].serial = nuevoSerial
      guardar(nuevaLista)
      return nuevaLista
    })
  }, [guardar])

  // ─── Editar ubicación ────────────────────────────────────────────────────
  const editarUbicacion = useCallback((index: number, nuevaUbicacion: string) => {
    setBienesInventariados(prev => {
      const nuevaLista = [...prev]
      nuevaLista[index].ubicacion = nuevaUbicacion
      guardar(nuevaLista)
      return nuevaLista
    })
  }, [guardar])

  // ─── Eliminar bien ───────────────────────────────────────────────────────
  const eliminarBien = useCallback((index: number) => {
    setBienesInventariados(prev => {
      const nuevaLista = prev.filter((_, i) => i !== index)
      guardar(nuevaLista)
      // Mover el indicador al último bien de la lista
      if (nuevaLista.length > 0) {
        setUltimoBienAgregadoIndex(nuevaLista.length - 1)
      } else {
        setUltimoBienAgregadoIndex(null)
      }
      return nuevaLista
    })
  }, [guardar])

  // ─── Agregar bien sin placa ──────────────────────────────────────────────
  const agregarBienSinPlaca = useCallback((bien: {
    descripcion: string
    ubicacion: string
    servicio: string
    custodio_nombre: string
    custodio_cedula: string
  }) => {
    const placaTemporal = `SP-${Date.now().toString(36).toUpperCase()}`

    const nuevoBien: BienInventario = {
      placa: placaTemporal,
      descripcion: bien.descripcion,
      serial: 'N/A',
      estado: 'B',
      cedula_responsable: bien.custodio_cedula,
      nombre_responsable: bien.custodio_nombre,
      servicio: bien.servicio,
      ubicacion: bien.ubicacion,
      timestamp: new Date().toISOString(),
      custodio_nombre: bien.custodio_nombre,
      custodio_cedula: bien.custodio_cedula,
    }

    setBienesInventariados(prev => {
      const nuevaLista = [...prev, nuevoBien]
      guardar(nuevaLista)
      setUltimoBienAgregadoIndex(nuevaLista.length - 1)
      return nuevaLista
    })

    // Devolver la placa generada para que el llamador pueda sincronizarla por el
    // canal colaborativo con EXACTAMENTE la misma placa (evita duplicados por
    // generar una segunda placa SP- distinta).
    return placaTemporal
  }, [guardar])

  // ─── Limpiar inventario ──────────────────────────────────────────────────
  const limpiarInventario = useCallback(() => {
    setBienesInventariados([])
    limpiarStorage()
  }, [limpiarStorage])

  // ─── Cargar desde storage ────────────────────────────────────────────────
  const cargarDesdeStorage = useCallback((): BienInventario[] => {
    const bienes = cargar()
    if (bienes.length > 0) {
      setBienesInventariados(bienes)
      setUltimoBienAgregadoIndex(bienes.length - 1)
    }
    return bienes
  }, [cargar])

  return {
    bienesInventariados,
    setBienesInventariados,
    actualizarBienes,
    agregarBien,
    editarEstado,
    editarSerial,
    editarUbicacion,
    eliminarBien,
    agregarBienSinPlaca,
    limpiarInventario,
    cargarDesdeStorage,
    ultimoBienAgregadoIndex,
    setUltimoBienAgregadoIndex,
  }
}
