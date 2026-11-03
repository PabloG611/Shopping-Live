/**
 * Modal para agregar bienes que no tienen placa al inventario.
 * - Servicio auto-rellenado (del servicio activo)
 * - Descripción con autocompletado desde Firebird
 * - Ubicación con tabs (Buscar ubicación / Ubicación libre)
 * - Usuario con SelectorCoordinador
 */

import { useState, useEffect, useRef } from 'react'
import SelectorCoordinador from './SelectorCoordinador'
import type { TerceroFirebird } from './SelectorCoordinador'
import { getApiHeaders } from '../../utils/apiHeaders'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

interface ModalBienSinPlacaProps {
  isOpen: boolean
  servicio: string
  /** Lista de servicios activos para seleccionar (si hay más de 1) */
  serviciosActivos?: { codigo: string; nombre: string }[]
  ubicacionesTNS: { id: number; label: string }[]
  onAgregar: (bien: {
    descripcion: string
    ubicacion: string
    servicio: string
    custodio_nombre: string
    custodio_cedula: string
  }) => void
  onClose: () => void
}

type TabUbicacion = 'buscar' | 'libre'

export default function ModalBienSinPlaca({
  isOpen,
  servicio,
  serviciosActivos = [],
  ubicacionesTNS,
  onAgregar,
  onClose,
}: ModalBienSinPlacaProps) {
  // Descripción con autocompletado
  const [descripcion, setDescripcion] = useState('')
  const [sugerenciasDesc, setSugerenciasDesc] = useState<string[]>([])
  const [buscandoDesc, setBuscandoDesc] = useState(false)
  const [dropdownDescAbierto, setDropdownDescAbierto] = useState(false)
  const descTimeoutRef = useRef<number | null>(null)

  // Servicio seleccionado (desplegable si hay múltiples)
  const [servicioSeleccionado, setServicioSeleccionado] = useState(servicio)
  const [dropdownServicioAbierto, setDropdownServicioAbierto] = useState(false)

  // Ubicación
  const [tabUbicacion, setTabUbicacion] = useState<TabUbicacion>('buscar')
  const [busquedaUbicacion, setBusquedaUbicacion] = useState('')
  const [ubicacionLibre, setUbicacionLibre] = useState('')
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState('')
  const [dropdownUbicAbierto, setDropdownUbicAbierto] = useState(false)

  // Usuario
  const [custodioNombre, setCustodioNombre] = useState('')
  const [custodioIdentificacion, setCustodioIdentificacion] = useState('')
  const [usuarioAsignado, setUsuarioAsignado] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    // Prevenir scroll de la página detrás del modal
    document.body.style.overflow = 'hidden'
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Validación: descripción y usuario son obligatorios
  const formularioValido = descripcion.trim().length > 0 && usuarioAsignado && custodioNombre.trim().length > 0

  // ─── Autocompletado de descripción ──────────────────────────────────────
  const buscarDescripciones = (termino: string) => {
    if (descTimeoutRef.current) clearTimeout(descTimeoutRef.current)
    if (termino.trim().length < 4) {
      setSugerenciasDesc([])
      setDropdownDescAbierto(false)
      return
    }
    descTimeoutRef.current = window.setTimeout(async () => {
      setBuscandoDesc(true)
      try {
        const res = await fetch(`${API_URL}/almacen/admin/buscar-descripciones/?q=${encodeURIComponent(termino.trim())}`, {
          headers: getApiHeaders(),
        })
        if (res.ok) {
          const data = await res.json()
          const descs = data.descripciones ?? []
          setSugerenciasDesc(descs)
          setDropdownDescAbierto(descs.length > 0)
        } else {
          console.warn('[ModalBienSinPlaca] buscar-descripciones respondió:', res.status)
          setSugerenciasDesc([])
          setDropdownDescAbierto(false)
        }
      } catch (err) {
        console.error('[ModalBienSinPlaca] Error buscando descripciones:', err)
        setSugerenciasDesc([])
        setDropdownDescAbierto(false)
      }
      setBuscandoDesc(false)
    }, 350)
  }

  // ─── Filtrar ubicaciones ──────────────────────────────────────────────────
  const ubicacionesFiltradas = busquedaUbicacion.trim().length >= 2
    ? ubicacionesTNS.filter(u => u.label.toLowerCase().includes(busquedaUbicacion.trim().toLowerCase())).slice(0, 15)
    : []

  // ─── Seleccionar usuario ──────────────────────────────────────────────────
  const handleSeleccionarUsuario = (t: TerceroFirebird) => {
    setCustodioNombre(t.nombre)
    setCustodioIdentificacion(t.cedula)
    setUsuarioAsignado(true)
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleAgregar = () => {
    if (!formularioValido) return

    onAgregar({
      descripcion: descripcion.trim(),
      ubicacion: ubicacionSeleccionada || ubicacionLibre.trim(),
      servicio: servicioSeleccionado || servicio,
      custodio_nombre: custodioNombre.trim(),
      custodio_cedula: custodioIdentificacion.trim(),
    })

    // Limpiar
    setDescripcion('')
    setSugerenciasDesc([])
    setBusquedaUbicacion('')
    setUbicacionLibre('')
    setUbicacionSeleccionada('')
    setCustodioNombre('')
    setCustodioIdentificacion('')
    setUsuarioAsignado(false)
  }

  // ─── Handler global de Enter para enviar ──────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && formularioValido && !dropdownDescAbierto && !dropdownUbicAbierto) {
      e.preventDefault()
      handleAgregar()
    }
  }

  return (
    <div className="inventario-fisico__modal-overlay">
      <div className="inventario-fisico__modal" style={{ maxWidth: '620px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onKeyDown={handleKeyDown} tabIndex={-1}>
        <div className="inventario-fisico__modal-header">
          <h5>Agregar bien sin placa</h5>
          <button className="inventario-fisico__modal-close" onClick={onClose}>×</button>
        </div>

        <div className="inventario-fisico__modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {/* Info de contexto */}
          <div style={{ background: '#fff8e1', padding: '0.65rem 1rem', borderRadius: '8px', marginBottom: '1.2rem', border: '1px solid #ffe082', fontSize: '0.8rem', color: '#5d4037', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Este bien se agregará al inventario sin placa ni serial. Quedará resaltado en la tabla para su identificación.</span>
          </div>

          {/* Servicio: desplegable si hay múltiples activos, readonly si solo hay 1 */}
          <div style={{ marginBottom: '1.1rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#303d50', display: 'block', marginBottom: '0.3rem' }}>
              Servicio
            </label>
            {serviciosActivos.length > 1 ? (
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => setDropdownServicioAbierto(!dropdownServicioAbierto)}
                  style={{
                    width: '100%', padding: '0.55rem 2.2rem 0.55rem 0.85rem',
                    border: `1.5px solid ${dropdownServicioAbierto ? '#303d50' : '#ced4da'}`,
                    borderRadius: '8px', fontSize: '0.85rem', background: '#fff',
                    color: servicioSeleccionado ? '#37474f' : '#94a3b8', fontWeight: 500,
                    cursor: 'pointer', position: 'relative', userSelect: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxShadow: dropdownServicioAbierto ? '0 0 0 3px rgba(48,61,80,0.08)' : 'none',
                  }}
                >
                  {servicioSeleccionado || 'Seleccione un servicio'}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '10px', top: '50%', transform: `translateY(-50%) rotate(${dropdownServicioAbierto ? '180deg' : '0deg'})`, transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                {dropdownServicioAbierto && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
                    marginTop: '0.3rem', background: 'white', borderRadius: '10px',
                    border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    overflow: 'hidden', maxHeight: '200px', overflowY: 'auto',
                  }}>
                    {serviciosActivos.map((s) => {
                      const valor = `${s.codigo} - ${s.nombre}`
                      const seleccionado = servicioSeleccionado === valor
                      return (
                        <div
                          key={s.codigo}
                          onClick={() => { setServicioSeleccionado(valor); setDropdownServicioAbierto(false) }}
                          style={{
                            padding: '0.6rem 0.85rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: seleccionado ? '#f0f9ff' : 'white',
                            borderLeft: seleccionado ? '3px solid #3b82f6' : '3px solid transparent',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => { if (!seleccionado) e.currentTarget.style.background = '#f8fafc' }}
                          onMouseLeave={(e) => { if (!seleccionado) e.currentTarget.style.background = 'white' }}
                        >
                          <div>
                            <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>{s.nombre}</div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.1rem' }}>{s.codigo}</div>
                          </div>
                          {seleccionado && <span style={{ color: '#3b82f6', fontWeight: 700 }}>✓</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '0.55rem 0.85rem', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '0.85rem', background: '#f5f5f5', color: '#37474f', fontWeight: 500 }}>
                {servicioSeleccionado || 'Sin servicio activo'}
              </div>
            )}
          </div>

          {/* ─── Descripción con autocompletado ─── */}
          <div style={{ marginBottom: '1.1rem', position: 'relative' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#303d50', display: 'block', marginBottom: '0.3rem' }}>
              Descripción del bien <span style={{ color: '#d32f2f' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={descripcion}
                onChange={(e) => {
                  setDescripcion(e.target.value)
                  buscarDescripciones(e.target.value)
                }}
                onFocus={() => { if (sugerenciasDesc.length > 0) setDropdownDescAbierto(true) }}
                onBlur={() => setTimeout(() => setDropdownDescAbierto(false), 200)}
                placeholder="Escriba al menos 4 letras (ej: SILLA, ESCRITORIO, COMPUTADOR)..."
                maxLength={80}
                style={{ width: '100%', padding: '0.6rem 0.85rem', border: '1px solid #ced4da', borderRadius: '8px', fontSize: '0.85rem', paddingRight: '2.5rem' }}
                autoFocus
              />
              {buscandoDesc && (
                <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#78909c' }}>...</span>
              )}
            </div>
            {dropdownDescAbierto && sugerenciasDesc.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: 'white', border: '1px solid #dee2e6', borderTop: 'none', borderRadius: '0 0 8px 8px', maxHeight: '180px', overflowY: 'auto', boxShadow: '0 6px 16px rgba(0,0,0,0.12)' }}>
                {sugerenciasDesc.map((desc, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setDescripcion(desc)
                      setDropdownDescAbierto(false)
                      setSugerenciasDesc([])
                    }}
                    style={{ display: 'block', width: '100%', padding: '0.5rem 0.85rem', border: 'none', borderBottom: '1px solid #f5f5f5', background: 'white', cursor: 'pointer', textAlign: 'left', fontSize: '0.82rem', color: '#37474f' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#e3f2fd')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                  >
                    {desc}
                  </button>
                ))}
              </div>
            )}
            <p style={{ fontSize: '0.68rem', color: '#78909c', margin: '0.25rem 0 0' }}>Escriba mínimo 4 letras para sugerir descripciones de la base de datos.</p>
          </div>

          {/* ─── Ubicación ─── */}
          <div style={{ marginBottom: '1.1rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#303d50', display: 'block', marginBottom: '0.4rem' }}>
              Ubicación
            </label>
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem', background: '#f0f2f5', borderRadius: '8px', padding: '0.2rem' }}>
              <button type="button" onClick={() => setTabUbicacion('buscar')} style={{ flex: 1, padding: '0.45rem 0.75rem', background: tabUbicacion === 'buscar' ? 'white' : 'transparent', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: tabUbicacion === 'buscar' ? 600 : 400, cursor: 'pointer', color: tabUbicacion === 'buscar' ? '#303d50' : '#78909c', boxShadow: tabUbicacion === 'buscar' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>
                Buscar ubicación
              </button>
              <button type="button" onClick={() => setTabUbicacion('libre')} style={{ flex: 1, padding: '0.45rem 0.75rem', background: tabUbicacion === 'libre' ? 'white' : 'transparent', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: tabUbicacion === 'libre' ? 600 : 400, cursor: 'pointer', color: tabUbicacion === 'libre' ? '#303d50' : '#78909c', boxShadow: tabUbicacion === 'libre' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>
                Ubicación Fisica
              </button>
            </div>

            {tabUbicacion === 'buscar' && (
              <div style={{ position: 'relative' }}>
                <input type="text" value={busquedaUbicacion} onChange={(e) => { setBusquedaUbicacion(e.target.value); setDropdownUbicAbierto(true) }} onFocus={() => setDropdownUbicAbierto(true)} placeholder="Escriba para buscar ubicación..." style={{ width: '100%', padding: '0.55rem 0.85rem', border: '1px solid #ced4da', borderRadius: '8px', fontSize: '0.85rem' }} />
                {dropdownUbicAbierto && ubicacionesFiltradas.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'white', border: '1px solid #dee2e6', borderTop: 'none', borderRadius: '0 0 8px 8px', maxHeight: '150px', overflowY: 'auto', boxShadow: '0 6px 16px rgba(0,0,0,0.12)' }}>
                    {ubicacionesFiltradas.map((u, i) => (
                      <button key={i} type="button" onMouseDown={(e) => { e.preventDefault(); setBusquedaUbicacion(u.label); setUbicacionSeleccionada(u.label); setDropdownUbicAbierto(false) }} style={{ display: 'block', width: '100%', padding: '0.45rem 0.85rem', border: 'none', borderBottom: '1px solid #f5f5f5', background: 'white', cursor: 'pointer', textAlign: 'left', fontSize: '0.82rem' }} onMouseEnter={(e) => (e.currentTarget.style.background = '#e8f5e9')} onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}>
                        {u.label}
                      </button>
                    ))}
                  </div>
                )}
                {ubicacionSeleccionada && (
                  <div style={{ marginTop: '0.35rem', padding: '0.3rem 0.6rem', background: '#e8f5e9', borderRadius: '6px', fontSize: '0.75rem', color: '#2e7d32', fontWeight: 600, display: 'inline-block' }}>
                    Seleccionada: {ubicacionSeleccionada}
                  </div>
                )}
              </div>
            )}

            {tabUbicacion === 'libre' && (
              <input type="text" placeholder="Ej: Oficina 301, Piso 2, Almacén..." value={ubicacionLibre} onChange={(e) => { setUbicacionLibre(e.target.value); setUbicacionSeleccionada(e.target.value) }} style={{ width: '100%', padding: '0.55rem 0.85rem', border: '1px solid #ced4da', borderRadius: '8px', fontSize: '0.85rem' }} />
            )}
          </div>

          {/* ─── Usuario con SelectorCoordinador ─── */}
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#303d50', display: 'block', marginBottom: '0.4rem' }}>
              Usuario <span style={{ color: '#d32f2f' }}>*</span>
            </label>
            <SelectorCoordinador
              valor={custodioIdentificacion}
              onChange={(cedula) => {
                if (!cedula) {
                  setCustodioNombre('')
                  setCustodioIdentificacion('')
                  setUsuarioAsignado(false)
                }
              }}
              onSeleccionar={handleSeleccionarUsuario}
              placeholder="Buscar por cédula o nombre (mín. 3 caracteres)..."
            />
          </div>
        </div>

        <div className="inventario-fisico__modal-footer" style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
          <button type="button" className="floresta-busqueda__btn" style={{ background: 'transparent', border: '2px solid #303d50', color: '#303d50', borderRadius: '8px', padding: '0.55rem 1.2rem' }} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="floresta-busqueda__btn" onClick={handleAgregar} disabled={!formularioValido} style={{ opacity: !formularioValido ? 0.5 : 1, borderRadius: '8px', padding: '0.55rem 1.2rem' }}>
            Agregar al inventario
          </button>
        </div>
      </div>
    </div>
  )
}
