/**
 * Servicio para carga masiva de placas en inventario.
 * Reutilizable por panel Regional e Inventario (Floresta).
 */

import type { BienInventario } from './inventarioFisicoService'
import { verificarPlacasYaInventariadas } from './guardarInventarioService'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

export interface ResultadoCargaMasiva {
  bienesAgregados: BienInventario[]
  placasNoEncontradas: string[]
  placasDuplicadas: string[]
  placasYaReportadas: string[]
  totalEnviadas: number
  totalAgregadas: number
}

/**
 * Parsea un texto con placas (separadas por comas, espacios, saltos de línea, etc.)
 * y retorna un array limpio de placas únicas.
 */
export function parsearPlacas(texto: string): string[] {
  // Separar por comas, saltos de línea, tabs, punto y coma, espacios
  const separadores = /[,;\n\r\t]+/
  const placas = texto
    .split(separadores)
    .map(p => p.trim().toUpperCase())
    .filter(p => p.length > 0)
  
  // Deduplicar
  return [...new Set(placas)]
}

/**
 * Consulta masiva de bienes por placa en el backend.
 * Retorna los datos de cada bien encontrado en Firebird.
 */
export async function consultarBienesMasivo(placas: string[]): Promise<{
  encontrados: Array<{
    placa: string
    descripcion: string
    serial: string
    responsable: string
    cedula: string
    dependencia: string
    codigo_servicio: string
    ubicacion: string
    matid?: string
  }>
  no_encontrados: string[]
}> {
  const res = await fetch(`${API_URL}/almacen/consulta-bienes-masivo/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placas })
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Error desconocido' }))
    throw new Error(error.error || `Error ${res.status}`)
  }

  return await res.json()
}

/**
 * Procesa una carga masiva de placas completa:
 * 1. Parsea el texto
 * 2. Filtra duplicados contra bienes ya escaneados
 * 3. Verifica cuáles ya fueron reportadas en inventarios anteriores
 * 4. Consulta los datos de cada bien en Firebird
 * 5. Retorna los BienInventario listos para agregar
 */
export async function procesarCargaMasiva(
  texto: string,
  bienesYaEscaneados: BienInventario[]
): Promise<ResultadoCargaMasiva> {
  const placas = parsearPlacas(texto)
  
  if (placas.length === 0) {
    throw new Error('No se encontraron placas válidas en el texto')
  }

  // Filtrar placas que ya están en la sesión actual
  const placasEscaneadas = new Set(bienesYaEscaneados.map(b => b.placa))
  const placasDuplicadas = placas.filter(p => placasEscaneadas.has(p))
  const placasNuevas = placas.filter(p => !placasEscaneadas.has(p))

  if (placasNuevas.length === 0) {
    return {
      bienesAgregados: [],
      placasNoEncontradas: [],
      placasDuplicadas,
      placasYaReportadas: [],
      totalEnviadas: placas.length,
      totalAgregadas: 0,
    }
  }

  // Verificar cuáles ya fueron reportadas en inventarios anteriores
  let yaReportadas: string[] = []
  try {
    yaReportadas = await verificarPlacasYaInventariadas(placasNuevas)
  } catch { /* si falla, no bloquear */ }

  const placasReportadasSet = new Set(yaReportadas)
  const placasAConsultar = placasNuevas.filter(p => !placasReportadasSet.has(p))

  if (placasAConsultar.length === 0) {
    return {
      bienesAgregados: [],
      placasNoEncontradas: [],
      placasDuplicadas,
      placasYaReportadas: yaReportadas,
      totalEnviadas: placas.length,
      totalAgregadas: 0,
    }
  }

  // Consultar datos en Firebird
  const resultado = await consultarBienesMasivo(placasAConsultar)

  // Convertir a BienInventario
  const ahora = new Date().toISOString()
  const bienesAgregados: BienInventario[] = resultado.encontrados.map(bien => ({
    placa: bien.placa,
    descripcion: bien.descripcion,
    serial: bien.serial || 'N/A',
    estado: 'B' as const,
    cedula_responsable: bien.cedula,
    nombre_responsable: bien.responsable,
    servicio: bien.dependencia,
    ubicacion: bien.ubicacion || '',
    timestamp: ahora,
    custodio_nombre: bien.responsable,
    custodio_cedula: bien.cedula,
  }))

  return {
    bienesAgregados,
    placasNoEncontradas: resultado.no_encontrados,
    placasDuplicadas,
    placasYaReportadas: yaReportadas,
    totalEnviadas: placas.length,
    totalAgregadas: bienesAgregados.length,
  }
}
