import { getApiHeaders } from '../utils/apiHeaders'

const API_URL = import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/'

export interface BienFloresta {
  placa: string
  descripcion: string
  responsable_nombre: string
  responsable_cedula: string
  estado: 'activo' | 'baja' | 'almacen'
  fecha_ultimo_movimiento: string | null
  ubicacion?: string
  inventariado?: boolean
  estado_inventario?: string
}

export interface MovimientoFloresta {
  fecha: string
  tipo: string
  origen_nombre: string
  origen_cedula: string
  destino_nombre: string
  destino_cedula: string
  fuente: string
}

export interface BienFlorestaDetalle extends BienFloresta {
  inventariado: boolean
  historial: MovimientoFloresta[]
}

/** Buscar bienes Floresta por cédula del responsable */
export async function florestaBuscarPorCedula(cedula: string): Promise<BienFloresta[]> {
  try {
    const res = await fetch(`${API_URL}almacen/floresta/buscar-cedula?cedula=${cedula}`, {
      headers: getApiHeaders()
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch {
    return []
  }
}
 
/** Buscar un bien Floresta por placa con historial */
export async function florestaBuscarPorPlaca(placa: string): Promise<BienFlorestaDetalle | null> {
  try {
    const res = await fetch(`${API_URL}almacen/floresta/buscar-placa/?placa=${placa}`, {
      headers: getApiHeaders()
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data ?? null
  } catch {
    return null
  }
}

/** Transferir un bien Floresta a otro responsable */
export async function florestaTransferir(placa: string, destino_nombre: string, destino_cedula: string): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    const res = await fetch(`${API_URL}almacen/floresta/transferir/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ placa, destino_nombre, destino_cedula }),
    })
    const json = await res.json()
    if (res.ok && json.ok) return { ok: true }
    return { ok: false, mensaje: json.mensaje ?? 'Error en transferencia' }
  } catch {
    return { ok: false, mensaje: 'No se pudo conectar con el servidor.' }
  }
}

/** Reporte: bienes sin responsable */
export async function florestaReporteSinResponsable(): Promise<{ data: BienFloresta[]; total: number }> {
  try {
    const res = await fetch(`${API_URL}almacen/floresta/reporte-sin-responsable/`, {
      headers: getApiHeaders()
    })
    if (!res.ok) return { data: [], total: 0 }
    return await res.json()
  } catch {
    return { data: [], total: 0 }
  }
}

/** Reporte: bienes no inventariados */
export async function florestaReporteNoInventariados(): Promise<{ data: BienFloresta[]; total: number }> {
  try {
    const res = await fetch(`${API_URL}almacen/floresta/reporte-no-inventariados/`, {
      headers: getApiHeaders()
    })
    if (!res.ok) return { data: [], total: 0 }
    return await res.json()
  } catch {
    return { data: [], total: 0 }
  }
}


/** Agregar un bien nuevo o asignar responsable a uno sin dueño */
export async function florestaAgregarBien(data: {
  placa: string
  descripcion?: string
  responsable_nombre?: string
  responsable_cedula?: string
}): Promise<{ ok: boolean; mensaje?: string; accion?: string }> {
  try {
    const res = await fetch(`${API_URL}almacen/floresta/agregar-bien/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (res.ok && json.ok) return { ok: true, mensaje: json.mensaje, accion: json.accion }
    return { ok: false, mensaje: json.mensaje ?? 'Error agregando bien' }
  } catch {
    return { ok: false, mensaje: 'No se pudo conectar con el servidor.' }
  }
}

/** Registro individual del Excel para carga masiva */
export interface RegistroFlorestaExcel {
  fecha: string
  descripcion: string
  placa: string
  tipo_mov: string
  origen: string
  cc_origen: string
  destino: string
  cc_destino: string
  ubicacion: string
  fuente: string
  key: string
  id_mov: number | null
}

/** Resultado de la carga masiva */
export interface ResumenCargaMasiva {
  placas_unicas: number
  bienes_creados: number
  bienes_actualizados: number
  movimientos_insertados: number
  movimientos_omitidos: number
  total_registros_recibidos: number
}

/**
 * Carga masiva de datos Floresta.
 * Envía los registros procesados del Excel al backend en lotes
 * para evitar exceder el límite de tamaño de request body.
 * El backend se encarga de:
 *  - Extraer placas únicas y crear/actualizar eco_alm_floresta_bien
 *  - Insertar todo el historial en eco_alm_floresta_movimiento
 */
export async function florestaCargaMasiva(
  registros: RegistroFlorestaExcel[],
  limpiarAntes: boolean = false,
  onProgreso?: (progreso: { loteActual: number; totalLotes: number; porcentaje: number }) => void,
): Promise<{ ok: boolean; mensaje?: string; resumen?: ResumenCargaMasiva }> {
  const TAMANO_LOTE = 2000

  try {
    // Si caben en un solo request, enviar directo
    if (registros.length <= TAMANO_LOTE) {
      onProgreso?.({ loteActual: 1, totalLotes: 1, porcentaje: 0 })
      const res = await fetch(`${API_URL}almacen/floresta/carga-masiva/`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ registros, limpiar_antes: limpiarAntes }),
      })
      const json = await res.json()
      onProgreso?.({ loteActual: 1, totalLotes: 1, porcentaje: 100 })
      if (res.ok && json.ok) return { ok: true, resumen: json.resumen }
      return { ok: false, mensaje: json.mensaje ?? json.error ?? 'Error en la carga masiva' }
    }

    // Dividir en lotes
    const lotes: RegistroFlorestaExcel[][] = []
    for (let i = 0; i < registros.length; i += TAMANO_LOTE) {
      lotes.push(registros.slice(i, i + TAMANO_LOTE))
    }

    const resumenTotal: ResumenCargaMasiva = {
      placas_unicas: 0,
      bienes_creados: 0,
      bienes_actualizados: 0,
      movimientos_insertados: 0,
      movimientos_omitidos: 0,
      total_registros_recibidos: 0,
    }

    for (let idx = 0; idx < lotes.length; idx++) {
      const lote = lotes[idx]
      // Solo limpiar en el primer lote
      const limpiarEste = idx === 0 && limpiarAntes

      onProgreso?.({ loteActual: idx + 1, totalLotes: lotes.length, porcentaje: Math.round((idx / lotes.length) * 100) })

      const res = await fetch(`${API_URL}almacen/floresta/carga-masiva/`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ registros: lote, limpiar_antes: limpiarEste }),
      })
      const json = await res.json()

      if (!res.ok || !json.ok) {
        return { ok: false, mensaje: json.mensaje ?? json.error ?? `Error en lote ${idx + 1} de ${lotes.length}` }
      }

      // Acumular resumen
      if (json.resumen) {
        resumenTotal.placas_unicas += json.resumen.placas_unicas ?? 0
        resumenTotal.bienes_creados += json.resumen.bienes_creados ?? 0
        resumenTotal.bienes_actualizados += json.resumen.bienes_actualizados ?? 0
        resumenTotal.movimientos_insertados += json.resumen.movimientos_insertados ?? 0
        resumenTotal.movimientos_omitidos += json.resumen.movimientos_omitidos ?? 0
        resumenTotal.total_registros_recibidos += json.resumen.total_registros_recibidos ?? 0
      }
    }

    onProgreso?.({ loteActual: lotes.length, totalLotes: lotes.length, porcentaje: 100 })

    // placas_unicas se sobre-contará (una placa puede aparecer en varios lotes),
    // usamos el conteo real del frontend
    resumenTotal.placas_unicas = new Set(registros.map(r => r.placa || r.key)).size

    return { ok: true, resumen: resumenTotal }
  } catch {
    return { ok: false, mensaje: 'No se pudo conectar con el servidor.' }
  }
}
