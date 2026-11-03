/**
 * Servicio para gestión de inventario físico
 * Maneja localStorage y comunicación con el backend
 */

const API_URL = import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/'
const STORAGE_KEY = 'inventario_fisico_bienes'

export type EstadoBien = 'B' | 'R' | 'M'

export interface BienInventario {
  placa: string
  descripcion: string
  serial: string
  estado: EstadoBien
  cedula_responsable: string
  nombre_responsable: string
  servicio?: string
  ubicacion: string
  timestamp: string
  /** Custodio real - persona que tiene el bien (diferente al responsable en BD) */
  custodio_nombre?: string
  custodio_cedula?: string
  /** Código del servicio a inventariar donde se escaneó este bien. Se usa para
   *  aislar la vista por servicio (cada servicio muestra solo sus bienes). */
  servicio_inv_codigo?: string
}

export interface Colaborador {
  nombre: string
  cedula: string
  cargo: string
}

export interface BienFirebird {
  matid: string
  codigo: string
  desmat: string
  serial: string | null
  responsable: string | null
  cedulaResponsable: string | null
  dependencia: string | null
  grupoBien: string
}

/**
 * Guarda los bienes en localStorage
 */
export function guardarBienesEnStorage(bienes: BienInventario[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bienes))
  } catch (error) {
    console.error('Error guardando en localStorage:', error)
  }
}

/**
 * Carga los bienes desde localStorage
 */
export function cargarBienesDesdeStorage(): BienInventario[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data) as BienInventario[]
  } catch (error) {
    console.error('Error cargando desde localStorage:', error)
    return []
  }
}

/**
 * Limpia el inventario del localStorage
 */
export function limpiarInventarioStorage(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Consulta un bien por placa en Firebird
 */
export async function consultarBienPorPlaca(placa: string): Promise<BienFirebird> {
  const response = await fetch(`${API_URL}almacen/admin/buscar-bien/?placa=${encodeURIComponent(placa)}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Error consultando el bien')
  }
  
  const result = await response.json()
  return result.data as BienFirebird
}

/**
 * Genera el formato PDF de inventario físico
 */
export async function generarFormatoInventario(
  colaborador1: Colaborador,
  colaborador2: Colaborador,
  bienes: BienInventario[],
  sede: string,
  ubicacion: string
): Promise<{ blob: Blob; base64: string }> {
  // Limpiar colaborador 2 si está vacío
  const col2Limpio = {
    nombre: colaborador2.nombre?.trim() || '',
    cedula: colaborador2.cedula?.trim() || '',
    cargo: colaborador2.cargo?.trim() || '',
  }
  
  // Si colaborador 2 está completamente vacío, enviar objeto vacío
  const col2Final = (col2Limpio.nombre || col2Limpio.cedula || col2Limpio.cargo) 
    ? col2Limpio 
    : { nombre: '', cedula: '', cargo: '' }
  
  console.log('Enviando al backend:', {
    colaborador1,
    colaborador2: col2Final,
    sede,
    ubicacion,
    totalBienes: bienes.length
  })
  
  // Llamar con preview=true para obtener base64 (reutilizando patrón de transferencias)
  const response = await fetch(`${API_URL}almacen/inventario/generar-formato/?preview=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      colaborador1,
      colaborador2: col2Final,
      bienes,
      sede,
      ubicacion,
    }),
  })
  
  if (!response.ok) {
    const error = await response.json()
    console.error('Error del backend:', error)
    throw new Error(error.error || 'Error generando formato')
  }
  
  const result = await response.json()
  
  console.log('Respuesta del backend:', {
    tiene_pdf_base64: !!result.pdf_base64,
    tiene_nombre_archivo: !!result.nombre_archivo,
    longitud_base64: result.pdf_base64?.length || 0
  })
  
  if (!result.pdf_base64) {
    console.error('El backend no retornó pdf_base64:', result)
    throw new Error('El backend no retornó el PDF en base64')
  }
  
  // Convertir base64 a Blob para mantener compatibilidad con la función de descarga
  const byteCharacters = atob(result.pdf_base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: 'application/pdf' })
  
  return {
    blob,
    base64: result.pdf_base64
  }
}

/**
 * Descarga el PDF generado
 */
export function descargarPDF(blob: Blob, nombreArchivo: string): void {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

/**
 * Registra los bienes marcados como "M" (Malo) en la tabla de bienes para baja.
 * Se invoca al momento de guardar el inventario (descargar PDF), NO al cambiar el estado.
 * Esto permite que el usuario cambie de opinión antes de confirmar.
 *
 * @param bienes - Lista completa de bienes inventariados
 * @param observaciones - Map de placa → texto de observación/nota (del modal de notas al marcar M)
 * @param reportadoPor - Nombre y cédula de quien reporta (colaborador 1)
 */
export async function registrarBienesMalEstado(
  bienes: BienInventario[],
  observaciones?: Record<string, string>,
  reportadoPor?: { nombre: string; cedula: string }
): Promise<void> {
  const bienesM = bienes.filter(b => b.estado === 'M')
  if (bienesM.length === 0) return

  const baseUrl = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

  const promesas = bienesM.map(bien =>
    fetch(`${baseUrl}/almacen/admin/registrar-mal-estado/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placa: bien.placa,
        descripcion: bien.descripcion,
        serial: bien.serial,
        responsable_nombre: bien.nombre_responsable,
        responsable_cedula: bien.cedula_responsable,
        custodio_nombre: bien.custodio_nombre || '',
        custodio_cedula: bien.custodio_cedula || '',
        ubicacion: bien.ubicacion,
        observacion: observaciones?.[bien.placa] || '',
        reportado_por_nombre: reportadoPor?.nombre || '',
        reportado_por_cedula: reportadoPor?.cedula || '',
      }),
    }).catch(() => {})
  )

  await Promise.all(promesas)
}
