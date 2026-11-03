/**
 * Servicio para enviar alertas de inventario a la campana de notificaciones.
 * 
 * Cuando se detecta una situación que requiere atención (placa duplicada,
 * bien en baja, etc.), se envía una notificación al backend que la persiste
 * en la API de notificaciones del ecosistema. El usuario la ve en la campana.
 * 
 * Al guardar inventario exitosamente, se limpian las alertas.
 */

import { getAuthState } from '../utils/authState'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

export type TipoAlerta = 'bp001' | 'baja' | 'duplicado' | 'servicio_diferente' | 'no_registrada' | 'inventario_guardado'

/**
 * Envía una alerta al sistema de notificaciones (campana del ecosistema).
 * No bloquea el flujo — es fire-and-forget.
 */
export function enviarAlertaInventario(
  titulo: string,
  mensaje: string,
  tipoAlerta: TipoAlerta = 'duplicado',
): void {
  const authState = getAuthState()
  const usuarioId = authState?.user?.id_busuario

  if (!usuarioId) {
    console.warn('[alertasInventario] No se pudo obtener usuario_id, no se envía alerta')
    return
  }

  // Fire-and-forget: no bloquea el flujo de escaneo
  fetch(`${API_URL}/almacen/admin/crear-alerta-inventario/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usuario_id: usuarioId,
      titulo,
      mensaje,
      tipo_alerta: tipoAlerta,
    }),
  }).catch(() => {
    // Silencioso — si falla no afecta el inventario
  })
}

/**
 * Alias cortos para tipos comunes de alertas
 */
export const alertaInventario = {
  /** Bien pertenece a BP001 (bodega principal) */
  bienBP001: (placa: string, nombreServicio: string) => {
    enviarAlertaInventario(
      'Bien en bodega',
      `La placa ${placa} pertenece a "${nombreServicio}" (bodega). Este bien debe formalizarse ahora mismo o trasladarlo a bodega.`,
      'baja',
    )
  },

  /** Bien con documento de baja (BJ/CB) */
  bienEnBaja: (placa: string, documento: string, tipoDoc?: string, fecha?: string) => {
    const desc = tipoDoc ? `BIEN ${tipoDoc}` : 'Bien de baja'
    const fechaTxt = fecha ? ` (Fecha: ${fecha})` : ''
    enviarAlertaInventario(
      'Bien de baja',
      `${desc}: la placa ${placa} tiene documento ${documento}${fechaTxt}. Este bien ya no figura en los activos de la entidad ¡NO DEBE CONTINUAR EL SERVICIO!`,
      'baja',
    )
  },

  /** Placa duplicada entre servicios (mensaje ya armado). Queda en la campana.
   * Se agrega la hora para que cada alerta sea única y el sistema de
   * notificaciones no la agrupe/deduplique con intentos anteriores. */
  placaDuplicadaServicio: (_placa: string, mensaje: string) => {
    const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    enviarAlertaInventario(
      'Placa duplicada',
      `${mensaje} (${hora})`,
      'duplicado',
    )
  },

  /** Placa que pertenece a un servicio diferente al que se está inventariando.
   * Se registra pero no suma al conteo del servicio activo. */
  placaServicioDiferente: (placa: string, nombreServicio: string) => {
    enviarAlertaInventario(
      'Placa de otro servicio',
      `La placa ${placa} pertenece a "${nombreServicio}", no al servicio que se está inventariando. Se registró pero no suma al conteo del servicio activo. Verificar.`,
      'servicio_diferente',
    )
  },

  /** Placa que no está registrada en el sistema (no se encontró el bien). */
  placaNoRegistrada: (placa: string) => {
    enviarAlertaInventario(
      'Placa no registrada',
      `La placa ${placa} no está registrada en el sistema (no se encontró el bien). Verificar el número de placa o el serial.`,
      'no_registrada',
    )
  },

  /** Inventario guardado exitosamente.
   * NO se envía a la campana: los mensajes de éxito no deben quedar en la
   * bandeja de notificaciones (solo se muestran como toast en pantalla).
   * Se conserva la función para no romper los llamadores existentes. */
  inventarioGuardado: (_cantidadBienes: number, _servicio: string) => {
    /* intencionalmente vacío — el éxito solo se notifica por toast */
  },
}


/**
 * Consulta el conteo de notificaciones sin leer del usuario actual.
 * Usa la misma API que la campana del ecosistema.
 */
export async function contarNotificacionesSinLeer(): Promise<number> {
  try {
    const authState = getAuthState()
    const usuarioId = authState?.user?.id_busuario
    if (!usuarioId) return 0

    // En producción/dev-server, /api-notificaciones está en el mismo host.
    // En local puede estar en un servidor distinto → VITE_ECOSISTEMA_HOST lo apunta.
    const baseHost = (import.meta.env.VITE_ECOSISTEMA_HOST ?? '').replace(/\/$/, '')
      || `${window.location.protocol}//${window.location.host}`
    const baseUrl = `${baseHost}/api-notificaciones`
    const res = await fetch(`${baseUrl}/usuarios/${usuarioId}/notificaciones/count-unread?medio=1`)
    if (!res.ok) return 0
    const data = await res.json()
    return data?.count ?? 0
  } catch {
    return 0
  }
}

/**
 * Elimina todas las notificaciones leídas del usuario.
 * Se llama después de guardar inventario exitosamente.
 */
export async function eliminarNotificacionesLeidas(): Promise<void> {
  try {
    const authState = getAuthState()
    const usuarioId = authState?.user?.id_busuario
    if (!usuarioId) return

    const baseHost = (import.meta.env.VITE_ECOSISTEMA_HOST ?? '').replace(/\/$/, '')
      || `${window.location.protocol}//${window.location.host}`
    const baseUrl = `${baseHost}/api-notificaciones`
    await fetch(`${baseUrl}/usuarios/${usuarioId}/notificaciones/eliminar-leidas/`, { method: 'POST' })
  } catch {
    // Silencioso
  }
}
