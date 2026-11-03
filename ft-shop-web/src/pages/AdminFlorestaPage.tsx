import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { FaBoxesStacked, FaBuilding, FaTruckFront, FaChartColumn, FaChevronLeft, FaChevronRight, FaUserTie, FaFileExcel } from 'react-icons/fa6'
import { FaClipboardList } from 'react-icons/fa'
import { FaCircleInfo } from 'react-icons/fa6'

import { Animacion } from 'react-ecosistema-unp/ui'
import {
  limpiarInventarioStorage,
  descargarPDF,
  registrarBienesMalEstado,
  guardarBienesEnStorage,
  cargarBienesDesdeStorage,
  type BienInventario,
  type Colaborador,
} from '../services/inventarioFisicoService'

import {
  guardarInventario,
  verificarPlacasYaInventariadas,
  recargarConteoServicios,
} from '../services/guardarInventarioService'
import { buscarBienesPorCoordinador } from '../services/coordinadorInventarioService'

import {
  tieneObservacionesBloqueantes,
  obtenerObservacionesPendientes,
  obtenerBloqueantesVisibles,
  filtrarRegistrosVisibles,
  crearNota,
  crearNotaAutomatica,
  limpiarRegistrosStorage,
  type RegistroObservacion,
} from '../services/observacionesInventarioService'

import { useToast } from '../hooks/useToast'
import { useInventarioBienes } from '../hooks/useInventarioBienes'
import { useEscaner } from '../hooks/useEscaner'
import { useModalesInventario } from '../hooks/useModalesInventario'
import { useObservacionesNotas } from '../hooks/useObservacionesNotas'
import { useUbicacionesTNS } from '../hooks/useUbicacionesTNS'
import { useInventarioColaborativo } from '../hooks/useInventarioColaborativo'
import ModalColaboradores from '../components/common/ModalColaboradores'
import ModalConfirmarAccion from '../components/common/ModalConfirmarAccion'
import ModalNombreExcel from '../components/common/ModalNombreExcel'
import { ModalPrevisualizarPdf } from '../components/transferencia/ModalPrevisualizarPdf'

import InventarioVehiculos from '../components/vehiculos/InventarioVehiculos'
import PanelReportesInventario from '../components/inventario/PanelReportesInventario'
import PanelCoordinadorCentral from '../components/inventario/PanelCoordinadorCentral'
import PanelContadores from '../components/inventario/PanelContadores'
import TablaBienes from '../components/inventario/TablaBienes'
import BotonesInventario from '../components/inventario/BotonesInventario'
import '../components/inventario/TablaInventario.css'
import ModalObservacionesNotas from '../components/inventario/ModalObservacionesNotas'
import ModalUbicacion from '../components/inventario/ModalUbicacion'
import ModalBienSinPlaca from '../components/inventario/ModalBienSinPlaca'
import ModalInventariadosAgrupado from '../components/inventario/ModalInventariadosAgrupado'
import ModalFaltantesAgrupado from '../components/inventario/ModalFaltantesAgrupado'
import ModalAlertas from '../components/inventario/ModalAlertas'
import PanelContadoresRegional from '../components/inventario/PanelContadoresRegional'
import ModalCustodio from '../components/inventario/ModalCustodio'
import ModalCargaMasiva from '../components/inventario/ModalCargaMasiva'
import ModalEditarSerial from '../components/inventario/ModalEditarSerial'
import ModalPlacaDuplicada from '../components/inventario/ModalPlacaDuplicada'
import ModalHistorialBien from '../components/inventario/ModalHistorialBien'
import EscanerCodigoBarras from '../components/inventario/EscanerCodigoBarras'
import BannerPersonaPresente from '../components/inventario/BannerPersonaPresente'
import BannerUbicacionFisica from '../components/inventario/BannerUbicacionFisica'
import SelectorRegional from '../components/inventario/SelectorRegional'
import SelectorUbicacion from '../components/inventario/SelectorUbicacion'
import SelectorCoordinador from '../components/inventario/SelectorCoordinador'
import ModalSolicitudEliminacion from '../components/inventario/ModalSolicitudEliminacion'
import ChatFlotante from '../components/inventario/ChatFlotante'
import ModalNuevoParticipante from '../components/inventario/ModalNuevoParticipante'

import FloatingField from '../components/ui/FloatingField'
import { getServiciosHabilitados, fetchServiciosHabilitados, fetchServiciosHabilitadosUsuario, cargarPlacasOtrasDuplas } from '../services/controlSeguimientoService'
import { getAuthUserFullName, getAuthUserCedula, getAuthUserCedulaReal, getAuthUserGrupo, getAuthUserCargo, getAuthUser } from '../utils/authState'
import { alertaInventario, contarNotificacionesSinLeer, eliminarNotificacionesLeidas } from '../services/alertasInventarioService'
import { usePresenciaInventario } from '../hooks/usePresenciaInventario'
import { useTransferenciasWebSocket } from '../hooks/useTransferenciasWebSocket'
import { usePanelResizable } from '../hooks/usePanelResizable'

import './ConsultaBienesPage.css'
// CSS que aporta la manija (.pnl-resize-handle) y el overlay flotante
// (.vbog-catalogo-der.is-overlay) reutilizados para el panel de contadores.
import '../components/vehiculos/asignacion/VehiculosBogota.css'
import './TransferenciaBienesPage.css'
import './AdminFlorestaPage.css'
import './InventarioFisicoPage.css'
import '../components/vehiculos/InventarioVehiculos.css'


type PestanaFloresta = 'inventario' | 'inventario-regionales' | 'vehiculos' | 'coordinador' | 'reportes'

export default function AdminFlorestaPage() {
  const [pestana, setPestana] = useState<PestanaFloresta>('inventario')
  const [panelIzqAbierto, setPanelIzqAbierto] = useState(true)
  const [panelDerAbierto, setPanelDerAbierto] = useState(false)
  // Ancho arrastrable del panel derecho de contadores (recordado en localStorage),
  // mismo patrón que Vehículos Bogotá.
  const resizeContadores = usePanelResizable({ storageKey: 'gi_panel_contadores_ancho', defecto: 320, min: 260, max: 560 })
  const toast = useToast()

  const modulos = [
    { id: 'inventario' as const, label: 'Toma de inventario principal', desc: 'Bienes UNP', icon: FaBoxesStacked },
    { id: 'inventario-regionales' as const, label: 'Toma de inventario regional', desc: 'Sedes regionales', icon: FaBuilding },
    { id: 'vehiculos' as const, label: 'Toma de inventario de vehículos', desc: 'Flota vehicular', icon: FaTruckFront },
    { id: 'coordinador' as const, label: 'Bienes a cargo de coordinador', desc: 'Consulta por coordinador', icon: FaUserTie },
    { id: 'reportes' as const, label: 'Reportes de inventario', desc: 'Informes y exportación', icon: FaChartColumn },
  ]

  return (
    <div className="consulta-page">

      {/* Layout 3 columnas */}
      <div className="consulta-layout">

        {/* ── Panel Izquierdo: MÓDULOS ── */}
        <div className={`consulta-lateral consulta-lateral--izq${panelIzqAbierto ? '' : ' is-collapsed'}`}>
          {!panelIzqAbierto ? (
            <div className="consulta-lateral__tab-vertical" onClick={() => setPanelIzqAbierto(true)} role="button" tabIndex={0} aria-label="Abrir panel módulos" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPanelIzqAbierto(true) }}>
              <span className="consulta-lateral__tab-icon"><FaClipboardList size={13} /></span>
              <span className="consulta-lateral__tab-text">Módulos</span>
            </div>
          ) : (
            <div className="consulta-lateral__panel">
              <div className="consulta-lateral__panel-header">
                <div className="consulta-lateral__panel-header-left">
                  <span className="consulta-lateral__panel-header-icon"><FaClipboardList size={13} /></span>
                  <h2 className="consulta-lateral__panel-header-title">Módulos</h2>
                </div>
                <button type="button" className="consulta-lateral__collapse-btn" onClick={() => setPanelIzqAbierto(false)} aria-label="Colapsar panel">
                  <FaChevronLeft size={10} />
                </button>
              </div>
              <div className="consulta-lateral__panel-body">
                {modulos.map((m) => (
                  <button key={m.id} type="button" className={`gi-modulo-item${pestana === m.id ? ' is-active' : ''}`} onClick={() => setPestana(m.id)}>
                    <span className="gi-modulo-item__icon"><m.icon size={18} /></span>
                    <span className="gi-modulo-item__text">
                      <span className="gi-modulo-item__label">{m.label}</span>
                      <span className="gi-modulo-item__desc">{m.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Panel Central ── */}
        <main className="consulta-central">
          <div className="consulta-central__body">
            {pestana === 'inventario' && <PanelCargaMasiva toast={toast} activo={true} />}
            {pestana === 'inventario-regionales' && <PanelInventarioRegionales toast={toast} onAbrirPanel={() => setPanelDerAbierto(true)} onCerrarPanel={() => setPanelDerAbierto(false)} />}
            {pestana === 'vehiculos' && <InventarioVehiculos toast={toast} />}
            {pestana === 'coordinador' && <PanelCoordinadorCentral toast={toast} onIrAInventarioPrincipal={() => setPestana('inventario')} />}
            {pestana === 'reportes' && <PanelReportesInventario toast={toast} />}
          </div>
        </main>

        {/* ── Panel Derecho: CONTADORES (oculto en reportes y coordinador) ── */}
        {pestana !== 'reportes' && pestana !== 'coordinador' && (
        <div className={`consulta-lateral consulta-lateral--der vbog-catalogo-der is-overlay${panelDerAbierto ? '' : ' is-collapsed'}`}>
          {!panelDerAbierto && (
            <div className="consulta-lateral__tab-vertical" onClick={() => setPanelDerAbierto(true)} role="button" tabIndex={0} aria-label="Abrir panel contadores" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPanelDerAbierto(true) }}>
              <span className="consulta-lateral__tab-icon"><FaChartColumn size={13} /></span>
              <span className="consulta-lateral__tab-text">Contadores</span>
            </div>
          )}
          <div
            className="consulta-lateral__panel"
            style={panelDerAbierto
              ? { width: resizeContadores.ancho }
              : { opacity: 0, pointerEvents: 'none', transition: 'opacity 0.18s ease' }}
          >
            {panelDerAbierto && (
              <div className="pnl-resize-handle" onMouseDown={resizeContadores.iniciarResize} onTouchStart={resizeContadores.iniciarResizeTouch} title="Arrastrar para redimensionar" />
            )}
            <div className="consulta-lateral__panel-header">
              <div className="consulta-lateral__panel-header-left">
                <span className="consulta-lateral__panel-header-icon"><FaChartColumn size={13} /></span>
                <h2 className="consulta-lateral__panel-header-title">Contadores</h2>
              </div>
              <button type="button" className="consulta-lateral__collapse-btn" onClick={() => setPanelDerAbierto(false)} aria-label="Colapsar panel">
                <FaChevronRight size={10} />
              </button>
            </div>
            <div className="consulta-lateral__panel-body" id="gi-panel-contadores">
            </div>
          </div>
        </div>
        )}

      </div>
    </div>
  )
}

// ─── PANEL INVENTARIO FÍSICO ───────────────────────────────────────────────────────────────────────────────

// Caché en memoria del conteo de servicios: se trae UNA sola vez por sesión de
// la app, para no re-consultar TNS cada vez que el panel se monta al cambiar de
// módulo. Se puede refrescar explícitamente (al guardar inventario).
let conteoInventarioCache: { servicios: any[]; total_activos: number; total_inventariados: number; anio: number } | null = null

/**
 * ¿El código de dependencia corresponde a una BODEGA?
 * Réplica de la heurística del backend (contar_bienes_en_servicio):
 *  - BP001 (bodega principal)
 *  - códigos puramente numéricos ≤ 1000
 *  - códigos tipo BP001/BT/BT001/B1: empiezan con letra, ≤6 chars, con dígitos y sin guión
 */
function esBodegaPorCodigo(codigo: string): boolean {
  const c = (codigo || '').trim()
  if (!c) return false
  if (c === 'BP001') return true
  const primer = c[0]
  if (primer >= '0' && primer <= '9') {
    // numérico: bodega si es número y ≤ 1000
    if (/^\d+$/.test(c) && parseInt(c, 10) <= 1000) return true
    return false
  }
  // empieza con letra: bodega si ≤6 chars, tiene dígitos y no tiene guión
  if (c.length <= 6 && /[0-9]/.test(c) && !c.includes('-')) return true
  return false
}

function PanelCargaMasiva({ toast, activo }: { toast: ReturnType<typeof useToast>; activo: boolean }) {
  // ─── Hooks compartidos ───────────────────────────────────────────────────
  const escaner = useEscaner()
  const { inputRef, codigoBarras, setCodigoBarras, procesando, setProcesando, alertaDuplicado, setAlertaDuplicado, devolverFoco } = escaner
  const inventario = useInventarioBienes({ persistir: true, onEstadoMalo: (placa) => toast.warning(`Bien ${placa} → Estado M (se registrará para baja al guardar)`) })
  const { bienesInventariados, setBienesInventariados, actualizarBienes, editarEstado: editarEstadoLocal, editarSerial: editarSerialLocal, editarUbicacion: editarUbicacionLocal, eliminarBien: eliminarBienHook, agregarBienSinPlaca: agregarBienSinPlacaHook, ultimoBienAgregadoIndex, setUltimoBienAgregadoIndex, cargarDesdeStorage } = inventario
  const modales = useModalesInventario()
  const { registrosObsNotas, setRegistrosObsNotas, actualizarRegistros: actualizarRegistrosLocal } = useObservacionesNotas()

  // Ref para emitirEvento del canal COLABORATIVO (se asigna tras declarar el hook).
  // Antes las observaciones/notas se enviaban por el canal de PRESENCIA, que se
  // filtra por servicio/entorno y fallaba (no le llegaban al 2º participante).
  // Ahora usan el MISMO canal confiable que estado/serial/ubicación/custodio:
  // el colaborativo (grupo inventario_{servicio}, aislado y confiable).
  const emitirColaborativoRef = useRef<(actionKey: string, data: Record<string, any>) => void>(() => {})

  // Wrapper de observaciones/notas que sincroniza por el canal COLABORATIVO.
  // Envía el objeto `registro` COMPLETO (el receptor lo reconstruye tal cual).
  const actualizarRegistrosObsNotas = (nuevos: typeof registrosObsNotas) => {
    const prevLen = registrosObsNotas.length
    actualizarRegistrosLocal(nuevos)

    // Detectar registros nuevos (agregados al final)
    if (nuevos.length > prevLen) {
      const ultimo = nuevos[nuevos.length - 1]
      if (ultimo) {
        const actionKey = ultimo.tipo === 'observacion' ? 'observacion_agregada' : 'nota_agregada'
        emitirColaborativoRef.current(actionKey, {
          registro: ultimo,
          placa: ultimo.placa,
        })
      }
    }

    // Detectar observación resuelta (misma longitud, un registro pasó a resuelta)
    if (nuevos.length === prevLen) {
      for (let i = 0; i < nuevos.length; i++) {
        const prev = registrosObsNotas[i]
        const curr = nuevos[i]
        if (prev && curr && prev.estado === 'pendiente' && curr.estado === 'resuelta') {
          emitirColaborativoRef.current('observacion_resuelta', {
            registro: curr,
            placa: curr.placa,
          })
          break
        }
      }
    }
  }

  // Aliases de compatibilidad: modales compartidos → nombres que usa el JSX existente
  const mostrarModalEliminar = modales.mostrarModalEliminar
  const setMostrarModalEliminar = (v: { index: number; placa: string } | null) => v ? modales.abrirModalEliminar(v.index, v.placa) : modales.cerrarModalEliminar()
  const mostrarModalCustodio = modales.mostrarModalCustodio
  const setMostrarModalCustodio = (v: { index: number } | null) => v ? modales.abrirModalCustodio(v.index) : modales.cerrarModalCustodio()
  const mostrarModalSerial = modales.mostrarModalSerial
  const setMostrarModalSerial = (v: { index: number; serial: string } | null) => v ? modales.abrirModalSerial(v.index, v.serial) : modales.cerrarModalSerial()
  const historialPlaca = modales.historialPlaca
  const setHistorialPlaca = (v: { placa: string; descripcion: string; serial?: string } | null) => v ? modales.abrirHistorial(v.placa, v.descripcion, v.serial) : modales.cerrarHistorial()
  const mostrarModalBienSinPlaca = modales.mostrarModalBienSinPlaca
  const setMostrarModalBienSinPlaca = (v: boolean) => v ? modales.abrirModalBienSinPlaca() : modales.cerrarModalBienSinPlaca()
  const mostrarModalLimpiar = modales.mostrarModalLimpiar
  const setMostrarModalLimpiar = (v: boolean) => v ? modales.abrirModalLimpiar() : modales.cerrarModalLimpiar()
  const mostrarModalObservacion = modales.mostrarModalObservacion
  const setMostrarModalObservacion = (v: boolean) => v ? modales.abrirModalObservacion('', '') : modales.cerrarModalObservacion()
  const observacionEditando = modales.observacionEditando
  const setObservacionEditando = (v: { placa: string; texto: string } | null) => v ? modales.abrirModalObservacion(v.placa, v.texto) : modales.cerrarModalObservacion()
  const mostrarModalUbicacion = modales.mostrarModalUbicacion
  const setMostrarModalUbicacion = (v: boolean) => v ? modales.abrirModalUbicacion('', '') : modales.cerrarModalUbicacion()
  const ubicacionEditando = modales.ubicacionEditando
  const setUbicacionEditando = (v: { placa: string; texto: string } | null) => v ? modales.abrirModalUbicacion(v.placa, v.texto) : modales.cerrarModalUbicacion()
  const tabInicialObs = modales.tabInicialObs
  const setTabInicialObs = modales.setTabInicialObs

  // ─── Estado local del panel ──────────────────────────────────────────────
  const [mostrarModalColaboradores, setMostrarModalColaboradores] = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)
  const [mostrarModalFaltantesFisico, setMostrarModalFaltantesFisico] = useState(false)
  const [bienesFaltantesFisico, setBienesFaltantesFisico] = useState<any[]>([])
  const [cargandoFaltantesFisico, setCargandoFaltantesFisico] = useState(false)
  const [mostrarModalAlertasFisico, setMostrarModalAlertasFisico] = useState(false)
  const [mostrarModalInventariadosFisico, setMostrarModalInventariadosFisico] = useState(false)
  const [filtroPistoleados, setFiltroPistoleados] = useState('')
  const [mostrarModalCargaMasivaFisico, setMostrarModalCargaMasivaFisico] = useState(false)
  const [personaPresente, setPersonaPresente] = useState<{ nombre: string; cedula: string } | null>(null)
  // Ubicación física de la sesión: todos los bienes que se agreguen se asocian a ella.
  const [ubicacionFisica, setUbicacionFisica] = useState<string>('')
  // Confirmación antes de marcar un bien como M (para baja), para evitar errores.
  const [confirmarEstadoM, setConfirmarEstadoM] = useState<{ index: number; placa: string } | null>(null)

  // ─── Estado eliminación colaborativa ─────────────────────────────────────

  // ─── Estado presencia participantes ──────────────────────────────────────
  const [nuevoParticipante, setNuevoParticipante] = useState<import('../hooks/useInventarioColaborativo').ParticipanteSesion | null>(null)
  const [bienesInventariadosFisico, setBienesInventariadosFisico] = useState<any[]>([])
  const [cargandoInventariadosFisico, setCargandoInventariadosFisico] = useState(false)
  
  // Contadores de inventario
  const [conteoInventario, setConteoInventario] = useState<{ servicios: any[]; total_activos: number; total_inventariados: number; anio: number } | null>(conteoInventarioCache)
  const [mostrarModalBienesServicio, setMostrarModalBienesServicio] = useState(false)
  const [filtroServicio, setFiltroServicio] = useState('')
  // Dropdown de cambio rápido de servicio desde el título "Plaqueteando servicio"
  const [selectorServicioAbierto, setSelectorServicioAbierto] = useState(false)
  // Servicio elegido manualmente por el usuario para plaquetear (null = ninguno aún).
  // Debe iniciar vacío en un ingreso FRESCO (el usuario elige manualmente),
  // Debe iniciar SIEMPRE vacío: el usuario DEBE seleccionar un servicio
  // manualmente al entrar. NO se restaura desde localStorage (hacerlo pintaba
  // bienes y contadores al cargar la página sin que el usuario eligiera nada).
  const [servicioSeleccionado, setServicioSeleccionado] = useState<string | null>(null)
  // Persistir el servicio seleccionado para que OTROS paneles (ej. el de
  // Coordinador) puedan validar que hay un servicio activo antes de incluir
  // bienes. Sin esto, al incluir desde coordinador sin servicio seleccionado el
  // bien se agregaba igual (a diferencia del escaneo normal que sí lo bloquea).
  useEffect(() => {
    if (servicioSeleccionado) localStorage.setItem('inventario_servicio_seleccionado', servicioSeleccionado)
    else localStorage.removeItem('inventario_servicio_seleccionado')
  }, [servicioSeleccionado])
  // Nivel de detalle abierto en el panel de Contadores. Vive aquí (no dentro de
  // PanelContadores) para que NO se colapse cuando el portal se re-monta al
  // escanear un bien.
  const [nivelContadorActivo, setNivelContadorActivo] = useState<null | 'servicios' | 'inventariados' | 'faltantes' | 'alertas' | 'coordinador'>(null)
  const [serviciosHabilitadosGlobal, setServiciosHabilitadosGlobal] = useState<string[]>(getServiciosHabilitados())
  const [serviciosExcluidos, setServiciosExcluidos] = useState<string[]>(() => {
    try {
      const guardados = localStorage.getItem('inventario_servicios_excluidos')
      return guardados ? JSON.parse(guardados) : []
    } catch { return [] }
  })
  const [bienesModalServicio, setBienesModalServicio] = useState<any[]>([])
  const [cargandoModalServicio, setCargandoModalServicio] = useState(false)
  const [servicioModalActual, setServicioModalActual] = useState('')
  const [cacheBienesServicio] = useState<Map<string, { bienes: any[]; inventariadas: Set<string> }>>(new Map())
  const [filtroModalBienes, setFiltroModalBienes] = useState('')
  const [placasYaInventariadas, setPlacasYaInventariadas] = useState<Set<string>>(new Set())
  const [coordinadorSeleccionado, setCoordinadorSeleccionado] = useState<{ nombre: string; cedula: string } | null>(null)
  const [bienesCoordinadorModal, setBienesCoordinadorModal] = useState<any[]>([])
  const [cargandoBienesCoordinador, setCargandoBienesCoordinador] = useState(false)
  const [mostrarConsultaCoordinador, setMostrarConsultaCoordinador] = useState(false)
  
  // Estados para el modal de previsualización del PDF
  const [pdfPreview, setPdfPreview] = useState<{ pdfDataUrl: string; nombreArchivo: string } | null>(null)
  const [inventarioPendienteRegistro, setInventarioPendienteRegistro] = useState<any>(null)
  // Modal para el Excel provisional de la TOMA PRINCIPAL
  const [modalExcelProvisionalPrincipal, setModalExcelProvisionalPrincipal] = useState(false)

  // Username del usuario logueado (login del ecosistema, ej. "pablo.gamboa")
  const usernameLogueado = useMemo(() => (getAuthUser()?.username || '').trim().toLowerCase(), [])

  // Cargar servicios habilitados desde BD al montar.
  // Se muestran SOLO los servicios asignados al usuario logueado (inventariador).
  // Si el usuario no tiene username, cae a la configuración global (compatibilidad).
  useEffect(() => {
    if (usernameLogueado) {
      void fetchServiciosHabilitadosUsuario(usernameLogueado).then(setServiciosHabilitadosGlobal)
    } else {
      void fetchServiciosHabilitados().then(setServiciosHabilitadosGlobal)
    }
  }, [usernameLogueado])

  // Escuchar actualizaciones de servicios habilitados en tiempo real vía WebSocket.
  // El evento 2120 ahora trae { clave, username }. Solo actualizamos si el cambio
  // corresponde al usuario logueado (o a la config global cuando no hay username).
  useTransferenciasWebSocket({
    onConfiguracionServiciosActualizada: (servicios, meta) => {
      const claveUsuario = meta?.username ? String(meta.username).trim().toLowerCase() : null
      if (usernameLogueado) {
        // Solo aplicar si el evento es para este usuario
        if (claveUsuario === usernameLogueado) {
          setServiciosHabilitadosGlobal(servicios)
        }
      } else {
        // Sin username: modo global (evento sin username destino)
        if (!claveUsuario) {
          setServiciosHabilitadosGlobal(servicios)
          localStorage.setItem('inventario_servicios_habilitados_global', JSON.stringify(servicios))
        }
      }
    },
    // Cuando se elimina un reporte, sus placas se LIBERAN: quitarlas del caché
    // de bloqueo local para que se puedan volver a inventariar sin falsa alerta.
    onInventarioEliminado: (_servicio, placasLiberadas) => {
      if (Array.isArray(placasLiberadas) && placasLiberadas.length > 0) {
        for (const placa of placasLiberadas) {
          placasOtrasDuplasRef.current.delete(placa)
        }
        setPlacasYaInventariadas(prev => {
          const next = new Set(prev)
          for (const placa of placasLiberadas) next.delete(placa)
          return next
        })
      }
    },
  })

  // Recuperar la lista completa (todos los servicios) desde storage al montar.
  // La tabla NO mostrará nada hasta seleccionar el servicio, porque la vista se
  // filtra por `servicio_inv_codigo` (ver bienesDelServicioActivo). Así los
  // bienes de cada servicio quedan disponibles pero solo se ven al elegirlo.
  const yaRecuperoRef = useRef(false)
  useEffect(() => {
    if (yaRecuperoRef.current) return
    yaRecuperoRef.current = true
    const bienesGuardados = cargarBienesDesdeStorage()
    if (bienesGuardados.length > 0) setBienesInventariados(bienesGuardados)
  }, []) // solo al montar

  // ─── Inventario colaborativo ─────────────────────────────────────────────
  // Detectar servicio activo para el modo colaborativo
  // Todos los códigos de servicios incluidos (para validación multi-servicio)
  const codigosServiciosActivos = useMemo(() => {
    if (!conteoInventario) return [] as string[]
    return conteoInventario.servicios
      .filter(s => serviciosHabilitadosGlobal.length > 0 ? serviciosHabilitadosGlobal.includes(s.codigo) : false)
      .filter(s => !serviciosExcluidos.includes(s.codigo))
      .map(s => s.codigo)
  }, [conteoInventario, serviciosHabilitadosGlobal, serviciosExcluidos])

  // Primer servicio activo (para presencia y colaborativo)
  // Se "fija" una vez establecido para no resetear la sesión colaborativa
  // al cambiar servicios excluidos (solo cambia si el servicio se deshabilita completamente)
  const servicioColaborativoRef = useRef('')
  const codigoServicioActivo = useMemo(() => {
    const primero = codigosServiciosActivos.length >= 1 ? codigosServiciosActivos[0] : ''
    // Si ya tenemos un servicio fijado y sigue en la lista de activos, mantenerlo
    if (servicioColaborativoRef.current && codigosServiciosActivos.includes(servicioColaborativoRef.current)) {
      return servicioColaborativoRef.current
    }
    // Si no hay servicio fijado o el actual fue removido, usar el primero disponible
    servicioColaborativoRef.current = primero
    return primero
  }, [codigosServiciosActivos])

  // Servicio que se está plaqueteando (título grande arriba del escáner).
  // Depende del servicio ELEGIDO manualmente por el usuario (inicia vacío).
  const servicioActivoInfo = useMemo(() => {
    if (!conteoInventario || !servicioSeleccionado) return null
    return conteoInventario.servicios.find(s => s.codigo === servicioSeleccionado) ?? null
  }, [conteoInventario, servicioSeleccionado])

  // Servicios incluidos (habilitados − excluidos) y servicio activo, a nivel de
  // componente para que los contadores de detalle (faltantes/inventariados)
  // puedan recargarse cuando cambie la selección del servicio.
  const serviciosIncluidosMemo = useMemo(() => {
    if (!conteoInventario) return [] as any[]
    return conteoInventario.servicios
      .filter(s => serviciosHabilitadosGlobal.length > 0 ? serviciosHabilitadosGlobal.includes(s.codigo) : false)
      .filter(s => !serviciosExcluidos.includes(s.codigo))
  }, [conteoInventario, serviciosHabilitadosGlobal, serviciosExcluidos])
  const servicioActivoUnico = serviciosIncluidosMemo.length === 1 ? serviciosIncluidosMemo[0] : null

  // Sincronización bidireccional con el panel de Contadores:
  // si al tildar/destildar en el contador queda UN único servicio incluido,
  // ese pasa a ser el seleccionado en el título. Si quedan 0 o varios, el
  // título vuelve a vacío (mantiene la regla "el usuario debe elegir uno").
  //
  // IMPORTANTE (regla de negocio): al INGRESAR por primera vez, NUNCA se debe
  // auto-seleccionar un servicio, aunque el usuario tenga habilitado uno solo o
  // aunque queden excluidos persistidos de una sesión anterior. El usuario SIEMPRE
  // debe elegir manualmente. Por eso la primera pasada (carga inicial de datos)
  // solo marca el "listo" y NO auto-selecciona; el auto-select únicamente ocurre
  // como REACCIÓN a que el usuario tilde/destilde servicios en el contador.
  // El auto-select solo debe ocurrir cuando el USUARIO cambia los servicios
  // excluidos (tilda/destilda en el contador). Guardamos el valor previo de
  // `serviciosExcluidos`; si no cambió respecto a la última vez, es carga inicial
  // o un cambio de otra dependencia (conteo/habilitados) y NO auto-seleccionamos.
  const excluidosPrevRef = useRef<string | null>(null)
  useEffect(() => {
    if (!conteoInventario) return
    const excluidosKey = JSON.stringify([...serviciosExcluidos].sort())
    const esCambioDeExcluidos = excluidosPrevRef.current !== null && excluidosPrevRef.current !== excluidosKey
    excluidosPrevRef.current = excluidosKey
    // Solo auto-seleccionar como reacción a que el usuario cambió los excluidos.
    if (!esCambioDeExcluidos) return
    const incluidos = conteoInventario.servicios
      .filter(s => serviciosHabilitadosGlobal.length > 0 ? serviciosHabilitadosGlobal.includes(s.codigo) : false)
      .filter(s => !serviciosExcluidos.includes(s.codigo))
      .map(s => s.codigo)
    const unico = incluidos.length === 1 ? incluidos[0] : null
    setServicioSeleccionado(prev => (prev === unico ? prev : unico))
  }, [conteoInventario, serviciosHabilitadosGlobal, serviciosExcluidos])

  // Lista de servicios habilitados (con contador) para el selector rápido del título.
  const serviciosHabilitadosLista = useMemo(() => {
    if (!conteoInventario) return [] as { codigo: string; nombre: string; cantidad: number }[]
    return conteoInventario.servicios
      .filter(s => serviciosHabilitadosGlobal.length > 0 ? serviciosHabilitadosGlobal.includes(s.codigo) : false)
      .map(s => ({ codigo: s.codigo, nombre: s.nombre, cantidad: s.cantidad }))
  }, [conteoInventario, serviciosHabilitadosGlobal])

  // Selecciona un único servicio para plaquetear: excluye todos los habilitados
  // menos el elegido. Persiste en localStorage (misma clave que el panel).
  const seleccionarUnicoServicio = useCallback((codigo: string) => {
    const excluir = serviciosHabilitadosLista.map(s => s.codigo).filter(c => c !== codigo)
    setServiciosExcluidos(excluir)
    setServicioSeleccionado(codigo)
    servicioColaborativoRef.current = codigo
    localStorage.setItem('inventario_servicios_excluidos', JSON.stringify(excluir))
    setSelectorServicioAbierto(false)
  }, [serviciosHabilitadosLista])

  // TODO: Obtener usuario actual del ecosistema (por ahora placeholder)
  const usuarioActual = getAuthUserFullName() || 'Usuario'
  const cedulaActual = getAuthUserCedula() || ''
  // Cédula usada para FILTRAR observaciones/notas por usuario. Debe coincidir
  // con el valor con que se guardan (cedulaCreador): getAuthUserCedulaReal() con
  // fallback a getAuthUserCedula() (identificador estable del colaborativo).
  const cedulaFiltroObs = getAuthUserCedulaReal() || getAuthUserCedula() || ''
  const grupoActual = getAuthUserGrupo()
  const cargoActual = getAuthUserCargo()

  // Servicio para la LÓGICA de coordinación visible (modal "modo colaborativo",
  // indicador de compañero): debe ser el que el usuario ELIGIÓ manualmente.
  // Si no ha seleccionado, no mostramos colaboración. OJO: NO usamos esto para
  // conectar los WS, porque servicioSeleccionado puede oscilar (efecto de
  // sincronización) y provocaría reconexiones en bucle → parpadeo de la página.
  const servicioColab = servicioSeleccionado || ''

  // ─── Presencia en línea (usa WS global, funciona siempre) ────────────────
  // Se conecta con `codigoServicioActivo` (ESTABLE, fijado por ref), para que el
  // WS NO se reconecte en bucle. La visibilidad del modal/indicador se filtra
  // aparte con `servicioColab`.
  const presencia = usePresenciaInventario({
    usuario: usuarioActual,
    cedula: cedulaActual,
    grupo: grupoActual,
    cargo: cargoActual,
    servicio: codigoServicioActivo,
    habilitado: activo,
  })

  const colaborativo = useInventarioColaborativo({
    codigoServicio: codigoServicioActivo,
    usuario: usuarioActual,
    cedula: cedulaActual,
    grupo: grupoActual,
    cargo: cargoActual,
    habilitado: !!codigoServicioActivo && !!import.meta.env.VITE_APP_REDIS_ENDPOINT,
  })

  // Asignar emitirEvento del canal colaborativo al ref (lo usa el wrapper de obs/notas).
  emitirColaborativoRef.current = colaborativo.emitirEvento

  // Compañeros online en MI servicio (para el indicador de la tabla y el chat).
  // Un solo cálculo reutilizable. Vacío si no hay servicio seleccionado.
  const colaboradoresEnLinea = useMemo(() => {
    const svc = (servicioColab || '').trim()
    if (!svc) return [] as { usuario: string; cedula: string; grupo: string; cargo: string; estado: 'online' | 'offline' }[]
    return presencia.usuarios
      .filter(u =>
        u.estado === 'online' &&
        u.cedula && u.cedula !== cedulaActual &&
        (u.servicio || '').trim() === svc,
      )
      .map(u => ({ usuario: u.usuario, cedula: u.cedula, grupo: u.grupo, cargo: u.cargo, estado: u.estado as 'online' | 'offline' }))
  }, [presencia.usuarios, servicioColab, cedulaActual])

  // NOTA: la recepción de observaciones/notas/resueltas ahora se maneja ÚNICAMENTE
  // en el efecto de `colaborativo.ultimoEvento` (más abajo), que ya espera el
  // objeto `registro` completo. Se eliminó el receptor por presencia (que usaba
  // campos planos) para no duplicar lógica y porque ese canal fallaba por el
  // filtro de servicio/entorno.

  // Descuento en caliente: cuando CUALQUIER dupla (incluso en otro servicio) escanea
  // un bien, agregamos su placa a placasYaInventariadas para que se descuente al
  // instante del contador/modal de coordinador.
  useEffect(() => {
    const evento = presencia.ultimoBienEscaneadoExterno
    if (!evento || !evento.placa) return
    // Descuento en caliente: la placa escaneada por CUALQUIER dupla cuenta como inventariada.
    setPlacasYaInventariadas(prev => {
      if (prev.has(evento.placa)) return prev
      const next = new Set(prev)
      next.add(evento.placa)
      return next
    })
    // Registrar quién tiene esta placa (otra dupla), para bloqueo temprano en
    // caliente. La verificación definitiva la hace el backend al escanear.
    if (evento.cedula && cedulaActual && evento.cedula !== cedulaActual) {
      placasOtrasDuplasRef.current.set(evento.placa, {
        usuario: evento.usuario || 'Otra persona',
        servicio: evento.servicio || 'otro servicio',
        cedula: evento.cedula,
      })
    }
    // Nota: el bloqueo de "no puedo agregar una placa que otra dupla ya tiene"
    // se hace de forma SÍNCRONA en procesarCodigoBarras (usando
    // placasOtrasDuplasRef). El aviso al que ya la tenía llega por el evento
    // 'placa_ya_en_inventario' (ver efecto placaDuplicadaConfirmada). Aquí solo
    // registramos el descuento en caliente y quién tiene la placa.

    // Caso especial: el bien lo incluí YO desde el panel de Coordinador (se
    // guardó en storage y se notificó por WS). Como ese flujo no pasa por
    // procesarCodigoBarras, mi estado `bienesInventariados` no lo tiene todavía
    // y el contador grande de faltantes (que depende de bienesInventariados) no
    // baja. Si el evento es MÍO y la placa ya está en storage pero no en mi
    // tabla, recargo desde storage para que aparezca y descuente el faltante.
    const esMio = !evento.cedula || (cedulaActual && evento.cedula === cedulaActual)
    if (esMio && !bienesRef.current.some(b => b.placa === evento.placa)) {
      const enStorage = cargarBienesDesdeStorage().some(b => (b.placa || '').trim() === evento.placa)
      if (enStorage) cargarDesdeStorage()
    }
  }, [presencia.ultimoBienEscaneadoExterno])  // eslint-disable-line react-hooks/exhaustive-deps

  // Ref siempre actualizada de la tabla (evita closures obsoletos en el efecto de WS)
  const bienesRef = useRef<typeof bienesInventariados>([])
  useEffect(() => { bienesRef.current = bienesInventariados }, [bienesInventariados])

  // ─── Aislar los bienes escaneados POR SERVICIO ───────────────────────────
  // Los bienes de un servicio NO deben arrastrarse al cambiar a otro servicio.
  // Como el storage principal es una única lista, aquí se hace la partición:
  // al cambiar de servicio se GUARDA la lista del servicio anterior bajo su
  // clave (inventario_fisico_bienes__<codigo>) y se CARGA la del nuevo servicio
  // (vacío si nunca se escaneó nada allí). Así `bienesInventariados` siempre
  // refleja SOLO el servicio activo. Si el servicio pasa a null (tras guardar),
  // ─── Aislamiento por servicio (enfoque simple: filtrar la VISTA) ─────────
  // En vez de particionar el storage (que provocaba races al cambiar de
  // servicio), cada bien se ETIQUETA con el CÓDIGO del servicio en el que se
  // escaneó (`servicio_inv_codigo`, ver procesarCodigoBarras y carga masiva) y
  // la TABLA muestra solo los del servicio seleccionado. Storage sigue siendo
  // una sola lista; el aislamiento es de presentación, sin efectos que muevan
  // datos entre claves. Robusto y sin condiciones de carrera.

  // Ref del servicio actual, para estampar los bienes nuevos sin depender de
  // closures viejos.
  const servicioSeleccionadoRef = useRef<string | null>(null)
  useEffect(() => { servicioSeleccionadoRef.current = servicioSeleccionado }, [servicioSeleccionado])

  // Bienes visibles en la tabla/contadores: SOLO los del servicio activo.
  // Los que no tengan `servicio_inv_codigo` (escaneos previos a este cambio) se
  // muestran solo si coinciden por dependencia con el servicio activo (fallback).
  const bienesDelServicioActivo = useMemo(() => {
    if (!servicioSeleccionado) return [] as BienInventario[]
    const nombreActivo = (conteoInventario?.servicios.find(s => s.codigo === servicioSeleccionado)?.nombre || '').trim()
    return bienesInventariados.filter(b => {
      const cod = (b as any).servicio_inv_codigo
      if (cod) return cod === servicioSeleccionado
      // Fallback para bienes sin etiqueta: comparar por nombre de dependencia.
      return nombreActivo && (b.servicio || '').trim() === nombreActivo
    })
  }, [bienesInventariados, servicioSeleccionado, conteoInventario])

  // Traduce un índice de la VISTA filtrada (bienesDelServicioActivo) al índice
  // REAL en la lista completa (bienesInventariados). La tabla trabaja sobre la
  // vista filtrada, pero las operaciones del hook (editar/eliminar) usan el
  // índice de la lista completa; sin esta traducción se editaría el bien errado.
  const idxRealPorVista = useCallback((iVista: number): number => {
    const bienVista = bienesDelServicioActivo[iVista]
    if (!bienVista) return -1
    return bienesInventariados.findIndex(b => b.placa === bienVista.placa)
  }, [bienesDelServicioActivo, bienesInventariados])

  // "Limpiar" ahora borra SOLO los bienes del servicio activo (no los de otros
  // servicios que estén pendientes). Remueve de la lista los que tengan la
  // etiqueta del servicio actual y persiste el resto.
  const limpiarClaveServicioActivo = useCallback(() => {
    const svc = servicioSeleccionadoRef.current
    if (!svc) { setBienesInventariados([]); guardarBienesEnStorage([]); return }
    setBienesInventariados(prev => {
      const restantes = prev.filter(b => (((b as any).servicio_inv_codigo) || '') !== svc)
      guardarBienesEnStorage(restantes)
      return restantes
    })
  }, [])

  // Mapa placa → dupla que YA la tiene (usuario/servicio/cédula). Se alimenta de:
  //  (1) una carga inicial desde el backend (placas en sesiones colaborativas
  //      activas de CUALQUIER servicio — cubre "entré 10 min después"), y
  //  (2) el WS 'bien_escaneado' en vivo.
  // Se usa para BLOQUEAR en el acto que yo agregue una placa que otro
  // servicio/usuario ya inventarió.
  const placasOtrasDuplasRef = useRef<Map<string, { usuario: string; servicio: string; cedula: string }>>(new Map())

  // Carga inicial (y al cambiar de servicio): traer del backend las placas que
  // otras duplas ya tienen en curso, para bloquear duplicados aunque no se haya
  // recibido el evento WS en vivo.
  useEffect(() => {
    if (!activo) return
    let cancelado = false
    const cargar = async () => {
      const mapa = await cargarPlacasOtrasDuplas(codigoServicioActivo || undefined)
      if (cancelado) return
      // Fusionar sin pisar lo que ya llegó por WS.
      for (const [placa, info] of mapa.entries()) {
        if (!placasOtrasDuplasRef.current.has(placa)) {
          placasOtrasDuplasRef.current.set(placa, { usuario: info.usuario, servicio: info.servicio, cedula: info.cedula })
        }
      }
    }
    void cargar()
    return () => { cancelado = true }
  }, [activo, codigoServicioActivo])

  // Duplicado EN CALIENTE (lado del que ACABA de escanear):
  // DESACTIVADO — evita DOBLE aviso al usuario que ya tiene la placa.
  //
  // El aviso a quien YA TENÍA la placa lo emite ahora el BACKEND directamente
  // al grupo WS de su servicio (action_key `placa_duplicada_alerta`), y se
  // procesa en el efecto de `colaborativo.ultimoEvento` (más abajo). Ese es el
  // único canal válido: la verificación es atómica contra la tabla auxiliar.
  //
  // Este efecto usaba el canal P2P de presencia (`placa_ya_en_inventario`),
  // que era el mecanismo viejo y redundante. Si se dejaba activo, el usuario-1
  // recibía el modal y la nota DOS veces (una por este canal y otra por el del
  // backend). Se deja inerte a propósito para no romper la referencia al estado
  // de presencia, pero sin producir ninguna alerta.
  useEffect(() => {
    // Intencionalmente vacío: el aviso lo gestiona `placa_duplicada_alerta`.
  }, [presencia.placaDuplicadaConfirmada])   

  // ─── Carga de listas de detalle (faltantes / inventariados) ───────────────
  // Extraídas para poder RE-cargarlas cuando cambia el servicio seleccionado
  // (antes solo se cargaban al hacer clic en el contador, por eso al cambiar de
  // servicio desde el desplegable las listas quedaban desactualizadas).
  const cargarFaltantesFisico = useCallback(async () => {
    setCargandoFaltantesFisico(true)
    try {
      const serviciosParaConsultar = servicioActivoUnico ? [servicioActivoUnico] : serviciosIncluidosMemo
      const API = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
      const resultados = await Promise.all(serviciosParaConsultar.map(async (svc: any) => {
        const cached = cacheBienesServicio.get(svc.codigo)
        if (cached && cached.bienes.length > 0) return cached.bienes.map((b: any) => ({ ...b, servicio_codigo: svc.codigo, servicio_nombre: svc.nombre }))
        try {
          const res = await fetch(`${API}/almacen/admin/contar-bienes-servicio/?detalle_servicio=${svc.codigo}`)
          if (res.ok) {
            const data = await res.json()
            const bienes = data.bienes || []
            if (bienes.length > 0) cacheBienesServicio.set(svc.codigo, { bienes, inventariadas: new Set() })
            return bienes.map((b: any) => ({ ...b, servicio_codigo: svc.codigo, servicio_nombre: svc.nombre }))
          }
        } catch { /* silenciar */ }
        return []
      }))
      const todos = resultados.flat()
      const placasEnSesion = new Set(bienesInventariados.map(b => b.placa))
      setBienesFaltantesFisico(todos.filter((b: any) => !placasEnSesion.has(b.placa) && !placasYaInventariadas.has(b.placa)))
    } catch { /* silenciar */ }
    setCargandoFaltantesFisico(false)
  }, [servicioActivoUnico, serviciosIncluidosMemo, bienesInventariados, placasYaInventariadas, cacheBienesServicio])

  const cargarInventariadosFisico = useCallback(async () => {
    setCargandoInventariadosFisico(true)
    try {
      const bienesDesdeSession = bienesInventariados.map(b => ({
        placa: b.placa, descripcion: b.descripcion || '', responsable: b.nombre_responsable || '', cedula: b.cedula_responsable || '',
        servicio_codigo: conteoInventario?.servicios.find(s => s.nombre === b.servicio)?.codigo || '', servicio_nombre: b.servicio || '',
      }))
      const placasDelServicio: string[] = servicioActivoUnico
        ? ((conteoInventario?.servicios.find(s => s.codigo === servicioActivoUnico.codigo) as any)?.placas_inventariadas ?? [])
        : serviciosIncluidosMemo.flatMap((svc: any) => ((conteoInventario?.servicios.find(s => s.codigo === svc.codigo) as any)?.placas_inventariadas ?? []) as string[])
      if (placasDelServicio.length > 0) {
        const API = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
        const res = await fetch(`${API}/almacen/admin/placas-inventariadas-servicio/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placas: placasDelServicio, detalle: true }) })
        if (res.ok) {
          const data = await res.json()
          const bienesDeReportes = (data.detalle ?? []).map((b: any) => ({ placa: b.placa, descripcion: b.descripcion || '', responsable: b.responsable || '', cedula: b.cedula || '', servicio_codigo: b.inventariado_en_servicio || b.servicio || '', servicio_nombre: b.inventariado_en_nombre || b.servicio_nombre || b.servicio || '' }))
          const placasSesion = new Set(bienesDesdeSession.map(b => b.placa))
          setBienesInventariadosFisico([...bienesDesdeSession, ...bienesDeReportes.filter((b: any) => !placasSesion.has(b.placa))])
        } else { setBienesInventariadosFisico(bienesDesdeSession) }
      } else { setBienesInventariadosFisico(bienesDesdeSession) }
    } catch { setBienesInventariadosFisico(bienesInventariados.map(b => ({ placa: b.placa, descripcion: b.descripcion || '', responsable: b.nombre_responsable || '', cedula: b.cedula_responsable || '', servicio_codigo: '', servicio_nombre: b.servicio || '' }))) }
    setCargandoInventariadosFisico(false)
  }, [servicioActivoUnico, serviciosIncluidosMemo, bienesInventariados, conteoInventario])

  // Recargar la lista de detalle abierta cuando cambie el servicio seleccionado
  // o el conjunto de servicios incluidos.
  useEffect(() => {
    if (nivelContadorActivo === 'faltantes') void cargarFaltantesFisico()
    else if (nivelContadorActivo === 'inventariados') void cargarInventariadosFisico()
  }, [servicioActivoUnico, serviciosIncluidosMemo, nivelContadorActivo, cargarFaltantesFisico, cargarInventariadosFisico])

  // Sincronizar bienes del modo colaborativo con el estado local (merge, no reemplazo)
  useEffect(() => {
    if (!colaborativo.sesionId || colaborativo.bienes.length === 0) return
    // No pintar bienes de la sesión colaborativa mientras el usuario NO haya
    // seleccionado su "Servicio a inventariar". Si no, al recargar la página la
    // tabla mostraba los bienes de la sesión activa del backend aunque no hubiera
    // servicio elegido. Los bienes deben verse SOLO tras elegir el servicio.
    if (!servicioSeleccionado) return

    setBienesInventariados(prev => {
      const placasLocales = new Set(prev.map(b => b.placa))

      // Bienes nuevos del WS que no tenemos localmente (escaneados por otro usuario).
      // Se ETIQUETAN con el servicio activo actual: en colaborativo TODOS los
      // bienes de la sesión pertenecen a este servicio (aquí ya sabemos que hay
      // uno seleccionado). Sin esta etiqueta, los bienes del compañero no se
      // verían en la tabla filtrada por servicio.
      const nuevosDelWS = colaborativo.bienes
        .filter(b => !placasLocales.has(b.placa))
        .map(b => ({ ...b, servicio_inv_codigo: (b as any).servicio_inv_codigo || servicioSeleccionado }))

      // NUNCA eliminar bienes locales por ausencia en el snapshot del WS.
      // Las eliminaciones reales llegan por el evento explícito
      // 'bien_eliminado_colaborativo' (ver useInventarioColaborativo) o por la
      // solicitud de eliminación aprobada, que ya remueven el bien de la tabla.
      // El pruning por antigüedad borraba los bienes recuperados de una sesión
      // anterior (localStorage) al iniciar una nueva sesión colaborativa.
      // Solo conservamos y, si aplica, actualizamos campos editados en remoto.
      const bienesWSMap = new Map(colaborativo.bienes.map(b => [b.placa, b]))
      let huboActualizacion = false
      const bienesActualizados = prev.map(local => {
        const remoto = bienesWSMap.get(local.placa)
        if (!remoto) return local
        // Solo actualizar si hay diferencias en campos editables.
        // Se incluye custodio_cedula: si solo cambia la cédula del custodio (no
        // el nombre), antes NO se detectaba el cambio y no se reflejaba al otro.
        if (local.estado !== remoto.estado || local.ubicacion !== remoto.ubicacion ||
            local.serial !== remoto.serial || local.custodio_nombre !== remoto.custodio_nombre ||
            local.custodio_cedula !== remoto.custodio_cedula) {
          huboActualizacion = true
          return { ...local, estado: remoto.estado, ubicacion: remoto.ubicacion, serial: remoto.serial, custodio_nombre: remoto.custodio_nombre, custodio_cedula: remoto.custodio_cedula }
        }
        return local
      })

      if (nuevosDelWS.length === 0 && !huboActualizacion) return prev

      // Los bienes nuevos del WS van al FINAL (respetan el orden de llegada,
      // igual que el emisor que los agrega con [...prev, nuevoBien]). Antes se
      // ponían al principio ([...nuevosDelWS, ...]) y por eso a un usuario le
      // aparecían en orden distinto al del otro.
      const merged = [...bienesActualizados, ...nuevosDelWS]
      guardarBienesEnStorage(merged)
      // Si llegó al menos un bien NUEVO por WS (escaneado por el otro usuario),
      // mover el resaltado/animación al último, igual que cuando escaneo yo.
      // Antes el merge no tocaba el índice y la animación se quedaba en el bien
      // viejo (no seguía al recién llegado).
      if (nuevosDelWS.length > 0) {
        setUltimoBienAgregadoIndex(merged.length - 1)
      }
      return merged
    })
  }, [colaborativo.bienes, colaborativo.sesionId, servicioSeleccionado])

  // Detectar nuevo participante via presencia y mostrar modal
  // Detección del modal "modo colaborativo" para EL QUE ENTRA:
  // cuando inicio mi sesión, el hook carga en `colaborativo.participantes` los
  // que YA estaban en el servicio (vienen en la respuesta de /iniciar/). Si hay
  // alguien distinto a mí, muestro el modal una sola vez.
  // (Al QUE YA ESTABA se le muestra por el evento `participante_unido`, arriba.)
  //
  // Set de cédulas de compañeros que YA fueron anunciados con el modal. Se usa
  // en lugar de un booleano para NO re-mostrar el modal cuando un compañero
  // "parpadea" en la lista de presencia (heartbeat perdido un ciclo). Antes, un
  // booleano se reseteaba en cuanto `otros.length===0` por un parpadeo, y al
  // reaparecer el compañero el modal salía otra vez cada 2-3 min. Ahora solo se
  // muestra para cédulas NUEVAS, y una cédula se "olvida" únicamente cuando el
  // participante desaparece de `colaborativo.participantes` (salida real), no
  // por una ausencia momentánea en presencia.
  const anunciadosRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!colaborativo.sesionId) return
    const miSvc = (servicioColab || '').trim()
    // Presencia viva del MISMO servicio (heartbeat reciente) → evita zombis.
    const cedulasVivas = new Set(
      presencia.usuarios
        .filter(u => u.estado === 'online' && (u.servicio || '').trim() === miSvc)
        .map(u => u.cedula),
    )
    const otros = colaborativo.participantes.filter(
      p => p.cedula && p.cedula !== cedulaActual && cedulasVivas.has(p.cedula),
    )

    // Mostrar el modal solo para compañeros cuya cédula NO se había anunciado.
    const nuevos = otros.filter(p => !anunciadosRef.current.has(p.cedula))
    if (nuevos.length > 0) {
      const ultimo = nuevos[nuevos.length - 1]
      setNuevoParticipante({ usuario: ultimo.usuario, cedula: ultimo.cedula, grupo: ultimo.grupo, cargo: ultimo.cargo, estado: 'online' })
      for (const p of nuevos) anunciadosRef.current.add(p.cedula)
    }

    // "Olvidar" solo a quienes YA NO están en la sesión colaborativa
    // (salida real, no un parpadeo de presencia). Así un reingreso real vuelve
    // a mostrar el modal, pero un parpadeo momentáneo no.
    const cedulasEnSesion = new Set(colaborativo.participantes.map(p => p.cedula))
    for (const ced of Array.from(anunciadosRef.current)) {
      if (!cedulasEnSesion.has(ced)) anunciadosRef.current.delete(ced)
    }
  }, [colaborativo.participantes, colaborativo.sesionId, cedulaActual, presencia.usuarios, servicioColab])

  // Escuchar eventos genéricos del colaborativo via estado reactivo (ultimoEvento)
  useEffect(() => {
    if (!colaborativo.ultimoEvento) return
    const { actionKey, data } = colaborativo.ultimoEvento

    // ─── Registros de obs/notas PREVIOS al entrar (carga inicial de la sesión) ───
    // El backend los envía en /iniciar/ y el hook los publica como este evento.
    // Se hace merge con los locales sin duplicar por id.
    if (actionKey === 'registros_iniciales' && Array.isArray(data.registros)) {
      const previos = data.registros as RegistroObservacion[]
      setRegistrosObsNotas((prev: RegistroObservacion[]) => {
        const ids = new Set(prev.map(r => r.id))
        const nuevos = previos.filter(r => r.id && !ids.has(r.id))
        if (nuevos.length === 0) return prev
        const merged = [...prev, ...nuevos]
        try { localStorage.setItem('inventario_observaciones_notas', JSON.stringify(merged)) } catch { /* */ }
        return merged
      })
    }

    // ─── Otro participante se unió al MISMO servicio → modal "modo colaborativo" ───
    // Este evento (participante_unido) lo emite el backend al grupo del servicio.
    // Se muestra el modal SOLO si esa cédula no había sido anunciada aún (mismo
    // Set que el efecto de arriba), para no repetir el modal cuando el otro
    // cliente re-emite el evento (p. ej. al reconectar su WS cada pocos min).
    if (actionKey === 'participante_unido' && data.cedula && data.cedula !== cedulaActual) {
      if (!anunciadosRef.current.has(data.cedula)) {
        anunciadosRef.current.add(data.cedula)
        setNuevoParticipante({
          usuario: data.usuario || 'Otro usuario',
          cedula: data.cedula,
          grupo: data.grupo || '',
          cargo: data.cargo || '',
          estado: 'online',
        })
      }
    }

    if (actionKey === 'inventario_guardado') {
      // Si el evento es de MÍ mismo (yo fui quien guardó), no re-limpiar ni mostrar
      // el toast "guardado por otro usuario": mi vista ya se limpió en handleGenerarFormato.
      const cedulaQuienGuardo = (data.usuario_cedula || '').trim()
      const yoGuarde = cedulaQuienGuardo && cedulaQuienGuardo === getAuthUserCedulaReal()
      if (yoGuarde) return
      toast.info(`El inventario fue guardado por ${data.usuario || 'otro usuario'} (${data.total_bienes} bienes). Se cerró la sesión colaborativa.`)
      // Limpieza COMPLETA en el lado del otro usuario, igual que hace quien guardó.
      // Sin esto, este usuario quedaba con los bienes ya guardados y al intentar
      // guardar de nuevo obtenía errores de "ya inventariado".
      setBienesInventariados([])
      limpiarInventarioStorage()      // 1) vaciar storage (si no, al recargar vuelven)
      // No limpiar observaciones/notas — son datos locales del usuario.
      // 2) Excluir/deseleccionar el(los) servicio(s) recién guardado(s) para que
      //    este usuario deba elegir uno nuevo antes de seguir plaqueteando.
      const svcGuardados: string[] = Array.isArray(data.servicios) ? data.servicios.filter(Boolean) : []
      if (svcGuardados.length > 0) {
        setServiciosExcluidos(prev => {
          const next = Array.from(new Set([...prev, ...svcGuardados]))
          localStorage.setItem('inventario_servicios_excluidos', JSON.stringify(next))
          return next
        })
        // Remover de la vista los bienes de los servicios recién guardados.
        const svcSet = new Set(svcGuardados)
        setBienesInventariados(prev => {
          const restantes = prev.filter(b => !svcSet.has(((b as any).servicio_inv_codigo) || ''))
          guardarBienesEnStorage(restantes)
          return restantes
        })
      }
      setServicioSeleccionado(null)
      servicioColaborativoRef.current = ''
      // 3) NO cerramos la sesión aquí: quien guardó ya llamó a cerrarSesion() en
      //    el backend, que emite `sesion_cerrada` al grupo. El hook colaborativo
      //    escucha ese evento y hace setSesionId(null) automáticamente, cerrando
      //    el modo colaborativo en este lado. (Ver useInventarioColaborativo.)
    }
    if (actionKey === 'inventario_limpiado') {
      toast.warning(`${data.usuario || 'Otro usuario'} limpió el inventario`)
      // Remover de la vista los bienes del servicio activo (el que se limpió).
      const svcActivo = servicioSeleccionado
      setBienesInventariados(prev => {
        const restantes = svcActivo
          ? prev.filter(b => (((b as any).servicio_inv_codigo) || '') !== svcActivo)
          : prev
        guardarBienesEnStorage(restantes)
        return restantes
      })
      // No limpiar observaciones/notas — son datos locales del usuario
    }

    // ─── Sincronización de observaciones/notas ────────────────────────────
    if (actionKey === 'observacion_agregada' || actionKey === 'nota_agregada') {
      const registro = data.registro as RegistroObservacion | undefined
      if (registro && data.cedula !== cedulaActual) {
        setRegistrosObsNotas((prev: RegistroObservacion[]) => {
          if (prev.some(r => r.id === registro.id)) return prev
          const nuevos = [...prev, registro]
          try { localStorage.setItem('inventario_observaciones_notas', JSON.stringify(nuevos)) } catch { /* */ }
          return nuevos
        })
        const tipoLabel = actionKey === 'observacion_agregada' ? 'observación' : 'nota'
        toast.info(`${data.usuario || 'Otro usuario'} agregó una ${tipoLabel} en ${data.placa || ''}`)
      }
    }

    if (actionKey === 'observacion_resuelta') {
      const registro = data.registro as RegistroObservacion | undefined
      if (registro && data.cedula !== cedulaActual) {
        setRegistrosObsNotas((prev: RegistroObservacion[]) => {
          const nuevos = prev.map(r => r.id === registro.id ? registro : r)
          try { localStorage.setItem('inventario_observaciones_notas', JSON.stringify(nuevos)) } catch { /* */ }
          return nuevos
        })
        toast.success(`${data.usuario || 'Otro usuario'} resolvió una observación en ${data.placa || ''}`)
      }
    }

    // ─── Alerta de placa duplicada (usa el canal colaborativo del servicio) ───
    // La recibe QUIEN YA TENÍA la placa: otro usuario intentó agregarla en su
    // servicio y el backend se lo bloqueó. Yo la conservo; solo muestro alerta.
    if (actionKey === 'placa_duplicada_alerta' && data.placa) {
      // Va dirigida a mi cédula (o sin destino específico).
      if (data.cedula_destino && data.cedula_destino !== cedulaActual) return
      // Solo si efectivamente la tengo en mi tabla.
      if (!bienesRef.current.some(b => b.placa === data.placa)) return
      // Este efecto lo recibe QUIEN YA TIENE la placa. Debe ver el texto que
      // nombra al OTRO (quien intentó agregarla). "miSvc" es MI servicio (donde
      // ya la tengo); "svcIntento" es el servicio donde el otro intentó.
      const quienIntento = data.usuario_intento || 'Otra persona'
      const svcIntento = data.servicio_intento || 'otro servicio'
      const miSvc = servicioActivoInfo?.nombre || servicioSeleccionado || 'tu servicio'
      const msg = `${quienIntento} intentó agregar el bien ${data.placa} en el servicio ${svcIntento}, pero este bien ya registra inventariado en ${miSvc}. Subsanar de inmediato esta novedad.`
      setAlertaDuplicado(`PLACA DUPLICADA: ${msg}`)
      alertaInventario.placaDuplicadaServicio(data.placa, msg)
      const notaDup = crearNotaAutomatica(
        data.placa, '',
        `El bien ${data.placa} lo tiene inventariado ${usuarioActual} en ${miSvc}. ${quienIntento} intentó agregarlo en ${svcIntento} pero NO se le permitió. Subsanar de inmediato esta novedad.`,
        // El argumento servicio se guarda como CÓDIGO del servicio activo
        // (convención unificada). `miSvc` (nombre) se conserva SOLO en el texto
        // legible del mensaje y del contexto, no como campo de servicio.
        servicioSeleccionado || servicioActivoInfo?.codigo || '', '', `DUPLICADO EN VIVO: ${miSvc} ↔ ${svcIntento}`,
        getAuthUserCedulaReal() || getAuthUserCedula(),
      )
      setRegistrosObsNotas(prev => (prev.some(r => r.placa === data.placa && r.contexto?.startsWith('DUPLICADO EN VIVO')) ? prev : [...prev, notaDup]))
    }

    // ─── Eliminación colaborativa ya no se maneja aquí (se usa presencia hook) ───
  }, [colaborativo.ultimoEvento])

  // Cargar ubicaciones de TNS para el modal de editar ubicación
  // Ubicaciones TNS cargadas desde hook compartido
  useUbicacionesTNS()

  // Cargar contadores cuando la pestaña se activa. Se trae UNA sola vez por
  // sesión (caché en memoria): al cambiar de módulo y volver, NO re-consulta.
  useEffect(() => {
    if (!activo) return
    if (conteoInventario) return // Ya está en estado
    if (conteoInventarioCache) { setConteoInventario(conteoInventarioCache); return } // Reusar caché

    const cargarConteo = async () => {
      try {
        const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
        const res = await fetch(`${API_URL}/almacen/admin/contar-bienes-servicio/`)
        if (res.ok) {
          const data = await res.json()
          conteoInventarioCache = data
          setConteoInventario(data)
        } else {
          const vacio = { servicios: [], total_activos: 0, total_inventariados: 0, anio: new Date().getFullYear() }
          setConteoInventario(vacio)
        }
      } catch {
        const vacio = { servicios: [], total_activos: 0, total_inventariados: 0, anio: new Date().getFullYear() }
        setConteoInventario(vacio)
      }
    }
    cargarConteo()
  }, [activo, conteoInventario])

  // Cargar placas ya inventariadas directamente desde el conteo (viene del backend con todas las del año)
  useEffect(() => {
    if (!conteoInventario) return
    const placasGlobal = (conteoInventario as any).placas_inventariadas ?? []
    if (placasGlobal.length > 0) {
      setPlacasYaInventariadas(new Set(placasGlobal))
    } else {
      setPlacasYaInventariadas(new Set())
    }
  }, [conteoInventario])

  // Mantener el foco en el input del escáner: solo al montar (no invasivo)
  // Se usa devolverFoco() manualmente después de cerrar modales o procesar códigos
  const hayModalAbierto = mostrarModalUbicacion || mostrarModalObservacion || mostrarModalEliminar || mostrarModalCustodio || mostrarModalSerial || mostrarModalLimpiar || mostrarModalColaboradores || mostrarModalBienSinPlaca || !!alertaDuplicado || mostrarModalBienesServicio || mostrarConsultaCoordinador || mostrarModalFaltantesFisico || mostrarModalInventariadosFisico || mostrarModalAlertasFisico || (bienesModalServicio.length > 0 || cargandoModalServicio)

  useEffect(() => {
    // Focus inicial al montar (solo una vez)
    if (!hayModalAbierto) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-foco permanente: al hacer click en zona no interactiva, devolver foco al escáner
  useEffect(() => {
    if (hayModalAbierto) return

    const handleClickAnywhere = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Si el usuario está seleccionando texto (para copiar), NO robar el foco.
      const seleccion = window.getSelection?.()
      if (seleccion && seleccion.toString().length > 0) return

      const isInteractive = target.tagName === 'INPUT' ||
                            target.tagName === 'SELECT' ||
                            target.tagName === 'TEXTAREA' ||
                            target.tagName === 'BUTTON' ||
                            target.closest('button') !== null ||
                            target.closest('[data-selector]') !== null ||
                            target.closest('[role="dialog"]') !== null ||
                            target.closest('.modal') !== null ||
                            target.closest('.inventario-fisico__modal-overlay') !== null ||
                            // Panel lateral de contadores: el usuario navega/selecciona
                            // ahí sin que el escáner le robe el foco.
                            target.closest('.consulta-lateral') !== null
      if (!isInteractive) {
        const scrollParent = document.querySelector('.consulta-central__body') as HTMLElement | null
        const prevScroll = scrollParent?.scrollTop ?? 0
        setTimeout(() => {
          inputRef.current?.focus({ preventScroll: true })
          if (scrollParent) scrollParent.scrollTop = prevScroll
        }, 50)
      }
    }

    // También capturar teclas sueltas: si se presiona una tecla alfanumérica sin foco en input, redirigir al escáner
    const handleKeyCapture = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      if (isInInput) return
      // Solo teclas alfanuméricas (no Escape, Enter, Tab, etc.)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Preservar posición de scroll al dar foco
        const scrollParent = document.querySelector('.consulta-central__body') as HTMLElement | null
        const prevScroll = scrollParent?.scrollTop ?? 0
        inputRef.current?.focus({ preventScroll: true })
        if (scrollParent) scrollParent.scrollTop = prevScroll
      }
    }

    document.addEventListener('click', handleClickAnywhere)
    document.addEventListener('keydown', handleKeyCapture)
    return () => {
      document.removeEventListener('click', handleClickAnywhere)
      document.removeEventListener('keydown', handleKeyCapture)
    }
  }, [hayModalAbierto]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape/Enter para cerrar modales (useEffect con dependencias actualizadas)
  useEffect(() => {
    const handleModalKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (alertaDuplicado) { setAlertaDuplicado(null); devolverFoco(100); return }
        if (mostrarModalSerial) { setMostrarModalSerial(null); return }
        if (mostrarModalCustodio) { setMostrarModalCustodio(null); return }
        if (mostrarModalObservacion) { setMostrarModalObservacion(false); return }
        if (mostrarModalUbicacion) { setMostrarModalUbicacion(false); return }
        if (mostrarModalEliminar) { setMostrarModalEliminar(null); return }
        if (mostrarModalLimpiar) { setMostrarModalLimpiar(false); return }
        if (mostrarModalColaboradores) { setMostrarModalColaboradores(false); return }
        if (bienesModalServicio.length > 0 || cargandoModalServicio) { setBienesModalServicio([]); setCargandoModalServicio(false); setFiltroModalBienes(''); return }
        if (mostrarModalBienesServicio) { setMostrarModalBienesServicio(false); return }
        if (mostrarConsultaCoordinador) { setMostrarConsultaCoordinador(false); return }
      }
      // El modal de placa duplicada solo se cierra con Escape (arriba) o con su
      // botón "Entendido". NO se cierra con Enter: el mismo Enter que dispara el
      // escaneo (o su key-repeat) cerraba el modal en el acto tras deshabilitarse
      // el input, haciendo que la alerta nunca fuera visible.
    }
    document.addEventListener('keydown', handleModalKeys)
    return () => document.removeEventListener('keydown', handleModalKeys)
  }, [alertaDuplicado, mostrarModalSerial, mostrarModalCustodio, mostrarModalObservacion, mostrarModalUbicacion, mostrarModalEliminar, mostrarModalLimpiar, mostrarModalColaboradores, bienesModalServicio, cargandoModalServicio, mostrarModalBienesServicio, mostrarConsultaCoordinador])
  
  // Devolver el foco al escáner cuando se cierran los modales (solo los de edición directa)
  useEffect(() => {
    if (!hayModalAbierto) {
      devolverFoco(150)
    }
  }, [hayModalAbierto]) // eslint-disable-line react-hooks/exhaustive-deps

  // `codigoOverride` permite reutilizar TODO el flujo de escaneo desde otros
  // orígenes (p. ej. el botón "Agregar" de las tarjetas de faltantes) sin pasar
  // por el input del escáner. Cuando viene, se usa ese valor en lugar del estado
  // `codigoBarras`; así se conservan todas las validaciones (servicio, duplicado,
  // baja, pertenencia), los conteos, la persistencia en storage, la sync
  // colaborativa y el descuento de faltantes.
  const procesarCodigoBarras = async (codigoOverride?: string) => {
    const codigoEntrada = (codigoOverride ?? codigoBarras)
    if (!codigoEntrada.trim()) return

    // Bloqueo OBLIGATORIO: si acaba de entrar un participante al modo
    // colaborativo, no se pueden agregar placas hasta que el usuario reconozca
    // el aviso ("Entendido, continuar"). Evita seguir escaneando sin enterarse
    // de que otro se conectó al mismo servicio.
    if (nuevoParticipante) {
      toast.warning('Confirme el aviso de modo colaborativo ("Entendido") antes de continuar.')
      setCodigoBarras('')
      return
    }

    // Bloqueo: debe haber un servicio seleccionado antes de plaquetear.
    if (!servicioSeleccionado) {
      toast.warning('Primero selecciona el "Servicio a inventariar" (arriba a la izquierda).')
      setCodigoBarras('')
      return
    }

    const codigoBusqueda = codigoEntrada.trim()
    
    // Verificar si la placa ya fue procesada (duplicado)
    const placaDuplicada = bienesInventariados.find(b => b.placa === codigoBusqueda)
    if (placaDuplicada) {
      const ubicacionInfo = placaDuplicada.ubicacion ? ` — Ubicación: ${placaDuplicada.ubicacion}` : ''
      setAlertaDuplicado(`PLACA DUPLICADA: ${codigoBusqueda} ya fue procesada en este inventario${ubicacionInfo}. Revise si es un error.`)
      setCodigoBarras('')
      // Crear nota automática de duplicado local
      const nota = crearNotaAutomatica(
        placaDuplicada.placa,
        placaDuplicada.descripcion || '',
        `Placa duplicada: escaneada dos veces en la misma sesión. Verificar bien físico.`,
        // Servicio como CÓDIGO del servicio activo (convención unificada), no el
        // nombre de dependencia del bien (placaDuplicada.servicio).
        servicioSeleccionado || servicioActivoInfo?.codigo || '',
        placaDuplicada.ubicacion || '',
        `DUPLICADO LOCAL: sesión actual`,
        getAuthUserCedulaReal() || getAuthUserCedula(),
      )
      actualizarRegistrosObsNotas([...registrosObsNotas, nota])
      return
    }

    // El bloqueo cross-servicio/cross-usuario lo hace ÚNICAMENTE el backend, de
    // forma atómica contra la tabla auxiliar (estados en_curso/inventariado/
    // eliminado). Aquí ya NO se consulta la ref local `placasOtrasDuplasRef`:
    // esa ref podía tener datos viejos (placas ya liberadas) y bloqueaba con
    // falsos positivos. Si el backend detecta duplicado, `escanearBien` responde
    // con `duplicado`/`duplicadoGlobal` y se muestra el modal (ver más abajo).

    setProcesando(true)

    try {
      const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
      
      // Determinar si parece placa (numérico o empieza con F seguido de números) o serial
      const pareceSerPlaca = /^[0-9]+$/.test(codigoBusqueda) || /^F\d+$/i.test(codigoBusqueda)
      
      let json = null
      
      if (pareceSerPlaca) {
        // Buscar primero por placa, luego por serial
        const res1 = await fetch(`${API_URL}/almacen/admin/buscar-bien/?placa=${codigoBusqueda}`)
        json = res1.ok ? await res1.json() : null
        
        if (!json || !json.data) {
          const res2 = await fetch(`${API_URL}/almacen/admin/buscar-bien/?serial=${codigoBusqueda}`)
          json = res2.ok ? await res2.json() : null
        }
      } else {
        // Buscar primero por serial, luego por placa
        const res1 = await fetch(`${API_URL}/almacen/admin/buscar-bien/?serial=${codigoBusqueda}`)
        json = res1.ok ? await res1.json() : null
        
        if (!json || !json.data) {
          const res2 = await fetch(`${API_URL}/almacen/admin/buscar-bien/?placa=${codigoBusqueda}`)
          json = res2.ok ? await res2.json() : null
        }
      }
      
      if (json && json.data) {
        const bien = json.data
        
        // Verificar si ya se procesó este bien por placa (en caso de búsqueda por serial)
        const bienDuplicado = bienesInventariados.find(b => b.placa === bien.codigo)
        if (bienDuplicado) {
          const ubicacionInfo = bienDuplicado.ubicacion ? ` — Ubicación: ${bienDuplicado.ubicacion}` : ''
          setAlertaDuplicado(`PLACA DUPLICADA: ${bien.codigo} ya fue procesada en este inventario${ubicacionInfo}. Revise si es un error.`)
          setCodigoBarras('')
          setProcesando(false)
          return
        }
        
        // ─── Lógica de pertenencia: bodega vs servicio ───────────────────────
        const codigoServicio = bien.codigoDependencia || ''
        const nombreServicio = bien.dependencia || codigoServicio
        const bienEsDeBodega = esBodegaPorCodigo(codigoServicio)
        // ¿Estoy inventariando una bodega? (el servicio activo es bodega)
        const inventariandoBodega = !!servicioActivoInfo?.es_bodega
        // ¿El bien pertenece a la MISMA bodega que estoy inventariando?
        const esLaMismaBodega = bienEsDeBodega && codigoServicio === servicioSeleccionado

        // ¿El bien pertenece realmente al servicio que se está inventariando?
        // Se compara por el CÓDIGO del servicio activo seleccionado y, de forma
        // complementaria, contra la lista de servicios activos (si trae datos) y
        // contra el NOMBRE de la dependencia activa (fallback cuando el código
        // del bien viene vacío). Así la alerta de campana se dispara SIEMPRE que
        // el servicio no coincida, incluso con `codigosServiciosActivos` vacío o
        // `codigoServicio` vacío.
        const nombreServicioActivo = (servicioActivoInfo?.nombre || '').trim()
        const perteneceAlServicioActivo =
          // Coincide con el servicio seleccionado por el usuario.
          (!!codigoServicio && codigoServicio === servicioSeleccionado) ||
          // O está dentro de los servicios activos del conteo.
          (codigosServiciosActivos.length > 0 && !!codigoServicio && codigosServiciosActivos.includes(codigoServicio)) ||
          // Fallback por nombre cuando el bien no trae código de dependencia.
          (!codigoServicio && !!nombreServicioActivo && nombreServicio.trim() === nombreServicioActivo)

        if (bienEsDeBodega && !esLaMismaBodega) {
          // ERROR CRÍTICO: un bien de bodega apareció en un servicio (o en otra
          // bodega distinta a la que se inventaría). No debe estar así: hay que
          // formalizarlo (asignarlo a un responsable) o devolverlo a bodega.
          toast.critical(`🚫 ${bien.codigo} pertenece a "${nombreServicio}" (bodega). Este bien debe formalizarse ahora mismo o trasladarlo a bodega.`)
          alertaInventario.bienBP001(bien.codigo, nombreServicio)
        } else if (!bienEsDeBodega && !inventariandoBodega && !perteneceAlServicioActivo) {
          // Advertencia: pertenece a OTRO servicio (no bodega). Se registra pero
          // no suma al conteo del servicio activo. SIEMPRE queda en la campana,
          // aunque la lista de servicios activos esté vacía o el bien no traiga
          // código de dependencia.
          const nombreMostrar = nombreServicio || 'otro servicio'
          toast.warning(`⚠ ${bien.codigo} pertenece a "${nombreMostrar}" y no a "${nombreServicioActivo || servicioSeleccionado || 'el servicio actual'}". Se registrará pero NO sumará al conteo del servicio activo.`)
          alertaInventario.placaServicioDiferente(bien.codigo, nombreMostrar)
        }
        // Si estoy inventariando la bodega y el bien es de esa bodega → normal, sin alerta.
        
        // Verificar último documento para detectar baja (BJ/CB) — BLOQUEA el escaneo
        const prefijo = (bien.ultimoPrefijo || '').trim()
        if (prefijo === 'BJ' || prefijo === 'CB') {
          const tipoDoc = prefijo === 'BJ' ? 'DADO DE BAJA' : 'CON BAJA CONFIRMADA'
          // Toast corto (aviso inmediato). El detalle completo (documento/fecha)
          // queda registrado en la notificación de la campana.
          toast.critical(`🚫 ${bien.codigo} ${prefijo === 'BJ' ? 'está DADO DE BAJA' : 'tiene BAJA CONFIRMADA'}. ¡NO DEBE CONTINUAR EL SERVICIO!`)
          alertaInventario.bienEnBaja(bien.codigo, `${prefijo}${bien.ultimoNumeroDocumento || ''}`, tipoDoc, bien.ultimoPrefijoFecha)
          setCodigoBarras('')
          inputRef.current?.focus({ preventScroll: true })
          setProcesando(false)
          return
        }

        
        
        // Crear objeto de bien para inventario
        const nuevoBien: BienInventario = {
          placa: bien.codigo,
          descripcion: bien.desmat || '',
          serial: bien.serial || 'N/A',
          estado: 'B',  // Por defecto Bueno
          cedula_responsable: bien.cedulaResponsable || '',
          nombre_responsable: bien.responsable || '',
          servicio: bien.dependencia || '',
          ubicacion: bien.ubicacion || '',
          timestamp: new Date().toISOString(),
          // Etiqueta del servicio a inventariar activo: aísla la vista por servicio.
          servicio_inv_codigo: servicioSeleccionado || undefined,
        }

        // Ubicación física de la sesión: si el usuario la definió, todos los bienes
        // que agregue se asocian a ella (sobrescribe la ubicación de origen del bien).
        if (ubicacionFisica.trim()) {
          nuevoBien.ubicacion = ubicacionFisica.trim()
        }

        // Modo delegación: auto-asignar persona presente como usuario/custodio
        if (personaPresente) {
          nuevoBien.custodio_nombre = personaPresente.nombre
          nuevoBien.custodio_cedula = personaPresente.cedula
        } else {
          // Auto-asignar el responsable del bien como custodio (mismo comportamiento que carga masiva)
          nuevoBien.custodio_nombre = bien.responsable || ''
          nuevoBien.custodio_cedula = bien.cedulaResponsable || ''
        }
        
        // Si modo colaborativo activo, enviar al backend (se sincroniza por WS)
        if (colaborativo.sesionId) {
          // Optimista: agregar localmente de inmediato para evitar pérdida por race condition
          const bienConTimestamp = { ...nuevoBien, timestamp: new Date().toISOString() }
          setBienesInventariados(prev => {
            if (prev.some(b => b.placa === nuevoBien.placa)) return prev
            const nuevaLista = [...prev, bienConTimestamp]
            guardarBienesEnStorage(nuevaLista)
            return nuevaLista
          })
          setUltimoBienAgregadoIndex(bienesInventariados.length)

          // Enviar al backend (si falla por duplicado, revertir). El backend
          // valida de forma ATÓMICA contra la tabla auxiliar (todas las sesiones
          // activas), así que el bloqueo es inmediato y confiable, sin depender
          // de que el evento WS haya llegado.
          const resultado = await colaborativo.escanearBien(nuevoBien)
          if (!resultado.ok) {
            if (resultado.duplicado) {
              // Revertir el agregado optimista
              setBienesInventariados(prev => {
                const nuevaLista = prev.filter(b => b.placa !== nuevoBien.placa)
                guardarBienesEnStorage(nuevaLista)
                return nuevaLista
              })
              if (resultado.duplicadoGlobal) {
                // La placa ya está en OTRO servicio/usuario. Lo ve QUIEN INTENTA,
                // y debe nombrar al OTRO (quien YA la tiene). "otroUsuario" y
                // "otroSvc" son el usuario y servicio de quien ya la tenía.
                const otroUsuario = resultado.dupUsuario || 'Otra persona'
                const otroSvc = resultado.dupServicio || 'otro servicio'
                const msg = `${otroUsuario} ya tiene el bien ${bien.codigo} inventariado en el servicio ${otroSvc}. NO se agregó a la toma de inventario actual de ${servicioActivoInfo?.nombre || servicioSeleccionado || 'tu servicio'}. Subsanar de inmediato esta novedad.`
                setAlertaDuplicado(`PLACA DUPLICADA: ${msg}`)
                alertaInventario.placaDuplicadaServicio(bien.codigo, msg)
                // Nota: el aviso a quien YA tenía la placa lo emite el BACKEND
                // directamente al grupo WS de su servicio (más confiable que
                // enviarlo desde aquí). Ver escanear_bien_colaborativo.
              } else {
                // Duplicado colaborativo: la misma sesión, otro usuario ya tiene la placa.
                // El usuario que intenta también debe recibir la alerta en la campana.
                const msg = `La placa ${bien.codigo} ya fue procesada por otro usuario en esta misma sesión. Revise si es un error.`
                setAlertaDuplicado(`PLACA DUPLICADA: ${msg}`)
                alertaInventario.placaDuplicadaServicio(bien.codigo, msg)
              }
            } else {
              toast.error(resultado.error || 'Error al registrar bien colaborativo')
              // No revertir en caso de error de red — el bien queda local como respaldo
            }
          }
        } else {
          // Modo local (fallback sin colaborativo)
          setBienesInventariados(prev => {
            const nuevaLista = [...prev, nuevoBien]
            guardarBienesEnStorage(nuevaLista)
            setUltimoBienAgregadoIndex(nuevaLista.length - 1)
            return nuevaLista
          })
        }
        
        // Mensaje diferente según si se buscó por placa o serial
        // Propagar el escaneo por WS (con identidad) para que otras duplas
        // detecten en caliente si YA tienen esta placa en su tabla. La detección
        // de duplicado es peer-to-peer (ver efecto ultimoBienEscaneadoExterno);
        // aquí NO usamos "ya_inventariado" (histórico) para no dar falsos positivos.
        fetch(`${API_URL}/almacen/admin/notificar-escaneo/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ placa: bien.codigo, usuario: usuarioActual, servicio: servicioActivoInfo?.nombre || servicioSeleccionado || '', cedula: cedulaActual })
        }).catch(() => {})
      } else {
        toast.error(`❌ No se encontró bien con placa o serial: ${codigoBusqueda}`)
        alertaInventario.placaNoRegistrada(codigoBusqueda)
      }
    } catch (error) {
      toast.error(`❌ Error al procesar código: ${error}`)
    }

    setProcesando(false)
    setCodigoBarras('')
    
    // Mantener el foco en el input para continuar escaneando
    devolverFoco()
  }

  // Agrega al inventario un bien faltante (desde su tarjeta en el panel de
  // contadores) reutilizando el flujo REAL de escaneo. De esta forma se aplican
  // las mismas validaciones (servicio, duplicado, baja, pertenencia), se
  // actualizan los conteos y el storage, se propaga por el colaborativo y la
  // placa deja de contarse como faltante.
  const agregarPlacaAlInventario = (placa: string) => {
    const valor = (placa || '').trim()
    if (!valor) return
    void procesarCodigoBarras(valor)
  }

  // ─── Funciones CRUD desde hooks compartidos (con toast/UI específico) ────
  const eliminarBien = (index: number) => {
    const placa = bienesInventariados[index]?.placa
    const descripcion = bienesInventariados[index]?.descripcion || ''

    // Solo es colaborativo si hay otro usuario online EN MI MISMO servicio.
    // `presencia.usuarios` es global (incluye gente de otros servicios), por eso
    // hay que filtrar por servicio: si nadie de mi servicio está conmigo, la
    // eliminación es directa aunque haya usuarios de otros servicios en línea.
    const otrosEnMiServicio = presencia.usuarios.filter(
      u => u.estado === 'online' && (u.servicio || '').trim() && (u.servicio || '').trim() === (servicioColab || '').trim(),
    )
    if (otrosEnMiServicio.length > 0 && placa) {
      presencia.solicitarEliminarBien(placa, descripcion)
      setMostrarModalEliminar(null)
      devolverFoco()
      return
    }

    // Sin nadie más → eliminar directo
    eliminarBienHook(index)
    // Al eliminar, la placa vuelve a ser FALTANTE: quitarla del set de
    // inventariadas en caliente y del caché de bloqueo, para que el contador de
    // faltantes la vuelva a sumar y se pueda re-escanear sin falsa alerta.
    if (placa) {
      setPlacasYaInventariadas(prev => {
        if (!prev.has(placa)) return prev
        const next = new Set(prev)
        next.delete(placa)
        return next
      })
      placasOtrasDuplasRef.current.delete(placa)
      // Si el bien tenía nota/observación, se descarta al eliminarlo.
      actualizarRegistrosObsNotas(registrosObsNotas.filter(r => r.placa !== placa))
    }
    // Ajustar indicador del último bien si se eliminó el actual
    if (index === ultimoBienAgregadoIndex) {
      setUltimoBienAgregadoIndex(bienesInventariados.length - 2 >= 0 ? bienesInventariados.length - 2 : null)
    } else if (ultimoBienAgregadoIndex !== null && index < ultimoBienAgregadoIndex) {
      setUltimoBienAgregadoIndex(ultimoBienAgregadoIndex - 1)
    }
    if (colaborativo.sesionId && placa) {
      void colaborativo.eliminarBien(placa)
    }
    // El "bien eliminado" ya NO se envía a la campana (solo toast en pantalla).
    setMostrarModalEliminar(null)
    toast.success('Bien eliminado del inventario')
    devolverFoco()
  }

  // Ejecutar eliminación cuando el otro aprueba
  useEffect(() => {
    if (presencia.eliminacionAprobadaPlaca) {
      const placa = presencia.eliminacionAprobadaPlaca
      const idx = bienesInventariados.findIndex(b => b.placa === placa)
      if (idx >= 0) {
        eliminarBienHook(idx)
        if (colaborativo.sesionId) void colaborativo.eliminarBien(placa)
      }
      // La placa eliminada vuelve a ser faltante: liberarla de los sets.
      setPlacasYaInventariadas(prev => {
        if (!prev.has(placa)) return prev
        const next = new Set(prev)
        next.delete(placa)
        return next
      })
      placasOtrasDuplasRef.current.delete(placa)
      toast.success(`Eliminación aprobada: ${placa}`)
    }
  }, [presencia.eliminacionAprobadaPlaca])
  
  const abrirModalEliminar = (index: number, placa: string) => {
    setMostrarModalEliminar({ index, placa })
  }

  const agregarBienSinPlaca = (bien: { descripcion: string; ubicacion: string; servicio: string; custodio_nombre: string; custodio_cedula: string }) => {
    // El hook agrega el bien local y DEVUELVE la placa SP- generada. Usamos esa
    // MISMA placa para sincronizar por el colaborativo, así el eco del WS trae
    // la misma placa y el merge la deduplica (antes se generaba una segunda
    // placa SP- distinta con setTimeout+localStorage y el bien se duplicaba).
    const placaSP = agregarBienSinPlacaHook(bien)
    // Etiquetar el bien recién agregado con el servicio activo (aísla la vista).
    if (placaSP && servicioSeleccionado) {
      setBienesInventariados(prev => prev.map(b => b.placa === placaSP ? { ...b, servicio_inv_codigo: servicioSeleccionado } : b))
    }
    if (colaborativo.sesionId && placaSP) {
      void colaborativo.escanearBien({
        placa: placaSP,
        descripcion: bien.descripcion,
        serial: 'N/A',
        estado: 'B',
        cedula_responsable: bien.custodio_cedula,
        nombre_responsable: bien.custodio_nombre,
        servicio: bien.servicio,
        ubicacion: bien.ubicacion,
        custodio_nombre: bien.custodio_nombre,
        custodio_cedula: bien.custodio_cedula,
      })
    }
    toast.success(`Bien sin placa agregado: ${bien.descripcion.substring(0, 40)}`)
    setMostrarModalBienSinPlaca(false)
    devolverFoco()
  }

  const limpiarInventario = () => {
    // Solo es colaborativo si hay otro usuario online EN MI MISMO servicio.
    // (presencia.usuarios es global; filtrar por servicio evita pedir aprobación
    // a usuarios de OTROS servicios que no tienen nada que ver con mi inventario.)
    const otrosEnMiServicio = presencia.usuarios.filter(
      u => u.estado === 'online' && (u.servicio || '').trim() && (u.servicio || '').trim() === (servicioColab || '').trim(),
    )
    if (otrosEnMiServicio.length > 0) {
      presencia.solicitarLimpiar(bienesInventariados.length)
      setMostrarModalLimpiar(false)
      toast.info('Solicitud de limpieza enviada. Esperando aprobación...')
      devolverFoco(150)
      return
    }

    // Sin nadie más en línea → limpiar solo los del servicio activo
    limpiarClaveServicioActivo()
    limpiarRegistrosStorage()
    actualizarRegistrosObsNotas([])
    if (colaborativo.sesionId) void colaborativo.limpiarBienes()
    setMostrarModalLimpiar(false)
    toast.success('Inventario limpiado correctamente')
    devolverFoco(150)
  }

  // ─── Aprobación/rechazo de solicitudes de eliminación ─────────────────────
  // Cuando el otro usuario aprueba nuestra solicitud de limpiar
  useEffect(() => {
    if (presencia.limpiarAprobado) {
      limpiarClaveServicioActivo()
      limpiarRegistrosStorage()
      actualizarRegistrosObsNotas([])
      if (colaborativo.sesionId) void colaborativo.limpiarBienes()
      toast.success('Limpieza aprobada. Inventario limpiado.')
    }
  }, [presencia.limpiarAprobado])

  // Cuando aprobamos la solicitud del otro
  const aprobarLimpiarLocal = () => {
    presencia.aprobarLimpiar()
    // Enviar también por WS directo del colaborativo para inmediatez
    if (colaborativo.sesionId) {
      colaborativo.emitirEvento('inventario_limpiado', { usuario: usuarioActual })
      void colaborativo.limpiarBienes()
    }
    limpiarClaveServicioActivo()
    limpiarRegistrosStorage()
    actualizarRegistrosObsNotas([])
    if (colaborativo.sesionId) void colaborativo.limpiarBienes()
    toast.success('Limpieza aprobada y ejecutada')
  }

  const rechazarLimpiarLocal = () => {
    presencia.rechazarLimpiar()
    toast.info('Solicitud de limpieza rechazada')
  }

  // ─── Wrappers que sincronizan con colaborativo ────────────────────────────
  const editarEstado = (index: number, nuevoEstado: 'B' | 'R' | 'M') => {
    editarEstadoLocal(index, nuevoEstado)
    const placa = bienesInventariados[index]?.placa
    // Al SALIR de estado M (pasa a B o R), el motivo de la baja ya no aplica:
    // se elimina la nota de ese bien.
    if (nuevoEstado !== 'M' && placa) {
      actualizarRegistrosObsNotas(registrosObsNotas.filter(r => !(r.placa === placa && r.tipo === 'nota')))
    }
    if (colaborativo.sesionId && placa) {
      void colaborativo.actualizarBien(placa, 'estado', nuevoEstado)
    }
  }

  const editarSerial = (index: number, nuevoSerial: string) => {
    editarSerialLocal(index, nuevoSerial)
    const placa = bienesInventariados[index]?.placa
    if (colaborativo.sesionId && placa) {
      void colaborativo.actualizarBien(placa, 'serial', nuevoSerial)
    }
  }

  const editarUbicacion = (index: number, nuevaUbicacion: string) => {
    editarUbicacionLocal(index, nuevaUbicacion)
    const placa = bienesInventariados[index]?.placa
    if (colaborativo.sesionId && placa) {
      void colaborativo.actualizarBien(placa, 'ubicacion', nuevaUbicacion)
    }
  }

  const handleGenerarFormato = async (colaborador1: Colaborador, colaborador2: Colaborador, sede: string, ubicacion: string) => {
    // Solo se guarda lo del SERVICIO ACTIVO (lo que el usuario ve y confirma).
    // La lista completa puede tener bienes de otros servicios aún sin guardar.
    const bienesAGuardar = bienesDelServicioActivo

    // Validar observaciones pendientes SOLO de los bienes del servicio que se va
    // a guardar y del usuario actual. Se usa el MISMO helper que la campana
    // (obtenerBloqueantesVisibles con servicio + cédula) para que lo que bloquea
    // el guardado coincida con lo que muestra la campana de alertas.
    const placasAGuardar = new Set(bienesAGuardar.map(b => b.placa))
    // Bloqueo de guardado: CÓDIGO del servicio activo (convención unificada)
    // para comparar código-contra-código con r.servicio. Solo se usa como clave
    // del filtro; el mensaje de error usa `placas`, no esta variable.
    const servicioGuardado = servicioSeleccionado || servicioActivoInfo?.codigo || ''
    const pendientesDelServicio = obtenerBloqueantesVisibles(registrosObsNotas, {
      servicio: servicioGuardado,
      cedula: cedulaFiltroObs,
    }).filter(r => placasAGuardar.has(r.placa))
    if (pendientesDelServicio.length > 0) {
      const placas = pendientesDelServicio.map(r => r.placa).join(', ')
      toast.critical(`❌ No se puede guardar el inventario. Hay ${pendientesDelServicio.length} observación(es) pendiente(s) en: ${placas}. Resuélvalas antes de continuar.`)
      setMostrarModalColaboradores(false)
      return
    }

    // Validar que todos los bienes tengan custodio asignado
    const bienesSinCustodio = bienesAGuardar.filter(b => !b.custodio_nombre || !b.custodio_cedula)
    if (bienesSinCustodio.length > 0) {
      const placas = bienesSinCustodio.slice(0, 5).map(b => b.placa).join(', ')
      toast.critical(`No se puede guardar el inventario. ${bienesSinCustodio.length} bien(es) no tienen usuario asignado: ${placas}${bienesSinCustodio.length > 5 ? '...' : ''}. Debe asignar usuario a todos los bienes.`)
      setMostrarModalColaboradores(false)
      return
    }

    // Validar que no haya bienes ya reportados en inventarios anteriores
    try {
      const placasActuales = bienesAGuardar.map(b => b.placa)
      const duplicadas = await verificarPlacasYaInventariadas(placasActuales)
      if (duplicadas.length > 0) {
        toast.critical(`❌ No se puede guardar. ${duplicadas.length} bien(es) ya fueron reportados en inventarios anteriores: ${duplicadas.slice(0, 10).join(', ')}${duplicadas.length > 10 ? '...' : ''}. Elimínelos de la lista antes de continuar.`)
        setMostrarModalColaboradores(false)
        setGenerandoPDF(false)
        return
      }
    } catch { /* Si falla la validación, continuar */ }
    
    setGenerandoPDF(true)
    
    try {
      // Determinar servicios incluidos
      const habilitadosGlobal = serviciosHabilitadosGlobal
      const serviciosIncluidos = conteoInventario?.servicios
        .filter(s => habilitadosGlobal.length > 0 ? habilitadosGlobal.includes(s.codigo) : false)
        .filter(s => !serviciosExcluidos.includes(s.codigo)) ?? []
      
      // Agrupar bienes por servicio (SOLO los del servicio activo que se guarda).
      // La CLAVE de agrupación es el CÓDIGO del servicio (servicio_inv_codigo
      // del bien, con fallback al código activo), NO el nombre de dependencia
      // (bien.servicio). Así la clave coincide con la de notasPorServicio
      // (r.servicio ya es código) y notasPorServicio.get(clave) encuentra las
      // notas del bien. El nombre legible sigue viajando dentro de cada bien.
      const bienesPorServicio = new Map<string, typeof bienesInventariados>()
      for (const bien of bienesAGuardar) {
        const svc = (bien as any).servicio_inv_codigo || servicioSeleccionado || servicioActivoInfo?.codigo || ''
        if (!bienesPorServicio.has(svc)) bienesPorServicio.set(svc, [])
        bienesPorServicio.get(svc)!.push(bien)
      }

      // Preparar notas agrupadas por servicio
      const notasPorServicio = new Map<string, typeof registrosObsNotas>()
      for (const nota of registrosObsNotas.filter(r => r.tipo === 'nota')) {
        const svc = nota.servicio || ''
        if (!notasPorServicio.has(svc)) notasPorServicio.set(svc, [])
        notasPorServicio.get(svc)!.push(nota)
      }

      const fechaStr = new Date().toLocaleDateString('es-CO')
      const collab1 = { nombre: colaborador1.nombre, cedula: colaborador1.cedula, cargo: colaborador1.cargo }
      const collab2 = { nombre: colaborador2.nombre, cedula: colaborador2.cedula, cargo: colaborador2.cargo }

      // Guardar un inventario por cada servicio
      const resultados: { servicio: string; total: number; sesion_id: string }[] = []

      for (const [codigoServicio, bienesSvc] of bienesPorServicio.entries()) {
        const infoServicio = serviciosIncluidos.find(s => s.nombre === codigoServicio || s.codigo === codigoServicio)
        const codigoReal = infoServicio?.codigo || codigoServicio
        const totalServicio = infoServicio?.cantidad ?? null

        const payload = {
          nombre: `Inventario ${sede} ${ubicacion}${codigoReal ? ` - ${codigoReal}` : ''} - ${fechaStr}`,
          sede,
          ubicacion,
          servicio: codigoReal,
          total_servicio: totalServicio,
          colaborador1: collab1,
          colaborador2: collab2,
          bienes: bienesSvc.map(b => {
            let observacionFinal = (b as any).observacion || ''
            // Adjuntar la nota manual del bien a su observacion para que quede
            // persistida en LecturaInventario.observacion y se muestre luego en
            // el reporte (ícono "ver detalle"). Antes solo se hacía para estado
            // 'M', por lo que las notas de bienes B/R no llegaban al reporte.
            if (!observacionFinal.trim()) {
              // El mecanismo por-placa NO depende del servicio (robusto para
              // notas B). Si no hubiera registro por-placa, cae a la nota del
              // Excel (mismo fallback que ya existe en el guardado REGIONAL).
              const nota = registrosObsNotas.find(r => r.placa === b.placa && r.tipo === 'nota')
              if (nota) observacionFinal = nota.texto
              else if ((b as any).nota_excel) observacionFinal = (b as any).nota_excel
            }
            return {
              placa: b.placa,
              descripcion: b.descripcion,
              serial: b.serial,
              estado: b.estado,
              cedula_responsable: b.cedula_responsable,
              nombre_responsable: b.nombre_responsable,
              servicio: b.servicio,
              ubicacion: b.ubicacion,
              observacion: observacionFinal,
              custodio_nombre: b.custodio_nombre || '',
              custodio_cedula: b.custodio_cedula || '',
            }
          }),
          notas: (notasPorServicio.get(codigoServicio) || []).map(r => ({
            placa: r.placa,
            descripcionBien: r.descripcionBien,
            tipo: r.contexto?.includes('Ubicación') ? 'cambio_ubicacion' : r.contexto?.includes('DUPLICADO') ? 'duplicado' : 'nota',
            texto: r.texto,
            servicio: r.servicio || '',
            ubicacion: r.ubicacion || '',
            contexto: r.contexto || '',
          }))
        }

        const resultado = await guardarInventario(payload)
        resultados.push({ servicio: codigoReal, total: resultado.total_bienes, sesion_id: resultado.sesion_id })
      }

      // Registrar bienes en estado M para baja (solo los del servicio guardado).
      const obsMap: Record<string, string> = {}
      for (const bien of bienesAGuardar.filter(b => b.estado === 'M')) {
        const nota = registrosObsNotas.find(r => r.placa === bien.placa && r.tipo === 'nota')
        if (nota) obsMap[bien.placa] = nota.texto
      }
      await registrarBienesMalEstado(bienesAGuardar, obsMap, { nombre: colaborador1.nombre, cedula: colaborador1.cedula })
      
      // Actualizar contadores (y refrescar el caché en memoria)
      const nuevoConteo = await recargarConteoServicios()
      if (nuevoConteo) { conteoInventarioCache = nuevoConteo; setConteoInventario(nuevoConteo) }
      
      // Remover SOLO los bienes del servicio recién guardado (los de otros
      // servicios aún pendientes se conservan). La lista global se actualiza y
      // se persiste sin los guardados.
      const placasGuardadas = new Set(bienesAGuardar.map(b => b.placa))
      setBienesInventariados(prev => {
        const restantes = prev.filter(b => !placasGuardadas.has(b.placa))
        guardarBienesEnStorage(restantes)
        return restantes
      })
      limpiarRegistrosStorage()
      actualizarRegistrosObsNotas([])

      // Quitar de la selección el/los servicio(s) recién inventariado(s), para
      // forzar al usuario a volver a elegir un servicio antes de seguir. Evita
      // que por error guarde y siga plaqueteando en el mismo servicio.
      const codigosGuardados = new Set(
        [servicioSeleccionado, ...resultados.map(r => r.servicio)].filter(Boolean) as string[]
      )
      setServiciosExcluidos(prev => {
        const next = Array.from(new Set([...prev, ...codigosGuardados]))
        localStorage.setItem('inventario_servicios_excluidos', JSON.stringify(next))
        return next
      })
      setServicioSeleccionado(null)
      servicioColaborativoRef.current = ''

      setMostrarModalColaboradores(false)

      // Mensaje de éxito según cantidad de servicios
      const totalBienes = resultados.reduce((sum, r) => sum + r.total, 0)
      if (resultados.length === 1) {
        toast.success(`Inventario guardado correctamente. ${totalBienes} bienes registrados en ${resultados[0].servicio || 'servicio'}.`)
        alertaInventario.inventarioGuardado(totalBienes, resultados[0].servicio || 'servicio')
      } else {
        const detalle = resultados.map(r => `${r.servicio}: ${r.total}`).join(', ')
        toast.success(`Inventario guardado correctamente. ${totalBienes} bienes en ${resultados.length} servicios (${detalle}).`)
        alertaInventario.inventarioGuardado(totalBienes, `${resultados.length} servicios`)
      }
      // Limpiar notificaciones leídas después de guardar exitosamente
      void eliminarNotificacionesLeidas()

      // NOTA: ya NO se notifica ni se cierra la sesión colaborativa desde aquí.
      // El backend, dentro de `registrar_inventario`, cierra la(s) sesión(es)
      // colaborativa(s) del servicio y emite por WS al grupo `inventario_{svc}`
      // los eventos `inventario_guardado` (para que el otro usuario limpie su
      // vista y servicio) y `sesion_cerrada` (para cerrar su modo colaborativo).
      // Hacerlo en el backend es más confiable que desde el front del que guarda
      // (antes el evento se perdía porque la sesión ya se había cerrado).
    } catch (error: any) {
      console.error('Error guardando inventario:', error)
      toast.error(error.message || 'Error guardando inventario')
    } finally {
      setGenerandoPDF(false)
    }
  }
  
  const descargarPdfPreview = async () => {
    if (pdfPreview) {
      // Convertir dataURL a Blob sin usar fetch (evitar interceptor)
      const parts = pdfPreview.pdfDataUrl.split(',')
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf'
      const bstr = atob(parts[1])
      const n = bstr.length
      const u8arr = new Uint8Array(n)
      for (let i = 0; i < n; i++) {
        u8arr[i] = bstr.charCodeAt(i)
      }
      const blob = new Blob([u8arr], { type: mime })
      descargarPDF(blob, pdfPreview.nombreArchivo)
      
      // Registrar inventario en el backend al descargar
      if (inventarioPendienteRegistro) {
        try {
          const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
          await fetch(`${API_URL}/almacen/admin/registrar-inventario/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...inventarioPendienteRegistro,
              creado_por_cedula: getAuthUserCedula(),
              creado_por_nombre: getAuthUserFullName(),
            })
          })

          // Registrar bienes en estado M para baja
          const obsMapPdf: Record<string, string> = {}
          for (const bien of bienesInventariados.filter(b => b.estado === 'M')) {
            const nota = registrosObsNotas.find(r => r.placa === bien.placa && r.tipo === 'nota')
            if (nota) obsMapPdf[bien.placa] = nota.texto
          }
          const col1Pdf = inventarioPendienteRegistro?.colaborador1
          await registrarBienesMalEstado(bienesInventariados, obsMapPdf, col1Pdf ? { nombre: col1Pdf.nombre, cedula: col1Pdf.cedula } : undefined)

          setInventarioPendienteRegistro(null)
          
          // Actualizar contadores
          const resConteo = await fetch(`${API_URL}/almacen/admin/contar-bienes-servicio/`)
          if (resConteo.ok) {
            const data = await resConteo.json()
            setConteoInventario(data)
          }
          toast.success('Inventario registrado y PDF descargado')
        } catch {
          toast.warning('PDF descargado pero hubo error registrando')
        }
      } else {
        toast.success('PDF descargado')
      }
      setPdfPreview(null)
    }
  }
  
  const cerrarPdfPreview = () => {
    setPdfPreview(null)
  }

  // Exporta el Excel provisional de la TOMA PRINCIPAL.
  const exportarExcelProvisionalPrincipal = (nombreArchivo: string) => {
    if (bienesInventariados.length === 0) return
    // Exportar SOLO los bienes del servicio activo (mismo criterio que
    // bienesDelServicioActivo: por código servicio_inv_codigo o, en su defecto,
    // por nombre de dependencia). NOTA: BienInventario no expone la cédula del
    // inventariador que lo escaneó, así que no es posible filtrar por usuario a
    // nivel de bien; el aislamiento por usuario se hace a nivel de sesión.
    const nombreActivoExcel = (conteoInventario?.servicios.find(s => s.codigo === servicioSeleccionado)?.nombre || '').trim()
    const bienesExcel = servicioSeleccionado
      ? bienesInventariados.filter(b => {
          const cod = (b as any).servicio_inv_codigo
          if (cod) return cod === servicioSeleccionado
          return nombreActivoExcel && (b.servicio || '').trim() === nombreActivoExcel
        })
      : bienesInventariados
    if (bienesExcel.length === 0) {
      toast.warning('No hay bienes del servicio activo para exportar.')
      return
    }
    const filas = bienesExcel.map((b, i) => {
      const nota = registrosObsNotas.find(r => r.placa === b.placa && r.tipo === 'nota')
      const obs = registrosObsNotas.find(r => r.placa === b.placa && r.tipo === 'observacion' && r.estado === 'pendiente')
      return { 'Ítem': i + 1, 'Placa': b.placa, 'Descripcion': b.descripcion, 'Serial': b.serial || 'N/A', 'Estado': b.estado || 'B', 'CC. Responsable': b.cedula_responsable || '', 'Nom. Responsable': b.nombre_responsable || '', 'CC Usuario': b.custodio_cedula || '', 'Nom. Usuario': b.custodio_nombre || '', 'Servicio / Grupo': b.servicio || codigoServicioActivo || '', 'Ubicacion': b.ubicacion || '', 'Observacion': obs?.texto || '', 'Nota': nota?.texto || '', 'Fecha Ingreso': b.timestamp ? new Date(b.timestamp).toLocaleString('es-CO') : '' }
    })
    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario Provisional')
    XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
    toast.success(`Excel descargado -- ${bienesExcel.length} bienes`)
  }

  const nombreExcelProvisionalPrincipalPorDefecto = () => {
    const fechaStr = new Date().toLocaleDateString('es-CO').replace(/\//g, '-')
    const servicioNombre = codigoServicioActivo || 'Inventario_UNP'
    return `Inventario_Provisional_${servicioNombre.replace(/\s+/g, '_')}_${fechaStr}`
  }

  return (
    <div className="transferencia-page__bloque-tab">
      <div className="inventario-fisico">
        <div className="inventario-fisico__header" style={{ display: 'none' }}>
          <h4 className="inventario-fisico__titulo">Inventario Físico - Lectura de Códigos de Barras</h4>
          <p className="inventario-fisico__descripcion">
            Escanee el código de barras o ingrese la <strong>placa o serial</strong> del bien. Los datos se guardan automáticamente y puede editarlos antes de generar el formato.
          </p>
        </div>

        {/* Contadores de inventario */}
        {/* Contadores de inventario — portal al panel derecho */}
        {(() => {
          const portalTarget = document.getElementById('gi-panel-contadores')
          const habilitadosGlobal = serviciosHabilitadosGlobal
          const serviciosIncluidos = conteoInventario 
            ? conteoInventario.servicios
                .filter(s => habilitadosGlobal.length > 0 ? habilitadosGlobal.includes(s.codigo) : false)
                .filter(s => !serviciosExcluidos.includes(s.codigo))
            : []
          // El servicio activo del panel es EXCLUSIVAMENTE el que el usuario
          // seleccionó (servicioSeleccionado). Si no ha elegido ninguno, el panel
          // NO debe inventar un servicio ni sumar la data de todos los habilitados:
          // sin servicio elegido no hay "contexto" y los contadores van en 0.
          const servicioActivo = servicioSeleccionado && conteoInventario
            ? (conteoInventario.servicios.find(s => s.codigo === servicioSeleccionado) ?? null)
            : null
          const hayServicioActivo = !!servicioActivo
          const totalPorInventariar = hayServicioActivo
            ? servicioActivo.cantidad
            : 0
          const inventariadosServicio = (() => {
            // Sin servicio seleccionado no hay nada que contar.
            if (!hayServicioActivo) return 0
            // Bienes escaneados del servicio activo (ya aislados por la vista).
            const bienesDelServicio = bienesDelServicioActivo.filter(b => !b.placa.startsWith('SP-'))
            const inventariadosReportados = (conteoInventario?.servicios.find(s => s.codigo === servicioActivo!.codigo) as any)?.inventariados ?? 0
            return bienesDelServicio.length + inventariadosReportados
          })()
          const pendientes = Math.max(0, totalPorInventariar - inventariadosServicio)
          // Alertas del panel: solo registros VISIBLES (servicio activo + cédula
          // del usuario) y cuyo bien SIGA presente en la sesión actual. Esto evita
          // que queden "alertas fantasma" de bienes de sesiones anteriores que ya
          // no están en la tabla (p.ej. una observación en localStorage cuyo bien
          // se limpió o nunca se volvió a escanear). Usa el MISMO helper que la
          // campana y el bloqueo de guardado para no divergir.
          // Panel de contadores: CÓDIGO del servicio activo (convención
          // unificada) para comparar código-contra-código con r.servicio.
          const servicioPanel = servicioSeleccionado || servicioActivoInfo?.codigo || ''
          const placasEnSesion = new Set(bienesInventariados.map(b => b.placa))
          const registrosVisiblesPanel = filtrarRegistrosVisibles(registrosObsNotas, {
            servicio: servicioPanel,
            cedula: cedulaFiltroObs,
          }).filter(r => placasEnSesion.has(r.placa))
          const obsActivas = obtenerBloqueantesVisibles(registrosObsNotas, {
            servicio: servicioPanel,
            cedula: cedulaFiltroObs,
          }).filter(r => placasEnSesion.has(r.placa)).length
          const bienesEstadoM = bienesDelServicioActivo.filter(b => b.estado === 'M').length
          const totalAlertas = obsActivas + bienesEstadoM

          const contadoresJsx = (
            <PanelContadores
              nivelActivoControlado={nivelContadorActivo}
              onNivelActivoChange={setNivelContadorActivo}
              conteoInventario={conteoInventario}
              totalPorInventariar={totalPorInventariar}
              inventariadosServicio={inventariadosServicio}
              pendientes={pendientes}
              totalAlertas={totalAlertas}
              obsActivas={obsActivas}
              bienesEstadoM={bienesEstadoM}
              serviciosIncluidos={serviciosIncluidos}
              hayServicioActivo={hayServicioActivo}
              servicioActivo={servicioActivo}
              serviciosExcluidos={serviciosExcluidos}
              bienesInventariados={bienesInventariados}
              placasYaInventariadas={placasYaInventariadas}
              bienesInventariadosFisico={bienesInventariadosFisico}
              cargandoInventariadosFisico={cargandoInventariadosFisico}
              bienesFaltantesFisico={bienesFaltantesFisico}
              cargandoFaltantesFisico={cargandoFaltantesFisico}
              onAgregarFaltante={(bien) => agregarPlacaAlInventario(bien?.placa)}
              registrosObsNotas={registrosVisiblesPanel}
              bienesEstadoMData={bienesInventariados.filter(b => b.estado === 'M').map(b => ({ placa: b.placa, descripcion: b.descripcion, nombre_responsable: b.nombre_responsable }))}
              onIrABien={(placa) => {
                const row = document.querySelector(`tr[data-placa="${placa}"]`)
                if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('inventario-ultimo-bien'); setTimeout(() => row.classList.remove('inventario-ultimo-bien'), 3000) }
              }}
              serviciosHabilitados={serviciosHabilitadosGlobal}
              onToggleServicio={(codigo) => {
                setServiciosExcluidos(prev => {
                  const next = prev.includes(codigo) ? prev.filter(c => c !== codigo) : [...prev, codigo]
                  localStorage.setItem('inventario_servicios_excluidos', JSON.stringify(next))
                  return next
                })
              }}
              onToggleTodosServicios={(incluir, codigos) => {
                setServiciosExcluidos(prev => {
                  const next = incluir ? prev.filter(c => !codigos.includes(c)) : Array.from(new Set([...prev, ...codigos]))
                  localStorage.setItem('inventario_servicios_excluidos', JSON.stringify(next))
                  return next
                })
              }}
              onVerBienesServicio={async (codigo) => {
                // Usar caché existente
                const cached = cacheBienesServicio.get(codigo)
                if (cached && cached.bienes.length > 0) return cached.bienes
                const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
                try {
                  const res = await fetch(`${API_URL}/almacen/admin/contar-bienes-servicio/?detalle_servicio=${codigo}`)
                  if (res.ok) {
                    const data = await res.json()
                    const bienes = data.bienes || []
                    if (bienes.length > 0) cacheBienesServicio.set(codigo, { bienes, inventariadas: new Set() })
                    return bienes
                  }
                } catch { /* silenciar */ }
                return []
              }}
              coordinadorSeleccionado={coordinadorSeleccionado}
              bienesCoordinadorModal={bienesCoordinadorModal}
              cargandoBienesCoordinador={cargandoBienesCoordinador}
              onLimpiarCoordinador={() => { setCoordinadorSeleccionado(null); setBienesCoordinadorModal([]) }}
              onBuscarCoordinadorPorCedula={async (cedula) => {
                // Consulta los bienes del coordinador en TODOS los servicios (nuevo endpoint).
                setCoordinadorSeleccionado({ nombre: cedula, cedula })
                setCargandoBienesCoordinador(true)
                setBienesCoordinadorModal([])
                try {
                  const { nombre, bienes } = await buscarBienesPorCoordinador(cedula)
                  setCoordinadorSeleccionado({ nombre, cedula })
                  setBienesCoordinadorModal(bienes)
                  if (bienes.length === 0) toast.warning('No se encontraron bienes asignados a este coordinador')
                } catch (err: any) {
                  if (err?.name === 'AbortError') toast.error('La consulta tardó demasiado. Intente de nuevo.')
                  else toast.error('Error al consultar los bienes del coordinador')
                }
                setCargandoBienesCoordinador(false)
              }}
              onClickServicios={() => { /* Inline, no modal */ }}
              onClickInventariados={() => { void cargarInventariadosFisico() }}
              onClickFaltantes={() => { void cargarFaltantesFisico() }}
              onClickAlertas={() => { /* Inline, no modal */ }}
              onClickCoordinador={() => { /* Inline en panel */ }}
            />
          )
          return portalTarget ? createPortal(contadoresJsx, portalTarget) : null
        })()}

        {/* Modal de servicios/bodegas para excluir */}
        {mostrarModalBienesServicio && conteoInventario && (() => {
          const habilitadosGlobal = serviciosHabilitadosGlobal
          const serviciosBase = habilitadosGlobal.length > 0
            ? conteoInventario.servicios.filter(s => habilitadosGlobal.includes(s.codigo))
            : []  // Si no hay servicios habilitados desde Reportes, no mostrar ninguno
          const serviciosFiltrados = serviciosBase.filter(s => {
            if (!filtroServicio.trim()) return true
            const termino = filtroServicio.trim().toLowerCase()
            return s.codigo.toLowerCase().includes(termino) || s.nombre.toLowerCase().includes(termino)
          })
          const todosIncluidos = serviciosFiltrados.every(s => !serviciosExcluidos.includes(s.codigo))
          const algunoIncluido = serviciosFiltrados.some(s => !serviciosExcluidos.includes(s.codigo))

          return (
          <div className="inventario-fisico__modal-overlay">
            <div className="inventario-fisico__modal" style={{ maxWidth: '1000px', maxHeight: '85vh' }}>
              <div className="inventario-fisico__modal-header">
                <h5>Servicios / Bodegas — Configurar Inventario</h5>
                <button className="inventario-fisico__modal-close" onClick={() => setMostrarModalBienesServicio(false)}>×</button>
              </div>
              
              <div className="inventario-fisico__modal-body" style={{ overflow: 'auto', maxHeight: '60vh' }}>
                <p style={{ fontSize: '0.85rem', color: '#5c6474', marginBottom: '1rem' }}>
                  Desmarque los servicios/bodegas que NO desea incluir en el inventario. Los bienes de servicios excluidos no cuentan como "por inventariar". 
                  Si al escanear un bien este pertenece a un servicio excluido, se mostrará una alerta.
                </p>

                {/* Buscador de servicios */}
                <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <FloatingField label="Buscar servicio por código o nombre" required={false} tieneValor={!!filtroServicio}>
                      <input
                        type="text"
                        placeholder=" "
                        value={filtroServicio}
                        onChange={(e) => setFiltroServicio(e.target.value)}
                        disabled={!conteoInventario || conteoInventario.servicios.length === 0}
                        maxLength={30}
                        style={{ width: '100%', height: '44px', padding: '0.5rem 0.75rem 0', border: '1px solid rgb(48 61 80 / 0.25)', borderRadius: '8px', fontSize: '0.85rem', background: '#fff', boxSizing: 'border-box', outline: 'none', opacity: (!conteoInventario || conteoInventario.servicios.length === 0) ? 0.5 : 1, transition: 'border-color 0.15s, box-shadow 0.15s' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = '#303d50'; e.currentTarget.style.boxShadow = '0 0 0 3px rgb(48 61 80 / 0.12)' }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'rgb(48 61 80 / 0.25)'; e.currentTarget.style.boxShadow = 'none' }}
                      />
                    </FloatingField>
                  </div>
                  {filtroServicio && (
                    <button 
                      onClick={() => setFiltroServicio('')} 
                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: '#eee', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Limpiar
                    </button>
                  )}
                  <span style={{ fontSize: '0.8rem', color: '#5c6474', whiteSpace: 'nowrap' }}>
                    {serviciosFiltrados.length} de {conteoInventario.servicios.length}
                  </span>
                </div>
                
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#303d50', color: 'white', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '0.5rem', width: '5%' }}>
                        <input
                          type="checkbox"
                          checked={todosIncluidos}
                          ref={(el) => { if (el) el.indeterminate = algunoIncluido && !todosIncluidos }}
                          onChange={() => {
                            const codigosFiltrados = serviciosFiltrados.map(s => s.codigo)
                            let nuevos: string[]
                            if (todosIncluidos) {
                              // Deseleccionar todos los filtrados (agregarlos a excluidos)
                              nuevos = Array.from(new Set([...serviciosExcluidos, ...codigosFiltrados]))
                            } else {
                              // Seleccionar todos los filtrados (quitarlos de excluidos)
                              nuevos = serviciosExcluidos.filter(c => !codigosFiltrados.includes(c))
                            }
                            setServiciosExcluidos(nuevos)
                            localStorage.setItem('inventario_servicios_excluidos', JSON.stringify(nuevos))
                          }}
                          title={todosIncluidos ? 'Deseleccionar todos' : 'Seleccionar todos'}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th style={{ padding: '0.5rem', width: '12%' }}>Servicio</th>
                      <th style={{ padding: '0.5rem', width: '35%' }}>Nombre</th>
                      <th style={{ padding: '0.5rem', width: '10%' }}>Bienes</th>
                      <th style={{ padding: '0.5rem', width: '10%' }}>Tipo</th>
                      <th style={{ padding: '0.5rem', width: '10%' }}>Ver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...serviciosFiltrados].sort((a, b) => {
                      const aExcl = serviciosExcluidos.includes(a.codigo) ? 1 : 0
                      const bExcl = serviciosExcluidos.includes(b.codigo) ? 1 : 0
                      if (aExcl !== bExcl) return aExcl - bExcl
                      // Dentro del mismo grupo, ordenar por código numérico y luego alfabético
                      return a.codigo.localeCompare(b.codigo, undefined, { numeric: true })
                    }).map((s, i) => {
                      const excluido = serviciosExcluidos.includes(s.codigo)
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #eee', background: excluido ? 'rgba(209,60,71,0.05)' : 'transparent' }}>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={!excluido}
                              onChange={() => {
                                const nuevos = excluido 
                                  ? serviciosExcluidos.filter(c => c !== s.codigo)
                                  : [...serviciosExcluidos, s.codigo]
                                setServiciosExcluidos(nuevos)
                                localStorage.setItem('inventario_servicios_excluidos', JSON.stringify(nuevos))
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{s.codigo}</td>
                          <td style={{ padding: '0.4rem 0.5rem' }}>{s.nombre}</td>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', fontWeight: 700 }}>{s.cantidad.toLocaleString()}</td>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                            <span style={{ 
                              fontSize: '0.75rem', 
                              padding: '0.2rem 0.5rem', 
                              borderRadius: '4px',
                              background: s.es_bodega ? '#fff3cd' : '#d4edda',
                              color: s.es_bodega ? '#856404' : '#155724',
                              fontWeight: 600
                            }}>
                              {s.es_bodega ? 'Bodega' : 'Servicio'}
                            </span>
                          </td>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                            <button
                              onClick={async () => {
                                setServicioModalActual(s.codigo + ' - ' + s.nombre)
                                
                                // Usar caché si ya se consultó EXITOSAMENTE este servicio
                                const cached = cacheBienesServicio.get(s.codigo)
                                if (cached && cached.bienes.length > 0) {
                                  setBienesModalServicio(cached.bienes)
                                  setPlacasYaInventariadas(cached.inventariadas)
                                  return
                                }
                                
                                setCargandoModalServicio(true)
                                setBienesModalServicio([])
                                setPlacasYaInventariadas(new Set())
                                try {
                                  const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
                                  
                                  // Cargar bienes en lotes paginados para evitar timeout en servicios grandes
                                  const PAGE_SIZE = 500
                                  let allBienes: any[] = []
                                  let offset = 0
                                  let hayMas = true

                                  while (hayMas) {
                                    const controller = new AbortController()
                                    const timeoutId = setTimeout(() => controller.abort(), 90000) // 90s timeout por página
                                    
                                    const res = await fetch(
                                      `${API_URL}/almacen/admin/contar-bienes-servicio/?detalle_servicio=${s.codigo}&offset=${offset}&limit=${PAGE_SIZE}`,
                                      { signal: controller.signal }
                                    )
                                    clearTimeout(timeoutId)
                                    
                                    if (!res.ok) {
                                      if (allBienes.length === 0) {
                                        toast.error(`Error al cargar bienes del servicio ${s.codigo}`)
                                      }
                                      break
                                    }
                                    const data = await res.json()
                                    const bienesPagina = data.bienes || []
                                    allBienes = [...allBienes, ...bienesPagina]
                                    hayMas = data.hay_mas === true
                                    offset += PAGE_SIZE
                                    
                                    // Mostrar progreso parcial mientras carga
                                    if (hayMas) {
                                      setBienesModalServicio([...allBienes])
                                    }
                                  }
                                  
                                  const bienes = allBienes
                                  let inventariadas = new Set<string>()
                                  // Consultar cuáles placas ya están inventariadas
                                  if (bienes.length > 0) {
                                    const placas = bienes.map((b: any) => b.placa)
                                    const controllerInv = new AbortController()
                                    const timeoutInv = setTimeout(() => controllerInv.abort(), 30000)
                                    const resInv = await fetch(`${API_URL}/almacen/admin/placas-inventariadas-servicio/`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ placas }),
                                      signal: controllerInv.signal,
                                    })
                                    clearTimeout(timeoutInv)
                                    if (resInv.ok) {
                                      const dataInv = await resInv.json()
                                      inventariadas = new Set(dataInv.inventariadas ?? [])
                                    }
                                    // Solo guardar en caché si obtuvimos bienes exitosamente
                                    cacheBienesServicio.set(s.codigo, { bienes, inventariadas })
                                  }
                                  setBienesModalServicio(bienes)
                                  setPlacasYaInventariadas(inventariadas)
                                } catch (err: any) {
                                  if (err?.name === 'AbortError') {
                                    toast.error(`La consulta del servicio ${s.codigo} tardó demasiado. Intente de nuevo.`)
                                  } else {
                                    toast.error(`Error al cargar bienes del servicio ${s.codigo}`)
                                  }
                                  // No guardar en caché cuando falla — permitir reintentar
                                }
                                setCargandoModalServicio(false)
                              }}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s' }}
                              title={`Ver bienes de ${s.nombre}`}
                            >
                              👁️
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              
              <div className="inventario-fisico__modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#5c6474' }}>
                  {serviciosBase.length} servicios | 
                  {' '}{serviciosExcluidos.length} excluidos | 
                  {' '}Por inventariar: {serviciosBase.filter(s => !serviciosExcluidos.includes(s.codigo)).reduce((sum, s) => sum + s.cantidad, 0).toLocaleString()}
                </span>
                <button
                  className="floresta-busqueda__btn"
                  onClick={() => setMostrarModalBienesServicio(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
          )
        })()}

        {/* Modal detalle de bienes de un servicio */}
        {(bienesModalServicio.length > 0 || cargandoModalServicio) && (() => {
          const bienesFiltradosModal = filtroModalBienes.trim()
            ? bienesModalServicio.filter(b => {
                const t = filtroModalBienes.trim().toLowerCase()
                return (b.placa || '').toLowerCase().includes(t) ||
                       (b.descripcion || '').toLowerCase().includes(t) ||
                       (b.responsable || '').toLowerCase().includes(t) ||
                       (b.cedula || '').includes(t) ||
                       (b.serial || '').toLowerCase().includes(t)
              })
            : bienesModalServicio
          const totalInventariados = bienesModalServicio.filter(b => placasYaInventariadas.has(b.placa)).length
          const cerrarModalDetalle = () => { setBienesModalServicio([]); setCargandoModalServicio(false); setFiltroModalBienes('') }

          return (
          <div className="inventario-fisico__modal-overlay" style={{ zIndex: 100001 }}>
            <div className="inventario-fisico__modal" style={{ maxWidth: '1000px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
              <div className="inventario-fisico__modal-header">
                <h5 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Bienes: {servicioModalActual}</span>
                </h5>
                <button className="inventario-fisico__modal-close" onClick={cerrarModalDetalle}>×</button>
              </div>
              <div className="inventario-fisico__modal-body" style={{ overflow: 'auto', flex: 1, maxHeight: '65vh' }}>
                {cargandoModalServicio ? (
                  <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem', animation: 'spin 1.5s linear infinite', display: 'inline-block' }}>⏳</div>
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 50% { transform: rotate(180deg); } 100% { transform: rotate(360deg); } }`}</style>
                    <p style={{ color: '#6c757d', fontSize: '0.9rem' }}>Cargando bienes del servicio...</p>
                  </div>
                ) : (
                  <>
                    {/* Resumen y filtro */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={filtroModalBienes}
                        onChange={(e) => setFiltroModalBienes(e.target.value)}
                        placeholder="Filtrar por placa, descripción, serial, responsable..."
                        style={{ flex: 1, minWidth: '200px', padding: '0.5rem 0.75rem', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '0.85rem' }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', borderRadius: '12px', background: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }}>
                          ✓ {totalInventariados} inventariados
                        </span>
                        <span style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', borderRadius: '12px', background: '#fff3e0', color: '#e65100', fontWeight: 600 }}>
                          ○ {bienesModalServicio.length - totalInventariados} pendientes
                        </span>
                      </div>
                    </div>

                    <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                        <tr style={{ background: '#303d50', color: 'white' }}>
                          <th style={{ padding: '0.45rem 0.5rem', width: '35px', background: '#303d50' }}>#</th>
                          <th style={{ padding: '0.45rem 0.5rem', background: '#303d50' }}>Placa</th>
                          <th style={{ padding: '0.45rem 0.5rem', background: '#303d50' }}>Descripción</th>
                          <th style={{ padding: '0.45rem 0.5rem', background: '#303d50' }}>Serial</th>
                          <th style={{ padding: '0.45rem 0.5rem', background: '#303d50' }}>Responsable</th>
                          <th style={{ padding: '0.45rem 0.5rem', background: '#303d50' }}>Cédula</th>
                          <th style={{ padding: '0.45rem 0.5rem', width: '50px', textAlign: 'center', background: '#303d50' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bienesFiltradosModal.map((b, i) => {
                          const yaInventariado = placasYaInventariadas.has(b.placa)
                          const enSesion = bienesInventariados.some(bi => bi.placa === b.placa)
                          return (
                            <tr key={i} style={{ 
                              borderBottom: '1px solid #f0f0f0', 
                              background: yaInventariado || enSesion 
                                ? 'rgba(46,125,50,0.04)' 
                                : i % 2 === 0 ? 'white' : '#fafafa'
                            }}>
                              <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center', color: '#6c757d', fontSize: '0.78rem' }}>{i + 1}</td>
                              <td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>{b.placa}</td>
                              <td style={{ padding: '0.35rem 0.5rem' }}>{b.descripcion || '--'}</td>
                              <td style={{ padding: '0.35rem 0.5rem', color: '#5c6474', fontFamily: 'monospace', fontSize: '0.78rem' }}>{b.serial || '--'}</td>
                              <td style={{ padding: '0.35rem 0.5rem' }}>{b.responsable || '--'}</td>
                              <td style={{ padding: '0.35rem 0.5rem' }}>{b.cedula || '--'}</td>
                              <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>
                                {yaInventariado || enSesion ? (
                                  <span style={{ color: '#2e7d32', fontWeight: 700, fontSize: '0.9rem' }} title="Inventariado">✓</span>
                                ) : (
                                  <span style={{ color: '#bdbdbd', fontSize: '0.9rem' }} title="Pendiente">○</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {filtroModalBienes && bienesFiltradosModal.length !== bienesModalServicio.length && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#6c757d' }}>
                        Mostrando {bienesFiltradosModal.length} de {bienesModalServicio.length} bienes (filtrado)
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="inventario-fisico__modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#5c6474' }}>
                  Total: {bienesModalServicio.length} bienes
                </span>
                <button className="floresta-busqueda__btn" onClick={cerrarModalDetalle}>Cerrar</button>
              </div>
            </div>
          </div>
          )
        })()}


        {/* Fila superior: servicio a inventariar + quién tiene los bienes (lado a lado) */}
        <div className="gi-fila-superior">
        {/* Título grande del servicio que se está plaqueteando (con selector rápido) */}
        <div className={`gi-servicio-activo${servicioActivoInfo ? '' : ' gi-servicio-activo--vacio'}`} style={{ position: 'relative' }}>
          <div className="gi-servicio-activo__icono">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </div>

          <button
            type="button"
            className={`gi-servicio-activo__selector${!servicioActivoInfo && conteoInventario ? ' gi-servicio-activo__selector--pulso' : ''}`}
            onClick={() => setSelectorServicioAbierto(v => !v)}
            disabled={!conteoInventario}
            aria-expanded={selectorServicioAbierto}
          >
            <div className="gi-servicio-activo__contenido">
              <span className="gi-servicio-activo__label">Servicio a inventariar</span>
              {!conteoInventario ? (
                <span className="gi-servicio-activo__nombre gi-servicio-activo__nombre--cargando">
                  <span className="gi-servicio-activo__spinner" /> Cargando servicios…
                </span>
              ) : servicioActivoInfo ? (
                <>
                  <span className="gi-servicio-activo__nombre">{servicioActivoInfo.nombre}</span>
                  <span className="gi-servicio-activo__codigo">{servicioActivoInfo.codigo}</span>
                </>
              ) : (
                <span className="gi-servicio-activo__nombre gi-servicio-activo__nombre--vacio">
                  👆 Toca aquí para seleccionar tu servicio
                </span>
              )}
            </div>
            {conteoInventario && (
              <svg className="gi-servicio-activo__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>

          {selectorServicioAbierto && (
            <>
              <div className="gi-servicio-selector__overlay" onClick={() => setSelectorServicioAbierto(false)} />
              <div className="gi-servicio-selector__menu" role="listbox">
                <div className="gi-servicio-selector__titulo">Cambiar servicio a plaquetear</div>
                {serviciosHabilitadosLista.map(s => (
                  <button
                    key={s.codigo}
                    type="button"
                    role="option"
                    aria-selected={servicioActivoInfo?.codigo === s.codigo}
                    className={`gi-servicio-selector__item${servicioActivoInfo?.codigo === s.codigo ? ' is-activo' : ''}`}
                    onClick={() => seleccionarUnicoServicio(s.codigo)}
                  >
                    <div className="gi-servicio-selector__item-info">
                      <span className="gi-servicio-selector__item-nombre">{s.nombre}</span>
                      <span className="gi-servicio-selector__item-codigo">{s.codigo}</span>
                    </div>
                    <span className="gi-servicio-selector__item-badge">{s.cantidad}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Persona presente + Ubicación física — ambos en un solo recuadro compacto.
            Lado a lado en pantallas anchas; se apilan si no caben. */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'stretch',
          padding: '6px', marginBottom: '8px',
          background: '#f8fafc', border: '1px solid #e2e8f0',
          borderRadius: '10px',
        }}>
          <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <BannerPersonaPresente
                personaPresente={personaPresente}
                onCambiar={setPersonaPresente}
                embedded
              />
            </div>
          </div>
          <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <BannerUbicacionFisica
                ubicacion={ubicacionFisica}
                onCambiar={setUbicacionFisica}
                embedded
              />
            </div>
          </div>
        </div>
        </div>

        {/* Mientras cargan los servicios: loader central con mascota colibrí.
            Una vez cargados, si aún NO se eligió servicio: mensaje guía.
            El escáner y la tabla solo aparecen cuando hay servicio seleccionado. */}
        {!conteoInventario ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', textAlign: 'center' }}>
            <Animacion type="colibri" width={280} />
            <p style={{ fontSize: '1rem', color: '#64748b', marginTop: '1rem' }}>Cargando bienes del servicio...</p>
          </div>
        ) : !servicioSeleccionado ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3.5rem 1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏷️</div>
            <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#334155', margin: '0 0 0.35rem' }}>Selecciona un servicio para comenzar</p>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0, maxWidth: '420px' }}>
              Elige el <strong>Servicio a inventariar</strong> (arriba a la izquierda). Luego podrás escanear o escribir las placas.
            </p>
          </div>
        ) : null}

        {/* Lector de código de barras — solo visible con un servicio seleccionado. */}
        <div className="inventario-fisico__scanner" style={!servicioSeleccionado ? { display: 'none' } : undefined}>
          <EscanerCodigoBarras
            ref={inputRef}
            valor={codigoBarras}
            onChange={setCodigoBarras}
            onProcesar={procesarCodigoBarras}
            procesando={procesando}
            deshabilitado={!!alertaDuplicado}
            id="codigo-barras"
            onSinPlaca={() => setMostrarModalBienSinPlaca(true)}
            onCargaMasiva={() => {
              // No permitir carga masiva sin un servicio a inventariar seleccionado
              // (misma regla que el escaneo normal y el panel de coordinador).
              if (!servicioSeleccionado) {
                toast.warning('Primero seleccione el "Servicio a inventariar" (arriba a la izquierda) antes de usar la carga masiva.')
                return
              }
              setMostrarModalCargaMasivaFisico(true)
            }}
          />
        </div>

        {/* Indicador de participantes en línea (siempre visible).
            Solo se muestran los participantes del MISMO servicio activo: la
            colaboración es por servicio, no global. */}
        <ChatFlotante
            participantes={[
              { usuario: usuarioActual, cedula: cedulaActual, grupo: grupoActual, cargo: cargoActual, estado: 'online' as const },
              ...colaboradoresEnLinea,
            ]}
            cedulaActual={cedulaActual}
            conectado={true}
            mensajesChat={presencia.mensajesChat}
            usuarioActual={usuarioActual}
            otroEscribiendo={presencia.otroEscribiendo}
            noLeidos={presencia.noLeidosChat}
            onEnviarMensaje={presencia.enviarMensajeChat}
            onEscribiendo={presencia.notificarEscribiendo}
            onMarcarLeido={presencia.marcarChatLeido}
            onReaccionar={presencia.reaccionarMensaje}
            onEditar={presencia.editarMensaje}
          />

        {/* Tabla de bienes inventariados (solo los del servicio activo) */}
        {bienesDelServicioActivo.length > 0 && (
          <>
            <TablaBienes
              bienes={bienesDelServicioActivo}
              filtro={filtroPistoleados}
              onFiltroChange={setFiltroPistoleados}
              ultimoBienAgregadoIndex={(() => {
                // Traducir el índice global al índice dentro de la vista filtrada.
                if (ultimoBienAgregadoIndex == null) return null
                const placaUltimo = bienesInventariados[ultimoBienAgregadoIndex]?.placa
                if (!placaUltimo) return null
                const iVista = bienesDelServicioActivo.findIndex(b => b.placa === placaUltimo)
                return iVista >= 0 ? iVista : null
              })()}
              colaboradores={colaboradoresEnLinea.map(c => ({ usuario: c.usuario, cedula: c.cedula, cargo: c.cargo }))}
              registrosObsNotas={registrosObsNotas}
              // Indicador de la tabla: CÓDIGO del servicio activo (convención
              // unificada) para comparar código-contra-código con r.servicio.
              servicioActivo={servicioSeleccionado || servicioActivoInfo?.codigo || ''}
              cedulaUsuario={cedulaFiltroObs}
              onEditarSerial={(iVista, serial) => { const real = idxRealPorVista(iVista); if (real >= 0) setMostrarModalSerial({ index: real, serial }) }}
              onEditarEstado={(iVista, estado) => {
                const real = idxRealPorVista(iVista)
                if (real < 0) return
                // Pasar a M (para baja) pide confirmación antes de aplicar.
                if (estado === 'M') {
                  setConfirmarEstadoM({ index: real, placa: bienesInventariados[real].placa })
                  return
                }
                editarEstado(real, estado as import('../services/inventarioFisicoService').EstadoBien)
              }}
              onEditarUbicacion={(placa, ubicacion) => setUbicacionEditando({ placa, texto: ubicacion })}
              onAbrirObservacion={(placa, texto) => { setTabInicialObs('observaciones'); setObservacionEditando({ placa, texto }) }}
              onAbrirCustodio={(iVista) => { const real = idxRealPorVista(iVista); if (real >= 0) setMostrarModalCustodio({ index: real }) }}
              onEliminar={(iVista, placa) => { const real = idxRealPorVista(iVista); if (real >= 0) abrirModalEliminar(real, placa) }}
              onVerHistorial={(placa, descripcion, serial) => setHistorialPlaca({ placa, descripcion, serial })}
              onEstadoM={(placa) => { setTabInicialObs('notas'); setObservacionEditando({ placa, texto: '' }) }}
              maxHeight="none"
              permitirSinPlaca={true}
              rowIdPrefix="bien-row"
              serialColWidth="8%"
              servicioColWidth="11%"
              accionesColWidth="13%"
            />
            <BotonesInventario
              cantidadBienes={bienesInventariados.length}
              hayObservacionesBloqueantes={bienesDelServicioActivo.some(b => ((b as any).observacion || '').trim() !== '')}
              onGuardar={async () => {
                // Solo bloquean las observaciones de los bienes del servicio activo.
                const conObs = bienesDelServicioActivo.filter(b => ((b as any).observacion || '').trim() !== '')
                if (conObs.length > 0) {
                  toast.critical(`No se puede generar el formato. Hay ${conObs.length} bien(es) con observaciones pendientes: ${conObs.map(b => b.placa).join(', ')}`)
                  return
                }
                // Verificar notificaciones sin leer — deben revisarse antes de guardar
                const sinLeer = await contarNotificacionesSinLeer()
                if (sinLeer > 0) {
                  toast.warning(`Tiene ${sinLeer} notificación(es) sin revisar. Revíselas en la campana antes de guardar.`)
                  return
                }
                setMostrarModalColaboradores(true)
              }}
              onExcelProvisional={() => {
                if (bienesInventariados.length === 0) return
                setModalExcelProvisionalPrincipal(true)
              }}
              onLimpiar={() => setMostrarModalLimpiar(true)}
            />
          </>
        )}

        {/* Modal de confirmación para limpiar registros */}
        <ModalConfirmarAccion
          isOpen={mostrarModalLimpiar}
          titulo="Limpiar Registros"
          mensaje="¿Está seguro de limpiar todos los registros?"
          destacado={`${bienesInventariados.length} ${bienesInventariados.length === 1 ? 'registro' : 'registros'}`}
          advertencia="Esta acción eliminará todos los bienes escaneados. No se puede deshacer."
          textoConfirmar="Sí, limpiar"
          color="#e65100"
          onConfirmar={limpiarInventario}
          onCancelar={() => setMostrarModalLimpiar(false)}
        />

        {/* Modal de confirmación para marcar un bien como MALO (para baja) */}
        <ModalConfirmarAccion
          isOpen={confirmarEstadoM !== null}
          titulo="Marcar bien para baja"
          mensaje="¿Está seguro de marcar este bien en estado MALO (M)?"
          destacado={confirmarEstadoM?.placa}
          advertencia="El bien quedará marcado para baja y deberá registrar el motivo de la baja (obligatorio)."
          textoConfirmar="Sí, marcar para baja"
          color="#dc2626"
          onConfirmar={() => {
            if (confirmarEstadoM) {
              editarEstado(confirmarEstadoM.index, 'M')
              setTabInicialObs('notas')
              setObservacionEditando({ placa: confirmarEstadoM.placa, texto: '' })
              setConfirmarEstadoM(null)
            }
          }}
          onCancelar={() => setConfirmarEstadoM(null)}
        />

        {/* Modal para nombrar el Excel provisional (toma principal) */}
        <ModalNombreExcel
          isOpen={modalExcelProvisionalPrincipal}
          nombrePorDefecto={nombreExcelProvisionalPrincipalPorDefecto()}
          onCancelar={() => setModalExcelProvisionalPrincipal(false)}
          onConfirmar={(nombre) => { exportarExcelProvisionalPrincipal(nombre); setModalExcelProvisionalPrincipal(false) }}
        />

        {/* Modal de faltantes */}
        <ModalFaltantesAgrupado
          isOpen={mostrarModalFaltantesFisico}
          bienes={bienesFaltantesFisico}
          cargando={cargandoFaltantesFisico}
          onClose={() => setMostrarModalFaltantesFisico(false)}
        />

        {/* Modal de inventariados */}
        <ModalInventariadosAgrupado
          isOpen={mostrarModalInventariadosFisico}
          bienes={bienesInventariadosFisico}
          cargando={cargandoInventariadosFisico}
          onClose={() => setMostrarModalInventariadosFisico(false)}
          serviciosHabilitados={codigosServiciosActivos}
        />

        {/* Modal de alertas */}
        <ModalAlertas
          isOpen={mostrarModalAlertasFisico}
          registros={registrosObsNotas}
          // Campana de alertas: CÓDIGO del servicio activo (convención
          // unificada) para comparar código-contra-código con r.servicio.
          servicio={servicioSeleccionado || servicioActivoInfo?.codigo || ''}
          cedula={cedulaFiltroObs}
          bienesEstadoM={bienesInventariados.filter(b => b.estado === 'M').map(b => ({ placa: b.placa, descripcion: b.descripcion, nombre_responsable: b.nombre_responsable }))}
          onClose={() => setMostrarModalAlertasFisico(false)}
          onIrABien={(placa) => {
            const row = document.querySelector(`tr[data-placa="${placa}"]`)
            if (row) {
              row.scrollIntoView({ behavior: 'smooth', block: 'center' })
              row.classList.add('inventario-ultimo-bien')
              setTimeout(() => row.classList.remove('inventario-ultimo-bien'), 3000)
            }
          }}
        />

        {/* Modal de confirmación para eliminar bien */}
        <ModalConfirmarAccion
          isOpen={!!mostrarModalEliminar}
          titulo="Eliminar Bien"
          mensaje="¿Está seguro de eliminar este bien del inventario?"
          destacado={mostrarModalEliminar ? `${mostrarModalEliminar.placa} — ${bienesInventariados[mostrarModalEliminar.index]?.descripcion || ''}` : ''}
          advertencia="Esta acción no se puede deshacer."
          textoConfirmar="Sí, eliminar"
          color="#dc3545"
          onConfirmar={() => { if (mostrarModalEliminar) { eliminarBien(mostrarModalEliminar.index); setMostrarModalEliminar(null) } }}
          onCancelar={() => setMostrarModalEliminar(null)}
        />

        {/* Modal de solicitud de limpiar colaborativa (aprobación del otro participante) */}
        <ModalSolicitudEliminacion
          isOpen={!!presencia.solicitudLimpiar}
          solicitud={presencia.solicitudLimpiar ? {
            id: 'limpiar',
            tipo: 'limpiar_inventario',
            solicitante: presencia.solicitudLimpiar.solicitante,
            solicitante_cedula: '',
            total_bienes: presencia.solicitudLimpiar.total_bienes,
            timestamp: presencia.solicitudLimpiar.timestamp,
          } : null}
          onAprobar={aprobarLimpiarLocal}
          onRechazar={rechazarLimpiarLocal}
        />

        {/* Modal de solicitud de eliminar bien individual */}
        <ModalSolicitudEliminacion
          isOpen={!!presencia.solicitudEliminarBien}
          solicitud={presencia.solicitudEliminarBien ? {
            id: 'eliminar-bien',
            tipo: 'eliminar_bien',
            solicitante: presencia.solicitudEliminarBien.solicitante,
            solicitante_cedula: '',
            placa: presencia.solicitudEliminarBien.placa,
            descripcion: presencia.solicitudEliminarBien.descripcion,
            timestamp: presencia.solicitudEliminarBien.timestamp,
          } : null}
          onAprobar={() => {
            presencia.aprobarEliminarBien()
            // También eliminar localmente
            const placa = presencia.solicitudEliminarBien?.placa
            if (placa) {
              const idx = bienesInventariados.findIndex(b => b.placa === placa)
              if (idx >= 0) eliminarBienHook(idx)
              if (colaborativo.sesionId) void colaborativo.eliminarBien(placa)
            }
            toast.success(`Eliminación aprobada: ${placa}`)
          }}
          onRechazar={() => {
            presencia.rechazarEliminarBien()
            toast.info('Eliminación rechazada')
          }}
        />

        {/* Modal de nuevo participante conectado */}
        <ModalNuevoParticipante
          isOpen={!!nuevoParticipante}
          participante={nuevoParticipante}
          servicioNombre={servicioActivoInfo?.nombre || servicioSeleccionado || codigoServicioActivo || ''}
          onAceptar={() => setNuevoParticipante(null)}
        />

        {/* Indicador de espera de aprobación */}
        {(presencia.esperandoAprobacionLimpiar || presencia.esperandoAprobacionEliminar) && (
          <div style={{
            position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
            background: '#303d50', color: 'white', padding: '0.8rem 1.2rem',
            borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1.1rem' }}>&#9203;</span>
            <span>
              {presencia.esperandoAprobacionLimpiar
                ? 'Esperando aprobación para limpiar inventario...'
                : 'Esperando aprobación para eliminar bien...'}
            </span>
          </div>
        )}

        {/* Modal de custodio */}
        {mostrarModalCustodio && (
          <ModalCustodio
            isOpen={true}
            placa={bienesInventariados[mostrarModalCustodio.index]?.placa ?? ''}
            descripcion={bienesInventariados[mostrarModalCustodio.index]?.descripcion ?? ''}
            responsable={bienesInventariados[mostrarModalCustodio.index]?.nombre_responsable ?? ''}
            custodioActual={bienesInventariados[mostrarModalCustodio.index]?.custodio_nombre ? { nombre: bienesInventariados[mostrarModalCustodio.index].custodio_nombre!, cedula: bienesInventariados[mostrarModalCustodio.index].custodio_cedula! } : null}
            onAsignar={(nombre, cedula) => {
              const idx = mostrarModalCustodio.index
              const placa = bienesInventariados[idx]?.placa
              const nuevaLista = [...bienesInventariados]
              nuevaLista[idx] = { ...nuevaLista[idx], custodio_nombre: nombre, custodio_cedula: cedula }
              actualizarBienes(nuevaLista)
              if (colaborativo.sesionId && placa) {
                void colaborativo.actualizarBien(placa, 'custodio_nombre', nombre)
                void colaborativo.actualizarBien(placa, 'custodio_cedula', cedula)
              }
            }}
            onQuitar={() => {
              const idx = mostrarModalCustodio.index
              const placa = bienesInventariados[idx]?.placa
              const nuevaLista = [...bienesInventariados]
              nuevaLista[idx] = { ...nuevaLista[idx], custodio_nombre: undefined, custodio_cedula: undefined }
              actualizarBienes(nuevaLista)
              if (colaborativo.sesionId && placa) {
                void colaborativo.actualizarBien(placa, 'custodio_nombre', '')
                void colaborativo.actualizarBien(placa, 'custodio_cedula', '')
              }
            }}
            onClose={() => { setMostrarModalCustodio(null) }}
            onSuccess={(msg) => toast.success(msg)}
            onWarning={(msg) => toast.warning(msg)}
            onError={(msg) => toast.error(msg)}
          />
        )}

        {/* Modal alerta de placa duplicada */}
        {alertaDuplicado && (
          <ModalPlacaDuplicada
            mensaje={alertaDuplicado}
            onCerrar={() => { setAlertaDuplicado(null); setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100) }}
          />
        )}

        {/* Modal de editar serial */}
        <ModalEditarSerial
          isOpen={!!mostrarModalSerial}
          placa={mostrarModalSerial ? bienesInventariados[mostrarModalSerial.index]?.placa ?? '' : ''}
          descripcion={mostrarModalSerial ? bienesInventariados[mostrarModalSerial.index]?.descripcion ?? '' : ''}
          serialActual={mostrarModalSerial?.serial ?? ''}
          onGuardar={(nuevoSerial) => { if (mostrarModalSerial) editarSerial(mostrarModalSerial.index, nuevoSerial) }}
          onClose={() => setMostrarModalSerial(null)}
        />

        {/* Modal de historial del bien */}
        <ModalHistorialBien
          isOpen={!!historialPlaca}
          placa={historialPlaca?.placa ?? ''}
          descripcion={historialPlaca?.descripcion}
          serial={historialPlaca?.serial}
          onClose={() => setHistorialPlaca(null)}
        />

        {/* Modal de colaboradores */}
        <ModalColaboradores
          isOpen={mostrarModalColaboradores}
          onClose={() => setMostrarModalColaboradores(false)}
          onGenerar={handleGenerarFormato}
          totalBienes={bienesInventariados.length}
          loading={generandoPDF}
          colaborador1Inicial={{ nombre: usuarioActual, cedula: getAuthUserCedulaReal(), cargo: cargoActual || 'CONTRATISTA' }}
          colaborador2Inicial={(() => {
            const otro = presencia.usuarios.filter(u => u.estado === 'online')[0]
            if (!otro) return undefined
            // La "cedula" que llega por presencia (WS) puede ser un id_busuario
            // (no numérico). Si no es una cédula real, se deja vacía para que el
            // modal la auto-busque por nombre. Ver ModalColaboradores.
            const cedulaWs = (otro.cedula || '').trim()
            const cedulaReal = /^\d{4,}$/.test(cedulaWs) ? cedulaWs : ''
            return { nombre: otro.usuario, cedula: cedulaReal, cargo: otro.cargo || 'CONTRATISTA' }
          })()}
        />

        {/* Modal de carga masiva (inventario) */}
        <ModalCargaMasiva
          isOpen={mostrarModalCargaMasivaFisico}
          onClose={() => setMostrarModalCargaMasivaFisico(false)}
          bienesYaEscaneados={bienesInventariados}
          onBienesAgregados={(nuevos) => {
            const ubic = ubicacionFisica.trim()
            // Preparar los bienes cargados:
            //  - Ubicación física de la sesión (si se definió).
            //  - Custodio: si el Excel DEFINIÓ un usuario (custodio_desde_excel),
            //    ese manda (aunque venga vacío); si no, la persona presente (si se
            //    seleccionó); si no, el responsable del bien. Antes se detectaba
            //    "trae custodio" mirando custodio_nombre, pero la carga masiva ya
            //    lo rellena con el responsable por defecto, así que el usuario del
            //    Excel nunca se distinguía del responsable.
            const nuevosPreparados = nuevos.map(b => {
              const desdeExcel = !!(b as any).custodio_desde_excel
              const prep: any = {
                ...b,
                ubicacion: ubic || b.ubicacion,
                custodio_nombre: desdeExcel ? (b.custodio_nombre || '') : (personaPresente ? personaPresente.nombre : (b.nombre_responsable || '')),
                custodio_cedula: desdeExcel ? (b.custodio_cedula || '') : (personaPresente ? personaPresente.cedula : (b.cedula_responsable || '')),
                // Etiqueta del servicio activo: aísla la vista por servicio.
                servicio_inv_codigo: servicioSeleccionado || undefined,
              }
              // Estado del Excel: si viene 'M' se marca para baja al importar.
              if ((b as any).estado_excel === 'M') prep.estado = 'M'
              return prep
            })
            // Los nuevos van al FINAL de la tabla (como un Excel: el último abajo).
            const listaCombinada = [...bienesInventariados, ...nuevosPreparados]
            actualizarBienes(listaCombinada)
            // Mover el indicador "último bien agregado" al ÚLTIMO de la carga masiva
            // (antes se quedaba en el último escaneado normal).
            if (nuevosPreparados.length > 0) {
              setUltimoBienAgregadoIndex(listaCombinada.length - 1)
            }
            // Registrar las notas que venían en el Excel (columna "nota") como
            // notas del bien, para que aparezcan en la tabla y el reporte.
            const cedulaCreadorExcel = getAuthUserCedulaReal() || getAuthUserCedula()
            const nuevasNotas = nuevosPreparados
              .filter((b: any) => b.nota_excel)
              // El 4º argumento (servicio) se escribe como CÓDIGO del servicio
              // activo (convención unificada), NO como nombre de dependencia
              // (b.servicio); así la nota es visible código-contra-código en la
              // tabla/campana/panel y coherente en la agrupación del guardado.
              .map((b: any) => crearNota(b.placa, b.descripcion || '', b.nota_excel, servicioSeleccionado || servicioActivoInfo?.codigo || '', b.ubicacion, undefined, false, cedulaCreadorExcel))
            if (nuevasNotas.length > 0) {
              actualizarRegistrosObsNotas([...registrosObsNotas, ...nuevasNotas])
            }
            // Si hay sesión colaborativa, enviar los bienes al backend
            if (colaborativo.sesionId) {
              for (const bien of nuevosPreparados) {
                void colaborativo.escanearBien(bien)
              }
            }
          }}
          onSuccess={(msg) => toast.success(msg)}
          onWarning={(msg) => toast.warning(msg)}
          onError={(msg) => toast.error(msg)}
        />

        {/* Modal para agregar bien sin placa */}
        {mostrarModalBienSinPlaca && (
          <ModalBienSinPlaca
            isOpen={true}
            servicio={(() => {
              // Usar el servicio activo fijado (mismo que usa el colaborativo)
              if (codigoServicioActivo) {
                const svc = conteoInventario?.servicios.find(s => s.codigo === codigoServicioActivo)
                return svc ? `${svc.codigo} - ${svc.nombre}` : codigoServicioActivo
              }
              return ''
            })()}
            serviciosActivos={(() => {
              // Mismos servicios incluidos que la ventana de "por inventariar"
              if (!conteoInventario) return []
              return conteoInventario.servicios
                .filter(s => serviciosHabilitadosGlobal.length > 0 ? serviciosHabilitadosGlobal.includes(s.codigo) : false)
                .filter(s => !serviciosExcluidos.includes(s.codigo))
                .map(s => ({ codigo: s.codigo, nombre: s.nombre }))
            })()}
            ubicacionesTNS={(window as any).__ubicacionesTNS || []}
            onAgregar={agregarBienSinPlaca}
            onClose={() => { setMostrarModalBienSinPlaca(false); setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100) }}
          />
        )}

        {/* Modal para editar ubicación */}
        {mostrarModalUbicacion && ubicacionEditando && (() => {
          const bienUbic = bienesInventariados.find(b => b.placa === ubicacionEditando.placa)
          const idxUbic = bienesInventariados.findIndex(b => b.placa === ubicacionEditando.placa)
          return (
          <ModalUbicacion
            isOpen={true}
            placa={ubicacionEditando.placa}
            descripcion={bienUbic?.descripcion ?? ''}
            ubicacionActual={bienUbic?.ubicacion ?? ''}
            ubicacionesTNS={(window as any).__ubicacionesTNS || []}
            onGuardar={(nuevaUbicacion) => {
              const ubicacionAnterior = bienUbic?.ubicacion || 'Sin ubicación'
              if (idxUbic >= 0) editarUbicacion(idxUbic, nuevaUbicacion)
              if (ubicacionAnterior !== nuevaUbicacion) {
                // Traza automática del sistema: va al grupo "Alertas del sistema"
                // del modal (no editable), no se mezcla con las notas manuales.
                // El argumento servicio se guarda como CÓDIGO del servicio
                // activo (convención unificada), no como nombre de dependencia
                // (bienUbic?.servicio). Esta nota es automática → siempre visible;
                // el código importa por coherencia de la agrupación en el guardado.
                const nota = crearNotaAutomatica(bienUbic?.placa || '', bienUbic?.descripcion || '', `Ubicación cambiada de "${ubicacionAnterior}" a "${nuevaUbicacion}"`, servicioSeleccionado || servicioActivoInfo?.codigo || '', nuevaUbicacion, 'Ubicación actualizada', getAuthUserCedulaReal() || getAuthUserCedula())
                actualizarRegistrosObsNotas([...registrosObsNotas, nota])
              }
            }}
            onGuardarTNS={() => {}}
            onClose={() => { setMostrarModalUbicacion(false); setUbicacionEditando(null) }}
            onSuccess={(msg) => toast.success(msg)}
            onWarning={(msg) => toast.warning(msg)}
          />
          )
        })()}

        {/* Modal para observaciones y notas */}
        {mostrarModalObservacion && observacionEditando && (() => {
          const bienObs = bienesInventariados.find(b => b.placa === observacionEditando.placa)
          return (
          <ModalObservacionesNotas
            isOpen={true}
            onClose={() => { setMostrarModalObservacion(false); setObservacionEditando(null); setTabInicialObs('observaciones') }}
            placa={observacionEditando.placa}
            descripcionBien={bienObs?.descripcion ?? ''}
            // Servicio como CÓDIGO del servicio activo (convención unificada), no
            // el nombre de dependencia del bien (bienObs?.servicio). Así los
            // registros nuevos del modal se escriben con código y el filtro
            // perteneceAlServicio/registroVisible compara código-contra-código.
            servicio={servicioActivoInfo?.codigo || servicioSeleccionado || ''}
            ubicacion={bienObs?.ubicacion}
            cedulaUsuario={cedulaFiltroObs}
            responsableNombre={bienObs?.nombre_responsable}
            responsableCedula={bienObs?.cedula_responsable}
            registros={registrosObsNotas}
            onRegistrosChange={actualizarRegistrosObsNotas}
            onSuccess={(msg) => toast.success(msg)}
            onWarning={(msg) => toast.warning(msg)}
            tabInicial={tabInicialObs}
            notaObligatoria={bienObs?.estado === 'M'}
          />
          )
        })()}

        {/* Modal de previsualización del PDF (reutilizando componente de transferencias) */}
        {pdfPreview && (
          <ModalPrevisualizarPdf
            pdfDataUrl={pdfPreview.pdfDataUrl}
            nombreArchivo={pdfPreview.nombreArchivo}
            modo="history"
            onDescargar={descargarPdfPreview}
            onCerrar={cerrarPdfPreview}
          />
        )}
      </div>
    </div>
  )
}// ─── PANEL INVENTARIO FÍSICO REGIONALES ────────────────────────────────────────────────────────────────────

const REGIONALES = [
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
]



function PanelInventarioRegionales({ toast, onAbrirPanel, onCerrarPanel }: { toast: ReturnType<typeof useToast>; onAbrirPanel?: () => void; onCerrarPanel?: () => void }) {
  // ─── Hooks compartidos ───────────────────────────────────────────────────
  const { inputRef, codigoBarras, setCodigoBarras, procesando, setProcesando, alertaDuplicado, setAlertaDuplicado, devolverFoco } = useEscaner()
  const { bienesInventariados, actualizarBienes, editarEstado, editarSerial, editarUbicacion, eliminarBien: eliminarBienHook, agregarBienSinPlaca: agregarBienSinPlacaHook, limpiarInventario: limpiarInventarioHook, cargarDesdeStorage, ultimoBienAgregadoIndex, setUltimoBienAgregadoIndex } = useInventarioBienes({ persistir: true, storageKey: 'inventario_regional_bienes' })
  const modales = useModalesInventario()
  const { registrosObsNotas: registrosObsNotasRegional, actualizarRegistros: actualizarRegistrosObsNotasRegional } = useObservacionesNotas({ storageKey: 'inventario_regional_obs_notas' })
  const { ubicacionesTNS: ubicacionesTNSCargadas } = useUbicacionesTNS()

  // ─── Cargar bienes desde localStorage al montar ───────────────────────────
  useEffect(() => {
    const bienesGuardados = cargarDesdeStorage()
    if (bienesGuardados.length > 0) {
      actualizarBienes(bienesGuardados)
    }
  }, [])

  // ─── Estado local del panel ──────────────────────────────────────────────
  const [servicioSeleccionado, setServicioSeleccionadoRaw] = useState(() => {
    try { return localStorage.getItem('inventario_regional_servicio') || '' } catch { return '' }
  })
  const setServicioSeleccionado = (v: string) => {
    setServicioSeleccionadoRaw(v)
    try { if (v) localStorage.setItem('inventario_regional_servicio', v); else localStorage.removeItem('inventario_regional_servicio') } catch { /* silenciar */ }
  }
  const [ubicacionFiltro] = useState('')
  const [cedulaCoordinador, setCedulaCoordinador] = useState('')
  const [coordinadorConfirmado, setCoordinadorConfirmado] = useState(false)
  const [bienesCoordinador, setBienesCoordinador] = useState<Set<string>>(new Set())
  const [bienesCoordinadorLista, setBienesCoordinadorLista] = useState<any[]>([])
  const [bienesRegional, setBienesRegional] = useState<any[]>([])
  const [cargando, setCargando] = useState(false)
  // Confirmación antes de marcar un bien como M (para baja), para evitar errores.
  const [confirmarEstadoM, setConfirmarEstadoM] = useState<{ index: number; placa: string } | null>(null)
  const [mostrarModalTotalBienes, setMostrarModalTotalBienes] = useState(false)
  const [mostrarModalFaltantes, setMostrarModalFaltantes] = useState(false)
  const [mostrarModalAlertas, setMostrarModalAlertas] = useState(false)
  const [tabModal, setTabModal] = useState<'servicio' | 'coordinador' | 'ubicacion' | 'excluidos'>('servicio')
  const [ubicacionesDisponibles, setUbicacionesDisponibles] = useState<{ id: number; codigo: string; nombre: string; label: string }[]>([])
  const [ubicacionBusqueda, setUbicacionBusqueda] = useState('')
  const [ubicacionSeleccionada, setUbicacionSeleccionadaRaw] = useState<{ id: number; codigo: string; nombre: string; label: string } | null>(() => {
    try { const d = localStorage.getItem('inventario_regional_ubicacion'); return d ? JSON.parse(d) : null } catch { return null }
  })
  const setUbicacionSeleccionada = (v: { id: number; codigo: string; nombre: string; label: string } | null) => {
    setUbicacionSeleccionadaRaw(v)
    try { if (v) localStorage.setItem('inventario_regional_ubicacion', JSON.stringify(v)); else localStorage.removeItem('inventario_regional_ubicacion') } catch { /* silenciar */ }
  }
  const [bienesUbicacion, setBienesUbicacion] = useState<any[]>([])
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(false)
  const [resumenCarga, setResumenCarga] = useState<{ servicio: number; ubicacion: number; nuevos: number; coordinador: number; comunes: number } | null>(null)
  const [bienesExcluidos, setBienesExcluidos] = useState<Set<string>>(new Set())

  const persistirExcluidos = (nuevoSet: Set<string>) => {
    setBienesExcluidos(nuevoSet)
    try {
      const key = `inventario_regional_excluidos_${servicioSeleccionado || '_'}`
      localStorage.setItem(key, JSON.stringify([...nuevoSet]))
    } catch { /* silenciar */ }
  }
  const [placasYaReportadas, setPlacasYaReportadas] = useState<Set<string>>(new Set())
  const [filtroModalBienes, setFiltroModalBienes] = useState('')
  const [mostrarModalColaboradores, setMostrarModalColaboradores] = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)
  const exportarExcelProvisional = (nombreArchivo: string) => {
    if (bienesInventariados.length === 0) return

    const filas = bienesInventariados.map((b, i) => {
      const nota = registrosObsNotasRegional.find(r => r.placa === b.placa && r.tipo === 'nota')
      const obs = registrosObsNotasRegional.find(r => r.placa === b.placa && r.tipo === 'observacion' && r.estado === 'pendiente')
      return {
        'Ítem': i + 1,
        'Placa': b.placa,
        'Descripción': b.descripcion,
        'Serial': b.serial || 'N/A',
        'Estado': b.estado || 'B',
        'CC. Responsable': b.cedula_responsable || '',
        'Nom. Responsable': b.nombre_responsable || '',
        'CC Usuario': b.custodio_cedula || '',
        'Nom. Usuario': b.custodio_nombre || '',
        'Servicio / Grupo': b.servicio || servicioSeleccionado || '',
        'Ubicación': b.ubicacion || '',
        'Observación': obs?.texto || '',
        'Nota': nota?.texto || '',
        'Fecha Ingreso': b.timestamp ? new Date(b.timestamp).toLocaleString('es-CO') : '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario Provisional')
    XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
    toast.success(`Excel descargado — ${bienesInventariados.length} bienes`)
  }

  // Nombre por defecto sugerido para el Excel provisional (toma regional)
  const nombreExcelProvisionalRegionalPorDefecto = () => {
    const regional = REGIONALES.find(r => r.codigo === servicioSeleccionado)
    const nombreRegional = regional ? regional.nombre : (servicioSeleccionado || 'Regional')
    const fechaStr = new Date().toLocaleDateString('es-CO').replace(/\//g, '-')
    return `Inventario_Provisional_${nombreRegional.replace(/\s+/g, '_')}_${fechaStr}`
  }

  // Nombre por defecto sugerido para el Excel de bienes a inventariar
  const nombreExcelInventariarPorDefecto = () => {
    const regional = REGIONALES.find(r => r.codigo === servicioSeleccionado)
    const nombreRegional = regional ? regional.nombre : (servicioSeleccionado || 'Regional')
    const fechaStr = new Date().toLocaleDateString('es-CO').replace(/\//g, '-')
    return `Bienes_a_inventariar_${nombreRegional.replace(/\s+/g, '_')}_${fechaStr}`
  }

  // Exportar a Excel los bienes a inventariar (según el filtro/regional cargada)
  const exportarBienesAInventariar = (nombreArchivo: string) => {
    const aInventariar = bienesRegional.filter(b => !bienesExcluidos.has(b.placa))
    if (aInventariar.length === 0) {
      toast.warning('No hay bienes a inventariar para exportar')
      return
    }
    try {

      const normalizarSerial = (serial: any) => {
        const s = (serial ?? '').toString().trim()
        if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s === 'N/A') return 'No aplica'
        return s
      }

      const filas = aInventariar.map((b, i) => ({
        'N°': i + 1,
        'Placa': b.placa || '',
        'Descripción': b.descripcion || '',
        'Serial': normalizarSerial(b.serial),
        'Cédula': b.cedula || b.cedula_responsable || '',
        'Responsable': b.responsable || b.nombre_responsable || '',
        'Ubicación': b.dependencia || b.ubicacion || '',
      }))

      const ws = XLSX.utils.json_to_sheet(filas)
      ws['!cols'] = [
        { wch: 6 },  // N°
        { wch: 14 }, // Placa
        { wch: 45 }, // Descripción
        { wch: 20 }, // Serial
        { wch: 14 }, // Cédula
        { wch: 32 }, // Responsable
        { wch: 32 }, // Ubicación
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Bienes a inventariar')
      XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
      toast.success(`Excel descargado — ${aInventariar.length} bienes a inventariar`)
    } catch (err) {
      toast.error('Error al exportar a Excel')
      console.error(err)
    }
  }
  const [pdfPreview, setPdfPreview] = useState<{ pdfDataUrl: string; nombreArchivo: string } | null>(null)
  const [inventarioPendienteRegistro, setInventarioPendienteRegistro] = useState<any>(null)
  const [mostrarModalCargaMasiva, setMostrarModalCargaMasiva] = useState(false)
  const [mostrarModalInventariadosRegional, setMostrarModalInventariadosRegional] = useState(false)
  const [bienesInventariadosRegionalModal, setBienesInventariadosRegionalModal] = useState<any[]>([])
  const [cargandoInventariadosRegional, setCargandoInventariadosRegional] = useState(false)
  const [mostrarModalSobrantesRegional, setMostrarModalSobrantesRegional] = useState(false)
  const [modalExcelInventariarAbierto, setModalExcelInventariarAbierto] = useState(false)
  // Modal para el Excel provisional de la toma REGIONAL.
  const [modalExcelProvisionalRegional, setModalExcelProvisionalRegional] = useState(false)

  // Aliases de compatibilidad: modales compartidos → nombres que usa el JSX existente
  const mostrarModalEliminar = modales.mostrarModalEliminar
  const setMostrarModalEliminar = (v: { index: number; placa: string } | null) => v ? modales.abrirModalEliminar(v.index, v.placa) : modales.cerrarModalEliminar()
  const mostrarModalCustodio = modales.mostrarModalCustodio
  const setMostrarModalCustodio = (v: { index: number } | null) => v ? modales.abrirModalCustodio(v.index) : modales.cerrarModalCustodio()
  const mostrarModalSerial = modales.mostrarModalSerial
  const setMostrarModalSerial = (v: { index: number; serial: string } | null) => v ? modales.abrirModalSerial(v.index, v.serial) : modales.cerrarModalSerial()
  const historialPlaca = modales.historialPlaca
  const setHistorialPlaca = (v: { placa: string; descripcion: string; serial?: string } | null) => v ? modales.abrirHistorial(v.placa, v.descripcion, v.serial) : modales.cerrarHistorial()
  const mostrarModalBienSinPlaca = modales.mostrarModalBienSinPlaca
  const setMostrarModalBienSinPlaca = (v: boolean) => v ? modales.abrirModalBienSinPlaca() : modales.cerrarModalBienSinPlaca()
  const mostrarModalLimpiar = modales.mostrarModalLimpiar
  const setMostrarModalLimpiar = (v: boolean) => v ? modales.abrirModalLimpiar() : modales.cerrarModalLimpiar()
  const mostrarModalObservacion = modales.mostrarModalObservacion
  const setMostrarModalObservacion = (v: boolean) => v ? modales.abrirModalObservacion('', '') : modales.cerrarModalObservacion()
  const observacionEditando = modales.observacionEditando
  const setObservacionEditando = (v: { placa: string; texto: string } | null) => v ? modales.abrirModalObservacion(v.placa, v.texto) : modales.cerrarModalObservacion()
  const mostrarModalUbicacion = modales.mostrarModalUbicacion
  const setMostrarModalUbicacion = (v: boolean) => v ? modales.abrirModalUbicacion('', '') : modales.cerrarModalUbicacion()
  const ubicacionEditando = modales.ubicacionEditando
  const setUbicacionEditando = (v: { placa: string; texto: string } | null) => v ? modales.abrirModalUbicacion(v.placa, v.texto) : modales.cerrarModalUbicacion()
  const tabInicialObsRegional = modales.tabInicialObs
  const setTabInicialObsRegional = modales.setTabInicialObs

  // Sincronizar ubicaciones del hook con el estado local (compatibilidad)
  useEffect(() => {
    if (ubicacionesTNSCargadas.length > 0) {
      setUbicacionesDisponibles(ubicacionesTNSCargadas as any)
    }
  }, [ubicacionesTNSCargadas])

  // Ubicaciones que se muestran en el desplegable, acotadas al servicio regional
  // seleccionado: cada regional (REGIONALES) tiene un `nombre` = municipio
  // (Pereira, Medellín…), así que filtramos las ubicaciones TNS cuyo nombre/label
  // coincida con ese municipio. NO auto-selecciona: solo limita las opciones para
  // que la persona elija la ubicación correcta del servicio.
  // Fallback: si no hay servicio, o el municipio no matchea ninguna ubicación,
  // se muestran todas (para no bloquear casos no mapeados).
  const ubicacionesParaServicio = useMemo(() => {
    const norm = (s: string) =>
      (s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
        .toUpperCase().trim()
    if (!servicioSeleccionado) return ubicacionesDisponibles
    const regional = REGIONALES.find(r => r.codigo === servicioSeleccionado)
    if (!regional) return ubicacionesDisponibles
    const municipio = norm(regional.nombre)
    if (!municipio) return ubicacionesDisponibles
    const filtradas = ubicacionesDisponibles.filter(u => {
      const nom = norm(u.nombre || '')
      const lab = norm(u.label || '')
      return nom.includes(municipio) || lab.includes(municipio)
    })
    // Si el municipio no coincide con ninguna ubicación (nombre no mapeado),
    // dejamos todas para no impedir la selección manual.
    return filtradas.length > 0 ? filtradas : ubicacionesDisponibles
  }, [servicioSeleccionado, ubicacionesDisponibles])

  // WebSocket: actualizar contadores en tiempo real cuando se elimina un inventario
  useTransferenciasWebSocket({
    onInventarioEliminado: (servicio, placasLiberadas) => {
      if (servicio === servicioSeleccionado && bienesRegional.length > 0) {
        setPlacasYaReportadas(prev => {
          const nuevas = new Set(prev)
          for (const placa of placasLiberadas) {
            nuevas.delete(placa)
          }
          return nuevas
        })
      }
    },
  })

  // Panel de contadores dinámico: se abre cuando hay bienes cargados o está
  // cargando, y se oculta automáticamente cuando no hay nada que mostrar.
  useEffect(() => {
    if (cargando || bienesRegional.length > 0) {
      onAbrirPanel?.()
    } else {
      onCerrarPanel?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, bienesRegional.length])

  // Auto-cargar bienes cuando cambian los filtros (siempre requiere al menos 2 filtros llenos)
  const prevServicioRef = useRef(servicioSeleccionado)
  const prevUbicacionRef = useRef(ubicacionSeleccionada)
  const prevCoordinadorRef = useRef(cedulaCoordinador)
  const debounceRef = useRef<number | null>(null)
  const cargaInicialRef = useRef(false)

  // Auto-cargar bienes al montar si hay servicio persistido en localStorage
  // Se ejecuta una sola vez y espera a que todos los filtros estén listos
  useEffect(() => {
    if (cargaInicialRef.current) return
    if (servicioSeleccionado) {
      cargaInicialRef.current = true
      // Si ya cargamos esta misma selección antes (servicio+ubicación), al
      // volver de otro módulo restauramos la base desde cache SIN volver a
      // consultar el backend. Solo refetch si la selección cambió o no hay cache.
      try {
        const raw = localStorage.getItem('inventario_regional_base')
        if (raw) {
          const cache = JSON.parse(raw) as { firma: string; bienes: any[] }
          const firmaActual = `${servicioSeleccionado || ''}|${ubicacionSeleccionada?.id || ''}`
          if (cache.firma === firmaActual && Array.isArray(cache.bienes) && cache.bienes.length > 0) {
            setBienesRegional(cache.bienes)
            return  // No recalcular: ya teníamos la base de esta selección.
          }
        }
      } catch { /* si falla el cache, se hace el fetch normal */ }
      cargarBienesRegional(true, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Ignorar el primer render (la carga inicial ya se maneja arriba)
    if (!cargaInicialRef.current && servicioSeleccionado) return

    const servicioChanged = prevServicioRef.current !== servicioSeleccionado
    const ubicacionChanged = prevUbicacionRef.current !== ubicacionSeleccionada
    const coordinadorChanged = prevCoordinadorRef.current !== cedulaCoordinador
    prevServicioRef.current = servicioSeleccionado
    prevUbicacionRef.current = ubicacionSeleccionada
    prevCoordinadorRef.current = cedulaCoordinador

    const huboCambio = servicioChanged || ubicacionChanged || coordinadorChanged
    if (!huboCambio) return

    // Si solo cambió el coordinador (el usuario está escribiendo), no disparar
    // Solo disparar si fue confirmado (seleccionado del dropdown) o borrado
    if (coordinadorChanged && !servicioChanged && !ubicacionChanged) {
      if (cedulaCoordinador.length > 0 && !coordinadorConfirmado) return
    }

    // Contar filtros con valor confirmado
    const filtrosLlenos = [
      !!servicioSeleccionado,
      !!ubicacionSeleccionada,
      !!(cedulaCoordinador.trim() && coordinadorConfirmado)
    ].filter(Boolean).length

    // Solo auto-cargar si hay al menos 2 filtros llenos
    if (filtrosLlenos < 2) return

    // Debounce para evitar múltiples llamadas rápidas
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      // Preservar siempre los bienes ya inventariados al cambiar filtros
      cargarBienesRegional(false, true)
    }, 400)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [servicioSeleccionado, ubicacionSeleccionada, cedulaCoordinador, coordinadorConfirmado])

  // ─── Auto-focus inteligente del escáner ──────────────────────────────────
  // Mantiene el foco en el input del escáner para que la pistola funcione sin clic manual.
  // Se desactiva completamente cuando hay un modal abierto para no robar foco.
  const hayModalAbiertoRegional = mostrarModalUbicacion || mostrarModalObservacion || mostrarModalEliminar || mostrarModalCustodio || mostrarModalSerial || mostrarModalLimpiar || mostrarModalBienSinPlaca || mostrarModalColaboradores || mostrarModalTotalBienes || mostrarModalFaltantes || mostrarModalAlertas || mostrarModalInventariadosRegional || mostrarModalSobrantesRegional || mostrarModalCargaMasiva || !!alertaDuplicado || !!historialPlaca || !!pdfPreview

  useEffect(() => {
    if (hayModalAbiertoRegional) return

    // Focus inicial
    inputRef.current?.focus({ preventScroll: true })

    // Al hacer click en zona no interactiva, devolver foco al escáner
    const handleClickAnywhere = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // No robar foco si el click fue en un elemento interactivo o dentro de un modal/overlay
      const isInteractive = target.tagName === 'INPUT' ||
                            target.tagName === 'SELECT' ||
                            target.tagName === 'TEXTAREA' ||
                            target.tagName === 'BUTTON' ||
                            target.closest('button') !== null ||
                            target.closest('[data-selector]') !== null ||
                            target.closest('[role="dialog"]') !== null ||
                            target.closest('.modal') !== null
      if (!isInteractive) {
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50)
      }
    }

    document.addEventListener('click', handleClickAnywhere)
    return () => document.removeEventListener('click', handleClickAnywhere)
  }, [hayModalAbiertoRegional])

  // Devolver foco al escáner cuando se cierran los modales
  useEffect(() => {
    if (!hayModalAbiertoRegional) {
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 150)
    }
  }, [hayModalAbiertoRegional])

  // Escape para cerrar modales, Enter para aceptar alerta duplicado
  useEffect(() => {
    const handleModalKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (alertaDuplicado) { setAlertaDuplicado(null); devolverFoco(100); return }
        if (mostrarModalSerial) { setMostrarModalSerial(null); return }
        if (mostrarModalCustodio) { setMostrarModalCustodio(null); return }
        if (mostrarModalObservacion) { setMostrarModalObservacion(false); return }
        if (mostrarModalUbicacion) { setMostrarModalUbicacion(false); return }
        if (mostrarModalEliminar) { setMostrarModalEliminar(null); return }
        if (mostrarModalLimpiar) { setMostrarModalLimpiar(false); return }
        if (mostrarModalBienSinPlaca) { setMostrarModalBienSinPlaca(false); return }
        if (mostrarModalTotalBienes) { setMostrarModalTotalBienes(false); return }
        if (mostrarModalInventariadosRegional) { setMostrarModalInventariadosRegional(false); return }
        if (mostrarModalFaltantes) { setMostrarModalFaltantes(false); return }
        if (mostrarModalSobrantesRegional) { setMostrarModalSobrantesRegional(false); return }
        if (mostrarModalAlertas) { setMostrarModalAlertas(false); return }
        if (mostrarModalColaboradores) { setMostrarModalColaboradores(false); return }
      }
      // El modal de placa duplicada solo se cierra con Escape (arriba) o con su
      // botón "Entendido". NO se cierra con Enter (evita el auto-cierre inmediato).
    }
    document.addEventListener('keydown', handleModalKeys)
    return () => document.removeEventListener('keydown', handleModalKeys)
  }, [alertaDuplicado, mostrarModalSerial, mostrarModalCustodio, mostrarModalObservacion, mostrarModalUbicacion, mostrarModalEliminar, mostrarModalLimpiar, mostrarModalBienSinPlaca, mostrarModalTotalBienes, mostrarModalInventariadosRegional, mostrarModalSobrantesRegional, mostrarModalFaltantes, mostrarModalAlertas, mostrarModalColaboradores])

  const cargarBienesRegional = async (silencioso = false, preservarBienes = false) => {
    if (!servicioSeleccionado) {
      toast.warning('Debe seleccionar un servicio (regional)')
      return
    }

    setCargando(true)
    try {
      const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
      const params = new URLSearchParams({
        servicio: servicioSeleccionado,
      })
      
      if (ubicacionFiltro.trim()) {
        params.append('ubicacion', ubicacionFiltro.trim())
      }

      const res = await fetch(`${API_URL}/almacen/inventario-regional/?${params}`)
      const json = await res.json()

      if (res.ok && json.data) {
        let bienesFinales = [...json.data]
        
        // Si hay ubicación seleccionada, también traer bienes por ubicación y fusionar
        if (ubicacionSeleccionada) {
          try {
            const resUbic = await fetch(`${API_URL}/almacen/bienes-por-ubicacion/?ubicacion_id=${ubicacionSeleccionada.id}`)
            if (resUbic.ok) {
              const jsonUbic = await resUbic.json()
              const bienesUbic = jsonUbic.data ?? []
              // Fusionar: agregar los que no existen ya por placa
              const placasExistentes = new Set(bienesFinales.map((b: any) => b.placa))
              const nuevos = bienesUbic.filter((b: any) => !placasExistentes.has(b.placa))
              bienesFinales = [...bienesFinales, ...nuevos]
              setBienesUbicacion(bienesUbic)
              // Guardar para mostrar en resumen
              ;(window as any).__nuevosUbicacion = nuevos.length
            }
          } catch { /* silenciar */ }
        } else {
          setBienesUbicacion([])
        }
        
        setBienesRegional(bienesFinales)
        // Cachear la base cargada + la firma de filtros, para NO recalcular al
        // volver de otro módulo con la misma selección (punto: evitar refetch).
        try {
          const firma = `${servicioSeleccionado || ''}|${ubicacionSeleccionada?.id || ''}`
          localStorage.setItem('inventario_regional_base', JSON.stringify({ firma, bienes: bienesFinales }))
        } catch { /* silenciar */ }
        if (!preservarBienes) limpiarInventarioHook()
        
        // ─── Auto-excluir bienes por grupo contable 201 (armamento), 213 (vehículos) y PED ───
        const excluirAutoSet = new Set<string>()
        // Patrones de descripción para armamento/protección (fallback si grupo no está disponible)
        const patronesArmamento = ['PISTOLA', 'GLOCK', 'CHALECO', 'BLINDADO', 'BALISTIC', 'SUBAMET', 'MUNICION', 'CAL.', 'CAL ']
        for (const bien of bienesFinales) {
          const grupoBien = (bien.grupo_bien || '').trim()
          const grupoContable = (bien.grupo_contable || '').trim()
          const dependencia = (bien.dependencia || '').toUpperCase()
          const descripcion = (bien.descripcion || '').toUpperCase()
          // Excluir grupo contable 201 (armamento y accesorios): pistolas, chalecos, munición, etc.
          if (grupoContable.startsWith('201') || grupoBien.startsWith('201')) {
            excluirAutoSet.add(bien.placa)
          }
          // Los VEHÍCULOS (grupo 213) SÍ se inventarían en el regional (los toma
          // el mismo equipo), por eso ya NO se auto-excluyen aquí. Solo el
          // armamento/protección queda fuera.
          // Excluir por descripción (fallback cuando grupo no está disponible)
          else if (patronesArmamento.some(p => descripcion.includes(p))) {
            excluirAutoSet.add(bien.placa)
          }
          // Excluir PED - Población de Enfoque Diferencial (es un servicio, no inventariable)
          if (dependencia.includes('POBLACION') && dependencia.includes('ENFOQUE') && dependencia.includes('DIFERENCIAL')) {
            excluirAutoSet.add(bien.placa)
          }
        }
        // Recuperar exclusiones guardadas en localStorage para este servicio y combinar con las automáticas
        try {
          const savedKey = `inventario_regional_excluidos_${servicioSeleccionado}`
          const saved = localStorage.getItem(savedKey)
          if (saved) {
            const savedSet: string[] = JSON.parse(saved)
            savedSet.forEach(p => excluirAutoSet.add(p))
          }
        } catch { /* silenciar */ }
        persistirExcluidos(excluirAutoSet)

        // ─── Consultar placas ya reportadas en inventarios anteriores ───
        try {
          const todasLasPlacas = bienesFinales.map((b: any) => b.placa)
          const yaReportadas = await verificarPlacasYaInventariadas(todasLasPlacas)
          setPlacasYaReportadas(new Set(yaReportadas))
        } catch { setPlacasYaReportadas(new Set()) }
        
        // Si hay cédula de coordinador, consultar sus bienes y cruzar
        if (cedulaCoordinador.trim()) {
          try {
            const resCoord = await fetch(`${API_URL}/almacen/consulta-activos/?cedula=${cedulaCoordinador.trim()}`)
            if (resCoord.ok) {
              const jsonCoord = await resCoord.json()
              if (jsonCoord.data && jsonCoord.data.length > 0) {
                const placasCoord = new Set<string>(jsonCoord.data.map((b: any) => b.placa))
                setBienesCoordinador(placasCoord)
                setBienesCoordinadorLista(jsonCoord.data)
                const comunes = json.data.filter((b: any) => placasCoord.has(b.placa)).length
                if (!silencioso) setResumenCarga({
                  servicio: json.data.length,
                  ubicacion: bienesUbicacion.length,
                  nuevos: (window as any).__nuevosUbicacion ?? 0,
                  coordinador: jsonCoord.data.length,
                  comunes,
                })
              } else {
                setBienesCoordinador(new Set())
                setBienesCoordinadorLista([])
                if (!silencioso) setResumenCarga({
                  servicio: json.data.length,
                  ubicacion: (window as any).__nuevosUbicacion ?? 0,
                  nuevos: (window as any).__nuevosUbicacion ?? 0,
                  coordinador: 0,
                  comunes: 0,
                })
              }
            } else {
              setBienesCoordinador(new Set())
              setBienesCoordinadorLista([])
            }
          } catch {
            setBienesCoordinador(new Set())
            setBienesCoordinadorLista([])
          }
        } else {
          setBienesCoordinador(new Set())
          setBienesCoordinadorLista([])
          if (!silencioso) setResumenCarga({
            servicio: json.data.length,
            ubicacion: bienesUbicacion.length,
            nuevos: (window as any).__nuevosUbicacion ?? 0,
            coordinador: 0,
            comunes: 0,
          })
        }
      } else {
        toast.error(json.mensaje ?? 'Error al cargar bienes')
        setBienesRegional([])
        setBienesCoordinador(new Set())
        setBienesCoordinadorLista([])
      }
    } catch (_error) {
      toast.error('Error de conexión')
      setBienesRegional([])
      setBienesCoordinador(new Set())
      setBienesCoordinadorLista([])
    }
    // Limpiar observaciones/notas de sesión anterior al cargar nuevos bienes
    if (!preservarBienes) {
      actualizarRegistrosObsNotasRegional([])
    }
    setCargando(false)
  }

  const procesarCodigoBarras = async () => {
    if (!codigoBarras.trim()) return
    
    const placaBuscada = codigoBarras.trim().toUpperCase()
    
    // Verificar si la placa ya fue procesada (duplicado local)
    const placaDuplicada = bienesInventariados.find(b => b.placa === placaBuscada)
    if (placaDuplicada) {
      const ubicacionInfo = placaDuplicada.ubicacion ? ` — Ubicación: ${placaDuplicada.ubicacion}` : ''
      setAlertaDuplicado(`PLACA DUPLICADA: ${placaBuscada} ya fue procesada${ubicacionInfo}. Revise si es un error.`)
      setCodigoBarras('')
      return
    }

    // Verificar si la placa ya fue reportada en inventarios anteriores
    try {
      const yaReportadas = await verificarPlacasYaInventariadas([placaBuscada])
      if (yaReportadas.length > 0) {
        setAlertaDuplicado(`⚠️ BIEN YA REPORTADO: ${placaBuscada} ya fue inventariado en un reporte anterior. No se puede agregar nuevamente.`)
        setCodigoBarras('')
        return
      }
    } catch { /* si falla la verificación, continuar */ }
    
    setProcesando(true)

    try {
      const bienEncontrado = bienesRegional.find(b => b.placa === placaBuscada)
      
      if (bienEncontrado) {
        // Consultar TNS para obtener servicio y ubicación reales
        const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
        let servicio = bienEncontrado.dependencia || ''
        let ubicacion = ''
        try {
          const resBien = await fetch(`${API_URL}/almacen/admin/buscar-bien/?placa=${placaBuscada}`)
          if (resBien.ok) {
            const jsonBien = await resBien.json()
            if (jsonBien.data) {
              servicio = jsonBien.data.dependencia || servicio
              ubicacion = jsonBien.data.ubicacion || ''
            }
          }
        } catch { /* usar datos de la lista */ }

        const nuevoBien: BienInventario = {
          placa: bienEncontrado.placa,
          descripcion: bienEncontrado.descripcion || '',
          serial: bienEncontrado.serial || 'N/A',
          estado: 'B',
          cedula_responsable: bienEncontrado.cedula || '',
          nombre_responsable: bienEncontrado.responsable || '',
          servicio,
          ubicacion,
          timestamp: new Date().toISOString(),
          custodio_nombre: bienEncontrado.responsable || '',
          custodio_cedula: bienEncontrado.cedula || '',
        }
        const nuevaLista = [...bienesInventariados, nuevoBien]
        actualizarBienes(nuevaLista)
        setUltimoBienAgregadoIndex(nuevaLista.length - 1)
      } else {
        // No está en la lista - buscar en Firebird
        const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
        const res = await fetch(`${API_URL}/almacen/admin/buscar-bien/?placa=${placaBuscada}`)
        
        if (res.ok) {
          const json = await res.json()
          if (json.data) {
            // Verificar si el bien es de otra regional
            const codigoServicioBien = json.data.codigoDependencia || ''
            if (codigoServicioBien && codigoServicioBien !== servicioSeleccionado) {
              const regionalBien = REGIONALES.find(r => r.codigo === codigoServicioBien)
              const nombreRegional = regionalBien ? regionalBien.nombre : codigoServicioBien
              // Advertencia (no "Error crítico"): pertenece a otro servicio, no es baja.
              toast.warning(`${placaBuscada} pertenece a "${nombreRegional}" — no a este servicio.`)
              alertaInventario.placaServicioDiferente(placaBuscada, nombreRegional)
            } else {
              toast.warning(`${placaBuscada} no está en la lista del servicio.`)
            }
            
            const nuevoBien: BienInventario = {
              placa: placaBuscada,
              descripcion: json.data.desmat ?? '',
              serial: json.data.serial ?? 'N/A',
              estado: 'B',
              cedula_responsable: json.data.cedulaResponsable ?? '',
              nombre_responsable: json.data.responsable ?? 'Desconocido',
              servicio: json.data.dependencia ?? '',
              ubicacion: json.data.ubicacion ?? '',
              timestamp: new Date().toISOString(),
              custodio_nombre: json.data.responsable ?? '',
              custodio_cedula: json.data.cedulaResponsable ?? '',
            }
            const nuevaLista = [...bienesInventariados, nuevoBien]
            actualizarBienes(nuevaLista)
            setUltimoBienAgregadoIndex(nuevaLista.length - 1)
          }
        } else {
          toast.error(`Bien ${placaBuscada} NO encontrado en el sistema`)
          alertaInventario.placaNoRegistrada(placaBuscada)
          const nuevoBien: BienInventario = {
            placa: placaBuscada,
            descripcion: '',
            serial: 'N/A',
            estado: 'B',
            cedula_responsable: '',
            nombre_responsable: 'DESCONOCIDO',
            ubicacion: '',
            timestamp: new Date().toISOString(),
          }
          const nuevaLista = [...bienesInventariados, nuevoBien]
          actualizarBienes(nuevaLista)
          setUltimoBienAgregadoIndex(nuevaLista.length - 1)
        }
      }
    } catch (error) {
      toast.error(`Error: ${error}`)
    }

    setProcesando(false)
    setCodigoBarras('')
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100)
  }

  // ─── Funciones CRUD desde hooks compartidos (con toast/UI específico) ────
  const agregarBienSinPlaca = (bien: { descripcion: string; ubicacion: string; servicio: string; custodio_nombre: string; custodio_cedula: string }) => {
    agregarBienSinPlacaHook({ ...bien, servicio: bien.servicio || servicioSeleccionado })
    toast.success(`Bien sin placa agregado: ${bien.descripcion.substring(0, 40)}`)
    setMostrarModalBienSinPlaca(false)
    devolverFoco()
  }

  const eliminarBien = (index: number) => {
    const placaEliminada = bienesInventariados[index]?.placa
    eliminarBienHook(index)
    // Si el bien tenía nota/observación, se descarta al eliminarlo (ya no existe
    // el bien al que pertenecía).
    if (placaEliminada) {
      actualizarRegistrosObsNotasRegional(registrosObsNotasRegional.filter(r => r.placa !== placaEliminada))
    }
    setMostrarModalEliminar(null)
    toast.success('Bien eliminado del inventario')
    devolverFoco()
  }

  const abrirModalEliminar = (index: number, placa: string) => {
    setMostrarModalEliminar({ index, placa })
  }

  const limpiarInventario = () => {
    limpiarInventarioHook()
    // Al limpiar también se descartan las notas/observaciones de la sesión:
    // ya no hay bienes a los que pertenezcan.
    actualizarRegistrosObsNotasRegional([])
    // Invalidar el cache de la base regional (la próxima entrada recalculará).
    try { localStorage.removeItem('inventario_regional_base') } catch { /* silenciar */ }
    setMostrarModalLimpiar(false)
    toast.success('Inventario limpiado correctamente')
    devolverFoco(150)
  }

  // "Bienes por inventariar" = placas ÚNICAS reales de la lista que NO están
  // excluidas. Se cuenta sobre placas únicas presentes en bienesRegional para
  // evitar (a) duplicados y (b) exclusiones "fantasma" (placas excluidas que ya
  // no están en la lista) que antes inflaban/descuadraban el número.
  const totalBienes = (() => {
    const unicas = new Set<string>()
    for (const b of bienesRegional) {
      const p = (b.placa || '').trim()
      if (p && !bienesExcluidos.has(p)) unicas.add(p)
    }
    return unicas.size
  })()
  // Inventariados = escaneados en esta sesión (que estén en la lista y no excluidos) + ya reportados en sesiones anteriores (no excluidos)
  const inventariadosSesion = bienesInventariados.filter(b => !b.placa.startsWith('SP-') && bienesRegional.some(br => br.placa === b.placa) && !bienesExcluidos.has(b.placa)).length
  const reportadosAnteriores = [...placasYaReportadas].filter(p => bienesRegional.some(br => br.placa === p) && !bienesExcluidos.has(p) && !bienesInventariados.some(b => b.placa === p)).length
  const totalInventariados = inventariadosSesion + reportadosAnteriores
  const totalFaltantes = Math.max(0, totalBienes - totalInventariados)
  const totalSobrantes = bienesInventariados.filter(b => !b.placa.startsWith('SP-') && (!bienesRegional.some(br => br.placa === b.placa) || bienesExcluidos.has(b.placa))).length
  const totalAlertas = (() => {
    const obsActivas = obtenerObservacionesPendientes(registrosObsNotasRegional).length
    const bienesEstadoM = bienesInventariados.filter(b => b.estado === 'M').length
    return obsActivas + bienesEstadoM
  })()

  const handleGenerarFormato = async (colaborador1: Colaborador, colaborador2: Colaborador, sede: string, ubicacion: string) => {
    // Validar observaciones pendientes
    if (tieneObservacionesBloqueantes(registrosObsNotasRegional)) {
      const pendientes = obtenerObservacionesPendientes(registrosObsNotasRegional)
      const placas = pendientes.map(r => r.placa).join(', ')
      toast.critical(`❌ No se puede guardar. Hay ${pendientes.length} observación(es) pendiente(s) en: ${placas}. Resuélvalas antes de continuar.`)
      setMostrarModalColaboradores(false)
      return
    }

    // Validar custodio obligatorio
    const bienesSinCustodio = bienesInventariados.filter(b => !b.custodio_nombre || !b.custodio_cedula)
    if (bienesSinCustodio.length > 0) {
      const placas = bienesSinCustodio.slice(0, 5).map(b => b.placa).join(', ')
      toast.critical(`No se puede guardar. ${bienesSinCustodio.length} bien(es) no tienen custodio: ${placas}${bienesSinCustodio.length > 5 ? '...' : ''}`)
      setMostrarModalColaboradores(false)
      return
    }

    // Validar que no haya bienes ya reportados en inventarios anteriores
    try {
      const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
      const placasActuales = bienesInventariados.map(b => b.placa)
      const resCheck = await fetch(`${API_URL}/almacen/admin/placas-inventariadas-servicio/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placas: placasActuales })
      })
      if (resCheck.ok) {
        const dataCheck = await resCheck.json()
        const duplicadas = dataCheck.inventariadas ?? []
        if (duplicadas.length > 0) {
          toast.critical(`No se puede guardar. ${duplicadas.length} bien(es) ya fueron reportados: ${duplicadas.slice(0, 10).join(', ')}${duplicadas.length > 10 ? '...' : ''}`)
          setMostrarModalColaboradores(false)
          return
        }
      }
    } catch { /* Si falla la validación, continuar */ }

    setGenerandoPDF(true)

    try {
      const regional = REGIONALES.find(r => r.codigo === servicioSeleccionado)
      const nombreRegional = regional ? regional.nombre : servicioSeleccionado
      const fechaStr = new Date().toLocaleDateString('es-CO')

      const payload = {
        nombre: `Inventario Regional ${nombreRegional} - ${fechaStr}`,
        sede,
        ubicacion,
        servicio: servicioSeleccionado,
        total_servicio: bienesRegional.filter(b => !bienesExcluidos.has(b.placa)).length,
        colaborador1: { nombre: colaborador1.nombre, cedula: colaborador1.cedula, cargo: colaborador1.cargo },
        colaborador2: { nombre: colaborador2.nombre, cedula: colaborador2.cedula, cargo: colaborador2.cargo },
        bienes: bienesInventariados.map(b => ({
          placa: b.placa,
          descripcion: b.descripcion,
          serial: b.serial,
          estado: b.estado,
          cedula_responsable: b.cedula_responsable,
          nombre_responsable: b.nombre_responsable,
          servicio: b.servicio,
          ubicacion: b.ubicacion,
          observacion: (() => {
            const notaRegistro = registrosObsNotasRegional.find(r => r.placa === b.placa && r.tipo === 'nota')
            if (notaRegistro) return notaRegistro.texto
            if ((b as any).nota_excel) return (b as any).nota_excel
            return (b as any).observacion || ''
          })(),
          custodio_nombre: b.custodio_nombre || '',
          custodio_cedula: b.custodio_cedula || '',
        })),
      }

      await guardarInventario(payload)

      // Registrar bienes en estado M para baja
      const obsMapReg: Record<string, string> = {}
      for (const bien of bienesInventariados.filter(b => b.estado === 'M')) {
        const nota = registrosObsNotasRegional.find(r => r.placa === bien.placa && r.tipo === 'nota')
        if (nota) obsMapReg[bien.placa] = nota.texto
      }
      await registrarBienesMalEstado(bienesInventariados, obsMapReg, { nombre: colaborador1.nombre, cedula: colaborador1.cedula })

      // Limpiar bienes y registros
      limpiarInventarioHook()
      actualizarRegistrosObsNotasRegional([])
      persistirExcluidos(new Set())
      setMostrarModalColaboradores(false)

      // Actualizar contadores: recargar placas ya reportadas
      try {
        const todasLasPlacas = bienesRegional.map((b: any) => b.placa)
        const yaReportadas = await verificarPlacasYaInventariadas(todasLasPlacas)
        setPlacasYaReportadas(new Set(yaReportadas))
      } catch { /* silenciar */ }

      toast.success(`Inventario guardado correctamente. ${bienesInventariados.length} bienes registrados en ${servicioSeleccionado}. Genere el PDF desde la pestaña Reportes.`)
    } catch (error: any) {
      console.error('Error guardando inventario:', error)
      toast.error(error.message || 'Error guardando inventario')
    } finally {
      setGenerandoPDF(false)
    }
  }

  const descargarPdfPreview = async () => {
    if (pdfPreview) {
      // Convertir dataURL a Blob sin usar fetch (evitar CSP connect-src)
      const parts = pdfPreview.pdfDataUrl.split(',')
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf'
      const bstr = atob(parts[1])
      const n = bstr.length
      const u8arr = new Uint8Array(n)
      for (let i = 0; i < n; i++) {
        u8arr[i] = bstr.charCodeAt(i)
      }
      const blob = new Blob([u8arr], { type: mime })
      descargarPDF(blob, pdfPreview.nombreArchivo)
      
      // Registrar inventario en el backend al descargar
      if (inventarioPendienteRegistro) {
        try {
          const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
          await fetch(`${API_URL}/almacen/admin/registrar-inventario/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...inventarioPendienteRegistro,
              creado_por_cedula: getAuthUserCedula(),
              creado_por_nombre: getAuthUserFullName(),
            })
          })

          // Registrar bienes en estado M para baja
          const obsMapReg: Record<string, string> = {}
          for (const bien of bienesInventariados.filter(b => b.estado === 'M')) {
            const nota = registrosObsNotasRegional.find(r => r.placa === bien.placa && r.tipo === 'nota')
            if (nota) obsMapReg[bien.placa] = nota.texto
          }
          const col1Reg = inventarioPendienteRegistro?.colaborador1
          await registrarBienesMalEstado(bienesInventariados, obsMapReg, col1Reg ? { nombre: col1Reg.nombre, cedula: col1Reg.cedula } : undefined)

          setInventarioPendienteRegistro(null)
          limpiarInventarioHook()
          // Actualizar contadores: recargar placas ya reportadas
          try {
            const todasLasPlacas = bienesRegional.map((b: any) => b.placa)
            const yaReportadas = await verificarPlacasYaInventariadas(todasLasPlacas)
            setPlacasYaReportadas(new Set(yaReportadas))
          } catch { /* silenciar */ }
          toast.success('Inventario registrado y PDF descargado')
        } catch {
          toast.warning('PDF descargado pero hubo error registrando')
        }
      } else {
        toast.success('PDF descargado')
      }
      setPdfPreview(null)
    }
  }

  const cerrarPdfPreview = () => {
    setPdfPreview(null)
  }

  return (
    <div className="transferencia-page__bloque-tab">
      <div className="inventario-fisico">
        <div className="inventario-fisico__header" style={{ display: 'none' }}>
          <h4 className="inventario-fisico__titulo">Inventario Físico - Regionales</h4>
          <p className="inventario-fisico__descripcion">
            Seleccione el servicio (regional) y opcionalmente una ubicación para cargar los bienes asignados.
          </p>
        </div>

        <div className="floresta-busqueda" style={{ marginBottom: '1.5rem' }}>
          <fieldset className="floresta-busqueda__fieldset">
            <legend className="floresta-busqueda__legend">
              Filtros de búsqueda
              <span className="fb-tip" tabIndex={0} aria-label="Ayuda sobre los filtros">
                <FaCircleInfo className="floresta-busqueda__info-icon" />
                <span className="fb-tip__pop" role="tooltip">
                  <span className="fb-tip__head">
                    <FaCircleInfo className="fb-tip__head-icon" />
                    Define qué bienes vas a inventariar
                  </span>
                  <span className="fb-tip__item">
                    <span className="fb-tip__row">
                      <span className="fb-tip__name">Servicio (Regional)</span>
                      <span className="fb-tip__badge fb-tip__badge--req">Obligatorio</span>
                    </span>
                    <span className="fb-tip__desc">Es el conjunto base de bienes a inventariar.</span>
                  </span>
                  <span className="fb-tip__item">
                    <span className="fb-tip__row">
                      <span className="fb-tip__name">Ubicación</span>
                      <span className="fb-tip__badge">Opcional</span>
                    </span>
                    <span className="fb-tip__desc">Suma los bienes de esa ubicación al servicio, sin duplicados.</span>
                  </span>
                  <span className="fb-tip__item">
                    <span className="fb-tip__row">
                      <span className="fb-tip__name">Coordinador</span>
                      <span className="fb-tip__badge">Opcional</span>
                    </span>
                    <span className="fb-tip__desc">Limita a los bienes a cargo de esa persona.</span>
                  </span>
                  <span className="fb-tip__foot">Ajusta los filtros y presiona “Cargar bienes”.</span>
                </span>
              </span>
            </legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'start' }}>
              <FloatingField label="Servicio (Regional)" required tieneValor={!!servicioSeleccionado}>
                <SelectorRegional
                  regionales={REGIONALES}
                  valor={servicioSeleccionado}
                  onChange={(codigo) => {
                    setServicioSeleccionado(codigo)
                    // Resetear filtros al cambiar servicio (evitar combinaciones inválidas)
                    setUbicacionSeleccionada(null)
                    setUbicacionBusqueda('')
                    setCedulaCoordinador('')
                    setCoordinadorConfirmado(false)
                    // Al seleccionar regional, saltar al campo de ubicación
                    setTimeout(() => {
                      const ubic = document.querySelector('[data-selector="ubicacion"] > div') as HTMLElement
                      ubic?.click()
                    }, 200)
                  }}
                  placeholder="Buscar regional..."
                />
                <span className="floresta-busqueda__campo-hint">Obligatorio · conjunto base de bienes a inventariar</span>
              </FloatingField>
              <FloatingField label="Ubicación (opcional)" tieneValor={!!ubicacionSeleccionada}>
                <SelectorUbicacion
                  ubicaciones={ubicacionesParaServicio}
                  valor={ubicacionSeleccionada}
                  onChange={(u) => {
                    setUbicacionSeleccionada(u as any)
                    setUbicacionBusqueda(u ? u.label : '')
                    // Al seleccionar ubicación, saltar al campo de coordinador
                    if (u) {
                      setTimeout(() => {
                        const coord = document.querySelector('[data-selector="coordinador"] > div') as HTMLElement
                        coord?.click()
                      }, 200)
                    }
                  }}
                  placeholder="Buscar ubicación..."
                  cargando={cargandoUbicaciones}
                />
                <span className="floresta-busqueda__campo-hint">Suma los bienes de esa ubicación, sin duplicados</span>
              </FloatingField>
              <FloatingField label="Coordinador (opcional)" tieneValor={!!cedulaCoordinador}>
                <SelectorCoordinador
                  valor={cedulaCoordinador}
                  onChange={(cedula) => {
                    setCedulaCoordinador(cedula)
                    // Si se limpia el valor, resetear confirmado
                    if (!cedula) setCoordinadorConfirmado(false)
                  }}
                  onSeleccionar={() => setCoordinadorConfirmado(true)}
                  placeholder="Buscar por cédula o nombre..."
                />
                <span className="floresta-busqueda__campo-hint">Limita a los bienes a cargo de esa persona</span>
              </FloatingField>
              <button
                className="floresta-busqueda__btn"
                onClick={() => cargarBienesRegional()}
                disabled={cargando || !servicioSeleccionado}
                style={{ whiteSpace: 'nowrap' }}
              >
                {cargando ? 'Cargando...' : 'Cargar Bienes'}
              </button>
            </div>
          </fieldset>
        </div>

        {cargando && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', textAlign: 'center' }}>
            <Animacion type="colibri" width={280} />
            <p style={{ fontSize: '1rem', color: '#64748b', marginTop: '1rem' }}>Cargando bienes del servicio...</p>
          </div>
        )}

        {/* Contadores regionales — portal al panel derecho */}
        {(cargando || bienesRegional.length > 0) && (() => {
          const portalTarget = document.getElementById('gi-panel-contadores')
          if (!portalTarget) return null
          return createPortal(
            <PanelContadoresRegional
              cargando={cargando}
              onExportarBienes={() => setModalExcelInventariarAbierto(true)}
              totalBienes={totalBienes}
              totalInventariados={totalInventariados}
              totalFaltantes={totalFaltantes}
              totalSobrantes={totalSobrantes}
              totalAlertas={totalAlertas}
              obsActivas={obtenerObservacionesPendientes(registrosObsNotasRegional).length}
              bienesEstadoM={bienesInventariados.filter(b => b.estado === 'M').length}
              bienesRegional={bienesRegional}
              bienesExcluidos={bienesExcluidos}
              bienesInventariados={bienesInventariados}
              placasYaReportadas={placasYaReportadas}
              onExcluirBien={(placa) => {
                const nuevos = new Set(bienesExcluidos)
                nuevos.add(placa)
                persistirExcluidos(nuevos)
              }}
              onIncluirBien={(placa) => {
                const nuevos = new Set(bienesExcluidos)
                nuevos.delete(placa)
                persistirExcluidos(nuevos)
              }}
              onExcluirTodos={(placas) => {
                const nuevos = new Set(bienesExcluidos)
                placas.forEach(p => nuevos.add(p))
                persistirExcluidos(nuevos)
              }}
              onIncluirTodos={() => persistirExcluidos(new Set())}
              bienesInventariadosRegional={bienesInventariadosRegionalModal}
              cargandoInventariados={cargandoInventariadosRegional}
              onClickInventariados={async () => {
                setCargandoInventariadosRegional(true)
                try {
                  const bienesDesdeSession = bienesInventariados.map(b => {
                    const esSobrante = !bienesRegional.some((br: any) => br.placa === b.placa) || bienesExcluidos.has(b.placa)
                    const servicioReal = esSobrante
                      ? (b.servicio && b.servicio !== servicioSeleccionado ? b.servicio : 'OTRO SERVICIO')
                      : servicioSeleccionado
                    const nombreServicioReal = esSobrante
                      ? (b.servicio || 'Otro servicio')
                      : (servicioSeleccionado || '')
                    return {
                      placa: b.placa,
                      descripcion: b.descripcion || '',
                      responsable: b.custodio_nombre || b.nombre_responsable || '',
                      cedula: b.custodio_cedula || b.cedula_responsable || '',
                      servicio_codigo: servicioReal,
                      servicio_nombre: esSobrante ? nombreServicioReal : (servicioSeleccionado || ''),
                      es_sobrante: esSobrante,
                    }
                  })
                  const placasSesion = new Set(bienesDesdeSession.map(b => b.placa))
                  const bienesDeReportes = placasYaReportadas.size > 0
                    ? bienesRegional
                        .filter((b: any) => placasYaReportadas.has(b.placa) && !placasSesion.has(b.placa))
                        .map((b: any) => ({
                          placa: b.placa,
                          descripcion: b.descripcion || '',
                          responsable: b.responsable || '',
                          cedula: b.cedula || '',
                          servicio_codigo: servicioSeleccionado || '',
                          servicio_nombre: b.dependencia || '',
                          es_sobrante: false,
                        }))
                    : []
                  setBienesInventariadosRegionalModal([...bienesDesdeSession, ...bienesDeReportes])
                } catch {
                  setBienesInventariadosRegionalModal(bienesInventariados.map(b => ({
                    placa: b.placa,
                    descripcion: b.descripcion || '',
                    responsable: b.nombre_responsable || '',
                    cedula: b.cedula_responsable || '',
                    servicio_codigo: servicioSeleccionado || '',
                    servicio_nombre: b.servicio || '',
                  })))
                }
                setCargandoInventariadosRegional(false)
              }}
              servicioSeleccionado={servicioSeleccionado}
              registrosObsNotas={registrosObsNotasRegional}
              onIrABien={(placa) => {
                const row = document.querySelector(`tr[data-placa="${placa}"]`)
                if (row) {
                  row.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  row.classList.add('inventario-ultimo-bien')
                  setTimeout(() => row.classList.remove('inventario-ultimo-bien'), 3000)
                }
              }}
            />,
            portalTarget
          )
        })()}

        {!cargando && bienesRegional.length > 0 && (
          <>

            <div className="inventario-fisico__scanner">
              <EscanerCodigoBarras
                ref={inputRef}
                valor={codigoBarras}
                onChange={setCodigoBarras}
                onProcesar={procesarCodigoBarras}
                procesando={procesando}
                deshabilitado={!!alertaDuplicado}
                id="codigo-barras-regional"
                onSinPlaca={() => setMostrarModalBienSinPlaca(true)}
                onCargaMasiva={() => setMostrarModalCargaMasiva(true)}
              />
            </div>


            {bienesInventariados.length > 0 && (
              <>
                <TablaBienes
                  bienes={bienesInventariados}
                  filtro={filtroModalBienes}
                  onFiltroChange={setFiltroModalBienes}
                  ultimoBienAgregadoIndex={ultimoBienAgregadoIndex}
                  registrosObsNotas={registrosObsNotasRegional}
                  onEditarSerial={(i, serial) => setMostrarModalSerial({ index: i, serial })}
                  onEditarEstado={(i, estado) => {
                    // Pasar a M (para baja) pide confirmación antes de aplicar.
                    if (estado === 'M') {
                      setConfirmarEstadoM({ index: i, placa: bienesInventariados[i].placa })
                      return
                    }
                    editarEstado(i, estado as import('../services/inventarioFisicoService').EstadoBien)
                    // Al salir de M, el motivo de la baja ya no aplica: borrar la nota.
                    const placa = bienesInventariados[i]?.placa
                    if (placa) {
                      actualizarRegistrosObsNotasRegional(registrosObsNotasRegional.filter(r => !(r.placa === placa && r.tipo === 'nota')))
                    }
                  }}
                  onEditarUbicacion={(placa, ubicacion) => setUbicacionEditando({ placa, texto: ubicacion })}
                  onAbrirObservacion={(placa, texto) => { setTabInicialObsRegional('observaciones'); setObservacionEditando({ placa, texto }) }}
                  onAbrirCustodio={(i) => setMostrarModalCustodio({ index: i })}
                  onEliminar={(i, placa) => abrirModalEliminar(i, placa)}
                  onVerHistorial={(placa, descripcion, serial) => setHistorialPlaca({ placa, descripcion, serial })}
                  onEstadoM={(placa) => { setTabInicialObsRegional('notas'); setObservacionEditando({ placa, texto: '' }) }}
                  maxHeight="none"
                  permitirSinPlaca={false}
                  rowIdPrefix="bien-regional-row"
                  serialColWidth="10%"
                  servicioColWidth="12%"
                  accionesColWidth="10%"
                />
                <BotonesInventario
                  cantidadBienes={bienesInventariados.length}
                  hayObservacionesBloqueantes={tieneObservacionesBloqueantes(registrosObsNotasRegional)}
                  onGuardar={() => {
                    if (tieneObservacionesBloqueantes(registrosObsNotasRegional)) {
                      const pendientes = obtenerObservacionesPendientes(registrosObsNotasRegional)
                      toast.critical(`No se puede generar el formato. Hay ${pendientes.length} observacion(es) pendiente(s). Resolvalas antes de continuar.`)
                      return
                    }
                    setMostrarModalColaboradores(true)
                  }}
                  onExcelProvisional={() => {
                    if (bienesInventariados.length === 0) return
                    setModalExcelProvisionalRegional(true)
                  }}
                  onLimpiar={() => setMostrarModalLimpiar(true)}
                />
              </>
            )}
          </>
        )}

        {mostrarModalObservacion && observacionEditando && (() => {
          const bienObs = bienesInventariados.find(b => b.placa === observacionEditando.placa)
          return (
          <ModalObservacionesNotas
            isOpen={true}
            onClose={() => { setMostrarModalObservacion(false); setObservacionEditando(null); setTabInicialObsRegional('observaciones') }}
            placa={observacionEditando.placa}
            descripcionBien={bienObs?.descripcion ?? ''}
            // Servicio como CÓDIGO de la regional activa (servicioSeleccionado),
            // no el nombre de dependencia del bien, para que el filtro del modal
            // compare código-contra-código.
            servicio={servicioSeleccionado || ''}
            ubicacion={bienObs?.ubicacion}
            responsableNombre={bienObs?.nombre_responsable}
            responsableCedula={bienObs?.cedula_responsable}
            registros={registrosObsNotasRegional}
            onRegistrosChange={actualizarRegistrosObsNotasRegional}
            onSuccess={(msg) => toast.success(msg)}
            onWarning={(msg) => toast.warning(msg)}
            tabInicial={tabInicialObsRegional}
            notaObligatoria={bienObs?.estado === 'M'}
          />
          )
        })()}

        {mostrarModalUbicacion && ubicacionEditando && (() => {
          const bienUbic = bienesInventariados.find(b => b.placa === ubicacionEditando.placa)
          const idxUbic = bienesInventariados.findIndex(b => b.placa === ubicacionEditando.placa)
          return (
          <ModalUbicacion
            isOpen={true}
            placa={ubicacionEditando.placa}
            descripcion={bienUbic?.descripcion ?? ''}
            ubicacionActual={bienUbic?.ubicacion ?? ''}
            ubicacionesTNS={(window as any).__ubicacionesTNS || []}
            onGuardar={(nuevaUbicacion) => { if (idxUbic >= 0) editarUbicacion(idxUbic, nuevaUbicacion) }}
            onGuardarTNS={() => {}}
            onClose={() => { setMostrarModalUbicacion(false); setUbicacionEditando(null) }}
            onSuccess={(msg) => toast.success(msg)}
            onWarning={(msg) => toast.warning(msg)}
          />
          )
        })()}

        <ModalConfirmarAccion
          isOpen={mostrarModalLimpiar}
          titulo="Limpiar Registros"
          mensaje="¿Está seguro de limpiar todos los registros?"
          destacado={`${bienesInventariados.length} ${bienesInventariados.length === 1 ? 'registro' : 'registros'}`}
          advertencia="Esta acción eliminará todos los bienes escaneados. No se puede deshacer."
          textoConfirmar="Sí, limpiar"
          color="#e65100"
          onConfirmar={limpiarInventario}
          onCancelar={() => setMostrarModalLimpiar(false)}
        />

        {/* Modal de confirmación para marcar un bien como MALO (para baja) */}
        <ModalConfirmarAccion
          isOpen={confirmarEstadoM !== null}
          titulo="Marcar bien para baja"
          mensaje="¿Está seguro de marcar este bien en estado MALO (M)?"
          destacado={confirmarEstadoM?.placa}
          advertencia="El bien quedará marcado para baja y deberá registrar el motivo de la baja (obligatorio)."
          textoConfirmar="Sí, marcar para baja"
          color="#dc2626"
          onConfirmar={() => {
            if (confirmarEstadoM) {
              editarEstado(confirmarEstadoM.index, 'M')
              setTabInicialObsRegional('notas')
              setObservacionEditando({ placa: confirmarEstadoM.placa, texto: '' })
              setConfirmarEstadoM(null)
            }
          }}
          onCancelar={() => setConfirmarEstadoM(null)}
        />

        {/* Modal de eliminar bien */}
        <ModalConfirmarAccion
          isOpen={!!mostrarModalEliminar}
          titulo="Eliminar Bien"
          mensaje="¿Está seguro de eliminar este bien?"
          destacado={mostrarModalEliminar?.placa ?? ''}
          advertencia="Esta acción no se puede deshacer."
          textoConfirmar="Sí, eliminar"
          color="#dc3545"
          onConfirmar={() => { if (mostrarModalEliminar) { eliminarBien(mostrarModalEliminar.index); setMostrarModalEliminar(null) } }}
          onCancelar={() => setMostrarModalEliminar(null)}
        />

        {/* Modal para nombrar el Excel de bienes a inventariar */}
        <ModalNombreExcel
          isOpen={modalExcelInventariarAbierto}
          nombrePorDefecto={nombreExcelInventariarPorDefecto()}
          onCancelar={() => setModalExcelInventariarAbierto(false)}
          onConfirmar={(nombre) => { exportarBienesAInventariar(nombre); setModalExcelInventariarAbierto(false) }}
        />

        {/* Modal para nombrar el Excel provisional (toma regional) */}
        <ModalNombreExcel
          isOpen={modalExcelProvisionalRegional}
          nombrePorDefecto={nombreExcelProvisionalRegionalPorDefecto()}
          onCancelar={() => setModalExcelProvisionalRegional(false)}
          onConfirmar={(nombre) => { exportarExcelProvisional(nombre); setModalExcelProvisionalRegional(false) }}
        />

        {/* Modal de custodio (componente compartido) */}
        {mostrarModalCustodio && (
          <ModalCustodio
            isOpen={true}
            placa={bienesInventariados[mostrarModalCustodio.index]?.placa ?? ''}
            descripcion={bienesInventariados[mostrarModalCustodio.index]?.descripcion ?? ''}
            responsable={bienesInventariados[mostrarModalCustodio.index]?.nombre_responsable ?? ''}
            custodioActual={bienesInventariados[mostrarModalCustodio.index]?.custodio_nombre ? { nombre: bienesInventariados[mostrarModalCustodio.index].custodio_nombre!, cedula: bienesInventariados[mostrarModalCustodio.index].custodio_cedula! } : null}
            onAsignar={(nombre, cedula) => {
              const idx = mostrarModalCustodio.index
              const nuevaLista = [...bienesInventariados]
              nuevaLista[idx] = { ...nuevaLista[idx], custodio_nombre: nombre, custodio_cedula: cedula }
              actualizarBienes(nuevaLista)
            }}
            onQuitar={() => {
              const idx = mostrarModalCustodio.index
              const nuevaLista = [...bienesInventariados]
              nuevaLista[idx] = { ...nuevaLista[idx], custodio_nombre: undefined, custodio_cedula: undefined }
              actualizarBienes(nuevaLista)
            }}
            onClose={() => { setMostrarModalCustodio(null) }}
            onSuccess={(msg) => toast.success(msg)}
            onWarning={(msg) => toast.warning(msg)}
            onError={(msg) => toast.error(msg)}
          />
        )}

        {/* Modal alerta de placa duplicada */}
        {alertaDuplicado && (
          <ModalPlacaDuplicada
            mensaje={alertaDuplicado}
            onCerrar={() => { setAlertaDuplicado(null); setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100) }}
          />
        )}

        {/* Modal de editar serial */}
        <ModalEditarSerial
          isOpen={!!mostrarModalSerial}
          placa={mostrarModalSerial ? bienesInventariados[mostrarModalSerial.index]?.placa ?? '' : ''}
          descripcion={mostrarModalSerial ? bienesInventariados[mostrarModalSerial.index]?.descripcion ?? '' : ''}
          serialActual={mostrarModalSerial?.serial ?? ''}
          onGuardar={(nuevoSerial) => { if (mostrarModalSerial) { editarSerial(mostrarModalSerial.index, nuevoSerial); toast.success('Serial actualizado') } }}
          onClose={() => setMostrarModalSerial(null)}
        />

        {/* Modal de carga masiva de placas */}
        <ModalCargaMasiva
          isOpen={mostrarModalCargaMasiva}
          onClose={() => setMostrarModalCargaMasiva(false)}
          bienesYaEscaneados={bienesInventariados}
          placasDelServicio={new Set(bienesRegional.map((b: any) => (b.placa || '').toUpperCase()))}
          onBienesAgregados={(nuevos) => {
            // Preparar: aplicar el usuario/custodio y el estado que vinieron en el
            // Excel (igual que el modo principal). Si el Excel definió usuario,
            // ese manda; si no, se conserva el responsable del propio bien.
            const nuevosPreparados = nuevos.map(b => {
              const desdeExcel = !!(b as any).custodio_desde_excel
              const prep: any = {
                ...b,
                custodio_nombre: desdeExcel ? ((b as any).custodio_nombre || '') : ((b as any).custodio_nombre || b.nombre_responsable || ''),
                custodio_cedula: desdeExcel ? ((b as any).custodio_cedula || '') : ((b as any).custodio_cedula || b.cedula_responsable || ''),
              }
              // Estado del Excel: si viene 'M' se marca para baja (punto estado masivo).
              if ((b as any).estado_excel === 'M') prep.estado = 'M'
              return prep
            })
            // Los nuevos van al FINAL de la tabla (como un Excel: el último abajo).
            const listaCombinada = [...bienesInventariados, ...nuevosPreparados]
            actualizarBienes(listaCombinada)
            // Mover el indicador "último bien agregado" al último de la carga
            // masiva (antes se quedaba pegado en el último escaneado manual).
            if (nuevosPreparados.length > 0) {
              setUltimoBienAgregadoIndex(listaCombinada.length - 1)
            }
            // Registrar notas del Excel en el sistema de registros.
            // El 4º argumento (servicio) se escribe como CÓDIGO de la regional
            // activa (servicioSeleccionado), NO como nombre de dependencia
            // (b.servicio), para que el filtrado sea código-contra-código.
            const nuevasNotas = nuevosPreparados
              .filter((b: any) => b.nota_excel)
              .map((b: any) => crearNota(b.placa, b.descripcion || '', b.nota_excel, servicioSeleccionado || '', b.ubicacion))
            if (nuevasNotas.length > 0) {
              actualizarRegistrosObsNotasRegional([...registrosObsNotasRegional, ...nuevasNotas])
            }
          }}
          onSuccess={(msg) => toast.success(msg)}
          onWarning={(msg) => toast.warning(msg)}
          onError={(msg) => toast.error(msg)}
        />

        {/* Modal para agregar bien sin placa */}
        {mostrarModalBienSinPlaca && (
          <ModalBienSinPlaca
            isOpen={true}
            servicio={servicioSeleccionado}
            ubicacionesTNS={ubicacionesDisponibles}
            onAgregar={agregarBienSinPlaca}
            onClose={() => { setMostrarModalBienSinPlaca(false); setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100) }}
          />
        )}

        {/* Modal de historial del bien */}
        <ModalHistorialBien
          isOpen={!!historialPlaca}
          placa={historialPlaca?.placa ?? ''}
          descripcion={historialPlaca?.descripcion}
          serial={historialPlaca?.serial}
          onClose={() => setHistorialPlaca(null)}
        />

        {mostrarModalTotalBienes && (
          <div className="inventario-fisico__modal-overlay" tabIndex={-1}>
            <div className="inventario-fisico__modal" style={{ maxWidth: '1000px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
              <div className="inventario-fisico__modal-header">
                <h5>Bienes — {servicioSeleccionado}</h5>
                <button className="inventario-fisico__modal-close" onClick={() => setMostrarModalTotalBienes(false)}>×</button>
              </div>

              {/* Tabs dentro del modal */}
              <div style={{ display: 'flex', borderBottom: '2px solid #dee2e6', padding: '0 1rem' }}>
                <button
                  onClick={() => setTabModal('servicio')}
                  style={{
                    padding: '0.6rem 1.2rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: tabModal === 'servicio' ? '3px solid #303d50' : '3px solid transparent',
                    fontWeight: tabModal === 'servicio' ? 700 : 400,
                    color: tabModal === 'servicio' ? '#303d50' : '#5c6474',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  Bienes a inventariar ({bienesRegional.length - bienesExcluidos.size})
                </button>
                <button
                  onClick={() => setTabModal('excluidos')}
                  style={{
                    padding: '0.6rem 1.2rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: tabModal === 'excluidos' ? '3px solid #dc3545' : '3px solid transparent',
                    fontWeight: tabModal === 'excluidos' ? 700 : 400,
                    color: tabModal === 'excluidos' ? '#dc3545' : '#5c6474',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  Excluidos ({bienesExcluidos.size})
                </button>
                {bienesCoordinadorLista.length > 0 && (
                  <button
                    onClick={() => setTabModal('coordinador')}
                    style={{
                      padding: '0.6rem 1.2rem',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: tabModal === 'coordinador' ? '3px solid #e65100' : '3px solid transparent',
                      fontWeight: tabModal === 'coordinador' ? 700 : 400,
                      color: tabModal === 'coordinador' ? '#e65100' : '#5c6474',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Bienes del servidor ({bienesCoordinadorLista.length})
                  </button>
                )}
                <button
                  onClick={() => setTabModal('ubicacion')}
                  style={{
                    padding: '0.6rem 1.2rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: tabModal === 'ubicacion' ? '3px solid #1565c0' : '3px solid transparent',
                    fontWeight: tabModal === 'ubicacion' ? 700 : 400,
                    color: tabModal === 'ubicacion' ? '#1565c0' : '#5c6474',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  Ubicación {ubicacionSeleccionada ? `(${bienesUbicacion.length})` : ''}
                </button>
              </div>

              <div className="inventario-fisico__modal-body" style={{ padding: '1rem', flex: 1, overflow: 'auto' }}>
                {tabModal === 'servicio' && (
                  <div>
                    {/* Barra de filtro */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={filtroModalBienes}
                        onChange={(e) => setFiltroModalBienes(e.target.value)}
                        placeholder="Filtrar por placa, descripción o responsable..."
                        style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.8rem' }}
                      />
                      <span style={{ fontSize: '0.75rem', color: '#6c757d', whiteSpace: 'nowrap' }}>
                        {bienesRegional.length - bienesExcluidos.size} bienes a inventariar
                      </span>
                    </div>
                    <div style={{ border: '1px solid #dee2e6', borderRadius: '6px', overflow: 'auto', maxHeight: '50vh' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                          <tr style={{ background: '#303d50', color: 'white' }}>
                            <th style={{ padding: '0.5rem 0.4rem', width: '4%', background: '#303d50' }}>
                              <input
                                type="checkbox"
                                checked={(() => {
                                  const noExcluidos = bienesRegional.filter(b => !bienesExcluidos.has(b.placa))
                                  const visibles = noExcluidos.filter(bien => {
                                    if (!filtroModalBienes.trim()) return true
                                    const t = filtroModalBienes.trim().toLowerCase()
                                    return (bien.placa || '').toLowerCase().includes(t) || 
                                           (bien.descripcion || '').toLowerCase().includes(t) || 
                                           (bien.responsable || '').toLowerCase().includes(t)
                                  })
                                  return visibles.length > 0
                                })()}
                                onChange={() => {
                                  // Excluir todos los visibles (moverlos a "Excluidos")
                                  const noExcluidos = bienesRegional.filter(b => !bienesExcluidos.has(b.placa))
                                  const visibles = noExcluidos.filter(bien => {
                                    if (!filtroModalBienes.trim()) return true
                                    const t = filtroModalBienes.trim().toLowerCase()
                                    return (bien.placa || '').toLowerCase().includes(t) || 
                                           (bien.descripcion || '').toLowerCase().includes(t) || 
                                           (bien.responsable || '').toLowerCase().includes(t)
                                  })
                                  const nuevos = new Set(bienesExcluidos)
                                  visibles.forEach(b => nuevos.add(b.placa))
                                  persistirExcluidos(nuevos)
                                }}
                                style={{ cursor: 'pointer' }}
                                title="Excluir todos los visibles"
                              />
                            </th>
                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#303d50' }}>Placa</th>
                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#303d50' }}>Descripción</th>
                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#303d50' }}>Responsable</th>
                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#303d50' }}>Cédula</th>
                            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#303d50' }}>Ubicación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bienesRegional
                            .filter(bien => !bienesExcluidos.has(bien.placa))
                            .filter(bien => {
                              if (!filtroModalBienes.trim()) return true
                              const t = filtroModalBienes.trim().toLowerCase()
                              return (bien.placa || '').toLowerCase().includes(t) || 
                                     (bien.descripcion || '').toLowerCase().includes(t) || 
                                     (bien.responsable || '').toLowerCase().includes(t)
                            })
                            .map((bien, idx) => {
                              const yaInventariado = bienesInventariados.some(b => b.placa === bien.placa)
                              const yaReportado = placasYaReportadas.has(bien.placa)
                              const esDelCoordinador = bienesCoordinador.has(bien.placa)
                              return (
                                <tr key={idx} style={{ 
                                  background: (yaInventariado || yaReportado) ? '#e8f5e9' : esDelCoordinador ? '#fff3e0' : idx % 2 === 0 ? '#fafafa' : 'white',
                                  borderLeft: (yaInventariado || yaReportado) ? '3px solid #2e7d32' : esDelCoordinador ? '3px solid #ff9800' : 'none'
                                }}>
                                  <td style={{ padding: '0.35rem 0.4rem', textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={true}
                                      onChange={() => {
                                        const nuevos = new Set(bienesExcluidos)
                                        nuevos.add(bien.placa)
                                        persistirExcluidos(nuevos)
                                      }}
                                      style={{ cursor: 'pointer' }}
                                      title="Desmarcar para excluir del inventario"
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600 }}>
                                    {(yaInventariado || yaReportado) && <span style={{ color: '#2e7d32', marginRight: '0.3rem', fontWeight: 700 }}>✓</span>}
                                    {bien.placa}
                                  </td>
                                  <td style={{ padding: '0.35rem 0.6rem' }}>{bien.descripcion || '-'}</td>
                                  <td style={{ padding: '0.35rem 0.6rem' }}>{bien.responsable || '-'}</td>
                                  <td style={{ padding: '0.35rem 0.6rem' }}>{bien.cedula || '-'}</td>
                                  <td style={{ padding: '0.35rem 0.6rem' }}>{bien.dependencia || bien.ubicacion || '-'}</td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {tabModal === 'excluidos' && (
                  <div>
                    {/* Barra de filtro y acciones para excluidos */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={filtroModalBienes}
                        onChange={(e) => setFiltroModalBienes(e.target.value)}
                        placeholder="Filtrar excluidos por placa, descripción o responsable..."
                        style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.8rem' }}
                      />
                      <button
                        onClick={() => persistirExcluidos(new Set())}
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        title="Incluir todos de vuelta al inventario"
                      >
                        Incluir todos
                      </button>
                      <span style={{ fontSize: '0.75rem', color: '#dc3545', whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {bienesExcluidos.size} excluidos
                      </span>
                    </div>
                    {bienesExcluidos.size === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>
                        <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No hay bienes excluidos</p>
                        <p style={{ fontSize: '0.8rem' }}>Todos los bienes están incluidos en el inventario</p>
                      </div>
                    ) : (
                      <div style={{ border: '1px solid #f5c6cb', borderRadius: '6px', overflow: 'auto', maxHeight: '50vh' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead style={{ position: 'sticky', top: 0, zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                            <tr style={{ background: '#dc3545', color: 'white' }}>
                              <th style={{ padding: '0.5rem 0.4rem', width: '4%', background: '#dc3545' }}>
                                <input
                                  type="checkbox"
                                  checked={false}
                                  onChange={() => {
                                    // Re-incluir todos los visibles
                                    const excluidos = bienesRegional.filter(b => bienesExcluidos.has(b.placa))
                                    const visibles = excluidos.filter(bien => {
                                      if (!filtroModalBienes.trim()) return true
                                      const t = filtroModalBienes.trim().toLowerCase()
                                      return (bien.placa || '').toLowerCase().includes(t) || 
                                             (bien.descripcion || '').toLowerCase().includes(t) || 
                                             (bien.responsable || '').toLowerCase().includes(t)
                                    })
                                    const nuevos = new Set(bienesExcluidos)
                                    visibles.forEach(b => nuevos.delete(b.placa))
                                    persistirExcluidos(nuevos)
                                  }}
                                  style={{ cursor: 'pointer' }}
                                  title="Re-incluir todos los visibles"
                                />
                              </th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#dc3545' }}>Placa</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#dc3545' }}>Descripción</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#dc3545' }}>Responsable</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#dc3545' }}>Cédula</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#dc3545' }}>Ubicación</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', background: '#dc3545' }}>Motivo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bienesRegional
                              .filter(bien => bienesExcluidos.has(bien.placa))
                              .filter(bien => {
                                if (!filtroModalBienes.trim()) return true
                                const t = filtroModalBienes.trim().toLowerCase()
                                return (bien.placa || '').toLowerCase().includes(t) || 
                                       (bien.descripcion || '').toLowerCase().includes(t) || 
                                       (bien.responsable || '').toLowerCase().includes(t)
                              })
                              .map((bien, idx) => {
                                // Determinar motivo de exclusión
                                const grupoBien = (bien.grupo_bien || '').trim()
                                const grupoContable = (bien.grupo_contable || '').trim()
                                const dependencia = (bien.dependencia || '').toUpperCase()
                                const descripcion = (bien.descripcion || '').toUpperCase()
                                const patronesArm = ['PISTOLA', 'GLOCK', 'CHALECO', 'BLINDADO', 'BALISTIC', 'SUBAMET', 'MUNICION', 'CAL.', 'CAL ']
                                let motivo = 'Manual'
                                if (grupoContable.startsWith('201') || grupoBien.startsWith('201') || patronesArm.some(p => descripcion.includes(p))) {
                                  motivo = 'Grp 201 - Armamento'
                                } else if (grupoContable.startsWith('213') || grupoBien.startsWith('213')) {
                                  motivo = 'Grp 213 - Vehículos'
                                } else if (dependencia.includes('POBLACION') && dependencia.includes('ENFOQUE') && dependencia.includes('DIFERENCIAL')) {
                                  motivo = 'PED'
                                }
                                return (
                                  <tr key={idx} style={{ 
                                    background: idx % 2 === 0 ? '#fff5f5' : '#fff9f9',
                                    opacity: 0.85
                                  }}>
                                    <td style={{ padding: '0.35rem 0.4rem', textAlign: 'center' }}>
                                      <input
                                        type="checkbox"
                                        checked={false}
                                        onChange={() => {
                                          const nuevos = new Set(bienesExcluidos)
                                          nuevos.delete(bien.placa)
                                          persistirExcluidos(nuevos)
                                        }}
                                        style={{ cursor: 'pointer' }}
                                        title="Marcar para incluir de vuelta en el inventario"
                                      />
                                    </td>
                                    <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600, textDecoration: 'line-through', color: '#6c757d' }}>{bien.placa}</td>
                                    <td style={{ padding: '0.35rem 0.6rem', color: '#6c757d' }}>{bien.descripcion || '-'}</td>
                                    <td style={{ padding: '0.35rem 0.6rem', color: '#6c757d' }}>{bien.responsable || '-'}</td>
                                    <td style={{ padding: '0.35rem 0.6rem', color: '#6c757d' }}>{bien.cedula || '-'}</td>
                                    <td style={{ padding: '0.35rem 0.6rem', color: '#6c757d' }}>{bien.dependencia || bien.ubicacion || '-'}</td>
                                    <td style={{ padding: '0.35rem 0.6rem' }}>
                                      <span style={{ 
                                        fontSize: '0.7rem', 
                                        padding: '0.15rem 0.4rem', 
                                        borderRadius: '3px', 
                                        background: motivo === 'PED' ? '#fff3cd' : motivo.startsWith('Grupo') ? '#e3f2fd' : '#f0f0f0',
                                        color: motivo === 'PED' ? '#856404' : motivo.startsWith('Grupo') ? '#1565c0' : '#495057',
                                        fontWeight: 600
                                      }}>
                                        {motivo}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {tabModal === 'coordinador' && (
                  <div style={{ border: '1px solid #dee2e6', borderRadius: '6px', overflow: 'auto', maxHeight: '55vh' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#e65100', color: 'white' }}>
                        <tr>
                          <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Placa</th>
                          <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Descripción</th>
                          <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Ubicación</th>
                          <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Coincidente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Coincidentes primero */}
                        {(() => {
                          const coincidentes = bienesCoordinadorLista.filter((b: any) => bienesRegional.some(br => br.placa === b.placa))
                          const noCoincidentes = bienesCoordinadorLista.filter((b: any) => !bienesRegional.some(br => br.placa === b.placa))
                          return (
                            <>
                              {coincidentes.length > 0 && (
                                <tr>
                                  <td colSpan={4} style={{ padding: '0.5rem 0.6rem', background: '#fff3e0', fontWeight: 700, fontSize: '0.78rem', color: '#e65100', borderBottom: '2px solid #ffcc80' }}>
                                    ● Coincidentes con bienes a inventariar ({coincidentes.length})
                                  </td>
                                </tr>
                              )}
                              {coincidentes.map((bien: any, idx: number) => {
                                const yaInventariado = bienesInventariados.some(b => b.placa === bien.placa)
                                return (
                                  <tr key={`c-${idx}`} style={{ 
                                    background: yaInventariado ? '#e8f5e9' : idx % 2 === 0 ? '#fff8e1' : '#fffde7',
                                    borderLeft: yaInventariado ? '3px solid #2e7d32' : '3px solid #ff9800'
                                  }}>
                                    <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600 }}>
                                      {yaInventariado && <span style={{ color: '#2e7d32', marginRight: '0.3rem', fontWeight: 700 }}>✓</span>}
                                      {bien.placa}
                                    </td>
                                    <td style={{ padding: '0.35rem 0.6rem' }}>{bien.descripcion || '-'}</td>
                                    <td style={{ padding: '0.35rem 0.6rem' }}>{bien.nombre_dependencia || '-'}</td>
                                    <td style={{ padding: '0.35rem 0.6rem', fontWeight: 700, color: '#e65100' }}>✓ Sí</td>
                                  </tr>
                                )
                              })}
                              {noCoincidentes.length > 0 && (
                                <tr>
                                  <td colSpan={4} style={{ padding: '0.5rem 0.6rem', background: '#f5f5f5', fontWeight: 700, fontSize: '0.78rem', color: '#5c6474', borderBottom: '2px solid #dee2e6', borderTop: '2px solid #dee2e6' }}>
                                    ○ No coincidentes ({noCoincidentes.length})
                                  </td>
                                </tr>
                              )}
                              {noCoincidentes.map((bien: any, idx: number) => {
                                const yaInventariado = bienesInventariados.some(b => b.placa === bien.placa)
                                return (
                                  <tr key={`nc-${idx}`} style={{ 
                                    background: yaInventariado ? '#e8f5e9' : idx % 2 === 0 ? '#fafafa' : 'white',
                                    borderLeft: yaInventariado ? '3px solid #2e7d32' : 'none'
                                  }}>
                                    <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600 }}>
                                      {yaInventariado && <span style={{ color: '#2e7d32', marginRight: '0.3rem', fontWeight: 700 }}>✓</span>}
                                      {bien.placa}
                                    </td>
                                    <td style={{ padding: '0.35rem 0.6rem' }}>{bien.descripcion || '-'}</td>
                                    <td style={{ padding: '0.35rem 0.6rem' }}>{bien.nombre_dependencia || '-'}</td>
                                    <td style={{ padding: '0.35rem 0.6rem', color: '#999' }}>—</td>
                                  </tr>
                                )
                              })}
                            </>
                          )
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}

                {tabModal === 'ubicacion' && (
                  <div>
                    {/* Buscador de ubicación */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <input
                        type="text"
                        value={ubicacionBusqueda}
                        onChange={(e) => setUbicacionBusqueda(e.target.value)}
                        placeholder="Buscar ubicación (ej: MEDELLIN, BOGOTA, 1100125)..."
                        style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.85rem' }}
                        onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('btn-buscar-ubicacion-reg')?.click() }}
                      />
                      <button
                        id="btn-buscar-ubicacion-reg"
                        disabled={cargandoUbicaciones || ubicacionBusqueda.trim().length < 2}
                        onClick={async () => {
                          setCargandoUbicaciones(true)
                          try {
                            const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
                            const res = await fetch(`${API_URL}/almacen/ubicaciones-tns/?q=${encodeURIComponent(ubicacionBusqueda.trim())}`)
                            if (res.ok) {
                              const data = await res.json()
                              setUbicacionesDisponibles(data.ubicaciones ?? [])
                              if ((data.ubicaciones ?? []).length === 0) toast.warning('No se encontraron ubicaciones')
                            }
                          } catch { toast.error('Error buscando ubicaciones') }
                          setCargandoUbicaciones(false)
                        }}
                        style={{ padding: '0.5rem 1rem', background: cargandoUbicaciones || ubicacionBusqueda.trim().length < 2 ? '#adb5bd' : '#303d50', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600, cursor: cargandoUbicaciones || ubicacionBusqueda.trim().length < 2 ? 'not-allowed' : 'pointer' }}
                      >
                        {cargandoUbicaciones ? '...' : 'Buscar'}
                      </button>
                    </div>

                    {/* Resultados de ubicaciones */}
                    {ubicacionesDisponibles.length > 0 && !ubicacionSeleccionada && (
                      <div style={{ marginBottom: '0.75rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '4px' }}>
                        <div style={{ padding: '0.3rem 0.5rem', background: '#f1f3f5', fontSize: '0.75rem', color: '#6c757d', fontWeight: 600, borderBottom: '1px solid #dee2e6' }}>
                          {ubicacionesDisponibles.length} ubicación(es) — seleccione una
                        </div>
                        {ubicacionesDisponibles.map((u, i) => (
                          <button
                            key={i}
                            onClick={() => { setUbicacionSeleccionada(u); setUbicacionesDisponibles([]) }}
                            style={{ display: 'block', width: '100%', padding: '0.45rem 0.75rem', border: 'none', borderBottom: '1px solid #f0f0f0', background: 'white', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f8f9fa')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                          >
                            {u.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Ubicación seleccionada */}
                    {ubicacionSeleccionada && (
                      <div style={{ background: '#f1f3f5', padding: '0.5rem 0.75rem', borderRadius: '4px', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #dee2e6' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ubicacionSeleccionada.label}</span>
                        <button
                          onClick={() => { setUbicacionSeleccionada(null); setBienesUbicacion([]) }}
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', background: 'white', color: '#dc3545', border: '1px solid #dc3545', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Limpiar
                        </button>
                      </div>
                    )}

                    <p style={{ fontSize: '0.8rem', color: '#6c757d', margin: '0.5rem 0' }}>
                      Al seleccionar una ubicación y hacer clic en "Cargar bienes", se traerán los bienes del servicio + los de esta ubicación (deduplicados).
                    </p>

                    {/* Tabla de bienes por ubicación si ya se cargaron */}
                    {bienesUbicacion.length > 0 && (
                      <div style={{ border: '1px solid #dee2e6', borderRadius: '6px', overflow: 'auto', maxHeight: '40vh' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead style={{ position: 'sticky', top: 0, background: '#1565c0', color: 'white' }}>
                            <tr>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>#</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Placa</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Descripción</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Responsable</th>
                              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Coincidente</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const coincidentes = bienesUbicacion.filter((b: any) => bienesRegional.some(br => br.placa === b.placa))
                              const noCoincidentes = bienesUbicacion.filter((b: any) => !bienesRegional.some(br => br.placa === b.placa))
                              let contador = 0
                              return (
                                <>
                                  {coincidentes.length > 0 && (
                                    <tr>
                                      <td colSpan={5} style={{ padding: '0.5rem 0.6rem', background: '#e3f2fd', fontWeight: 700, fontSize: '0.78rem', color: '#1565c0', borderBottom: '2px solid #90caf9' }}>
                                        ● Coincidentes con bienes a inventariar ({coincidentes.length})
                                      </td>
                                    </tr>
                                  )}
                                  {coincidentes.map((b: any, idx: number) => {
                                    contador++
                                    const yaInventariado = bienesInventariados.some(bi => bi.placa === b.placa)
                                    return (
                                      <tr key={`c-${idx}`} style={{ 
                                        background: yaInventariado ? '#e8f5e9' : idx % 2 === 0 ? '#e3f2fd' : '#f0f7ff',
                                        borderLeft: yaInventariado ? '3px solid #2e7d32' : '3px solid #1565c0'
                                      }}>
                                        <td style={{ padding: '0.35rem 0.6rem', color: '#6c757d' }}>{contador}</td>
                                        <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600 }}>
                                          {yaInventariado && <span style={{ color: '#2e7d32', marginRight: '0.3rem', fontWeight: 700 }}>✓</span>}
                                          {b.placa}
                                        </td>
                                        <td style={{ padding: '0.35rem 0.6rem' }}>{b.descripcion || '--'}</td>
                                        <td style={{ padding: '0.35rem 0.6rem' }}>{b.responsable || '--'}</td>
                                        <td style={{ padding: '0.35rem 0.6rem', fontWeight: 700, color: '#1565c0' }}>✓ Sí</td>
                                      </tr>
                                    )
                                  })}
                                  {noCoincidentes.length > 0 && (
                                    <tr>
                                      <td colSpan={5} style={{ padding: '0.5rem 0.6rem', background: '#f5f5f5', fontWeight: 700, fontSize: '0.78rem', color: '#5c6474', borderBottom: '2px solid #dee2e6', borderTop: '2px solid #dee2e6' }}>
                                        ○ Solo en ubicación ({noCoincidentes.length})
                                      </td>
                                    </tr>
                                  )}
                                  {noCoincidentes.map((b: any, idx: number) => {
                                    contador++
                                    const yaInventariado = bienesInventariados.some(bi => bi.placa === b.placa)
                                    return (
                                      <tr key={`nc-${idx}`} style={{ 
                                        background: yaInventariado ? '#e8f5e9' : idx % 2 === 0 ? '#fafafa' : 'white',
                                        borderLeft: yaInventariado ? '3px solid #2e7d32' : 'none'
                                      }}>
                                        <td style={{ padding: '0.35rem 0.6rem', color: '#6c757d' }}>{contador}</td>
                                        <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600 }}>
                                          {yaInventariado && <span style={{ color: '#2e7d32', marginRight: '0.3rem', fontWeight: 700 }}>✓</span>}
                                          {b.placa}
                                        </td>
                                        <td style={{ padding: '0.35rem 0.6rem' }}>{b.descripcion || '--'}</td>
                                        <td style={{ padding: '0.35rem 0.6rem' }}>{b.responsable || '--'}</td>
                                        <td style={{ padding: '0.35rem 0.6rem', color: '#999' }}>—</td>
                                      </tr>
                                    )
                                  })}
                                </>
                              )
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="inventario-fisico__modal-footer" style={{ flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <p style={{ margin: 0, color: '#5c6474', fontSize: '0.85rem', textAlign: 'center' }}>
                  Total: {bienesRegional.length} | A inventariar: <strong>{bienesRegional.length - bienesExcluidos.size}</strong> | Excluidos: {bienesExcluidos.size} | Inventariados: {totalInventariados}{reportadosAnteriores > 0 ? ` (${reportadosAnteriores} previos)` : ''} | Faltantes: {totalFaltantes}
                  {bienesCoordinadorLista.length > 0 && ` | Servidor: ${bienesCoordinadorLista.length}`}
                </p>
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="floresta-busqueda__btn"
                    onClick={() => setModalExcelInventariarAbierto(true)}
                    disabled={bienesRegional.length - bienesExcluidos.size === 0}
                    style={{ background: '#1a7a3a' }}
                    title="Exportar a Excel los bienes a inventariar"
                  >
                    <FaFileExcel style={{ marginRight: '0.4rem' }} /> Exportar a Excel
                  </button>
                  <button className="floresta-busqueda__btn" onClick={() => setMostrarModalTotalBienes(false)}>Cerrar</button>
                </div>
              </div>
              {/* fin footer modal total bienes */}
            </div>
          </div>
        )}

        {/* Modal resumen de carga de bienes */}
        {resumenCarga && (
          <div className="inventario-fisico__modal-overlay">
            <div className="inventario-fisico__modal" style={{ maxWidth: '450px' }}>
              <div className="inventario-fisico__modal-header">
                <h5>Resumen de carga</h5>
              </div>
              <div className="inventario-fisico__modal-body" style={{ padding: '1.25rem' }}>
                <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>Bienes del servicio + ubicación</td>
                      <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 700, color: '#1565c0' }}>{bienesRegional.length}</td>
                    </tr>
                    {bienesExcluidos.size > 0 && (
                      <tr style={{ borderBottom: '1px solid #dee2e6' }}>
                        <td style={{ padding: '0.5rem 0', fontWeight: 600, color: '#6c757d' }}>Excluidos (armamento, vehículos, PED)</td>
                        <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 700, color: '#dc3545' }}>-{bienesExcluidos.size}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ padding: '0.75rem 0 0', fontWeight: 700, fontSize: '1rem' }}>Total a inventariar</td>
                      <td style={{ padding: '0.75rem 0 0', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem', color: '#2e7d32' }}>{totalBienes}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="inventario-fisico__modal-footer" style={{ justifyContent: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  className="floresta-busqueda__btn"
                  style={{ padding: '0.5rem 1.4rem', background: '#1a7a3a' }}
                  onClick={() => setModalExcelInventariarAbierto(true)}
                  disabled={totalBienes === 0}
                  title="Exportar a Excel los bienes a inventariar"
                >
                  <FaFileExcel style={{ marginRight: '0.4rem' }} /> Exportar a Excel
                </button>
                <button
                  className="floresta-busqueda__btn"
                  style={{ padding: '0.5rem 2rem' }}
                  onClick={() => setResumenCarga(null)}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de colaboradores para generar formato */}
        <ModalColaboradores
          isOpen={mostrarModalColaboradores}
          onClose={() => setMostrarModalColaboradores(false)}
          onGenerar={handleGenerarFormato}
          totalBienes={bienesInventariados.length}
          loading={generandoPDF}
          sedeBloqueada={true}
          etiquetaSede="Regional (sede)"
          sedeInicial={(() => {
            const r = REGIONALES.find(reg => reg.codigo === servicioSeleccionado)
            if (!r) return ''
            const cod = servicioSeleccionado.replace('3000-', '')
            if (cod.startsWith('ENL')) return `ENLACE ${r.nombre.toUpperCase()}`
            if (cod.startsWith('GURP')) return `GRUPO REGIONAL ${r.nombre.toUpperCase()}`
            return r.nombre.toUpperCase()
          })()}
          ubicacionInicial={(() => {
            const r = REGIONALES.find(reg => reg.codigo === servicioSeleccionado)
            if (!r) return ''
            return r.nombre.toUpperCase()
          })()}
        />

        {/* Modal de previsualización del PDF */}
        {pdfPreview && (
          <ModalPrevisualizarPdf
            pdfDataUrl={pdfPreview.pdfDataUrl}
            nombreArchivo={pdfPreview.nombreArchivo}
            modo="history"
            onDescargar={descargarPdfPreview}
            onCerrar={cerrarPdfPreview}
          />
        )}
      </div>
    </div>
  )
}

