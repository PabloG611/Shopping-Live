/**
 * Modal para agregar un bien Floresta nuevo o asignar responsable.
 * - SelectorCoordinador para buscar responsable
 * - Autocompletado de descripción desde bienes existentes (FlorestaBien)
 * - Escape cierra, Enter guarda
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import SelectorCoordinador from './SelectorCoordinador'
import FloatingField from '../ui/FloatingField'
import { florestaAgregarBien } from '../../services/florestaService'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

interface ModalAgregarBienProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (msg: string) => void
  onError?: (msg: string) => void
}

export default function ModalAgregarBien({ isOpen, onClose, onSuccess, onError }: ModalAgregarBienProps) {
  const [placa, setPlaca] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [nombre, setNombre] = useState('')
  const [cedula, setCedula] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [placaExiste, setPlacaExiste] = useState<boolean | null>(null)
  const [verificandoPlaca, setVerificandoPlaca] = useState(false)
  const placaTimeoutRef = useRef<number | null>(null)

  // Autocompletado de descripción
  const [sugerencias, setSugerencias] = useState<string[]>([])
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const timeoutDescRef = useRef<number | null>(null)
  const descWrapRef = useRef<HTMLDivElement>(null)

  // Limpiar al abrir
  useEffect(() => {
    if (isOpen) {
      setPlaca('')
      setDescripcion('')
      setNombre('')
      setCedula('')
      setSugerencias([])
      setMostrarSugerencias(false)
      setPlacaExiste(null)
      setVerificandoPlaca(false)
    }
  }, [isOpen])

  // Verificar si la placa ya existe en Floresta
  const verificarPlaca = (valor: string) => {
    if (placaTimeoutRef.current) clearTimeout(placaTimeoutRef.current)
    setPlacaExiste(null)
    if (valor.trim().length < 3) return
    setVerificandoPlaca(true)
    placaTimeoutRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/almacen/floresta/buscar/?q=${encodeURIComponent(valor.trim())}`)
        if (res.ok) {
          const data = await res.json()
          const existe = (data.bienes ?? data.results ?? []).some(
            (b: { codigo?: string; placa?: string }) =>
              (b.codigo || b.placa || '').toUpperCase() === valor.trim().toUpperCase()
          )
          setPlacaExiste(existe)
        }
      } catch { /* silenciar */ }
      setVerificandoPlaca(false)
    }, 500)
  }

  // Buscar sugerencias de descripción
  const buscarDescripciones = (texto: string) => {
    if (timeoutDescRef.current) clearTimeout(timeoutDescRef.current)
    if (texto.trim().length < 3) { setSugerencias([]); setMostrarSugerencias(false); return }

    timeoutDescRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/almacen/floresta/sugerir-descripcion/?q=${encodeURIComponent(texto.trim())}`)
        if (res.ok) {
          const data = await res.json()
          setSugerencias(data.sugerencias ?? [])
          setMostrarSugerencias((data.sugerencias ?? []).length > 0)
        }
      } catch { /* silenciar */ }
    }, 300)
  }

  // Cerrar sugerencias al click fuera
  useEffect(() => {
    if (!mostrarSugerencias) return
    const handler = (e: MouseEvent) => {
      if (descWrapRef.current && !descWrapRef.current.contains(e.target as Node)) {
        setMostrarSugerencias(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mostrarSugerencias])

  const puedeGuardar = placa.trim() !== '' && !enviando

  const enviar = useCallback(async () => {
    if (!puedeGuardar) return
    setEnviando(true)
    const res = await florestaAgregarBien({
      placa: placa.trim(),
      descripcion: descripcion.trim() || undefined,
      responsable_nombre: nombre.trim() || undefined,
      responsable_cedula: cedula.trim() || undefined,
    })
    if (res.ok) {
      onSuccess?.(res.mensaje ?? 'Bien guardado correctamente.')
      onClose()
    } else {
      onError?.(res.mensaje ?? 'Error al guardar.')
    }
    setEnviando(false)
  }, [puedeGuardar, placa, descripcion, nombre, cedula, onClose, onSuccess, onError])

  // Escape cierra, Enter guarda
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMostrarSugerencias(false); onClose() }
      if (e.key === 'Enter' && puedeGuardar && !mostrarSugerencias) enviar()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose, puedeGuardar, enviar, mostrarSugerencias])

  if (!isOpen) return null

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '44px',
    padding: '0.6rem 0.75rem 0',
    border: '1px solid rgb(48 61 80 / 0.25)',
    borderRadius: '8px',
    fontSize: '0.9rem',
    color: '#212529',
    background: '#fff',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    outline: 'none',
  }

  return (
    <div className="inventario-fisico__modal-overlay">
      <div className="inventario-fisico__modal" style={{ maxWidth: '480px' }}>
        <div className="inventario-fisico__modal-header">
          <h5>Agregar bien Floresta</h5>
          <button className="inventario-fisico__modal-close" onClick={onClose}>×</button>
        </div>

        <div className="inventario-fisico__modal-body" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ fontSize: '0.8rem', color: '#6c757d', margin: 0 }}>
            Registre un bien nuevo o asigne responsable a uno existente sin dueño.
          </p>

          {/* Placa */}
          <div>
            <FloatingField label="Placa" required tieneValor={!!placa}>
              <input
                value={placa}
                onChange={(e) => { const v = e.target.value.toUpperCase().slice(0, 20); setPlaca(v); verificarPlaca(v) }}
                placeholder=" "
                maxLength={20}
                autoFocus
                style={{
                  ...inputStyle,
                  width: '180px',
                  borderColor: placaExiste === true ? '#d13c47' : placaExiste === false ? '#2e7d32' : undefined,
                }}
              />
            </FloatingField>
            {verificandoPlaca && (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem', display: 'inline-block' }}>Verificando...</span>
            )}
            {!verificandoPlaca && placaExiste === true && (
              <div style={{ fontSize: '0.75rem', color: '#d13c47', marginTop: '0.25rem', fontWeight: 600 }}>
                ⚠ Esta placa ya existe en Floresta
              </div>
            )}
            {!verificandoPlaca && placaExiste === false && (
              <div style={{ fontSize: '0.75rem', color: '#2e7d32', marginTop: '0.25rem', fontWeight: 600 }}>
                ✓ Placa disponible
              </div>
            )}
          </div>

          {/* Descripción con autocompletado */}
          <div style={{ position: 'relative' }} ref={descWrapRef}>
            <FloatingField label="Descripción" required={false} tieneValor={!!descripcion}>
              <input
                value={descripcion}
                onChange={(e) => { const v = e.target.value.slice(0, 100); setDescripcion(v); buscarDescripciones(v) }}
                onFocus={() => { if (sugerencias.length > 0) setMostrarSugerencias(true) }}
                placeholder=" "
                maxLength={100}
                style={inputStyle}
              />
            </FloatingField>
            {mostrarSugerencias && sugerencias.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: 'white', border: '1px solid #dee2e6', borderRadius: '0 0 8px 8px',
                maxHeight: '150px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
                {sugerencias.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => { setDescripcion(s); setMostrarSugerencias(false) }}
                    style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f0f4ff'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Responsable */}
          <div>
            <FloatingField label="Responsable" required={false} tieneValor={!!cedula || !!nombre}>
              <SelectorCoordinador
                valor={cedula}
                onChange={(cc) => setCedula(cc)}
                onSeleccionar={(t) => { setNombre(t.nombre); setCedula(t.cedula) }}
                placeholder="Buscar por cédula o nombre (mín. 3 caracteres)..."
              />
            </FloatingField>
            {nombre && (
              <div style={{ marginTop: '0.3rem', fontSize: '0.78rem', color: '#2e7d32', fontWeight: 600 }}>
                ✓ {nombre} — CC {cedula}
              </div>
            )}
          </div>
        </div>

        <div className="inventario-fisico__modal-footer" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', padding: '1rem 1.5rem' }}>
          <button
            className="floresta-busqueda__btn"
            style={{ background: 'transparent', border: '2px solid #303d50', color: '#303d50', borderRadius: '8px' }}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="floresta-busqueda__btn"
            onClick={enviar}
            disabled={!puedeGuardar}
            style={{ borderRadius: '8px' }}
          >
            {enviando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
