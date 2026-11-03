/**
 * Servicio para generar PDF consolidado de inventario físico.
 * Obtiene bienes de múltiples inventarios guardados y genera un solo PDF.
 */

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

// ============================================
// TIPOS
// ============================================

export interface ColaboradorPdf {
  nombre: string
  cedula: string
  cargo: string
}

export interface BienConsolidado {
  placa: string
  descripcion: string
  serial: string
  estado: string
  cedula_responsable: string
  nombre_responsable: string
  ubicacion: string
  custodio_nombre?: string
  custodio_cedula?: string
  es_sobrante?: boolean
}

export interface ResultadoPdfConsolidado {
  blob: Blob
  base64: string
  nombreArchivo: string
}

// ============================================
// OBTENER DETALLE DE INVENTARIOS
// ============================================

/**
 * Obtiene los bienes de un inventario específico por su ID.
 */
export async function obtenerBienesInventario(sesionId: string): Promise<BienConsolidado[]> {
  const res = await fetch(`${API_URL}/almacen/admin/detalle-inventario/${sesionId}/`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
    throw new Error(err.error || `Error ${res.status}`)
  }
  const data = await res.json()
  return (data.bienes || []).map((b: any) => ({
    placa: b.placa,
    descripcion: b.descripcion || '',
    serial: b.serial || 'N/A',
    estado: b.estado_bien || b.estado || 'B',
    cedula_responsable: b.cedula || '',
    nombre_responsable: b.responsable || '',
    ubicacion: b.ubicacion || '',
    custodio_nombre: b.custodio_nombre || '',
    custodio_cedula: b.custodio_cedula || '',
    es_sobrante: b.es_sobrante || false,
  }))
}

// ============================================
// CONSOLIDAR BIENES DE MÚLTIPLES INVENTARIOS
// ============================================

/**
 * Obtiene y consolida los bienes de múltiples inventarios.
 * Elimina duplicados por placa (mantiene el más reciente).
 */
export async function consolidarBienesDeInventarios(inventarioIds: string[]): Promise<BienConsolidado[]> {
  const resultados = await Promise.all(
    inventarioIds.map(id => obtenerBienesInventario(id))
  )

  // Aplanar todos los bienes
  const todosLosBienes = resultados.flat()

  // Eliminar duplicados por placa (mantener última aparición)
  const mapa = new Map<string, BienConsolidado>()
  for (const bien of todosLosBienes) {
    mapa.set(bien.placa, bien)
  }

  return Array.from(mapa.values())
}

// ============================================
// GENERAR PDF CONSOLIDADO
// ============================================

/**
 * Genera un PDF consolidado con bienes de múltiples inventarios.
 * Usa el endpoint existente de generar-formato que acepta bienes + colaboradores.
 */
export async function generarPdfConsolidado(
  colaborador1: ColaboradorPdf,
  colaborador2: ColaboradorPdf,
  bienes: BienConsolidado[],
  sede: string,
  ubicacion: string,
  fecha?: string,
): Promise<ResultadoPdfConsolidado> {
  if (bienes.length === 0) {
    throw new Error('No hay bienes para generar el PDF')
  }

  const col2Final = (colaborador2.nombre || colaborador2.cedula || colaborador2.cargo)
    ? colaborador2
    : { nombre: '', cedula: '', cargo: '' }

  // Sobrantes van como bienes normales — mismo formato del PDF aprobado
  const todosLosBienes = [...bienes.filter(b => !b.es_sobrante), ...bienes.filter(b => b.es_sobrante)]

  const response = await fetch(`${API_URL}/almacen/inventario/generar-formato/?preview=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      colaborador1,
      colaborador2: col2Final,
      bienes: todosLosBienes.map(b => ({
        placa: b.placa,
        descripcion: b.descripcion,
        serial: b.serial,
        estado: b.estado,
        cedula_responsable: b.cedula_responsable,
        nombre_responsable: b.nombre_responsable,
        ubicacion: b.ubicacion,
        custodio_nombre: b.custodio_nombre || '',
        custodio_cedula: b.custodio_cedula || '',
      })),
      sede,
      ubicacion,
      ...(fecha ? { fecha } : {}),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }))
    throw new Error(error.error || 'Error generando PDF consolidado')
  }

  const result = await response.json()

  if (!result.pdf_base64) {
    throw new Error('El backend no retornó el PDF en base64')
  }

  const blob = base64ToBlob(result.pdf_base64)
  const nombreArchivo = result.nombre_archivo || `Inventario_Consolidado_${new Date().toISOString().split('T')[0]}.pdf`

  return { blob, base64: result.pdf_base64, nombreArchivo }
}

// ============================================
// UTILIDADES
// ============================================

function base64ToBlob(base64: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' })
}

/**
 * Descarga un Blob como archivo PDF.
 */
export function descargarPdfConsolidado(blob: Blob, nombreArchivo: string): void {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}
