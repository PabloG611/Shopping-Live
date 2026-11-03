/**
 * Servicio para consultar activos desde la base de datos legacy Firebird
 * Conecta con el endpoint Django: /api-gateway/almacen/consulta-activos/
 */

export interface ActivoFirebird {
  cedula: string
  nombre_responsable: string
  placa: string
  descripcion: string
  serial: string | null
  grupo_trabajo: string | null
  grupo_bien: string | null
  nombre_dependencia?: string | null
  inventariado?: boolean
  estado_inventario?: string
  ultimo_prefijo?: string
  valorcomp?: number | null
}

export interface RespuestaActivosFirebird {
  data: ActivoFirebird[]
  persona?: {
    cedula: string
    nombre: string
  } | null
}

export interface ErrorActivosFirebird {
  error: string
}

// URL base del backend Django
import { getApiHeaders } from '../utils/apiHeaders'

// En desarrollo: http://localhost:8000
// En producción: actualizar según el servidor
const API_BASE_URL = import.meta.env.VITE_APP_API_GAG || 'http://localhost:8000/api-gateway/'

/**
 * Consulta los activos asignados a un funcionario por su cédula
 * desde la base de datos legacy Firebird
 * 
 * @param cedula - Número de cédula del funcionario
 * @returns Promise con el objeto que contiene data (activos) y persona
 */
export async function consultarActivosFirebird(cedula: string): Promise<RespuestaActivosFirebird> {
  if (!cedula || cedula.trim() === '') {
    throw new Error('La cédula es requerida')
  }

  const url = `${API_BASE_URL}almacen/consulta-activos/?cedula=${encodeURIComponent(cedula.trim())}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getApiHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as RespuestaActivosFirebird | ErrorActivosFirebird

    // Verificar si la respuesta contiene un error
    if ('error' in data) {
      throw new Error(data.error)
    }

    return {
      data: data.data || [],
      persona: data.persona || null
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al consultar activos')
  }
}
