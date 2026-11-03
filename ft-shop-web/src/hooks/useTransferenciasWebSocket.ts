/**
 * Hook para conectarse al WebSocket de transferencias y recibir notificaciones en tiempo real.
 * Incluye:
 * - Ping keepalive cada 25s para mantener la conexión activa
 * - Reconexión automática con backoff exponencial (sin límite)
 * - Reconexión al volver a la pestaña (visibilitychange)
 */
import { useEffect, useRef, useCallback } from 'react'
import { getAccessToken } from '../services/tokenStore'

export interface TransferenciaWebSocketEvent {
  type: string
  action_key?: string
  action_code?: number
  title?: string
  toast_message?: string
  severity?: string
  notify_fetch?: boolean
  transferencia_id?: number
  estado?: string
  motivo?: string
  transferencia?: any
  message?: string
  sesion_id?: number
  cedula?: string
  placas_bloqueadas?: string[]
  placas_desbloqueadas?: string[]
  placa?: string
}

export interface UseTransferenciasWebSocketOptions {
  enabled?: boolean
  onTransferenciaCreada?: (data: any) => void
  onTransferenciaActualizada?: (transferencia_id: number, estado: string, data?: any) => void
  onTransferenciaAceptada?: (transferencia_id: number, data?: any) => void
  onTransferenciaRechazada?: (transferencia_id: number, motivo: string, data?: any) => void
  onTransferenciaRevisando?: (transferencia_id: string, revisando: boolean) => void
  onConnectionEstablished?: () => void
  onError?: (error: Event) => void
  onClose?: () => void
  onInventarioIniciado?: (sesion_id: number, cedula: string, placas: string[]) => void
  onInventarioCompletado?: (sesion_id: number, cedula: string, placas: string[]) => void
  onInventarioRegistrado?: (nombre: string, total: number, data?: any) => void
  onBienInventarioAgregado?: (placa: string, cedula: string, extra?: Record<string, any>) => void
  onBienInventarioRemovido?: (placa: string, cedula: string) => void
  onInventarioEliminado?: (servicio: string, placas_liberadas: string[]) => void
  onConfiguracionServiciosActualizada?: (servicios: string[], meta?: { clave?: string; username?: string | null }) => void
  onPresenciaRecibida?: (data: { action_key: string; usuario: string; cedula: string; grupo: string; cargo: string; servicio: string }) => void
}

const PING_INTERVAL = 25_000       // Ping cada 25 segundos
const BASE_RECONNECT_DELAY = 2_000 // 2s base
const MAX_RECONNECT_DELAY = 30_000 // Tope: 30s

export function useTransferenciasWebSocket(options: UseTransferenciasWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | undefined>(undefined)
  const pingIntervalRef = useRef<number | undefined>(undefined)
  const reconnectAttemptsRef = useRef(0)
  const intentionalCloseRef = useRef(false)
  const optionsRef = useRef(options)

  // Siempre mantener la referencia actualizada de las options/callbacks
  optionsRef.current = options

  // WebSocket habilitado solo si explícitamente se activa con VITE_WEBSOCKET_ENABLED=true
  const envEnabled = import.meta.env.VITE_WEBSOCKET_ENABLED === 'true'
  const enabled = options.enabled !== false && envEnabled

  const stopPing = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = undefined
    }
  }, [])

  const startPing = useCallback(() => {
    stopPing()
    pingIntervalRef.current = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, PING_INTERVAL)
  }, [stopPing])

  const getReconnectDelay = useCallback(() => {
    // Backoff exponencial: 2s, 4s, 8s, 16s, 30s (tope)
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current),
      MAX_RECONNECT_DELAY
    )
    return delay
  }, [])

  const connect = useCallback(() => {
    if (!enabled) return

    // Si ya hay una conexión abierta o conectando, no duplicar
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    const wsBase = import.meta.env.VITE_APP_REDIS_ENDPOINT || 'ws://localhost:8000'
    // El consumer exige el JWT de bk-login (auth_state.access_token), que es el
    // token del ecosistema UNP compatible con simplejwt, NO el token de Microsoft
    // que guarda localStorage['access_token'].
    const token = getAccessToken()
    const wsUrl = token ? `${wsBase}/almacen?token=${encodeURIComponent(token)}` : `${wsBase}/almacen`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      intentionalCloseRef.current = false

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
        startPing()
        optionsRef.current.onConnectionEstablished?.()
      }

      ws.onmessage = (event) => {
        try {
          const data: TransferenciaWebSocketEvent = JSON.parse(event.data)

          // Ignorar ping/pong keepalive
          if (data.type === 'ping' || data.type === 'pong') return

          const eventType = data.action_key || (data as any).action || data.type

          switch (eventType) {
            case 'connection_established':
              optionsRef.current.onConnectionEstablished?.()
              break

            case 'transferencia_creada':
              optionsRef.current.onTransferenciaCreada?.(data.transferencia)
              break

            case 'transferencia_actualizada':
              if (data.transferencia_id && data.estado) {
                optionsRef.current.onTransferenciaActualizada?.(data.transferencia_id, data.estado, data.transferencia)
              }
              break

            case 'transferencia_aceptada':
              if (data.transferencia_id) {
                optionsRef.current.onTransferenciaAceptada?.(data.transferencia_id, data.transferencia)
              }
              break

            case 'transferencia_rechazada':
              if (data.transferencia_id) {
                optionsRef.current.onTransferenciaRechazada?.(data.transferencia_id, data.motivo || '', data.transferencia)
              }
              break

            case 'transferencia_revisando':
              if (data.transferencia_id) {
                optionsRef.current.onTransferenciaRevisando?.(String(data.transferencia_id), true)
              }
              break

            case 'transferencia_no_revisando':
              if (data.transferencia_id) {
                optionsRef.current.onTransferenciaRevisando?.(String(data.transferencia_id), false)
              }
              break

            case 'inventario_iniciado':
              if (data.sesion_id && data.cedula) {
                optionsRef.current.onInventarioIniciado?.(data.sesion_id, data.cedula, data.placas_bloqueadas || [])
              }
              break

            case 'inventario_completado':
              if (data.sesion_id && data.cedula) {
                optionsRef.current.onInventarioCompletado?.(data.sesion_id, data.cedula, data.placas_desbloqueadas || [])
              }
              break

            case 'inventario_registrado':
              // Se guardó/registró un reporte de inventario completo (código 2110).
              // El payload viaja en data.data (envelope de send_ws_event_by_code).
              {
                const payload = (data as any).data ?? data
                optionsRef.current.onInventarioRegistrado?.(payload.nombre || '', payload.total || 0, payload)
              }
              break

            case 'bien_inventario_agregado':
              if (data.placa) {
                optionsRef.current.onBienInventarioAgregado?.(data.placa, data.cedula || '', data)
              }
              break

            case 'bien_inventario_removido':
              if (data.placa) {
                optionsRef.current.onBienInventarioRemovido?.(data.placa, data.cedula || '')
              }
              break

            case 'inventario_eliminado':
              if ((data as any).servicio) {
                optionsRef.current.onInventarioEliminado?.((data as any).servicio, (data as any).placas_liberadas || [])
              }
              break

            case 'configuracion_servicios_actualizada':
              if ((data as any).data?.servicios) {
                const d = (data as any).data
                optionsRef.current.onConfiguracionServiciosActualizada?.(d.servicios, { clave: d.clave, username: d.username })
              }
              break

            case 'presencia_inventario':
            case 'presencia_salida':
            case 'presencia_vehiculos':
            case 'presencia_vehiculos_salida':
            case 'vehiculo_inventariando':
            case 'vehiculo_liberado':
            case 'solicitud_limpiar':
            case 'limpiar_aprobado':
            case 'limpiar_rechazado':
            case 'solicitud_eliminar_bien':
            case 'eliminar_bien_aprobado':
            case 'eliminar_bien_rechazado':
            case 'chat_mensaje':
            case 'chat_leido':
            case 'chat_escribiendo':
            case 'chat_reaccion':
            case 'chat_editar':
            case 'observacion_agregada':
            case 'nota_agregada':
            case 'observacion_resuelta':
            case 'bien_escaneado':
            case 'placa_ya_en_inventario':
              // bien_escaneado (2113): descuento en caliente cross-servicio + alerta duplicado.
              // placa_ya_en_inventario: confirmación de la otra dupla de que ya tenía la placa.
              // Se enrutan por onPresenciaRecibida para que usePresenciaInventario los procese.
              optionsRef.current.onPresenciaRecibida?.(data as any)
              break

            default:
              break
          }
        } catch {
          // Ignorar mensajes no JSON
        }
      }

      ws.onerror = () => {
        optionsRef.current.onError?.(new Event('error'))
      }

      ws.onclose = () => {
        stopPing()
        optionsRef.current.onClose?.()

        // Reconectar siempre, a menos que el cierre sea intencional (desmontaje)
        if (!intentionalCloseRef.current) {
          const delay = getReconnectDelay()
          reconnectAttemptsRef.current++
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect()
          }, delay)
        }
      }
    } catch {
      // Error creando WebSocket — reintentar con backoff
      const delay = getReconnectDelay()
      reconnectAttemptsRef.current++
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect()
      }, delay)
    }
  }, [enabled, startPing, stopPing, getReconnectDelay])

  useEffect(() => {
    if (!enabled) return

    connect()

    // Reconectar cuando el usuario vuelve a la pestaña
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Si la conexión se perdió mientras la pestaña estaba oculta, reconectar
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          reconnectAttemptsRef.current = 0
          connect()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      intentionalCloseRef.current = true
      stopPing()
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect, enabled, stopPing])

  const send = useCallback((data: Record<string, any>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnect: connect,
    send,
  }
}
