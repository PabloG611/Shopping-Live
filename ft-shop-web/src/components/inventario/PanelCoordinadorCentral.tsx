import { useMemo, useState } from 'react'
import DetalleCoordinador from './DetalleCoordinador'
import ModalSeleccionServicio, { type ServicioSeleccionable } from './ModalSeleccionServicio'
import { useTransferencias } from '../../context/useTransferencias'
import { buscarBienesPorCoordinador, type BienCoordinador } from '../../services/coordinadorInventarioService'
import {
  cargarBienesDesdeStorage,
  guardarBienesEnStorage,
  consultarBienPorPlaca,
  type BienInventario,
} from '../../services/inventarioFisicoService'
import { getAuthUserFullName, getAuthUserCedula } from '../../utils/authState'
import { alertaInventario } from '../../services/alertasInventarioService'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

/**
 * Notifica por WS que una placa entró al inventario (mismo canal que el escaneo
 * normal: POST /almacen/admin/notificar-escaneo/). El backend reenvía el evento
 * `bien_escaneado`, que:
 *  - alimenta `placasYaInventariadas` en la toma principal → descuenta faltantes,
 *  - alimenta `placasPendientesInventario` del contexto → descuenta el coordinador
 *    en vivo, en este panel y en los de otros usuarios.
 * Fire-and-forget: si falla, el bien igual quedó guardado en storage.
 */
function notificarEscaneoInventario(placa: string, servicio: string): void {
  fetch(`${API_URL}/almacen/admin/notificar-escaneo/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      placa,
      usuario: getAuthUserFullName() || 'Usuario',
      servicio,
      cedula: getAuthUserCedula() || '',
    }),
  }).catch(() => {})
}

interface PanelCoordinadorCentralProps {
  toast: {
    success?: (msg: string) => void
    info?: (msg: string) => void
    warning: (msg: string) => void
    error: (msg: string) => void
    confirm?: (message: string, onAccept: () => void, options?: { label?: string }) => void
  }
  /** Navega a la pestaña "Toma de inventario principal". */
  onIrAInventarioPrincipal?: () => void
}

/** Construye un BienInventario a partir de los datos del coordinador (fallback). */
function bienDesdeCoordinador(b: BienCoordinador): BienInventario {
  return {
    placa: (b.placa || '').trim(),
    descripcion: b.descripcion || '',
    serial: b.serial || 'N/A',
    estado: 'B',
    cedula_responsable: (b.cedula_responsable as string) || (b.cedula as string) || '',
    nombre_responsable: b.responsable || '',
    servicio: b.servicio_nombre || b.servicio || '',
    ubicacion: '',
    timestamp: new Date().toISOString(),
  }
}

/**
 * Placas ya escaneadas en la sesión de inventario físico (persistidas en
 * localStorage por el módulo de escaneo). Se descuentan de los pendientes del
 * coordinador para que solo se vean los bienes que aún faltan por inventariar.
 */
function obtenerPlacasEscaneadas(): Set<string> {
  try {
    return new Set(
      cargarBienesDesdeStorage()
        .map((b) => (b.placa || '').trim())
        .filter(Boolean)
    )
  } catch {
    return new Set<string>()
  }
}

// Persistencia de la última consulta de coordinador. Se guarda en sessionStorage
// para que al cambiar de pestaña (que desmonta este panel) y volver, la consulta
// siga ahí y no haya que buscar de nuevo al coordinador.
const CONSULTA_KEY = 'coordinador_consulta_actual'

interface ConsultaCoordinador {
  coordinador: { nombre: string; cedula: string }
  bienes: BienCoordinador[]
}

function guardarConsultaCoordinador(consulta: ConsultaCoordinador | null): void {
  try {
    if (consulta) sessionStorage.setItem(CONSULTA_KEY, JSON.stringify(consulta))
    else sessionStorage.removeItem(CONSULTA_KEY)
  } catch { /* ignore */ }
}

function leerConsultaCoordinador(): ConsultaCoordinador | null {
  try {
    const raw = sessionStorage.getItem(CONSULTA_KEY)
    return raw ? (JSON.parse(raw) as ConsultaCoordinador) : null
  } catch {
    return null
  }
}

/**
 * Módulo "Coordinador" en versión GRANDE para el panel central de
 * gestión-inventario. Reutiliza el mismo `DetalleCoordinador` del panel de
 * contadores (derecha), pero en modo `grande` para aprovechar todo el ancho:
 * buscador, ficha del coordinador y bienes pendientes agrupados por servicio
 * en una rejilla multi-columna.
 */
export default function PanelCoordinadorCentral({ toast }: PanelCoordinadorCentralProps) {
  // Restaurar la última consulta (si se cambió de pestaña y se volvió).
  const consultaGuardada = leerConsultaCoordinador()
  const [coordinadorSeleccionado, setCoordinadorSeleccionado] = useState<{ nombre: string; cedula: string } | null>(consultaGuardada?.coordinador ?? null)
  const [bienes, setBienes] = useState<BienCoordinador[]>(consultaGuardada?.bienes ?? [])
  const [cargando, setCargando] = useState(false)
  const [filtro, setFiltro] = useState('')
  // Placas ya escaneadas en la sesión de inventario (se descuentan de los pendientes).
  // Se refresca en cada búsqueda para reflejar lo escaneado más reciente.
  const [placasCubiertas, setPlacasCubiertas] = useState<Set<string>>(() => obtenerPlacasEscaneadas())
  // Placas cuyo "Inventariar" está en curso (para deshabilitar el botón).
  const [inventariando, setInventariando] = useState<Set<string>>(new Set())
  // Bien pendiente de elegir servicio destino (abre ModalSeleccionServicio).
  const [bienPendienteServicio, setBienPendienteServicio] = useState<BienCoordinador | null>(null)

  // Placas que CUALQUIER usuario tiene en proceso de inventario, mantenidas en
  // tiempo real por WebSocket en el contexto de Transferencias. Al unirlas con
  // las placas cubiertas localmente, un bien que otro usuario agrega a sus
  // bienes escaneados desaparece de los pendientes de este coordinador.
  const { placasPendientesInventario } = useTransferencias()
  const placasCubiertasEfectivas = useMemo(() => {
    const union = new Set<string>(placasCubiertas)
    placasPendientesInventario.forEach((p) => union.add((p || '').trim()))
    return union
  }, [placasCubiertas, placasPendientesInventario])

  const buscarPorCedula = async (cedula: string) => {
    setCoordinadorSeleccionado({ nombre: cedula, cedula })
    setCargando(true)
    setBienes([])
    setFiltro('')
    setPlacasCubiertas(obtenerPlacasEscaneadas())
    try {
      const { nombre, bienes: resultado } = await buscarBienesPorCoordinador(cedula)
      setCoordinadorSeleccionado({ nombre, cedula })
      setBienes(resultado)
      // Persistir la consulta para restaurarla al volver de otra pestaña.
      guardarConsultaCoordinador({ coordinador: { nombre, cedula }, bienes: resultado })
      if (resultado.length === 0) toast.warning('No se encontraron bienes asignados a este coordinador')
    } catch (err: any) {
      if (err?.name === 'AbortError') toast.error('La consulta tardó demasiado. Intente de nuevo.')
      else toast.error('Error al consultar los bienes del coordinador')
    }
    setCargando(false)
  }

  const limpiar = () => {
    setCoordinadorSeleccionado(null)
    setBienes([])
    setFiltro('')
    // Al limpiar manualmente sí se descarta la consulta persistida.
    guardarConsultaCoordinador(null)
  }

  /**
   * Paso 1 de "Incluir al inventario": valida la placa y los duplicados y abre
   * el modal para que el usuario elija a cuál de SUS servicios habilitados se
   * agrega el bien. Ya NO exige un servicio activo previo en la Toma de
   * inventario principal: el servicio destino se elige aquí.
   */
  const inventariarBien = (bien: BienCoordinador) => {
    const placa = (bien.placa || '').trim()
    if (!placa) { toast.error('El bien no tiene placa válida'); return }

    // Evitar duplicados: si ya está en el inventario, no lo agregamos.
    const actuales = cargarBienesDesdeStorage()
    if (actuales.some((b) => (b.placa || '').trim() === placa)) {
      toast.warning(`El bien ${placa} ya está en la toma de inventario`)
      // Igual lo marcamos como cubierto para que desaparezca de pendientes.
      setPlacasCubiertas((prev) => new Set(prev).add(placa))
      // Y re-notificamos por WS por si otros paneles aún no lo descontaron.
      notificarEscaneoInventario(placa, bien.servicio_nombre || bien.servicio || '')
      return
    }

    // Abrir el modal de selección de servicio destino.
    setBienPendienteServicio(bien)
  }

  /**
   * Paso 2 de "Incluir al inventario": el usuario eligió el servicio destino.
   * Agrega el bien a la Toma de inventario principal escribiéndolo en el
   * storage compartido (`inventario_fisico_bienes`), notifica por WS y, si el
   * servicio del bien difiere del elegido, emite la alerta de la campana.
   */
  const confirmarServicioEInventariar = async (servicioDestino: ServicioSeleccionable) => {
    const bien = bienPendienteServicio
    setBienPendienteServicio(null)
    if (!bien) return

    const placa = (bien.placa || '').trim()
    if (!placa) { toast.error('El bien no tiene placa válida'); return }

    // Código del servicio destino elegido en el modal.
    const servicioActivo = (servicioDestino.codigo || '').trim()

    // Nombre del servicio destino elegido (para etiquetar el bien). Si el modal
    // no pudo resolver el nombre, se usa el código.
    const nombreServicioDestino = (servicioDestino.nombre || '').trim() || servicioActivo

    setInventariando((prev) => new Set(prev).add(placa))
    try {
      // Enriquecer con los datos reales del bien (cédula, ubicación, etc.).
      // Si falla, se usa la información básica del coordinador.
      let nuevo: BienInventario
      try {
        const info = await consultarBienPorPlaca(placa)
        nuevo = {
          placa: info.codigo || placa,
          descripcion: info.desmat || bien.descripcion || '',
          serial: info.serial || bien.serial || 'N/A',
          estado: 'B',
          cedula_responsable: info.cedulaResponsable || '',
          nombre_responsable: info.responsable || bien.responsable || '',
          // Etiquetar con el servicio DESTINO elegido por el usuario (no con la
          // dependencia original del bien), para que entre en ese servicio.
          servicio: nombreServicioDestino,
          ubicacion: (info as any).ubicacion || '',
          timestamp: new Date().toISOString(),
        }
      } catch {
        nuevo = { ...bienDesdeCoordinador(bien), servicio: nombreServicioDestino }
      }

      guardarBienesEnStorage([...cargarBienesDesdeStorage(), nuevo])
      setPlacasCubiertas((prev) => new Set(prev).add(placa))
      // Notificar por WS para descontar en vivo faltantes y coordinador (aquí,
      // en la toma principal y en los paneles de otros usuarios).
      notificarEscaneoInventario(nuevo.placa, nuevo.servicio || '')

      // Alerta en la campana si el bien incluido NO pertenece al servicio
      // activo. La inclusión desde el panel Coordinador escribe el bien
      // directamente en storage (no pasa por procesarCodigoBarras), así que la
      // alerta de "placa de otro servicio" debe emitirse aquí para no perderla.
      // Se compara el CÓDIGO del servicio del bien (del coordinador) contra el
      // servicio activo seleccionado. Solo se avisa cuando se tiene el código y
      // difiere; si el bien no trae código de servicio no se asume diferencia.
      const codigoServicioBien = (bien.servicio || '').trim()
      if (codigoServicioBien && codigoServicioBien !== servicioActivo) {
        const nombreMostrar = bien.servicio_nombre || nuevo.servicio || codigoServicioBien
        alertaInventario.placaServicioDiferente(nuevo.placa, nombreMostrar)
      }

      toast.success?.(`Bien ${placa} agregado a la toma de inventario`)
    } catch {
      toast.error(`No se pudo inventariar el bien ${placa}`)
    } finally {
      setInventariando((prev) => {
        const next = new Set(prev)
        next.delete(placa)
        return next
      })
    }
  }

  return (
    <div className="gi-coord-central">
      {/* Sin banner superior: en el estado inicial manda la tarjeta central
          "Busque un coordinador" (que ya tiene ícono, título, descripción y
          buscador); al seleccionar coordinador manda la franja compacta. Así se
          evita duplicar el encabezado y se ahorra espacio. */}

      {/* Contenido reutilizado en modo grande (buscador de coordinador, ficha,
          filtro de bienes y secciones por servicio los maneja DetalleCoordinador) */}
      <div className="gi-coord-central__body">
        <DetalleCoordinador
          grande
          coordinadorSeleccionado={coordinadorSeleccionado}
          bienes={bienes}
          cargando={cargando}
          filtro={filtro}
          placasCubiertas={placasCubiertasEfectivas}
          onBuscarPorCedula={buscarPorCedula}
          onLimpiar={limpiar}
          onFiltroChange={setFiltro}
          onInventariar={inventariarBien}
          inventariando={inventariando}
        />
      </div>

      {/* Modal para elegir el servicio habilitado al que se incluye el bien. */}
      <ModalSeleccionServicio
        isOpen={bienPendienteServicio !== null}
        placa={bienPendienteServicio?.placa}
        onCerrar={() => setBienPendienteServicio(null)}
        onSeleccionar={confirmarServicioEInventariar}
      />
    </div>
  )
}
