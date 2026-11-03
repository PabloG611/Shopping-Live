/**
 * Selector de coordinador con búsqueda por nombre o cédula.
 * Mismo estilo visual que SelectorRegional y SelectorUbicacion.
 * Features:
 * - Siempre muestra las coincidencias en un listado para que el usuario elija
 *   (nunca auto-selecciona, ni aunque haya una sola coincidencia)
 * - Ingreso manual cuando no hay coincidencias
 * - Busca en Firebird vía buscarTerceroPorNombreOCedula
 */
import { useState, useRef, useEffect } from 'react'
import { buscarTerceroPorNombreOCedula, type TerceroFirebird } from '../../services/receptorCatalogoService'

export type { TerceroFirebird }

// ─── Cache local de usuarios manuales (no están en TNS) ─────────────────────
const CACHE_KEY = 'inventario_usuarios_manuales'

interface UsuarioManualCache {
  nombre: string
  cedula: string
  fechaRegistro: string
}

function getCacheUsuarios(): UsuarioManualCache[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
  } catch { return [] }
}

function addToCacheUsuarios(nombre: string, cedula: string): void {
  const cache = getCacheUsuarios()
  if (cache.some(u => u.cedula === cedula)) {
    // Actualizar nombre si ya existe
    const actualizado = cache.map(u => u.cedula === cedula ? { ...u, nombre } : u)
    localStorage.setItem(CACHE_KEY, JSON.stringify(actualizado))
  } else {
    cache.push({ nombre, cedula, fechaRegistro: new Date().toISOString() })
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  }
}

function buscarEnCache(termino: string): TerceroFirebird[] {
  const cache = getCacheUsuarios()
  const t = termino.toLowerCase()
  return cache
    .filter(u => u.nombre.toLowerCase().includes(t) || u.cedula.includes(t))
    .map(u => ({ terid: -1, nombre: u.nombre, cedula: u.cedula }))
}

interface SelectorCoordinadorProps {
  valor: string
  onChange: (cedula: string) => void
  /** Callback que recibe el tercero completo al seleccionar del dropdown */
  onSeleccionar?: (tercero: TerceroFirebird) => void
  placeholder?: string
  /** Si true, permite ingreso manual cuando no hay coincidencias (default: true) */
  permitirManual?: boolean
  /** Si true, hace focus automático al montar */
  autoFocus?: boolean
}

export default function SelectorCoordinador({ valor, onChange, onSeleccionar, placeholder = 'Buscar por cédula o nombre...', permitirManual = true, autoFocus = false }: SelectorCoordinadorProps) {
  const [busqueda, setBusqueda] = useState(valor)
  const [abierto, setAbierto] = useState(false)
  const [resultados, setResultados] = useState<TerceroFirebird[]>([])
  const [buscando, setBuscando] = useState(false)
  const [sinResultados, setSinResultados] = useState(false)
  const [indiceActivo, setIndiceActivo] = useState(-1)
  const [seleccionado, setSeleccionado] = useState<TerceroFirebird | null>(null)
  // Ingreso manual
  const [manualNombre, setManualNombre] = useState('')
  const [manualCedula, setManualCedula] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Autoscroll: cuando se abre el desplegable (resultados o panel manual) hacemos
  // que quede visible dentro de su contenedor scrollable. Evita que se recorte
  // contra el final del panel en pantallas pequeñas.
  useEffect(() => {
    const abiertoDropdown = (abierto && resultados.length > 0) || (sinResultados && permitirManual)
    if (!abiertoDropdown) return
    const t = setTimeout(() => {
      dropdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 60)
    return () => clearTimeout(t)
  }, [abierto, resultados.length, sinResultados, permitirManual])

  // AutoFocus forzado al montar (para modales)
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [autoFocus])

  // Cerrar al click fuera
  useEffect(() => {
    if (!abierto && !sinResultados) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false)
        setSinResultados(false)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [abierto, sinResultados])

  // Sync externo
  useEffect(() => {
    if (!valor && seleccionado) {
      setSeleccionado(null)
      setBusqueda('')
    }
  }, [valor])

  const buscar = (termino: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (termino.trim().length < 3) {
      setResultados([])
      setSinResultados(false)
      setAbierto(false)
      return
    }
    timeoutRef.current = window.setTimeout(async () => {
      setBuscando(true)
      setSinResultados(false)
      try {
        const res = await buscarTerceroPorNombreOCedula(termino.trim())
        // Buscar también en cache local (usuarios manuales)
        const cacheados = buscarEnCache(termino.trim())
        // Combinar: TNS primero, luego los del cache que no estén ya en TNS
        const cedulasTNS = new Set(res.map(t => t.cedula))
        const cacheNoDuplicados = cacheados.filter(c => !cedulasTNS.has(c.cedula))
        const combinados = [...res, ...cacheNoDuplicados]

        if (combinados.length === 0) {
          setResultados([])
          setAbierto(false)
          setSinResultados(true)
        } else if (combinados.length === 1) {
          // Única coincidencia: autoseleccionar directamente (lo pidió el
          // usuario; también permite que la carga masiva por Excel resuelva la
          // persona cuando el nombre/cédula es inequívoco).
          seleccionar(combinados[0])
        } else {
          setResultados(combinados)
          setAbierto(true)
          setIndiceActivo(-1)
        }
      } catch {
        // Si falla TNS, intentar solo con cache
        const cacheados = buscarEnCache(termino.trim())
        if (cacheados.length > 0) {
          setResultados(cacheados)
          setAbierto(true)
          setIndiceActivo(-1)
        } else {
          setResultados([])
          setSinResultados(true)
        }
      }
      setBuscando(false)
    }, 500)
  }

  const seleccionar = (t: TerceroFirebird) => {
    setSeleccionado(t)
    setBusqueda(t.cedula)
    onChange(t.cedula)
    if (onSeleccionar) onSeleccionar(t)
    setAbierto(false)
    setSinResultados(false)
    setResultados([])
    setIndiceActivo(-1)
  }

  const asignarManual = () => {
    if (!manualNombre.trim() || !manualCedula.trim()) return
    const nombre = manualNombre.trim().toUpperCase()
    const cedula = manualCedula.trim()
    // Guardar en cache para reutilizar
    addToCacheUsuarios(nombre, cedula)
    const terceroManual: TerceroFirebird = {
      terid: -1,
      nombre,
      cedula,
    }
    seleccionar(terceroManual)
    setManualNombre('')
    setManualCedula('')
  }

  const limpiar = () => {
    setSeleccionado(null)
    setBusqueda('')
    onChange('')
    setResultados([])
    setSinResultados(false)
    setManualNombre('')
    setManualCedula('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!abierto) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndiceActivo(prev => (prev + 1) % resultados.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndiceActivo(prev => (prev - 1 + resultados.length) % resultados.length)
    } else if (e.key === 'Enter' && indiceActivo >= 0) {
      e.preventDefault()
      seleccionar(resultados[indiceActivo])
    } else if (e.key === 'Escape') {
      setAbierto(false)
      setSinResultados(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }} data-selector="coordinador">
      {/* Input / display */}
      <div
        onClick={() => { if (!seleccionado) { setAbierto(true); setTimeout(() => inputRef.current?.focus(), 50) } }}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem 0.75rem',
          border: '2px solid ' + (abierto ? '#303d50' : '#dee2e6'),
          borderRadius: '8px',
          cursor: 'pointer',
          background: 'white',
          transition: 'border-color 0.2s',
          gap: '0.5rem',
        }}
      >
        {/* Icono persona */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5c6474" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>

        {seleccionado ? (
          <span style={{ flex: 1, fontSize: '0.85rem', color: '#303d50', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {seleccionado.nombre}
          </span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            autoFocus={autoFocus}
            autoComplete="off"
            name="selector-coordinador-search"
            value={busqueda}
            onChange={(e) => {
              const val = e.target.value.slice(0, 30)
              // Detectar tipo: si ya tiene letras, no permitir números y viceversa
              const soloDigitos = /^\d+$/.test(val)
              const soloLetras = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/.test(val)
              const esMezcla = val.length > 0 && !soloDigitos && !soloLetras
              // Bloquear mezcla letras+números
              if (esMezcla) return
              // Si YA había una persona seleccionada y el usuario vuelve a
              // escribir, se está buscando a OTRA: soltar la selección aquí
              // mismo. Esto evita que el efecto de "sync externo" (que reacciona
              // a valor='' mientras seleccionado≠null) borre lo que se escribe.
              if (seleccionado) setSeleccionado(null)
              setBusqueda(val)
              onChange(soloDigitos ? val : '')
              setSinResultados(false)
              buscar(val)
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (resultados.length > 0) setAbierto(true) }}
            placeholder={placeholder}
            maxLength={30}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.85rem', background: 'transparent' }}
          />
        )}

        {/* Botón limpiar o indicador */}
        {seleccionado ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); limpiar() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.2rem', fontSize: '0.9rem', color: '#6c757d', lineHeight: 1 }}
            title="Quitar"
          >
            ×
          </button>
        ) : buscando ? (
          <span style={{ fontSize: '0.7rem', color: '#78909c' }}>...</span>
        ) : null}
      </div>

      {/* Dropdown de resultados */}
      {abierto && resultados.length > 0 && (
        <div ref={dropdownRef} style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 999,
          background: 'white',
          border: '1px solid #dee2e6',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: '220px',
          overflowY: 'auto',
        }}>
          {resultados.map((t, i) => {
            const esActivo = i === indiceActivo
            const esManual = t.terid === -1
            return (
              <button
                key={`${t.cedula}-${i}`}
                onMouseDown={(e) => { e.preventDefault(); seleccionar(t) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  border: 'none',
                  borderBottom: '1px solid #f8f9fa',
                  background: esActivo ? '#e3f2fd' : 'white',
                  cursor: 'pointer',
                  fontSize: '0.83rem',
                  color: '#303d50',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { setIndiceActivo(i); e.currentTarget.style.background = '#f8f9fa' }}
                onMouseLeave={(e) => { if (!esActivo) e.currentTarget.style.background = 'white' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontWeight: 500 }}>{t.nombre}</span>
                  {esManual && <span style={{ fontSize: '0.62rem', background: '#fff3e0', color: '#e65100', padding: '0.1rem 0.3rem', borderRadius: '3px', fontWeight: 600 }}>Manual</span>}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#6c757d' }}>{t.cedula}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Sin resultados + ingreso manual */}
      {sinResultados && permitirManual && (
        <div ref={dropdownRef} style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 999,
          background: 'linear-gradient(135deg, #fffde7 0%, #fff8e1 100%)',
          border: '1px solid #ffe082',
          borderRadius: '10px',
          padding: '1rem',
          boxShadow: '0 8px 24px rgba(255,160,0,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e65100" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e65100' }}>
              No encontrado en TNS
            </span>
          </div>
          <p style={{ margin: '0 0 0.7rem', fontSize: '0.75rem', color: '#5c6474', lineHeight: 1.4 }}>
            Ingrese los datos manualmente. Se guardará para reutilizarlo sin volver a escribirlo.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ position: 'relative' }}>
              <label style={{ position: 'absolute', top: '-8px', left: '10px', background: '#fffde7', padding: '0 4px', fontSize: '0.65rem', color: '#5c6474', fontWeight: 600 }}>Nombre completo</label>
              <input
                type="text"
                value={manualNombre}
                onChange={(e) => setManualNombre(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').slice(0, 50))}
                placeholder="Ej: GARCIA LOPEZ MARIA"
                maxLength={50}
                style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1.5px solid #ffe082', borderRadius: '8px', fontSize: '0.84rem', background: '#fff', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#ffb300' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#ffe082' }}
                onKeyDown={(e) => { if (e.key === 'Enter') asignarManual() }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ position: 'relative', flex: '0 0 140px' }}>
                <label style={{ position: 'absolute', top: '-8px', left: '10px', background: '#fffde7', padding: '0 4px', fontSize: '0.65rem', color: '#5c6474', fontWeight: 600 }}>Cedula</label>
                <input
                  type="text"
                  value={manualCedula}
                  onChange={(e) => setManualCedula(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Ej: 1234567890"
                  maxLength={10}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1.5px solid #ffe082', borderRadius: '8px', fontSize: '0.84rem', background: '#fff', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#ffb300' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#ffe082' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') asignarManual() }}
                />
              </div>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); asignarManual() }}
                disabled={!manualNombre.trim() || !manualCedula.trim()}
                style={{
                  flex: 1,
                  padding: '0.55rem 0.75rem',
                  fontSize: '0.82rem',
                  background: manualNombre.trim() && manualCedula.trim() ? '#2e7d32' : '#bdbdbd',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: manualNombre.trim() && manualCedula.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  transition: 'background 0.2s, transform 0.1s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                }}
                onMouseEnter={(e) => { if (manualNombre.trim() && manualCedula.trim()) e.currentTarget.style.background = '#1b5e20' }}
                onMouseLeave={(e) => { if (manualNombre.trim() && manualCedula.trim()) e.currentTarget.style.background = '#2e7d32' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
                Asignar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
