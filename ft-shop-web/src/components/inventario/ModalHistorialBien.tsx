/**
 * Modal compartido para ver el historial de movimientos de un bien.
 * Se abre al hacer click en la placa en la tabla de inventario.
 * Consulta el endpoint /almacen/admin/historial-bien/ (Firebird).
 */
import { useState, useEffect } from 'react'

interface Movimiento {
  anio: number
  mes: number
  responsable: string
  cedula: string
  cod_servicio: string
  dependencia: string
  cod_grupo_contable: string
  grupo_contable: string
}

interface ModalHistorialBienProps {
  isOpen: boolean
  placa: string
  descripcion?: string
  serial?: string
  onClose: () => void
}

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

interface Periodo {
  responsable: string
  cedula: string
  dependencia: string
  cod_servicio: string
  desde: { anio: number; mes: number }
  hasta: { anio: number; mes: number }
}

function consolidarHistorial(historial: Movimiento[]): Periodo[] {
  if (historial.length === 0) return []
  const periodos: Periodo[] = []
  let actual: Periodo | null = null
  const ordenado = [...historial].reverse()
  for (const m of ordenado) {
    const mismo = actual && actual.cedula === m.cedula && actual.cod_servicio === m.cod_servicio
    if (mismo) {
      actual!.hasta = { anio: m.anio, mes: m.mes }
    } else {
      actual = {
        responsable: m.responsable,
        cedula: m.cedula,
        dependencia: m.dependencia,
        cod_servicio: m.cod_servicio,
        desde: { anio: m.anio, mes: m.mes },
        hasta: { anio: m.anio, mes: m.mes },
      }
      periodos.push(actual)
    }
  }
  return periodos.reverse()
}

function formatPeriodo(desde: { anio: number; mes: number }, hasta: { anio: number; mes: number }) {
  if (desde.anio === 0 && hasta.anio === 0) return 'Fecha no disponible'
  if (desde.anio === 0) return `? → ${MESES_CORTO[(hasta.mes || 1) - 1]} ${hasta.anio}`
  if (hasta.anio === 0) return `${MESES_CORTO[(desde.mes || 1) - 1]} ${desde.anio}`
  const d = `${MESES_CORTO[(desde.mes || 1) - 1]} ${desde.anio}`
  const h = `${MESES_CORTO[(hasta.mes || 1) - 1]} ${hasta.anio}`
  if (d === h) return d
  return `${d}  →  ${h}`
}

function mesesEntre(desde: { anio: number; mes: number }, hasta: { anio: number; mes: number }) {
  if (desde.anio === 0 || hasta.anio === 0) return 0
  return (hasta.anio - desde.anio) * 12 + (hasta.mes - desde.mes) + 1
}

// Colores rotativos para las tarjetas
const COLORES = [
  { bg: '#e3f2fd', border: '#90caf9', accent: '#1565c0' },
  { bg: '#e8f5e9', border: '#a5d6a7', accent: '#2e7d32' },
  { bg: '#fff3e0', border: '#ffcc02', accent: '#e65100' },
  { bg: '#f3e5f5', border: '#ce93d8', accent: '#7b1fa2' },
  { bg: '#e0f7fa', border: '#80deea', accent: '#00695c' },
]

export default function ModalHistorialBien({ isOpen, placa, descripcion, serial, onClose }: ModalHistorialBienProps) {
  const [historial, setHistorial] = useState<Movimiento[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !placa) return
    setCargando(true)
    setError('')
    setHistorial([])

    const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
    const esFloresta = placa.toUpperCase().startsWith('F')

    if (esFloresta) {
      // Bienes Floresta: consultar historial desde PostgreSQL (transferencias reales)
      fetch(`${API_URL}/almacen/floresta/buscar-placa/?placa=${encodeURIComponent(placa)}`)
        .then(res => res.ok ? res.json() : Promise.reject('Error'))
        .then(json => {
          if (json.error) { setError(json.error); return }
          const data = json.data
          if (!data) { setError('No se encontró el bien'); return }
          // Convertir historial de Floresta al formato Movimiento[]
          // Cada movimiento representa a QUIÉN se le asignó el bien (destino)
          // ordenado de más reciente a más antiguo
          const movimientos: Movimiento[] = []
          const hist: any[] = data.historial ?? []

          // Responsable actual (el más reciente)
          if (data.responsable_nombre) {
            // Fecha: usar fecha_ultimo_movimiento o la fecha del movimiento más reciente
            const fechaActual = data.fecha_ultimo_movimiento
              ? new Date(data.fecha_ultimo_movimiento)
              : (hist.length > 0 && hist[0].fecha && hist[0].fecha !== '1900-01-01' ? new Date(hist[0].fecha) : new Date())
            movimientos.push({
              anio: fechaActual.getFullYear(),
              mes: fechaActual.getMonth() + 1,
              responsable: data.responsable_nombre,
              cedula: data.responsable_cedula || '',
              cod_servicio: '',
              dependencia: '',
              cod_grupo_contable: '',
              grupo_contable: '',
            })
          }

          // Historial: cada movimiento muestra el ORIGEN (quien tenía el bien antes)
          // Solo agregar si el origen es diferente al responsable actual
          for (const m of hist) {
            // Saltar si no hay origen o si el origen es el mismo responsable actual
            if (!m.origen_nombre) continue
            if (m.origen_nombre === data.responsable_nombre && m.origen_cedula === data.responsable_cedula) continue

            // Usar fecha real del movimiento; si es 1900-01-01, no mostrar (es dato de migración)
            const fechaStr = m.fecha || ''
            const esFechaPlaceholder = !fechaStr || fechaStr === '1900-01-01'
            let anio: number, mes: number
            if (esFechaPlaceholder) {
              // Para movimientos migrados sin fecha real, usar 0 como indicador
              anio = 0
              mes = 0
            } else {
              const fecha = new Date(fechaStr)
              anio = fecha.getFullYear()
              mes = fecha.getMonth() + 1
            }

            movimientos.push({
              anio,
              mes,
              responsable: m.origen_nombre,
              cedula: m.origen_cedula || '',
              cod_servicio: '',
              dependencia: m.tipo_movimiento || '',
              cod_grupo_contable: '',
              grupo_contable: m.fuente || '',
            })
          }
          setHistorial(movimientos)
        })
        .catch(() => setError('No se pudo consultar el historial'))
        .finally(() => setCargando(false))
    } else {
      // Bienes UNP: consultar historial desde Firebird (SALAJUSTES)
      fetch(`${API_URL}/almacen/admin/historial-bien/?placa=${encodeURIComponent(placa)}`)
        .then(res => res.ok ? res.json() : Promise.reject('Error'))
        .then(json => {
          if (json.error) { setError(json.error); return }
          setHistorial(json.data ?? [])
        })
        .catch(() => setError('No se pudo consultar el historial'))
        .finally(() => setCargando(false))
    }
  }, [isOpen, placa])

  if (!isOpen) return null

  const periodos = consolidarHistorial(historial)

  return (
    <div className="inventario-fisico__modal-overlay">
      <div className="inventario-fisico__modal" style={{ maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="inventario-fisico__modal-header">
          <h5>Historial de Movimientos</h5>
          <button className="inventario-fisico__modal-close" onClick={onClose}>×</button>
        </div>

        {/* Info del bien */}
        <div style={{ padding: '1rem 1.5rem', background: '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#303d50' }}>{placa}</span>
                {serial && serial !== 'N/A' && (
                  <span style={{ fontSize: '0.75rem', fontFamily: 'ui-monospace, monospace', color: '#5c6474', background: '#e9ecef', padding: '0.15rem 0.4rem', borderRadius: '3px' }}>
                    S/N: {serial}
                  </span>
                )}
              </div>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#6c757d' }}>{descripcion || 'Sin descripción'}</p>
            </div>
            <div style={{ textAlign: 'center', background: '#303d50', color: 'white', borderRadius: '8px', padding: '0.4rem 0.75rem', minWidth: '50px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1 }}>{periodos.length}</div>
              <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', opacity: 0.8 }}>cambios</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem' }}>
          {cargando && (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>Consultando historial...</p>
          )}
          {error && (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#d13c47' }}>{error}</p>
          )}
          {!cargando && !error && periodos.length === 0 && (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No se encontraron movimientos.</p>
          )}
          {!cargando && periodos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {periodos.map((p, i) => {
                const color = COLORES[i % COLORES.length]
                const meses = mesesEntre(p.desde, p.hasta)
                const esActual = i === 0
                return (
                  <div
                    key={i}
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      border: `1.5px solid ${esActual ? color.accent : color.border}`,
                      background: color.bg,
                      position: 'relative',
                      transition: 'transform 0.15s',
                    }}
                  >
                    {/* Badge "Actual" */}
                    {esActual && (
                      <span style={{ position: 'absolute', top: '-8px', right: '12px', background: color.accent, color: 'white', fontSize: '0.6rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Actual
                      </span>
                    )}

                    {/* Fila superior: período + duración */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: color.accent }}>
                        {formatPeriodo(p.desde, p.hasta)}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#6c757d', fontWeight: 500 }}>
                        {meses === 0 ? '—' : meses === 1 ? '1 mes' : `${meses} meses`}
                      </span>
                    </div>

                    {/* Contenido */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {/* Avatar */}
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: color.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.8rem', color: 'white', fontWeight: 700 }}>
                        {(p.responsable || '?')[0]}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#303d50', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.responsable || 'Sin responsable'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#5c6474' }}>
                          CC {p.cedula || '—'}
                        </div>
                      </div>
                      {/* Servicio */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#303d50', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.dependencia || '—'}
                        </div>
                        {p.cod_servicio && (
                          <div style={{ fontSize: '0.65rem', color: '#6c757d' }}>{p.cod_servicio}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="inventario-fisico__modal-footer">
          <button
            className="floresta-busqueda__btn"
            style={{ background: 'transparent', border: '2px solid #303d50', color: '#303d50' }}
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
