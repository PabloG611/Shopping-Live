/**
 * Mini chat entre participantes del inventario colaborativo.
 * Funciona via el canal WS de presencia (HTTP POST → backend → WS grupo almacen).
 */
import { useState, useRef, useEffect } from 'react'

export interface MensajeChat {
  id: string
  usuario: string
  texto: string
  timestamp: number
  leido: boolean
  reaccion?: string
  editado?: boolean
}

interface MiniChatProps {
  mensajes: MensajeChat[]
  usuarioActual: string
  otroEscribiendo: boolean
  noLeidos: number
  onEnviar: (texto: string) => void
  onEscribiendo: () => void
  onMarcarLeido: () => void
}

export default function MiniChat({
  mensajes,
  usuarioActual,
  otroEscribiendo,
  noLeidos,
  onEnviar,
  onEscribiendo,
  onMarcarLeido,
}: MiniChatProps) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const typingTimerRef = useRef<number | null>(null)

  // Scroll al fondo cuando llegan mensajes nuevos
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [mensajes.length])

  // Marcar como leído al abrir
  useEffect(() => {
    if (abierto && noLeidos > 0) {
      onMarcarLeido()
    }
  }, [abierto, noLeidos, onMarcarLeido])

  const handleEnviar = () => {
    const msg = texto.trim()
    if (!msg) return
    onEnviar(msg)
    setTexto('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviar()
    }
  }

  const handleInput = (value: string) => {
    setTexto(value)
    // Notificar "escribiendo" con debounce
    onEscribiendo()
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = window.setTimeout(() => {}, 2000)
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.35rem 0.7rem', background: '#303d50', color: 'white',
          border: 'none', borderRadius: '16px', cursor: 'pointer',
          fontSize: '0.75rem', fontWeight: 600, position: 'relative',
        }}
      >
        <span>&#128172;</span> Chat
        {noLeidos > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            background: '#dc3545', color: 'white', borderRadius: '50%',
            width: '16px', height: '16px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700,
          }}>
            {noLeidos}
          </span>
        )}
      </button>
    )
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 1001,
      background: 'white', borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)', border: '1px solid #e0e0e0',
      width: '320px', display: 'flex', flexDirection: 'column', maxHeight: '380px',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.6rem 1rem', background: '#303d50', color: 'white',
        borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', fontSize: '0.8rem', fontWeight: 600,
      }}>
        <span>&#128172; Chat del inventario</span>
        <button
          onClick={() => setAbierto(false)}
          style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
        >
          &times;
        </button>
      </div>

      {/* Mensajes */}
      <div ref={listRef} style={{
        flex: 1, overflowY: 'auto', padding: '0.6rem', minHeight: '180px', maxHeight: '250px',
        display: 'flex', flexDirection: 'column', gap: '0.4rem',
      }}>
        {mensajes.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9e9e9e', fontSize: '0.75rem', padding: '2rem 0' }}>
            Sin mensajes aún
          </div>
        )}
        {mensajes.map(msg => {
          const esMio = msg.usuario === usuarioActual
          return (
            <div key={msg.id} style={{
              alignSelf: esMio ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
            }}>
              {!esMio && (
                <div style={{ fontSize: '0.65rem', color: '#6c757d', marginBottom: '0.1rem', fontWeight: 600 }}>
                  {msg.usuario.split(' ')[0]}
                </div>
              )}
              <div style={{
                padding: '0.4rem 0.7rem',
                borderRadius: esMio ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: esMio ? '#303d50' : '#f0f0f0',
                color: esMio ? 'white' : '#303d50',
                fontSize: '0.8rem', lineHeight: 1.3,
                wordBreak: 'break-word',
              }}>
                {msg.texto}
              </div>
              <div style={{
                fontSize: '0.6rem', color: '#9e9e9e',
                textAlign: esMio ? 'right' : 'left',
                marginTop: '0.1rem',
                display: 'flex', alignItems: 'center', gap: '0.2rem',
                justifyContent: esMio ? 'flex-end' : 'flex-start',
              }}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {esMio && (
                  <span style={{ color: msg.leido ? '#4caf50' : '#bdbdbd' }}>
                    {msg.leido ? '✓✓' : '✓'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {otroEscribiendo && (
          <div style={{
            alignSelf: 'flex-start', padding: '0.3rem 0.6rem',
            background: '#f0f0f0', borderRadius: '12px',
            fontSize: '0.72rem', color: '#6c757d', fontStyle: 'italic',
          }}>
            Escribiendo...
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '0.5rem', borderTop: '1px solid #eee',
        display: 'flex', gap: '0.4rem', alignItems: 'center',
      }}>
        <input
          type="text"
          value={texto}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje..."
          style={{
            flex: 1, padding: '0.45rem 0.7rem', border: '1px solid #dee2e6',
            borderRadius: '20px', fontSize: '0.8rem', outline: 'none',
          }}
        />
        <button
          onClick={handleEnviar}
          disabled={!texto.trim()}
          style={{
            background: texto.trim() ? '#303d50' : '#e0e0e0',
            color: 'white', border: 'none', borderRadius: '50%',
            width: '30px', height: '30px', cursor: texto.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.85rem',
          }}
        >
          &#10148;
        </button>
      </div>
    </div>
  )
}
