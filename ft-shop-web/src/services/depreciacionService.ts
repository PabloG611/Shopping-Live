/**
 * Servicio para cálculo de depreciación de bienes para baja
 */

const API_URL = import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/'

export interface UltimoDocumento {
  prefijo: string
  numero: number
  fecha: string
  documento_completo: string
}

export interface BienDepreciacion {
  placa: string
  descripcion: string
  serial: string
  valor_compra: number
  depreciacion_acumulada: number
  disminucion_acumulada?: number
  valor_actual: number
  fecha_compra: string
  responsable: string
  cedula: string
  grupo_bien: string
  ultimo_documento: UltimoDocumento | null
  encontrado: boolean
}

export interface ResultadoDepreciacion {
  data: BienDepreciacion[]
  total: number
  encontrados: number
  no_encontrados: number
}

/**
 * Calcula la depreciación de múltiples bienes para proceso de baja
 */
export async function calcularDepreciacionBienes(placas: string[]): Promise<ResultadoDepreciacion> {
  const response = await fetch(`${API_URL}almacen/admin/calcular-depreciacion-baja/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ placas }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Error calculando depreciación')
  }

  return await response.json()
}
