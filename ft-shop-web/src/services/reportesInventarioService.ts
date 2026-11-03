/**
 * Servicio para reportes de inventario con filtros múltiples
 */

// URL base del backend Django
const API_BASE_URL = import.meta.env.VITE_APP_API_GAG || 'http://localhost:8000/api-gateway/'

// ============================================
// TIPOS
// ============================================

export interface BodegaOption {
  id: number
  nombre?: string
  codigo?: string
  label: string
}

export interface BienReporteAlmacen {
  matid: number
  codigo: string
  nombre: string
  descripcion: string
  grupmatid: number
  grupoArticulo: string
  gcmatid: number
  grupoContable: string
  costo: number
  cantidad: number
  bodegaid: number
  bodega: string
}

export interface BienReporteActivos {
  matid: number
  codigo: string
  desmat: string
  descripcion: string
  grupmatid: number
  grupoBien: string
  gcmatid?: number
  /** Código legible del grupo contable (ej. "224"), desde GCMAT.CODIGO. */
  grupoContableCodigo?: string
  /** Nombre del grupo contable, desde GCMAT.DESCRIP. */
  grupoContable?: string
  valorcomp: number
  serial: string
  fechaCompra: string
  proveedor: string
  tipoEntrada: string
  numeroEntrada: string
  documentoEntrada: string
  /** Nro Compra tal cual lo reporta TNS (DETRANSA.NROCOMPRA), ej. "ACTA DE ENTREGA CONTRATO 1472". */
  numeroCompra?: string
  servicioid: number
  servicio: string
  responsable: string
  cedula: string
  depreciacion: number
  disminucion: number
  valorActual: number
  ubicacion: string
}

export interface FiltrosReporteAlmacen {
  grupmatid?: number
  gcmatid?: number
  bodegaid?: number
  descripcion?: string
}

export interface FiltrosReporteActivos {
  grupmatid?: number
  gcmatid?: number
  servicioid?: number
  descripcion?: string
}

// ============================================
// FUNCIONES - BODEGAS
// ============================================

export async function listarBodegasAlmacen(): Promise<BodegaOption[]> {
  const url = `${API_BASE_URL}almacen/admin/bodegas-almacen/`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`)
    }

    const data = await response.json()
    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al listar bodegas de almacén')
  }
}

export async function listarBodegasActivos(): Promise<BodegaOption[]> {
  const url = `${API_BASE_URL}almacen/admin/bodegas-activos/`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`)
    }

    const data = await response.json()
    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al listar bodegas de activos')
  }
}

// ============================================
// FUNCIONES - BÚSQUEDA CON FILTROS
// ============================================

export async function buscarBienesReporteAlmacen(
  filtros: FiltrosReporteAlmacen
): Promise<{ data: BienReporteAlmacen[]; total: number }> {
  const url = `${API_BASE_URL}almacen/admin/reporte-almacen/`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(filtros),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json()
    return {
      data: data.data || [],
      total: data.total || 0
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido en búsqueda de reporte')
  }
}

export async function contarBienesReporteActivos(
  filtros: FiltrosReporteActivos
): Promise<{ total: number }> {
  const url = `${API_BASE_URL}almacen/admin/contar-bienes-activos/`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(filtros),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json()
    return {
      total: data.total || 0
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al contar bienes')
  }
}

export async function buscarBienesReporteActivos(
  filtros: FiltrosReporteActivos
): Promise<{ data: BienReporteActivos[]; total: number }> {
  const url = `${API_BASE_URL}almacen/admin/reporte-activos/`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(filtros),
    })

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Error HTTP: ${response.status}`)
      }
      throw new Error(`Error del servidor (${response.status}). Intente con filtros más específicos.`)
    }

    const data = await response.json()
    return {
      data: data.data || [],
      total: data.total || 0
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido en búsqueda de reporte')
  }
}

// ============================================
// FUNCIONES - CAMBIO MASIVO DE BODEGA
// ============================================

export interface ResultadoCambioMasivoBodega {
  ok: boolean
  mensaje: string
  actualizados: number
  totalSolicitados?: number
  bodegaDestino?: string
  noEncontradas?: string[]
  errores?: string[]
}

/**
 * Cambia masivamente la bodega de bienes específicos por sus MATIDs
 */
export async function cambiarBodegaMasivoPorMatids(
  matids: number[],
  bodegaDestinoId: number
): Promise<ResultadoCambioMasivoBodega> {
  const url = `${API_BASE_URL}almacen/admin/cambiar-bodega-masivo-matids/`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        matids: matids,
        bodega_destino_id: bodegaDestinoId
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json()
    return {
      ok: true,
      mensaje: data.mensaje || 'Cambio masivo completado',
      actualizados: data.actualizados || 0,
      errores: data.errores
    }
  } catch (error) {
    if (error instanceof Error) {
      return {
        ok: false,
        mensaje: error.message,
        actualizados: 0
      }
    }
    return {
      ok: false,
      mensaje: 'Error desconocido al cambiar bodega masivamente',
      actualizados: 0
    }
  }
}

/**
 * Cambia masivamente la bodega de bienes identificados por su PLACA (CODIGO).
 * Pensado para pegar listas grandes de placas copiadas desde un Excel.
 */
export async function cambiarBodegaMasivoPorPlacas(
  placas: string[],
  bodegaDestinoId: number
): Promise<ResultadoCambioMasivoBodega> {
  const url = `${API_BASE_URL}almacen/admin/cambiar-bodega-masivo-placas/`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        placas: placas,
        bodega_destino_id: bodegaDestinoId
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json()
    return {
      ok: true,
      mensaje: data.mensaje || 'Cambio masivo completado',
      actualizados: data.actualizados || 0,
      totalSolicitados: data.total_solicitados,
      bodegaDestino: data.bodega_destino,
      noEncontradas: data.no_encontradas || undefined,
      errores: data.errores || undefined
    }
  } catch (error) {
    if (error instanceof Error) {
      return {
        ok: false,
        mensaje: error.message,
        actualizados: 0
      }
    }
    return {
      ok: false,
      mensaje: 'Error desconocido al cambiar bodega masivamente por placas',
      actualizados: 0
    }
  }
}

// ============================================
// FUNCIONES - CAMBIO MASIVO DE UBICACIÓN
// ============================================

export interface ResultadoCambioMasivoUbicacion {
  ok: boolean
  mensaje: string
  actualizados: number
  totalSolicitados?: number
  ubicacionDestino?: string
  noEncontradas?: string[]
  errores?: string[]
}

export interface BienUbicacionActual {
  placa: string
  descripcion: string
  serial: string
  ubicacionActual: string
  ubicacionId: number | null
}

export interface ResultadoUbicacionActual {
  ok: boolean
  mensaje?: string
  totalSolicitados: number
  encontradas: number
  bienes: BienUbicacionActual[]
  noEncontradas: string[]
}

/**
 * Consulta la ubicación ACTUAL de una lista de bienes por su PLACA (CODIGO),
 * para revisar antes de un cambio masivo de ubicación.
 */
export async function consultarUbicacionActualPorPlacas(
  placas: string[]
): Promise<ResultadoUbicacionActual> {
  const url = `${API_BASE_URL}almacen/admin/consultar-ubicacion-actual-placas/`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ placas }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json()
    return {
      ok: true,
      totalSolicitados: data.total_solicitados ?? 0,
      encontradas: data.encontradas ?? 0,
      bienes: (data.bienes || []).map((b: Record<string, unknown>) => ({
        placa: String(b.placa ?? ''),
        descripcion: String(b.descripcion ?? ''),
        serial: String(b.serial ?? ''),
        ubicacionActual: String(b.ubicacion_actual ?? 'Sin ubicación'),
        ubicacionId: (b.ubicacion_id as number | null) ?? null,
      })),
      noEncontradas: data.no_encontradas || [],
    }
  } catch (error) {
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : 'Error al consultar ubicación actual',
      totalSolicitados: 0,
      encontradas: 0,
      bienes: [],
      noEncontradas: [],
    }
  }
}

/**
 * Cambia masivamente la ubicación (SALAJUSTES.UBICACIONID) de bienes de Activos
 * identificados por su PLACA (CODIGO). Pensado para pegar listas desde Excel.
 */
export async function cambiarUbicacionMasivoPorPlacas(
  placas: string[],
  ubicacionId: number
): Promise<ResultadoCambioMasivoUbicacion> {
  const url = `${API_BASE_URL}almacen/admin/cambiar-ubicacion-masivo-placas/`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        placas,
        ubicacion_id: ubicacionId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json()
    return {
      ok: true,
      mensaje: data.mensaje || 'Cambio de ubicación completado',
      actualizados: data.actualizados || 0,
      totalSolicitados: data.total_solicitados,
      ubicacionDestino: data.ubicacion_destino,
      noEncontradas: data.no_encontradas || undefined,
      errores: data.errores || undefined,
    }
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, mensaje: error.message, actualizados: 0 }
    }
    return { ok: false, mensaje: 'Error desconocido al cambiar ubicación masivamente', actualizados: 0 }
  }
}

/**
 * Cambia masivamente la ubicación de bienes identificados por sus MATIDs.
 * Usa el endpoint de actualización masiva de bienes (ubicacionid en datos).
 */
export async function cambiarUbicacionMasivoPorMatids(
  matids: number[],
  ubicacionId: number
): Promise<ResultadoCambioMasivoUbicacion> {
  const url = `${API_BASE_URL}almacen/admin/actualizar-bienes-masivo/`

  try {
    const cambios = matids.map(matid => ({
      matid,
      datos: { ubicacionid: ubicacionId },
    }))

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cambios }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json()
    return {
      ok: data.success ?? true,
      mensaje: data.message || 'Cambio de ubicación completado',
      actualizados: data.actualizados || 0,
      totalSolicitados: matids.length,
    }
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, mensaje: error.message, actualizados: 0 }
    }
    return { ok: false, mensaje: 'Error desconocido al cambiar ubicación por MATIDs', actualizados: 0 }
  }
}
