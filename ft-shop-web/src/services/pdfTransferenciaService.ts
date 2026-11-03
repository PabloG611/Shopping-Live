import type { Bien, Persona } from '../types'
import { nombreCompletoEfectivo } from '../utils/persona'
import { getApiHeaders } from '../utils/apiHeaders'

const API_URL = import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/'

export interface PayloadPdf {
  codigo: string
  responsable: {
    nombre: string
    cedula: string
    cargo: string
    dependencia: string
    grupo: string
    sede: string
  }
  receptor: {
    nombre: string
    cedula: string
    cargo: string
    dependencia: string
    grupo: string
    sede: string
    contrato?: string
  }
  bienes: {
    placa: string
    descripcion: string
    serial: string
  }[]
}

/**
 * Llama a POST /api-gateway/almacen/generar-pdf/?preview=true y retorna el PDF en base64 para previsualizar.
 */
export async function generarPdfPreview(
  codigo: string,
  emisor: Persona,
  receptor: Persona,
  bienes: Bien[],
): Promise<{ pdfDataUrl: string; nombreArchivo: string }> {
  const payload: PayloadPdf = {
    codigo,
    responsable: {
      nombre: emisor.nombreCompleto.toUpperCase(),
      cedula: emisor.numeroIdentificacion,
      cargo: (emisor.cargo ?? '').toUpperCase(),
      dependencia: (emisor.dependencia ?? '').toUpperCase(),
      grupo: (emisor.grupo ?? '').toUpperCase(),
      sede: (emisor.sede ?? '').toUpperCase(),
    },
    receptor: {
      nombre: nombreCompletoEfectivo(receptor).toUpperCase(),
      cedula: receptor.numeroIdentificacion,
      cargo: (receptor.cargo ?? '').toUpperCase(),
      dependencia: (receptor.dependencia ?? '').toUpperCase(),
      grupo: (receptor.grupo ?? '').toUpperCase(),
      sede: (receptor.sede ?? '').toUpperCase(),
      contrato: receptor.numeroContrato ?? undefined,
    },
    bienes: bienes.map((b) => ({
      placa: b.placa,
      descripcion: b.descripcion.toUpperCase(),
      serial: b.serial ?? 'N/A',
    })),
  }

  const response = await fetch(`${API_URL}almacen/generar-pdf/?preview=true`, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Error desconocido' }))
    throw new Error(err.error ?? `Error ${response.status}`)
  }

  const data = await response.json() as { pdf_base64: string; nombre_archivo: string }
  const pdfDataUrl = `data:application/pdf;base64,${data.pdf_base64}`

  return { pdfDataUrl, nombreArchivo: data.nombre_archivo }
}

/**
 * Descarga un PDF desde una data URL base64.
 */
export function descargarDesdeBase64(pdfDataUrl: string, nombreArchivo: string): void {
  const a = document.createElement('a')
  a.href = pdfDataUrl
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Llama a POST /api-gateway/almacen/generar-pdf/ y descarga el PDF resultante.
 * Lanza un Error si la respuesta no es ok.
 */
export async function descargarPdfTransferencia(
  codigo: string,
  emisor: Persona,
  receptor: Persona,
  bienes: Bien[],
): Promise<void> {
  const payload: PayloadPdf = {
    codigo,
    responsable: {
      nombre: emisor.nombreCompleto.toUpperCase(),
      cedula: emisor.numeroIdentificacion,
      cargo: (emisor.cargo ?? '').toUpperCase(),
      dependencia: (emisor.dependencia ?? '').toUpperCase(),
      grupo: (emisor.grupo ?? '').toUpperCase(),
      sede: (emisor.sede ?? '').toUpperCase(),
    },
    receptor: {
      nombre: nombreCompletoEfectivo(receptor).toUpperCase(),
      cedula: receptor.numeroIdentificacion,
      cargo: (receptor.cargo ?? '').toUpperCase(),
      dependencia: (receptor.dependencia ?? '').toUpperCase(),
      grupo: (receptor.grupo ?? '').toUpperCase(),
      sede: (receptor.sede ?? '').toUpperCase(),
      contrato: receptor.numeroContrato ?? undefined,
    },
    bienes: bienes.map((b) => ({
      placa: b.placa,
      descripcion: b.descripcion.toUpperCase(),
      serial: b.serial ?? 'N/A',
    })),
  }

  const response = await fetch(`${API_URL}almacen/generar-pdf/`, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Error desconocido' }))
    throw new Error(err.error ?? `Error ${response.status}`)
  }

  // Descargar el blob como archivo
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Transferencia-${codigo}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
