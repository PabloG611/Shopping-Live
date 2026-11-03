/**
 * Módulo completo de Inventario de Vehículos.
 * Flujo: Buscar vehículos → Seleccionar → Checklist + Fotos → Guardar + PDF
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getAccessToken } from '../../services/tokenStore'
import { getSharepointStatus, loginSharepoint, getSpAccessToken, validateSpConnection } from '../../services/msalSharepointService'
import { subirFotosVehiculo } from '../../services/sharepointService'
import { uploadFileToSharepoint, deleteSharepointFolder, testSharepointWriteAccess, verificarConexionSharepoint, listarArchivosCarpeta } from '../../services/graphUploadService'
import { fetchVehiculosAsignados } from '../../services/vehiculosBogotaService'
import { consultarBienesMasivo } from '../../services/cargaMasivaService'
import { getAuthUser } from '../../utils/authState'
import {
  listarVehiculos,
  registrarInventarioVehiculo,
  generarFormatoVehiculo,
  listarInventariosVehiculos,
  eliminarInventarioVehiculo,
  comprimirImagen,
  crearChecklistInicial,
  crearDocumentosInicial,
  esMoto,
  TIPOS_FOTO,
  CHECKLIST_SECCIONES,
  CHECKLIST_MOTO_SECCIONES,
  listarDocumentacionVehiculos,
  liberarVehiculo as liberarVehiculoAPI,
  bloquearVehiculo as bloquearVehiculoAPI,
  obtenerVehiculosBloqueados,
  obtenerPlacasInventariadas,
  descargarRespaldoFotosLocal,
  type Vehiculo,
  type ChecklistVehiculo,
  type DocumentosVehiculo,
  type FotoCaptura,
  type TipoFoto,
  type InventarioResumen,
  type VehiculoBloqueadoDTO,
} from '../../services/vehiculosService'

import type { useToast } from '../../hooks/useToast'
import { usePresenciaInventario } from '../../hooks/usePresenciaInventario'
import { useTransferenciasWebSocket } from '../../hooks/useTransferenciasWebSocket'
import SelectorRegional from '../inventario/SelectorRegional'
import SelectorCoordinador from '../inventario/SelectorCoordinador'
import SelectorUbicacion from '../inventario/SelectorUbicacion'
import FloatingField from '../ui/FloatingField'
import { ModalPrevisualizarPdf } from '../transferencia/ModalPrevisualizarPdf'
import { useTransferencias } from '../../context/useTransferencias'
import ChatFlotante from '../inventario/ChatFlotante'
import { useUbicacionesTNS } from '../../hooks/useUbicacionesTNS'
import { FaCircleInfo, FaLocationDot, FaCarSide, FaPenToSquare, FaUser, FaArrowRotateRight, FaRectangleList } from 'react-icons/fa6'
import { Animacion } from 'react-ecosistema-unp/ui'
import PanelContadoresVehiculos from './PanelContadoresVehiculos'

// ─── TIPOS LOCALES ────────────────────────────────────────────────────────────

type Vista = 'lista' | 'checklist' | 'historial'

// Vehículo enriquecido para la lista "en proceso" (incluye quién lo está
// inventariando). El resto de listas usan el Vehiculo tal cual.
export type VehiculoContador = Vehiculo & { bloqueadoPor?: string }

// Datos que ListaVehiculos reporta al panel de contadores: conteos + listas
// reales para poder mostrar "cuáles" (no solo "cuántos") al hacer clic.
export interface ContadoresVehiculosData {
  inventariados: number
  bloqueados: number
  listaInventariados: Vehiculo[]
  listaPendientes: Vehiculo[]
  listaEnProceso: VehiculoContador[]
  // true solo cuando ya se cargó un servicio (se pulsó "Cargar vehículos").
  // Sirve para que el panel distinga "sin servicio" de "servicio con 0 vehículos".
  servicioCargado: boolean
}

interface Props {
  toast: ReturnType<typeof useToast>
}

// ─── HELPERS LOCALSTORAGE ─────────────────────────────────────────────────────

const LS_KEY_VISTA = 'vehiculos_vista'
const LS_KEY_VEHICULO = 'vehiculos_vehiculo_seleccionado'
const LS_KEY_CHECKLIST_PREFIX = 'vehiculos_checklist_'
// Último "quien presenta" por servicio/regional: se arrastra entre vehículos.
const LS_KEY_PRESENTA_PREFIX = 'vehiculos_ultimo_presenta_'
// Último "quien elabora": se arrastra entre vehículos (de la misma sesión) para
// que las correcciones de dependencia/grupo del inventariador no se repitan.
const LS_KEY_ELABORA = 'vehiculos_ultimo_elabora'

interface PresentaData {
  nombre: string
  cedula: string
  cargo: string
  grupo: string
  telefono: string
}

interface ElaboraData {
  nombre: string
  cedula: string
  cargo: string
  dependencia: string
  grupo: string
}

function normalizarServicio(servicio?: string): string {
  return (servicio || 'sin_servicio').replace(/\s+/g, '_')
}

function guardarEnLS(key: string, valor: unknown) {
  try { localStorage.setItem(key, JSON.stringify(valor)) } catch { /* ignore */ }
}

function leerDeLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* ignore */ }
  return fallback
}

function eliminarDeLS(key: string) {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function InventarioVehiculos({ toast }: Props) {
  const [vista, setVista] = useState<Vista>(() => leerDeLS<Vista>(LS_KEY_VISTA, 'lista'))
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState<Vehiculo | null>(() => leerDeLS<Vehiculo | null>(LS_KEY_VEHICULO, null))
  const [modoBusqueda, setModoBusqueda] = useState<'regional' | 'placa'>('regional')

  // ─── Sesión del usuario (para liberar bloqueos) ─────────────────────────
  const { sesionUsuario } = useTransferencias()

  // ─── Cache de vehículos (vive en el padre para no perderse al cambiar de vista) ──
  const [vehiculosCache, setVehiculosCache] = useState<Vehiculo[]>(() => leerDeLS<Vehiculo[]>('vehiculos_lista_cache', []))
  const [servicioCache, setServicioCache] = useState(() => leerDeLS<string>('vehiculos_servicio_cache', ''))

  // ─── Contadores: progreso del checklist (reportado por FormularioChecklist) ──
  const [checklistProgreso, setChecklistProgreso] = useState<{ completados: number; total: number }>({ completados: 0, total: 0 })
  const [fotosProgreso, setFotosProgreso] = useState<{ tomadas: number; total: number }>({ tomadas: 0, total: 7 })
  const [pasoActual, setPasoActual] = useState(1)
  const [placasInventariadasCount, setPlacasInventariadasCount] = useState(0)
  const [bloqueadosCount, setBloqueadosCount] = useState(0)
  // Listas reales para el detalle clicable de los contadores.
  const [listaInventariados, setListaInventariados] = useState<Vehiculo[]>([])
  const [listaPendientes, setListaPendientes] = useState<Vehiculo[]>([])
  const [listaEnProceso, setListaEnProceso] = useState<VehiculoContador[]>([])
  const [servicioCargado, setServicioCargado] = useState(false)
  const [cargandoLista, setCargandoLista] = useState(false)
  useEffect(() => { guardarEnLS('vehiculos_lista_cache', vehiculosCache) }, [vehiculosCache])
  useEffect(() => { guardarEnLS('vehiculos_servicio_cache', servicioCache) }, [servicioCache])

  // ─── SharePoint: estado global del módulo ───────────────────────────────
  const [sharepointAuth, setSharepointAuth] = useState<boolean>(() => getSharepointStatus().authenticated)
  const [sharepointUser, setSharepointUser] = useState<string>(() => getSharepointStatus().user)

  const handleSharepointLogin = async () => {
    toast.info('Redirigiendo a Microsoft...')
    const result = await loginSharepoint()
    if (result.ok) {
      setSharepointAuth(true)
      setSharepointUser(result.user)
      toast.success(`SharePoint conectado${result.user ? ` (${result.user})` : ''}`)
    } else {
      toast.error(`Error SharePoint: ${result.error ?? 'desconocido'}`)
    }
  }

  // ─── SharePoint: validación periódica del token ──────────────────────────
  const [spValidando, setSpValidando] = useState(false)
  const [spTokenValido, setSpTokenValido] = useState<boolean | null>(null) // null = no verificado aún

  // Verificar conexión real al montar y periódicamente.
  // Clave para no "desconectarse mucho":
  //  - validateSpConnection() solo devuelve false ante un 401/403 REAL; los
  //    fallos de red/5xx se toleran (token sigue válido).
  //  - No revalidamos si la pestaña está oculta (segundo plano/bfcache).
  //  - Intervalo amplio (15 min): el token MSAL dura ~1h y se renueva solo.
  useEffect(() => {
    if (!sharepointAuth) { setSpTokenValido(null); return }

    let cancelado = false
    const verificar = async () => {
      // No validar en segundo plano: evita trabajo inútil y falsos negativos.
      if (document.visibilityState === 'hidden') return
      setSpValidando(true)
      const valido = await validateSpConnection()
      if (cancelado) return
      setSpTokenValido(valido)
      // Solo marcar desconectado ante token realmente inválido (401/403).
      if (!valido) {
        setSharepointAuth(false)
        setSharepointUser('')
      }
      setSpValidando(false)
    }
    void verificar()
    const interval = window.setInterval(() => { void verificar() }, 15 * 60 * 1000) // cada 15 min
    // Revalidar al volver a la pestaña (por si el token caducó estando oculta).
    const onVisible = () => { if (document.visibilityState === 'visible') void verificar() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelado = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sharepointAuth])

  const seleccionarVehiculo = (v: Vehiculo) => {
    setVehiculoSeleccionado(v)
    setVista('checklist')
    guardarEnLS(LS_KEY_VEHICULO, v)
    guardarEnLS(LS_KEY_VISTA, 'checklist')
  }

  const volverALista = async () => {
    // Liberar bloqueo del vehículo actual
    if (vehiculoSeleccionado) {
      const usuario = sesionUsuario?.nombreCompleto || ''
      const cedula = sesionUsuario?.numeroIdentificacion || ''
      if (cedula) {
        try {
          await liberarVehiculoAPI({ placa: vehiculoSeleccionado.placa, usuario, cedula })
        } catch (e) {
          console.warn('[Vehiculos] Error liberando:', e)
        }
      }
      eliminarDeLS(`${LS_KEY_CHECKLIST_PREFIX}${vehiculoSeleccionado.placa}`)
    }
    setVehiculoSeleccionado(null)
    setVista('lista')
    eliminarDeLS(LS_KEY_VEHICULO)
    guardarEnLS(LS_KEY_VISTA, 'lista')
  }

  return (
    <div className="vehiculos-modulo">
      {/* ── Conmutador de vista: cards de acción grandes permanentes ── */}
      {vista !== 'checklist' && (
        <div className="vehiculos-header">
          <div className="veh-landing">
            <div className="veh-action-cards">
              <button
                type="button"
                className={`veh-action-card${vista === 'lista' ? ' is-active' : ''}`}
                onClick={() => { setVista('lista'); guardarEnLS(LS_KEY_VISTA, 'lista') }}
              >
                <span className="veh-action-card__icon veh-action-card__icon--azul"><FaCarSide size={22} /></span>
                <span className="veh-action-card__texto">
                  <span className="veh-action-card__titulo">Inventariar vehículo</span>
                  <span className="veh-action-card__sub">Registrar un nuevo inventario</span>
                </span>
                {vista === 'lista' && <span className="veh-action-card__check">✓</span>}
              </button>
              <button
                type="button"
                className={`veh-action-card${vista === 'historial' ? ' is-active' : ''}`}
                onClick={() => { setVista('historial'); guardarEnLS(LS_KEY_VISTA, 'historial') }}
              >
                <span className="veh-action-card__icon veh-action-card__icon--gris"><FaRectangleList size={22} /></span>
                <span className="veh-action-card__texto">
                  <span className="veh-action-card__titulo">Inventarios realizados</span>
                  <span className="veh-action-card__sub">Consultar el historial</span>
                </span>
                {vista === 'historial' && <span className="veh-action-card__check">✓</span>}
              </button>
            </div>

            {/* Indicador SharePoint (solo en modo inventariar) */}
            {vista === 'lista' && (
              <div className={`vehiculos-sp-badge${sharepointAuth && spTokenValido ? ' vehiculos-sp-badge--ok' : !sharepointAuth ? ' vehiculos-sp-badge--off' : ' vehiculos-sp-badge--warn'}`}>
                <span className="vehiculos-sp-badge__dot" />
                <span className="vehiculos-sp-badge__text">
                  {spValidando ? 'Verificando...' : sharepointAuth && spTokenValido ? `SharePoint · ${sharepointUser || 'conectado'}` : sharepointAuth && spTokenValido === false ? 'Token expirado' : 'SharePoint desconectado'}
                </span>
                {(!sharepointAuth || spTokenValido === false) && (
                  <button className="vehiculos-sp-badge__btn" onClick={handleSharepointLogin}>Conectar</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contenido - usar display none para NO desmontar y mantener el estado */}
      <div style={{ display: vista === 'lista' ? 'block' : 'none' }}>
        <ListaVehiculos
          onSeleccionar={seleccionarVehiculo}
          toast={toast}
          modoBusqueda={modoBusqueda}
          setModoBusqueda={setModoBusqueda}
          sharepointAuth={sharepointAuth}
          onConectarSharepoint={handleSharepointLogin}
          vehiculosCache={vehiculosCache}
          setVehiculosCache={setVehiculosCache}
          servicioCache={servicioCache}
          setServicioCache={setServicioCache}
          vistaActiva={vista === 'lista'}
          onContadoresUpdate={(data) => {
            setPlacasInventariadasCount(data.inventariados)
            setBloqueadosCount(data.bloqueados)
            setListaInventariados(data.listaInventariados)
            setListaPendientes(data.listaPendientes)
            setListaEnProceso(data.listaEnProceso)
            setServicioCargado(data.servicioCargado)
          }}
          onCargandoChange={setCargandoLista}
        />
      </div>
      {vista === 'checklist' && vehiculoSeleccionado && (
        <FormularioChecklist
          vehiculo={vehiculoSeleccionado}
          onVolver={volverALista}
          toast={toast}
          sharepointAuth={sharepointAuth}
          onSharepointConnected={(user) => { if (user) { setSharepointAuth(true); setSharepointUser(user) } else { setSharepointAuth(false); setSharepointUser('') } }}
          onProgresoChange={(checklist, fotos, paso) => { setChecklistProgreso(checklist); setFotosProgreso(fotos); setPasoActual(paso) }}
        />
      )}
      {vista === 'historial' && (
        <HistorialInventarios toast={toast} />
      )}

      {/* Contadores — portal al panel derecho */}
      {(() => {
        const portalTarget = document.getElementById('gi-panel-contadores')
        if (!portalTarget) return null
        return createPortal(
          <PanelContadoresVehiculos
            vista={vista}
            cargando={cargandoLista}
            totalVehiculos={vehiculosCache.length}
            inventariados={placasInventariadasCount}
            bloqueados={bloqueadosCount}
            listaInventariados={listaInventariados}
            listaPendientes={listaPendientes}
            listaEnProceso={listaEnProceso}
            servicioCargado={servicioCargado}
            vehiculoPlaca={vehiculoSeleccionado?.placa}
            checklistProgreso={checklistProgreso}
            fotosProgreso={fotosProgreso}
            pasoActual={pasoActual}
          />,
          portalTarget
        )
      })()}
    </div>
  )
}


// ─── LISTA DE VEHÍCULOS ───────────────────────────────────────────────────────

function ListaVehiculos({ onSeleccionar, toast, modoBusqueda, setModoBusqueda, sharepointAuth, onConectarSharepoint, vehiculosCache, setVehiculosCache, servicioCache, setServicioCache, vistaActiva, onContadoresUpdate, onCargandoChange }: {
  onSeleccionar: (v: Vehiculo) => void
  toast: ReturnType<typeof useToast>
  modoBusqueda: 'regional' | 'placa'
  setModoBusqueda: (m: 'regional' | 'placa') => void
  sharepointAuth: boolean
  onConectarSharepoint: () => void
  vehiculosCache: Vehiculo[]
  setVehiculosCache: (v: Vehiculo[]) => void
  servicioCache: string
  setServicioCache: (s: string) => void
  vistaActiva: boolean
  onContadoresUpdate?: (data: ContadoresVehiculosData) => void
  onCargandoChange?: (cargando: boolean) => void
}) {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>(vehiculosCache)
  const [servicioSeleccionado, setServicioSeleccionado] = useState(servicioCache)
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState<{ id: number; label: string } | null>(() => {
    try { const d = localStorage.getItem('vehiculos_ubicacion_seleccionada'); return d ? JSON.parse(d) : null } catch { return null }
  })
  const [cargando, setCargando] = useState(false)
  const [busquedaPlaca, setBusquedaPlaca] = useState('')
  const [cargado, setCargado] = useState(vehiculosCache.length > 0)
  const [placasInventariadas, setPlacasInventariadas] = useState<Set<string>>(new Set())
  const primerRender = useRef(true)
  // Popover "Buscar por" (Regional / Placa), local a la caja de búsqueda.
  const [dropdownAbierto, setDropdownAbierto] = useState(false)
  // Servicios (grupos) plegados en la vista de lista. Set de nombres de servicio.
  const [serviciosPlegados, setServiciosPlegados] = useState<Set<string>>(new Set())

  // ─── Ubicaciones TNS (misma lógica que inventario regional) ─────────────
  const { ubicacionesTNS, cargando: cargandoUbicaciones } = useUbicacionesTNS()

  // ─── Presencia y bloqueo en tiempo real ─────────────────────────────────
  const { sesionUsuario } = useTransferencias()
  const presencia = usePresenciaInventario({
    usuario: sesionUsuario?.nombreCompleto || '',
    cedula: sesionUsuario?.numeroIdentificacion || '',
    grupo: sesionUsuario?.grupo || '',
    cargo: sesionUsuario?.cargo || '',
    servicio: servicioSeleccionado,
    habilitado: sharepointAuth && !!sesionUsuario,
    tipoPresencia: 'presencia_vehiculos',
    tipoSalida: 'presencia_vehiculos_salida',
  })

  // Estado de vehículos bloqueados (INVENTARIANDO)
  const [vehiculosBloqueados, setVehiculosBloqueados] = useState<VehiculoBloqueadoDTO[]>([])

  // Cargar bloqueos existentes al montar y cuando cambia el servicio
  useEffect(() => {
    const cargar = async () => {
      const { bloqueados } = await obtenerVehiculosBloqueados()
      setVehiculosBloqueados(bloqueados)
    }
    cargar()
  }, [servicioSeleccionado])

  // Recargar bloqueados y placas inventariadas cuando la vista vuelve a ser activa (ej: volver de checklist)
  useEffect(() => {
    if (!vistaActiva) return
    const recargar = async () => {
      const [{ bloqueados }, placas] = await Promise.all([
        obtenerVehiculosBloqueados(),
        obtenerPlacasInventariadas(),
      ])
      setVehiculosBloqueados(bloqueados)
      setPlacasInventariadas(new Set(placas))
    }
    recargar()
  }, [vistaActiva])

  // Escuchar eventos WS de bloqueo/liberación de vehículos
  useTransferenciasWebSocket({
    enabled: sharepointAuth,
    onPresenciaRecibida: (data: any) => {
      const action = data.action_key || data.tipo
      if (action === 'vehiculo_inventariando') {
        setVehiculosBloqueados(prev => {
          if (prev.some(b => b.placa === data.placa)) {
            return prev.map(b => b.placa === data.placa ? { placa: data.placa, usuario: data.usuario, cedula: data.cedula, servicio: data.servicio || '', desde: Date.now() / 1000 } : b)
          }
          return [...prev, { placa: data.placa, usuario: data.usuario, cedula: data.cedula, servicio: data.servicio || '', desde: Date.now() / 1000 }]
        })
      }
      if (action === 'vehiculo_liberado') {
        setVehiculosBloqueados(prev => prev.filter(b => b.placa !== data.placa))
      }
    },
  })

  // Helpers de bloqueo
  const estaBloqueado = (placa: string) => vehiculosBloqueados.some(b => b.placa === placa && b.cedula !== (sesionUsuario?.numeroIdentificacion || ''))
  const obtenerBloqueo = (placa: string) => vehiculosBloqueados.find(b => b.placa === placa)

  // Handler para seleccionar un vehículo (bloquea primero, luego navega al checklist)
  const handleSeleccionar = async (v: Vehiculo) => {
    const result = await bloquearVehiculoAPI({
      placa: v.placa,
      usuario: sesionUsuario?.nombreCompleto || '',
      cedula: sesionUsuario?.numeroIdentificacion || '',
      servicio: servicioSeleccionado,
    })
    if (!result.ok) {
      toast.warning(result.mensaje || `${v.placa} ya está siendo inventariado`)
      return
    }
    onSeleccionar(v)
  }

  // Sincronizar con caché del padre cuando cambian los vehículos
  useEffect(() => { setVehiculosCache(vehiculos) }, [vehiculos])
  useEffect(() => { setServicioCache(servicioSeleccionado) }, [servicioSeleccionado])
  useEffect(() => {
    try { if (ubicacionSeleccionada) localStorage.setItem('vehiculos_ubicacion_seleccionada', JSON.stringify(ubicacionSeleccionada)); else localStorage.removeItem('vehiculos_ubicacion_seleccionada') } catch { /* silenciar */ }
  }, [ubicacionSeleccionada])

  // Limpiar resultados SOLO al cambiar de modo (no en el primer render / mount)
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false
      return
    }
    setVehiculos([])
    setCargado(false)
    setBusquedaPlaca('')
    setServicioSeleccionado('')
    setUbicacionSeleccionada(null)
  }, [modoBusqueda])

  // Cargar placas ya inventariadas al montar
  useEffect(() => {
    const cargarInventariados = async () => {
      const placas = await obtenerPlacasInventariadas()
      setPlacasInventariadas(new Set(placas))
    }
    cargarInventariados()
  }, [])

  // Lista de regionales (misma que usa inventario regionales)
  // Reportar contadores al padre.
  // "Inventariados" debe contar SOLO los vehículos del servicio cargado, no el
  // total global del sistema. Por eso intersectamos las placas inventariadas
  // (globales) con la lista de vehículos actualmente cargada.
  // Además de los conteos, enviamos las LISTAS reales (inventariados /
  // pendientes / en proceso) para que el panel de contadores pueda mostrar
  // "cuáles" faltan al hacer clic, no solo "cuántos".
  useEffect(() => {
    const inventariadosLista = vehiculos.filter(v => placasInventariadas.has(v.placa))
    const pendientesLista = vehiculos.filter(v => !placasInventariadas.has(v.placa))
    // Mapa de placa → bloqueo para enriquecer "en proceso" con el responsable.
    const bloqueoPorPlaca = new Map(vehiculosBloqueados.map(b => [b.placa, b]))
    const enProcesoLista: VehiculoContador[] = vehiculos
      .filter(v => bloqueoPorPlaca.has(v.placa))
      .map(v => ({ ...v, bloqueadoPor: bloqueoPorPlaca.get(v.placa)?.usuario }))

    onContadoresUpdate?.({
      inventariados: inventariadosLista.length,
      bloqueados: enProcesoLista.length,
      listaInventariados: inventariadosLista,
      listaPendientes: pendientesLista,
      listaEnProceso: enProcesoLista,
      servicioCargado: cargado,
    })
  }, [placasInventariadas, vehiculos, vehiculosBloqueados, cargado]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reportar estado de carga al padre (para el skeleton de contadores)
  useEffect(() => {
    onCargandoChange?.(cargando)
  }, [cargando]) // eslint-disable-line react-hooks/exhaustive-deps

  const REGIONALES = [
    { codigo: 'BOGOTA', nombre: 'Bogotá (Sede Principal)' },
    { codigo: '3000-ENLARIOHACHA', nombre: 'Riohacha' },
    { codigo: '3000-ENLSANTAMARTA', nombre: 'Santa Marta' },
    { codigo: '3000-ENLVALLEDUPAR', nombre: 'Valledupar' },
    { codigo: '3000-ENLARM', nombre: 'Armenia' },
    { codigo: '3000-ENLB/TURA', nombre: 'Buenaventura' },
    { codigo: '3000-ENLMANIZALES', nombre: 'Manizales' },
    { codigo: '3000-ENLPEREI', nombre: 'Pereira' },
    { codigo: '3000-ENLMONT', nombre: 'Montería' },
    { codigo: '3000-ENLSINCE', nombre: 'Sincelejo' },
    { codigo: '3000-ENLB/MANGA', nombre: 'Bucaramanga' },
    { codigo: '3000-ENLB/MEJA', nombre: 'Barrancabermeja' },
    { codigo: '3000-ENLMOCOA', nombre: 'Mocoa' },
    { codigo: '3000-ENLAPAR', nombre: 'Apartadó' },
    { codigo: '3000-ENLQUIBDO', nombre: 'Quibdó' },
    { codigo: '3000-ENLIBAGUE', nombre: 'Ibagué' },
    { codigo: '3000-ENLPASTO', nombre: 'Pasto' },
    { codigo: '3000-ENLTUM', nombre: 'Tumaco' },
    { codigo: '3000-ENLARAUCA', nombre: 'Arauca' },
    { codigo: '3000-ENLYOPAL', nombre: 'Yopal' },
    { codigo: '3000-ENLTUNJA', nombre: 'Tunja' },
    { codigo: '3000-GURPBLLA', nombre: 'Barranquilla' },
    { codigo: '3000-GURPCALI', nombre: 'Cali' },
    { codigo: '3000-GURPCAR', nombre: 'Cartagena' },
    { codigo: '3000-GURPCUC', nombre: 'Cúcuta' },
    { codigo: '3000-GURPFLO', nombre: 'Florencia' },
    { codigo: '3000-GURPMED', nombre: 'Medellín' },
    { codigo: '3000-GURPNEIVA', nombre: 'Neiva' },
    { codigo: '3000-GURPPO', nombre: 'Popayán' },
    { codigo: '3000-GURPVILLA', nombre: 'Villavicencio' },
    { codigo: 'BP001', nombre: 'Bodega Principal' },
  ]

  const cargarPorServicio = async (servicio?: string) => {
    const svc = servicio || servicioSeleccionado
    if (!svc) {
      toast.info('Seleccione un servicio/regional')
      return
    }
    setCargando(true)

    // ── Bogotá (Sede Principal): control por asignación ──────────────────
    // Se consultan SOLO las placas asignadas al inventariador (rápido), no
    // toda la flota. Sin asignación → no ve vehículos (Opción A, estricta).
    if (svc === 'BOGOTA') {
      const username = getAuthUser()?.username || ''
      const asignadas = username ? await fetchVehiculosAsignados(username) : []
      if (asignadas.length === 0) {
        setVehiculos([])
        setCargado(true)
        setCargando(false)
        toast.warning('No tiene vehículos de Bogotá asignados. Contacte al gestor de inventario.')
        return
      }
      try {
        const resMasivo = await consultarBienesMasivo(asignadas)
        const lista: Vehiculo[] = resMasivo.encontrados.map((b) => ({
          matid: b.matid || '',
          placa: b.placa,
          descripcion: b.descripcion,
          serial: b.serial,
          responsable_nombre: b.responsable,
          responsable_cedula: b.cedula,
          servicio_codigo: b.codigo_servicio,
          servicio_nombre: b.dependencia,
        }))
        setVehiculos(lista)
        setCargado(true)
        setCargando(false)
        if (lista.length === 0) toast.info('No se encontraron los vehículos asignados en la base de datos')
        return
      } catch {
        setCargando(false)
        toast.error('Error consultando los vehículos asignados')
        return
      }
    }

    // ── Resto de regionales: comportamiento normal (toda la flota del servicio) ──
    const data = await listarVehiculos({ servicio: svc, ubicacion_id: ubicacionSeleccionada?.id })
    const lista = data.vehiculos ?? []
    setVehiculos(lista)
    setCargado(true)
    setCargando(false)
    if (lista.length === 0) {
      toast.info('No se encontraron vehículos con esos filtros')
    }
  }

  // NO auto-cargar: el usuario debe hacer clic en el botón con ambos filtros diligenciados
  const servicioInicial = useRef(servicioSeleccionado)
  useEffect(() => {
    // Solo recargar al montar si ya hay cache (restaurar sesión anterior)
    if (!servicioSeleccionado) return
    if (servicioSeleccionado === servicioInicial.current && vehiculos.length > 0) return
    // No auto-cargar
  }, [servicioSeleccionado])

  const buscarPorPlaca = async () => {
    if (!busquedaPlaca.trim()) {
      toast.info('Ingrese una placa para buscar')
      return
    }
    setCargando(true)
    const data = await listarVehiculos({ buscar: busquedaPlaca.trim() })
    setVehiculos(data.vehiculos ?? [])
    setCargado(true)
    setCargando(false)
    if ((data.vehiculos ?? []).length === 0) {
      toast.info('No se encontró vehículo con esa placa')
    }
  }

  // Selector "Buscar por" (Regional / Placa) — menú cuidado, se renderiza DENTRO
  // de la cabecera de cada caja de búsqueda (junto al título), no suelto.
  const selectorBuscarPor = (
    <div className="veh-buscarpor">
      <span className="veh-buscarpor__label">Buscar por</span>
      <div className="veh-buscarpor__wrap">
        <button
          type="button"
          className="veh-buscarpor__btn"
          onClick={() => setDropdownAbierto(!dropdownAbierto)}
          aria-expanded={dropdownAbierto}
        >
          <span className="veh-buscarpor__btn-icon">{modoBusqueda === 'regional' ? '🏢' : '🔍'}</span>
          <span>{modoBusqueda === 'regional' ? 'Por servicio' : 'Por placa'}</span>
          <span className="veh-buscarpor__arrow" style={{ transform: dropdownAbierto ? 'rotate(180deg)' : undefined }}>▾</span>
        </button>
        {dropdownAbierto && (
          <>
            <div className="veh-buscarpor__backdrop" onClick={() => setDropdownAbierto(false)} />
            <div className="veh-buscarpor__menu" role="menu">
              <div className="veh-buscarpor__menu-title">¿Cómo quieres buscar?</div>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={modoBusqueda === 'regional'}
                className={`veh-buscarpor__item${modoBusqueda === 'regional' ? ' is-active' : ''}`}
                onClick={() => { setModoBusqueda('regional'); setDropdownAbierto(false) }}
              >
                <span className="veh-buscarpor__item-icon veh-buscarpor__item-icon--azul">🏢</span>
                <span className="veh-buscarpor__item-texto">
                  <span className="veh-buscarpor__item-titulo">Por servicio</span>
                  <span className="veh-buscarpor__item-desc">Trae toda la flota del servicio</span>
                </span>
                {modoBusqueda === 'regional' && <span className="veh-buscarpor__item-check">✓</span>}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={modoBusqueda === 'placa'}
                className={`veh-buscarpor__item${modoBusqueda === 'placa' ? ' is-active' : ''}`}
                onClick={() => { setModoBusqueda('placa'); setDropdownAbierto(false) }}
              >
                <span className="veh-buscarpor__item-icon veh-buscarpor__item-icon--gris">🔍</span>
                <span className="veh-buscarpor__item-texto">
                  <span className="veh-buscarpor__item-titulo">Por placa</span>
                  <span className="veh-buscarpor__item-desc">Busca un vehículo puntual</span>
                </span>
                {modoBusqueda === 'placa' && <span className="veh-buscarpor__item-check">✓</span>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="vehiculos-lista">
      {/* Bloqueo si no hay conexión SharePoint */}
      {!sharepointAuth && (
        <div style={{
          textAlign: 'center', padding: '3rem 2rem',
          background: '#fff8e1', borderRadius: '10px',
          border: '1px dashed #ffe082',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>☁️</div>
          <p style={{ fontWeight: 700, color: '#92400e', marginBottom: '0.4rem', fontSize: '1rem' }}>
            Conecte SharePoint para continuar
          </p>
          <p style={{ color: '#78350f', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Las fotos del inventario se guardan en la nube. Debe conectarse antes de buscar vehículos.
          </p>
          <button
            type="button"
            onClick={onConectarSharepoint}
            style={{ padding: '0.55rem 1.5rem', fontWeight: 700, fontSize: '0.85rem', background: '#303d50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Conectar SharePoint
          </button>
        </div>
      )}

      {sharepointAuth && (<>

      {/* Modo: Por Regional */}
      {modoBusqueda === 'regional' && (
        <fieldset className="floresta-busqueda__fieldset" style={{ marginBottom: '1.25rem' }}>
          <div className="floresta-busqueda__cab">
          <legend className="floresta-busqueda__legend">
            Buscar vehículo por servicio
            <span className="fb-tip" tabIndex={0} aria-label="Ayuda sobre los filtros">
              <FaCircleInfo className="floresta-busqueda__info-icon" />
              <span className="fb-tip__pop" role="tooltip">
                <span className="fb-tip__head">
                  <FaCircleInfo className="fb-tip__head-icon" />
                  Define qué vehículos vas a inventariar
                </span>
                <span className="fb-tip__item">
                  <span className="fb-tip__row">
                    <span className="fb-tip__name">Servicio (Regional)</span>
                    <span className="fb-tip__badge fb-tip__badge--req">Obligatorio</span>
                  </span>
                  <span className="fb-tip__desc">Trae la flota vehicular asignada a esa regional.</span>
                </span>
                <span className="fb-tip__item">
                  <span className="fb-tip__row">
                    <span className="fb-tip__name">Ubicación</span>
                    <span className="fb-tip__badge">Opcional</span>
                  </span>
                  <span className="fb-tip__desc">Limita a los vehículos de esa ubicación dentro del servicio.</span>
                </span>
                <span className="fb-tip__foot">Ajusta los filtros y presiona “Cargar Vehículos”.</span>
              </span>
            </span>
          </legend>
          {selectorBuscarPor}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) minmax(180px, 240px) auto', gap: '0.75rem', alignItems: 'end', maxWidth: '720px' }}>
            <FloatingField label="Servicio (Regional)" required tieneValor={!!servicioSeleccionado}>
              <SelectorRegional
                regionales={REGIONALES}
                valor={servicioSeleccionado}
                onChange={(codigo) => {
                  setServicioSeleccionado(codigo)
                  setUbicacionSeleccionada(null)
                  setCargado(false)
                  setVehiculos([])
                }}
                placeholder="Buscar regional..."
              />
            </FloatingField>
            <FloatingField label="Ubicación (opcional)" tieneValor={!!ubicacionSeleccionada}>
              <SelectorUbicacion
                ubicaciones={ubicacionesTNS}
                valor={ubicacionSeleccionada}
                onChange={(u) => setUbicacionSeleccionada(u as any)}
                placeholder="Buscar ubicación..."
                cargando={cargandoUbicaciones}
              />
            </FloatingField>
            <button
              className="floresta-busqueda__btn"
              onClick={() => cargarPorServicio()}
              disabled={cargando || !servicioSeleccionado}
              style={{ height: '38px', whiteSpace: 'nowrap' }}
            >
              {cargando ? 'Cargando...' : 'Cargar Vehículos'}
            </button>
          </div>
        </fieldset>
      )}

      {/* Modo: Por Placa */}
      {modoBusqueda === 'placa' && (
        <fieldset className="floresta-busqueda__fieldset" style={{ marginBottom: '1.25rem' }}>
          <div className="floresta-busqueda__cab">
            <legend className="floresta-busqueda__legend">Buscar vehículo por placa</legend>
            {selectorBuscarPor}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'end', maxWidth: '420px' }}>
            <FloatingField label="Placa del vehículo" required tieneValor={!!busquedaPlaca}>
              <input
                className="floresta-busqueda__input"
                type="text"
                value={busquedaPlaca}
                onChange={(e) => setBusquedaPlaca(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && buscarPorPlaca()}
                placeholder=" "
                style={{ width: '100%' }}
              />
            </FloatingField>
            <button
              className="floresta-busqueda__btn"
              onClick={buscarPorPlaca}
              disabled={cargando || !busquedaPlaca.trim()}
              style={{ height: '38px' }}
            >
              {cargando ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </fieldset>
      )}

      {/* Chat flotante (participantes en línea) */}
      <ChatFlotante
        participantes={[
          { usuario: sesionUsuario?.nombreCompleto || '', cedula: sesionUsuario?.numeroIdentificacion || '', grupo: sesionUsuario?.grupo || '', cargo: sesionUsuario?.cargo || '', estado: 'online' as const },
          ...presencia.usuarios.map(u => ({ usuario: u.usuario, cedula: u.cedula, grupo: u.grupo, cargo: u.cargo, estado: u.estado })),
        ]}
        cedulaActual={sesionUsuario?.numeroIdentificacion || ''}
        conectado={true}
        mensajesChat={presencia.mensajesChat}
        usuarioActual={sesionUsuario?.nombreCompleto || ''}
        otroEscribiendo={presencia.otroEscribiendo}
        noLeidos={presencia.noLeidosChat}
        onEnviarMensaje={presencia.enviarMensajeChat}
        onEscribiendo={presencia.notificarEscribiendo}
        onMarcarLeido={presencia.marcarChatLeido}
        onReaccionar={presencia.reaccionarMensaje}
        onEditar={presencia.editarMensaje}
      />

      {/* Loading */}
      {cargando && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', minHeight: '300px', textAlign: 'center' }}>
          <Animacion type="colibri" width={280} />
          <p style={{ color: '#64748b', fontWeight: 600, margin: '1rem 0 0', fontSize: '0.9rem' }}>Cargando vehículos...</p>
        </div>
      )}

      {/* Resultados */}
      {!cargando && cargado && vehiculos.length > 0 && (
        (() => {
          // Agrupar vehículos por servicio para mostrarlos en acordeones
          // plegables (similar al panel de coordinador). El orden de servicios
          // es alfabético; dentro de cada grupo, por placa.
          const grupos = new Map<string, typeof vehiculos>()
          for (const v of vehiculos) {
            const svc = (v.servicio_nombre || 'Sin servicio').trim() || 'Sin servicio'
            if (!grupos.has(svc)) grupos.set(svc, [])
            grupos.get(svc)!.push(v)
          }
          const serviciosOrdenados = Array.from(grupos.keys()).sort((a, b) => a.localeCompare(b, 'es'))
          const hayVariosServicios = serviciosOrdenados.length > 1

          const togglePlegado = (svc: string) => {
            setServiciosPlegados(prev => {
              const next = new Set(prev)
              if (next.has(svc)) next.delete(svc); else next.add(svc)
              return next
            })
          }
          const plegarTodos = () => setServiciosPlegados(new Set(serviciosOrdenados))
          const expandirTodos = () => setServiciosPlegados(new Set())

          const renderCard = (v: typeof vehiculos[number]) => {
            const yaInventariado = placasInventariadas.has(v.placa)
            const bloqueado = estaBloqueado(v.placa)
            const infoBloqueado = obtenerBloqueo(v.placa)
            return (
              <div
                key={v.matid}
                className={`vehiculo-card ${yaInventariado ? 'vehiculo-card--inventariado' : ''} ${bloqueado ? 'vehiculo-card--bloqueado' : ''}`}
              >
                <div className="vehiculo-card__header">
                  <span className="vehiculo-card__placa">{v.placa}</span>
                  {yaInventariado
                    ? <span className="vehiculo-card__badge-inventariado">&#10003; Inventariado</span>
                    : bloqueado
                      ? <span className="vehiculo-card__badge-inventariando">Inventariando</span>
                      : <span className="vehiculo-card__badge-pendiente">Pendiente</span>
                  }
                </div>
                <div className="vehiculo-card__body">
                  <div className="vehiculo-card__info-row">
                    {esMoto(v.placa)
                      ? <svg className="vehiculo-card__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><path d="M15 6h2l3 5h-4"/><path d="M9 17.5h6"/><path d="M6 6h4l2 5H5l1-5z"/></svg>
                      : <svg className="vehiculo-card__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                    }
                    <span className="vehiculo-card__descripcion">{v.descripcion || 'Sin descripción'}</span>
                  </div>
                  <div className="vehiculo-card__info-row">
                    <svg className="vehiculo-card__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span className="vehiculo-card__responsable-text">
                      {v.responsable_nombre || 'Sin responsable'}
                      {v.responsable_cedula && <><br /><small>CC {v.responsable_cedula}</small></>}
                    </span>
                  </div>
                  {v.servicio_nombre && (
                    <div className="vehiculo-card__info-row">
                      <svg className="vehiculo-card__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span className="vehiculo-card__servicio">{v.servicio_nombre}</span>
                    </div>
                  )}
                  {bloqueado && infoBloqueado && (
                    <div className="vehiculo-card__info-row" style={{ marginTop: '0.3rem', padding: '0.3rem 0.5rem', background: '#fff3e0', borderRadius: '6px', border: '1px solid #ffe0b2' }}>
                      <svg className="vehiculo-card__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e65100" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <span style={{ fontSize: '0.72rem', color: '#e65100', fontWeight: 600 }}>
                        {infoBloqueado.usuario}
                      </span>
                    </div>
                  )}
                </div>
                {!yaInventariado && !bloqueado && (
                  <button className="vehiculo-card__btn" aria-label={`Inventariar ${v.placa}`} onClick={() => handleSeleccionar(v)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    Inventariar
                  </button>
                )}
                {!yaInventariado && bloqueado && (
                  <button className="vehiculo-card__btn vehiculo-card__btn--disabled" disabled aria-label={`${v.placa} siendo inventariado`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    En proceso...
                  </button>
                )}
              </div>
            )
          }

          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0.5rem 0 0.75rem', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                  {vehiculos.length} vehículo{vehiculos.length !== 1 ? 's' : ''} en {serviciosOrdenados.length} servicio{serviciosOrdenados.length !== 1 ? 's' : ''}
                </p>
                {hayVariosServicios && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={expandirTodos} style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1565c0', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>Expandir todos</button>
                    <span style={{ color: '#cbd5e1' }}>·</span>
                    <button type="button" onClick={plegarTodos} style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>Plegar todos</button>
                  </div>
                )}
              </div>

              {serviciosOrdenados.map((svc) => {
                const items = grupos.get(svc)!
                const plegado = serviciosPlegados.has(svc)
                const inventariadosGrupo = items.filter(v => placasInventariadas.has(v.placa)).length
                const pctGrupo = items.length > 0 ? Math.round((inventariadosGrupo / items.length) * 100) : 0
                const completo = inventariadosGrupo === items.length && items.length > 0
                return (
                  <div
                    key={svc}
                    className="veh-grupo-servicio"
                    style={{
                      marginBottom: 16, borderRadius: 14, overflow: 'hidden', background: '#fff',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
                    }}
                  >
                    {/* Encabezado del servicio (clic para plegar/desplegar) */}
                    <button
                      type="button"
                      onClick={() => togglePlegado(svc)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        padding: '0.85rem 1rem', border: 'none', cursor: 'pointer', textAlign: 'left',
                        // Franja de acento a la izquierda + degradado suave.
                        background: completo
                          ? 'linear-gradient(90deg, #f0fdf4 0%, #ffffff 60%)'
                          : 'linear-gradient(90deg, #eff6ff 0%, #ffffff 60%)',
                        borderLeft: `5px solid ${completo ? '#16a34a' : '#2563eb'}`,
                      }}
                    >
                      {/* Chevron en círculo */}
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#fff', border: '1px solid #e2e8f0', color: '#475569',
                        transform: plegado ? 'rotate(-90deg)' : 'none', transition: 'transform 0.18s',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </span>

                      {/* Icono del servicio */}
                      <span style={{
                        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: completo ? '#dcfce7' : '#dbeafe', color: completo ? '#16a34a' : '#2563eb',
                      }}>
                        <FaCarSide size={17} />
                      </span>

                      {/* Nombre + barra de progreso */}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {svc}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                          <span style={{ flex: 1, height: 5, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', maxWidth: 180 }}>
                            <span style={{ display: 'block', width: `${pctGrupo}%`, height: '100%', borderRadius: 999, background: completo ? '#16a34a' : '#2563eb', transition: 'width 0.3s' }} />
                          </span>
                          <span style={{ fontSize: '0.64rem', color: '#94a3b8', fontWeight: 600 }}>{pctGrupo}%</span>
                        </span>
                      </span>

                      {/* Contador grande */}
                      <span style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0,
                        fontSize: '0.95rem', fontWeight: 800, color: completo ? '#16a34a' : '#1e293b', lineHeight: 1,
                      }}>
                        <span>
                          {inventariadosGrupo}<span style={{ color: '#cbd5e1', fontWeight: 700 }}>/{items.length}</span>
                        </span>
                        <span style={{ fontSize: '0.56rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>
                          {completo ? 'Completo' : 'Inventariados'}
                        </span>
                      </span>
                    </button>

                    {/* Cards del servicio */}
                    {!plegado && (
                      <div className="vehiculos-grid" style={{ padding: '0.85rem', background: '#fcfdfe' }}>
                        {items.map(renderCard)}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )
        })()
      )}

      {!cargando && cargado && vehiculos.length === 0 && (
        <p className="vehiculos-lista__vacio">No se encontraron vehículos.</p>
      )}
      </>)}
    </div>
  )
}


// ─── FORMULARIO CHECKLIST + FOTOS ─────────────────────────────────────────────

function FormularioChecklist({
  vehiculo,
  onVolver,
  toast,
  sharepointAuth: sharepointAuthProp,
  onSharepointConnected,
  onProgresoChange,
}: {
  vehiculo: Vehiculo
  onVolver: () => void
  toast: ReturnType<typeof useToast>
  sharepointAuth: boolean
  onSharepointConnected: (user: string) => void
  onProgresoChange?: (checklist: { completados: number; total: number }, fotos: { tomadas: number; total: number }, paso: number) => void
}) {
  const { sesionUsuario } = useTransferencias()
  // Ref para mantener datos de sesión disponibles en cleanup (desmontaje)
  const sesionRef = useRef({ nombre: sesionUsuario?.nombreCompleto || '', cedula: sesionUsuario?.numeroIdentificacion || '' })
  useEffect(() => {
    if (sesionUsuario) {
      sesionRef.current = { nombre: sesionUsuario.nombreCompleto, cedula: sesionUsuario.numeroIdentificacion }
    }
  }, [sesionUsuario])

  const lsKey = `${LS_KEY_CHECKLIST_PREFIX}${vehiculo.placa}`

  // Cargar estado persistido o defaults
  const estadoPersistido = leerDeLS<{
    checklist?: ChecklistVehiculo
    paso?: 1 | 2 | 3
    kilometraje?: string
    observaciones?: string
    ciudad?: string
    idVehiculo?: { blindado: string; modelo: string; color: string; combustible: string; licencia: string; linea: string; cilindraje: string; motor: string; soat: string; fechaSoat: string; rtm: string; fechaRtm: string }
    presentaNombre?: string
    presentaCedula?: string
    presentaCargo?: string
    presentaGrupo?: string
    presentaTelefono?: string
    elaboraNombre?: string
    elaboraCedula?: string
    elaboraCargo?: string
    elaboraDependencia?: string
    elaboraGrupo?: string
    fotos?: [TipoFoto, FotoCaptura][]
  } | null>(lsKey, null)

  const [checklist, setChecklist] = useState<ChecklistVehiculo>(estadoPersistido?.checklist ?? crearChecklistInicial())
  const [documentos] = useState<DocumentosVehiculo>(crearDocumentosInicial())
  const [fotos, setFotos] = useState<Map<TipoFoto, FotoCaptura>>(() => {
    if (estadoPersistido?.fotos) return new Map(estadoPersistido.fotos)
    return new Map()
  })
  const [kilometraje, setKilometraje] = useState<string>(estadoPersistido?.kilometraje ?? '')
  const [ciudad, setCiudad] = useState<string>(estadoPersistido?.ciudad ?? '')
  const [observaciones, setObservaciones] = useState(estadoPersistido?.observaciones ?? '')
  
  // Auto-sugerir ciudad a partir del servicio/regional del vehículo
  useEffect(() => {
    if (ciudad) return // No sobreescribir si ya hay valor persistido
    const svc = (vehiculo.servicio_nombre || '').toUpperCase()
    // Mapa de servicio → ciudad sugerida
    const mapaCiudades: Record<string, string> = {
      'BOGOTA': 'BOGOTÁ', 'BOGOTÁ': 'BOGOTÁ', 'SEDE PRINCIPAL': 'BOGOTÁ',
      'RIOHACHA': 'RIOHACHA', 'SANTA MARTA': 'SANTA MARTA', 'VALLEDUPAR': 'VALLEDUPAR',
      'ARMENIA': 'ARMENIA', 'BUENAVENTURA': 'BUENAVENTURA', 'MANIZALES': 'MANIZALES',
      'PEREIRA': 'PEREIRA', 'MONTERÍA': 'MONTERÍA', 'MONTERIA': 'MONTERÍA',
      'SINCELEJO': 'SINCELEJO', 'BUCARAMANGA': 'BUCARAMANGA',
      'BARRANCABERMEJA': 'BARRANCABERMEJA', 'MOCOA': 'MOCOA',
      'APARTADÓ': 'APARTADÓ', 'APARTADO': 'APARTADÓ', 'QUIBDÓ': 'QUIBDÓ', 'QUIBDO': 'QUIBDÓ',
      'IBAGUÉ': 'IBAGUÉ', 'IBAGUE': 'IBAGUÉ', 'PASTO': 'PASTO', 'TUMACO': 'TUMACO',
      'ARAUCA': 'ARAUCA', 'YOPAL': 'YOPAL', 'TUNJA': 'TUNJA',
      'BARRANQUILLA': 'BARRANQUILLA', 'CALI': 'CALI', 'CARTAGENA': 'CARTAGENA',
      'CÚCUTA': 'CÚCUTA', 'CUCUTA': 'CÚCUTA', 'FLORENCIA': 'FLORENCIA',
      'MEDELLÍN': 'MEDELLÍN', 'MEDELLIN': 'MEDELLÍN', 'NEIVA': 'NEIVA',
      'POPAYÁN': 'POPAYÁN', 'POPAYAN': 'POPAYÁN', 'VILLAVICENCIO': 'VILLAVICENCIO',
    }
    // Buscar coincidencia en el nombre del servicio
    for (const [clave, ciudadVal] of Object.entries(mapaCiudades)) {
      if (svc.includes(clave)) {
        setCiudad(ciudadVal)
        return
      }
    }
  }, [vehiculo.servicio_nombre])
  const [ubicacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [paso, setPaso] = useState<1 | 2 | 3>(estadoPersistido?.paso ?? 1)
  const [erroresCampos, setErroresCampos] = useState<Record<string, boolean>>({})

  // Modal de previsualización del PDF (mismo patrón que transferencias/inventario)
  const [pdfPreview, setPdfPreview] = useState<{ pdfDataUrl: string; nombreArchivo: string } | null>(null)

  // ─── Reportar progreso al padre para contadores ───
  useEffect(() => {
    const totalItems = Object.keys(checklist).length
    const completados = Object.values(checklist).filter(v => v !== null && v !== '').length
    onProgresoChange?.({ completados, total: totalItems }, { tomadas: fotos.size, total: 7 }, paso)
  }, [checklist, fotos.size, paso]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Heartbeat de bloqueo: renueva el TTL cada 60s mientras está en el checklist ───
  // Al desmontar (volver/cerrar), libera automáticamente el vehículo.
  useEffect(() => {
    const apiUrl = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAccessToken() || ''}`, 'BK-Service': 'api-sgai', 'Accept': 'application/json' }

    const interval = setInterval(() => {
      const ced = sesionRef.current.cedula
      if (ced && vehiculo.placa) {
        fetch(`${apiUrl}/almacen/vehiculos/heartbeat/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ placa: vehiculo.placa, cedula: ced }),
        }).catch(() => {})
      }
    }, 60_000)

    // Cleanup: al desmontar el FormularioChecklist, liberar el bloqueo SIEMPRE
    return () => {
      clearInterval(interval)
      const { nombre, cedula: ced } = sesionRef.current
      if (ced && vehiculo.placa) {
        const payload = JSON.stringify({ placa: vehiculo.placa, usuario: nombre, cedula: ced })
        const beaconUrl = `${apiUrl}/almacen/vehiculos/liberar/`
        // keepalive: true garantiza que el fetch se complete aunque la página cambie
        fetch(beaconUrl, { method: 'POST', headers, body: payload, keepalive: true }).catch(() => {})
      }
    }
  }, [vehiculo.placa])
  const [procesandoGuardado, setProcesandoGuardado] = useState(false)

  // Estado para manejar fallos de SharePoint sin perder el inventario.
  // Guarda el id del inventario una vez registrado en BD, para que el reintento
  // no vuelva a registrarlo (evita duplicados).
  const [inventarioGuardadoId, setInventarioGuardadoId] = useState<string | null>(null)
  const [sharepointUploadFailed, setSharepointUploadFailed] = useState(false)
  const [sharepointErrorMsg, setSharepointErrorMsg] = useState('')
  const [reintentandoUpload, setReintentandoUpload] = useState(false)

  // SharePoint: estado viene del componente padre (global al módulo)
  const sharepointAuth = sharepointAuthProp
  const [, setSubiendoSharepoint] = useState(false)

  // Datos de identificación del vehículo (pre-llenados desde DocumentacionVehiculo)
  const [idVehiculo, setIdVehiculo] = useState(() => {
    const defaults = {
      blindado: '', modelo: '', color: '', combustible: '',
      licencia: '', linea: '', cilindraje: '', motor: '',
      soat: '', fechaSoat: '', rtm: '', fechaRtm: '',
      marca: '', n_serie: '',
    }
    if (estadoPersistido?.idVehiculo) {
      return { ...defaults, ...estadoPersistido.idVehiculo }
    }
    return defaults
  })
  const [cargandoDocumentacion, setCargandoDocumentacion] = useState(false)
  // Campos que vienen de BD y no deben editarse
  const [camposDesdeBD, setCamposDesdeBD] = useState<Set<string>>(new Set())

  // Consultar documentación del vehículo desde la BD al montar (solo si no hay datos persistidos)
  useEffect(() => {
    const cargarDocumentacion = async () => {
      if (!vehiculo.placa) return
      // Si ya hay datos persistidos de idVehiculo, no sobreescribir
      if (estadoPersistido?.idVehiculo && estadoPersistido.idVehiculo.modelo) return
      setCargandoDocumentacion(true)
      try {
        const { documentacion } = await listarDocumentacionVehiculos(vehiculo.placa)
        const doc = documentacion.find(d => d.placa.toUpperCase() === vehiculo.placa.toUpperCase())
        if (doc) {
          const datos = {
            blindado: doc.blindaje || '',
            modelo: doc.modelo || '',
            color: doc.color || '',
            combustible: doc.combustible || '',
            licencia: doc.licencia || '',
            linea: doc.linea || '',
            cilindraje: doc.cilindraje || '',
            motor: doc.motor || '',
            soat: doc.soat || '',
            fechaSoat: doc.fecha_soat || '',
            rtm: '',
            fechaRtm: '',
            marca: doc.marca || '',
            n_serie: doc.n_serie || '',
          }
          setIdVehiculo(datos)
          // Marcar como readonly los campos que la BD sí tenía
          const desdeBD = new Set<string>()
          if (datos.blindado) desdeBD.add('blindado')
          if (datos.modelo) desdeBD.add('modelo')
          if (datos.color) desdeBD.add('color')
          if (datos.combustible) desdeBD.add('combustible')
          if (datos.licencia) desdeBD.add('licencia')
          if (datos.linea) desdeBD.add('linea')
          if (datos.cilindraje) desdeBD.add('cilindraje')
          if (datos.motor) desdeBD.add('motor')
          if (datos.soat) desdeBD.add('soat')
          if (datos.fechaSoat) desdeBD.add('fechaSoat')
          if (datos.marca) desdeBD.add('marca')
          if (datos.n_serie) desdeBD.add('n_serie')
          setCamposDesdeBD(desdeBD)
        } else {
          toast.info(`No hay documentación registrada para ${vehiculo.placa}. Complete los datos manualmente.`)
        }
      } catch { /* no bloquear si falla */ }
      setCargandoDocumentacion(false)
    }
    cargarDocumentacion()
  }, [vehiculo.placa])

  // Quien presenta el vehículo.
  // Si este vehículo no tiene datos propios persistidos, se arrastra el último
  // "quien presenta" registrado para la misma regional (la persona suele ser la
  // misma para toda la flota). El usuario puede cambiarlo buscando otro tercero.
  const lsKeyPresenta = `${LS_KEY_PRESENTA_PREFIX}${normalizarServicio(vehiculo.servicio_codigo || vehiculo.servicio_nombre)}`
  const ultimoPresenta = leerDeLS<PresentaData | null>(lsKeyPresenta, null)
  const tienePresentaPropio = !!(estadoPersistido?.presentaNombre || estadoPersistido?.presentaCedula)
  const presentaInicial: PresentaData = tienePresentaPropio
    ? {
        nombre: estadoPersistido?.presentaNombre ?? '',
        cedula: estadoPersistido?.presentaCedula ?? '',
        cargo: estadoPersistido?.presentaCargo ?? '',
        grupo: estadoPersistido?.presentaGrupo ?? '',
        telefono: estadoPersistido?.presentaTelefono ?? '',
      }
    : (ultimoPresenta ?? { nombre: '', cedula: '', cargo: '', grupo: '', telefono: '' })

  const [presentaNombre, setPresentaNombre] = useState(presentaInicial.nombre)
  const [presentaCedula, setPresentaCedula] = useState(presentaInicial.cedula)
  const [presentaCargo, setPresentaCargo] = useState(presentaInicial.cargo)
  const [presentaGrupo, setPresentaGrupo] = useState(presentaInicial.grupo)
  const [presentaTelefono, setPresentaTelefono] = useState(presentaInicial.telefono)
  // true si los datos del presentador se arrastraron de otro vehículo (no son propios de este)
  const [presentaArrastrado, setPresentaArrastrado] = useState(!tienePresentaPropio && !!ultimoPresenta)

  // Limpia los datos del presentador para registrar otra persona.
  // selectorPresentaKey fuerza remount del SelectorCoordinador para limpiar
  // su estado interno de búsqueda (el input de "Buscar por cédula o nombre").
  const [selectorPresentaKey, setSelectorPresentaKey] = useState(0)
  // Limpia SOLO los datos del presentador (los 5 campos), sin remontar el
  // selector. Se usa cuando el usuario vacía el buscador para registrar a otra
  // persona: NO debe remontarse en cada tecla, o perdería lo que escribe.
  const limpiarDatosPresenta = () => {
    setPresentaNombre('')
    setPresentaCedula('')
    setPresentaCargo('')
    setPresentaGrupo('')
    setPresentaTelefono('')
    setPresentaArrastrado(false)
  }
  // Limpia los datos Y remonta el selector (reinicia su búsqueda interna).
  // Solo para el botón explícito "Registrar otra persona".
  const limpiarPresenta = () => {
    limpiarDatosPresenta()
    setSelectorPresentaKey(k => k + 1)
  }
  // Datos de quien elabora el inventario. Prioridad de precarga:
  //   1. Lo persistido para ESTE vehículo (estadoPersistido).
  //   2. El último "elabora" corregido en esta sesión (ultimoElabora) → arrastra
  //      las correcciones de dependencia/grupo entre vehículos.
  //   3. Los datos crudos de la sesión (que a veces vienen con dependencia y
  //      grupo cruzados; por eso el usuario puede corregirlos y se arrastran).
  const ultimoElabora = leerDeLS<ElaboraData | null>(LS_KEY_ELABORA, null)
  const [elaboraNombre, setElaboraNombre] = useState(() => estadoPersistido?.elaboraNombre ?? ultimoElabora?.nombre ?? sesionUsuario?.nombreCompleto ?? '')
  const [elaboraCedula, setElaboraCedula] = useState(() => estadoPersistido?.elaboraCedula ?? ultimoElabora?.cedula ?? sesionUsuario?.numeroIdentificacion ?? '')
  const [elaboraCargo, setElaboraCargo] = useState(() => estadoPersistido?.elaboraCargo ?? ultimoElabora?.cargo ?? sesionUsuario?.cargo ?? '')
  const [elaboraDependencia, setElaboraDependencia] = useState(() => estadoPersistido?.elaboraDependencia ?? ultimoElabora?.dependencia ?? sesionUsuario?.dependencia ?? '')
  const [elaboraGrupo, setElaboraGrupo] = useState(() => estadoPersistido?.elaboraGrupo ?? ultimoElabora?.grupo ?? sesionUsuario?.grupo ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputGalleryRef = useRef<HTMLInputElement>(null)
  const [fotoActual, setFotoActual] = useState<TipoFoto | null>(null)
  const [fotoPreview, setFotoPreview] = useState<{ base64: string; label: string } | null>(null)
  const [mostrarAlertaTacometro, setMostrarAlertaTacometro] = useState(false)

  // Persistir estado del formulario en localStorage en cada render
  useEffect(() => {
    const estado = {
      checklist,
      paso,
      kilometraje,
      observaciones,
      ciudad,
      idVehiculo,
      presentaNombre,
      presentaCedula,
      presentaCargo,
      presentaGrupo,
      presentaTelefono,
      elaboraNombre,
      elaboraCedula,
      elaboraCargo,
      elaboraDependencia,
      elaboraGrupo,
      fotos: Array.from(fotos.entries()),
    }
    guardarEnLS(lsKey, estado)
  })

  // Guardar el "quien presenta" a nivel de regional para arrastrarlo a los
  // demás vehículos del mismo servicio. Solo cuando hay nombre + cédula.
  useEffect(() => {
    if (presentaNombre.trim() && presentaCedula.trim()) {
      guardarEnLS(lsKeyPresenta, {
        nombre: presentaNombre,
        cedula: presentaCedula,
        cargo: presentaCargo,
        grupo: presentaGrupo,
        telefono: presentaTelefono,
      } as PresentaData)
    }
  }, [presentaNombre, presentaCedula, presentaCargo, presentaGrupo, presentaTelefono, lsKeyPresenta])

  // Guardar el "quien elabora" para arrastrar las CORRECCIONES del inventariador
  // (p.ej. dependencia/grupo que a veces vienen cruzados en la sesión) a los
  // siguientes vehículos, hasta que las vuelva a cambiar. Solo con nombre + cédula.
  useEffect(() => {
    if (elaboraNombre.trim() && elaboraCedula.trim()) {
      guardarEnLS(LS_KEY_ELABORA, {
        nombre: elaboraNombre,
        cedula: elaboraCedula,
        cargo: elaboraCargo,
        dependencia: elaboraDependencia,
        grupo: elaboraGrupo,
      } as ElaboraData)
    }
  }, [elaboraNombre, elaboraCedula, elaboraCargo, elaboraDependencia, elaboraGrupo])

  const [itemActivo, setItemActivo] = useState<string | null>(null)

  const actualizarChecklist = (key: string, valor: string) => {
    setChecklist(prev => ({ ...prev, [key]: valor }))
    setItemActivo(key)
  }

  // Valida campos obligatorios del checklist. Marca errores en campos y retorna true si todo OK.
  const validarChecklist = (): boolean => {
    const errores: Record<string, boolean> = {}
    if (!kilometraje.trim()) errores['kilometraje'] = true
    if (!idVehiculo.rtm.trim()) errores['rtm'] = true
    if (!idVehiculo.fechaRtm.trim()) errores['fechaRtm'] = true
    if (!ciudad.trim()) errores['ciudad'] = true
    if (!presentaNombre.trim()) errores['presentaNombre'] = true
    if (!presentaTelefono.trim()) errores['presentaTelefono'] = true
    setErroresCampos(errores)
    if (Object.keys(errores).length > 0) {
      toast.error('Completa los campos marcados en rojo antes de continuar')
      // Scroll al primer error
      setTimeout(() => {
        document.querySelector('.vehiculos-campo__input--error')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return false
    }
    return true
  }


  const seleccionarTercero = async (t: { nombre: string; cedula: string }) => {
    setPresentaNombre(t.nombre)
    setPresentaCedula(t.cedula)
    setPresentaArrastrado(false)
    // Al elegir un tercero nuevo, el teléfono anterior ya no aplica (la
    // coincidencia no trae contacto): se limpia para que se capture el correcto.
    setPresentaTelefono('')
    // Limpiar errores de validación al seleccionar
    setErroresCampos(prev => ({ ...prev, presentaNombre: false, presentaTelefono: false }))
    
    // Intentar traer datos adicionales (cargo, grupo) desde la tabla de usuarios
    if (t.cedula) {
      try {
        const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
        const res = await fetch(`${API_URL}/almacen/usuario/buscar-por-cedula/?cedula=${t.cedula}`, {
          headers: { 'Authorization': `Bearer ${getAccessToken() || ''}`, 'BK-Service': 'api-sgai' }
        })
        if (res.ok) {
          const data = await res.json()
          if (data.ok) {
            if (data.cargo) setPresentaCargo(data.cargo)
            if (data.grupo) setPresentaGrupo(data.grupo)
            if (!data.cargo && !data.grupo) {
              toast.info('No se encontraron datos adicionales. Complete cargo y grupo manualmente.')
            }
          } else {
            toast.info('Persona no registrada en el sistema. Complete los datos manualmente.')
          }
        } else {
          toast.info('No se encontró información adicional. Complete los campos manualmente.')
        }
      } catch {
        toast.info('No se pudo consultar datos adicionales. Complete manualmente.')
      }
    }
  }


  const capturarFoto = (tipo: TipoFoto) => {
    setFotoActual(tipo)
    // Abre cámara en móvil/tablet
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const cargarFotoArchivo = (tipo: TipoFoto) => {
    setFotoActual(tipo)
    // Abre galería/explorador de archivos
    if (fileInputGalleryRef.current) {
      fileInputGalleryRef.current.click()
    }
  }

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !fotoActual) return

    try {
      const base64 = await comprimirImagen(file, 1920, 0.88)
      const nombreArchivo = `${vehiculo.placa}_${fotoActual}_${vehiculo.servicio_nombre || 'sin_regional'}`.replace(/\s+/g, '_')

      setFotos(prev => {
        const nuevo = new Map(prev)
        nuevo.set(fotoActual, {
          tipo_foto: fotoActual,
          imagen_base64: base64,
          nombre_archivo: `${nombreArchivo}.jpg`,
        })
        return nuevo
      })
      toast.success(`Foto "${TIPOS_FOTO.find(t => t.key === fotoActual)?.label}" capturada`)
    } catch {
      toast.error('Error procesando la imagen')
    }

    // Limpiar input
    e.target.value = ''
    setFotoActual(null)
  }, [fotoActual, vehiculo.placa, vehiculo.servicio_nombre, toast])

  const eliminarFoto = (tipo: TipoFoto) => {
    setFotos(prev => {
      const nuevo = new Map(prev)
      nuevo.delete(tipo)
      return nuevo
    })
  }

  // Genera el PDF de previsualización (NO guarda aún)
  const guardar = async () => {
    // Verificar CONEXIÓN antes de empezar: si hay fotos (se subirán a SharePoint)
    // y no hay red, avisar YA y no avanzar al modal del PDF con falsa sensación
    // de progreso. El proceso no se pierde: el usuario reconecta y reintenta.
    if (sharepointAuth && fotos.size > 0) {
      const token = await getSpAccessToken()
      const hayConexion = token ? await verificarConexionSharepoint(token) : false
      if (!hayConexion) {
        toast.error('Sin conexión a SharePoint. Conéctese a una red antes de guardar. No se perdió el inventario.')
        return
      }
    }

    setGuardando(true)

    const regionalAuto = vehiculo.servicio_nombre || ''

    try {
      const formato = await generarFormatoVehiculo({
        placa: vehiculo.placa,
        regional: ciudad.trim() || regionalAuto,
        tipo: esMoto(vehiculo.placa) ? 'moto' : 'carro',
        elabora: {
          nombre: elaboraNombre || sesionUsuario?.nombreCompleto || '',
          cedula: elaboraCedula || sesionUsuario?.numeroIdentificacion || '',
          cargo: elaboraCargo || sesionUsuario?.cargo || '',
          dependencia: elaboraDependencia || sesionUsuario?.dependencia || '',
          grupo: elaboraGrupo || sesionUsuario?.grupo || '',
        },
        presenta: {
          nombre: presentaNombre,
          cedula: presentaCedula,
          cargo: presentaCargo,
          grupo: presentaGrupo,
          telefono: presentaTelefono,
        },
        checklist,
        blindado: idVehiculo.blindado,
        modelo: idVehiculo.modelo,
        color: idVehiculo.color,
        combustible: idVehiculo.combustible,
        kilometraje: kilometraje || '',
        licencia: idVehiculo.licencia,
        linea: idVehiculo.linea,
        cilindraje: idVehiculo.cilindraje,
        motor: idVehiculo.motor,
        soat: idVehiculo.soat,
        fecha_soat: idVehiculo.fechaSoat,
        rtm: idVehiculo.rtm,
        fecha_rtm: idVehiculo.fechaRtm,
        marca: idVehiculo.marca,
        n_serie: idVehiculo.n_serie,
        observaciones: observaciones.trim(),
      })

      if (formato.ok && formato.pdf_base64) {
        const pdfDataUrl = `data:application/pdf;base64,${formato.pdf_base64}`
        setPdfPreview({ pdfDataUrl, nombreArchivo: formato.nombre_archivo || `Inventario_${vehiculo.placa}.pdf` })
      } else {
        toast.error(formato.error || 'Error generando el formato PDF')
      }
    } catch {
      toast.error('Error de conexión al generar el formato')
    }

    setGuardando(false)
  }

  // Registra el inventario en BD. Se llama SOLO después de confirmar que las
  // fotos y el PDF quedaron en SharePoint, para no marcar como inventariado un
  // vehículo cuya evidencia no se subió. Devuelve { ok, mensaje }.
  const registrarInventarioEnBD = async (): Promise<{ ok: boolean; mensaje?: string; id_inventario?: string }> => {
    const regionalAuto = ciudad.trim() || vehiculo.servicio_nombre || ''
    return registrarInventarioVehiculo({
      matid: vehiculo.matid,
      placa_vehiculo: vehiculo.placa,
      placa_inventario: vehiculo.placa,
      descripcion: vehiculo.descripcion,
      responsable_nombre: vehiculo.responsable_nombre,
      responsable_cedula: vehiculo.responsable_cedula,
      regional: regionalAuto,
      ubicacion: ubicacion.trim(),
      checklist,
      documentos,
      kilometraje: (kilometraje && kilometraje !== 'N/A') ? parseInt(kilometraje) : null,
      observaciones: observaciones.trim(),
      estado_general: (() => {
        const vals = Object.values(checklist)
        if (vals.some(v => v === 'malo' || v === 'no')) return 'malo'
        if (vals.some(v => v === 'regular')) return 'regular'
        return 'bueno'
      })(),
      realizado_por_nombre: elaboraNombre || sesionUsuario?.nombreCompleto || '',
      realizado_por_cedula: elaboraCedula || sesionUsuario?.numeroIdentificacion || '',
      fotos: Array.from(fotos.values()),
      datos_formato: {
        ciudad: ciudad.trim(),
        servicio_codigo: vehiculo.servicio_codigo || '',
        presenta: { nombre: presentaNombre, cedula: presentaCedula, cargo: presentaCargo, grupo: presentaGrupo, telefono: presentaTelefono },
        elabora: { nombre: elaboraNombre || sesionUsuario?.nombreCompleto || '', cedula: elaboraCedula || sesionUsuario?.numeroIdentificacion || '', cargo: elaboraCargo || sesionUsuario?.cargo || '', dependencia: elaboraDependencia || sesionUsuario?.dependencia || '', grupo: elaboraGrupo || sesionUsuario?.grupo || '' },
        idVehiculo: { blindado: idVehiculo.blindado, modelo: idVehiculo.modelo, color: idVehiculo.color, combustible: idVehiculo.combustible, licencia: idVehiculo.licencia, linea: idVehiculo.linea, cilindraje: idVehiculo.cilindraje, motor: idVehiculo.motor, soat: idVehiculo.soat, fechaSoat: idVehiculo.fechaSoat, rtm: idVehiculo.rtm, fechaRtm: idVehiculo.fechaRtm, marca: idVehiculo.marca, n_serie: idVehiculo.n_serie },
        checklist,
      },
    })
  }

  // Descarga local del PDF (copia para el usuario).
  const descargarPdfLocal = () => {
    if (!pdfPreview) return
    const parts = pdfPreview.pdfDataUrl.split(',')
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf'
    const bstr = atob(parts[1])
    const u8arr = new Uint8Array(bstr.length)
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
    const blob = new Blob([u8arr], { type: mime })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = pdfPreview.nombreArchivo
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  // Al descargar el PDF es cuando se guarda el inventario en BD
  const descargarPdfYGuardar = async () => {
    if (!pdfPreview) return
    setProcesandoGuardado(true)

    // 0. Validaciones de red/sesión ANTES de tocar nada (si hay fotos). Este es
    //    el punto donde más se pierde trabajo: si no hay conexión y se continúa,
    //    el guardado haría un "falso subido" y se perdería todo. Por eso aquí
    //    se ABORTA sin borrar ni navegar, y se pide reconectar.
    if (sharepointAuth && fotos.size > 0) {
      const token = await getSpAccessToken()
      if (!token) {
        setProcesandoGuardado(false)
        onSharepointConnected('')
        toast.error('La sesión de SharePoint expiró. Reconecte SharePoint e intente de nuevo. (No se perdió el inventario)')
        return
      }

      // 0.1 CONEXIÓN REAL a SharePoint (no solo navigator.onLine). Sin red →
      //     abortar sin perder el proceso.
      const hayConexion = await verificarConexionSharepoint(token)
      if (!hayConexion) {
        setProcesandoGuardado(false)
        toast.error('Sin conexión a SharePoint. Conéctese a una red e intente de nuevo. El inventario NO se perdió, puede reintentar.')
        return
      }

      // 0.2 Validar sesión MSAL y permisos de ESCRITURA reales (test upload).
      const spValido = await validateSpConnection()
      if (!spValido) {
        setProcesandoGuardado(false)
        onSharepointConnected('')
        toast.error('La sesión de SharePoint expiró. Reconecte SharePoint e intente de nuevo.')
        return
      }
      const writeTest = await testSharepointWriteAccess({
        token,
        placa: vehiculo.placa,
        servicio: vehiculo.servicio_codigo || '',
      })
      if (!writeTest.ok) {
        setProcesandoGuardado(false)
        toast.error(`⚠️ ${writeTest.error || 'No tiene permisos de escritura en SharePoint.'}`)
        return
      }
    }

    // ORDEN CRÍTICO (evitar falso positivo "inventariado" sin evidencia en
    // SharePoint): se sube PRIMERO a SharePoint (fotos + PDF) y SOLO si todo
    // quedó confirmado allá se registra en BD y se marca el vehículo como
    // inventariado. Si SharePoint falla (desconexión, internet, sesión), NO se
    // registra en BD, el vehículo sigue PENDIENTE y el usuario puede reintentar.

    // 1. Subir fotos a SharePoint y VALIDAR que subieron todas.
    let uploadOk = true
    if (sharepointAuth && fotos.size > 0) {
      setSubiendoSharepoint(true)
      try {
        const fotosArray = Array.from(fotos.entries()).map(([tipo, foto]) => ({
          tipo_foto: tipo,
          imagen_base64: foto.imagen_base64,
          nombre_archivo: `${tipo}.jpg`,
        }))

        const spResult = await subirFotosVehiculo(vehiculo.placa, fotosArray, vehiculo.servicio_codigo || '')

        if (spResult.requiereAuth) {
          uploadOk = false
          onSharepointConnected('')
          setSharepointUploadFailed(true)
          setSharepointErrorMsg('La sesión de SharePoint expiró. Reconecte y reintente la subida de fotos.')
        } else if (spResult.fallidas > 0 || spResult.exitosas < fotos.size) {
          // Falló al menos una foto → NO se puede dar por inventariado.
          uploadOk = false
          setSharepointUploadFailed(true)
          setSharepointErrorMsg(`Solo subieron ${spResult.exitosas} de ${fotos.size} fotos. Error: ${spResult.errores[0] || 'desconocido'}`)
          toast.error(`Subida incompleta: ${spResult.exitosas}/${fotos.size} fotos. No se registró el inventario.`)
        } else {
          toast.success(`${spResult.exitosas} foto(s) subidas a SharePoint`)
        }
      } catch (err: any) {
        uploadOk = false
        console.error('[SharePoint] Error:', err)
        setSharepointUploadFailed(true)
        setSharepointErrorMsg('Error de conexión con SharePoint al subir las fotos. Reintente.')
        toast.error('Error subiendo fotos a SharePoint. No se registró el inventario.')
      }
      setSubiendoSharepoint(false)
    }

    // Si las fotos no subieron, abortar ANTES de tocar la BD.
    if (!uploadOk) {
      setProcesandoGuardado(false)
      return
    }

    // 2. Subir PDF del formato a SharePoint y VALIDAR (webUrl !== null).
    if (sharepointAuth && pdfPreview?.pdfDataUrl) {
      try {
        const token = await getSpAccessToken()
        if (!token) {
          uploadOk = false
          setSharepointUploadFailed(true)
          setSharepointErrorMsg('No se obtuvo token de SharePoint para subir el PDF. Reintente.')
          toast.error('No se pudo subir el formato PDF a SharePoint. No se registró el inventario.')
        } else {
          const regional = (vehiculo.servicio_nombre || 'sin_regional').replace(/[\s/]+/g, '_').slice(0, 40)
          const nombrePdf = `${regional}_${vehiculo.placa}.pdf`
          const pdfBase64 = pdfPreview.pdfDataUrl.split(',')[1]
          const webUrl = await uploadFileToSharepoint({
            token,
            base64: pdfBase64,
            placa: vehiculo.placa,
            servicio: vehiculo.servicio_codigo || vehiculo.servicio_nombre || '',
            nombreArchivo: nombrePdf,
          })
          if (!webUrl) {
            uploadOk = false
            setSharepointUploadFailed(true)
            setSharepointErrorMsg('El formato PDF no se pudo guardar en SharePoint. Reintente.')
            toast.error('El formato PDF no quedó en SharePoint. No se registró el inventario.')
          } else {
            toast.success(`Formato PDF guardado en SharePoint: ${nombrePdf}`)
          }
        }
      } catch (err) {
        uploadOk = false
        console.error('[SharePoint] Error subiendo PDF:', err)
        setSharepointUploadFailed(true)
        setSharepointErrorMsg('Error subiendo el formato PDF a SharePoint. Reintente.')
        toast.error('Error subiendo el PDF a SharePoint. No se registró el inventario.')
      }
    }

    // Si el PDF no subió, abortar ANTES de tocar la BD.
    if (!uploadOk) {
      setProcesandoGuardado(false)
      return
    }

    // 2.5. VERIFICACIÓN FUERTE (anti falso-subido): listar la carpeta real del
    //      vehículo en SharePoint y confirmar que están TODOS los archivos
    //      esperados (cada foto + el PDF). Si Graph dijo "ok" pero la red se
    //      cortó y la carpeta no tiene todo, se ABORTA sin registrar en BD.
    if (sharepointAuth && fotos.size > 0) {
      const token = await getSpAccessToken()
      const archivosEnCarpeta = token
        ? await listarArchivosCarpeta({ token, placa: vehiculo.placa, servicio: vehiculo.servicio_codigo || vehiculo.servicio_nombre || '' })
        : null
      if (!archivosEnCarpeta) {
        setProcesandoGuardado(false)
        setSharepointUploadFailed(true)
        setSharepointErrorMsg('No se pudo verificar la carpeta en SharePoint (sin red o carpeta vacía). El inventario NO se registró; reintente.')
        toast.error('No se verificó la subida en SharePoint. El inventario NO se perdió, reintente.')
        return
      }
      // Nombres esperados: una foto por tipo (<tipo>.jpg) + el PDF.
      const regional = (vehiculo.servicio_nombre || 'sin_regional').replace(/[\s/]+/g, '_').slice(0, 40)
      const esperados = [
        ...Array.from(fotos.keys()).map((tipo) => `${tipo}.jpg`.toLowerCase()),
        `${regional}_${vehiculo.placa}.pdf`.toLowerCase(),
      ]
      const faltantes = esperados.filter((n) => !archivosEnCarpeta.has(n))
      if (faltantes.length > 0) {
        setProcesandoGuardado(false)
        setSharepointUploadFailed(true)
        setSharepointErrorMsg(`Faltan ${faltantes.length} archivo(s) en SharePoint tras la subida. El inventario NO se registró; reintente.`)
        toast.error(`Verificación fallida: faltan ${faltantes.length} archivo(s) en SharePoint. Reintente.`)
        return
      }
    }

    // 3. SharePoint confirmó TODO (y la carpeta lo verifica) → registrar en BD.
    const resultado = await registrarInventarioEnBD()

    if (!resultado.ok) {
      // SharePoint sí guardó, pero la BD falló. El vehículo NO queda inventariado;
      // el usuario puede reintentar (SharePoint sobrescribirá los mismos archivos).
      setProcesandoGuardado(false)
      setSharepointUploadFailed(true)
      setSharepointErrorMsg('Las fotos y el PDF quedaron en SharePoint, pero el registro en BD falló. Reintente para completar.')
      toast.error(resultado.mensaje ?? 'Error al registrar el inventario en BD. Reintente.')
      return
    }

    setInventarioGuardadoId(resultado.id_inventario ?? null)

    // 4. Descargar el PDF y el respaldo local de fotos (copias para el usuario).
    descargarPdfLocal()
    if (fotos.size > 0) {
      const respaldoOk = await descargarRespaldoFotosLocal(vehiculo.placa, fotos, vehiculo.servicio_nombre || '')
      if (respaldoOk) toast.info('📦 Respaldo de fotos descargado al dispositivo')
    }

    setProcesandoGuardado(false)
    toast.success('Inventario guardado: fotos y formato confirmados en SharePoint')

    // 5. Todo confirmado → cerrar y volver a la lista.
    setPdfPreview(null)
    eliminarDeLS(lsKey)
    onVolver()
  }

  // Reintentar subida de fotos a SharePoint (post-guardado)
  const reintentarUploadSharepoint = async () => {
    setReintentandoUpload(true)
    setSharepointUploadFailed(false)
    setSharepointErrorMsg('')

    // Verificar CONEXIÓN REAL antes de reintentar (no solo navigator.onLine).
    const tokenConn = await getSpAccessToken()
    const hayConexion = tokenConn ? await verificarConexionSharepoint(tokenConn) : false
    if (!hayConexion) {
      setSharepointUploadFailed(true)
      setSharepointErrorMsg('Sin conexión a SharePoint. Conéctese a una red e intente de nuevo.')
      setReintentandoUpload(false)
      toast.error('Sin conexión a SharePoint. El proceso no se perdió, reintente al reconectar.')
      return
    }

    // Validar sesión
    const spValido = await validateSpConnection()
    if (!spValido) {
      setSharepointUploadFailed(true)
      setSharepointErrorMsg('La sesión de SharePoint sigue inválida. Reconecte SharePoint.')
      setReintentandoUpload(false)
      toast.error('Sesión de SharePoint inválida. Use "Conectar SharePoint" primero.')
      return
    }

    let uploadOk = true

    // Subir fotos
    if (fotos.size > 0) {
      try {
        const fotosArray = Array.from(fotos.entries()).map(([tipo, foto]) => ({
          tipo_foto: tipo,
          imagen_base64: foto.imagen_base64,
          nombre_archivo: `${tipo}.jpg`,
        }))

        const spResult = await subirFotosVehiculo(vehiculo.placa, fotosArray, vehiculo.servicio_codigo || '')

        if (spResult.requiereAuth) {
          uploadOk = false
          onSharepointConnected('')
          setSharepointUploadFailed(true)
          setSharepointErrorMsg('La sesión de SharePoint expiró. Reconecte y reintente.')
        } else if (spResult.exitosas > 0 && spResult.fallidas === 0) {
          toast.success(`${spResult.exitosas} foto(s) subidas a SharePoint correctamente`)
        } else if (spResult.exitosas > 0) {
          uploadOk = false
          setSharepointUploadFailed(true)
          setSharepointErrorMsg(`${spResult.exitosas} subidas, ${spResult.fallidas} fallaron: ${spResult.errores[0]}`)
        } else {
          uploadOk = false
          setSharepointUploadFailed(true)
          setSharepointErrorMsg(`No se pudieron subir las fotos: ${spResult.errores[0] || 'Error desconocido'}`)
        }
      } catch (_err: any) {
        uploadOk = false
        setSharepointUploadFailed(true)
        setSharepointErrorMsg('Error de conexión con SharePoint al reintentar.')
      }
    }

    // Subir PDF si las fotos fueron OK, validando que realmente quedó (webUrl).
    if (uploadOk && pdfPreview?.pdfDataUrl) {
      try {
        const token = await getSpAccessToken()
        if (!token) {
          uploadOk = false
          setSharepointUploadFailed(true)
          setSharepointErrorMsg('No se obtuvo token de SharePoint para el PDF. Reintente.')
        } else {
          const regional = (vehiculo.servicio_nombre || 'sin_regional').replace(/[\s/]+/g, '_').slice(0, 40)
          const nombrePdf = `${regional}_${vehiculo.placa}.pdf`
          const pdfBase64 = pdfPreview.pdfDataUrl.split(',')[1]
          const webUrl = await uploadFileToSharepoint({
            token,
            base64: pdfBase64,
            placa: vehiculo.placa,
            servicio: vehiculo.servicio_codigo || vehiculo.servicio_nombre || '',
            nombreArchivo: nombrePdf,
          })
          if (!webUrl) {
            uploadOk = false
            setSharepointUploadFailed(true)
            setSharepointErrorMsg('El formato PDF no se pudo guardar en SharePoint. Reintente.')
          } else {
            toast.success(`PDF subido a SharePoint: ${nombrePdf}`)
          }
        }
      } catch {
        uploadOk = false
        setSharepointUploadFailed(true)
        setSharepointErrorMsg('Error subiendo el PDF a SharePoint al reintentar.')
      }
    }

    // Si SharePoint quedó completo y el inventario NO estaba registrado en BD
    // (porque el guardado abortó antes de llegar a BD), registrarlo ahora.
    if (uploadOk && !inventarioGuardadoId) {
      const resultado = await registrarInventarioEnBD()
      if (!resultado.ok) {
        uploadOk = false
        setSharepointUploadFailed(true)
        setSharepointErrorMsg('SharePoint OK, pero el registro en BD falló. Reintente.')
        toast.error(resultado.mensaje ?? 'Error al registrar el inventario en BD.')
      } else {
        setInventarioGuardadoId(resultado.id_inventario ?? null)
      }
    }

    setReintentandoUpload(false)

    // Si todo salió bien ahora (SharePoint + BD), descargar copias y volver.
    if (uploadOk) {
      descargarPdfLocal()
      toast.success('Inventario completado: fotos y formato confirmados en SharePoint')
      setPdfPreview(null)
      eliminarDeLS(lsKey)
      onVolver()
    }
  }

  // Salir SIN completar la subida. Con el nuevo flujo, si SharePoint falló el
  // inventario NO quedó registrado en BD: el vehículo sigue PENDIENTE y deberá
  // volver a inventariarse. Se avisa claramente para evitar falsos positivos.
  const salirSinSubirFotos = () => {
    toast.warning('El inventario NO se completó: la evidencia no se subió a SharePoint. El vehículo sigue pendiente.')
    setPdfPreview(null)
    eliminarDeLS(lsKey)
    onVolver()
  }

  const cerrarPreview = () => {
    setPdfPreview(null)
  }

  return (
    <div className="vehiculos-checklist">
      {/* Inputs file ocultos - uno para cámara, otro para archivo */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <input
        ref={fileInputGalleryRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Alerta: tomar foto del tablero/tacómetro tras ingresar kilometraje */}
      {mostrarAlertaTacometro && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'modalSlideUp 0.2s ease',
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '1.5rem 2rem',
            maxWidth: '380px', width: '90%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📸</div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#303d50' }}>
              Foto del tacómetro
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#5c6474', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
              Aproveche que el vehículo está encendido para tomar la foto del tablero con el kilometraje visible.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setMostrarAlertaTacometro(false)
                  capturarFoto('tablero')
                }}
                style={{
                  padding: '0.6rem 1.3rem', border: 'none', borderRadius: '8px',
                  fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                  background: '#303d50', color: 'white',
                  boxShadow: '0 4px 12px rgba(48,61,80,0.3)',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                Tomar foto ahora
              </button>
              <button
                onClick={() => setMostrarAlertaTacometro(false)}
                style={{
                  padding: '0.6rem 1.1rem', border: '1.5px solid #dee2e6', borderRadius: '8px',
                  fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                  background: 'white', color: '#5c6474',
                }}
              >
                Después
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header del vehículo */}
      <div className="vehiculos-checklist__header-card">
        <button className="vehiculos-checklist__volver" onClick={onVolver}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Volver
        </button>
        <div className="vehiculos-checklist__header-body">
          {/* Placa estilo matrícula colombiana (amarilla, franja COLOMBIA). */}
          <div style={{
            flexShrink: 0, borderRadius: 7, overflow: 'hidden',
            border: '2.5px solid #1a1a1a', background: '#f5c518',
            boxShadow: '0 2px 5px rgba(0,0,0,0.18)', minWidth: 96,
          }}>
            <div style={{ background: '#1a1a1a', color: '#f5c518', textAlign: 'center', fontSize: '0.42rem', fontWeight: 800, letterSpacing: '0.26em', padding: '1px 0' }}>
              COLOMBIA
            </div>
            <div style={{ textAlign: 'center', color: '#1a1a1a', fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.05em', padding: '2px 8px 4px', fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
              {vehiculo.placa}
            </div>
          </div>
          <div className="vehiculos-checklist__header-datos">
            <span className="vehiculos-checklist__header-desc">{vehiculo.descripcion || 'Sin descripción'}</span>
            <span className="vehiculos-checklist__header-meta">
              {vehiculo.responsable_nombre || 'Sin responsable'} · {vehiculo.servicio_nombre || 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Stepper premium */}
      <div className="vehiculos-stepper">
        {[
          { num: 1, label: 'Checklist', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
          { num: 2, label: `Fotos (${fotos.size}/7)`, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> },
          { num: 3, label: 'Resumen', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
        ].map((step, idx) => {
          const completado = paso > step.num
          const activo = paso === step.num
          return (
            <div key={step.num} className="vehiculos-stepper__item">
              {idx > 0 && (
                <div className={`vehiculos-stepper__linea ${paso > step.num ? 'vehiculos-stepper__linea--completada' : paso === step.num ? 'vehiculos-stepper__linea--activa' : ''}`} />
              )}
              <button
                type="button"
                className={`vehiculos-stepper__circulo ${activo ? 'vehiculos-stepper__circulo--activo' : ''} ${completado ? 'vehiculos-stepper__circulo--completado' : ''}`}
                onClick={() => {
                  if (step.num < paso) { setPaso(step.num as 1 | 2 | 3); return }
                  if (step.num === 2 && paso === 1) {
                    if (!validarChecklist()) return
                  }
                  if (step.num === 3 && paso <= 2) {
                    if (paso === 1 && !validarChecklist()) return
                    if (fotos.size === 0) { toast.error('Debe registrar al menos una foto antes de continuar'); return }
                  }
                  setPaso(step.num as 1 | 2 | 3)
                }}
              >
                {completado ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : step.icon}
              </button>
              <span className={`vehiculos-stepper__label ${activo ? 'vehiculos-stepper__label--activo' : ''} ${completado ? 'vehiculos-stepper__label--completado' : ''}`}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* PASO 1: CHECKLIST */}
      {paso === 1 && (
        <div className="vehiculos-checklist__cuerpo">
          {/* Ciudad donde se realiza el inventario */}
          <fieldset className="vehiculos-fieldset vehiculos-fieldset--lugar">
            <legend className="vehiculos-fieldset__legend"><FaLocationDot className="vehiculos-fieldset__icon" /> Lugar del Inventario</legend>
            <div className="vehiculos-fieldset__grid vehiculos-fieldset__grid--3col">
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Ciudad <span style={{color:'#d13c47'}}>*</span></label>
                <input
                  className={`vehiculos-campo__input${erroresCampos['ciudad'] ? ' vehiculos-campo__input--error' : ''}`}
                  value={ciudad}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').toUpperCase()
                    setCiudad(val)
                    if (val.trim()) setErroresCampos(p => ({...p, ciudad: false}))
                  }}
                  placeholder="BOGOTÁ, MEDELLÍN..."
                  maxLength={40}
                />
              </div>
            </div>
          </fieldset>

          {/* Datos de identificación del vehículo (pre-llenados desde BD) */}
          <fieldset className="vehiculos-fieldset vehiculos-fieldset--vehiculo">
            <legend className="vehiculos-fieldset__legend">
              <FaCarSide className="vehiculos-fieldset__icon" />
              Datos de Identificación del Vehículo
              {cargandoDocumentacion && <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '0.5rem' }}>(cargando...)</span>}
            </legend>
            <div className="vehiculos-fieldset__grid vehiculos-fieldset__grid--3col">
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">N° Placa</label>
                <input className="vehiculos-campo__input vehiculos-campo__input--readonly" value={vehiculo.placa} readOnly />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Convencional / Blindado</label>
                <select
                  className="vehiculos-campo__select"
                  value={idVehiculo.blindado}
                  onChange={(e) => setIdVehiculo(prev => ({ ...prev, blindado: e.target.value }))}
                  disabled={camposDesdeBD.has('blindado')}
                  style={camposDesdeBD.has('blindado') ? {background:'#e2e8f0',color:'#475569',cursor:'default'} : {}}
                >
                  <option value="">—</option>
                  <option value="NO">Convencional</option>
                  <option value="SI">Blindado</option>
                </select>
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Modelo (año)</label>
                <input
                  className={`vehiculos-campo__input${camposDesdeBD.has('modelo') ? ' vehiculos-campo__input--readonly' : ''}`}
                  value={idVehiculo.modelo}
                  onChange={(e) => setIdVehiculo(prev => ({ ...prev, modelo: e.target.value }))}
                  readOnly={camposDesdeBD.has('modelo')}
                  placeholder="2024"
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Color</label>
                <input className={`vehiculos-campo__input${camposDesdeBD.has('color') ? ' vehiculos-campo__input--readonly' : ''}`} value={idVehiculo.color} onChange={(e) => setIdVehiculo(prev => ({ ...prev, color: e.target.value }))} readOnly={camposDesdeBD.has('color')} placeholder="BLANCO" />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Tipo de Combustible</label>
                <select
                  className="vehiculos-campo__select"
                  value={idVehiculo.combustible}
                  onChange={(e) => setIdVehiculo(prev => ({ ...prev, combustible: e.target.value }))}
                  disabled={camposDesdeBD.has('combustible')}
                  style={camposDesdeBD.has('combustible') ? {background:'#e2e8f0',color:'#475569',cursor:'default'} : {}}
                >
                  <option value="">—</option>
                  <option value="GASOLINA">Gasolina</option>
                  <option value="DIESEL">Diesel</option>
                  <option value="GAS">Gas</option>
                  <option value="ELECTRICO">Eléctrico</option>
                  <option value="HIBRIDO">Híbrido</option>
                </select>
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Kilometraje <span style={{color:'#d13c47'}}>*</span></label>
                <input
                  className={`vehiculos-campo__input${erroresCampos['kilometraje'] ? ' vehiculos-campo__input--error' : ''}`}
                  type="text"
                  value={kilometraje}
                  onChange={(e) => {
                    let val = e.target.value.toUpperCase()
                    // Auto-completar N/A SOLO al escribir (longitud creciente). Si el
                    // usuario está BORRANDO no se auto-completa, para poder vaciar el
                    // campo (antes "N" se re-expandía a "N/" y quedaba atascado).
                    const borrando = val.length < kilometraje.length
                    if (!borrando && val === 'N') val = 'N/'
                    // Permitir vacío, pasos de N/A o solo números.
                    if (val === '' || val === 'N' || val === 'N/' || val === 'N/A' || /^\d+$/.test(val)) {
                      setKilometraje(val)
                      if (val.trim()) setErroresCampos(p => ({...p, kilometraje: false}))
                    }
                  }}
                  onBlur={() => {
                    // Al salir del campo: si hay kilometraje numérico y no tiene foto del tablero, sugerir tomarla
                    if (kilometraje && /^\d+$/.test(kilometraje) && !fotos.has('tablero')) {
                      setMostrarAlertaTacometro(true)
                    }
                  }}
                  placeholder="45000 o N/A"
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Licencia de Tránsito N°</label>
                <input className={`vehiculos-campo__input${camposDesdeBD.has('licencia') ? ' vehiculos-campo__input--readonly' : ''}`} value={idVehiculo.licencia} onChange={(e) => setIdVehiculo(prev => ({ ...prev, licencia: e.target.value }))} readOnly={camposDesdeBD.has('licencia')} placeholder="Número de licencia" />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Marca</label>
                <input className={`vehiculos-campo__input${camposDesdeBD.has('marca') ? ' vehiculos-campo__input--readonly' : ''}`} value={idVehiculo.marca} onChange={(e) => setIdVehiculo(prev => ({ ...prev, marca: e.target.value }))} readOnly={camposDesdeBD.has('marca')} placeholder="SUZUKI, CHEVROLET..." />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Línea</label>
                <input className={`vehiculos-campo__input${camposDesdeBD.has('linea') ? ' vehiculos-campo__input--readonly' : ''}`} value={idVehiculo.linea} onChange={(e) => setIdVehiculo(prev => ({ ...prev, linea: e.target.value }))} readOnly={camposDesdeBD.has('linea')} placeholder="TAHOE, X-TRAIL..." />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Cilindraje</label>
                <input className={`vehiculos-campo__input${camposDesdeBD.has('cilindraje') ? ' vehiculos-campo__input--readonly' : ''}`} value={idVehiculo.cilindraje} onChange={(e) => setIdVehiculo(prev => ({ ...prev, cilindraje: e.target.value }))} readOnly={camposDesdeBD.has('cilindraje')} placeholder="3000" />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">N° Motor</label>
                <input className={`vehiculos-campo__input${camposDesdeBD.has('motor') ? ' vehiculos-campo__input--readonly' : ''}`} value={idVehiculo.motor} onChange={(e) => setIdVehiculo(prev => ({ ...prev, motor: e.target.value }))} readOnly={camposDesdeBD.has('motor')} placeholder="Número de motor" />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">SOAT N°</label>
                <input className="vehiculos-campo__input" value={idVehiculo.soat} onChange={(e) => setIdVehiculo(prev => ({ ...prev, soat: e.target.value }))} placeholder="Número SOAT" />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Fecha Vencimiento SOAT</label>
                <input
                  className="vehiculos-campo__input"
                  value={idVehiculo.fechaSoat}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, '').slice(0, 8)
                    const formatted = v.length > 4 ? `${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}` : v.length > 2 ? `${v.slice(0,2)}/${v.slice(2)}` : v
                    setIdVehiculo(prev => ({ ...prev, fechaSoat: formatted }))
                  }}
                  placeholder="DD/MM/YYYY"
                  maxLength={10}
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Certificado Técnico Mecánico N° <span style={{color:'#d13c47'}}>*</span></label>
                <input
                  className={`vehiculos-campo__input${erroresCampos['rtm'] ? ' vehiculos-campo__input--error' : ''}`}
                  value={idVehiculo.rtm}
                  maxLength={20}
                  onChange={(e) => {
                    let val = e.target.value.toUpperCase().slice(0, 20)
                    // Auto-completar N/A SOLO al escribir (no al borrar), para
                    // poder vaciar el campo sin que "N" se re-expanda a "N/".
                    const borrando = val.length < idVehiculo.rtm.length
                    if (!borrando && val === 'N') val = 'N/'
                    // Permitir vacío, pasos de N/A o solo números (máx. 20).
                    if (val === '' || val === 'N' || val === 'N/' || val === 'N/A' || /^\d+$/.test(val)) {
                      setIdVehiculo(prev => ({ ...prev, rtm: val }))
                      if (val.trim()) setErroresCampos(p => ({...p, rtm: false}))
                    }
                  }}
                  placeholder="Número RTM o N/A"
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Fecha Vencimiento RTM <span style={{color:'#d13c47'}}>*</span></label>
                <input
                  className={`vehiculos-campo__input${erroresCampos['fechaRtm'] ? ' vehiculos-campo__input--error' : ''}`}
                  value={idVehiculo.fechaRtm}
                  onChange={(e) => {
                    const raw = e.target.value.toUpperCase()
                    // Auto-completar N/A
                    if (raw === 'N') {
                      setIdVehiculo(prev => ({ ...prev, fechaRtm: 'N/' }))
                      if ('N/'.trim()) setErroresCampos(p => ({...p, fechaRtm: false}))
                      return
                    }
                    // Permitir N/A
                    if (raw === '' || raw === 'N/' || raw === 'N/A') {
                      setIdVehiculo(prev => ({ ...prev, fechaRtm: raw }))
                      if (raw.trim()) setErroresCampos(p => ({...p, fechaRtm: false}))
                      return
                    }
                    // Formato fecha DD/MM/YYYY
                    const v = raw.replace(/[^\d]/g, '').slice(0, 8)
                    const formatted = v.length > 4 ? `${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}` : v.length > 2 ? `${v.slice(0,2)}/${v.slice(2)}` : v
                    setIdVehiculo(prev => ({ ...prev, fechaRtm: formatted }))
                    if (formatted.trim()) setErroresCampos(p => ({...p, fechaRtm: false}))
                  }}
                  placeholder="DD/MM/YYYY o N/A"
                  maxLength={10}
                />
              </div>
            </div>
          </fieldset>

          {/* Datos: Quien elabora + Quien presenta (mitad y mitad) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Quien elabora el inventario */}
          <fieldset className="vehiculos-fieldset vehiculos-fieldset--elabora">
            <legend className="vehiculos-fieldset__legend">
              <FaPenToSquare className="vehiculos-fieldset__icon" />
              Datos de quien elabora el inventario
            </legend>
            <div className="vehiculos-fieldset__grid">
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Nombres y Apellidos</label>
                <input
                  className="vehiculos-campo__input"
                  value={elaboraNombre}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').toUpperCase()
                    setElaboraNombre(val)
                  }}
                  placeholder="APELLIDO APELLIDO NOMBRE"
                  maxLength={50}
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">N° Cédula</label>
                <input
                  className="vehiculos-campo__input"
                  value={elaboraCedula}
                  onChange={(e) => setElaboraCedula(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="1007436245"
                  maxLength={10}
                  inputMode="numeric"
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Cargo</label>
                <input
                  className="vehiculos-campo__input"
                  value={elaboraCargo}
                  onChange={(e) => setElaboraCargo(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s]/g, ''))}
                  placeholder="Técnico, Profesional..."
                  maxLength={40}
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Dependencia</label>
                <input
                  className="vehiculos-campo__input"
                  value={elaboraDependencia}
                  onChange={(e) => setElaboraDependencia(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s]/g, ''))}
                  placeholder="Subdirección, Dirección..."
                  maxLength={60}
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Grupo interno de trabajo</label>
                <input
                  className="vehiculos-campo__input"
                  value={elaboraGrupo}
                  onChange={(e) => setElaboraGrupo(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''))}
                  placeholder="GAG, GSE..."
                  maxLength={40}
                />
              </div>
            </div>
          </fieldset>

          {/* Quien presenta el vehículo */}
          <fieldset className="vehiculos-fieldset vehiculos-fieldset--presenta">
            <legend className="vehiculos-fieldset__legend">
              <FaUser className="vehiculos-fieldset__icon" />
              Quien presenta el vehículo
            </legend>
            {presentaArrastrado && (presentaNombre || presentaCedula) && (
              <div className="vehiculos-presenta-hint">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <FaArrowRotateRight size={12} />
                  Datos tomados del vehículo anterior de esta regional.
                </span>
                <button type="button" className="vehiculos-presenta-hint__btn" onClick={limpiarPresenta}>
                  Registrar otra persona
                </button>
              </div>
            )}
            <div className="vehiculos-campo" style={{ marginBottom: '0.75rem' }}>
              <FloatingField label="Buscar por cédula o nombre" required={false} tieneValor={true}>
                <SelectorCoordinador
                  key={selectorPresentaKey}
                  valor={presentaCedula}
                  onChange={(cedula) => {
                    // Si el buscador queda vacío (p. ej. el usuario empieza a
                    // escribir letras para buscar a OTRA persona), limpiar los 5
                    // campos SIN remontar el selector. Antes se llamaba a
                    // limpiarPresenta() que cambiaba la key y remontaba el
                    // componente en cada tecla, impidiendo seguir escribiendo.
                    if (!cedula.trim()) {
                      limpiarDatosPresenta()
                    } else {
                      setPresentaCedula(cedula)
                    }
                  }}
                  onSeleccionar={(t) => void seleccionarTercero(t)}
                  placeholder="Escriba cédula o nombre (mín. 3 caracteres)..."
                />
              </FloatingField>
            </div>
            <div className="vehiculos-fieldset__grid">
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Nombres y Apellidos <span style={{color:'#d13c47'}}>*</span></label>
                <input
                  className={`vehiculos-campo__input${erroresCampos['presentaNombre'] ? ' vehiculos-campo__input--error' : ''}`}
                  value={presentaNombre}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').toUpperCase()
                    setPresentaNombre(val)
                    if (val.trim()) setErroresCampos(p => ({...p, presentaNombre: false}))
                  }}
                  placeholder="APELLIDO APELLIDO NOMBRE"
                  maxLength={50}
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">N° Cédula</label>
                <input
                  className="vehiculos-campo__input"
                  value={presentaCedula}
                  onChange={(e) => setPresentaCedula(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="1007436245"
                  maxLength={10}
                  inputMode="numeric"
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Cargo</label>
                <input
                  className="vehiculos-campo__input"
                  value={presentaCargo}
                  onChange={(e) => setPresentaCargo(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s]/g, ''))}
                  placeholder="Conductor, Escolta..."
                  maxLength={30}
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Grupo interno de trabajo</label>
                <input
                  className="vehiculos-campo__input"
                  value={presentaGrupo}
                  onChange={(e) => setPresentaGrupo(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''))}
                  placeholder="GAG, GSE..."
                  maxLength={40}
                />
              </div>
              <div className="vehiculos-campo">
                <label className="vehiculos-campo__label">Teléfono de contacto <span style={{color:'#d13c47'}}>*</span></label>
                <input
                  className={`vehiculos-campo__input${erroresCampos['presentaTelefono'] ? ' vehiculos-campo__input--error' : ''}`}
                  value={presentaTelefono}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setPresentaTelefono(val)
                    if (val.trim()) setErroresCampos(p => ({...p, presentaTelefono: false}))
                  }}
                  placeholder="3001234567"
                  maxLength={10}
                  inputMode="numeric"
                />
              </div>
            </div>
          </fieldset>
          </div>

          {/* Checklist por secciones — 2 columnas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {(esMoto(vehiculo.placa) ? CHECKLIST_MOTO_SECCIONES : CHECKLIST_SECCIONES).map((seccion) => (
            <fieldset key={seccion.titulo} className="vehiculos-fieldset">
              <legend className="vehiculos-fieldset__legend">{seccion.titulo}</legend>
              <div className="vehiculos-checklist-grid">
                {seccion.items.map((item) => {
                  const tieneEstado = 'tieneEstado' in item && item.tieneEstado
                  return (
                    <div key={item.key} className={`vehiculos-checklist-item ${itemActivo === item.key ? 'vehiculos-checklist-item--activo' : ''}`}>
                      <span className="vehiculos-checklist-item__label">{item.label}</span>
                      <div className="vehiculos-checklist-item__opciones">
                        {tieneEstado ? (
                          /* Items con estado B/R/M */
                          <>
                            {(['bueno', 'regular', 'malo', 'na'] as const).map((estado) => (
                              <button
                                key={estado}
                                type="button"
                                className={`vehiculos-estado-btn vehiculos-estado-btn--${estado} ${checklist[item.key] === estado ? 'vehiculos-estado-btn--seleccionado' : ''}`}
                                onClick={() => actualizarChecklist(item.key, estado)}
                              >
                                {estado === 'bueno' ? 'B' : estado === 'regular' ? 'R' : estado === 'malo' ? 'M' : 'N/A'}
                              </button>
                            ))}
                          </>
                        ) : (
                          /* Items con √/X/N/A */
                          <>
                            {(['si', 'no', 'na'] as const).map((estado) => (
                              <button
                                key={estado}
                                type="button"
                                className={`vehiculos-estado-btn vehiculos-estado-btn--${estado} ${checklist[item.key] === estado ? 'vehiculos-estado-btn--seleccionado' : ''}`}
                                onClick={() => actualizarChecklist(item.key, estado)}
                              >
                                {estado === 'si' ? '✓' : estado === 'no' ? 'X' : 'N/A'}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          ))}
          </div>

          {/* Observaciones */}
          <fieldset className="vehiculos-fieldset">
            <legend className="vehiculos-fieldset__legend">Observaciones</legend>
            <textarea
              className="vehiculos-campo__textarea"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value.toUpperCase().slice(0, 300))}
              placeholder="OBSERVACIONES GENERALES SOBRE EL ESTADO DEL VEHICULO..."
              rows={3}
              maxLength={300}
              style={{ textTransform: 'uppercase' }}
            />
            <div style={{ textAlign: 'right', fontSize: '0.7rem', color: observaciones.length > 270 ? '#d13c47' : '#94a3b8', marginTop: '0.2rem' }}>
              {observaciones.length}/300
            </div>
          </fieldset>

          <div className="vehiculos-checklist__acciones">
            <button
              className="vehiculos-btn vehiculos-btn--primary"
              onClick={() => { if (validarChecklist()) setPaso(2) }}
            >
              Siguiente: Fotos &rarr;
            </button>
          </div>
        </div>
      )}

      {/* PASO 2: FOTOS */}
      {paso === 2 && (
        <div className="vehiculos-fotos">
          <p className="vehiculos-fotos__instruccion">
            Capture las fotos del vehículo. Puede usar la cámara del dispositivo o seleccionar archivos existentes.
          </p>

          <div className="vehiculos-fotos-grid">
            {TIPOS_FOTO.map(({ key, label }) => {
              const foto = fotos.get(key)
              return (
                <div key={key} className={`vehiculos-foto-slot ${foto ? 'vehiculos-foto-slot--capturada' : ''}`}>
                  {foto ? (
                    <>
                      <img
                        src={`data:image/jpeg;base64,${foto.imagen_base64}`}
                        alt={label}
                        className="vehiculos-foto-slot__imagen"
                        onClick={(e) => { e.stopPropagation(); setFotoPreview({ base64: foto.imagen_base64, label }) }}
                      />
                      <div className="vehiculos-foto-slot__overlay">
                        <span className="vehiculos-foto-slot__label">{label}</span>
                        <div className="vehiculos-foto-slot__acciones">
                          <button className="vehiculos-foto-slot__btn vehiculos-foto-slot__btn--ver" onClick={(e) => { e.stopPropagation(); setFotoPreview({ base64: foto.imagen_base64, label }) }}>
                            Ver
                          </button>
                          <button className="vehiculos-foto-slot__btn" onClick={() => capturarFoto(key)}>
                            Cámara
                          </button>
                          <button className="vehiculos-foto-slot__btn" onClick={() => cargarFotoArchivo(key)}>
                            Archivo
                          </button>
                          <button className="vehiculos-foto-slot__btn vehiculos-foto-slot__btn--eliminar" onClick={() => eliminarFoto(key)}>
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="vehiculos-foto-slot__vacio">
                      <span className="vehiculos-foto-slot__label">{label}</span>
                      <div className="vehiculos-foto-slot__botones">
                        <button className="vehiculos-foto-slot__btn-captura" onClick={() => capturarFoto(key)}>
                          <span>&#128247;</span> Cámara
                        </button>
                        <button className="vehiculos-foto-slot__btn-archivo" onClick={() => cargarFotoArchivo(key)}>
                          <span>&#128193;</span> Archivo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Modal previsualización de foto */}
          {fotoPreview && (
            <div className="vehiculos-foto-modal" onClick={() => setFotoPreview(null)}>
              <div className="vehiculos-foto-modal__content" onClick={(e) => e.stopPropagation()}>
                <div className="vehiculos-foto-modal__header">
                  <span>{fotoPreview.label}</span>
                  <button className="vehiculos-foto-modal__cerrar" onClick={() => setFotoPreview(null)}>&times;</button>
                </div>
                <img
                  src={`data:image/jpeg;base64,${fotoPreview.base64}`}
                  alt={fotoPreview.label}
                  className="vehiculos-foto-modal__img"
                />
              </div>
            </div>
          )}

          <div className="vehiculos-checklist__acciones">
            <button className="vehiculos-btn vehiculos-btn--secundario" onClick={() => setPaso(1)}>
              &larr; Checklist
            </button>
            <button
              className="vehiculos-btn vehiculos-btn--primary"
              onClick={() => {
                if (fotos.size === 0) {
                  toast.error('Debe registrar al menos una foto antes de continuar')
                  return
                }
                setPaso(3)
              }}
            >
              Siguiente: Resumen &rarr;
            </button>
          </div>
        </div>
      )}

      {/* PASO 3: RESUMEN Y GUARDAR */}
      {paso === 3 && (
        <div className="vehiculos-resumen">
          <h5 className="vehiculos-resumen__titulo">Resumen del Inventario</h5>

          <div className="vehiculos-resumen__grid">
            <div className="vehiculos-resumen__item">
              <span className="vehiculos-resumen__label">Vehículo</span>
              <span className="vehiculos-resumen__valor">{vehiculo.placa} - {vehiculo.descripcion}</span>
            </div>
            <div className="vehiculos-resumen__item">
              <span className="vehiculos-resumen__label">Regional</span>
              <span className="vehiculos-resumen__valor">{vehiculo.servicio_nombre || 'No especificada'}</span>
            </div>
            <div className="vehiculos-resumen__item">
              <span className="vehiculos-resumen__label">Kilometraje</span>
              <span className="vehiculos-resumen__valor">{kilometraje ? `${parseInt(kilometraje).toLocaleString()} km` : 'No registrado'}</span>
            </div>
            <div className="vehiculos-resumen__item">
              <span className="vehiculos-resumen__label">Fotos capturadas</span>
              <span className="vehiculos-resumen__valor">{fotos.size} de {TIPOS_FOTO.length}</span>
            </div>
          </div>

          {/* Resumen informativo del checklist */}
          <div className="vehiculos-resumen__checklist">
            <h6>Partes y Accesorios</h6>
            {(() => {
              const secciones = esMoto(vehiculo.placa) ? CHECKLIST_MOTO_SECCIONES : CHECKLIST_SECCIONES
              const valores = Object.values(checklist)
              const total = valores.length
              const totalBien = valores.filter(v => v === 'si' || v === 'bueno').length
              const totalRegular = valores.filter(v => v === 'regular').length
              const totalMalo = valores.filter(v => v === 'no' || v === 'malo').length
              const totalNa = valores.filter(v => v === 'na').length

              return (
                <div className="vehiculos-resumen__tabla-partes">
                  <table>
                    <thead>
                      <tr>
                        <th>Sección</th>
                        <th className="vehiculos-resumen__col-estado">Bien</th>
                        <th className="vehiculos-resumen__col-estado">Regular</th>
                        <th className="vehiculos-resumen__col-estado">Malo</th>
                        <th className="vehiculos-resumen__col-estado">N/A</th>
                      </tr>
                    </thead>
                    <tbody>
                      {secciones.map((sec) => {
                        const bien = sec.items.filter((it: { key: string }) => { const v = checklist[it.key]; return v === 'si' || v === 'bueno' }).length
                        const regular = sec.items.filter((it: { key: string }) => checklist[it.key] === 'regular').length
                        const malo = sec.items.filter((it: { key: string }) => { const v = checklist[it.key]; return v === 'no' || v === 'malo' }).length
                        const na = sec.items.filter((it: { key: string }) => checklist[it.key] === 'na').length
                        return (
                          <tr key={sec.titulo}>
                            <td>{sec.titulo}</td>
                            <td className="vehiculos-resumen__col-estado"><span className="vehiculos-resumen__num vehiculos-resumen__num--bien">{bien}</span></td>
                            <td className="vehiculos-resumen__col-estado"><span className={`vehiculos-resumen__num ${regular > 0 ? 'vehiculos-resumen__num--regular' : ''}`}>{regular}</span></td>
                            <td className="vehiculos-resumen__col-estado"><span className={`vehiculos-resumen__num ${malo > 0 ? 'vehiculos-resumen__num--malo' : ''}`}>{malo}</span></td>
                            <td className="vehiculos-resumen__col-estado"><span className="vehiculos-resumen__num">{na}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td><strong>Total ({total})</strong></td>
                        <td className="vehiculos-resumen__col-estado"><strong className="vehiculos-resumen__num vehiculos-resumen__num--bien">{totalBien}</strong></td>
                        <td className="vehiculos-resumen__col-estado"><strong className={`vehiculos-resumen__num ${totalRegular > 0 ? 'vehiculos-resumen__num--regular' : ''}`}>{totalRegular}</strong></td>
                        <td className="vehiculos-resumen__col-estado"><strong className={`vehiculos-resumen__num ${totalMalo > 0 ? 'vehiculos-resumen__num--malo' : ''}`}>{totalMalo}</strong></td>
                        <td className="vehiculos-resumen__col-estado"><strong className="vehiculos-resumen__num">{totalNa}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })()}
          </div>

          {observaciones && (
            <div className="vehiculos-resumen__observaciones">
              <strong>Observaciones:</strong> {observaciones}
            </div>
          )}

          <div className="vehiculos-checklist__acciones">
            <button className="vehiculos-btn vehiculos-btn--secundario" onClick={() => setPaso(2)}>
              &larr; Fotos
            </button>
            <button
              className="vehiculos-btn vehiculos-btn--guardar"
              onClick={guardar}
              disabled={guardando}
            >
              {guardando ? 'Guardando...' : 'Guardar Inventario'}
            </button>
          </div>
        </div>
      )}

      {/* Banner de error SharePoint con opción de reintentar */}
      {sharepointUploadFailed && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: '#fff3e0', borderTop: '3px solid #e65100',
          padding: '1.2rem 1.5rem',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, color: '#e65100', margin: 0, fontSize: '0.9rem' }}>
                Error subiendo fotos a SharePoint
              </p>
              <p style={{ color: '#bf360c', margin: '0.2rem 0 0', fontSize: '0.8rem' }}>
                {sharepointErrorMsg || 'Las fotos no se pudieron subir. El inventario ya fue guardado en la base de datos.'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              onClick={salirSinSubirFotos}
              style={{
                padding: '0.5rem 1.2rem', fontSize: '0.82rem', fontWeight: 600,
                background: 'white', color: '#5c6474', border: '1px solid #ccc',
                borderRadius: '6px', cursor: 'pointer',
              }}
            >
              Continuar sin subir fotos
            </button>
            <button
              onClick={reintentarUploadSharepoint}
              disabled={reintentandoUpload}
              style={{
                padding: '0.5rem 1.2rem', fontSize: '0.82rem', fontWeight: 700,
                background: '#303d50', color: 'white', border: 'none',
                borderRadius: '6px', cursor: reintentandoUpload ? 'not-allowed' : 'pointer',
                opacity: reintentandoUpload ? 0.7 : 1,
              }}
            >
              {reintentandoUpload ? 'Reintentando...' : 'Reintentar subida'}
            </button>
          </div>
        </div>
      )}

      {/* Modal de previsualización del PDF */}
      {pdfPreview && (
        <ModalPrevisualizarPdf
          pdfDataUrl={pdfPreview.pdfDataUrl}
          nombreArchivo={pdfPreview.nombreArchivo}
          modo="transfer"
          procesando={procesandoGuardado}
          onDescargar={descargarPdfYGuardar}
          onCerrar={cerrarPreview}
        />
      )}
    </div>
  )
}


// ─── HISTORIAL DE INVENTARIOS ─────────────────────────────────────────────────

import ModalConfirmarAccion from '../common/ModalConfirmarAccion'
import ModalEditarInventarioVehiculo from './ModalEditarInventarioVehiculo'
import * as XLSX from 'xlsx'
import ModalNombreExcel from '../common/ModalNombreExcel'

function HistorialInventarios({ toast }: { toast: ReturnType<typeof useToast> }) {
  const { sesionUsuario } = useTransferencias()
  const [inventarios, setInventarios] = useState<InventarioResumen[]>([])
  const [cargando, setCargando] = useState(false)
  const [filtroPlaca, setFiltroPlaca] = useState('')
  const [cargado, setCargado] = useState(false)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [confirmarDesinv, setConfirmarDesinv] = useState<{ id: string; placa: string } | null>(null)
  const [editando, setEditando] = useState<InventarioResumen | null>(null)
  const [modalExcelAbierto, setModalExcelAbierto] = useState(false)

  const exportarExcel = (nombreArchivo: string) => {
    if (inventarios.length === 0) return
    const filas = inventarios.map((inv) => ({
      'Placa': inv.placa_vehiculo,
      'Descripción': inv.descripcion || '',
      'Regional': inv.regional || '',
      'Km': inv.kilometraje ?? '',
      'Fotos': inv.fotos_count,
      'Inventariado por': inv.realizado_por_nombre || '',
      'Fecha': inv.fecha_inventario,
      'Estado': inv.estado_general || '',
    }))
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [
      { wch: 12 }, { wch: 45 }, { wch: 30 }, { wch: 12 },
      { wch: 8 }, { wch: 32 }, { wch: 20 }, { wch: 10 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventarios Vehículos')
    XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
    toast.success(`Excel descargado — ${inventarios.length} registros`)
  }

  const nombreExcelPorDefecto = `Inventarios_Vehiculos_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}`

  const cargar = async () => {
    setCargando(true)
    // solo_mios: cada usuario ve únicamente los inventarios de vehículos que él realizó.
    // Usar la MISMA fuente de cédula con la que se guarda realizado_por_cedula
    // (sesionUsuario.numeroIdentificacion), con fallback al auth_state.
    const cedulaMia = sesionUsuario?.numeroIdentificacion || getAuthUser()?.cedula || getAuthUser()?.id_busuario || ''
    const { inventarios: data } = await listarInventariosVehiculos({
      placa: filtroPlaca.trim() || undefined,
      soloMios: cedulaMia || undefined,
    })
    setInventarios(data)
    setCargado(true)
    setCargando(false)
  }

  const desinventariar = async () => {
    if (!confirmarDesinv) return
    const { id, placa } = confirmarDesinv
    setEliminando(id)

    // Intentar eliminar la carpeta del SharePoint primero (no bloquea si falla)
    if (getSharepointStatus().authenticated) {
      try {
        const token = await getSpAccessToken()
        if (token) {
          const inv = inventarios.find(i => i.id_inventario === id)
          // Usar servicio_codigo para que la ruta en SharePoint coincida con el registro original
          const servicio = inv?.servicio_codigo || inv?.regional || ''
          const deleted = await deleteSharepointFolder({ token, placa, servicio })
          if (deleted) {
            toast.info(`Carpeta de ${placa} eliminada de SharePoint`)
          }
        }
      } catch (err) {
        console.warn('[SharePoint] No se pudo eliminar carpeta:', err)
      }
    }

    // Eliminar de la BD
    const res = await eliminarInventarioVehiculo(id)
    if (res.ok) {
      toast.success(`Registro del vehículo ${placa} anulado`)
      setInventarios(prev => prev.filter(i => i.id_inventario !== id))
    } else {
      toast.error(res.mensaje ?? 'Error al desinventariar')
    }
    setEliminando(null)
    setConfirmarDesinv(null)
  }

  // Cargar al montar y cuando la sesión del usuario esté disponible (para que
  // el filtro solo_mios use la cédula correcta).
  useEffect(() => { cargar() }, [sesionUsuario?.numeroIdentificacion]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="vehiculos-historial">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h4 className="vehiculos-historial__titulo" style={{ margin: 0 }}>Inventarios Realizados</h4>
        {inventarios.length > 0 && (
          <button
            className="vehiculos-btn vehiculos-btn--excel"
            onClick={() => setModalExcelAbierto(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '0.4rem 0.9rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600 }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H3zm0 2h14v10H3V5zm2 2v6h2V7H5zm3 0v6h2V7H8zm3 0l2 3-2 3h2l1-1.5L15 13h2l-2-3 2-3h-2l-1 1.5L13 7h-2z"/></svg>
            Exportar Excel
          </button>
        )}
      </div>

      <div className="vehiculos-busqueda">
        <input
          className="vehiculos-busqueda__input"
          type="text"
          placeholder="Filtrar por placa..."
          value={filtroPlaca}
          onChange={(e) => setFiltroPlaca(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
        />
        <button className="vehiculos-busqueda__btn" onClick={cargar} disabled={cargando}>
          {cargando ? 'Cargando...' : 'Consultar'}
        </button>
      </div>

      {cargado && inventarios.length > 0 && (
        <div className="vehiculos-historial__tabla-wrap">
          <table className="vehiculos-historial__tabla">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Descripción</th>
                <th>Regional</th>
                <th>Km</th>
                <th>Fotos</th>
                <th>Inventariado por</th>
                <th>Fecha</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {inventarios.map((inv) => (
                <tr key={inv.id_inventario}>
                  <td className="vehiculos-historial__placa">{inv.placa_vehiculo}</td>
                  <td>{inv.descripcion || '—'}</td>
                  <td>{inv.regional || '—'}</td>
                  <td>{inv.kilometraje ? inv.kilometraje.toLocaleString() : '—'}</td>
                  <td>{inv.fotos_count}</td>
                  <td>{inv.realizado_por_nombre || '—'}</td>
                  <td>{inv.fecha_inventario}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <button
                        className="vehiculos-historial__btn-editar"
                        onClick={() => setEditando(inv)}
                        title="Editar inventario y regenerar PDF"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Editar
                      </button>
                      <button
                        className="vehiculos-historial__btn-eliminar"
                        onClick={() => setConfirmarDesinv({ id: inv.id_inventario, placa: inv.placa_vehiculo })}
                        disabled={eliminando === inv.id_inventario}
                        title="Anular y eliminar este inventario"
                      >
                        {eliminando === inv.id_inventario ? '...' : 'Anular'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cargado && inventarios.length === 0 && (
        <p className="vehiculos-lista__vacio">No hay inventarios registrados.</p>
      )}

      <ModalConfirmarAccion
        isOpen={!!confirmarDesinv}
        titulo="Anular registro de inventario"
        mensaje={`¿Está seguro de anular el registro del vehículo`}
        destacado={confirmarDesinv?.placa}
        advertencia="Se eliminarán los datos del inventario. Esta acción no se puede deshacer."
        textoConfirmar="Sí, anular registro"
        color="#d13c47"
        loading={!!eliminando}
        onConfirmar={desinventariar}
        onCancelar={() => setConfirmarDesinv(null)}
      />

      {/* Modal para nombrar el Excel de inventarios */}
      <ModalNombreExcel
        isOpen={modalExcelAbierto}
        nombrePorDefecto={nombreExcelPorDefecto}
        onCancelar={() => setModalExcelAbierto(false)}
        onConfirmar={(nombre) => { exportarExcel(nombre); setModalExcelAbierto(false) }}
      />

      {/* Modal de edición de inventario */}
      {editando && (
        <ModalEditarInventarioVehiculo
          inventario={editando}
          isOpen={true}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar() }}
          toast={toast}
        />
      )}
    </div>
  )
}
