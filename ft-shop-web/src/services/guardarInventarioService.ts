/**
 * Servicio para guardar inventarios en el backend.
 * Solo registra los bienes inventariados sin generar PDF.
 */

import { getAuthUserCedula, getAuthUserFullName } from '../utils/authState'
import { obtenerConfiguracionSesion } from './consultaBienesService'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

// ============================================
// TIPOS
// ============================================

export interface BienParaGuardar {
  placa: string
  descripcion: string
  serial: string
  estado: string
  cedula_responsable: string
  nombre_responsable: string
  servicio?: string
  ubicacion: string
  observacion?: string
  custodio_nombre?: string
  custodio_cedula?: string
}

export interface ColaboradorInventario {
  nombre: string
  cedula: string
  cargo: string
}

export interface PayloadGuardarInventario {
  nombre: string
  sede: string
  ubicacion: string
  servicio?: string
  total_servicio?: number | null
  colaborador1: ColaboradorInventario
  colaborador2: ColaboradorInventario
  bienes: BienParaGuardar[]
  sobrantes?: BienParaGuardar[]
  notas?: any[]
  // Usuario logueado que guarda el inventario (para "ver solo mis inventarios").
  creado_por_cedula?: string
  creado_por_nombre?: string
}

export interface ResultadoGuardarInventario {
  ok: boolean
  mensaje: string
  sesion_id: string
  total_bienes: number
}

// ============================================
// VALIDACIONES
// ============================================

/**
 * Verifica si hay placas que ya fueron inventariadas anteriormente.
 * Retorna la lista de placas duplicadas.
 */
export async function verificarPlacasYaInventariadas(placas: string[]): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/almacen/admin/placas-inventariadas-servicio/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placas })
    })
    if (res.ok) {
      const data = await res.json()
      return data.inventariadas ?? []
    }
  } catch { /* Si falla la validación, no bloquear */ }
  return []
}

// ============================================
// GUARDAR INVENTARIO
// ============================================

/**
 * Registra un inventario completado en el backend.
 * POST /almacen/admin/registrar-inventario/
 */
export async function guardarInventario(payload: PayloadGuardarInventario): Promise<ResultadoGuardarInventario> {
  // Adjuntar siempre al usuario logueado que guarda (si no vino explícito en el payload).
  // Para "ver solo mis inventarios" la cédula debe ser la REAL del usuario logueado,
  // no el UUID (id_busuario). La resolvemos vía obtenerConfiguracionSesion().
  let creadoPorCedula = payload.creado_por_cedula
  if (!creadoPorCedula) {
    try {
      const { numeroIdentificacionSesion } = await obtenerConfiguracionSesion()
      creadoPorCedula = numeroIdentificacionSesion
    } catch {
      // Último recurso: no romper el guardado si falla la resolución de la cédula real.
      creadoPorCedula = getAuthUserCedula()
    }
  }
  const cuerpo: PayloadGuardarInventario = {
    ...payload,
    creado_por_cedula: creadoPorCedula,
    creado_por_nombre: payload.creado_por_nombre || getAuthUserFullName(),
  }
  const response = await fetch(`${API_URL}/almacen/admin/registrar-inventario/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }))
    throw new Error(error.error || `Error ${response.status} al guardar inventario`)
  }

  return await response.json()
}

// ============================================
// ACTUALIZAR CONTADORES
// ============================================

/**
 * Recarga los contadores de bienes por servicio.
 */
export async function recargarConteoServicios(): Promise<any> {
  const res = await fetch(`${API_URL}/almacen/admin/contar-bienes-servicio/`)
  if (res.ok) {
    return await res.json()
  }
  return null
}
