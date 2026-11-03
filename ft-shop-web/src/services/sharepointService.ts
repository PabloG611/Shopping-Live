/**
 * sharepointService.ts
 *
 * Fachada de SharePoint para el resto de la app.
 * Orquesta autenticación (msalSharepointService) y subida (graphUploadService).
 */

import { getSpAccessToken, loginSharepoint } from './msalSharepointService'
import { uploadFileToSharepoint } from './graphUploadService'

export interface FotoSubida {
  tipo_foto: string
  imagen_base64: string
  nombre_archivo: string
}

export interface ResultadoSubida {
  exitosas: number
  fallidas: number
  errores: string[]
  requiereAuth: boolean
}

/**
 * Sube las fotos de un inventario vehicular directo a SharePoint via Graph API.
 * Si no hay token activo, indica que se requiere autenticación.
 */
export async function subirFotosVehiculo(
  placa: string,
  fotos: FotoSubida[],
  servicio: string,
): Promise<ResultadoSubida> {
  const token = await getSpAccessToken()

  if (!token) {
    // Intentar login silencioso/popup como último recurso
    const login = await loginSharepoint()
    if (!login.ok || !login) {
      return { exitosas: 0, fallidas: fotos.length, errores: ['Sin sesión de SharePoint. Use "Conectar SharePoint".'], requiereAuth: true }
    }
    // Si el login fue OK, el token ya quedó en localStorage — recursar una vez
    return subirFotosVehiculo(placa, fotos, servicio)
  }

  let exitosas = 0
  let fallidas = 0
  const errores: string[] = []

  for (const foto of fotos) {
    if (!foto.imagen_base64) continue
    try {
      const url = await uploadFileToSharepoint({
        token,
        base64: foto.imagen_base64,
        placa,
        servicio,
        nombreArchivo: foto.nombre_archivo || `${foto.tipo_foto}.jpg`,
      })
      if (url) {
        exitosas++
      } else {
        fallidas++
        errores.push(`Error subiendo ${foto.tipo_foto}`)
      }
    } catch (err) {
      fallidas++
      errores.push(err instanceof Error ? err.message : `Error en ${foto.tipo_foto}`)
    }
  }

  return { exitosas, fallidas, errores, requiereAuth: false }
}
