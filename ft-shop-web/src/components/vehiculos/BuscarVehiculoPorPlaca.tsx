/**
 * Sub-panel de "Buscar vehículo por placa" para el panel de contadores de
 * Vehículos. Es una consulta PUNTUAL (no depende del servicio cargado): el
 * usuario escribe una placa y se muestra toda la información del vehículo más
 * su estado actual (inventariado / asignado a un inventariador / pendiente).
 *
 * Reutiliza las funciones ya existentes del servicio de vehículos:
 * - listarVehiculos({ buscar })         → datos del vehículo
 * - obtenerPlacasInventariadas()         → ¿ya se inventarió?
 * - obtenerVehiculosBloqueados()         → ¿está asignado/bloqueado y por quién?
 * - listarInventariosVehiculos({ placa })→ quién lo inventarió y cuándo
 */
import { useState, useEffect, useRef } from 'react'
import { FaArrowLeft, FaMagnifyingGlass } from 'react-icons/fa6'
import {
  listarVehiculos,
  buscarServiciosVehiculos,
  obtenerPlacasInventariadas,
  obtenerVehiculosBloqueados,
  listarInventariosVehiculos,
  type Vehiculo,
  type ServicioVehiculo,
} from '../../services/vehiculosService'
import { reconstruirTableroVehiculosBogota } from '../../services/vehiculosBogotaService'

type EstadoVehiculo = 'inventariado' | 'enProceso' | 'pendiente'

interface ResultadoBusqueda {
  vehiculo: Vehiculo
  estado: EstadoVehiculo
  bloqueadoPor?: string
  inventariadoPor?: string
  fechaInventario?: string
  /** Inventariador al que se le ASIGNÓ la placa desde "Vehículos Bogotá". */
  asignadoA?: string
}

interface BuscarVehiculoPorPlacaProps {
  onVolver: () => void
}

/** Normaliza una placa para comparar (sin espacios, mayúsculas). */
function normalizarPlaca(p: string): string {
  return (p || '').trim().toUpperCase().replace(/\s+/g, '')
}

export default function BuscarVehiculoPorPlaca({ onVolver }: BuscarVehiculoPorPlacaProps) {
  const [placa, setPlaca] = useState('')
  // Sugerencias en vivo: GRUPOS/SERVICIOS coincidentes + vehículos por placa.
  const [sugServicios, setSugServicios] = useState<ServicioVehiculo[]>([])
  const [sugerencias, setSugerencias] = useState<Vehiculo[]>([])
  const [cargandoSugerencias, setCargandoSugerencias] = useState(false)
  const [dropdownAbierto, setDropdownAbierto] = useState(false)
  // Grupo/servicio seleccionado: se listan sus vehículos para elegir uno.
  const [servicioSel, setServicioSel] = useState<ServicioVehiculo | null>(null)
  const [vehiculosGrupo, setVehiculosGrupo] = useState<Vehiculo[]>([])
  const [cargandoGrupo, setCargandoGrupo] = useState(false)
  // Resultado seleccionado para ver la ficha completa (con estados).
  const [resultado, setResultado] = useState<ResultadoBusqueda | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Para cancelar búsquedas obsoletas (debounce + carrera de requests).
  const peticionRef = useRef(0)
  const contenedorRef = useRef<HTMLDivElement | null>(null)

  // Autocompletado EN VIVO: al escribir, se buscan en paralelo los GRUPOS/
  // SERVICIOS que coinciden y los vehículos por placa, y se muestran en el
  // desplegable (grupos primero, luego placas).
  useEffect(() => {
    const termino = placa.trim()
    if (termino.length < 2) {
      setSugServicios([])
      setSugerencias([])
      setDropdownAbierto(false)
      setCargandoSugerencias(false)
      return
    }
    setCargandoSugerencias(true)
    const idPeticion = ++peticionRef.current
    const t = setTimeout(async () => {
      try {
        const [servs, res] = await Promise.all([
          buscarServiciosVehiculos(termino),
          listarVehiculos({ buscar: termino }),
        ])
        // Ignorar si llegó una respuesta de una búsqueda más reciente.
        if (idPeticion !== peticionRef.current) return
        setSugServicios(servs.slice(0, 20))
        const lista = [...res.vehiculos].sort((a, b) => a.placa.localeCompare(b.placa)).slice(0, 50)
        setSugerencias(lista)
        setDropdownAbierto(true)
      } catch {
        if (idPeticion === peticionRef.current) { setSugServicios([]); setSugerencias([]) }
      } finally {
        if (idPeticion === peticionRef.current) setCargandoSugerencias(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [placa])

  // Cerrar el desplegable al hacer clic fuera.
  useEffect(() => {
    const onClickFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setDropdownAbierto(false)
      }
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  // Al elegir un GRUPO/SERVICIO, se listan sus vehículos para elegir uno.
  const seleccionarServicio = async (serv: ServicioVehiculo) => {
    setDropdownAbierto(false)
    setResultado(null)
    setError(null)
    setServicioSel(serv)
    setVehiculosGrupo([])
    setCargandoGrupo(true)
    try {
      const res = await listarVehiculos({ servicio: serv.codigo })
      const lista = [...res.vehiculos].sort((a, b) => a.placa.localeCompare(b.placa))
      setVehiculosGrupo(lista)
    } catch {
      setError('No se pudieron cargar los vehículos de este grupo. Intente de nuevo.')
    } finally {
      setCargandoGrupo(false)
    }
  }

  // Al elegir un vehículo del desplegable, se cargan sus estados y se muestra la ficha.
  const seleccionarVehiculo = async (vehiculo: Vehiculo) => {
    setDropdownAbierto(false)
    setPlaca(vehiculo.placa)
    setCargandoDetalle(true)
    setError(null)
    setResultado(null)
    try {
      const pNorm = normalizarPlaca(vehiculo.placa)
      const [placasInv, resBloqueados, resInventarios, tableroBogota] = await Promise.all([
        obtenerPlacasInventariadas(),
        obtenerVehiculosBloqueados(),
        listarInventariosVehiculos({ placa: vehiculo.placa }),
        reconstruirTableroVehiculosBogota(),
      ])
      const inventariado = placasInv.some(p => normalizarPlaca(p) === pNorm)
      const bloqueo = resBloqueados.bloqueados.find(b => normalizarPlaca(b.placa) === pNorm)
      const inv = resInventarios.inventarios.find(i => normalizarPlaca(i.placa_vehiculo) === pNorm)
      const asignacion = tableroBogota.find(fila => fila.placas.some(p => normalizarPlaca(p) === pNorm))
      let estado: EstadoVehiculo = 'pendiente'
      if (inventariado) estado = 'inventariado'
      else if (bloqueo) estado = 'enProceso'
      setResultado({
        vehiculo,
        estado,
        bloqueadoPor: bloqueo?.usuario,
        inventariadoPor: inv?.realizado_por_nombre,
        fechaInventario: inv?.fecha_inventario,
        asignadoA: asignacion?.nombreCompleto,
      })
    } catch {
      setError('No se pudo cargar el detalle del vehículo. Intente de nuevo.')
    } finally {
      setCargandoDetalle(false)
    }
  }

  const limpiar = () => {
    setPlaca('')
    setSugServicios([])
    setSugerencias([])
    setDropdownAbierto(false)
    setServicioSel(null)
    setVehiculosGrupo([])
    setResultado(null)
    setError(null)
  }

  // Volver del detalle de un vehículo a la lista del grupo seleccionado.
  const volverAlGrupo = () => {
    setResultado(null)
    setError(null)
  }

  // Tema visual por estado.
  const temaEstado: Record<EstadoVehiculo, { bg: string; fg: string; label: string }> = {
    inventariado: { bg: '#dcfce7', fg: '#15803d', label: 'Inventariado' },
    enProceso: { bg: '#fee2e2', fg: '#dc2626', label: 'En proceso' },
    pendiente: { bg: '#fef3c7', fg: '#b45309', label: 'Pendiente' },
  }

  return (
    <div className="gi-panel-contadores gi-panel-contadores--expandido">
      <div className="gi-panel-contadores__detalle">
        <div className="gi-reg-header">
          <button type="button" className="gi-reg-back" onClick={onVolver}>
            <FaArrowLeft size={13} />
            <span>Volver a contadores</span>
          </button>
        </div>

        <h3 className="gi-panel-contadores__detalle-titulo">Buscar vehículo por placa</h3>

        {/* Buscador */}
        <div className="gi-panel-contadores__filtro">
          <div ref={contenedorRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <FaMagnifyingGlass size={12} style={{ position: 'absolute', left: 10, color: '#94a3b8', pointerEvents: 'none', zIndex: 2 }} />
            <input
              type="text"
              placeholder="Grupo, servicio o placa (ej. GHP, Hombres de Protección, EAQ043)..."
              value={placa}
              onChange={(e) => setPlaca(e.target.value)}
              onFocus={() => { if (sugServicios.length > 0 || sugerencias.length > 0) setDropdownAbierto(true) }}
              className="consulta-lateral__filtro-input"
              style={{ paddingLeft: 30, paddingRight: placa ? 30 : undefined, width: '100%', textTransform: 'uppercase' }}
              autoFocus
            />
            {placa && (
              <button
                type="button"
                onClick={limpiar}
                title="Limpiar"
                aria-label="Limpiar"
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 2,
                  width: 20, height: 20, borderRadius: '50%', border: 'none',
                  background: '#e2e8f0', color: '#475569', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', lineHeight: 1, padding: 0,
                }}
              >
                ✕
              </button>
            )}

            {/* Desplegable de coincidencias EN VIVO */}
            {dropdownAbierto && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(15,23,42,0.14)', maxHeight: 320, overflowY: 'auto',
              }}>
                {cargandoSugerencias && (
                  <div style={{ padding: '10px 12px', fontSize: '0.74rem', color: '#94a3b8' }}>Buscando…</div>
                )}
                {!cargandoSugerencias && sugServicios.length === 0 && sugerencias.length === 0 && (
                  <div style={{ padding: '10px 12px', fontSize: '0.74rem', color: '#94a3b8' }}>Sin coincidencias para "{placa.trim()}".</div>
                )}

                {/* ── Sección: GRUPOS / SERVICIOS ── */}
                {!cargandoSugerencias && sugServicios.length > 0 && (
                  <div style={{ padding: '6px 12px 3px', fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#f8fafc', borderBottom: '1px solid #eef2f6' }}>
                    Grupos / Servicios
                  </div>
                )}
                {!cargandoSugerencias && sugServicios.map((s) => (
                  <button
                    key={`serv-${s.codigo}`}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); void seleccionarServicio(s) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      padding: '8px 11px', border: 'none', borderBottom: '1px solid #f1f5f9',
                      background: '#fff', cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#eff6ff' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
                  >
                    <span style={{ fontSize: '1rem', lineHeight: 1 }}>📁</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.nombre || s.codigo}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.64rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.codigo}
                      </span>
                    </span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                      {s.total} veh.
                    </span>
                  </button>
                ))}

                {/* ── Sección: VEHÍCULOS (por placa) ── */}
                {!cargandoSugerencias && sugerencias.length > 0 && (
                  <div style={{ padding: '6px 12px 3px', fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#f8fafc', borderBottom: '1px solid #eef2f6', borderTop: sugServicios.length > 0 ? '1px solid #e2e8f0' : 'none' }}>
                    Vehículos
                  </div>
                )}
                {!cargandoSugerencias && sugerencias.map((v) => (
                  <button
                    key={v.matid}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); void seleccionarVehiculo(v) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      padding: '8px 11px', border: 'none', borderBottom: '1px solid #f1f5f9',
                      background: '#fff', cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', minWidth: 62 }}>{v.placa}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.descripcion || '—'}
                      </span>
                      {(v.servicio_nombre || v.servicio_codigo) && (
                        <span style={{ display: 'block', fontSize: '0.64rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.servicio_codigo ? `${v.servicio_codigo} · ` : ''}{v.servicio_nombre || ''}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="gi-panel-contadores__detalle-hint" style={{ margin: '6px 0 0', fontSize: '0.68rem' }}>
            Escriba un grupo/servicio (ej. GHP) y elíjalo para ver sus vehículos, o una placa para ir directo.
          </p>
        </div>

        {/* Resultado */}
        <div className="gi-panel-contadores__detalle-body">
          {error && (
            <p className="gi-panel-contadores__detalle-hint" style={{ color: '#dc2626' }}>{error}</p>
          )}

          {cargandoDetalle && (
            <p className="gi-panel-contadores__detalle-hint">Cargando detalle del vehículo…</p>
          )}

          {/* ── Lista de vehículos del GRUPO seleccionado (si no hay ficha abierta) ── */}
          {!resultado && !cargandoDetalle && servicioSel && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12,
                background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #3b82f6 100%)',
                boxShadow: '0 4px 14px rgba(37,99,235,0.32)', marginBottom: 12,
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.18)', fontSize: '1.1rem', lineHeight: 1,
                }}>📁</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                    {servicioSel.nombre || servicioSel.codigo}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#1d4ed8', background: '#fff', borderRadius: 999, padding: '1px 7px', letterSpacing: '0.02em' }}>
                      {servicioSel.codigo}
                    </span>
                    {!cargandoGrupo && (
                      <span style={{ fontSize: '0.64rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                        {vehiculosGrupo.length} vehículo(s)
                      </span>
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => { setServicioSel(null); setVehiculosGrupo([]) }}
                  style={{ border: 'none', background: 'rgba(255,255,255,0.22)', color: '#fff', borderRadius: 8, padding: '5px 11px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.34)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)' }}
                >
                  Cambiar
                </button>
              </div>

              {cargandoGrupo && (
                <p className="gi-panel-contadores__detalle-hint">Cargando vehículos del grupo…</p>
              )}

              {!cargandoGrupo && vehiculosGrupo.length === 0 && (
                <p className="gi-panel-contadores__detalle-hint">Este grupo no tiene vehículos.</p>
              )}

              {!cargandoGrupo && vehiculosGrupo.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {vehiculosGrupo.map((v) => (
                    <button
                      key={v.matid}
                      type="button"
                      onClick={() => void seleccionarVehiculo(v)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                        padding: '9px 12px 9px 10px', border: '1px solid #e2e8f0', borderRadius: 11,
                        background: '#fff', cursor: 'pointer', position: 'relative', overflow: 'hidden',
                        transition: 'border-color .12s, box-shadow .12s, transform .12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.boxShadow = '0 3px 10px rgba(37,99,235,0.14)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
                    >
                      {/* Franja de acento lateral */}
                      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(180deg, #2563eb, #60a5fa)' }} />
                      {/* Placa estilo matrícula (mini) */}
                      <span style={{
                        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', minWidth: 70,
                        borderRadius: 6, overflow: 'hidden', border: '1.5px solid #1a1a1a', background: '#f5c518',
                        marginLeft: 4,
                      }}>
                        <span style={{ width: '100%', background: '#1a1a1a', color: '#f5c518', textAlign: 'center', fontSize: '0.4rem', fontWeight: 800, letterSpacing: '0.2em', padding: '1px 0' }}>
                          COLOMBIA
                        </span>
                        <span style={{ color: '#1a1a1a', fontSize: '0.82rem', fontWeight: 900, letterSpacing: '0.04em', padding: '1px 0 2px', fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
                          {v.placa}
                        </span>
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.descripcion || '—'}
                        </span>
                        {v.responsable_nombre && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: '0.63rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '0.6rem' }}>👤</span>{v.responsable_nombre}
                          </span>
                        )}
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: '50%', background: '#eff6ff', color: '#2563eb',
                        fontSize: '0.8rem', fontWeight: 800, flexShrink: 0,
                      }}>›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {resultado && (() => {
            const { vehiculo, estado, bloqueadoPor, inventariadoPor, fechaInventario, asignadoA } = resultado
            const tema = temaEstado[estado]
            return (
              <div>
              {/* Volver a la lista del grupo (solo si venimos de un grupo) */}
              {servicioSel && (
                <button
                  type="button"
                  onClick={volverAlGrupo}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8,
                    border: 'none', background: 'transparent', color: '#1d4ed8',
                    fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', padding: 0,
                  }}
                >
                  <FaArrowLeft size={11} /> Volver a {servicioSel.nombre || servicioSel.codigo}
                </button>
              )}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

                {/* ── Placa vehicular estilo matrícula colombiana ── */}
                <div style={{ padding: '0.85rem 0.9rem 0.6rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'linear-gradient(180deg, #f8fafc 0%, #fff 100%)', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{
                    width: '100%', maxWidth: 220, borderRadius: 8, overflow: 'hidden',
                    border: '2.5px solid #1a1a1a', background: '#f5c518',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                  }}>
                    {/* Franja superior "COLOMBIA" */}
                    <div style={{ background: '#1a1a1a', color: '#f5c518', textAlign: 'center', fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.28em', padding: '2px 0' }}>
                      COLOMBIA
                    </div>
                    {/* Número de placa */}
                    <div style={{ textAlign: 'center', color: '#1a1a1a', fontSize: '1.65rem', fontWeight: 900, letterSpacing: '0.06em', padding: '4px 0 6px', fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
                      {vehiculo.placa}
                    </div>
                  </div>
                  {/* Badge de estado */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 11px', borderRadius: 999, background: tema.bg, color: tema.fg, fontSize: '0.68rem', fontWeight: 700 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: tema.fg }} />
                    {tema.label}
                  </span>
                </div>

                {/* ── Datos del vehículo (secciones ordenadas) ── */}
                <div style={{ padding: '0.35rem 0.95rem 0.5rem' }}>
                  <SeccionDatos
                    titulo="Vehículo"
                    filas={[
                      ['Descripción', vehiculo.descripcion],
                      ['Serial', vehiculo.serial],
                    ]}
                  />
                  <SeccionDatos
                    titulo="Ubicación y servicio"
                    filas={[
                      ['Servicio', [vehiculo.servicio_codigo, vehiculo.servicio_nombre].filter(Boolean).join(' · ')],
                      ['Dependencia', vehiculo.dependencia],
                      ['Ubicación', vehiculo.ubicacion],
                    ]}
                  />
                  <SeccionDatos
                    titulo="Responsable"
                    filas={[
                      ['Nombre', vehiculo.responsable_nombre],
                      ['Cédula', vehiculo.responsable_cedula],
                    ]}
                  />
                </div>

                {/* ── Estado del inventario (DESTACADO: es lo más importante) ── */}
                <div style={{ padding: '0.25rem 0.9rem 0.9rem', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {/* Banner GRANDE del estado de inventario */}
                  {(() => {
                    const banner = estado === 'inventariado'
                      ? { bg: '#f0fdf4', border: '#86efac', fg: '#15803d', icono: '✓', titulo: 'Inventariado', detalle: `${inventariadoPor ? inventariadoPor : 'Registrado'}${fechaInventario ? ` · ${new Date(fechaInventario).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ''}` }
                      : estado === 'enProceso'
                        ? { bg: '#fef2f2', border: '#fca5a5', fg: '#dc2626', icono: '⏳', titulo: 'En proceso', detalle: bloqueadoPor ? `Siendo inventariado por ${bloqueadoPor}` : 'Siendo inventariado' }
                        : { bg: '#fffbeb', border: '#fcd34d', fg: '#b45309', icono: '⚠', titulo: 'Pendiente por inventariar', detalle: 'Este vehículo aún no se ha inventariado' }
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.85rem 1rem', borderRadius: 12, background: banner.bg, border: `2px solid ${banner.border}` }}>
                        <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{banner.icono}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '0.95rem', fontWeight: 800, color: banner.fg, lineHeight: 1.2 }}>{banner.titulo}</span>
                          <span style={{ display: 'block', fontSize: '0.72rem', color: banner.fg, opacity: 0.85, marginTop: 2 }}>{banner.detalle}</span>
                        </span>
                      </div>
                    )
                  })()}

                  {/* Banner GRANDE de asignación (Vehículos Bogotá) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.85rem 1rem', borderRadius: 12, background: asignadoA ? '#eff6ff' : '#f8fafc', border: `2px solid ${asignadoA ? '#93c5fd' : '#e2e8f0'}` }}>
                    <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>👤</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.62rem', fontWeight: 700, color: asignadoA ? '#1d4ed8' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Asignado a
                      </span>
                      <span style={{ display: 'block', fontSize: asignadoA ? '0.92rem' : '0.8rem', fontWeight: asignadoA ? 800 : 600, color: asignadoA ? '#1e293b' : '#94a3b8', lineHeight: 1.25, marginTop: 1, wordBreak: 'break-word' }}>
                        {asignadoA || 'Sin asignar a un inventariador'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

/**
 * Sección de datos: encabezado + filas etiqueta/valor en un bloque con fondo
 * suave y bordes redondeados. Agrupa visualmente la información relacionada.
 */
function SeccionDatos({ titulo, filas }: { titulo: string; filas: [string, string | undefined][] }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase',
        letterSpacing: '0.1em', marginBottom: 5,
      }}>
        {titulo}
      </div>
      <div style={{ background: '#f8fafc', border: '1px solid #eef2f6', borderRadius: 8, padding: '2px 10px' }}>
        {filas.map(([etiqueta, valor], i) => (
          <FilaDato key={etiqueta} etiqueta={etiqueta} valor={valor} ultima={i === filas.length - 1} />
        ))}
      </div>
    </div>
  )
}

/**
 * Fila etiqueta/valor en grilla de 2 columnas alineadas. La etiqueta tiene ancho
 * fijo y el valor ocupa el resto, envolviendo texto largo (sin desbordarse).
 */
function FilaDato({ etiqueta, valor, ultima }: { etiqueta: string; valor?: string; ultima?: boolean }) {
  const tieneValor = (valor || '').trim().length > 0
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '84px 1fr', gap: 10, alignItems: 'start',
      padding: '6px 0', borderBottom: ultima ? 'none' : '1px solid #eef2f6',
    }}>
      <span style={{ fontSize: '0.64rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.55 }}>
        {etiqueta}
      </span>
      <span style={{
        fontSize: '0.76rem', color: tieneValor ? '#1e293b' : '#cbd5e1',
        fontWeight: tieneValor ? 600 : 500, lineHeight: 1.4,
        wordBreak: 'break-word', overflowWrap: 'anywhere',
      }}>
        {tieneValor ? valor : 'No disponible'}
      </span>
    </div>
  )
}

