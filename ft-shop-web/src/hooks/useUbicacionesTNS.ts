/**
 * Hook compartido para carga y caché de ubicaciones TNS.
 * Usado por PanelCargaMasiva y PanelInventarioRegionales.
 *
 * Carga las ubicaciones del endpoint /almacen/ubicaciones-tns/ una sola vez
 * y las cachea en window.__ubicacionesTNS para reutilizarlas entre paneles.
 */

import { useState, useEffect } from 'react'

export interface UbicacionTNS {
  id: number
  codigo?: string
  nombre?: string
  label: string
}

export interface UseUbicacionesTNSReturn {
  ubicacionesTNS: UbicacionTNS[]
  cargando: boolean
}

// Caché global en window para compartir entre paneles sin volver a cargar
declare global {
  interface Window {
    __ubicacionesTNS?: UbicacionTNS[]
  }
}

export function useUbicacionesTNS(): UseUbicacionesTNSReturn {
  const [ubicacionesTNS, setUbicacionesTNS] = useState<UbicacionTNS[]>(() => {
    return window.__ubicacionesTNS ?? []
  })
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    // Si ya está en caché, no recargar
    if (window.__ubicacionesTNS && window.__ubicacionesTNS.length > 0) {
      setUbicacionesTNS(window.__ubicacionesTNS)
      return
    }

    const cargar = async () => {
      setCargando(true)
      try {
        const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
        const res = await fetch(`${API_URL}/almacen/ubicaciones-tns/`)
        if (res.ok) {
          const data = await res.json()
          const ubics: UbicacionTNS[] = data.ubicaciones ?? []
          setUbicacionesTNS(ubics)
          window.__ubicacionesTNS = ubics
        }
      } catch { /* silenciar */ }
      setCargando(false)
    }

    cargar()
  }, [])

  return {
    ubicacionesTNS,
    cargando,
  }
}
