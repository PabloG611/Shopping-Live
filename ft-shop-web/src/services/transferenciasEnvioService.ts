import { getApiHeaders } from '../utils/apiHeaders'
import type { SolicitudTransferencia } from '../types'

const API_URL = import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/'

export type ResultadoEnvio = { ok: boolean; mensaje?: string }

export interface EnvioDecisionTransferencia {
  codigo: string
  accion: 'aceptar' | 'rechazar'
  observacion?: string
  consecutivoTns?: string
}

/**
 * Registra la solicitud de transferencia en el backend (PostgreSQL).
 * POST /api-gateway/almacen/registrar-transferencia/
 */
export async function enviarSolicitudTransferencia(
  solicitud: SolicitudTransferencia,
): Promise<ResultadoEnvio> {
  try {
    const response = await fetch(`${API_URL}almacen/registrar-transferencia/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        codigo: solicitud.codigo,
        tipoBien: solicitud.tipoBien,
        emisor: {
          nombreCompleto: solicitud.emisor.nombreCompleto,
          tipoIdentificacion: solicitud.emisor.tipoIdentificacion,
          numeroIdentificacion: solicitud.emisor.numeroIdentificacion,
          cargo: solicitud.emisor.cargo ?? '',
          dependencia: solicitud.emisor.dependencia ?? '',
          grupo: solicitud.emisor.grupo ?? '',
          sede: solicitud.emisor.sede ?? '',
        },
        receptor: {
          nombreCompleto: solicitud.receptor.nombreCompleto,
          tipoIdentificacion: solicitud.receptor.tipoIdentificacion,
          numeroIdentificacion: solicitud.receptor.numeroIdentificacion,
          cargo: solicitud.receptor.cargo ?? '',
          dependencia: solicitud.receptor.dependencia ?? '',
          grupo: solicitud.receptor.grupo ?? '',
          sede: solicitud.receptor.sede ?? '',
          numeroContrato: solicitud.receptor.numeroContrato ?? '',
        },
        bienes: solicitud.bienes.map((b) => ({
          placa: b.placa,
          descripcion: b.descripcion,
          serial: b.serial ?? '',
          codigo: b.codigo,
          nombre_dependencia: b.nombreDependencia ?? '',
        })),
        pdfBase64: solicitud.pdfBase64 ?? '',
        nombreArchivoPdf: solicitud.nombreArchivoPdf ?? '',
      }),
    })

    const data = await response.json()

    if (response.ok && data.ok) {
      return { ok: true }
    }

    return { ok: false, mensaje: data.mensaje ?? 'Error registrando transferencia.' }
  } catch (error) {
    console.error('[enviarSolicitudTransferencia] Error:', error)
    return { ok: false, mensaje: 'No se pudo conectar con el servidor.' }
  }
}

/**
 * Envía la decisión del administrador (aceptar/rechazar) al backend.
 * POST /api-gateway/almacen/decision-transferencia/
 */
export async function enviarDecisionTransferencia(
  payload: EnvioDecisionTransferencia,
): Promise<ResultadoEnvio> {
  try {
    const response = await fetch(`${API_URL}almacen/decision-transferencia/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (response.ok && data.ok) {
      return { ok: true }
    }

    return { ok: false, mensaje: data.mensaje ?? 'Error procesando decisión.' }
  } catch (error) {
    console.error('[enviarDecisionTransferencia] Error:', error)
    return { ok: false, mensaje: 'No se pudo conectar con el servidor.' }
  }
}


/**
 * Cancela una transferencia pendiente (el usuario se arrepintió).
 * POST /api-gateway/almacen/cancelar-transferencia/
 */
export async function cancelarTransferencia(codigo: string): Promise<ResultadoEnvio> {
  try {
    const response = await fetch(`${API_URL}almacen/cancelar-transferencia/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ codigo }),
    })

    const data = await response.json()

    if (response.ok && data.ok) {
      return { ok: true }
    }

    return { ok: false, mensaje: data.mensaje ?? 'Error cancelando transferencia.' }
  } catch (error) {
    console.error('[cancelarTransferencia] Error:', error)
    return { ok: false, mensaje: 'No se pudo conectar con el servidor.' }
  }
}


/**
 * Notifica al WebSocket que un admin está revisando (o dejó de revisar) una transferencia.
 * POST /api-gateway/almacen/marcar-revisando/
 */
export async function marcarRevisandoTransferencia(
  transferencia_id: string,
  revisando: boolean
): Promise<void> {
  try {
    await fetch(`${API_URL}almacen/marcar-revisando/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferencia_id, revisando }),
    })
  } catch {
    // No es crítico si falla
  }
}
