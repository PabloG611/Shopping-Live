/**
 * Servicio para administrar bases de datos Firebird (Almacén y Activos Fijos)
 * Conecta con los endpoints Django: /api-gateway/almacen/admin/*
 */

// ============================================
// TIPOS - ALMACÉN
// ============================================

export interface ArticuloAlmacen {
  matid: number
  codigo: string
  nombre: string
  descripcion: string
  grupmatid: number
  gcmatid: number
  costo: number
  cantidad: number
  cantidadOriginal?: number  // Cantidad con signo (+ entrada, - salida)
  tipoMovimiento?: string     // "RECIBE" | "ENTREGA" | "ENTRADA" | "SALIDA" | "SIN MOVIMIENTO"
  tipoColor?: string          // Color para el badge: "success" | "danger" | "info" | "warning" | "secondary"
  responsable?: string
  responsableId?: number | null
  bodega?: string
  bodegaId?: number | null
  grupoArticulo: string
  grupoContable: string
  documentoCompleto?: string
  codprefijo?: string
  numero?: string | number
  kardexid?: number
  fecha?: string
  fechaMovimiento?: string    // Fecha completa con hora
  observaciones?: string
  proveedor?: string
  proveedorId?: number | null
  documentoProveedor?: string
  tipoDocumento?: string
  usuario?: string
  origenBusqueda?: string     // Para búsqueda robusta: indica de dónde vino el registro
}

export interface ActualizarArticuloAlmacen {
  nombre?: string
  descripcion?: string
  grupmatid?: number
  gcmatid?: number
}

// ============================================
// TIPOS - ACTIVOS FIJOS
// ============================================

export interface BienActivoFijo {
  matid: number
  codigo: string // placa
  desmat: string
  descrip: string
  grupmatid: number
  valorcomp: number
  serial?: string | null
  serial2?: string | null
  grupoArticulo?: string
  grupoBien: string
  responsable?: string | null
  cedulaResponsable?: string | null
  dependencia?: string | null
  servicioId?: number | null
  gcmatid?: number
  grupoContable?: string
  transaid?: number
  codprefijo?: string
  numeroDocumento?: number
  ubicacionId?: number | null
  ubicacion?: string | null
}

export interface BienCBResultado {
  numero_cb: string
  placa: string | null
  descripcion: string | null
  cedula: string | null
  responsable: string | null
  encontrado: boolean
}

export interface ActualizarBienActivo {
  desmat?: string
  descrip?: string
  grupmatid?: number
  gcmatid?: number
  serial?: string | null
  serial2?: string | null
  valorcomp?: number
  ubicacionid?: number | null
  servicioid?: number | null
  codigo_articulo_almacen?: string
  cantidad_bien?: number
}

// Encabezado del documento (info de TRANSA: destinación, recibido por, detalle)
export interface EncabezadoDocumento {
  transaid: number
  codprefijo: string
  numero: number
  fecha: string | null
  detalle: string
  registro: string
  servicioid: number | null
  terid: number | null
  codDestinacion: string
  destinacion: string
  recibidoPor: string
  cedulaRecibido: string
}

export interface RespuestaActualizarResponsable {
  ok: boolean
  transaid: number
  prefijo: string
  numero: number
  anterior: {
    terid: number | null
    nombre: string
    cedula: string
  }
  nuevo: {
    terid: number
    nombre: string
    cedula: string
  }
}

// ============================================
// TIPOS - GRUPOS/CATÁLOGOS
// ============================================

export interface GrupoOption {
  id: number
  codigo: string
  nombre: string
  label: string
}

export interface UbicacionOption {
  ubicacionId: number
  codigo: string
  nombre: string
  label: string
}

// ============================================
// TIPOS - RESPUESTAS
// ============================================

export interface RespuestaArticulo {
  data: ArticuloAlmacen
}

export interface RespuestaArticulos {
  data: ArticuloAlmacen[]
}

export interface RespuestaBien {
  data: BienActivoFijo
}

export interface RespuestaBienes {
  data: BienActivoFijo[]
}

export interface RespuestaBienesCB {
  data: BienCBResultado[]
}

export interface RespuestaGrupos {
  data: GrupoOption[]
}

export interface RespuestaActualizacion {
  success: boolean
  message: string
}

export interface ErrorResponse {
  error: string
}

// URL base del backend Django
const API_BASE_URL = import.meta.env.VITE_APP_API_GAG || 'http://localhost:8000/api-gateway/'

// ============================================
// FUNCIONES - ALMACÉN
// ============================================

/**
 * Busca un artículo en la base de Almacén por código
 */
export async function buscarArticuloAlmacen(codigo: string): Promise<ArticuloAlmacen> {
  if (!codigo || codigo.trim() === '') {
    throw new Error('El código es requerido')
  }

  const url = `${API_BASE_URL}almacen/admin/buscar-articulo/?codigo=${encodeURIComponent(codigo.trim())}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      let errorMsg = `Error HTTP: ${response.status}`
      try {
        const text = await response.text()
        try {
          const errorData = JSON.parse(text) as ErrorResponse
          errorMsg = errorData.error || errorMsg
        } catch {
          console.error('Error del servidor (no JSON):', text)
          errorMsg = `Error del servidor: ${response.status}`
        }
      } catch {
        errorMsg = `Error del servidor: ${response.status}`
      }
      throw new Error(errorMsg)
    }

    const data = await response.json() as RespuestaArticulo | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al buscar artículo')
  }
}

/**
 * Busca todos los artículos de una factura en la base de Almacén
 */
export async function buscarArticulosPorFacturaAlmacen(factura: string): Promise<ArticuloAlmacen[]> {
  if (!factura || factura.trim() === '') {
    throw new Error('El número de factura es requerido')
  }

  const url = `${API_BASE_URL}almacen/admin/buscar-factura-almacen/?factura=${encodeURIComponent(factura.trim())}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaArticulos | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al buscar factura')
  }
}

/**
 * Busca todos los artículos de un documento/movimiento en la base de Almacén (TNS)
 */
export async function buscarArticulosPorDocumentoAlmacen(
  numero: string,
  tipoDocumento?: string
): Promise<ArticuloAlmacen[]> {
  if (!numero || numero.trim() === '') {
    throw new Error('El número de documento es requerido')
  }

  let url = `${API_BASE_URL}almacen/admin/buscar-documento-almacen/?numero=${encodeURIComponent(numero.trim())}`
  
  // Agregar tipo de documento si se proporciona
  if (tipoDocumento && tipoDocumento !== 'NUMERO') {
    url += `&tipo_documento=${encodeURIComponent(tipoDocumento)}`
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaArticulos | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al buscar documento')
  }
}

/**
 * Actualiza un artículo en la base de Almacén
 */
export async function actualizarArticuloAlmacen(
  matid: number,
  datos: ActualizarArticuloAlmacen
): Promise<RespuestaActualizacion> {
  const url = `${API_BASE_URL}almacen/admin/actualizar-articulo/${matid}/`

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(datos),
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaActualizacion | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data as RespuestaActualizacion
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al actualizar artículo')
  }
}

/**
 * Lista todos los grupos de artículos disponibles en Almacén
 */
export async function listarGruposArticulo(): Promise<GrupoOption[]> {
  const url = `${API_BASE_URL}almacen/admin/grupos-articulo/`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaGrupos | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al listar grupos de artículos')
  }
}

/**
 * Lista todos los grupos contables disponibles en Almacén
 */
export async function listarGruposContables(): Promise<GrupoOption[]> {
  const url = `${API_BASE_URL}almacen/admin/grupos-contables/`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaGrupos | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al listar grupos contables')
  }
}

// ============================================
// FUNCIONES - ACTIVOS FIJOS
// ============================================

/**
 * Busca un bien en la base de Activos Fijos por placa
 */
export async function buscarBienActivo(placa: string): Promise<BienActivoFijo> {
  if (!placa || placa.trim() === '') {
    throw new Error('La placa es requerida')
  }

  const url = `${API_BASE_URL}almacen/admin/buscar-bien/?placa=${encodeURIComponent(placa.trim())}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      let errorMsg = `Error HTTP: ${response.status}`
      try {
        const text = await response.text()
        try {
          const errorData = JSON.parse(text) as ErrorResponse
          errorMsg = errorData.error || errorMsg
        } catch {
          console.error('Error del servidor (no JSON):', text)
          errorMsg = `Error del servidor: ${response.status}`
        }
      } catch {
        errorMsg = `Error del servidor: ${response.status}`
      }
      throw new Error(errorMsg)
    }

    const data = await response.json() as RespuestaBien | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al buscar bien')
  }
}

/**
 * Busca bienes de múltiples CB al mismo tiempo
 */
export async function buscarBienesMultiplesCB(
  numerosCB: string[]
): Promise<BienCBResultado[]> {
  if (!numerosCB || numerosCB.length === 0) {
    throw new Error('Debe proporcionar al menos un número de CB')
  }

  const url = `${API_BASE_URL}almacen/admin/buscar-multiples-cb/`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ numeros_cb: numerosCB })
    })

    if (!response.ok) {
      let errorMsg = `Error HTTP: ${response.status}`
      try {
        const text = await response.text()
        try {
          const errorData = JSON.parse(text) as ErrorResponse
          errorMsg = errorData.error || errorMsg
        } catch {
          console.error('Error del servidor (no JSON):', text)
          errorMsg = `Error del servidor: ${response.status}`
        }
      } catch {
        errorMsg = `Error del servidor: ${response.status}`
      }
      throw new Error(errorMsg)
    }

    const data = await response.json() as RespuestaBienesCB | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al buscar múltiples CB')
  }
}

/**
 * Busca todos los bienes de un documento en la base de Activos Fijos
 */
export async function buscarBienesPorFacturaActivos(
  factura: string,
  tipoDocumento?: string
): Promise<{ bienes: BienActivoFijo[]; encabezado?: EncabezadoDocumento }> {
  if (!factura || factura.trim() === '') {
    throw new Error('El número de documento es requerido')
  }

  let url = `${API_BASE_URL}almacen/admin/buscar-factura-activos/?factura=${encodeURIComponent(factura.trim())}`
  
  // Agregar tipo de documento si se proporciona
  if (tipoDocumento && tipoDocumento !== 'NUMERO') {
    url += `&tipo_documento=${encodeURIComponent(tipoDocumento)}`
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      // Intentar parsear como JSON, si falla mostrar el texto plano
      let errorMsg = `Error HTTP: ${response.status}`
      try {
        const text = await response.text()
        try {
          const errorData = JSON.parse(text) as ErrorResponse
          errorMsg = errorData.error || errorMsg
        } catch {
          console.error('Error del servidor (no JSON):', text)
          errorMsg = `Error del servidor: ${response.status}`
        }
      } catch {
        errorMsg = `Error del servidor: ${response.status}`
      }
      throw new Error(errorMsg)
    }

    const data = await response.json() as (RespuestaBienes & { encabezado?: EncabezadoDocumento }) | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return {
      bienes: data.data || [],
      encabezado: data.encabezado || undefined,
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al buscar documento')
  }
}

/**
 * Actualiza un bien en la base de Activos Fijos.
 * Si se proporciona prefijo/número de documento, sincroniza VALORCOMP con Almacén (UNP2026.GDB).
 */
export async function actualizarBienActivo(
  matid: number,
  datos: ActualizarBienActivo,
  prefijoDocumento?: string,
  numeroDocumento?: string
): Promise<RespuestaActualizacion> {
  const url = `${API_BASE_URL}almacen/admin/actualizar-bien/${matid}/`

  try {
    const body: Record<string, unknown> = { ...datos }
    if (prefijoDocumento) body.prefijo_documento = prefijoDocumento
    if (numeroDocumento) body.numero_documento = numeroDocumento

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaActualizacion | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data as RespuestaActualizacion
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al actualizar bien')
  }
}

/**
 * Lista todos los grupos de bienes disponibles en Activos Fijos
 */
export async function listarGruposBien(): Promise<GrupoOption[]> {
  const url = `${API_BASE_URL}almacen/admin/grupos-bien/`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaGrupos | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al listar grupos de bienes')
  }
}

/**
 * Lista todos los grupos contables disponibles en Activos Fijos
 */
export async function listarGruposContablesActivos(): Promise<GrupoOption[]> {
  const url = `${API_BASE_URL}almacen/admin/grupos-contables-activos/`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaGrupos | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al listar grupos contables de activos')
  }
}

/**
 * Lista todos los servicios/dependencias disponibles en Activos Fijos.
 * Usado para el selector editable de Dependencia en la ficha por placa.
 */
export async function listarServicios(): Promise<GrupoOption[]> {
  const url = `${API_BASE_URL}almacen/admin/servicios-activos/`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaGrupos | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al listar servicios')
  }
}

// ============================================
// FUNCIONES - GUARDADO MASIVO
// ============================================

export interface CambioMasivo {
  matid: number
  datos: Partial<BienActivoFijo> & { codigo_articulo_almacen?: string; cantidad_bien?: number }
}

export interface RespuestaGuardadoMasivo {
  success: boolean
  message: string
  actualizados: number
  errores: number
}

/**
 * Guarda cambios masivos en múltiples bienes de Activos Fijos.
 * Si se proporciona prefijo_documento y numero_documento, sincroniza VALORCOMP con Almacén (UNP2026.GDB).
 */
export async function guardarCambiosMasivos(
  cambios: CambioMasivo[],
  prefijoDocumento?: string,
  numeroDocumento?: string
): Promise<RespuestaGuardadoMasivo> {
  const url = `${API_BASE_URL}almacen/admin/actualizar-bienes-masivo/`

  try {
    const body: Record<string, unknown> = { cambios }
    if (prefijoDocumento) body.prefijo_documento = prefijoDocumento
    if (numeroDocumento) body.numero_documento = numeroDocumento

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaGuardadoMasivo | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data as RespuestaGuardadoMasivo
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al guardar cambios masivos')
  }
}

// ============================================
// FUNCIONES - ELIMINAR BIENES
// ============================================

export interface RespuestaEliminarBien {
  ok: boolean
  message: string
  registros_eliminados?: {
    material: number
    salajustes: number
  }
  backup?: unknown
  mensaje?: string
}

/**
 * Elimina un bien de la base de Activos Fijos
 * Hace backup automático antes de eliminar
 */
export async function eliminarBienActivo(placa: string): Promise<RespuestaEliminarBien> {
  if (!placa || placa.trim() === '') {
    throw new Error('La placa es requerida')
  }

  const url = `${API_BASE_URL}almacen/admin/eliminar-bien/`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ placa: placa.trim() }),
    })

    const data = await response.json() as RespuestaEliminarBien

    if (!response.ok) {
      throw new Error(data.mensaje || data.message || `Error HTTP: ${response.status}`)
    }

    if (!data.ok) {
      throw new Error(data.mensaje || data.message || 'Error al eliminar bien')
    }

    return data
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al eliminar bien')
  }
}

// ============================================
// FUNCIONES - ACTUALIZAR PREFIJO DOCUMENTO
// ============================================

export interface RespuestaActualizarPrefijo {
  ok: boolean
  message: string
  transaid: number
  numero: number
  prefijo_anterior: string
  prefijo_nuevo: string
}

/**
 * Actualiza el prefijo (CODPREFIJO) de un documento en la tabla TRANSA
 */
export async function actualizarPrefijoDocumento(
  transaid: number,
  nuevoPrefijo: string
): Promise<RespuestaActualizarPrefijo> {
  if (!nuevoPrefijo || nuevoPrefijo.trim() === '') {
    throw new Error('El nuevo prefijo es requerido')
  }

  const url = `${API_BASE_URL}almacen/admin/actualizar-prefijo-documento/${transaid}/`

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefijo: nuevoPrefijo.trim().toUpperCase() }),
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaActualizarPrefijo | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data as RespuestaActualizarPrefijo
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al actualizar prefijo')
  }
}

/**
 * Actualiza el responsable (TERID) de un documento en TRANSA.
 * Busca el tercero por cédula y actualiza el campo TERID.
 */
export async function actualizarResponsableDocumento(
  transaid: number,
  cedula: string
): Promise<RespuestaActualizarResponsable> {
  if (!cedula || cedula.trim() === '') {
    throw new Error('La cédula del nuevo responsable es requerida')
  }

  const url = `${API_BASE_URL}almacen/admin/actualizar-responsable-documento/${transaid}/`

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cedula: cedula.trim() }),
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaActualizarResponsable | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data as RespuestaActualizarResponsable
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al actualizar responsable del documento')
  }
}

/**
 * Busca todos los movimientos de munición de un responsable por su cédula
 */
export async function buscarMunicionPorResponsable(cedula: string): Promise<ArticuloAlmacen[]> {
  if (!cedula || cedula.trim() === '') {
    throw new Error('La cédula del responsable es requerida')
  }

  const url = `${API_BASE_URL}almacen/admin/buscar-municion-responsable/?cedula=${encodeURIComponent(cedula.trim())}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as RespuestaArticulos | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data || []
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Error desconocido al buscar munición por responsable')
  }
}

// ============================================
// TIPOS Y FUNCIONES - BJ SIN CB
// ============================================

export interface BienBJSinCB {
  placa: string
  descripcion: string
  serial: string
  numero_bj: number | string
  fecha_bj: string
  detalle_bj: string
  responsable: string
  cedula: string
  tipo_bj: string
  tipo_sal: string
  // Grupo contable del bien (presente en el historial de bajas)
  grupo_contable_codigo?: string
  grupo_contable?: string
}

interface RespuestaBJSinCB {
  data: BienBJSinCB[]
  total: number
}

/**
 * Busca bienes que tienen BJ (Baja) pero no tienen CB (Comprobante de Baja).
 * Retorna todos los resultados de una sola vez.
 */
export async function buscarBienesBJSinCB(
  numeroBJ?: string
): Promise<BienBJSinCB[]> {
  let url = `${API_BASE_URL}almacen/admin/bienes-bj-sin-cb/`

  if (numeroBJ && numeroBJ.trim()) {
    url += `?numero_bj=${encodeURIComponent(numeroBJ.trim())}`
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    let errorMsg = `Error HTTP: ${response.status}`
    try {
      const errorData = await response.json() as ErrorResponse
      errorMsg = errorData.error || errorMsg
    } catch {
      errorMsg = `Error del servidor: ${response.status}`
    }
    throw new Error(errorMsg)
  }

  const data = await response.json() as RespuestaBJSinCB | ErrorResponse

  if ('error' in data) {
    throw new Error(data.error)
  }

  return data.data || []
}

/**
 * Historial de TODAS las bajas (BJ), con o sin CB, filtradas por año(s).
 * Devuelve la misma forma que BJ sin CB (tipo BienBJSinCB).
 * @param anios lista de años a consultar (ej. [2024, 2025, 2026])
 */
export async function buscarHistorialBajas(
  anios: number[],
): Promise<BienBJSinCB[]> {
  if (!anios || anios.length === 0) return []
  const url = `${API_BASE_URL}almacen/admin/historial-bajas/?anios=${encodeURIComponent(anios.join(','))}`

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  })

  if (!response.ok) {
    let errorMsg = `Error HTTP: ${response.status}`
    try {
      const errorData = await response.json() as ErrorResponse
      errorMsg = errorData.error || errorMsg
    } catch {
      errorMsg = `Error del servidor: ${response.status}`
    }
    throw new Error(errorMsg)
  }

  const data = await response.json() as RespuestaBJSinCB | ErrorResponse
  if ('error' in data) throw new Error(data.error)
  return data.data || []
}

// ============================================
// FUNCIONES - CATÁLOGO UBICACIONES (Activos Fijos)
// ============================================

/**
 * Lista el catálogo de ubicaciones de la base de Activos Fijos.
 * Usado como fuente del selector de ubicación en la edición de bienes de documentos SD.
 */
export async function listarUbicacionesActivos(): Promise<UbicacionOption[]> {
  const url = `${API_BASE_URL}almacen/admin/ubicaciones-activos/`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      const errorData = await response.json() as ErrorResponse
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json() as { data: UbicacionOption[] } | ErrorResponse

    if ('error' in data) {
      throw new Error(data.error)
    }

    return data.data || []
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error('Error desconocido al listar ubicaciones')
  }
}
