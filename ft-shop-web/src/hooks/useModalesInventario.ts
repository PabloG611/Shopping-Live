/**
 * Hook compartido para estados de modales de inventario.
 * Usado por PanelCargaMasiva y PanelInventarioRegionales.
 *
 * Centraliza: mostrarModalEliminar, mostrarModalSerial, mostrarModalCustodio,
 * mostrarModalUbicacion, mostrarModalObservacion, mostrarModalBienSinPlaca,
 * mostrarModalLimpiar, historialPlaca.
 */

import { useState, useCallback } from 'react'

export interface ModalEliminar {
  index: number
  placa: string
}

export interface ModalSerial {
  index: number
  serial: string
}

export interface ModalCustodio {
  index: number
}

export interface ModalUbicacionEditar {
  placa: string
  texto: string
}

export interface ModalObservacionEditar {
  placa: string
  texto: string
}

export interface HistorialPlaca {
  placa: string
  descripcion: string
  serial?: string
}

export interface UseModalesInventarioReturn {
  // Eliminar bien
  mostrarModalEliminar: ModalEliminar | null
  abrirModalEliminar: (index: number, placa: string) => void
  cerrarModalEliminar: () => void

  // Editar serial
  mostrarModalSerial: ModalSerial | null
  abrirModalSerial: (index: number, serial: string) => void
  cerrarModalSerial: () => void

  // Editar custodio
  mostrarModalCustodio: ModalCustodio | null
  abrirModalCustodio: (index: number) => void
  cerrarModalCustodio: () => void

  // Editar ubicación
  mostrarModalUbicacion: boolean
  ubicacionEditando: ModalUbicacionEditar | null
  abrirModalUbicacion: (placa: string, texto: string) => void
  cerrarModalUbicacion: () => void

  // Observación/Notas
  mostrarModalObservacion: boolean
  observacionEditando: ModalObservacionEditar | null
  abrirModalObservacion: (placa: string, texto: string) => void
  cerrarModalObservacion: () => void

  // Bien sin placa
  mostrarModalBienSinPlaca: boolean
  abrirModalBienSinPlaca: () => void
  cerrarModalBienSinPlaca: () => void

  // Limpiar inventario
  mostrarModalLimpiar: boolean
  abrirModalLimpiar: () => void
  cerrarModalLimpiar: () => void

  // Historial de bien
  historialPlaca: HistorialPlaca | null
  abrirHistorial: (placa: string, descripcion: string, serial?: string) => void
  cerrarHistorial: () => void

  // Tab inicial para modal observaciones
  tabInicialObs: 'observaciones' | 'notas'
  setTabInicialObs: React.Dispatch<React.SetStateAction<'observaciones' | 'notas'>>
}

export function useModalesInventario(): UseModalesInventarioReturn {
  // ─── Estados ─────────────────────────────────────────────────────────────
  const [mostrarModalEliminar, setMostrarModalEliminar] = useState<ModalEliminar | null>(null)
  const [mostrarModalSerial, setMostrarModalSerial] = useState<ModalSerial | null>(null)
  const [mostrarModalCustodio, setMostrarModalCustodio] = useState<ModalCustodio | null>(null)
  const [mostrarModalUbicacion, setMostrarModalUbicacion] = useState(false)
  const [ubicacionEditando, setUbicacionEditando] = useState<ModalUbicacionEditar | null>(null)
  const [mostrarModalObservacion, setMostrarModalObservacion] = useState(false)
  const [observacionEditando, setObservacionEditando] = useState<ModalObservacionEditar | null>(null)
  const [mostrarModalBienSinPlaca, setMostrarModalBienSinPlaca] = useState(false)
  const [mostrarModalLimpiar, setMostrarModalLimpiar] = useState(false)
  const [historialPlaca, setHistorialPlaca] = useState<HistorialPlaca | null>(null)
  const [tabInicialObs, setTabInicialObs] = useState<'observaciones' | 'notas'>('observaciones')

  // ─── Eliminar ────────────────────────────────────────────────────────────
  const abrirModalEliminar = useCallback((index: number, placa: string) => {
    setMostrarModalEliminar({ index, placa })
  }, [])
  const cerrarModalEliminar = useCallback(() => {
    setMostrarModalEliminar(null)
  }, [])

  // ─── Serial ──────────────────────────────────────────────────────────────
  const abrirModalSerial = useCallback((index: number, serial: string) => {
    setMostrarModalSerial({ index, serial })
  }, [])
  const cerrarModalSerial = useCallback(() => {
    setMostrarModalSerial(null)
  }, [])

  // ─── Custodio ────────────────────────────────────────────────────────────
  const abrirModalCustodio = useCallback((index: number) => {
    setMostrarModalCustodio({ index })
  }, [])
  const cerrarModalCustodio = useCallback(() => {
    setMostrarModalCustodio(null)
  }, [])

  // ─── Ubicación ───────────────────────────────────────────────────────────
  const abrirModalUbicacion = useCallback((placa: string, texto: string) => {
    setUbicacionEditando({ placa, texto })
    setMostrarModalUbicacion(true)
  }, [])
  const cerrarModalUbicacion = useCallback(() => {
    setMostrarModalUbicacion(false)
    setUbicacionEditando(null)
  }, [])

  // ─── Observación/Notas ───────────────────────────────────────────────────
  const abrirModalObservacion = useCallback((placa: string, texto: string) => {
    setObservacionEditando({ placa, texto })
    setMostrarModalObservacion(true)
  }, [])
  const cerrarModalObservacion = useCallback(() => {
    setMostrarModalObservacion(false)
    setObservacionEditando(null)
  }, [])

  // ─── Bien sin placa ──────────────────────────────────────────────────────
  const abrirModalBienSinPlaca = useCallback(() => {
    setMostrarModalBienSinPlaca(true)
  }, [])
  const cerrarModalBienSinPlaca = useCallback(() => {
    setMostrarModalBienSinPlaca(false)
  }, [])

  // ─── Limpiar ─────────────────────────────────────────────────────────────
  const abrirModalLimpiar = useCallback(() => {
    setMostrarModalLimpiar(true)
  }, [])
  const cerrarModalLimpiar = useCallback(() => {
    setMostrarModalLimpiar(false)
  }, [])

  // ─── Historial ───────────────────────────────────────────────────────────
  const abrirHistorial = useCallback((placa: string, descripcion: string, serial?: string) => {
    setHistorialPlaca({ placa, descripcion, serial })
  }, [])
  const cerrarHistorial = useCallback(() => {
    setHistorialPlaca(null)
  }, [])

  return {
    mostrarModalEliminar,
    abrirModalEliminar,
    cerrarModalEliminar,

    mostrarModalSerial,
    abrirModalSerial,
    cerrarModalSerial,

    mostrarModalCustodio,
    abrirModalCustodio,
    cerrarModalCustodio,

    mostrarModalUbicacion,
    ubicacionEditando,
    abrirModalUbicacion,
    cerrarModalUbicacion,

    mostrarModalObservacion,
    observacionEditando,
    abrirModalObservacion,
    cerrarModalObservacion,

    mostrarModalBienSinPlaca,
    abrirModalBienSinPlaca,
    cerrarModalBienSinPlaca,

    mostrarModalLimpiar,
    abrirModalLimpiar,
    cerrarModalLimpiar,

    historialPlaca,
    abrirHistorial,
    cerrarHistorial,

    tabInicialObs,
    setTabInicialObs,
  }
}
