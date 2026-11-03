/**
 * Panel de participantes y chat integrado del inventario colaborativo.
 * Panel se sobrepone en toda la página (position: fixed).
 * Incluye: tabs, reacciones, edición, emojis, badge visible, mensajes de voz.
 */
import { useState, useRef, useEffect } from 'react'
import type { ParticipanteSesion } from '../../hooks/useInventarioColaborativo'
import type { MensajeChat } from './MiniChat'

interface IndicadorParticipantesProps {
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

const EMOJIS_RAPIDOS = [
  // Caras
  '😊', '😂', '🤣', '😍', '🥰', '😎', '🤔', '😅', '😢', '🥺',
  // Gestos
  '👍', '👎', '👌', '🙌', '👏', '🤝', '💪', '🙏', '✌️', '🤞',
  // Objetos / Símbolos
  '✅', '❌', '⚠️', '🔥', '❤️', '💯', '⭐', '🎉', '📌', '💡',
  // Animales / Naturaleza
  '🐶', '🦊', '🌟', '🌈', '☀️', '🍀',
]
const EMOJIS_REACCION = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯']

// Colores para avatares — se asigna uno según el nombre
const AVATAR_COLORS = [
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #fccb90, #d57eeb)',
  'linear-gradient(135deg, #30cfd0, #330867)',
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

export default function IndicadorParticipantes({
  participantes, cedulaActual: _cedulaActual, conectado,
  mensajesChat = [], usuarioActual = '', otroEscribiendo = false, noLeidos = 0,
  onEnviarMensaje, onEscribiendo, onMarcarLeido, onReaccionar, onEditar,
}: IndicadorParticipantesProps) {
  const [expandido, setExpandido] = useState(false)
  const [tab, setTab] = useState<'participantes' | 'chat'>('participantes')
  const [texto, setTexto] = useState('')
  const [mostrarEmojis, setMostrarEmojis] = useState(false)
  const [msgHover, setMsgHover] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editTexto, setEditTexto] = useState('')
  const [grabando, setGrabando] = useState(false)
  const [tiempoGrabacion, setTiempoGrabacion] = useState(0)
  const [mostrarMenciones, setMostrarMenciones] = useState(false)
  const [filtroMencion, setFiltroMencion] = useState('')
  const [indiceMencion, setIndiceMencion] = useState(0)
  const [mencionesNoLeidas, setMencionesNoLeidas] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const online = participantes.filter(p => p.estado === 'online')
  const offline = participantes.filter(p => p.estado === 'offline')
  const totalOnline = online.length

  useEffect(() => {
    if (tab === 'chat' && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [mensajesChat.length, tab])

  // Sonido de notificación + detección de menciones
  const prevMsgCountRef = useRef(mensajesChat.length)
  useEffect(() => {
    const newCount = mensajesChat.length
    if (newCount > prevMsgCountRef.current) {
      const ultimo = mensajesChat[mensajesChat.length - 1]
      if (ultimo && ultimo.usuario !== usuarioActual) {
        // Detectar si me mencionaron
        const meMencionaron = ultimo.texto.toLowerCase().includes(`@${usuarioActual.toLowerCase()}`) ||
          usuarioActual.split(' ').some(part => part.length > 3 && ultimo.texto.toLowerCase().includes(`@${part.toLowerCase()}`))

        if (meMencionaron && !(expandido && tab === 'chat')) {
          setMencionesNoLeidas(prev => prev + 1)
        }

        try {
          const ctx = new AudioContext()
          const gain = ctx.createGain()
          gain.connect(ctx.destination)
          gain.gain.value = meMencionaron ? 0.35 : 0.2
          // Mención: sonido más fuerte y diferente (urgente)
          const notas = meMencionaron ? [1320, 1760, 2093] : [987, 1175, 1480]
          notas.forEach((freq, i) => {
            const osc = ctx.createOscillator()
            osc.type = meMencionaron ? 'triangle' : 'sine'
            osc.frequency.value = freq
            osc.connect(gain)
            osc.start(ctx.currentTime + i * 0.08)
            osc.stop(ctx.currentTime + i * 0.08 + (meMencionaron ? 0.15 : 0.1))
          })
          gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (meMencionaron ? 0.5 : 0.35))
        } catch { /* silenciar */ }
      }
    }
    prevMsgCountRef.current = newCount
  }, [mensajesChat.length, usuarioActual, expandido, tab])

  useEffect(() => {
    if (expandido && tab === 'chat') {
      if (noLeidos > 0 && onMarcarLeido) onMarcarLeido()
      setMencionesNoLeidas(0)
    }
  }, [expandido, tab, noLeidos, onMarcarLeido])

  const handleEnviar = () => {
    const msg = texto.trim()
    if (!msg || !onEnviarMensaje) return
    onEnviarMensaje(msg)
    setTexto('')
    setMostrarEmojis(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Navegación en dropdown de menciones
    if (mostrarMenciones && participantesFiltradosMencion.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIndiceMencion(i => (i + 1) % participantesFiltradosMencion.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIndiceMencion(i => (i - 1 + participantesFiltradosMencion.length) % participantesFiltradosMencion.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertarMencion(participantesFiltradosMencion[indiceMencion].usuario); return }
      if (e.key === 'Escape') { e.preventDefault(); setMostrarMenciones(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() }
    if (e.key === 'Escape') { if (editandoId) { setEditandoId(null); setEditTexto('') } else setExpandido(false) }
  }

  const handleInput = (value: string) => {
    setTexto(value)
    if (onEscribiendo) onEscribiendo()
    // Detectar @menciones
    const atIdx = value.lastIndexOf('@')
    if (atIdx >= 0) {
      const despuesDeAt = value.slice(atIdx + 1)
      // Solo mostrar si no hay espacio después del @ (está escribiendo el nombre)
      if (!despuesDeAt.includes(' ') || despuesDeAt.length <= 20) {
        setFiltroMencion(despuesDeAt.toLowerCase())
        setMostrarMenciones(true)
        setIndiceMencion(0)
        return
      }
    }
    setMostrarMenciones(false)
  }

  const participantesFiltradosMencion = participantes
    .filter(p => p.usuario !== usuarioActual)
    .filter(p => !filtroMencion || p.usuario.toLowerCase().includes(filtroMencion))

  const insertarMencion = (nombreCompleto: string) => {
    const atIdx = texto.lastIndexOf('@')
    const primerNombre = nombreCompleto.split(' ')[0]
    const nuevoTexto = texto.slice(0, atIdx) + `@${primerNombre} `
    setTexto(nuevoTexto)
    setMostrarMenciones(false)
    setFiltroMencion('')
  }
  const enviarEmoji = (emoji: string) => { if (onEnviarMensaje) onEnviarMensaje(emoji); setMostrarEmojis(false) }
  const iniciarEdicion = (msg: MensajeChat) => { setEditandoId(msg.id); setEditTexto(msg.texto) }
  const confirmarEdicion = () => { if (editandoId && editTexto.trim() && onEditar) onEditar(editandoId, editTexto.trim()); setEditandoId(null); setEditTexto('') }

  // Renderizar texto del mensaje con @menciones resaltadas
  const renderTextoConMenciones = (texto: string, esMio: boolean) => {
    const partes = texto.split(/(@[A-Za-zÁÉÍÓÚáéíóúñÑüÜ]+)(?=\s|$)/g)
    if (partes.length === 1) return <>{texto}</>
    return (
      <>
        {partes.map((parte, idx) => {
          if (parte.startsWith('@') && parte.length > 1) {
            const nombre = parte.slice(1).trim()
            const primerNombreMio = usuarioActual.split(' ')[0]?.toLowerCase() || ''
            const esMencionMia = nombre.toLowerCase() === primerNombreMio ||
              nombre.toLowerCase() === usuarioActual.toLowerCase() ||
              usuarioActual.toLowerCase().includes(nombre.toLowerCase())
            return (
              <span key={idx} style={{
                background: esMencionMia ? 'rgba(255,200,50,0.35)' : (esMio ? 'rgba(255,255,255,0.2)' : 'rgba(59,130,246,0.12)'),
                color: esMencionMia ? '#fbbf24' : (esMio ? '#93c5fd' : '#2563eb'),
                fontWeight: 700,
                padding: '0.05rem 0.25rem',
                borderRadius: '4px',
                fontSize: '0.84rem',
              }}>
                {parte}
              </span>
            )
          }
          return <span key={idx}>{parte}</span>
        })}
      </>
    )
  }

  // ─── Grabación de voz ────────────────────────────────────────────────
  const iniciarGrabacion = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onloadend = () => { if (onEnviarMensaje) onEnviarMensaje(`[audio]${reader.result as string}`) }
        reader.readAsDataURL(blob)
      }
      recorder.start()
      setGrabando(true)
      setTiempoGrabacion(0)
      timerRef.current = window.setInterval(() => setTiempoGrabacion(t => t + 1), 1000)
    } catch { /* micrófono no disponible */ }
  }

  const detenerGrabacion = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop()
    setGrabando(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const cancelarGrabacion = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
      mediaRecorderRef.current.stop()
      chunksRef.current = []
    }
    setGrabando(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const formatTiempo = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      {/* Badge de mensajes no leídos */}
      {noLeidos > 0 && !expandido && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          background: mencionesNoLeidas > 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
          color: 'white', borderRadius: '20px',
          padding: '0.4rem 0.85rem', fontSize: '0.78rem', fontWeight: 700,
          boxShadow: mencionesNoLeidas > 0 ? '0 4px 16px rgba(245,158,11,0.5)' : '0 4px 12px rgba(238,90,36,0.4)',
          animation: mencionesNoLeidas > 0 ? 'pulse-badge 0.8s infinite' : 'pulse-badge 1.5s infinite',
          cursor: 'pointer', transition: 'transform 0.15s',
        }} onClick={() => { setExpandido(true); setTab('chat') }}
           onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)' }}
           onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {mencionesNoLeidas > 0 ? (
            <>
              <span style={{ fontSize: '0.9rem' }}>@</span>
              <span>Te mencionaron</span>
              {noLeidos > 1 && <span style={{ background: 'rgba(255,255,255,0.3)', padding: '0.1rem 0.35rem', borderRadius: '8px', fontSize: '0.7rem' }}>+{noLeidos}</span>}
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>{noLeidos} mensaje{noLeidos > 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      )}

      {/* Botón principal */}
      <button
        ref={btnRef}
        onClick={() => setExpandido(!expandido)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.5rem 1rem',
          background: conectado ? 'linear-gradient(135deg, #303d50, #455a73)' : 'linear-gradient(135deg, #6c757d, #495057)',
          color: 'white', border: 'none', borderRadius: '24px', cursor: 'pointer',
          fontSize: '0.8rem', fontWeight: 700,
          boxShadow: mencionesNoLeidas > 0 ? '0 4px 16px rgba(245,158,11,0.4), 0 0 0 2px #f59e0b' : '0 4px 14px rgba(48, 61, 80, 0.3)',
          transition: 'all 0.2s ease',
          position: 'relative',
        }}
      >
        <span style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: totalOnline > 1 ? '#4caf50' : conectado ? '#ff9800' : '#f44336',
          animation: totalOnline > 1 ? 'pulse-dot 1.5s infinite' : 'none', flexShrink: 0,
          boxShadow: totalOnline > 1 ? '0 0 6px #4caf50' : 'none',
        }} />
        <span>{totalOnline} en linea</span>
        {/* Indicador de mención sobre el botón */}
        {mencionesNoLeidas > 0 && !expandido && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            width: '18px', height: '18px', borderRadius: '50%',
            background: '#f59e0b', color: 'white', fontSize: '0.6rem', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid white', boxShadow: '0 2px 6px rgba(245,158,11,0.5)',
            animation: 'pulse-badge 0.8s infinite',
          }}>@</span>
        )}
      </button>

      {/* Panel expandido */}
      {expandido && (
        <div style={{
          position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 9999,
          background: 'white', borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
          width: '400px', overflow: 'hidden',
          animation: 'slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          transformOrigin: 'bottom right',
        }}>
          {/* Header con gradiente */}
          <div style={{ background: 'linear-gradient(135deg, #1a2332 0%, #2d4059 50%, #3d5a80 100%)' }}>
            <div style={{ padding: '0.85rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>📡</div>
                <div>
                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'white', display: 'block' }}>Inventario en línea</span>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)' }}>{totalOnline} conectado{totalOnline !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <button onClick={() => setExpandido(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>&times;</button>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 1.25rem' }}>
              <button onClick={() => setTab('participantes')} style={{ flex: 1, padding: '0.6rem 0', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, borderBottom: tab === 'participantes' ? '3px solid #4caf50' : '3px solid transparent', opacity: tab === 'participantes' ? 1 : 0.6, transition: 'all 0.2s' }}>
                👥 Participantes ({totalOnline})
              </button>
              <button onClick={() => setTab('chat')} style={{ flex: 1, padding: '0.6rem 0', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, borderBottom: tab === 'chat' ? '3px solid #4caf50' : '3px solid transparent', opacity: tab === 'chat' ? 1 : 0.6, transition: 'all 0.2s', position: 'relative' }}>
                💬 Chat
                {noLeidos > 0 && tab !== 'chat' && <span style={{ position: 'absolute', top: '8px', right: '20px', background: '#ff6b6b', borderRadius: '50%', width: '10px', height: '10px', border: '2px solid #1a2332' }} />}
              </button>
            </div>
          </div>

          {/* Tab: Participantes */}
          {tab === 'participantes' && (
            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {online.map((p, idx) => {
                // El usuario actual es siempre el primer elemento del array de participantes
                const esMio = idx === 0
                return <ParticipanteItem key={`${p.cedula}-${p.usuario}`} participante={p} esTu={esMio} />
              })}
              {offline.length > 0 && (
                <div style={{ padding: '0.4rem 1.25rem', background: 'linear-gradient(90deg, #f8f9fa, #fff)', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderTop: '1px solid #f1f5f9' }}>
                  Desconectados ({offline.length})
                </div>
              )}
              {offline.map(p => <ParticipanteItem key={p.usuario} participante={p} esTu={false} />)}
              {participantes.length === 0 && (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                  <span style={{ display: 'block', fontSize: '2rem', marginBottom: '0.5rem' }}>👤</span>
                  Sin participantes conectados
                </div>
              )}
            </div>
          )}

          {/* Tab: Chat */}
          {tab === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '420px' }}>
              {/* Mensajes */}
              <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#f8fafc' }}>
                {mensajesChat.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem', padding: '3rem 0' }}>
                    <span style={{ display: 'block', fontSize: '2.5rem', marginBottom: '0.5rem' }}>👋</span>
                    Envía un mensaje a tu equipo
                  </div>
                )}
                {mensajesChat.map(msg => {
                  const esMio = msg.usuario === usuarioActual
                  const esEmoji = msg.texto.length <= 4 && /^[\p{Emoji}]+$/u.test(msg.texto)
                  const esAudio = msg.texto.startsWith('[audio]')
                  const isHovered = msgHover === msg.id

                  return (
                    <div key={msg.id} style={{ alignSelf: esMio ? 'flex-end' : 'flex-start', maxWidth: '80%', position: 'relative', animation: 'msgAppear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                      onMouseEnter={() => setMsgHover(msg.id)} onMouseLeave={() => setMsgHover(null)}>
                      {!esMio && (
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: getAvatarColor(msg.usuario), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.45rem', color: 'white', fontWeight: 800 }}>{getInitials(msg.usuario).charAt(0)}</span>
                          {msg.usuario.split(' ')[0]}
                        </div>
                      )}

                      {editandoId === msg.id ? (
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          <input autoFocus value={editTexto} onChange={e => setEditTexto(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') confirmarEdicion(); if (e.key === 'Escape') { setEditandoId(null); setEditTexto('') } }}
                            style={{ flex: 1, padding: '0.4rem 0.7rem', border: '2px solid #4caf50', borderRadius: '10px', fontSize: '0.8rem', outline: 'none' }} />
                          <button onClick={confirmarEdicion} style={{ background: '#4caf50', color: 'white', border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 700 }}>✓</button>
                          <button onClick={() => { setEditandoId(null); setEditTexto('') }} style={{ background: '#e2e8f0', border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : esAudio ? (
                        <div style={{
                          padding: '0.55rem 0.85rem', borderRadius: esMio ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          background: esMio ? 'linear-gradient(135deg, #303d50, #455a73)' : 'white',
                          border: esMio ? 'none' : '1px solid #e2e8f0',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        }}>
                          <span style={{ fontSize: '1.2rem' }}>🎙️</span>
                          <audio controls src={msg.texto.replace('[audio]', '')} style={{ height: '34px', maxWidth: '170px', borderRadius: '18px' }} />
                        </div>
                      ) : (
                        <div onDoubleClick={() => esMio && iniciarEdicion(msg)} style={{
                          padding: esEmoji ? '0.2rem' : '0.55rem 0.9rem',
                          borderRadius: esMio ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          background: esEmoji ? 'transparent' : (esMio ? 'linear-gradient(135deg, #303d50, #455a73)' : 'white'),
                          color: esMio ? 'white' : '#1e293b',
                          border: esEmoji || esMio ? 'none' : '1px solid #e2e8f0',
                          fontSize: esEmoji ? '2rem' : '0.86rem', lineHeight: 1.45,
                          wordBreak: 'break-word', cursor: esMio ? 'pointer' : 'default',
                          boxShadow: esEmoji ? 'none' : '0 2px 8px rgba(0,0,0,0.04)',
                        }} title={esMio ? 'Doble click para editar' : ''}>
                          {renderTextoConMenciones(msg.texto, esMio)}
                          {msg.editado && <span style={{ fontSize: '0.55rem', opacity: 0.6, marginLeft: '0.3rem' }}>(editado)</span>}
                        </div>
                      )}

                      {/* Reacción */}
                      {msg.reaccion && (
                        <div style={{ position: 'absolute', bottom: '-6px', [esMio ? 'left' : 'right']: '8px', background: 'white', borderRadius: '12px', padding: '2px 5px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontSize: '0.85rem', lineHeight: 1, zIndex: 2 }}>
                          {msg.reaccion}
                        </div>
                      )}

                      {/* Barra de reacción hover */}
                      {isHovered && !esMio && !editandoId && onReaccionar && (
                        <div style={{ display: 'flex', gap: '2px', marginTop: '4px', background: 'white', borderRadius: '16px', padding: '4px 8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '1px solid #f1f5f9', width: 'fit-content' }}>
                          {EMOJIS_REACCION.map(e => (
                            <button key={e} onClick={() => onReaccionar(msg.id, e)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '2px 4px', borderRadius: '6px', transition: 'transform 0.1s' }}
                              onMouseEnter={ev => { ev.currentTarget.style.transform = 'scale(1.4)' }}
                              onMouseLeave={ev => { ev.currentTarget.style.transform = 'scale(1)' }}
                            >{e}</button>
                          ))}
                        </div>
                      )}

                      {/* Meta (hora + leído) */}
                      <div style={{ fontSize: '0.64rem', color: '#94a3b8', textAlign: esMio ? 'right' : 'left', marginTop: msg.reaccion ? '0.6rem' : '0.15rem', display: 'flex', alignItems: 'center', gap: '0.2rem', justifyContent: esMio ? 'flex-end' : 'flex-start' }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {esMio && <span style={{ color: msg.leido ? '#4caf50' : '#cbd5e1', fontSize: '0.75rem' }}>{msg.leido ? '✓✓' : '✓'}</span>}
                      </div>
                    </div>
                  )
                })}
                {otroEscribiendo && (
                  <div style={{ alignSelf: 'flex-start', padding: '0.4rem 0.8rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', fontSize: '0.76rem', color: '#64748b', fontStyle: 'italic', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                    <span style={{ animation: 'pulse-dot 1s infinite' }}>●</span> Escribiendo...
                  </div>
                )}
              </div>

              {/* Emojis rápidos */}
              {mostrarEmojis && (
                <div style={{ padding: '0.7rem 0.85rem', borderTop: '1px solid #f1f5f9', background: '#fafbfc', maxHeight: '160px', overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.3rem', justifyItems: 'center' }}>
                    {EMOJIS_RAPIDOS.map(e => (
                      <button key={e} onClick={() => enviarEmoji(e)} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.4rem', cursor: 'pointer', fontSize: '1.2rem', transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={ev => { ev.currentTarget.style.transform = 'scale(1.2)'; ev.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)' }}
                        onMouseLeave={ev => { ev.currentTarget.style.transform = 'scale(1)'; ev.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
                      >{e}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Dropdown de @menciones */}
              {mostrarMenciones && participantesFiltradosMencion.length > 0 && (
                <div style={{ padding: '0.4rem 0.85rem', borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Mencionar a:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', maxHeight: '130px', overflowY: 'auto' }}>
                    {participantesFiltradosMencion.map((p, idx) => (
                      <button
                        key={p.usuario}
                        onMouseDown={(e) => { e.preventDefault(); insertarMencion(p.usuario) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.4rem 0.6rem', border: 'none', borderRadius: '8px',
                          background: idx === indiceMencion ? '#e0f2fe' : 'transparent',
                          cursor: 'pointer', fontSize: '0.82rem', color: '#1e293b',
                          textAlign: 'left', transition: 'background 0.1s', width: '100%',
                        }}
                        onMouseEnter={() => setIndiceMencion(idx)}
                      >
                        <span style={{ width: '22px', height: '22px', borderRadius: '6px', background: getAvatarColor(p.usuario), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.6rem', fontWeight: 800, flexShrink: 0 }}>
                          {getInitials(p.usuario).charAt(0)}
                        </span>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.usuario}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input / Grabación */}
              <div style={{ padding: '0.65rem 0.85rem', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'white' }}>
                {grabando ? (
                  <>
                    <button onClick={cancelarGrabacion} style={{ background: '#fee2e2', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: '#dc2626' }}>✕</button>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem', background: '#fef2f2', borderRadius: '20px', border: '1px solid #fecaca' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#dc2626', animation: 'pulse-dot 1s infinite' }} />
                      <span style={{ fontSize: '0.82rem', color: '#dc2626', fontWeight: 700 }}>{formatTiempo(tiempoGrabacion)}</span>
                      <span style={{ fontSize: '0.72rem', color: '#6c757d' }}>Grabando...</span>
                    </div>
                    <button onClick={detenerGrabacion} style={{ background: 'linear-gradient(135deg, #4caf50, #43a047)', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', boxShadow: '0 2px 8px rgba(76,175,80,0.3)' }}>➤</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setMostrarEmojis(!mostrarEmojis)} style={{ background: mostrarEmojis ? '#f1f5f9' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0.3rem', borderRadius: '8px', transition: 'background 0.15s' }} title="Emojis">😊</button>
                    <input type="text" value={texto} onChange={e => handleInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Escribe un mensaje..."
                      style={{ flex: 1, padding: '0.5rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: '22px', fontSize: '0.86rem', outline: 'none', transition: 'border-color 0.2s', background: '#f8fafc' }} />
                    {texto.trim() ? (
                      <button onClick={handleEnviar} style={{ background: 'linear-gradient(135deg, #303d50, #455a73)', color: 'white', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', boxShadow: '0 3px 10px rgba(48,61,80,0.3)', transition: 'transform 0.15s' }}>➤</button>
                    ) : (
                      <button onClick={iniciarGrabacion} style={{ background: 'linear-gradient(135deg, #303d50, #455a73)', border: 'none', cursor: 'pointer', fontSize: '1rem', borderRadius: '50%', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 3px 10px rgba(48,61,80,0.3)' }} title="Mensaje de voz">🎤</button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.4); } }
        @keyframes pulse-badge { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes slideUp {
          0% { opacity: 0; transform: scale(0.9) translateY(16px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes msgAppear {
          0% { opacity: 0; transform: translateY(10px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

function ParticipanteItem({ participante, esTu }: { participante: ParticipanteSesion; esTu: boolean }) {
  const esOnline = participante.estado === 'online'
  const initials = getInitials(participante.usuario)
  const avatarBg = esTu ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : getAvatarColor(participante.usuario)

  return (
    <div style={{
      padding: '0.7rem 1.25rem', borderBottom: '1px solid #f1f5f9',
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      opacity: esOnline ? 1 : 0.5, transition: 'background 0.15s',
      background: esTu ? 'linear-gradient(90deg, #eff6ff, #f8fafc)' : 'transparent',
      borderLeft: esTu ? '3px solid #3b82f6' : '3px solid transparent',
    }}>
      {/* Avatar con iniciales */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.5px',
          boxShadow: esTu ? '0 2px 8px rgba(59,130,246,0.3)' : 'none',
        }}>
          {initials}
        </div>
        {/* Dot de estado */}
        <span style={{
          position: 'absolute', bottom: '-1px', right: '-1px',
          width: '11px', height: '11px', borderRadius: '50%',
          background: esOnline ? '#22c55e' : '#cbd5e1',
          border: '2px solid white',
          boxShadow: esOnline ? '0 0 5px rgba(34,197,94,0.5)' : 'none',
        }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {participante.usuario}
          </span>
          {esTu && (
            <span style={{
              fontSize: '0.58rem', color: '#3b82f6', fontWeight: 700,
              padding: '0.1rem 0.35rem', borderRadius: '4px',
              background: '#dbeafe', border: '1px solid #93c5fd',
              lineHeight: 1.2, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.3px',
            }}>
              Yo
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span>{participante.cargo || participante.grupo || 'Sin grupo asignado'}</span>
        </div>
      </div>

      {/* Badge estado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: esOnline ? '#22c55e' : '#94a3b8',
        }} />
        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: esOnline ? '#16a34a' : '#94a3b8' }}>
          {esOnline ? 'En línea' : 'Desconectado'}
        </span>
      </div>
    </div>
  )
}
