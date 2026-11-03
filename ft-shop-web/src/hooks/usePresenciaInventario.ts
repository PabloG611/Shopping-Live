/**
 * Hook para presencia de usuarios y comunicación colaborativa en el inventario.
 * 
 * EMISIÓN: via HTTP POST /almacen/presencia/ (el backend hace group_send al grupo WS)
 * RECEPCIÓN: via useTransferenciasWebSocket.onPresenciaRecibida
 *
 * También maneja solicitudes de limpiar registros entre participantes.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useTransferenciasWebSocket } from './useTransferenciasWebSocket'
import { getApiHeaders } from '../utils/apiHeaders'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

// Identificador de entorno para aislar presencia por SERVIDOR/BACKEND.
//
// IMPORTANTE: debe derivarse del BACKEND al que se conecta el cliente (WS/API),
// NO del origin del navegador. Dos usuarios pueden abrir la app desde hosts o
// IPs distintas (p. ej. 172.16.194.200:5173 y 172.16.194.81:5173) pero apuntar
// al MISMO backend; en ese caso deben verse entre sí (misma sala de presencia y
// detección de placa duplicada en vivo). Si se usara window.location.origin,
// cada uno calcularía un ENTORNO_ID distinto y el filtro descartaría los
// eventos P2P (placa_ya_en_inventario), rompiendo el modal de duplicado.
const ENTORNO_ID = (() => {
  try {
    // Preferir el endpoint WS; si no, el de la API. Ambos identifican el backend.
    const ref = (
      (import.meta.env.VITE_APP_REDIS_ENDPOINT as string | undefined) ||
      (import.meta.env.VITE_APP_API_GAG as string | undefined) ||
      window.location.origin ||
      ''
    ).toLowerCase()
    if (ref.includes('ecosistemadesarrollo')) return 'desarrollo'
    if (ref.includes('ecosistemapruebas')) return 'pruebas'
    if (ref.includes('thais')) return 'thais'
    if (ref.includes('ecosistema.unp')) return 'produccion'
    if (ref.includes('localhost') || ref.includes('127.0.0.1')) return 'local'
    // Fallback: normalizar a host:puerto del backend (sin protocolo ni ruta),
    // para que todos los clientes que apuntan al mismo backend coincidan.
    try {
      const u = new URL(ref)
      return `backend:${u.host}`
    } catch {
      return ref || 'unknown'
    }
  } catch { return 'unknown' }
})()

export interface UsuarioPresencia {
  usuario: string
  cedula: string
  grupo: string
  cargo: string
  servicio: string
  estado: 'online' | 'offline'
  ultimoHeartbeat: number
}

export interface SolicitudLimpiar {
  solicitante: string
  total_bienes: number
  timestamp: string
}

export interface SolicitudEliminarBien {
  solicitante: string
  placa: string
  descripcion: string
  timestamp: string
}

export interface MensajeChatPresencia {
  id: string
  usuario: string
  texto: string
  timestamp: number
  leido: boolean
  reaccion?: string
  editado?: boolean
}

interface UsePresenciaOptions {
  usuario: string
  cedula: string
  grupo: string
  cargo: string
  servicio: string
  habilitado?: boolean
  /** Tipo de evento de presencia (default: 'presencia_inventario'). Usar 'presencia_vehiculos' para vehículos. */
  tipoPresencia?: string
  /** Tipo de evento de salida (default: 'presencia_salida'). Usar 'presencia_vehiculos_salida' para vehículos. */
  tipoSalida?: string
}

export function usePresenciaInventario({
  usuario,
  cedula,
  grupo,
  cargo,
  servicio,
  habilitado = true,
  tipoPresencia = 'presencia_inventario',
  tipoSalida = 'presencia_salida',
}: UsePresenciaOptions) {
  const [usuarios, setUsuarios] = useState<UsuarioPresencia[]>([])
  const [solicitudLimpiar, setSolicitudLimpiar] = useState<SolicitudLimpiar | null>(null)
  const [solicitudEliminarBien, setSolicitudEliminarBien] = useState<SolicitudEliminarBien | null>(null)
  const [esperandoAprobacionLimpiar, setEsperandoAprobacionLimpiar] = useState(false)
  const [limpiarAprobado, setLimpiarAprobado] = useState(false)
  const [esperandoAprobacionEliminar, setEsperandoAprobacionEliminar] = useState(false)
  const [eliminacionAprobadaPlaca, setEliminacionAprobadaPlaca] = useState<string | null>(null)
  // Persistir mensajes en sessionStorage para que sobrevivan recargas de página
  const chatStorageKey = `chat_mensajes_${tipoPresencia}`
  const [mensajesChat, setMensajesChat] = useState<MensajeChatPresencia[]>(() => {
    try {
      const stored = sessionStorage.getItem(chatStorageKey)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [otroEscribiendo, setOtroEscribiendo] = useState(false)
  const [ultimoEventoExterno, setUltimoEventoExterno] = useState<{ action: string; data: any; ts: number } | null>(null)
  const [ultimoBienEscaneadoExterno, setUltimoBienEscaneadoExterno] = useState<{ placa: string; usuario?: string; servicio?: string; cedula?: string; ts: number } | null>(null)
  // Confirmación entrante: otra dupla avisa que ya tenía la placa que acabo de escanear.
  const [placaDuplicadaConfirmada, setPlacaDuplicadaConfirmada] = useState<{ placa: string; usuario: string; servicio: string; cedulaDestino: string; usuarioIntento: string; servicioIntento: string; ts: number } | null>(null)

  // Sincronizar mensajes al sessionStorage cada vez que cambien
  useEffect(() => {
    try {
      sessionStorage.setItem(chatStorageKey, JSON.stringify(mensajesChat))
    } catch { /* quota exceeded — silenciar */ }
  }, [mensajesChat, chatStorageKey])

  const heartbeatRef = useRef<number | null>(null)
  // Si el POST de presencia devuelve 401/403, el token caducó: se pausa el
  // heartbeat para no martillar el gateway. Se reanuda al volver a la pestaña
  // (visibilitychange), cuando el shell del ecosistema ya refrescó el token.
  const authInvalidoRef = useRef(false)
  const escribiendoTimerRef = useRef<number | null>(null)

  // Enviar evento via HTTP POST (backend emite al grupo WS)
  const enviarEvento = useCallback((tipo: string, extra: Record<string, any> = {}) => {
    if (!usuario) return

    // REGLA: null/vacío NO es un servicio. Los eventos de coordinación crítica
    // (solicitudes/aprobaciones de limpiar y eliminar) NUNCA se emiten sin un
    // servicio resuelto: no tiene sentido pedir aprobación de un inventario que
    // no está asociado a ningún servicio, y emitirlos "sin servicio" es lo que
    // provocaba que llegaran a usuarios de otros servicios.
    const COORDINACION_ESTRICTA = new Set([
      'solicitud_limpiar', 'limpiar_aprobado', 'limpiar_rechazado',
      'solicitud_eliminar_bien', 'eliminar_bien_aprobado', 'eliminar_bien_rechazado',
    ])
    if (COORDINACION_ESTRICTA.has(tipo) && !(servicio || '').trim()) return

    // No enviar si la pestaña está oculta (bfcache / segundo plano) o si el
    // token ya fue rechazado: evita spamear el gateway con 401 en bucle.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (authInvalidoRef.current) return

    fetch(`${API_URL}/almacen/presencia/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ tipo, usuario, cedula, grupo, cargo, servicio, entorno: ENTORNO_ID, ...extra }),
    }).then((res) => {
      // Token caducado/invalid: pausar el heartbeat hasta que se refresque.
      if (res.status === 401 || res.status === 403) authInvalidoRef.current = true
    }).catch(() => { /* silenciar errores de red */ })
  }, [usuario, cedula, grupo, cargo, servicio])

  // Recibir eventos via WS
  const handleEvento = useCallback((data: any) => {
    const action = data.action_key || data.tipo

    // Filtrar eventos de otros entornos/servidores
    if (data.entorno && data.entorno !== ENTORNO_ID) return

    // ─── AISLAMIENTO POR SERVICIO ───
    // La coordinación (presencia, limpiar/eliminar y sus aprobaciones, chat,
    // observaciones/notas) es SOLO entre quienes inventarían el MISMO servicio.
    // Los eventos cross-servicio (detección de duplicados entre servicios
    // distintos) se exceptúan porque justamente deben cruzar servicios.
    const EVENTOS_CROSS_SERVICIO = new Set(['bien_escaneado', 'placa_ya_en_inventario'])

    // Coordinación CRÍTICA (solicitudes/aprobaciones de limpiar y eliminar):
    // aislamiento ESTRICTO. Solo se procesa si el servicio del evento y el mío
    // están AMBOS definidos y coinciden exactamente. Si falta cualquiera de los
    // dos (p. ej. un cliente recién recargado que aún no resolvió su servicio,
    // servicio = ''), se IGNORA. Esto evita que una solicitud de limpiar/
    // eliminar de un servicio le aparezca a un usuario de OTRO servicio.
    const COORDINACION_ESTRICTA = new Set([
      'solicitud_limpiar', 'limpiar_aprobado', 'limpiar_rechazado',
      'solicitud_eliminar_bien', 'eliminar_bien_aprobado', 'eliminar_bien_rechazado',
    ])
    if (COORDINACION_ESTRICTA.has(action)) {
      const svcEvento = (data.servicio || '').trim()
      const svcMio = (servicio || '').trim()
      if (!svcEvento || !svcMio || svcEvento !== svcMio) return
    } else if (!EVENTOS_CROSS_SERVICIO.has(action)) {
      // Resto de eventos (presencia, chat, observaciones): si el evento trae
      // servicio y NO es el mío, ignorarlo (filtro permisivo previo).
      const svcEvento = (data.servicio || '').trim()
      if (svcEvento && servicio && svcEvento !== servicio) return
    }

    // ─── Presencia ───
    if (action === tipoPresencia) {
      if (!data.usuario || data.usuario === usuario) return
      setUsuarios(prev => {
        const idx = prev.findIndex(u => u.usuario === data.usuario)
        const updated: UsuarioPresencia = {
          usuario: data.usuario || '',
          cedula: data.cedula || '',
          grupo: data.grupo || '',
          cargo: data.cargo || '',
          servicio: data.servicio || '',
          estado: 'online',
          ultimoHeartbeat: Date.now(),
        }
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = updated
          return next
        }
        return [...prev, updated]
      })
    }

    if (action === tipoSalida) {
      if (data.usuario === usuario) return
      setUsuarios(prev => prev.filter(u => u.usuario !== data.usuario))
    }

    // ─── Solicitud de limpiar ───
    if (action === 'solicitud_limpiar' && data.usuario !== usuario) {
      setSolicitudLimpiar({
        solicitante: data.usuario || 'Otro usuario',
        total_bienes: data.total_bienes || 0,
        timestamp: data.timestamp || new Date().toISOString(),
      })
    }

    // ─── Solicitud de eliminar bien individual ───
    if (action === 'solicitud_eliminar_bien' && data.usuario !== usuario) {
      setSolicitudEliminarBien({
        solicitante: data.usuario || 'Otro usuario',
        placa: data.placa || '',
        descripcion: data.descripcion || '',
        timestamp: data.timestamp || new Date().toISOString(),
      })
    }

    // ─── Respuesta a mi solicitud de limpiar ───
    if (action === 'limpiar_aprobado' && data.usuario !== usuario) {
      setEsperandoAprobacionLimpiar(false)
      setLimpiarAprobado(true)
    }

    if (action === 'limpiar_rechazado' && data.usuario !== usuario) {
      setEsperandoAprobacionLimpiar(false)
      setLimpiarAprobado(false)
    }

    // ─── Respuesta a mi solicitud de eliminar bien ───
    if (action === 'eliminar_bien_aprobado' && data.usuario !== usuario) {
      setEsperandoAprobacionEliminar(false)
      setEliminacionAprobadaPlaca(data.placa || null)
    }

    if (action === 'eliminar_bien_rechazado' && data.usuario !== usuario) {
      setEsperandoAprobacionEliminar(false)
      setEliminacionAprobadaPlaca(null)
    }

    // ─── Chat ───
    if (action === 'chat_mensaje' && data.usuario !== usuario) {
      setMensajesChat(prev => [...prev, {
        id: data.msg_id || `msg-${Date.now()}`,
        usuario: data.usuario,
        texto: data.texto || '',
        timestamp: data.timestamp || Date.now(),
        leido: false,
      }])
    }

    if (action === 'chat_leido' && data.usuario !== usuario) {
      // El otro leyó mis mensajes → marcar todos míos como leídos
      setMensajesChat(prev => prev.map(m => m.usuario === usuario ? { ...m, leido: true } : m))
    }

    if (action === 'chat_escribiendo' && data.usuario !== usuario) {
      setOtroEscribiendo(true)
      if (escribiendoTimerRef.current) clearTimeout(escribiendoTimerRef.current)
      escribiendoTimerRef.current = window.setTimeout(() => setOtroEscribiendo(false), 3000)
    }

    // ─── Reacción a mensaje ───
    if (action === 'chat_reaccion' && data.usuario !== usuario) {
      setMensajesChat(prev => prev.map(m => m.id === data.msg_id ? { ...m, reaccion: data.emoji } : m))
    }

    // ─── Edición de mensaje ───
    if (action === 'chat_editar' && data.usuario !== usuario) {
      setMensajesChat(prev => prev.map(m => m.id === data.msg_id ? { ...m, texto: data.texto, editado: true } : m))
    }

    // ─── Eventos externos (observaciones, notas) → exponer como state reactivo ───
    if ((action === 'observacion_agregada' || action === 'nota_agregada' || action === 'observacion_resuelta') && data.usuario !== usuario) {
      setUltimoEventoExterno({ action, data, ts: Date.now() })
    }

    // ─── Bien escaneado por CUALQUIER dupla (grupo global) → exponer placa ───
    // Permite descontar en caliente el contador/modal de coordinador aunque el
    // bien haya sido escaneado por otra dupla en OTRO servicio.
    if (action === 'bien_escaneado' && data.placa) {
      setUltimoBienEscaneadoExterno({
        placa: String(data.placa).trim(),
        usuario: data.usuario || '',
        servicio: data.servicio || '',
        cedula: data.cedula || '',
        ts: Date.now(),
      })
    }

    // ─── Confirmación de duplicado: OTRA dupla avisa que YA tiene esa placa ───
    // Lo recibe QUIEN YA TENÍA la placa (destinatario = cedula_destino).
    if (action === 'placa_ya_en_inventario' && data.placa) {
      setPlacaDuplicadaConfirmada({
        placa: String(data.placa).trim(),
        usuario: data.usuario_origen || data.usuario || '', // quién YA la tenía
        servicio: data.servicio || '',                       // en qué servicio la tenía
        cedulaDestino: data.cedula_destino || '',            // a quién va dirigido
        usuarioIntento: data.usuario_intento || '',          // quién intentó agregarla
        servicioIntento: data.servicio_intento || '',        // en qué servicio lo intentó
        ts: Date.now(),
      })
    }
  }, [usuario, tipoPresencia, tipoSalida, servicio])

  // Conectar al WS (solo para recibir)
  useTransferenciasWebSocket({
    enabled: habilitado,
    onPresenciaRecibida: handleEvento,
  })

  // Enviar presencia via HTTP al montar y cada 12s
  useEffect(() => {
    if (!habilitado || !usuario) return

    enviarEvento(tipoPresencia)

    heartbeatRef.current = window.setInterval(() => {
      enviarEvento(tipoPresencia)
    }, 10_000)

    // Al volver a la pestaña (desde bfcache / segundo plano) se limpia la pausa
    // por token inválido y se reintenta: el shell del ecosistema ya debió
    // refrescar el token mientras tanto.
    const onVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        authInvalidoRef.current = false
        enviarEvento(tipoPresencia)
      }
    }
    document.addEventListener('visibilitychange', onVisibilidad)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      document.removeEventListener('visibilitychange', onVisibilidad)
      enviarEvento(tipoSalida)
    }
  }, [habilitado, usuario, enviarEvento, tipoPresencia, tipoSalida])

  // Limpiar usuarios sin heartbeat (35s → offline, 90s → eliminar)
  useEffect(() => {
    const interval = window.setInterval(() => {
      const ahora = Date.now()
      setUsuarios(prev => prev
        .map(u => ahora - u.ultimoHeartbeat > 35_000 ? { ...u, estado: 'offline' as const } : u)
        .filter(u => ahora - u.ultimoHeartbeat < 90_000)
      )
    }, 8_000)
    return () => clearInterval(interval)
  }, [])

  // ─── Acciones de limpiar colaborativo ─────────────────────────────────
  const solicitarLimpiar = useCallback((totalBienes: number) => {
    setEsperandoAprobacionLimpiar(true)
    enviarEvento('solicitud_limpiar', { total_bienes: totalBienes, timestamp: new Date().toISOString() })
  }, [enviarEvento])

  const aprobarLimpiar = useCallback(() => {
    enviarEvento('limpiar_aprobado')
    setSolicitudLimpiar(null)
  }, [enviarEvento])

  const rechazarLimpiar = useCallback(() => {
    enviarEvento('limpiar_rechazado')
    setSolicitudLimpiar(null)
  }, [enviarEvento])

  // ─── Acciones de eliminar bien individual ─────────────────────────────
  const solicitarEliminarBien = useCallback((placa: string, descripcion: string) => {
    setEsperandoAprobacionEliminar(true)
    setEliminacionAprobadaPlaca(null)
    enviarEvento('solicitud_eliminar_bien', { placa, descripcion, timestamp: new Date().toISOString() })
  }, [enviarEvento])

  const aprobarEliminarBien = useCallback(() => {
    const placa = solicitudEliminarBien?.placa || ''
    enviarEvento('eliminar_bien_aprobado', { placa })
    setSolicitudEliminarBien(null)
  }, [enviarEvento, solicitudEliminarBien])

  const rechazarEliminarBien = useCallback(() => {
    enviarEvento('eliminar_bien_rechazado', { placa: solicitudEliminarBien?.placa || '' })
    setSolicitudEliminarBien(null)
  }, [enviarEvento, solicitudEliminarBien])

  // ─── Acciones de chat ─────────────────────────────────────────────────
  const enviarMensajeChat = useCallback((texto: string) => {
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    // Agregar localmente
    setMensajesChat(prev => [...prev, {
      id: msgId,
      usuario,
      texto,
      timestamp: Date.now(),
      leido: false,
    }])
    // Enviar al otro
    enviarEvento('chat_mensaje', { msg_id: msgId, texto, timestamp: Date.now() })
  }, [usuario, enviarEvento])

  const marcarChatLeido = useCallback(() => {
    setMensajesChat(prev => prev.map(m => m.usuario !== usuario ? { ...m, leido: true } : m))
    enviarEvento('chat_leido')
  }, [usuario, enviarEvento])

  const notificarEscribiendo = useCallback(() => {
    enviarEvento('chat_escribiendo')
  }, [enviarEvento])

  const reaccionarMensaje = useCallback((msgId: string, emoji: string) => {
    setMensajesChat(prev => prev.map(m => m.id === msgId ? { ...m, reaccion: emoji } : m))
    enviarEvento('chat_reaccion', { msg_id: msgId, emoji })
  }, [enviarEvento])

  const editarMensaje = useCallback((msgId: string, nuevoTexto: string) => {
    setMensajesChat(prev => prev.map(m => m.id === msgId ? { ...m, texto: nuevoTexto, editado: true } : m))
    enviarEvento('chat_editar', { msg_id: msgId, texto: nuevoTexto })
  }, [enviarEvento])

  // Contar no leídos (mensajes del otro que no he leído)
  const noLeidosChat = mensajesChat.filter(m => m.usuario !== usuario && !m.leido).length

  return {
    usuarios,
    solicitudLimpiar,
    solicitudEliminarBien,
    esperandoAprobacionLimpiar,
    limpiarAprobado,
    esperandoAprobacionEliminar,
    eliminacionAprobadaPlaca,
    solicitarLimpiar,
    aprobarLimpiar,
    rechazarLimpiar,
    solicitarEliminarBien,
    aprobarEliminarBien,
    rechazarEliminarBien,
    enviarEvento,
    ultimoEventoExterno,
    ultimoBienEscaneadoExterno,
    placaDuplicadaConfirmada,
    // Chat
    mensajesChat,
    otroEscribiendo,
    noLeidosChat,
    enviarMensajeChat,
    marcarChatLeido,
    notificarEscribiendo,
    reaccionarMensaje,
    editarMensaje,
  }
}
