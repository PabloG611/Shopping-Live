import { getApiHeaders } from '../utils/apiHeaders'
import type { SolicitudTransferencia } from '../types'

const API_URL = import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/'

/**
 * Consulta todas las transferencias desde el backend.
 * GET /api-gateway/almacen/listar-transferencias/
 */
export async function consultarTransferencias(filtros?: {
  estado?: string
  emisor_cedula?: string
}): Promise<SolicitudTransferencia[]> {
  try {
    const params = new URLSearchParams()
    if (filtros?.estado) params.set('estado', filtros.estado)
    if (filtros?.emisor_cedula) params.set('emisor_cedula', filtros.emisor_cedula)

    const qs = params.toString()
    const url = `${API_URL}almacen/listar-transferencias/${qs ? `?${qs}` : ''}`

    const response = await fetch(url, {
      headers: getApiHeaders()
    })
    if (!response.ok) return []

    const json = await response.json()
    const data: Array<{
      codigo: string
      fechaISO: string
      estado: string
      emisor: { nombreCompleto: string; numeroIdentificacion: string; tipoIdentificacion: string }
      receptor: { nombreCompleto: string; numeroIdentificacion: string; tipoIdentificacion: string }
      bienes: Array<{ placa: string; descripcion: string; serial: string | null; codigo: string; tipo: string }>
      observacionRechazo?: string | null
    }> = json.data ?? []

    return data.map((item) => ({
      codigo: item.codigo,
      fechaISO: item.fechaISO,
      estado: item.estado as SolicitudTransferencia['estado'],
      tipoBien: (item.bienes[0]?.tipo ?? 'normal') as SolicitudTransferencia['tipoBien'],
      emisor: {
        nombreCompleto: item.emisor.nombreCompleto,
        tipoIdentificacion: item.emisor.tipoIdentificacion || 'CC',
        numeroIdentificacion: item.emisor.numeroIdentificacion,
        cargo: (item.emisor as Record<string, string>).cargo ?? '',
        dependencia: (item.emisor as Record<string, string>).dependencia ?? '',
        grupo: (item.emisor as Record<string, string>).grupo ?? '',
        sede: (item.emisor as Record<string, string>).sede ?? '',
      },
      receptor: {
        nombreCompleto: item.receptor.nombreCompleto,
        tipoIdentificacion: item.receptor.tipoIdentificacion || 'CC',
        numeroIdentificacion: item.receptor.numeroIdentificacion,
        cargo: (item.receptor as Record<string, string>).cargo ?? '',
        dependencia: (item.receptor as Record<string, string>).dependencia ?? '',
        grupo: (item.receptor as Record<string, string>).grupo ?? '',
        sede: (item.receptor as Record<string, string>).sede ?? '',
        numeroContrato: (item.receptor as Record<string, string>).numeroContrato ?? '',
      },
      bienes: item.bienes.map((b, idx) => ({
        id: `${b.placa}-${idx}`,
        placa: b.placa,
        descripcion: b.descripcion,
        serial: b.serial,
        codigo: b.codigo,
        nombreDependencia: (b as any).nombre_dependencia || (b as any).nombreDependencia || null,
        tipo: (b.tipo ?? 'normal') as 'normal' | 'floresta',
      })),
      observacionRechazo: item.observacionRechazo ?? undefined,
      consecutivoTns: (item as any).consecutivoTns ?? undefined,
    }))
  } catch (error) {
    console.error('[consultarTransferencias] Error:', error)
    return []
  }
}
