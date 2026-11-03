/**
 * Hook para inventario colaborativo en tiempo real.
 * Sincroniza por WebSocket TODAS las acciones:
 * - Escanear/eliminar bienes
 * - Cambiar estado, serial, ubicación, custodio
 * - Observaciones y notas
 * - Bien sin placa
 * - Guardar inventario
 * - Limpiar sesión
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import type { BienInventario } from '../services/inventarioFisicoService'
import { getApiHeaders } from '../utils/apiHeaders'
import { getAccessToken } from '../services/tokenStore'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
const WS_ENDPOINT = import.meta.env.VITE_APP_REDIS_ENDPOINT ?? ''

export interface ParticipanteSesion {
  usuario: string
  cedula: string
  grupo?: string
  cargo?: string
  estado?: 'online' | 'offline'
}

export interface UseInventarioColaborativoOptions {
  codigoServicio: string
  usuario: string
  cedula: string
  grupo?: string
  cargo?: string
  habilitado?: boolean
}

export interface UseInventarioColaborativoReturn {
  sesionId: string | null
  bienes: BienInventario[]
  participantes: ParticipanteSesion[]
  conectado: boolean
  cargando: boolean
  /** Último evento genérico recibido por WS (observaciones, solicitudes, etc.) */
  ultimoEvento: { actionKey: string; data: any; ts: number } | null
  /** Escanear un bien y sincronizar */
  escanearBien: (bien: Omit<BienInventario, 'timestamp'>) => Promise<{ ok: boolean; duplicado?: boolean; error?: string; duplicadoGlobal?: boolean; dupUsuario?: string; dupServicio?: string; dupCedula?: string }>
  /** Eliminar un bien y sincronizar */
  eliminarBien: (placa: string) => Promise<boolean>
  /** Actualizar un campo de un bien (estado, serial, ubicacion, custodio_nombre, custodio_cedula, observacion) */
  actualizarBien: (placa: string, campo: string, valor: string) => Promise<boolean>
  /** Emitir un evento genérico a todos los participantes (observaciones, notas, coordinador, etc.) */
  emitirEvento: (actionKey: string, data: Record<string, any>) => Promise<boolean>
  /** Enviar un mensaje directamente por WS al grupo (sin HTTP, más rápido) */
  broadcast: (payload: Record<string, any>) => void
  /** Cerrar la sesión */
  cerrarSesion: () => Promise<boolean>
  /** Limpiar todos los bienes de la sesión (sin cerrarla) */
  limpiarBienes: () => Promise<boolean>
  /** Registrar un listener para eventos genéricos */
  onEvento: (callback: (actionKey: string, data: any) => void) => void
}

export function useInventarioColaborativo({
  codigoServicio,
  usuario,
  cedula,
  grupo = '',
  cargo = '',
  habilitado = true,
}: UseInventarioColaborativoOptions): UseInventarioColaborativoReturn {
  const [sesionId, setSesionId] = useState<string | null>(null)
  const [bienes, setBienes] = useState<BienInventario[]>([])
  const [participantes, setParticipantes] = useState<ParticipanteSesion[]>([])
  const [conectado, setConectado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [ultimoEvento, setUltimoEvento] = useState<{ actionKey: string; data: any; ts: number } | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<number | null>(null)
  const reconnectRef = useRef<number | null>(null)
  const eventoCallbackRef = useRef<((actionKey: string, data: any) => void) | null>(null)
  // Guarda el sesionId en un ref para poder recuperarlo dentro de callbacks sin
  // recrearlos, y para el reintento automático cuando la sesión ya no existe.
  const sesionIdRef = useRef<string | null>(null)

  // Inicia (o reinicia) la sesión colaborativa contra el backend y devuelve el
  // nuevo sesion_id. Se reutiliza al montar y para recuperación automática
  // cuando el backend responde "Sesión no encontrada o cerrada".
  const iniciarSesion = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_URL}/almacen/colaborativo/iniciar/`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ codigo_servicio: codigoServicio, nombre_servicio: '', usuario, cedula, grupo, cargo }),
      })
      if (!res.ok) return null
      const data = await res.json()
      setSesionId(data.sesion_id)
      sesionIdRef.current = data.sesion_id
      setParticipantes((data.participantes ?? []).map((p: any) => ({
        usuario: p.usuario,
        cedula: p.cedula,
        grupo: p.grupo || '',
        cargo: p.cargo || '',
        estado: 'online' as const,
      })))
      const bienesBackend = (data.bienes ?? []).map((b: any) => ({
        placa: b.placa,
        descripcion: b.descripcion ?? '',
        serial: b.serial ?? 'N/A',
        estado: b.estado ?? 'B',
        cedula_responsable: b.cedula_responsable ?? '',
        nombre_responsable: b.nombre_responsable ?? '',
        servicio: b.servicio ?? '',
        ubicacion: b.ubicacion ?? '',
        custodio_nombre: b.custodio_nombre ?? '',
        custodio_cedula: b.custodio_cedula ?? '',
        timestamp: b.timestamp ?? new Date().toISOString(),
      }))
      setBienes(bienesBackend)
      // Publicar las observaciones/notas PREVIAS de la sesión como un evento
      // reactivo, para que el componente las cargue en su lista al entrar.
      const registrosPrevios = data.registros_obs_notas ?? []
      if (Array.isArray(registrosPrevios) && registrosPrevios.length > 0) {
        setUltimoEvento({ actionKey: 'registros_iniciales', data: { registros: registrosPrevios }, ts: Date.now() })
      }
      return data.sesion_id as string
    } catch {
      return null
    }
  }, [codigoServicio, usuario, cedula, grupo, cargo])

  // Mantener el ref sincronizado con el estado.
  useEffect(() => { sesionIdRef.current = sesionId }, [sesionId])

  // ─── Iniciar sesión al conectar ────────────────────────────────────────
  useEffect(() => {
    if (!habilitado || !codigoServicio || !usuario) return
    setCargando(true)
    iniciarSesion().finally(() => setCargando(false))
  }, [habilitado, codigoServicio, usuario, cedula, iniciarSesion])

  // ─── Conectar WebSocket ────────────────────────────────────────────────
  useEffect(() => {
    if (!habilitado || !codigoServicio || !WS_ENDPOINT) return

    let ws: WebSocket | null = null
    let intentionalClose = false

    const connect = () => {
      try {
        // El consumer exige el JWT de bk-login (auth_state.access_token),
        // NO el token de Microsoft (localStorage['access_token']).
        const token = getAccessToken()
        const wsUrl = token
          ? `${WS_ENDPOINT}/almacen?token=${encodeURIComponent(token)}`
          : `${WS_ENDPOINT}/almacen`
        ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          setConectado(true)
          ws?.send(JSON.stringify({ type: 'join_inventario', codigo_servicio: codigoServicio }))
          pingRef.current = window.setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
          }, 25_000)
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'joined_inventario') {
              return
            }
            if (data.type === 'ping' || data.type === 'pong' || data.type === 'connection_established') return

            // ─── Bien escaneado ───
            if (data.action_key === 'bien_escaneado_colaborativo' && data.bien) {
              const b = data.bien
              setBienes(prev => {
                if (prev.some(x => x.placa === b.placa)) return prev
                return [...prev, {
                  placa: b.placa, descripcion: b.descripcion ?? '', serial: b.serial ?? 'N/A',
                  estado: b.estado ?? 'B', cedula_responsable: b.cedula_responsable ?? '',
                  nombre_responsable: b.nombre_responsable ?? '', servicio: b.servicio ?? '',
                  ubicacion: b.ubicacion ?? '', custodio_nombre: b.custodio_nombre ?? '',
                  custodio_cedula: b.custodio_cedula ?? '', timestamp: b.timestamp ?? new Date().toISOString(),
                }]
              })
            }

            // ─── Bien eliminado ───
            if (data.action_key === 'bien_eliminado_colaborativo' && data.placa) {
              setBienes(prev => prev.filter(b => b.placa !== data.placa))
            }

            // ─── Bien actualizado (campo individual) ───
            if (data.action_key === 'bien_actualizado_colaborativo' && data.placa && data.campo) {
              setBienes(prev => prev.map(b => {
                if (b.placa !== data.placa) return b
                return { ...b, [data.campo]: data.valor }
              }))
            }

            // ─── Participante unido ───
            if (data.action_key === 'participante_unido') {
              setParticipantes(prev => {
                if (prev.some(p => p.cedula === data.cedula)) {
                  // Ya existe → marcar como online
                  return prev.map(p => p.cedula === data.cedula ? { ...p, estado: 'online' as const } : p)
                }
                return [...prev, { usuario: data.usuario, cedula: data.cedula, grupo: data.grupo || '', cargo: data.cargo || '', estado: 'online' as const }]
              })
              // Publicar también como ultimoEvento para que el componente pueda
              // reaccionar INMEDIATAMENTE (mostrar el modal "modo colaborativo").
              // Este evento ya viene filtrado por servicio (grupo inventario_{codigo}).
              setUltimoEvento({ actionKey: 'participante_unido', data, ts: Date.now() })
            }

            // ─── Participante desconectado ───
            if (data.action_key === 'participante_desconectado') {
              setParticipantes(prev =>
                prev.map(p => p.cedula === data.cedula ? { ...p, estado: 'offline' as const } : p)
              )
            }

            // ─── Sesión cerrada ───
            if (data.action_key === 'sesion_cerrada') {
              setSesionId(null)
              setBienes([])
              setParticipantes([])
            }

            // ─── Bienes limpiados (sin cerrar sesión) ───
            if (data.action_key === 'inventario_limpiado_colaborativo') {
              setBienes([])
            }

            // ─── Eventos genéricos (observaciones, notas, coordinador, etc.) ───
            if (data.action_key && !['bien_escaneado_colaborativo', 'bien_eliminado_colaborativo', 'bien_actualizado_colaborativo', 'participante_unido', 'participante_desconectado', 'sesion_cerrada', 'inventario_limpiado_colaborativo'].includes(data.action_key)) {
              // Publicar como estado reactivo (garantiza que el componente lo reciba)
              setUltimoEvento({ actionKey: data.action_key, data, ts: Date.now() })
              // También invocar callback legacy si existe
              if (eventoCallbackRef.current) {
                eventoCallbackRef.current(data.action_key, data)
              }
            }

          } catch { /* silenciar */ }
        }

        ws.onclose = () => {
          setConectado(false)
          if (pingRef.current) clearInterval(pingRef.current)
          // Reconectar solo si el cierre NO fue intencional y esta sigue siendo
          // la conexión vigente (evita reconexiones de conexiones ya reemplazadas).
          if (!intentionalClose) {
            reconnectRef.current = window.setTimeout(connect, 5000)
          }
        }

        ws.onerror = () => { /* silenciar */ }
      } catch { /* silenciar */ }
    }

    connect()

    return () => {
      // Cierre robusto: marcar intencional, cancelar reconexión pendiente y
      // CERRAR la conexión SIN importar su estado (incluye CONNECTING). Antes
      // solo se cerraba si estaba OPEN, por lo que un WS en CONNECTING (cuando
      // codigoServicio cambiaba de '' a un valor, o en StrictMode) quedaba
      // huérfano y se acumulaban múltiples conexiones /almacen fantasma.
      intentionalClose = true
      if (pingRef.current) clearInterval(pingRef.current)
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'leave_inventario', codigo_servicio: codigoServicio }))
          }
        } catch { /* silenciar */ }
        // close() es seguro en CONNECTING y OPEN; aborta el handshake si aún conecta.
        try { ws.close() } catch { /* silenciar */ }
        if (wsRef.current === ws) wsRef.current = null
      }
    }
  }, [habilitado, codigoServicio])

  // ─── Acciones ─────────────────────────────────────────────────────────
  const escanearBien = useCallback(async (bien: Omit<BienInventario, 'timestamp'>): Promise<{ ok: boolean; duplicado?: boolean; error?: string; duplicadoGlobal?: boolean; dupUsuario?: string; dupServicio?: string; dupCedula?: string }> => {
    // Ejecuta el POST de escaneo con un sesion_id dado.
    const enviar = async (sid: string) => {
      const res = await fetch(`${API_URL}/almacen/colaborativo/escanear/`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          sesion_id: sid, placa: bien.placa, descripcion: bien.descripcion,
          serial: bien.serial, estado: bien.estado, cedula_responsable: bien.cedula_responsable,
          nombre_responsable: bien.nombre_responsable, servicio: bien.servicio,
          ubicacion: bien.ubicacion, custodio_nombre: bien.custodio_nombre ?? '',
          custodio_cedula: bien.custodio_cedula ?? '', escaneado_por: usuario, escaneado_por_cedula: cedula,
        }),
      })
      const data = await res.json().catch(() => ({}))
      return { res, data }
    }

    // Detecta el caso "la sesión ya no existe en el backend" (fue cerrada/borrada).
    const sesionInvalida = (res: Response, data: any) =>
      res.status === 404 || (typeof data?.error === 'string' && data.error.toLowerCase().includes('sesión no encontrada'))

    try {
      let sid = sesionIdRef.current ?? sesionId
      // Si no hay sesión en memoria, intentar (re)crearla antes de escanear.
      if (!sid) {
        sid = await iniciarSesion()
        if (!sid) return { ok: false, error: 'Sin sesión activa' }
      }

      let { res, data } = await enviar(sid)

      // Recuperación automática: si la sesión ya no existe, recrearla y reintentar 1 vez.
      if (sesionInvalida(res, data)) {
        const nuevoSid = await iniciarSesion()
        if (nuevoSid) {
          ({ res, data } = await enviar(nuevoSid))
        }
      }

      // El duplicado se detecta por el flag del cuerpo (el backend responde 200
      // con { duplicado: true } para NO ensuciar la consola con 409 en rojo).
      if (data && data.duplicado) return { ok: false, duplicado: true, error: data.error, duplicadoGlobal: data.duplicado_global, dupUsuario: data.usuario, dupServicio: data.servicio, dupCedula: data.cedula }
      if (!res.ok) return { ok: false, error: data.error ?? 'Error' }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }, [sesionId, usuario, cedula, iniciarSesion])

  const eliminarBien = useCallback(async (placa: string): Promise<boolean> => {
    if (!sesionId) return false
    try {
      const res = await fetch(`${API_URL}/almacen/colaborativo/eliminar/`, {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ sesion_id: sesionId, placa, usuario }),
      })
      return res.ok
    } catch { return false }
  }, [sesionId, usuario])

  const actualizarBien = useCallback(async (placa: string, campo: string, valor: string): Promise<boolean> => {
    if (!sesionId) return false
    try {
      const res = await fetch(`${API_URL}/almacen/colaborativo/actualizar/`, {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ sesion_id: sesionId, placa, campo, valor, usuario }),
      })
      return res.ok
    } catch { return false }
  }, [sesionId, usuario])

  const emitirEvento = useCallback(async (actionKey: string, data: Record<string, any>): Promise<boolean> => {
    if (!sesionId) return false
    try {
      const res = await fetch(`${API_URL}/almacen/colaborativo/evento/`, {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ sesion_id: sesionId, action_key: actionKey, data: { ...data, usuario, cedula } }),
      })
      return res.ok
    } catch { return false }
  }, [sesionId, usuario, cedula])

  const cerrarSesion = useCallback(async (): Promise<boolean> => {
    if (!sesionId) return false
    try {
      const res = await fetch(`${API_URL}/almacen/colaborativo/cerrar/`, {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ sesion_id: sesionId }),
      })
      return res.ok
    } catch { return false }
  }, [sesionId])

  const limpiarBienes = useCallback(async (): Promise<boolean> => {
    if (!sesionId) return false
    try {
      const res = await fetch(`${API_URL}/almacen/colaborativo/limpiar-bienes/`, {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ sesion_id: sesionId }),
      })
      if (res.ok) setBienes([])
      return res.ok
    } catch { return false }
  }, [sesionId])

  const onEvento = useCallback((callback: (actionKey: string, data: any) => void) => {
    eventoCallbackRef.current = callback
  }, [])

  /** Envía un mensaje directo por WS al grupo inventario (sin HTTP) */
  const broadcast = useCallback((payload: Record<string, any>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && codigoServicio) {
      wsRef.current.send(JSON.stringify({
        type: 'broadcast',
        codigo_servicio: codigoServicio,
        payload,
      }))
    }
  }, [codigoServicio])

  return {
    sesionId,
    bienes,
    participantes,
    conectado,
    cargando,
    ultimoEvento,
    escanearBien,
    eliminarBien,
    actualizarBien,
    emitirEvento,
    broadcast,
    cerrarSesion,
    limpiarBienes,
    onEvento,
  }
}
