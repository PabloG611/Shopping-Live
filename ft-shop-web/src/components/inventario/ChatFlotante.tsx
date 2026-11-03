/**
 * ChatFlotante — Chat colaborativo tipo Messenger.
 * Botón flotante fijo (bottom-right) + panel popup con burbujas.
 * Reemplaza a IndicadorParticipantes con mejor UX.
 */
import { useState, useRef, useEffect } from 'react'
import { FaComments, FaTimes, FaPaperPlane, FaUsers, FaSmile } from 'react-icons/fa'
import type { ParticipanteSesion } from '../../hooks/useInventarioColaborativo'
import type { MensajeChat } from './MiniChat'
import { reproducirSonidoMensaje } from '../../utils/chatSound'

import './ChatFlotante.css'

interface ChatFlotanteProps {
  participantes: ParticipanteSesion[]
  cedulaActual: string
  conectado: boolean
  mensajesChat?: MensajeChat[]
  usuarioActual?: string
  otroEscribiendo?: boolean
  noLeidos?: number
  onEnviarMensaje?: (texto: string) => void
  onEscribiendo?: () => void
  onMarcarLeido?: () => void
  onReaccionar?: (msgId: string, emoji: string) => void
  onEditar?: (msgId: string, texto: string) => void
}

// Set reducido para la barra de reacción rápida sobre un mensaje.
const EMOJIS_RAPIDOS = ['👍', '❤️', '😂', '🔥', '👏', '✅', '⚠️', '💯']

// Set amplio para el picker (se desplaza horizontalmente).
const EMOJIS_PICKER = [
  '👍', '👎', '❤️', '😂', '😅', '😊', '😍', '🤔', '😮', '😢',
  '😡', '🥳', '😴', '🙌', '👏', '🙏', '💪', '🤝', '👌', '✌️',
  '🔥', '💯', '✅', '❌', '⚠️', '❓', '❗', '⭐', '🎉', '💡',
  '📦', '📋', '🔧', '🔍', '📸', '💰', '🕒', '📌', '🚨', '👀',
]

const AVATAR_COLORS = [
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatFlotante({
  participantes, cedulaActual, conectado,
  mensajesChat = [], usuarioActual = '', otroEscribiendo = false, noLeidos = 0,
  onEnviarMensaje, onEscribiendo, onMarcarLeido, onReaccionar,
}: ChatFlotanteProps) {
  const [abierto, setAbierto] = useState(false)
  const [tab, setTab] = useState<'chat' | 'personas'>('chat')
  const [texto, setTexto] = useState('')
  const [mostrarEmojis, setMostrarEmojis] = useState(false)
  const [msgHover, setMsgHover] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Drag state
  const [pos, setPos] = useState({ x: 0, y: 0 }) // offset from default (bottom-right)
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const wasDraggedRef = useRef(false)

  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragStartRef.current = { x: clientX, y: clientY, posX: pos.x, posY: pos.y }
    wasDraggedRef.current = false
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const dx = clientX - dragStartRef.current.x
      const dy = clientY - dragStartRef.current.y
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) wasDraggedRef.current = true
      // Clamp: mantener el FAB dentro del viewport
      const maxX = window.innerWidth - 76  // 24px right default + 52px button
      const maxY = window.innerHeight - 76 // 24px bottom default + 52px button
      const newX = Math.max(-(window.innerWidth - 76), Math.min(maxX - 24, dragStartRef.current.posX + dx))
      const newY = Math.max(-(maxY), Math.min(maxY - 24, dragStartRef.current.posY + dy))
      setPos({ x: newX, y: newY })
    }
    const onEnd = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [dragging])

  const online = participantes.filter(p => p.estado === 'online')
  const totalOnline = online.length

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (abierto && tab === 'chat' && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [mensajesChat.length, abierto, tab])

  // Sonido iOS-like cuando llega un mensaje NUEVO de OTRO usuario.
  // Se compara contra la cantidad previa para no sonar en el montaje ni en
  // mensajes propios. Fire-and-forget (si el audio no está disponible, no pasa nada).
  const prevMsgCountRef = useRef(mensajesChat.length)
  useEffect(() => {
    const prev = prevMsgCountRef.current
    if (mensajesChat.length > prev) {
      const ultimo = mensajesChat[mensajesChat.length - 1]
      if (ultimo && ultimo.usuario !== usuarioActual) {
        reproducirSonidoMensaje()
      }
    }
    prevMsgCountRef.current = mensajesChat.length
  }, [mensajesChat.length, usuarioActual])

  // Marcar leídos al abrir chat
  useEffect(() => {
    if (abierto && tab === 'chat' && noLeidos > 0) onMarcarLeido?.()
  }, [abierto, tab])

  const enviar = () => {
    const t = texto.trim()
    if (!t) return
    onEnviarMensaje?.(t)
    setTexto('')
    setMostrarEmojis(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
    else onEscribiendo?.()
  }

  const togglePanel = () => {
    setAbierto(!abierto)
    if (!abierto && noLeidos > 0) onMarcarLeido?.()
  }

  return (
    <>
      {/* Panel popup — se posiciona inteligentemente según dónde esté el FAB */}
      {abierto && (() => {
        const fabBottom = 24 - pos.y
        const fabRight = 24 - pos.x
        // Si el FAB está muy arriba, abrir panel hacia abajo
        const panelAbajo = fabBottom > 540
        const panelStyle: React.CSSProperties = {
          position: 'fixed',
          right: Math.max(fabRight, 10),
          zIndex: 9999,
          ...(panelAbajo
            ? { top: `calc(100vh - ${fabBottom}px + 60px)` }
            : { bottom: fabBottom + 60 }),
        }
        return (
        <div className="chat-flotante__panel" style={panelStyle}>
          {/* Header */}
          <div className="chat-flotante__header">
            <div className="chat-flotante__header-info">
              <h3 className="chat-flotante__header-title">Inventario en línea</h3>
              <span className="chat-flotante__header-status">
                <span className="chat-flotante__dot chat-flotante__dot--online" />
                {totalOnline} conectado{totalOnline !== 1 ? 's' : ''}
              </span>
            </div>
            <button type="button" className="chat-flotante__close" onClick={() => setAbierto(false)}>
              <FaTimes size={14} />
            </button>
          </div>

          {/* Tabs */}
          <div className="chat-flotante__tabs">
            <button type="button" className={`chat-flotante__tab${tab === 'chat' ? ' is-active' : ''}`} onClick={() => setTab('chat')}>
              <FaComments size={11} /> Chat
              {noLeidos > 0 && tab !== 'chat' && <span className="chat-flotante__tab-badge">{noLeidos}</span>}
            </button>
            <button type="button" className={`chat-flotante__tab${tab === 'personas' ? ' is-active' : ''}`} onClick={() => setTab('personas')}>
              <FaUsers size={11} /> Personas ({totalOnline})
            </button>
          </div>

          {/* Contenido */}
          <div className="chat-flotante__body">
            {tab === 'chat' && (
              <>
                {/* Lista de mensajes */}
                <div className="chat-flotante__messages" ref={listRef}>
                  {mensajesChat.length === 0 ? (
                    <div className="chat-flotante__empty">
                      <FaComments size={24} />
                      <p>No hay mensajes aún</p>
                      <span>Envía el primer mensaje al equipo</span>
                    </div>
                  ) : (
                    mensajesChat.map((msg) => {
                      const esMio = msg.usuario === usuarioActual
                      return (
                        <div
                          key={msg.id}
                          className={`chat-flotante__msg${esMio ? ' chat-flotante__msg--mio' : ''}`}
                          onMouseEnter={() => setMsgHover(msg.id)}
                          onMouseLeave={() => setMsgHover(null)}
                        >
                          {!esMio && (
                            <div className="chat-flotante__msg-avatar" style={{ background: getAvatarColor(msg.usuario) }}>
                              {getInitials(msg.usuario)}
                            </div>
                          )}
                          <div className="chat-flotante__msg-content">
                            {!esMio && <span className="chat-flotante__msg-name">{msg.usuario.split(' ')[0]}</span>}
                            <div className={`chat-flotante__msg-bubble${esMio ? ' chat-flotante__msg-bubble--mio' : ''}`}>
                              <p className="chat-flotante__msg-text">{msg.texto}</p>
                              <span className="chat-flotante__msg-time">
                                {formatTime(msg.timestamp)}
                                {esMio && <span className="chat-flotante__msg-check">{msg.leido ? '✓✓' : '✓'}</span>}
                              </span>
                            </div>
                            {/* Reacciones */}
                            {msg.reaccion && (
                              <span className="chat-flotante__msg-reaction">{msg.reaccion}</span>
                            )}
                            {/* Barra de reacción rápida */}
                            {msgHover === msg.id && !esMio && onReaccionar && (
                              <div className="chat-flotante__msg-react-bar">
                                {EMOJIS_RAPIDOS.slice(0, 5).map(e => (
                                  <button key={e} type="button" onClick={() => onReaccionar(msg.id, e)}>{e}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                  {otroEscribiendo && (
                    <div className="chat-flotante__typing">
                      <span className="chat-flotante__typing-dots"><span /><span /><span /></span>
                      Escribiendo...
                    </div>
                  )}
                </div>

                {/* Emoji picker — set amplio con scroll HORIZONTAL */}
                {mostrarEmojis && (
                  <div className="chat-flotante__emoji-picker">
                    {EMOJIS_PICKER.map(e => (
                      <button key={e} type="button" onClick={() => { setTexto(prev => prev + e) }}>{e}</button>
                    ))}
                  </div>
                )}

                {/* Input */}
                <div className="chat-flotante__input-area">
                  <button type="button" className="chat-flotante__emoji-btn" onClick={() => setMostrarEmojis(!mostrarEmojis)}>
                    <FaSmile size={16} />
                  </button>
                  <input
                    type="text"
                    className="chat-flotante__input"
                    placeholder="Escribe un mensaje..."
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={500}
                  />
                  <button type="button" className="chat-flotante__send-btn" onClick={enviar} disabled={!texto.trim()}>
                    <FaPaperPlane size={13} />
                  </button>
                </div>
              </>
            )}

            {tab === 'personas' && (
              <div className="chat-flotante__personas">
                {participantes.map((p) => (
                  <div key={p.cedula} className="chat-flotante__persona">
                    <div className="chat-flotante__persona-avatar" style={{ background: getAvatarColor(p.usuario) }}>
                      {getInitials(p.usuario)}
                      <span className={`chat-flotante__persona-dot${p.estado === 'online' ? ' is-online' : ''}`} />
                    </div>
                    <div className="chat-flotante__persona-info">
                      <span className="chat-flotante__persona-nombre">
                        {p.usuario}
                        {p.cedula === cedulaActual && <span className="chat-flotante__persona-yo">Yo</span>}
                      </span>
                      <span className="chat-flotante__persona-rol">{p.cargo || p.grupo || ''}</span>
                    </div>
                    <span className={`chat-flotante__persona-estado${p.estado === 'online' ? ' is-online' : ''}`}>
                      {p.estado === 'online' ? 'En línea' : 'Offline'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )
      })()}

      {/* Botón flotante (draggable) */}
      <button
        type="button"
        className={`chat-flotante__fab${abierto ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        onClick={() => { if (!wasDraggedRef.current) togglePanel() }}
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
      >
        {abierto ? <FaTimes size={18} /> : <FaComments size={18} />}
        {!abierto && noLeidos > 0 && <span className="chat-flotante__fab-badge">{noLeidos}</span>}
        {!abierto && conectado && <span className="chat-flotante__fab-dot" />}
      </button>
    </>
  )
}
