/**
 * Servicio para gestionar bienes faltantes (UNP y Floresta)
 */

const API_BASE_URL = import.meta.env.VITE_APP_API_GAG || 'http://localhost:8000/api-gateway/'

export interface Faltante {
  id: string
  placa: string
  descripcion: string
  serial?: string
  ubicacion: string
  responsable_nombre: string
  responsable_cedula: string
}

export type TipoFaltante = 'unp' | 'floresta'

/**
 * Lista todos los faltantes UNP
 */
export async function listarFaltantesUNP(): Promise<Faltante[]> {
  const response = await fetch(`${API_BASE_URL}almacen/faltantes/unp/`)
  if (!response.ok) throw new Error('Error al listar faltantes UNP')
  const json = await response.json()
  return json.data || []
}

/**
 * Lista todos los faltantes Floresta
 */
export async function listarFaltantesFloresta(): Promise<Faltante[]> {
  const response = await fetch(`${API_BASE_URL}almacen/faltantes/floresta/`)
  if (!response.ok) throw new Error('Error al listar faltantes Floresta')
  const json = await response.json()
  return json.data || []
}

/**
 * Agrega un bien a la lista de faltantes
 */
export async function agregarFaltante(
  tipo: TipoFaltante,
  placa: string,
  descripcion?: string,
  ubicacion?: string,
  responsable_nombre?: string,
  responsable_cedula?: string,
  serial?: string
): Promise<{ message: string; id: string }> {
  const response = await fetch(`${API_BASE_URL}almacen/faltantes/agregar/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tipo,
      placa,
      descripcion,
      ubicacion,
      responsable_nombre,
      responsable_cedula,
      serial,
    }),
  })

  const json = await response.json()
  
  if (!response.ok) {
    throw new Error(json.error || 'Error al agregar faltante')
  }

  return json
}

/**
 * Elimina un bien de la lista de faltantes
 */
export async function eliminarFaltante(tipo: TipoFaltante, placa: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}almacen/faltantes/eliminar/`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, placa }),
  })

  const json = await response.json()
  
  if (!response.ok) {
    throw new Error(json.error || 'Error al eliminar faltante')
  }

  return json
}

/**
 * Marca un bien faltante como inventariado (ya fue encontrado)
 */
export async function marcarFaltanteInventariado(tipo: TipoFaltante, placa: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}almacen/faltantes/marcar-inventariado/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, placa }),
  })

  const json = await response.json()
  
  if (!response.ok) {
    throw new Error(json.error || 'Error al marcar como inventariado')
  }

  return json
}

/**
 * Elimina TODOS los bienes faltantes de un tipo
 */
export async function eliminarTodosFaltantes(tipo: TipoFaltante): Promise<{ message: string; total_eliminados: number }> {
  const response = await fetch(`${API_BASE_URL}almacen/faltantes/eliminar-todos/`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo }),
  })

  const json = await response.json()

  if (!response.ok) {
    throw new Error(json.error || 'Error al eliminar faltantes')
  }

  return json
}

/** Info de un bien encontrado por placa */
export interface InfoBienPlaca {
  encontrado: boolean
  placa?: string
  descripcion?: string
  serial?: string
  responsable_nombre?: string
  responsable_cedula?: string
  ubicacion?: string
}

/**
 * Busca información de un bien por placa para autocompletar al agregar faltante
 */
export async function buscarBienPorPlacaInfo(placa: string, tipo: TipoFaltante): Promise<InfoBienPlaca> {
  try {
    const response = await fetch(`${API_BASE_URL}almacen/faltantes/buscar-placa/?placa=${encodeURIComponent(placa)}&tipo=${tipo}`)
    if (!response.ok) return { encontrado: false }
    return await response.json()
  } catch {
    return { encontrado: false }
  }
}

/** Resultado de coincidencia parcial de placa */
export interface CoincidenciaPlaca {
  placa: string
  descripcion: string
  serial?: string
  responsable_nombre: string
  responsable_cedula: string
  ubicacion: string
}

/**
 * Busca coincidencias parciales de placa o serial para desplegable
 */
export async function buscarCoincidenciasPlaca(q: string, tipo: TipoFaltante): Promise<CoincidenciaPlaca[]> {
  try {
    const response = await fetch(`${API_BASE_URL}almacen/faltantes/buscar-coincidencias/?q=${encodeURIComponent(q)}&tipo=${tipo}`)
    if (!response.ok) return []
    const json = await response.json()
    return json.resultados ?? []
  } catch {
    return []
  }
}
