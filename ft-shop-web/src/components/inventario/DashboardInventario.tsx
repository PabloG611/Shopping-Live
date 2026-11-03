/**
 * Dashboard visual de progreso del inventario físico.
 * Muestra resumen general con cards interactivas, avance por servicio
 * expandible con detalle de bienes pendientes (carga paginada).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FaClipboardCheck, FaChevronRight } from 'react-icons/fa'
import { Animacion } from 'react-ecosistema-unp/ui'
import PanelResumen, { type NivelResumen } from './dashboard/PanelResumen'
import {
  type Servicio,
  type BienPendiente,
  getServiciosHabilitados,
  cargarBienesInventariadosAnio,
  cargarServicioReal,
  cargarSesionesActivas,
  limpiarCacheServiciosReal,
  type ServicioActivoUsuarios,
} from '../../services/controlSeguimientoService'
import { useTransferenciasWebSocket } from '../../hooks/useTransferenciasWebSocket'
import { obtenerResumenVehiculosDashboard, obtenerDetalleVehiculosDashboard, type ResumenVehiculosDashboard, type VehiculoDashboardDetalle } from '../../services/vehiculosService'
import { idbGet, idbSet } from '../../services/idbCache'
import './DashboardInventario.css'

// ─── Snapshot persistente del dashboard (IndexedDB) ──────────────────────────
// Guarda el ÚLTIMO estado calculado para pintarlo al instante al volver de otro
// módulo o al refrescar la página, sin re-consultar TNS (lento). Se revalida
// por detrás solo si el snapshot está vencido o si llega un evento WS.
const DASH_SNAPSHOT_KEY = 'dashboard_inventario_snapshot'
// Mientras el snapshot sea más reciente que esto, NO se re-consulta TNS al
// montar (se confía en el WS para refrescar ante cambios reales).
const DASH_SNAPSHOT_FRESCO_MS = 10 * 60 * 1000 // 10 min
// Edad máxima para siquiera pintar el snapshot (más viejo = ignorar).
const DASH_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000 // 24 h

interface DashSnapshot {
  servicios: Servicio[]
  placas: string[]
  totalInventariados: number
  detalleServicio: [string, string[]][]
  pendientes: [string, { bienes: BienPendiente[]; total: number }][]
  resumenVehiculos: ResumenVehiculosDashboard
}

interface ServicioConAvance extends Servicio {
  inventariados: number
  porcentaje: number
  pendientes: number
  /** Bienes inventariados que NO pertenecen al universo del servicio (sobrantes
   * / "fuera de lista"): inventariados − total, cuando es positivo. */
  fueraDeLista: number
}

/** Estado de carga paginada para un servicio */
interface EstadoPendientes {
  bienes: BienPendiente[]
  total: number
  offset: number
  hayMas: boolean
  cargando: boolean
}

export default function DashboardInventario({ onAbrirPanel }: { onAbrirPanel?: () => void }) {
  const [servicios, setServicios] = useState<Servicio[]>([])
  // Se inicializa con el cache local (rápido) y se refresca desde BD al montar.
  const [serviciosHabilitados, setServiciosHabilitados] = useState<string[]>(getServiciosHabilitados())
  const [cargando, setCargando] = useState(true)
  const [cargandoServicios, setCargandoServicios] = useState(true)
  const [detalleServicio, setDetalleServicio] = useState<Map<string, Set<string>>>(new Map())
  const [ordenamiento, setOrdenamiento] = useState<'pendientes' | 'avance' | 'nombre'>('pendientes')
  // Filtro por tipo de sede: todos / bogota / regional.
  // Regional = el nombre del servicio empieza por "ENLACE" o "GURP".
  const [filtroSede, setFiltroSede] = useState<'todos' | 'bogota' | 'regional'>('todos')

  // Presencia en vivo: qué usuarios están inventariando ahora en cada servicio.
  // Mapa codigo_servicio → info. Se refresca periódicamente (cada 15s).
  const [sesionesActivas, setSesionesActivas] = useState<Map<string, ServicioActivoUsuarios>>(new Map())
  // Filtro: mostrar solo servicios con alguien trabajando ahora.
  const [soloConActividad, setSoloConActividad] = useState(false)

  // Nivel activo del panel lateral unificado.
  // 'home' = las 4 cards; el resto = un detalle dentro del mismo panel.
  const [nivelPanel, setNivelPanel] = useState<NivelResumen>('home')

  // Servicio abierto en el panel lateral (detalle de pendientes). null = ninguno.
  const [servicioAbierto, setServicioAbierto] = useState<string | null>(null)
  const [pendientesPorServicio, setPendientesPorServicio] = useState<Map<string, EstadoPendientes>>(new Map())
  const [filtroBusqueda, setFiltroBusqueda] = useState<Map<string, string>>(new Map())

  // Placas inventariadas global (para filtrar pendientes)
  const [placasGlobal, setPlacasGlobal] = useState<Set<string>>(new Set())

  // Totales globales calculados por el backend (no dependen de servicios visibles).
  // total inventariados del año lo da el backend directamente.
  const [totalInventariadosBackend, setTotalInventariadosBackend] = useState(0)

  // Resumen de vehículos inventariados
  const [resumenVehiculos, setResumenVehiculos] = useState<ResumenVehiculosDashboard>({ total_vehiculos: 0, inventariados: 0, pendientes: 0, porcentaje: 0 })
  const [vehiculosDetalle, setVehiculosDetalle] = useState<VehiculoDashboardDetalle[] | null>(null)
  const [vehiculosGrupos, setVehiculosGrupos] = useState<Record<string, number>>({})
  const [cargandoVehiculos, setCargandoVehiculos] = useState(false)
  const [filtroBusquedaVehiculos, setFiltroBusquedaVehiculos] = useState('')
  const [gruposSeleccionados, setGruposSeleccionados] = useState<Set<string>>(new Set())
  const [dropdownGruposAbierto, setDropdownGruposAbierto] = useState(false)

  // Carga completa desde TNS (la operación lenta). Al terminar guarda el
  // snapshot en IndexedDB para que la próxima visita sea instantánea.
  const cargarTodo = useCallback(async () => {
    // 1. Placas inventariadas del año (misma fuente que Reportes) + vehículos.
    const [{ bienes, placas }, vehiculos] = await Promise.all([
      cargarBienesInventariadosAnio(),
      obtenerResumenVehiculosDashboard(),
    ])
    setPlacasGlobal(placas)
    setResumenVehiculos(vehiculos)
    setTotalInventariadosBackend(placas.size)

    // Servicios presentes en los inventarios registrados (Reportes).
    const porServicio = new Map<string, Set<string>>()
    const nombrePorServicio = new Map<string, string>()
    for (const bien of bienes) {
      const svc = (bien.sesion_servicio || '').trim()
      if (!svc) continue
      if (!porServicio.has(svc)) porServicio.set(svc, new Set())
      porServicio.get(svc)!.add(bien.placa)
      if (!nombrePorServicio.has(svc) && bien.sesion_nombre) {
        nombrePorServicio.set(svc, bien.sesion_nombre)
      }
    }
    setDetalleServicio(new Map(porServicio))

    const codigosConInventario = [...porServicio.keys()]
    setServiciosHabilitados(codigosConInventario)

    const listaServicios = codigosConInventario.map(codigo => ({
      codigo,
      nombre: nombrePorServicio.get(codigo) || codigo,
      cantidad: 0,
      es_bodega: false,
    }))
    setServicios(listaServicios)
    setCargando(false)

    if (listaServicios.length === 0) { setCargandoServicios(false); return }

    // 2. Data REAL (TNS) por servicio, progresiva y con concurrencia.
    setCargandoServicios(true)
    const pendientesAcum = new Map<string, EstadoPendientes>()
    const serviciosAcum = new Map<string, Servicio>(listaServicios.map(s => [s.codigo, s]))
    try {
      const CONCURRENCIA = 3
      for (let i = 0; i < listaServicios.length; i += CONCURRENCIA) {
        const chunk = listaServicios.slice(i, i + CONCURRENCIA)
        const resultados = await Promise.allSettled(
          chunk.map(s => cargarServicioReal(s.codigo, placas)),
        )
        for (const r of resultados) {
          if (r.status !== 'fulfilled') continue
          const { codigo, nombre, total, pendientes } = r.value
          serviciosAcum.set(codigo, { ...(serviciosAcum.get(codigo) as Servicio), cantidad: total, nombre })
          setServicios(prev => prev.map(s => s.codigo === codigo ? { ...s, cantidad: total, nombre } : s))
          const estado: EstadoPendientes = { bienes: pendientes, total, offset: pendientes.length, hayMas: false, cargando: false }
          pendientesAcum.set(codigo, estado)
          setPendientesPorServicio(prev => {
            const nuevo = new Map(prev)
            nuevo.set(codigo, estado)
            return nuevo
          })
        }
      }
    } finally {
      setCargandoServicios(false)
    }

    // 3. Persistir snapshot para la próxima vez (instantáneo al volver).
    const snapshot: DashSnapshot = {
      servicios: [...serviciosAcum.values()],
      placas: [...placas],
      totalInventariados: placas.size,
      detalleServicio: [...porServicio.entries()].map(([k, set]) => [k, [...set]]),
      pendientes: [...pendientesAcum.entries()].map(([k, e]) => [k, { bienes: e.bienes, total: e.total }]),
      resumenVehiculos: vehiculos,
    }
    void idbSet<DashSnapshot>(DASH_SNAPSHOT_KEY, snapshot)
  }, [])

  // Montaje: pintar snapshot al instante (si existe) y decidir si revalidar.
  useEffect(() => {
    let cancelado = false
    const iniciar = async () => {
      // Para pintar: aceptamos snapshot de hasta 24 h.
      const snap = await idbGet<DashSnapshot>(DASH_SNAPSHOT_KEY, DASH_SNAPSHOT_TTL_MS)
      // Para decidir si revalidar: ¿es reciente (< 10 min)? Si idbGet con el TTL
      // fresco devuelve algo, el snapshot está dentro de ese umbral.
      const frescoReciente = (await idbGet<DashSnapshot>(DASH_SNAPSHOT_KEY, DASH_SNAPSHOT_FRESCO_MS)) !== null
      if (snap && !cancelado) {
        // Pintar al instante lo último conocido.
        const placasSet = new Set(snap.placas)
        setServicios(snap.servicios)
        setServiciosHabilitados(snap.servicios.map(s => s.codigo))
        setPlacasGlobal(placasSet)
        setTotalInventariadosBackend(snap.totalInventariados)
        setDetalleServicio(new Map(snap.detalleServicio.map(([k, arr]) => [k, new Set(arr)])))
        setPendientesPorServicio(new Map(snap.pendientes.map(([k, e]) => [k, { bienes: e.bienes, total: e.total, offset: e.bienes.length, hayMas: false, cargando: false }])))
        setResumenVehiculos(snap.resumenVehiculos)
        setCargando(false)
        setCargandoServicios(false)
      }

      // ¿Hay que revalidar contra TNS? Solo si no hay snapshot fresco.
      if (!snap) {
        // Sin snapshot: carga completa con spinner.
        setCargando(true)
        if (!cancelado) await cargarTodo()
      } else if (!frescoReciente) {
        // Hay snapshot pero vencido: revalidar por detrás (sin spinner).
        if (!cancelado) await cargarTodo()
      }
      // Si hay snapshot fresco: no re-consultar TNS; el WS refrescará si cambia.
    }
    void iniciar()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── WebSocket: actualización en tiempo real ─────────────────────────────
  const ultimaActualizacionRef = useRef(0)

  // Recarga disparada por WS (hubo un cambio real). Para no re-golpear TNS por
  // cada evento, invalidamos la caché por-servicio y hacemos una carga completa
  // que recalcula todo y actualiza el snapshot. Debounce de 1s para ráfagas.
  const recargarDatos = useCallback(async () => {
    const ahora = Date.now()
    if (ahora - ultimaActualizacionRef.current < 1000) return
    ultimaActualizacionRef.current = ahora
    // Forzar datos frescos de TNS: limpiar la caché por-servicio antes.
    limpiarCacheServiciosReal()
    await cargarTodo()
  }, [cargarTodo])

  useTransferenciasWebSocket({
    // Cuando se agrega un bien al inventario (notificación del backend)
    onBienInventarioAgregado: (placa: string, _cedula: string, extra?: any) => {
      if (placa) {
        // Si es vehículo, actualizar la card de vehículos
        if (extra?.tipo === 'vehiculo') {
          setResumenVehiculos(prev => ({
            ...prev,
            inventariados: prev.inventariados + 1,
            pendientes: Math.max(0, prev.pendientes - 1),
            porcentaje: prev.total_vehiculos > 0 ? Math.round(((prev.inventariados + 1) / prev.total_vehiculos) * 100) : 0,
          }))
          return
        }

        // Bienes: agregar la placa al detalle de servicio
        setDetalleServicio(prev => {
          const nuevo = new Map(prev)
          for (const [codigo, estado] of pendientesPorServicio.entries()) {
            if (estado.bienes.some(b => b.placa === placa)) {
              const set = nuevo.get(codigo) ?? new Set()
              set.add(placa)
              nuevo.set(codigo, set)
              break
            }
          }
          if (![...nuevo.values()].some(s => s.has(placa))) {
            for (const codigo of serviciosHabilitados) {
              const set = nuevo.get(codigo) ?? new Set()
              set.add(placa)
              nuevo.set(codigo, set)
              break
            }
          }
          return nuevo
        })
        setPlacasGlobal(prev => new Set([...prev, placa]))
      }
    },
    // Cuando se remueve un bien
    onBienInventarioRemovido: (placa: string) => {
      if (placa) {
        setDetalleServicio(prev => {
          const nuevo = new Map(prev)
          for (const [codigo, set] of nuevo.entries()) {
            if (set.has(placa)) {
              set.delete(placa)
              nuevo.set(codigo, set)
              break
            }
          }
          return nuevo
        })
        setPlacasGlobal(prev => {
          const n = new Set(prev)
          n.delete(placa)
          return n
        })
      }
    },
    // Cuando se completa un inventario (recarga completa)
    onInventarioCompletado: () => {
      void recargarDatos()
    },
    // Cuando se guardan cambios de configuración de servicios
    onConfiguracionServiciosActualizada: () => {
      void recargarDatos()
    },
    // Cuando se registra/guarda un reporte de inventario completo (código 2110).
    // Refresca el dashboard en tiempo real.
    onInventarioRegistrado: () => {
      void recargarDatos()
    },
  })

  // ─── Presencia en vivo: quién trabaja en qué servicio (refresco cada 15s) ──
  useEffect(() => {
    let cancelado = false
    const cargar = async () => {
      const mapa = await cargarSesionesActivas()
      if (!cancelado) setSesionesActivas(mapa)
    }
    void cargar()
    const intervalo = window.setInterval(() => { void cargar() }, 15_000)
    return () => { cancelado = true; window.clearInterval(intervalo) }
  }, [])

  // Calcular avance por servicio
  const serviciosConAvance: ServicioConAvance[] = useMemo(() => {
    return servicios
      // Mostrar servicios con bienes (cantidad) O con inventariados registrados,
      // para que un servicio ya inventariado aparezca aunque su total TNS aún cargue.
      .filter(s => s.cantidad > 0 || (detalleServicio.get(s.codigo)?.size ?? 0) > 0)
      .map(s => {
        const inventariados = detalleServicio.get(s.codigo)?.size ?? 0
        const porcentaje = s.cantidad > 0 ? Math.min(100, Math.round((inventariados / s.cantidad) * 100)) : 0
        // "Fuera de lista": se inventariaron más bienes que el universo del
        // servicio → esos excedentes no pertenecen a la lista del servicio.
        const fueraDeLista = Math.max(0, inventariados - s.cantidad)
        return { ...s, inventariados, porcentaje, pendientes: Math.max(0, s.cantidad - inventariados), fueraDeLista }
      })
  }, [servicios, detalleServicio])

  // Regional = el nombre del servicio empieza por "ENLACE" o "GURP" (no se usa
  // el código 3000- porque ahí no solo hay regionales). El resto es Bogotá.
  const esRegional = useCallback((nombre: string) => {
    const n = (nombre || '').trim().toUpperCase()
    return n.startsWith('ENLACE') || n.startsWith('GURP')
  }, [])

  // Filtrar por sede y ordenar según criterio
  const serviciosOrdenados = useMemo(() => {
    let copia = [...serviciosConAvance]
    if (filtroSede === 'regional') copia = copia.filter(s => esRegional(s.nombre))
    else if (filtroSede === 'bogota') copia = copia.filter(s => !esRegional(s.nombre))
    // Filtro "solo con actividad": servicios donde hay alguien inventariando ahora.
    if (soloConActividad) {
      copia = copia.filter(s => (sesionesActivas.get(s.codigo)?.usuarios.length ?? 0) > 0)
    }
    if (ordenamiento === 'pendientes') return copia.sort((a, b) => b.pendientes - a.pendientes)
    if (ordenamiento === 'avance') return copia.sort((a, b) => a.porcentaje - b.porcentaje)
    return copia.sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [serviciosConAvance, ordenamiento, filtroSede, esRegional, soloConActividad, sesionesActivas])

  // Servicios que están EN VIVO y además tienen una card en el dashboard.
  // El contador del botón "En vivo" debe reflejar esto (no todas las sesiones
  // activas), porque puede haber sesiones activas de servicios que aún NO tienen
  // card (sin bienes guardados): antes el badge decía "1" y al filtrar no salía
  // nada. Ahora el número coincide con lo que el filtro realmente muestra.
  const serviciosEnVivo = useMemo(() => {
    return serviciosConAvance.filter(
      s => (sesionesActivas.get(s.codigo)?.usuarios.length ?? 0) > 0,
    )
  }, [serviciosConAvance, sesionesActivas])

  // Totales
  const totalBienes = serviciosConAvance.reduce((sum, s) => sum + s.cantidad, 0)
  // El total de inventariados lo da el backend (cuenta TODAS las placas del año,
  // sin depender de que su servicio esté visible/habilitado). Fallback: suma por servicio.
  const inventariadosPorServicio = serviciosConAvance.reduce((sum, s) => sum + s.inventariados, 0)
  const totalInventariados = totalInventariadosBackend || inventariadosPorServicio
  const totalPendientes = Math.max(0, totalBienes - totalInventariados)
  const porcentajeGlobal = totalBienes > 0 ? Math.min(100, Math.round((totalInventariados / totalBienes) * 100)) : 0



  // Cargar los pendientes de un servicio para el drawer.
  // IMPORTANTE: usa `cargarServicioReal` (la MISMA fuente que la card), que
  // aplica las exclusiones (bienExcluido: armamento/vehículos/PED) y calcula el
  // total NETO. Antes el drawer usaba `cargarBienesPendientesServicioPaginado`
  // (sin exclusiones, total bruto), por eso los números del drawer NO coincidían
  // con la card. Ahora ambos salen del mismo cálculo → coinciden exactamente.
  const cargarPrimeraPagina = useCallback(async (codigo: string) => {
    // Si ya está pre-cargado, no hacer nada
    const existente = pendientesPorServicio.get(codigo)
    if (existente && !existente.cargando && existente.bienes.length > 0) return

    setPendientesPorServicio(prev => {
      const nuevo = new Map(prev)
      nuevo.set(codigo, { bienes: [], total: 0, offset: 0, hayMas: false, cargando: true })
      return nuevo
    })

    const resultado = await cargarServicioReal(codigo, placasGlobal)

    setPendientesPorServicio(prev => {
      const nuevo = new Map(prev)
      nuevo.set(codigo, {
        bienes: resultado.pendientes,
        total: resultado.total,
        offset: resultado.pendientes.length,
        hayMas: false, // cargarServicioReal trae TODOS los pendientes de una vez
        cargando: false,
      })
      return nuevo
    })

    // Actualizar el conteo del servicio en la card para que coincida con el total real
    if (resultado.total > 0) {
      setServicios(prev => prev.map(s =>
        s.codigo === codigo ? { ...s, cantidad: resultado.total, nombre: resultado.nombre } : s
      ))
    }
  }, [placasGlobal, pendientesPorServicio])



  // Abrir el detalle de un servicio DENTRO del panel lateral unificado.
  const abrirServicio = useCallback((codigo: string) => {
    setServicioAbierto(codigo)
    onAbrirPanel?.()
    if (!pendientesPorServicio.has(codigo)) {
      cargarPrimeraPagina(codigo)
    }
  }, [pendientesPorServicio, cargarPrimeraPagina, onAbrirPanel])

  const cerrarServicio = useCallback(() => setServicioAbierto(null), [])

  // Cargar (una vez) el desglose de vehículos para el nivel "vehiculos" del panel.
  const cargarVehiculosDetalle = useCallback(async () => {
    if (cargandoVehiculos) return
    setCargandoVehiculos(true)
    setVehiculosDetalle(null)
    try {
      const data = await obtenerDetalleVehiculosDashboard()
      setVehiculosDetalle(data.vehiculos)
      setVehiculosGrupos(data.grupos)
      const todosGrupos = Object.keys(data.grupos)
      setGruposSeleccionados(new Set(todosGrupos.filter(g => !g.includes('BOTE') && !g.includes('MOTOR FUERA'))))
    } catch {
      setVehiculosDetalle([])
    }
    setCargandoVehiculos(false)
  }, [cargandoVehiculos])

  const rootRef = useRef<HTMLDivElement>(null)

  const actualizarFiltro = useCallback((codigo: string, valor: string) => {
    setFiltroBusqueda(m => new Map(m).set(codigo, valor))
  }, [])

  if (cargando) {
    return (
      <div className="dashboard-inv__loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 200px)' }}>
        <Animacion type="colibri" width={240} />
        <p className="dashboard-inv__loading-text" style={{ marginTop: '1rem', fontSize: '0.95rem' }}>Cargando datos del inventario...</p>
      </div>
    )
  }

  return (
    <div className="dashboard-inv" ref={rootRef}>
      {/* ═══ PANEL LATERAL UNIFICADO (portal al panel derecho de la página) ═══ */}
      {(() => {
        const target = document.getElementById('gi-dashboard-cards')
        if (!target) return null
        const sData = servicioAbierto ? serviciosConAvance.find(x => x.codigo === servicioAbierto) : undefined
        const estadoDet = servicioAbierto ? pendientesPorServicio.get(servicioAbierto) : undefined
        return createPortal(
          <PanelResumen
            nivel={nivelPanel}
            setNivel={(n) => { setNivelPanel(n); setServicioAbierto(null) }}
            porcentajeGlobal={porcentajeGlobal}
            totalInventariados={totalInventariados}
            totalBienes={totalBienes}
            totalPendientes={totalPendientes}
            servicios={serviciosConAvance.map(s => ({ codigo: s.codigo, nombre: s.nombre, cantidad: s.cantidad, inventariados: s.inventariados, pendientes: s.pendientes, porcentaje: s.porcentaje }))}
            resumenVehiculos={resumenVehiculos}
            vehiculosDetalle={vehiculosDetalle}
            vehiculosGrupos={vehiculosGrupos}
            cargandoVehiculos={cargandoVehiculos}
            gruposSeleccionados={gruposSeleccionados}
            setGruposSeleccionados={setGruposSeleccionados}
            dropdownGruposAbierto={dropdownGruposAbierto}
            setDropdownGruposAbierto={setDropdownGruposAbierto}
            filtroBusquedaVehiculos={filtroBusquedaVehiculos}
            setFiltroBusquedaVehiculos={setFiltroBusquedaVehiculos}
            onCargarVehiculos={cargarVehiculosDetalle}
            servicioAbierto={servicioAbierto}
            servicioData={sData ? { codigo: sData.codigo, nombre: sData.nombre, cantidad: sData.cantidad, inventariados: sData.inventariados, pendientes: sData.pendientes, porcentaje: sData.porcentaje } : undefined}
            pendientes={estadoDet?.bienes ?? []}
            cargandoServicioDet={estadoDet?.cargando ?? false}
            totalServicioDet={estadoDet?.total ?? 0}
            filtroServicio={servicioAbierto ? (filtroBusqueda.get(servicioAbierto) ?? '') : ''}
            setFiltroServicio={actualizarFiltro}
            onCerrarServicio={cerrarServicio}
            onAbrirServicio={abrirServicio}
          />,
          target,
        )
      })()}

      {/* ═══ AVANCE POR SERVICIO (expandible con paginación) ═══ */}
      <div className="dashboard-inv__servicios">
        <div className="dashboard-inv__servicios-header">
          <div className="dashboard-inv__servicios-titulo-wrap">
            <span className="dashboard-inv__servicios-titulo">Avance por servicio</span>
            <span className="dashboard-inv__servicios-subtitulo">Progreso de inventario de cada dependencia</span>
          </div>
          <div className="dashboard-inv__servicios-controles">
            {/* Filtro por sede: Todos / Bogotá / Regional */}
            <div className="dashboard-inv__servicios-ordenar dashboard-inv__servicios-sede">
              {([['todos', 'Todos'], ['bogota', 'Bogotá'], ['regional', 'Regional']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFiltroSede(key)}
                  className={`dashboard-inv__orden-btn ${filtroSede === key ? 'dashboard-inv__orden-btn--activo' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="dashboard-inv__servicios-ordenar">
              {([['pendientes', 'Más pendientes'], ['avance', 'Menor avance'], ['nombre', 'Nombre']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOrdenamiento(key)}
                  className={`dashboard-inv__orden-btn ${ordenamiento === key ? 'dashboard-inv__orden-btn--activo' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Filtro: solo servicios con alguien inventariando AHORA (en vivo) */}
            <button
              type="button"
              onClick={() => setSoloConActividad(v => !v)}
              className={`dashboard-inv__orden-btn dashboard-inv__orden-btn--vivo ${soloConActividad ? 'dashboard-inv__orden-btn--activo' : ''}`}
              title="Mostrar solo servicios con usuarios trabajando ahora"
            >
              <span className="dashboard-inv__vivo-dot" /> En vivo
              {serviciosEnVivo.length > 0 && <span className="dashboard-inv__vivo-count">{serviciosEnVivo.length}</span>}
            </button>
          </div>
        </div>

        <div className="dashboard-inv__servicios-lista">
          {cargandoServicios && serviciosConAvance.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', minHeight: 'calc(100vh - 450px)' }}>
              <Animacion type="colibri" width={200} />
              <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '1rem', fontWeight: 500 }}>Cargando servicios...</p>
            </div>
          )}
          {cargandoServicios && serviciosConAvance.length > 0 && (
            <div className="dashboard-inv__cargando-inline" role="status" aria-live="polite">
              <span className="dashboard-inv__cargando-dots" aria-hidden="true">
                <span></span><span></span><span></span>
              </span>
              <span>Actualizando…</span>
            </div>
          )}
          {!cargandoServicios && serviciosConAvance.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', textAlign: 'center' }}>
              <FaClipboardCheck size={40} color="#cbd5e1" />
              <p style={{ fontSize: '0.95rem', color: '#334155', fontWeight: 600, margin: '1rem 0 0.35rem' }}>No hay bienes inventariados en servicios</p>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0, maxWidth: '380px' }}>
                Cuando se registren inventarios en un servicio, su avance aparecerá aquí automáticamente.
              </p>
            </div>
          )}
          {serviciosOrdenados.map((s) => {
            const barColor = s.porcentaje === 100
              ? 'var(--dash-color-completo)'
              : s.porcentaje >= 50
                ? 'var(--dash-color-progreso)'
                : s.porcentaje > 0
                  ? 'var(--dash-color-critico)'
                  : 'var(--dash-color-sin-iniciar)'

            // El total (Y) llega en segundo plano: mientras no exista la entrada
            // en pendientesPorServicio, mostramos skeleton en total/% (no bloquea).
            const totalCargado = pendientesPorServicio.has(s.codigo)

            return (
              <div key={s.codigo} className={`dashboard-inv__servicio ${servicioAbierto === s.codigo ? 'dashboard-inv__servicio--activo' : ''}`}>
                <button
                  type="button"
                  className="dashboard-inv__servicio-cabecera"
                  onClick={() => abrirServicio(s.codigo)}
                >
                  {/* Título del servicio */}
                  <div className="dashboard-inv__servicio-titulo">
                    <span className="dashboard-inv__servicio-nombre" title={s.nombre}>{s.nombre}</span>
                    <span className="dashboard-inv__servicio-chip">{s.codigo}</span>
                    {/* Presencia en vivo: quién está inventariando ahora aquí */}
                    {(() => {
                      const activos = sesionesActivas.get(s.codigo)?.usuarios ?? []
                      if (activos.length === 0) return null
                      const nombres = activos.map(u => u.usuario.split(' ').slice(0, 2).join(' ')).join(', ')
                      return (
                        <span className="dashboard-inv__servicio-vivo" title={`Trabajando ahora: ${activos.map(u => u.usuario).join(', ')}`}>
                          <span className="dashboard-inv__vivo-dot" />
                          {activos.length === 1 ? nombres : `${activos.length} usuarios`}
                        </span>
                      )
                    })()}
                  </div>

                  {/* Donut de avance centrado */}
                  <div className="dashboard-inv__servicio-donut">
                    {(() => {
                      const R = 34
                      const CIRC = 2 * Math.PI * R
                      const dash = totalCargado ? (s.porcentaje / 100) * CIRC : 0
                      return (
                        <svg width="92" height="92" viewBox="0 0 92 92">
                          <circle cx="46" cy="46" r={R} fill="none" stroke="#eef2f7" strokeWidth="8" />
                          {totalCargado && (
                            <circle
                              cx="46" cy="46" r={R} fill="none" stroke={barColor} strokeWidth="8"
                              strokeLinecap="round" strokeDasharray={`${dash} ${CIRC - dash}`}
                              transform="rotate(-90 46 46)"
                              style={{ transition: 'stroke-dasharray 0.6s ease' }}
                            />
                          )}
                        </svg>
                      )
                    })()}
                    <span className="dashboard-inv__servicio-donut-pct" style={{ color: totalCargado ? barColor : '#cbd5e1' }}>
                      {totalCargado ? `${s.porcentaje}%` : '···'}
                    </span>
                  </div>

                  {/* Métricas con títulos — orden: 1 Total, 2 Inventariados, 3 Pendientes */}
                  <div className="dashboard-inv__servicio-metricas">
                    <div className="dashboard-inv__metrica">
                      <span className="dashboard-inv__metrica-titulo">Total</span>
                      {totalCargado
                        ? <span className="dashboard-inv__metrica-valor">{s.cantidad}</span>
                        : <span className="dashboard-inv__skeleton" />}
                    </div>
                    <div className="dashboard-inv__metrica">
                      <span className="dashboard-inv__metrica-titulo">Inventariados</span>
                      <span className="dashboard-inv__metrica-valor dashboard-inv__metrica-valor--ok">{s.inventariados}</span>
                    </div>
                    <div
                      className="dashboard-inv__metrica dashboard-inv__metrica--clic"
                      role="button"
                      tabIndex={0}
                      title="Ver bienes pendientes"
                      onClick={(e) => { e.stopPropagation(); abrirServicio(s.codigo) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); abrirServicio(s.codigo) } }}
                    >
                      <span className="dashboard-inv__metrica-titulo">Pendientes</span>
                      {totalCargado
                        ? <span className="dashboard-inv__metrica-valor dashboard-inv__metrica-valor--pend">{s.pendientes}</span>
                        : <span className="dashboard-inv__skeleton" />}
                    </div>
                  </div>

                  {/* Estado + ver */}
                  <div className="dashboard-inv__servicio-estado">
                    {totalCargado && s.pendientes === 0 && (
                      <span className="dashboard-inv__servicio-ok-chip">Completo</span>
                    )}
                    {totalCargado && s.pendientes > 0 && (
                      <span className="dashboard-inv__servicio-ver">Ver detalle</span>
                    )}
                    {/* Aviso EXPLÍCITO de bienes fuera de lista: se inventariaron
                        bienes que no pertenecen al universo del servicio. */}
                    {totalCargado && s.fueraDeLista > 0 && (
                      <span
                        className="dashboard-inv__servicio-fuera-chip"
                        title={`Se inventariaron ${s.fueraDeLista} bien(es) que NO pertenecen a la lista de este servicio (bienes fuera de lista).`}
                      >
                        +{s.fueraDeLista} fuera de lista
                      </span>
                    )}
                    {!totalCargado && (
                      <span className="dashboard-inv__servicio-calc">calculando…</span>
                    )}
                    <span className="dashboard-inv__servicio-expand-icon"><FaChevronRight /></span>
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
