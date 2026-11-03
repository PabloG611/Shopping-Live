import { useState, useEffect, useId, useCallback } from 'react'
import {
  FaDatabase, FaMagnifyingGlass as FaSearch, FaPenToSquare as FaEdit, FaFloppyDisk as FaSave,
  FaXmark as FaTimes, FaWarehouse, FaBox, FaTrashCan as FaTrash, FaChartColumn as FaChartBar,
  FaFileExcel, FaClockRotateLeft as FaHistory, FaLocationDot as FaMapMarkerAlt, FaList, FaAngleLeft,
  FaBarcode, FaUser, FaBuilding, FaTag, FaLayerGroup, FaMoneyBillWave, FaAlignLeft,
} from 'react-icons/fa6'
import * as XLSX from 'xlsx'
import { Animacion } from 'react-ecosistema-unp/ui'
import './AdminBaseDatosPage.css'
import './PageLayout.css'
import './ConsultaBienesPage.css'
import { ModalConfirmarCambiosDB } from '../components/admin/ModalConfirmarCambiosDB'
import { TablaEditableBienes } from '../components/admin/TablaEditableBienes'
import SelectorUbicacion from '../components/admin/SelectorUbicacion'
import SelectorDependencia from '../components/admin/SelectorDependencia'
import ModalNombreExcel from '../components/common/ModalNombreExcel'
import ModalConfirmarAccion from '../components/common/ModalConfirmarAccion'
import { ToastContainer } from '../components/common/ToastContainer'
import { useToast } from '../hooks/useToast'
import {
  buscarArticuloAlmacen,
  buscarBienActivo,
  buscarArticulosPorDocumentoAlmacen,
  buscarMunicionPorResponsable,
  buscarBienesPorFacturaActivos,
  actualizarArticuloAlmacen,
  actualizarBienActivo,
  guardarCambiosMasivos,
  eliminarBienActivo,
  listarGruposArticulo,
  listarGruposContables,
  listarGruposBien,
  listarGruposContablesActivos,
  buscarBienesMultiplesCB,
  buscarBienesBJSinCB,
  buscarHistorialBajas,
  listarUbicacionesActivos,
  listarServicios,
  type ArticuloAlmacen,
  type BienActivoFijo,
  type ActualizarBienActivo,
  type BienCBResultado,
  type BienBJSinCB,
  type GrupoOption,
  type CambioMasivo,
  type EncabezadoDocumento,
  type UbicacionOption,
} from '../services/adminBaseDatosService'
import {
  // listarBodegasAlmacen,
  listarBodegasActivos,
  // buscarBienesReporteAlmacen,
  buscarBienesReporteActivos,
  contarBienesReporteActivos,
  cambiarBodegaMasivoPorMatids,
  cambiarBodegaMasivoPorPlacas,
  cambiarUbicacionMasivoPorPlacas,
  cambiarUbicacionMasivoPorMatids,
  consultarUbicacionActualPorPlacas,
  type ResultadoCambioMasivoBodega,
  type ResultadoCambioMasivoUbicacion,
  type ResultadoUbicacionActual,
  type BodegaOption,
  type BienReporteAlmacen,
  type BienReporteActivos,
} from '../services/reportesInventarioService'
import {
  calcularDepreciacionBienes,
  type BienDepreciacion,
} from '../services/depreciacionService'

interface CambioDetalle {
  campo: string
  valorAnterior: string | number
  valorNuevo: string | number
}

type TipoBase = 'almacen' | 'activos' | 'reportes' | 'depreciacion' | 'consulta-cb' | 'bj-sin-cb'
type TipoBusqueda = 'articulo' | 'factura' | 'responsable'
type TipoDocumento = 'FC' | 'EA' | 'BJ' | 'TB' | 'TS' | '00' | 'SA' | 'SD' | 'SI' | 'CB' | 'NUMERO' | 'AM'

const TIPOS_DOCUMENTO_ACTIVOS = [
  { value: 'FC', label: 'FC - Factura de Compra' },
  { value: 'EA', label: 'EA - Entrada Almacén' },
  { value: 'BJ', label: 'BJ - Baja' },
  { value: 'TB', label: 'TB - Traslado entre Bodegas' },
  { value: '00', label: '00 - Traslado entre Bodegas (TNS)' },
  { value: 'TS', label: 'TS - Traslado de Servicio' },
  { value: 'SA', label: 'SA - Salida Armamento' },
  { value: 'SD', label: 'SD - Salida Devolutivo' },
  { value: 'SI', label: 'SI - Salida Implementación' },
  { value: 'CB', label: 'CB - Confirmación Salida' },
  { value: 'NUMERO', label: 'Número sin Prefijo' },
] as const

const TIPOS_DOCUMENTO_ALMACEN = [
  { value: 'EA', label: 'EA - Entrada Almacén' },
  { value: 'AM', label: 'AM - Asignación de Munición' },
  { value: 'TB', label: 'TB - Traslado entre Bodegas' },
  { value: 'SD', label: 'SD - Salida Devolutivo' },
  { value: 'SI', label: 'SI - Salida Implementación' },
  { value: 'SA', label: 'SA - Salida Armamento' },
  { value: 'NUMERO', label: 'Número sin Prefijo' },
] as const

export default function AdminBaseDatosPage() {
  const uid = useId()
  const toast = useToast()
  const [tipoBase, setTipoBase] = useState<TipoBase>('reportes')
  // Panel lateral izquierdo (módulos) — patrón de layout del ecosistema
  const [panelIzqAbierto, setPanelIzqAbierto] = useState(true)
  const [tipoBusqueda, setTipoBusqueda] = useState<TipoBusqueda>('articulo')
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('FC')
  const [codigoBusqueda, setCodigoBusqueda] = useState('')
  const [cargando, setCargando] = useState(false)
  
  // Estados para Almacén
  const [articuloAlmacen, setArticuloAlmacen] = useState<ArticuloAlmacen | null>(null)
  const [articuloOriginal, setArticuloOriginal] = useState<ArticuloAlmacen | null>(null)
  const [articulosFactura, setArticulosFactura] = useState<ArticuloAlmacen[]>([])
  
  // Estados para Activos Fijos
  const [bienActivo, setBienActivo] = useState<BienActivoFijo | null>(null)
  const [bienOriginal, setBienOriginal] = useState<BienActivoFijo | null>(null)
  const [bienesFactura, setBienesFactura] = useState<BienActivoFijo[]>([])
  const [encabezadoDocumento, setEncabezadoDocumento] = useState<EncabezadoDocumento | null>(null)
  // Historial de bien
  const [historialBien, setHistorialBien] = useState<any[]>([])
  const [mostrarHistorial, setMostrarHistorial] = useState(false)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  // Estados para desplegables
  const [gruposArticulo, setGruposArticulo] = useState<GrupoOption[]>([])
  const [gruposContables, setGruposContables] = useState<GrupoOption[]>([])
  const [gruposBien, setGruposBien] = useState<GrupoOption[]>([])
  const [gruposContablesActivos, setGruposContablesActivos] = useState<GrupoOption[]>([])
  const [servicios, setServicios] = useState<GrupoOption[]>([])
  
  // Estados para reportes
  const [bodegas, setBodegas] = useState<BodegaOption[]>([])
  const [filtroGrupo, setFiltroGrupo] = useState<number | ''>('')
  const [filtroGrupoContable, setFiltroGrupoContable] = useState<number | ''>('')
  const [filtroBodega, setFiltroBodega] = useState<number | ''>('')
  const [filtroDescripcion, setFiltroDescripcion] = useState('')
  const [bienesReporte, setBienesReporte] = useState<BienReporteAlmacen[] | BienReporteActivos[]>([])
  const [totalReporte, setTotalReporte] = useState(0)
  // Paginación en cliente del reporte de inventario (mismo patrón que BJ sin CB / Historial de bajas).
  const [paginaReporte, setPaginaReporte] = useState(1)
  const ITEMS_POR_PAGINA_REPORTE = 100
  
  // Estados para progreso
  const [bienesCargados, setBienesCargados] = useState(0)
  // Total real de bienes que coinciden con los filtros (para el % de carga)
  const [totalRealReporte, setTotalRealReporte] = useState(0)
  
  // Estados para depreciación
  const [placasDepreciacion, setPlacasDepreciacion] = useState('')
  const [bienesDepreciacion, setBienesDepreciacion] = useState<any[]>([])
  const [cargandoDepreciacion, setCargandoDepreciacion] = useState(false)
  const [mostrarModalExportar, setMostrarModalExportar] = useState(false)
  const [nombreArchivoExcel, setNombreArchivoExcel] = useState('')
  
  // Estados para búsqueda múltiple de CB
  const [numerosCB, setNumerosCB] = useState('')
  const [resultadosCB, setResultadosCB] = useState<BienCBResultado[]>([])
  const [cargandoCB, setCargandoCB] = useState(false)

  // Estados para BJ sin CB
  const [filtroBJ, setFiltroBJ] = useState('')
  const [resultadosBJSinCB, setResultadosBJSinCB] = useState<BienBJSinCB[]>([])
  const [cargandoBJSinCB, setCargandoBJSinCB] = useState(false)
  const [filtroTextoBJSinCB, setFiltroTextoBJSinCB] = useState('')
  const [paginaBJSinCB, setPaginaBJSinCB] = useState(1)
  const ITEMS_POR_PAGINA_BJ = 100
  // Modo de consulta del módulo unificado: 'sin-cb' (BJ sin comprobante) o 'por-anio' (historial por año)
  const [modoBaja, setModoBaja] = useState<'sin-cb' | 'por-anio'>('sin-cb')
  const [aniosBaja, setAniosBaja] = useState<Set<number>>(() => new Set([new Date().getFullYear()]))
  
  const [modoEdicion, setModoEdicion] = useState(false)
  
  // Estados para modal de confirmación
  const [mostrarModal, setMostrarModal] = useState(false)
  const [modalEnviando, setModalEnviando] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const idModalTitulo = `${uid}-confirmar-cambios-db`
  
  // Estados para confirmación de eliminación
  const [mostrarConfirmacionEliminar, setMostrarConfirmacionEliminar] = useState(false)
  const [placaAEliminar, setPlacaAEliminar] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState(false)

  // Estados para cambio masivo de bodega
  const [mostrarModalCambioBodega, setMostrarModalCambioBodega] = useState(false)
  const [bodegaDestino, setBodegaDestino] = useState<number | ''>('')
  const [cambiandoBodega, setCambiandoBodega] = useState(false)
  const [bienesSeleccionados, setBienesSeleccionados] = useState<Set<number>>(new Set())
  // Modo del cambio masivo: 'seleccion' (bienes marcados en la tabla) o 'placas' (lista pegada de Excel)
  const [modoCambioBodega, setModoCambioBodega] = useState<'seleccion' | 'placas'>('placas')
  const [placasCambioBodega, setPlacasCambioBodega] = useState('')
  const [resultadoCambioBodega, setResultadoCambioBodega] = useState<ResultadoCambioMasivoBodega | null>(null)

  // Estados para cambio masivo de ubicación
  const [mostrarModalCambioUbicacion, setMostrarModalCambioUbicacion] = useState(false)
  const [ubicacionDestino, setUbicacionDestino] = useState<number | null>(null)
  const [ubicacionDestinoLabel, setUbicacionDestinoLabel] = useState<string | null>(null)
  const [cambiandoUbicacion, setCambiandoUbicacion] = useState(false)
  const [modoCambioUbicacion, setModoCambioUbicacion] = useState<'seleccion' | 'placas'>('placas')
  const [placasCambioUbicacion, setPlacasCambioUbicacion] = useState('')
  const [resultadoCambioUbicacion, setResultadoCambioUbicacion] = useState<ResultadoCambioMasivoUbicacion | null>(null)

  // Estados para modales de confirmación de acciones masivas
  const [confirmarCambioBodegaPendiente, setConfirmarCambioBodegaPendiente] = useState(false)
  const [confirmarCambioUbicacionPendiente, setConfirmarCambioUbicacionPendiente] = useState(false)
  const [ubicaciones, setUbicaciones] = useState<UbicacionOption[]>([])
  // Vista previa de ubicación actual (antes de cambiar)
  const [previewUbicacion, setPreviewUbicacion] = useState<ResultadoUbicacionActual | null>(null)
  const [consultandoUbicacion, setConsultandoUbicacion] = useState(false)
  // Panel lateral derecho de cambios masivos (reemplaza los modales).
  // La herramienta activa se deriva de mostrarModalCambioBodega / mostrarModalCambioUbicacion.
  const [panelMasivoAbierto, setPanelMasivoAbierto] = useState(false)

  // Placas parseadas desde el textarea, sin duplicados. Separamos SOLO por
  // saltos de línea, comas, punto y coma o tabulaciones — NO por espacios —
  // para no partir placas que contienen espacios internos (ej: "UNP 292").
  // Los espacios internos múltiples se colapsan a uno solo.
  const parsearPlacas = (texto: string): string[] =>
    texto
      .split(/[\n,;\t]+/)
      .map((p) => p.trim().replace(/\s+/g, ' '))
      .filter((p) => p.length > 0)

  const placasParseadas = parsearPlacas(placasCambioBodega)
  const placasUnicas = Array.from(new Set(placasParseadas.map((p) => p.toUpperCase())))

  // Placas para el cambio masivo de ubicación (mismo parseado)
  const placasUbicacionParseadas = parsearPlacas(placasCambioUbicacion)
  const placasUbicacionUnicas = Array.from(new Set(placasUbicacionParseadas.map((p) => p.toUpperCase())))

  // Cargar catálogos al montar el componente
  useEffect(() => {
    cargarCatalogos()
  }, [tipoBase])

  // Limpiar resultados al cambiar tipo de búsqueda
  useEffect(() => {
    setArticuloAlmacen(null)
    setArticuloOriginal(null)
    setArticulosFactura([])
    setBienActivo(null)
    setBienOriginal(null)
    setBienesFactura([])
    setEncabezadoDocumento(null)
    setModoEdicion(false)
    setCodigoBusqueda('')
  }, [tipoBusqueda])

  // Limpiar resultados al cambiar tipo de documento
  useEffect(() => {
    setArticuloAlmacen(null)
    setArticuloOriginal(null)
    setArticulosFactura([])
    setBienActivo(null)
    setBienOriginal(null)
    setBienesFactura([])
    setEncabezadoDocumento(null)
    setModoEdicion(false)
  }, [tipoDocumento])

  // Limpiar búsqueda al cambiar de base de datos
  useEffect(() => {
    setCodigoBusqueda('')
    setTipoBusqueda('articulo')
    // Establecer tipo de documento por defecto según la base
    setTipoDocumento(tipoBase === 'almacen' ? 'EA' : 'FC')
    setArticuloAlmacen(null)
    setArticuloOriginal(null)
    setArticulosFactura([])
    setBienActivo(null)
    setBienOriginal(null)
    setBienesFactura([])
    setEncabezadoDocumento(null)
    setModoEdicion(false)
    // Limpiar filtros de reportes
    setFiltroGrupo('')
    setFiltroGrupoContable('')
    setFiltroBodega('')
    setFiltroDescripcion('')
    setBienesReporte([])
    setTotalReporte(0)
  }, [tipoBase])

  const cargarCatalogos = async () => {
    try {
      if (tipoBase === 'almacen') {
        const [grupos, contables] = await Promise.all([
          listarGruposArticulo(),
          listarGruposContables()
        ])
        setGruposArticulo(grupos)
        setGruposContables(contables)
      } else if (tipoBase === 'activos') {
        const [grupos, contablesActivos, serviciosActivos] = await Promise.all([
          listarGruposBien(),
          listarGruposContablesActivos(),
          listarServicios()
        ])
        setGruposBien(grupos)
        setGruposContablesActivos(contablesActivos)
        setServicios(serviciosActivos)
      } else if (tipoBase === 'reportes') {
        try {
          const [grupos, contablesActivos, bodegasActivos, ubics] = await Promise.all([
            listarGruposBien(),
            listarGruposContablesActivos(),
            listarBodegasActivos(),
            listarUbicacionesActivos(),
          ])
          setGruposBien(grupos)
          setGruposContablesActivos(contablesActivos)
          setBodegas(bodegasActivos)
          setUbicaciones(ubics)
          console.log('Catálogos cargados:', {
            grupos: grupos.length,
            contables: contablesActivos.length,
            bodegas: bodegasActivos.length
          })
        } catch (error) {
          console.error('Error cargando catálogos de reportes:', error)
          toast.error('Error cargando catálogos. Intente recargar la página.')
        }
      }
    } catch (err) {
      console.error('Error cargando catálogos:', err)
      toast.error('Error cargando catálogos')
    }
  }

  const buscar = async () => {
    if (!codigoBusqueda.trim()) {
      const mensaje = tipoBusqueda === 'responsable' ? 'Ingrese una cédula' : 'Ingrese un código o número de documento'
      toast.error(mensaje)
      return
    }

    setCargando(true)
    
    // Limpiar resultados anteriores ANTES de buscar
    setArticuloAlmacen(null)
    setArticuloOriginal(null)
    setArticulosFactura([])
    setBienActivo(null)
    setBienOriginal(null)
    setBienesFactura([])
    setEncabezadoDocumento(null)
    setModoEdicion(false)

    // Pequeño delay para asegurar que React actualice el estado
    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      if (tipoBase === 'almacen') {
        if (tipoBusqueda === 'articulo') {
          // Buscar artículo por código
          const articulo = await buscarArticuloAlmacen(codigoBusqueda.trim())
          setArticuloAlmacen(articulo)
          setArticuloOriginal({ ...articulo })
        } else if (tipoBusqueda === 'responsable') {
          // Buscar movimientos de munición por cédula del responsable
          const articulos = await buscarMunicionPorResponsable(codigoBusqueda.trim())
          setArticulosFactura(articulos)
        } else {
          // Buscar artículos por movimiento/documento en Almacén
          const articulos = await buscarArticulosPorDocumentoAlmacen(codigoBusqueda.trim(), tipoDocumento)
          setArticulosFactura(articulos)
        }
      } else {
        // Base de Activos Fijos
        if (tipoBusqueda === 'articulo') {
          // Buscar bien por placa
          const bien = await buscarBienActivo(codigoBusqueda.trim())
          setBienActivo(bien)
          setBienOriginal({ ...bien })
        } else {
          // Buscar bienes por documento con tipo de documento
          const resultado = await buscarBienesPorFacturaActivos(codigoBusqueda.trim(), tipoDocumento)
          setBienesFactura(resultado.bienes)
          setEncabezadoDocumento(resultado.encabezado || null)
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al buscar'
      toast.error(errorMsg)
      console.error(err)
      // Asegurar que se limpien los resultados en caso de error
      setArticuloAlmacen(null)
      setArticuloOriginal(null)
      setArticulosFactura([])
      setBienActivo(null)
      setBienOriginal(null)
      setBienesFactura([])
      setEncabezadoDocumento(null)
    } finally {
      setCargando(false)
    }
  }

  const calcularCambios = (): CambioDetalle[] => {
    const cambios: CambioDetalle[] = []
    
    if (articuloAlmacen && articuloOriginal) {
      if (articuloAlmacen.nombre !== articuloOriginal.nombre) {
        cambios.push({
          campo: 'NOMBRE',
          valorAnterior: articuloOriginal.nombre,
          valorNuevo: articuloAlmacen.nombre
        })
      }
      if (articuloAlmacen.grupmatid !== articuloOriginal.grupmatid) {
        cambios.push({
          campo: 'GRUPMATID',
          valorAnterior: articuloOriginal.grupmatid,
          valorNuevo: articuloAlmacen.grupmatid
        })
      }
      if (articuloAlmacen.gcmatid !== articuloOriginal.gcmatid) {
        cambios.push({
          campo: 'GCMATID',
          valorAnterior: articuloOriginal.gcmatid,
          valorNuevo: articuloAlmacen.gcmatid
        })
      }
    } else if (bienActivo && bienOriginal) {
      if (bienActivo.desmat !== bienOriginal.desmat) {
        cambios.push({
          campo: 'DESMAT',
          valorAnterior: bienOriginal.desmat,
          valorNuevo: bienActivo.desmat
        })
      }
      if ((bienActivo.descrip || '') !== (bienOriginal.descrip || '')) {
        cambios.push({
          campo: 'DESCRIP',
          valorAnterior: bienOriginal.descrip || '',
          valorNuevo: bienActivo.descrip || ''
        })
      }
      if (bienActivo.grupmatid !== bienOriginal.grupmatid) {
        cambios.push({
          campo: 'GRUPMATID',
          valorAnterior: bienOriginal.grupmatid,
          valorNuevo: bienActivo.grupmatid
        })
      }
      if ((bienActivo.gcmatid || 0) !== (bienOriginal.gcmatid || 0)) {
        cambios.push({
          campo: 'GCMATID (Grupo Contable)',
          valorAnterior: bienOriginal.gcmatid || 0,
          valorNuevo: bienActivo.gcmatid || 0
        })
      }
      if ((bienActivo.servicioId || 0) !== (bienOriginal.servicioId || 0)) {
        const labelServicio = (id?: number | null) =>
          servicios.find(s => s.id === id)?.label || 'Sin dependencia'
        cambios.push({
          campo: 'Dependencia',
          valorAnterior: bienOriginal.dependencia || labelServicio(bienOriginal.servicioId),
          valorNuevo: labelServicio(bienActivo.servicioId)
        })
      }
      if ((bienActivo.serial ?? '').trim() !== (bienOriginal.serial ?? '').trim()) {
        cambios.push({
          campo: 'SERIAL',
          valorAnterior: (bienOriginal.serial ?? '').trim() || '(sin serial)',
          valorNuevo: (bienActivo.serial ?? '').trim() || '(sin serial)'
        })
      }
      if ((bienActivo.serial2 ?? '').trim() !== (bienOriginal.serial2 ?? '').trim()) {
        cambios.push({
          campo: 'SERIAL 2',
          valorAnterior: (bienOriginal.serial2 ?? '').trim() || '(sin segundo serial)',
          valorNuevo: (bienActivo.serial2 ?? '').trim() || '(sin segundo serial)'
        })
      }
    }
    
    return cambios
  }

  const abrirModalConfirmacion = () => {
    const cambios = calcularCambios()
    if (cambios.length === 0) {
      toast.warning('No hay cambios para guardar')
      return
    }
    setModalError(null)
    setMostrarModal(true)
  }

  const cerrarModal = () => {
    if (modalEnviando) return
    setMostrarModal(false)
    setModalError(null)
  }

  const confirmarGuardado = async () => {
    setModalEnviando(true)
    setModalError(null)
    
    try {
      if (articuloAlmacen) {
        // Actualizar artículo de almacén
        const datos = {
          nombre: articuloAlmacen.nombre,
          descripcion: articuloAlmacen.descripcion,
          grupmatid: articuloAlmacen.grupmatid,
          gcmatid: articuloAlmacen.gcmatid
        }
        
        await actualizarArticuloAlmacen(articuloAlmacen.matid, datos)
        
        setModoEdicion(false)
        setMostrarModal(false)
        toast.success(`Artículo ${articuloAlmacen.codigo} actualizado correctamente en la base de datos`)
        
        // Actualizar el original con los nuevos valores
        setArticuloOriginal({ ...articuloAlmacen })
        
      } else if (bienActivo) {
        // Actualizar bien de activos fijos.
        // Solo incluir serial/serial2 si el usuario los cambió, para NO borrar
        // por accidente un serial existente (enviar la clave con "" lo pondría en NULL).
        const datos: ActualizarBienActivo = {
          desmat: bienActivo.desmat,
          descrip: bienActivo.descrip,
          grupmatid: bienActivo.grupmatid,
          gcmatid: bienActivo.gcmatid,
          valorcomp: bienActivo.valorcomp
        }

        // Dependencia (SERVICIOID): solo enviar si cambió, para no reasignar sin querer.
        if ((bienActivo.servicioId || 0) !== (bienOriginal?.servicioId || 0) && bienActivo.servicioId) {
          datos.servicioid = bienActivo.servicioId
        }

        const serialActual = (bienActivo.serial ?? '').trim()
        const serialOriginal = (bienOriginal?.serial ?? '').trim()
        if (serialActual !== serialOriginal) {
          datos.serial = serialActual === '' ? null : serialActual
        }

        const serial2Actual = (bienActivo.serial2 ?? '').trim()
        const serial2Original = (bienOriginal?.serial2 ?? '').trim()
        if (serial2Actual !== serial2Original) {
          datos.serial2 = serial2Actual === '' ? null : serial2Actual
        }

        await actualizarBienActivo(bienActivo.matid, datos, tipoDocumento, codigoBusqueda.trim())
        
        setModoEdicion(false)
        setMostrarModal(false)
        toast.success(`Bien ${bienActivo.codigo} actualizado correctamente en la base de datos`)
        
        // Actualizar el original con los nuevos valores
        setBienOriginal({ ...bienActivo })
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al guardar cambios'
      setModalError(errorMsg)
      console.error(err)
    } finally {
      setModalEnviando(false)
    }
  }

  const guardarCambios = () => {
    abrirModalConfirmacion()
  }

  const manejarGuardadoMasivo = async (cambios: CambioMasivo[]) => {
    try {
      const resultado = await guardarCambiosMasivos(cambios, tipoDocumento, codigoBusqueda.trim())
      toast.success(`${resultado.message} (${resultado.actualizados} bienes actualizados)`)
      
      // Recargar los bienes de la factura para mostrar los cambios
      if (tipoBusqueda === 'factura' && codigoBusqueda) {
        const numeroDocumento = codigoBusqueda.trim()
        const resultado = await buscarBienesPorFacturaActivos(numeroDocumento, tipoDocumento)
        setBienesFactura(resultado.bienes)
        setEncabezadoDocumento(resultado.encabezado || null)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al guardar cambios masivos'
      toast.error(errorMsg)
      throw err
    }
  }

  const limpiar = () => {
    setCodigoBusqueda('')
    setArticuloAlmacen(null)
    setArticuloOriginal(null)
    setArticulosFactura([])
    setBienActivo(null)
    setBienOriginal(null)
    setBienesFactura([])
    setEncabezadoDocumento(null)
    setModoEdicion(false)
  }

  const cancelarEdicion = () => {
    // Restaurar valores originales
    if (articuloOriginal) {
      setArticuloAlmacen({ ...articuloOriginal })
    }
    if (bienOriginal) {
      setBienActivo({ ...bienOriginal })
    }
    setModoEdicion(false)
  }

  const cambiarBase = (nuevaBase: TipoBase) => {
    setTipoBase(nuevaBase)
  }

  const solicitarEliminar = (placa: string) => {
    setPlacaAEliminar(placa)
    setMostrarConfirmacionEliminar(true)
  }

  const confirmarEliminar = async () => {
    if (!placaAEliminar) return

    setEliminando(true)
    try {
      const resultado = await eliminarBienActivo(placaAEliminar)
      toast.success(resultado.message || `Bien ${placaAEliminar} eliminado correctamente`)
      
      // Limpiar resultados
      setBienActivo(null)
      setBienOriginal(null)
      setCodigoBusqueda('')
      setMostrarConfirmacionEliminar(false)
      setPlacaAEliminar(null)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al eliminar bien'
      toast.error(errorMsg)
      console.error(err)
    } finally {
      setEliminando(false)
    }
  }

  const cancelarEliminar = () => {
    setMostrarConfirmacionEliminar(false)
    setPlacaAEliminar(null)
  }

  const limpiarFiltros = () => {
    setFiltroGrupo('')
    setFiltroGrupoContable('')
    setFiltroBodega('')
    setFiltroDescripcion('')
    setBienesReporte([])
    setTotalReporte(0)
    setBienesCargados(0)
    setPaginaReporte(1)
  }

  const buscarReporte = useCallback(async () => {
    setCargando(true)
    setBienesReporte([])
    setTotalReporte(0)
    setBienesCargados(0)
    setTotalRealReporte(0)
    setPaginaReporte(1)

    try {
      // Construir objeto de filtros base
      const filtrosBase: {
        grupmatid?: number
        gcmatid?: number
        servicioid?: number
        descripcion?: string
        limit: number
        offset: number
      } = {
        limit: 1500,
        offset: 0
      }

      if (filtroGrupo) filtrosBase.grupmatid = Number(filtroGrupo)
      if (filtroGrupoContable) filtrosBase.gcmatid = Number(filtroGrupoContable)
      if (filtroBodega) filtrosBase.servicioid = Number(filtroBodega)
      if (filtroDescripcion.trim()) filtrosBase.descripcion = filtroDescripcion.trim()

      // Primero pedimos el CONTEO TOTAL real (COUNT en el backend) con los mismos
      // filtros, para poder mostrar un porcentaje de carga correcto. Si falla,
      // seguimos sin porcentaje (totalRealReporte = 0).
      try {
        const { total } = await contarBienesReporteActivos(filtrosBase)
        if (total > 0) setTotalRealReporte(total)
      } catch {
        // Si no se puede contar, el loader mostrará solo el conteo cargado, sin %.
      }

      // Carga progresiva por lotes
      let todosLosBienes: BienReporteActivos[] = []
      let offset = 0
      let hasMore = true
      const BATCH_SIZE = 1500

      while (hasMore) {
        const filtros = { ...filtrosBase, limit: BATCH_SIZE, offset }
        const resultado = await buscarBienesReporteActivos(filtros)
        
        todosLosBienes = [...todosLosBienes, ...resultado.data]
        offset += BATCH_SIZE
        hasMore = resultado.data.length === BATCH_SIZE

        // Actualizar UI progresivamente (sin toasts)
        setBienesReporte([...todosLosBienes])
        setBienesCargados(todosLosBienes.length)
        setTotalReporte(todosLosBienes.length)
      }
      
      toast.success(`Se cargaron ${todosLosBienes.length} bienes`)
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al buscar bienes'
      toast.error(errorMsg)
      console.error(err)
    } finally {
      setCargando(false)
    }
  }, [filtroGrupo, filtroGrupoContable, filtroBodega, filtroDescripcion, toast])

  const exportarAExcel = () => {
    if (bienesReporte.length === 0) {
      toast.warning('No hay datos para exportar')
      return
    }

    try {
      // Preparar datos para Excel
      const datosExcel = (bienesReporte as BienReporteActivos[]).map((bien) => ({
        'Placa': bien.codigo,
        'Descripción': bien.desmat,
        'Grupo del Bien': bien.grupoBien,
        'Grupo Contable': bien.grupoContableCodigo || '',
        'Valor Compra': bien.valorcomp,
        'Depreciación': bien.depreciacion,
        'Valor Actual': bien.valorActual,
        'Serial': bien.serial || 'Sin serial',
        'Tipo de Entrada': bien.tipoEntrada || 'Sin entrada',
        'N° Entrada': bien.numeroEntrada || '',
        'Nro Compra': bien.numeroCompra || '',
        'Proveedor': bien.proveedor || 'Sin proveedor',
        'Fecha de Compra': bien.fechaCompra || '',
        'Bodega/Servicio': bien.servicio || 'Sin asignar',
        'Ubicación': bien.ubicacion || '',
        'Responsable': bien.responsable || 'Sin responsable',
        'Cédula': bien.cedula || ''
      }))

      // Crear libro de Excel
      const ws = XLSX.utils.json_to_sheet(datosExcel)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte de Inventario')

      // Ajustar ancho de columnas
      const colWidths = [
        { wch: 12 }, // Placa
        { wch: 40 }, // Descripción
        { wch: 25 }, // Grupo del Bien
        { wch: 15 }, // Grupo Contable
        { wch: 18 }, // Valor Compra
        { wch: 18 }, // Depreciación
        { wch: 18 }, // Valor Actual
        { wch: 20 }, // Serial
        { wch: 20 }, // Tipo de Entrada
        { wch: 14 }, // N° Entrada
        { wch: 30 }, // Nro Compra
        { wch: 35 }, // Proveedor
        { wch: 15 }, // Fecha de Compra
        { wch: 35 }, // Bodega/Servicio
        { wch: 30 }, // Ubicación
        { wch: 30 }, // Responsable
        { wch: 15 }  // Cédula
      ]
      ws['!cols'] = colWidths

      // Generar nombre de archivo con fecha
      const fecha = new Date().toISOString().split('T')[0]
      const nombreArchivo = `Reporte_Inventario_${fecha}.xlsx`

      // Crear Blob y descargar con diálogo "Guardar como"
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      
      // Crear link temporal y simular click para abrir diálogo "Guardar como"
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = nombreArchivo
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      
      // Limpiar
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, 100)

      toast.success(`Exportando ${totalReporte} registros a Excel`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al exportar a Excel'
      toast.error(errorMsg)
      console.error(err)
    }
  }

  const calcularDepreciacion = async () => {
    if (!placasDepreciacion.trim()) {
      toast.warning('Ingrese al menos una placa')
      return
    }

    // Separar placas por saltos de línea, comas o espacios
    const placasArray = placasDepreciacion
      .split(/[\n,\s]+/)
      .map(p => p.trim())
      .filter(p => p.length > 0)

    if (placasArray.length === 0) {
      toast.warning('No se encontraron placas válidas')
      return
    }

    setCargandoDepreciacion(true)
    setBienesDepreciacion([])

    // Toast inicial
    const toastId = toast.info(`Consultando ${placasArray.length} placas...`, Infinity)

    try {
      // Enviar TODAS las placas de una vez (consulta masiva optimizada)
      const resultado = await calcularDepreciacionBienes(placasArray)
      
      // Actualizar la tabla con todos los resultados
      setBienesDepreciacion(resultado.data)
      
      // Remover toast de progreso
      toast.removeToast(toastId)
      
      // Mensaje final con resumen
      const encontrados = resultado.encontrados
      const noEncontrados = resultado.no_encontrados
      
      if (encontrados === 0) {
        toast.error('No se encontró ningún bien con las placas ingresadas')
      } else if (noEncontrados > 0) {
        toast.success(`Consulta finalizada: ${encontrados} encontrados, ${noEncontrados} no encontrados`)
      } else {
        toast.success(`Consulta finalizada: ${encontrados} bienes encontrados`)
      }
    } catch (err) {
      toast.removeToast(toastId)
      const errorMsg = err instanceof Error ? err.message : 'Error consultando valores'
      toast.error(errorMsg)
      console.error(err)
    } finally {
      setCargandoDepreciacion(false)
    }
  }

  const exportarCBAExcel = () => {
    if (resultadosCB.length === 0) {
      toast.warning('No hay datos para exportar')
      return
    }
    try {
      const datosExcel = resultadosCB.map((cb) => ({
        'Número CB': cb.numero_cb,
        'Placa': cb.placa || '',
        'Descripción': cb.descripcion || '',
        'Cédula': cb.cedula || '',
        'Responsable': cb.responsable || '',
        'Estado': cb.encontrado ? 'Encontrado' : 'No encontrado',
      }))
      const ws = XLSX.utils.json_to_sheet(datosExcel)
      ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 30 }, { wch: 14 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Consulta CB')
      const ahora = new Date()
      const fecha = ahora.toISOString().split('T')[0]
      const hora = ahora.toTimeString().split(' ')[0].replace(/:/g, '-')
      XLSX.writeFile(wb, `Consulta_CB_${fecha}_${hora}.xlsx`)
      toast.success('Archivo exportado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al exportar')
      console.error(err)
    }
  }

  const exportarDepreciacionAExcel = () => {
    if (bienesDepreciacion.length === 0) {
      toast.warning('No hay datos para exportar')
      return
    }

    // Generar nombre por defecto y abrir modal
    const ahora = new Date()
    const fecha = ahora.toISOString().split('T')[0]
    const hora = ahora.toTimeString().split(' ')[0].replace(/:/g, '-')
    setNombreArchivoExcel(`Baja_Bienes_${fecha}_${hora}`)
    setMostrarModalExportar(true)
  }

  const confirmarExportacion = (nombre: string) => {
    if (!nombre.trim()) {
      toast.warning('Ingrese un nombre para el archivo')
      return
    }

    try {
      // Preparar datos para Excel - números como valores numéricos puros
      const datosExcel = bienesDepreciacion.map((bien: BienDepreciacion) => ({
        'Placa': bien.placa,
        'Descripción': bien.descripcion,
        'Serial': bien.serial,
        'Grupo del Bien': bien.grupo_bien,
        'Valor de Compra': Number(bien.valor_compra),
        'Disminución Acumulada': Number(bien.disminucion_acumulada || 0),
        'Depreciación Acumulada': Number(bien.depreciacion_acumulada),
        'Valor Actual': Number(bien.valor_actual),
        'Fecha de Compra': bien.fecha_compra,
        'Responsable': bien.responsable,
        'Cédula': bien.cedula,
        'Último Documento': bien.ultimo_documento ? bien.ultimo_documento.documento_completo : 'Sin documento',
        'Fecha Documento': bien.ultimo_documento ? bien.ultimo_documento.fecha : '',
        'Estado': bien.encontrado ? 'Encontrado' : 'No encontrado'
      }))

      // Crear libro de Excel
      const ws = XLSX.utils.json_to_sheet(datosExcel)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Baja de Bienes')

      // Ajustar ancho de columnas
      const colWidths = [
        { wch: 12 }, // Placa
        { wch: 40 }, // Descripción
        { wch: 20 }, // Serial
        { wch: 25 }, // Grupo del Bien
        { wch: 18 }, // Valor de Compra
        { wch: 22 }, // Disminución Acumulada
        { wch: 22 }, // Depreciación Acumulada
        { wch: 15 }, // Valor Actual
        { wch: 15 }, // Fecha de Compra
        { wch: 30 }, // Responsable
        { wch: 15 }, // Cédula
        { wch: 18 }, // Último Documento
        { wch: 15 }, // Fecha Documento
        { wch: 15 }  // Estado
      ]
      ws['!cols'] = colWidths

      // Aplicar formato de número con separador de miles y 2 decimales a las columnas numéricas
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        // Columna E: Valor de Compra
        const cellE = XLSX.utils.encode_cell({ r: R, c: 4 })
        if (ws[cellE] && typeof ws[cellE].v === 'number') {
          ws[cellE].z = '#,##0.00'
          ws[cellE].t = 'n'
        }
        
        // Columna F: Disminución Acumulada
        const cellF = XLSX.utils.encode_cell({ r: R, c: 5 })
        if (ws[cellF] && typeof ws[cellF].v === 'number') {
          ws[cellF].z = '#,##0.00'
          ws[cellF].t = 'n'
        }
        
        // Columna G: Depreciación Acumulada
        const cellG = XLSX.utils.encode_cell({ r: R, c: 6 })
        if (ws[cellG] && typeof ws[cellG].v === 'number') {
          ws[cellG].z = '#,##0.00'
          ws[cellG].t = 'n'
        }
        
        // Columna H: Valor Actual
        const cellH = XLSX.utils.encode_cell({ r: R, c: 7 })
        if (ws[cellH] && typeof ws[cellH].v === 'number') {
          ws[cellH].z = '#,##0.00'
          ws[cellH].t = 'n'
        }
      }

      const nombreArchivo = `${nombre.trim()}.xlsx`

      // Crear Blob y descargar
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = nombreArchivo
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, 100)

      setMostrarModalExportar(false)
      toast.success(`Exportado: ${nombreArchivo}`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al exportar a Excel'
      toast.error(errorMsg)
      console.error(err)
    }
  }

  const limpiarDepreciacion = () => {
    setPlacasDepreciacion('')
    setBienesDepreciacion([])
  }

  const buscarMultiplesCB = async () => {
    if (!numerosCB.trim()) {
      toast.warning('Ingrese al menos un número de CB')
      return
    }

    // Separar números por saltos de línea, comas o espacios
    const numerosArray = numerosCB
      .split(/[\n,\s]+/)
      .map(n => n.trim())
      .filter(n => n.length > 0)

    if (numerosArray.length === 0) {
      toast.warning('No se encontraron números de CB válidos')
      return
    }

    setCargandoCB(true)
    setResultadosCB([])

    const toastId = toast.info(`Consultando ${numerosArray.length} CB...`, Infinity)

    try {
      const resultado = await buscarBienesMultiplesCB(numerosArray)
      
      setResultadosCB(resultado)
      
      toast.removeToast(toastId)
      
      const encontrados = resultado.filter(r => r.encontrado).length
      const noEncontrados = resultado.length - encontrados
      
      if (encontrados === 0) {
        toast.error('No se encontró ningún bien con los CB ingresados')
      } else if (noEncontrados > 0) {
        toast.success(`Consulta finalizada: ${encontrados} encontrados, ${noEncontrados} no encontrados`)
      } else {
        toast.success(`Consulta finalizada: ${encontrados} bienes encontrados`)
      }
    } catch (err) {
      toast.removeToast(toastId)
      const errorMsg = err instanceof Error ? err.message : 'Error consultando CB'
      toast.error(errorMsg)
      console.error(err)
    } finally {
      setCargandoCB(false)
    }
  }

  const limpiarCB = () => {
    setNumerosCB('')
    setResultadosCB([])
  }

  // ─── BJ sin CB ───────────────────────────────────────────────────────────────
  const buscarBJSinCB = async () => {
    setCargandoBJSinCB(true)
    setResultadosBJSinCB([])

    try {
      const todosLosResultados = await buscarBienesBJSinCB(filtroBJ || undefined)

      if (todosLosResultados.length === 0) {
        toast.info('No se encontraron bienes con BJ pendientes de CB')
        setCargandoBJSinCB(false)
        return
      }

      // Mostrar resultados progresivamente en lotes grandes para velocidad
      const BATCH = 5000
      let i = 0

      const cargarLote = () => {
        i += BATCH
        const lote = todosLosResultados.slice(0, i)
        setResultadosBJSinCB(lote)

        if (i < todosLosResultados.length) {
          setTimeout(cargarLote, 30)
        } else {
          setCargandoBJSinCB(false)
          toast.success(`Se encontraron ${todosLosResultados.length} bienes con BJ sin CB`)
        }
      }
      cargarLote()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al consultar')
      console.error(err)
      setCargandoBJSinCB(false)
    }
  }

  // Consulta por año (historial de bajas): trae TODAS las BJ de los años elegidos
  // y las vuelca en la misma tabla de resultados.
  const buscarBajasPorAnio = async () => {
    const anios = Array.from(aniosBaja).sort((a, b) => b - a)
    if (anios.length === 0) {
      toast.warning('Seleccione al menos un año')
      return
    }
    setCargandoBJSinCB(true)
    setResultadosBJSinCB([])
    setPaginaBJSinCB(1)
    try {
      const data = await buscarHistorialBajas(anios)
      setResultadosBJSinCB(data)
      if (data.length === 0) toast.info('No se encontraron bajas para los años seleccionados')
      else toast.success(`Se encontraron ${data.length} bajas`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al consultar historial de bajas')
      console.error(err)
    } finally {
      setCargandoBJSinCB(false)
    }
  }

  const toggleAnioBaja = (anio: number) => {
    setAniosBaja((prev) => {
      const next = new Set(prev)
      if (next.has(anio)) next.delete(anio); else next.add(anio)
      return next
    })
  }

  const limpiarBJSinCB = () => {
    setFiltroBJ('')
    setResultadosBJSinCB([])
    setFiltroTextoBJSinCB('')
    setPaginaBJSinCB(1)
  }

  const exportarBJSinCBExcel = () => {
    if (resultadosBJSinCB.length === 0) return

    const datosExcel = resultadosBJSinCB.map(bien => ({
      'Placa': bien.placa,
      'Descripción': bien.descripcion,
      'Serial': bien.serial,
      'N° BJ': bien.numero_bj,
      'Fecha BJ': bien.fecha_bj,
      'Tipo Baja': bien.tipo_bj,
      'Detalle BJ': bien.detalle_bj,
      'Responsable': bien.responsable,
      'Cédula': bien.cedula,
    }))

    const ws = XLSX.utils.json_to_sheet(datosExcel)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BJ sin CB')
    XLSX.writeFile(wb, `bienes_bj_sin_cb_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Archivo Excel exportado')
  }

  const abrirModalCambioBodega = () => {
    setBodegaDestino('')
    setResultadoCambioBodega(null)
    // Si ya hay bienes marcados en la tabla, abrir en modo selección; si no, en modo placas.
    setModoCambioBodega(bienesSeleccionados.size > 0 ? 'seleccion' : 'placas')
    // Herramienta activa = bodega; abrir panel derecho.
    setMostrarModalCambioUbicacion(false)
    setMostrarModalCambioBodega(true)
    setPanelMasivoAbierto(true)
  }



  const toggleSeleccionBien = (matid: number) => {
    const nuevaSeleccion = new Set(bienesSeleccionados)
    if (nuevaSeleccion.has(matid)) {
      nuevaSeleccion.delete(matid)
    } else {
      nuevaSeleccion.add(matid)
    }
    setBienesSeleccionados(nuevaSeleccion)
  }

  const toggleSeleccionTodos = () => {
    if (bienesSeleccionados.size === bienesReporte.length) {
      // Deseleccionar todos
      setBienesSeleccionados(new Set())
    } else {
      // Seleccionar todos
      const todosLosMatids = new Set((bienesReporte as BienReporteActivos[]).map(b => b.matid))
      setBienesSeleccionados(todosLosMatids)
    }
  }

  const confirmarCambioBodega = async () => {
    if (!bodegaDestino) {
      toast.warning('Debe seleccionar la bodega destino')
      return
    }

    if (modoCambioBodega === 'seleccion' && bienesSeleccionados.size === 0) {
      toast.warning('Debe seleccionar al menos un bien en la tabla')
      return
    }

    if (modoCambioBodega === 'placas' && placasUnicas.length === 0) {
      toast.warning('Ingrese al menos una placa')
      return
    }

    setCambiandoBodega(true)
    setResultadoCambioBodega(null)

    try {
      const resultado = modoCambioBodega === 'seleccion'
        ? await cambiarBodegaMasivoPorMatids(Array.from(bienesSeleccionados), Number(bodegaDestino))
        : await cambiarBodegaMasivoPorPlacas(placasUnicas, Number(bodegaDestino))

      if (resultado.ok) {
        setResultadoCambioBodega(resultado)

        const noEncontradas = resultado.noEncontradas?.length ?? 0
        const conError = resultado.errores?.length ?? 0
        if (noEncontradas > 0 || conError > 0) {
          toast.warning(resultado.mensaje)
        } else {
          toast.success(resultado.mensaje)
        }

        if (modoCambioBodega === 'seleccion') {
          setBienesSeleccionados(new Set()) // Limpiar selección
          // Recargar el reporte para reflejar los cambios en la tabla
          await buscarReporte()
        }
      } else {
        toast.error(resultado.mensaje)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cambiar bodega masivamente'
      toast.error(errorMsg)
      console.error(err)
    } finally {
      setCambiandoBodega(false)
    }
  }

  // ─── Cambio masivo de UBICACIÓN ───────────────────────────────────────────
  const abrirModalCambioUbicacion = () => {
    setUbicacionDestino(null)
    setUbicacionDestinoLabel(null)
    setResultadoCambioUbicacion(null)
    setPreviewUbicacion(null)
    setModoCambioUbicacion(bienesSeleccionados.size > 0 ? 'seleccion' : 'placas')
    // Herramienta activa = ubicación; abrir panel derecho.
    setMostrarModalCambioBodega(false)
    setMostrarModalCambioUbicacion(true)
    setPanelMasivoAbierto(true)
  }



  // Consulta la ubicación actual de las placas pegadas, para revisar antes de cambiar.
  const consultarUbicacionActual = async () => {
    if (placasUbicacionUnicas.length === 0) {
      toast.warning('Ingrese al menos una placa')
      return
    }
    setConsultandoUbicacion(true)
    setPreviewUbicacion(null)
    try {
      const res = await consultarUbicacionActualPorPlacas(placasUbicacionUnicas)
      if (res.ok) {
        setPreviewUbicacion(res)
        if (res.noEncontradas.length > 0) {
          toast.warning(`${res.encontradas} encontrada(s), ${res.noEncontradas.length} no encontrada(s)`)
        }
      } else {
        toast.error(res.mensaje || 'No se pudo consultar la ubicación actual')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al consultar ubicación actual')
    } finally {
      setConsultandoUbicacion(false)
    }
  }

  const confirmarCambioUbicacion = async () => {
    if (!ubicacionDestino) {
      toast.warning('Debe seleccionar la ubicación destino')
      return
    }
    if (modoCambioUbicacion === 'seleccion' && bienesSeleccionados.size === 0) {
      toast.warning('Debe seleccionar al menos un bien en la tabla')
      return
    }
    if (modoCambioUbicacion === 'placas' && placasUbicacionUnicas.length === 0) {
      toast.warning('Ingrese al menos una placa')
      return
    }

    setCambiandoUbicacion(true)
    setResultadoCambioUbicacion(null)

    try {
      const resultado = modoCambioUbicacion === 'seleccion'
        ? await cambiarUbicacionMasivoPorMatids(Array.from(bienesSeleccionados), ubicacionDestino)
        : await cambiarUbicacionMasivoPorPlacas(placasUbicacionUnicas, ubicacionDestino)

      if (resultado.ok) {
        setResultadoCambioUbicacion(resultado)
        const noEnc = resultado.noEncontradas?.length ?? 0
        const conErr = resultado.errores?.length ?? 0
        if (noEnc > 0 || conErr > 0) {
          toast.warning(resultado.mensaje)
        } else {
          toast.success(resultado.mensaje)
        }
        if (modoCambioUbicacion === 'seleccion') {
          setBienesSeleccionados(new Set())
          await buscarReporte()
        }
      } else {
        toast.error(resultado.mensaje)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar ubicación masivamente')
      console.error(err)
    } finally {
      setCambiandoUbicacion(false)
    }
  }

  // ── Contenido del panel derecho: herramienta "Cambio de bodega" ──
  const renderHerramientaBodega = () => {
   const resBodega = resultadoCambioBodega
   return (
    <div className="afx-tool">
      <p className="afx-tool__subtitle">Mueve varios bienes a una nueva bodega en un solo paso.</p>

      <div className="cmb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={modoCambioBodega === 'placas'}
          className={`cmb-tab ${modoCambioBodega === 'placas' ? 'active' : ''}`}
          onClick={() => setModoCambioBodega('placas')} disabled={cambiandoBodega}>
          <FaFileExcel /> Placas
        </button>
        <button type="button" role="tab" aria-selected={modoCambioBodega === 'seleccion'}
          className={`cmb-tab ${modoCambioBodega === 'seleccion' ? 'active' : ''}`}
          onClick={() => setModoCambioBodega('seleccion')} disabled={cambiandoBodega}>
          <FaBox /> Seleccionados
          {bienesSeleccionados.size > 0 && <span className="cmb-tab-badge">{bienesSeleccionados.size}</span>}
        </button>
      </div>

      {modoCambioBodega === 'placas' ? (
        <div className="cmb-field">
          <label className="cmb-label" htmlFor={`${uid}-placas-cmb`}>Placas de los bienes <span className="cmb-req">*</span></label>
          <textarea id={`${uid}-placas-cmb`} className="cmb-textarea"
            placeholder={'Una placa por línea o separadas por comas.\nEj:\nUNP 292\n2016523\nF33252'}
            value={placasCambioBodega} onChange={(e) => setPlacasCambioBodega(e.target.value)}
            disabled={cambiandoBodega} rows={6} />
          <div className="cmb-help-row">
            <small className="cmb-help">Salto de línea o comas. Duplicados se ignoran.</small>
            <span className={`cmb-count ${placasUnicas.length > 0 ? 'ok' : ''}`}>
              {placasUnicas.length} placa{placasUnicas.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      ) : (
        <div className="cmb-selection-info">
          <FaBox className="cmb-selection-icon" />
          <div>
            <strong>{bienesSeleccionados.size}</strong> bien{bienesSeleccionados.size === 1 ? '' : 'es'} seleccionado{bienesSeleccionados.size === 1 ? '' : 's'}
            {bienesSeleccionados.size === 0 && (
              <p className="cmb-selection-empty">Marca bienes en la tabla o usa la pestaña de placas.</p>
            )}
          </div>
        </div>
      )}

      <div className="cmb-field">
        <label className="cmb-label" htmlFor={`${uid}-bodega-cmb`}>Bodega destino <span className="cmb-req">*</span></label>
        <select id={`${uid}-bodega-cmb`} className="cmb-select" value={bodegaDestino}
          onChange={(e) => setBodegaDestino(e.target.value ? parseInt(e.target.value) : '')} disabled={cambiandoBodega}>
          <option value="">Seleccione la bodega destino…</option>
          {bodegas.map((bodega) => (<option key={bodega.id} value={bodega.id}>{bodega.label}</option>))}
        </select>
      </div>

      {resBodega && (
        <div className="cmb-result">
          <div className="cmb-result-summary">
            <span className="cmb-result-ok">✓ {resBodega.actualizados} actualizados</span>
            {typeof resBodega.totalSolicitados === 'number' && (
              <span className="cmb-result-total">de {resBodega.totalSolicitados} solicitadas</span>
            )}
          </div>
          {resBodega.noEncontradas && resBodega.noEncontradas.length > 0 && (
            <details className="cmb-result-details">
              <summary>{resBodega.noEncontradas.length} placa(s) no encontrada(s)</summary>
              <div className="cmb-result-chips">
                {resBodega.noEncontradas.map((p) => (<span key={p} className="cmb-chip">{p}</span>))}
              </div>
            </details>
          )}
          {resBodega.errores && resBodega.errores.length > 0 && (
            <details className="cmb-result-details">
              <summary>{resBodega.errores.length} con incidencias</summary>
              <ul className="cmb-result-errors">
                {resBodega.errores.map((e, i) => (<li key={i}>{e}</li>))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="cmb-warning">
        <span className="cmb-warning-icon">⚠️</span>
        <span>Actualiza la bodega del último movimiento de cada bien. Verifica la bodega destino antes de confirmar.</span>
      </div>

      <button type="button" className="cmb-btn-confirm afx-tool__confirm" onClick={() => setConfirmarCambioBodegaPendiente(true)}
        disabled={cambiandoBodega || !bodegaDestino || (modoCambioBodega === 'placas' ? placasUnicas.length === 0 : bienesSeleccionados.size === 0)}>
        {cambiandoBodega ? (
          <><span className="spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.5rem' }}></span>Cambiando…</>
        ) : (
          <><FaWarehouse style={{ marginRight: '0.5rem' }} />
            {modoCambioBodega === 'placas'
              ? `Cambiar ${placasUnicas.length || ''} placa${placasUnicas.length === 1 ? '' : 's'}`.trim()
              : `Cambiar ${bienesSeleccionados.size || ''} bien${bienesSeleccionados.size === 1 ? '' : 'es'}`.trim()}
          </>
        )}
      </button>
    </div>
   )
  }

  // ── Contenido del panel derecho: herramienta "Cambio de ubicación" ──
  const renderHerramientaUbicacion = () => {
   const preview = previewUbicacion
   const resUbic = resultadoCambioUbicacion
   return (
    <div className="afx-tool">
      <p className="afx-tool__subtitle">Asigna una ubicación a varios bienes en un solo paso.</p>

      <div className="cmb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={modoCambioUbicacion === 'placas'}
          className={`cmb-tab ${modoCambioUbicacion === 'placas' ? 'active' : ''}`}
          onClick={() => setModoCambioUbicacion('placas')} disabled={cambiandoUbicacion}>
          <FaFileExcel /> Placas
        </button>
        <button type="button" role="tab" aria-selected={modoCambioUbicacion === 'seleccion'}
          className={`cmb-tab ${modoCambioUbicacion === 'seleccion' ? 'active' : ''}`}
          onClick={() => setModoCambioUbicacion('seleccion')} disabled={cambiandoUbicacion}>
          <FaBox /> Seleccionados
          {bienesSeleccionados.size > 0 && <span className="cmb-tab-badge">{bienesSeleccionados.size}</span>}
        </button>
      </div>

      {modoCambioUbicacion === 'placas' ? (
        <div className="cmb-field">
          <label className="cmb-label" htmlFor={`${uid}-placas-ubic`}>Placas de los bienes <span className="cmb-req">*</span></label>
          <textarea id={`${uid}-placas-ubic`} className="cmb-textarea"
            placeholder={'Una placa por línea o separadas por comas.\nSe respetan placas con espacios (ej: UNP 292).\n\nEj:\nUNP 292\n2016523\nF33252'}
            value={placasCambioUbicacion} onChange={(e) => { setPlacasCambioUbicacion(e.target.value); setPreviewUbicacion(null) }}
            disabled={cambiandoUbicacion} rows={6} />
          <div className="cmb-help-row">
            <small className="cmb-help">Una por línea o comas. No separes por espacios. Duplicados se ignoran.</small>
            <span className={`cmb-count ${placasUbicacionUnicas.length > 0 ? 'ok' : ''}`}>
              {placasUbicacionUnicas.length} placa{placasUbicacionUnicas.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      ) : (
        <div className="cmb-selection-info">
          <FaBox className="cmb-selection-icon" />
          <div>
            <strong>{bienesSeleccionados.size}</strong> bien{bienesSeleccionados.size === 1 ? '' : 'es'} seleccionado{bienesSeleccionados.size === 1 ? '' : 's'}
            {bienesSeleccionados.size === 0 && (
              <p className="cmb-selection-empty">Marca bienes en la tabla o usa la pestaña de placas.</p>
            )}
          </div>
        </div>
      )}

      <div className="cmb-field">
        <label className="cmb-label">Ubicación destino <span className="cmb-req">*</span></label>
        <SelectorUbicacion
          ubicaciones={ubicaciones}
          valor={ubicacionDestino}
          onSeleccionar={(id, label) => { setUbicacionDestino(id); setUbicacionDestinoLabel(label) }}
          placeholder="Buscar ubicación (código o nombre)…"
        />
        {ubicacionDestinoLabel && (
          <small className="cmb-help" style={{ marginTop: '0.35rem' }}>Destino: <strong>{ubicacionDestinoLabel}</strong></small>
        )}
      </div>

      {modoCambioUbicacion === 'placas' && (
        <button type="button" className="cmb-preview-btn" onClick={() => void consultarUbicacionActual()}
          disabled={consultandoUbicacion || cambiandoUbicacion || placasUbicacionUnicas.length === 0}>
          {consultandoUbicacion ? (
            <><span className="spinner" style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid rgba(13,110,253,0.3)', borderTopColor: '#0d6efd', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.45rem' }}></span>Consultando…</>
          ) : (
            <><FaMapMarkerAlt style={{ marginRight: '0.45rem' }} /> Ver ubicación actual</>
          )}
        </button>
      )}

      {preview && (
        <div className="cmb-preview">
          <div className="cmb-preview-head">
            <strong>Ubicación actual</strong>
            <span className="cmb-preview-badge">{preview.encontradas} de {preview.totalSolicitados}</span>
          </div>
          <div className="cmb-preview-table-wrap">
            <table className="cmb-preview-table">
              <thead><tr><th>Placa</th><th>Descripción</th><th>Ubicación actual</th></tr></thead>
              <tbody>
                {preview.bienes.map((b) => (
                  <tr key={b.placa}>
                    <td className="cmb-preview-placa">{b.placa}</td>
                    <td title={b.descripcion}>{b.descripcion || '—'}</td>
                    <td title={b.ubicacionActual}>{b.ubicacionActual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.noEncontradas.length > 0 && (
            <details className="cmb-result-details">
              <summary>{preview.noEncontradas.length} placa(s) no encontrada(s)</summary>
              <div className="cmb-result-chips">
                {preview.noEncontradas.map((p) => (<span key={p} className="cmb-chip">{p}</span>))}
              </div>
            </details>
          )}
        </div>
      )}

      {resUbic && (
        <div className="cmb-result">
          <div className="cmb-result-summary">
            <span className="cmb-result-ok">✓ {resUbic.actualizados} actualizados</span>
            {typeof resUbic.totalSolicitados === 'number' && (
              <span className="cmb-result-total">de {resUbic.totalSolicitados} solicitadas</span>
            )}
          </div>
          {resUbic.noEncontradas && resUbic.noEncontradas.length > 0 && (
            <details className="cmb-result-details">
              <summary>{resUbic.noEncontradas.length} placa(s) no encontrada(s)</summary>
              <div className="cmb-result-chips">
                {resUbic.noEncontradas.map((p) => (<span key={p} className="cmb-chip">{p}</span>))}
              </div>
            </details>
          )}
          {resUbic.errores && resUbic.errores.length > 0 && (
            <details className="cmb-result-details">
              <summary>{resUbic.errores.length} con incidencias</summary>
              <ul className="cmb-result-errors">
                {resUbic.errores.map((e, i) => (<li key={i}>{e}</li>))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="cmb-warning">
        <span className="cmb-warning-icon">⚠️</span>
        <span>Actualiza la ubicación del último movimiento de cada bien. Verifica el destino antes de confirmar.</span>
      </div>

      <button type="button" className="cmb-btn-confirm afx-tool__confirm" style={{ background: 'linear-gradient(135deg, #0d6efd, #0a58ca)' }}
        onClick={() => setConfirmarCambioUbicacionPendiente(true)}
        disabled={cambiandoUbicacion || !ubicacionDestino || (modoCambioUbicacion === 'placas' ? placasUbicacionUnicas.length === 0 : bienesSeleccionados.size === 0)}>
        {cambiandoUbicacion ? (
          <><span className="spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.5rem' }}></span>Cambiando…</>
        ) : (
          <><FaMapMarkerAlt style={{ marginRight: '0.5rem' }} />
            {modoCambioUbicacion === 'placas'
              ? `Cambiar ${placasUbicacionUnicas.length || ''} placa${placasUbicacionUnicas.length === 1 ? '' : 's'}`.trim()
              : `Cambiar ${bienesSeleccionados.size || ''} bien${bienesSeleccionados.size === 1 ? '' : 'es'}`.trim()}
          </>
        )}
      </button>
    </div>
   )
  }

  const hayResultados = articuloAlmacen || articulosFactura.length > 0 || bienActivo || bienesFactura.length > 0

  const cambiosModal = calcularCambios()
  const nombreArticuloModal = articuloAlmacen?.nombre || bienActivo?.desmat || ''
  const codigoArticuloModal = articuloAlmacen?.codigo || bienActivo?.codigo || ''
  const baseDatosModal = tipoBase === 'almacen' ? 'Almacén (UNP2026.GDB)' : 'Activos Fijos (ACTIVOS FIJOS UNP.GDB)'

  // Módulos del panel lateral izquierdo (antes eran los botones-tarjeta del selector).
  // 'almacen' queda deshabilitado igual que antes.
  const modulos = [
    { id: 'activos' as const, label: 'Activos Fijos', desc: 'Gestión de bienes', icon: FaBox },
    { id: 'reportes' as const, label: 'Reporte de bienes', desc: 'Buscar y exportar bienes', icon: FaChartBar },
    { id: 'depreciacion' as const, label: 'Consulta valores en libros', desc: 'Valores en libros de bienes', icon: FaMoneyBillWave },
    { id: 'consulta-cb' as const, label: 'Consulta de CB', desc: 'Buscar varios CB', icon: FaSearch },
    { id: 'bj-sin-cb' as const, label: 'Bienes con BJ pero sin CB', desc: 'Bajas y su seguimiento', icon: FaHistory },
  ]

  return (
    <div className="admin-db-page consulta-page">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      
      {/* Modal para nombre del archivo Excel */}
      <ModalNombreExcel
        isOpen={mostrarModalExportar}
        nombrePorDefecto={nombreArchivoExcel}
        onCancelar={() => setMostrarModalExportar(false)}
        onConfirmar={(nombre) => confirmarExportacion(nombre)}
      />

      {/* Modal de confirmación: cambio masivo de BODEGA */}
      <ModalConfirmarAccion
        isOpen={confirmarCambioBodegaPendiente}
        titulo="Confirmar cambio de bodega"
        mensaje={`Se va a actualizar la bodega de`}
        destacado={
          modoCambioBodega === 'placas'
            ? `${placasUnicas.length} placa${placasUnicas.length === 1 ? '' : 's'}`
            : `${bienesSeleccionados.size} bien${bienesSeleccionados.size === 1 ? '' : 'es'}`
        }
        advertencia={`Destino: ${bodegas.find(b => b.id === bodegaDestino)?.label ?? String(bodegaDestino)}. Esta acción actualiza el último movimiento de cada bien en Firebird.`}
        textoConfirmar="Sí, cambiar bodega"
        color="#e65100"
        onConfirmar={() => { setConfirmarCambioBodegaPendiente(false); void confirmarCambioBodega() }}
        onCancelar={() => setConfirmarCambioBodegaPendiente(false)}
      />

      {/* Modal de confirmación: cambio masivo de UBICACIÓN */}
      <ModalConfirmarAccion
        isOpen={confirmarCambioUbicacionPendiente}
        titulo="Confirmar cambio de ubicación"
        mensaje={`Se va a actualizar la ubicación de`}
        destacado={
          modoCambioUbicacion === 'placas'
            ? `${placasUbicacionUnicas.length} placa${placasUbicacionUnicas.length === 1 ? '' : 's'}`
            : `${bienesSeleccionados.size} bien${bienesSeleccionados.size === 1 ? '' : 'es'}`
        }
        advertencia={`Destino: ${ubicacionDestinoLabel ?? ''}. Esta acción actualiza el último movimiento de cada bien en Firebird.`}
        textoConfirmar="Sí, cambiar ubicación"
        color="#0d6efd"
        onConfirmar={() => { setConfirmarCambioUbicacionPendiente(false); void confirmarCambioUbicacion() }}
        onCancelar={() => setConfirmarCambioUbicacionPendiente(false)}
      />
      
      {/* Modal de confirmación de eliminación */}
      {mostrarConfirmacionEliminar && placaAEliminar && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem'
          }}
          onClick={cancelarEliminar}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.25rem', color: '#d13c47' }}>
              Confirmar eliminación
            </h3>
            <p style={{ margin: '0 0 1.5rem', color: '#495057', lineHeight: 1.5 }}>
              ¿Está seguro de eliminar permanentemente la placa <strong>{placaAEliminar}</strong> de la base de datos de Activos Fijos?
              <br /><br />
              <strong>Esta acción NO se puede deshacer.</strong>
              <br />
              Se hará un backup automático antes de eliminar.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="admin-db-btn-cancel"
                onClick={cancelarEliminar}
                disabled={eliminando}
              >
                Cancelar
              </button>
              <button
                className="admin-db-btn-save"
                onClick={() => void confirmarEliminar()}
                disabled={eliminando}
                style={{ background: '#d13c47' }}
              >
                {eliminando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de historial del bien */}
      {mostrarHistorial && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={() => { setMostrarHistorial(false); setCargandoHistorial(false) }}
        >
          <div
            style={{
              background: 'white', borderRadius: '12px', padding: '1.5rem',
              maxWidth: '900px', width: '95%', maxHeight: '80vh',
              display: 'flex', flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                <FaHistory style={{ marginRight: '0.5rem' }} />
                Histórico Placa: {bienActivo?.codigo}
              </h3>
              <button onClick={() => { setMostrarHistorial(false); setCargandoHistorial(false) }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            
            <div style={{ overflow: 'auto', flex: 1 }}>
              {cargandoHistorial ? (
                <p style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Cargando historial...</p>
              ) : historialBien.length > 0 ? (
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#303d50', color: 'white', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '0.6rem' }}>Año</th>
                      <th style={{ padding: '0.6rem' }}>Mes</th>
                      <th style={{ padding: '0.6rem' }}>Responsable</th>
                      <th style={{ padding: '0.6rem' }}>Cédula</th>
                      <th style={{ padding: '0.6rem' }}>Servicio</th>
                      <th style={{ padding: '0.6rem' }}>Dependencia</th>
                      <th style={{ padding: '0.6rem' }}>Grupo Contable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialBien.map((h, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #eee', background: i === 0 ? 'rgba(40, 167, 69, 0.08)' : 'transparent' }}>
                        <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600 }}>{h.anio}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>{h.mes}</td>
                        <td style={{ padding: '0.5rem' }}>{h.responsable || '--'}</td>
                        <td style={{ padding: '0.5rem' }}>{h.cedula || '--'}</td>
                        <td style={{ padding: '0.5rem' }}>{h.cod_servicio || '--'}</td>
                        <td style={{ padding: '0.5rem' }}>{h.dependencia || '--'}</td>
                        <td style={{ padding: '0.5rem' }}>{h.grupo_contable || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>No se encontró historial para esta placa.</p>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
              <span style={{ fontSize: '0.85rem', color: '#666' }}>
                {historialBien.length > 0 && `Total: ${historialBien.length} registros | Primer registro: ${historialBien[historialBien.length - 1]?.anio}/${historialBien[historialBien.length - 1]?.mes}`}
              </span>
              <button
                className="admin-db-btn-cancel"
                onClick={() => { setMostrarHistorial(false); setCargandoHistorial(false) }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModal && (
        <ModalConfirmarCambiosDB
          tituloId={idModalTitulo}
          baseDatos={baseDatosModal}
          codigoArticulo={codigoArticuloModal}
          nombreArticulo={nombreArticuloModal}
          cambios={cambiosModal}
          error={modalError}
          enviando={modalEnviando}
          onCerrar={cerrarModal}
          onConfirmar={() => void confirmarGuardado()}
        />
      )}
      <div className="consulta-layout">

        {/* ── Panel Izquierdo: MÓDULOS ── */}
        <div className={`consulta-lateral consulta-lateral--izq${panelIzqAbierto ? '' : ' is-collapsed'}`}>
          {!panelIzqAbierto ? (
            <div className="consulta-lateral__tab-vertical" onClick={() => setPanelIzqAbierto(true)} role="button" tabIndex={0} aria-label="Abrir módulos" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPanelIzqAbierto(true) }}>
              <span className="consulta-lateral__tab-icon"><FaList size={13} /></span>
              <span className="consulta-lateral__tab-text">Módulos</span>
            </div>
          ) : (
            <div className="consulta-lateral__panel">
              <div className="consulta-lateral__panel-header">
                <div className="consulta-lateral__panel-header-left">
                  <span className="consulta-lateral__panel-header-icon"><FaDatabase size={13} /></span>
                  <h2 className="consulta-lateral__panel-header-title">Base de Datos</h2>
                </div>
                <button type="button" className="consulta-lateral__collapse-btn" onClick={() => setPanelIzqAbierto(false)} aria-label="Colapsar">
                  <FaAngleLeft size={12} />
                </button>
              </div>
              <div className="consulta-lateral__panel-body">
                {/* Almacén deshabilitado (igual que antes) */}
                <button
                  type="button"
                  className="gi-modulo-item"
                  disabled
                  title="Funcionalidad deshabilitada temporalmente"
                  style={{ opacity: 0.5, cursor: 'not-allowed' }}
                >
                  <span className="gi-modulo-item__icon"><FaWarehouse size={18} /></span>
                  <span className="gi-modulo-item__text">
                    <span className="gi-modulo-item__label">Base de Almacén</span>
                    <span className="gi-modulo-item__desc">Deshabilitado</span>
                  </span>
                </button>
                {modulos.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`gi-modulo-item${tipoBase === m.id ? ' is-active' : ''}`}
                    onClick={() => cambiarBase(m.id)}
                  >
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
          {/* Sección de Reportes */}
          {tipoBase === 'reportes' && (
            <div className="admin-db-search-section">
              <h3 className="afx-module-title">Reporte de bienes</h3>
              <p className="afx-seg-hint" style={{ marginBottom: '1.1rem' }}>
                Consulte los bienes de Activos Fijos filtrando por grupo, grupo contable, bodega/servicio
                o descripción. Puede exportar el resultado a Excel, y desde el panel de la derecha aplicar
                cambios masivos de bodega o de ubicación.
              </p>

              <div className="afx-filtros-grid">
                {/* Filtro Grupo del Bien */}
                <div className="afx-filtro">
                  <label className="afx-filtro__label">Grupo del bien</label>
                  <select
                    className="admin-db-field-input"
                    value={filtroGrupo}
                    onChange={(e) => setFiltroGrupo(e.target.value ? parseInt(e.target.value) : '')}
                  >
                    <option value="">Todos los grupos</option>
                    {gruposBien.map((grupo) => (
                      <option key={grupo.id} value={grupo.id}>{grupo.label}</option>
                    ))}
                  </select>
                </div>

                {/* Filtro Grupo Contable */}
                <div className="afx-filtro">
                  <label className="afx-filtro__label">Grupo contable</label>
                  <select
                    className="admin-db-field-input"
                    value={filtroGrupoContable}
                    onChange={(e) => setFiltroGrupoContable(e.target.value ? parseInt(e.target.value) : '')}
                  >
                    <option value="">Todos los grupos contables</option>
                    {gruposContablesActivos.map((grupo) => (
                      <option key={grupo.id} value={grupo.id}>{grupo.label}</option>
                    ))}
                  </select>
                </div>

                {/* Filtro Bodega/Servicio */}
                <div className="afx-filtro">
                  <label className="afx-filtro__label">Bodega / Servicio</label>
                  <select
                    className="admin-db-field-input"
                    value={filtroBodega}
                    onChange={(e) => setFiltroBodega(e.target.value ? parseInt(e.target.value) : '')}
                  >
                    <option value="">Todas las bodegas</option>
                    {bodegas.map((bodega) => (
                      <option key={bodega.id} value={bodega.id}>{bodega.label}</option>
                    ))}
                  </select>
                </div>

                {/* Filtro Descripción */}
                <div className="afx-filtro">
                  <label className="afx-filtro__label">Descripción</label>
                  <input
                    type="text"
                    className="admin-db-field-input"
                    placeholder="Ej: chaleco"
                    value={filtroDescripcion}
                    onChange={(e) => setFiltroDescripcion(e.target.value)}
                  />
                </div>
              </div>

              <div className="afx-filtros-actions">
                <button
                  type="button"
                  className="admin-db-btn-cancel"
                  onClick={limpiarFiltros}
                  disabled={cargando}
                >
                  Limpiar filtros
                </button>
                <button
                  type="button"
                  className="admin-db-search-btn"
                  onClick={() => void buscarReporte()}
                  disabled={cargando}
                >
                  {cargando ? (
                    <>
                      <span className="spinner" style={{
                        display: 'inline-block', width: '14px', height: '14px',
                        border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                        borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.5rem'
                      }}></span>
                      Buscando...
                    </>
                  ) : (
                    <><FaSearch style={{ marginRight: '0.5rem' }} /> Buscar</>
                  )}
                </button>
              </div>
              
            </div>
          )}

          {/* Sección de Depreciación para Baja */}
          {tipoBase === 'depreciacion' && (() => {
            const placasDep = placasDepreciacion
              .split(/[\n,;\t]+/)
              .map((p) => p.trim().replace(/\s+/g, ' '))
              .filter((p) => p.length > 0)
            const placasDepUnicas = Array.from(new Set(placasDep.map((p) => p.toUpperCase())))
            return (
            <div className="admin-db-search-section">
              <h3 className="afx-module-title">Consulta de valores en libros</h3>
              <p className="afx-seg-hint" style={{ marginBottom: '1.1rem' }}>
                Consulte el <strong>valor en libros</strong> de uno o varios bienes de Activos Fijos:
                valor de compra, depreciación acumulada y valor actual. Útil como insumo para
                evaluar bajas. Pegue las placas y presione <strong>Consultar valores</strong>.
              </p>

              <div className="afx-dep-field">
                <div className="afx-dep-label-row">
                  <label className="afx-filtro__label" htmlFor={`${uid}-placas-dep`}>Placas de los bienes</label>
                  <span className={`cmb-count ${placasDepUnicas.length > 0 ? 'ok' : ''}`}>
                    {placasDepUnicas.length} placa{placasDepUnicas.length === 1 ? '' : 's'}
                  </span>
                </div>
                <textarea
                  id={`${uid}-placas-dep`}
                  className="afx-dep-textarea"
                  placeholder={'Pega aquí las placas.\nUna por línea o separadas por comas.\n\nEj:\n2016522\n2016523\nF33252'}
                  value={placasDepreciacion}
                  onChange={(e) => setPlacasDepreciacion(e.target.value)}
                  rows={8}
                />
                <small className="afx-dep-help">Se aceptan saltos de línea o comas. Los duplicados se ignoran.</small>
              </div>

              <div className="afx-filtros-actions">
                <button
                  type="button"
                  className="admin-db-btn-cancel"
                  onClick={limpiarDepreciacion}
                  disabled={cargandoDepreciacion}
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  className="admin-db-search-btn"
                  onClick={() => void calcularDepreciacion()}
                  disabled={cargandoDepreciacion || placasDepUnicas.length === 0}
                >
                  {cargandoDepreciacion ? (
                    <>
                      <span className="spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.5rem' }}></span>
                      Consultando…
                    </>
                  ) : (
                    <><FaMoneyBillWave style={{ marginRight: '0.5rem' }} /> Consultar valores</>
                  )}
                </button>
              </div>
            </div>
            )
          })()}

          {/* Formulario de búsqueda */}
          {tipoBase !== 'reportes' && tipoBase !== 'depreciacion' && tipoBase !== 'consulta-cb' && tipoBase !== 'bj-sin-cb' && (
            <div className="admin-db-search-section">
            {/* Título del módulo */}
            <h3 className="afx-module-title">
              {tipoBase === 'almacen' ? 'Base de Almacén' : 'Base de Activos Fijos'}
            </h3>

            {/* Selector segmentado de modo de búsqueda (compacto) */}
            <div className="afx-seg" role="tablist" aria-label="Modo de búsqueda">
              <button
                type="button"
                role="tab"
                aria-selected={tipoBusqueda === 'articulo'}
                className={`afx-seg__btn${tipoBusqueda === 'articulo' ? ' is-active' : ''}`}
                onClick={() => setTipoBusqueda('articulo')}
                title={tipoBase === 'almacen'
                  ? 'Busca un artículo puntual por su código.'
                  : 'Busca un bien puntual por su placa y muestra su ficha con acciones.'}
              >
                <FaSearch className="afx-seg__icon" />
                Por {tipoBase === 'almacen' ? 'código' : 'placa'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tipoBusqueda === 'factura'}
                className={`afx-seg__btn${tipoBusqueda === 'factura' ? ' is-active' : ''}`}
                onClick={() => setTipoBusqueda('factura')}
                title={tipoBase === 'almacen'
                  ? 'Trae todos los artículos de un movimiento para editarlos en bloque.'
                  : 'Trae todos los bienes de un documento (FC, EA, BJ, TB, TS, SD…) para editarlos en bloque.'}
              >
                <FaFileExcel className="afx-seg__icon" />
                Por {tipoBase === 'almacen' ? 'movimiento' : 'documento'}
              </button>
              {tipoBase === 'almacen' && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tipoBusqueda === 'responsable'}
                  className={`afx-seg__btn${tipoBusqueda === 'responsable' ? ' is-active' : ''}`}
                  onClick={() => setTipoBusqueda('responsable')}
                  title="Busca la munición asignada a una persona por su cédula."
                >
                  <FaSearch className="afx-seg__icon" />
                  Munición por cédula
                </button>
              )}
            </div>

            {/* Ayuda contextual según el modo activo */}
            <p className="afx-seg-hint">
              {tipoBusqueda === 'articulo'
                ? 'Un bien puntual. Muestra su ficha con acciones (histórico, editar, eliminar).'
                : tipoBusqueda === 'responsable'
                  ? 'Munición asignada a una persona por su cédula.'
                  : 'Varios bienes de un mismo documento, para editarlos en bloque.'}
            </p>

            {/* Grupo compuesto: [Tipo Doc ▼] (embebido) + [Número] + [Buscar] */}
            <div className="admin-db-search-input-group">
              {tipoBusqueda === 'factura' && (
                <select
                  className="admin-db-search-select-prefix"
                  value={tipoDocumento}
                  onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
                  title="Tipo de documento"
                >
                  {tipoBase === 'almacen'
                    ? TIPOS_DOCUMENTO_ALMACEN.map((tipo) => (
                        <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                      ))
                    : TIPOS_DOCUMENTO_ACTIVOS.map((tipo) => (
                        <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                      ))
                  }
                </select>
              )}
              <div className="admin-db-input-wrapper">
                <FaSearch className="admin-db-input-icon" />
                <input
                  type="text"
                  className="admin-db-input"
                  placeholder={
                    tipoBusqueda === 'articulo'
                      ? tipoBase === 'almacen'
                        ? 'Código del artículo. Ej: 001226'
                        : 'Placa del bien. Ej: 2022980'
                      : tipoBusqueda === 'responsable'
                        ? 'Cédula del responsable. Ej: 1007436245'
                        : 'Número del documento'
                  }
                  value={codigoBusqueda}
                  onChange={(e) => setCodigoBusqueda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void buscar()
                    }
                  }}
                />
                {codigoBusqueda && (
                  <FaTimes className="admin-db-clear-icon" onClick={limpiar} />
                )}
              </div>
              <button
                type="button"
                className="admin-db-search-btn"
                onClick={() => void buscar()}
                disabled={cargando}
              >
                {cargando ? (
                  <>
                    <span className="spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.5rem' }}></span>
                    Buscando...
                  </>
                ) : (
                  <><FaSearch style={{ marginRight: '0.5rem' }} /> Buscar</>
                )}
              </button>
            </div>
          </div>
          )}

          {/* Resultados de Reportes (solo cuando terminó de cargar, para no
              mostrar el colibrí y la tabla a la vez) */}
          {/* Mientras carga: la tarjeta de resultados muestra el colibrí + % en
              su interior. Al terminar, el colibrí desaparece y se ve la tabla. */}
          {tipoBase === 'reportes' && cargando && (() => {
            const pct = totalRealReporte > 0
              ? Math.min(100, Math.round((bienesCargados / totalRealReporte) * 100))
              : 0
            return (
              <div className="admin-db-results">
                <div className="admin-db-card">
                  <div className="admin-db-card-header">
                    <h3>Resultados del Reporte</h3>
                    <span className="admin-db-badge">{bienesCargados.toLocaleString()} cargados</span>
                  </div>
                  <div className="afx-loader">
                    <Animacion type="colibri" width={200} />
                    <div className="afx-loader__pct">{pct}%</div>
                    <div className="afx-loader__bar">
                      <div className="afx-loader__bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="afx-loader__text">
                      Cargando bienes… {bienesCargados.toLocaleString()}
                      {totalRealReporte > 0 && ` de ${totalRealReporte.toLocaleString()}`}
                    </p>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Resultados de Reportes (solo cuando terminó de cargar) */}
          {tipoBase === 'reportes' && !cargando && bienesReporte.length > 0 && (
            <div className="admin-db-results">
              <div className="admin-db-card">
                <div className="admin-db-card-header">
                  <h3>Resultados del Reporte</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {bienesSeleccionados.size > 0 && (
                      <span className="admin-db-badge" style={{ background: '#ff9800', color: '#fff' }}>
                        {bienesSeleccionados.size} seleccionados
                      </span>
                    )}
                    <span className="admin-db-badge">
                      {bienesReporte.length} bienes cargados
                    </span>
                    <button
                      type="button"
                      className="admin-db-btn-edit"
                      onClick={exportarAExcel}
                      style={{ background: '#28a745', borderColor: '#28a745' }}
                    >
                      <FaFileExcel /> Exportar a Excel
                    </button>
                  </div>
                </div>
                <div className="admin-db-table-wrapper">
                  <table className="admin-db-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={bienesSeleccionados.size === bienesReporte.length && bienesReporte.length > 0}
                            onChange={toggleSeleccionTodos}
                            style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                            title="Seleccionar/Deseleccionar todos"
                          />
                        </th>
                        <th>Placa</th>
                        <th>Descripción</th>
                        <th>Grupo del Bien</th>
                        <th>Valor Compra</th>
                        <th>Depreciación</th>
                        <th>Valor Actual</th>
                        <th>Serial</th>
                        <th>Documento Entrada</th>
                        <th>Nro Compra</th>
                        <th>Proveedor</th>
                        <th>Fecha de Compra</th>
                        <th>Bodega/Servicio</th>
                        <th>Responsable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bienesReporte as BienReporteActivos[])
                        .slice((paginaReporte - 1) * ITEMS_POR_PAGINA_REPORTE, (paginaReporte - 1) * ITEMS_POR_PAGINA_REPORTE + ITEMS_POR_PAGINA_REPORTE)
                        .map((bien) => (
                        <tr 
                          key={bien.matid}
                          style={{ 
                            backgroundColor: bienesSeleccionados.has(bien.matid) ? '#e3f2fd' : 'transparent',
                            cursor: 'pointer'
                          }}
                          onClick={() => toggleSeleccionBien(bien.matid)}
                        >
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={bienesSeleccionados.has(bien.matid)}
                              onChange={() => toggleSeleccionBien(bien.matid)}
                              style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                            />
                          </td>
                          <td>{bien.codigo}</td>
                          <td>{bien.desmat}</td>
                          <td>{bien.grupoBien}</td>
                          <td>${bien.valorcomp.toLocaleString('es-CO')}</td>
                          <td>${bien.depreciacion.toLocaleString('es-CO')}</td>
                          <td>${bien.valorActual.toLocaleString('es-CO')}</td>
                          <td>{bien.serial || 'Sin serial'}</td>
                          <td>{bien.documentoEntrada || '—'}</td>
                          <td>{bien.numeroCompra || '—'}</td>
                          <td>{bien.proveedor || 'Sin proveedor'}</td>
                          <td>{bien.fechaCompra || '—'}</td>
                          <td>{bien.servicio || 'Sin asignar'}</td>
                          <td>
                            {bien.responsable 
                              ? `${bien.responsable} (${bien.cedula})`
                              : 'Sin responsable'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Paginación en cliente (mismo patrón que BJ sin CB) */}
                {(() => {
                  const totalPaginas = Math.ceil(bienesReporte.length / ITEMS_POR_PAGINA_REPORTE)
                  if (totalPaginas <= 1) return null
                  const inicio = (paginaReporte - 1) * ITEMS_POR_PAGINA_REPORTE
                  return (
                    <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid #edf0f4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
                      <span style={{ fontSize: '0.83rem', color: '#6c757d' }}>
                        {inicio + 1}–{Math.min(inicio + ITEMS_POR_PAGINA_REPORTE, bienesReporte.length)} de {bienesReporte.length}
                      </span>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button
                          onClick={() => setPaginaReporte(1)}
                          disabled={paginaReporte === 1}
                          style={{ padding: '0.35rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', background: paginaReporte === 1 ? '#f8f9fa' : '#fff', cursor: paginaReporte === 1 ? 'default' : 'pointer', fontSize: '0.8rem', color: '#495057' }}
                        >
                          «
                        </button>
                        <button
                          onClick={() => setPaginaReporte(p => Math.max(1, p - 1))}
                          disabled={paginaReporte === 1}
                          style={{ padding: '0.35rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', background: paginaReporte === 1 ? '#f8f9fa' : '#fff', cursor: paginaReporte === 1 ? 'default' : 'pointer', fontSize: '0.8rem', color: '#495057' }}
                        >
                          ‹
                        </button>
                        <span style={{ padding: '0.35rem 0.75rem', fontSize: '0.83rem', color: '#303d50', fontWeight: 500 }}>
                          Pág {paginaReporte} / {totalPaginas}
                        </span>
                        <button
                          onClick={() => setPaginaReporte(p => Math.min(totalPaginas, p + 1))}
                          disabled={paginaReporte === totalPaginas}
                          style={{ padding: '0.35rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', background: paginaReporte === totalPaginas ? '#f8f9fa' : '#fff', cursor: paginaReporte === totalPaginas ? 'default' : 'pointer', fontSize: '0.8rem', color: '#495057' }}
                        >
                          ›
                        </button>
                        <button
                          onClick={() => setPaginaReporte(totalPaginas)}
                          disabled={paginaReporte === totalPaginas}
                          style={{ padding: '0.35rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', background: paginaReporte === totalPaginas ? '#f8f9fa' : '#fff', cursor: paginaReporte === totalPaginas ? 'default' : 'pointer', fontSize: '0.8rem', color: '#495057' }}
                        >
                          »
                        </button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Resultados de Depreciación */}
          {/* Mientras consulta: colibrí dentro de la tarjeta de resultados */}
          {tipoBase === 'depreciacion' && cargandoDepreciacion && (
            <div className="admin-db-results">
              <div className="admin-db-card">
                <div className="admin-db-card-header">
                  <h3>Resultados de la Consulta</h3>
                </div>
                <div className="afx-loader">
                  <Animacion type="colibri" width={200} />
                  <p className="afx-loader__text">Consultando valores en libros…</p>
                </div>
              </div>
            </div>
          )}

          {/* Resultados de Depreciación (solo cuando terminó) */}
          {tipoBase === 'depreciacion' && !cargandoDepreciacion && bienesDepreciacion.length > 0 && (
            <div className="admin-db-results">
              <div className="admin-db-card">
                <div className="admin-db-card-header">
                  <h3>Resultados de la Consulta</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="admin-db-badge">{bienesDepreciacion.length} bienes procesados</span>
                    <button
                      type="button"
                      className="admin-db-btn-edit"
                      onClick={exportarDepreciacionAExcel}
                      style={{ background: '#28a745', borderColor: '#28a745' }}
                      disabled={cargandoDepreciacion}
                    >
                      <FaFileExcel /> Exportar a Excel
                    </button>
                  </div>
                </div>
                <div className="admin-db-table-wrapper">
                  <table className="admin-db-table">
                    <thead>
                      <tr>
                        <th>Placa</th>
                        <th>Descripción</th>
                        <th>Serial</th>
                        <th>Grupo del Bien</th>
                        <th>Valor Compra</th>
                        <th>Disminución</th>
                        <th>Depreciación</th>
                        <th>Valor Actual</th>
                        <th>Fecha Compra</th>
                        <th>Responsable</th>
                        <th>Último Doc.</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bienesDepreciacion.map((bien: BienDepreciacion, index) => (
                        <tr key={index} style={{ backgroundColor: bien.encontrado ? 'transparent' : '#fff3cd' }}>
                          <td>{bien.placa}</td>
                          <td>{bien.descripcion || '-'}</td>
                          <td>{bien.serial || 'N/A'}</td>
                          <td>{bien.grupo_bien || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>
                            ${bien.valor_compra.toLocaleString('es-CO')}
                          </td>
                          <td style={{ textAlign: 'right', color: '#ff8c00', fontWeight: 500 }}>
                            ${(bien.disminucion_acumulada || 0).toLocaleString('es-CO')}
                          </td>
                          <td style={{ textAlign: 'right', color: '#d13c47', fontWeight: 500 }}>
                            ${bien.depreciacion_acumulada.toLocaleString('es-CO')}
                          </td>
                          <td style={{ textAlign: 'right', color: '#28a745', fontWeight: 600 }}>
                            ${bien.valor_actual.toLocaleString('es-CO')}
                          </td>
                          <td>{bien.fecha_compra || '-'}</td>
                          <td>
                            {bien.responsable 
                              ? `${bien.responsable} (${bien.cedula})`
                              : '-'}
                          </td>
                          <td>
                            {bien.ultimo_documento 
                              ? (
                                <span style={{ 
                                  fontWeight: 500,
                                  color: bien.ultimo_documento.prefijo === 'SD' ? '#0066cc' : '#28a745'
                                }}>
                                  {bien.ultimo_documento.documento_completo}
                                  <br />
                                  <small style={{ color: '#6c757d' }}>
                                    {bien.ultimo_documento.fecha}
                                  </small>
                                </span>
                              )
                              : <span style={{ color: '#999' }}>Sin doc.</span>
                            }
                          </td>
                          <td>
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.85rem',
                              fontWeight: 500,
                              backgroundColor: bien.encontrado ? '#d4edda' : '#fff3cd',
                              color: bien.encontrado ? '#155724' : '#856404'
                            }}>
                              {bien.encontrado ? 'Encontrado' : 'No encontrado'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', background: '#f8f9fa' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                      <strong style={{ color: '#495057' }}>Total Valor de Compra:</strong>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#303d50' }}>
                        ${bienesDepreciacion.reduce((sum, b) => sum + b.valor_compra, 0).toLocaleString('es-CO')}
                      </div>
                    </div>
                    <div>
                      <strong style={{ color: '#495057' }}>Total Disminución:</strong>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ff8c00' }}>
                        ${bienesDepreciacion.reduce((sum, b) => sum + (b.disminucion_acumulada || 0), 0).toLocaleString('es-CO')}
                      </div>
                    </div>
                    <div>
                      <strong style={{ color: '#495057' }}>Total Depreciación:</strong>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#d13c47' }}>
                        ${bienesDepreciacion.reduce((sum, b) => sum + b.depreciacion_acumulada, 0).toLocaleString('es-CO')}
                      </div>
                    </div>
                    <div>
                      <strong style={{ color: '#495057' }}>Total Valor Actual:</strong>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#28a745' }}>
                        ${bienesDepreciacion.reduce((sum, b) => sum + b.valor_actual, 0).toLocaleString('es-CO')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sección de Consulta Múltiple CB */}
          {tipoBase === 'consulta-cb' && (
            <div className="admin-db-search-section">
              {(() => {
                const cbList = numerosCB
                  .split(/[\n,;\t]+/)
                  .map((c) => c.trim())
                  .filter((c) => c.length > 0)
                const cbUnicos = Array.from(new Set(cbList.map((c) => c.toUpperCase())))
                return (
                  <>
                    <h3 className="afx-module-title">Consulta de CB</h3>
                    <p className="afx-seg-hint" style={{ marginBottom: '1.1rem' }}>
                      Consulte varios <strong>CB (Comprobante de Baja / Confirmación de Salida)</strong> a la vez.
                      Pegue los números y obtendrá la información de los bienes asociados a cada uno.
                    </p>

                    <div className="afx-dep-field">
                      <div className="afx-dep-label-row">
                        <label className="afx-filtro__label" htmlFor={`${uid}-nums-cb`}>Números de CB</label>
                        <span className={`cmb-count ${cbUnicos.length > 0 ? 'ok' : ''}`}>
                          {cbUnicos.length} CB
                        </span>
                      </div>
                      <textarea
                        id={`${uid}-nums-cb`}
                        className="afx-dep-textarea"
                        placeholder={'Pega aquí los números de CB.\nUno por línea o separados por comas.\n\nEj:\n638\n639\n640'}
                        value={numerosCB}
                        onChange={(e) => setNumerosCB(e.target.value)}
                        rows={8}
                      />
                      <small className="afx-dep-help">Se aceptan saltos de línea o comas. Los duplicados se ignoran.</small>
                    </div>

                    <div className="afx-filtros-actions">
                      <button
                        type="button"
                        className="admin-db-btn-cancel"
                        onClick={limpiarCB}
                        disabled={cargandoCB}
                      >
                        Limpiar
                      </button>
                      <button
                        type="button"
                        className="admin-db-search-btn"
                        onClick={() => void buscarMultiplesCB()}
                        disabled={cargandoCB || cbUnicos.length === 0}
                      >
                        {cargandoCB ? (
                          <>
                            <span className="spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.5rem' }}></span>
                            Consultando…
                          </>
                        ) : (
                          <><FaSearch style={{ marginRight: '0.5rem' }} /> Consultar CB</>
                        )}
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}


          {/* Mientras consulta: colibrí dentro de la tarjeta de resultados */}
          {tipoBase === 'consulta-cb' && cargandoCB && (
            <div className="admin-db-results">
              <div className="admin-db-card">
                <div className="admin-db-card-header">
                  <h3>Resultados de Consulta CB</h3>
                </div>
                <div className="afx-loader">
                  <Animacion type="colibri" width={200} />
                  <p className="afx-loader__text">Consultando CB…</p>
                </div>
              </div>
            </div>
          )}

          {/* Resultados de Consulta de CB (solo cuando terminó) */}
          {tipoBase === 'consulta-cb' && !cargandoCB && resultadosCB.length > 0 && (
            <div className="admin-db-results">
              <div className="admin-db-card">
                <div className="admin-db-card-header">
                  <h3>Resultados de Consulta CB</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="admin-db-badge">
                      {resultadosCB.length} {resultadosCB.length === 1 ? 'resultado' : 'resultados'}
                    </span>
                    <button
                      type="button"
                      className="admin-db-btn-edit"
                      onClick={exportarCBAExcel}
                      style={{ background: '#28a745', borderColor: '#28a745' }}
                    >
                      <FaFileExcel /> Exportar a Excel
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="admin-db-table">
                    <thead>
                      <tr>
                        <th>Número CB</th>
                        <th>Placa</th>
                        <th>Descripción</th>
                        <th>Cédula</th>
                        <th>Responsable</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadosCB.map((bien, idx) => (
                        <tr key={idx} style={{ 
                          background: bien.encontrado ? 'transparent' : '#fff3cd',
                          opacity: bien.encontrado ? 1 : 0.7
                        }}>
                          <td style={{ fontWeight: 600 }}>{bien.numero_cb}</td>
                          <td>{bien.placa || '-'}</td>
                          <td>{bien.descripcion || '-'}</td>
                          <td>{bien.cedula || '-'}</td>
                          <td>{bien.responsable || '-'}</td>
                          <td>
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              borderRadius: '12px',
                              fontSize: '0.85rem',
                              fontWeight: 500,
                              background: bien.encontrado ? '#d4edda' : '#fff3cd',
                              color: bien.encontrado ? '#155724' : '#856404'
                            }}>
                              {bien.encontrado ? 'Encontrado' : 'No encontrado'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '1rem', borderTop: '1px solid #dee2e6', background: '#f8f9fa' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <div>
                      <strong style={{ color: '#495057' }}>Total:</strong>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#303d50' }}>
                        {resultadosCB.length}
                      </div>
                    </div>
                    <div>
                      <strong style={{ color: '#495057' }}>Encontrados:</strong>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#28a745' }}>
                        {resultadosCB.filter(r => r.encontrado).length}
                      </div>
                    </div>
                    <div>
                      <strong style={{ color: '#495057' }}>No encontrados:</strong>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#d13c47' }}>
                        {resultadosCB.filter(r => !r.encontrado).length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sección unificada: Bienes con BJ pero sin CB / Historial por año */}
          {tipoBase === 'bj-sin-cb' && (
            <div className="admin-db-search-section">
              <h3 className="afx-module-title">Bienes con BJ pero sin CB</h3>
              <p className="afx-seg-hint" style={{ marginBottom: '1.1rem' }}>
                Consulte las bajas de bienes de dos maneras: los que tienen <strong>Baja (BJ)</strong> pero
                aún no su <strong>Comprobante de Baja (CB)</strong> —pendientes de gestión—, o el
                <strong> historial completo de bajas</strong> por uno o varios años.
              </p>

              {/* Selector de modo de consulta */}
              <div className="afx-seg" role="tablist" aria-label="Modo de consulta">
                <button
                  type="button"
                  role="tab"
                  aria-selected={modoBaja === 'sin-cb'}
                  className={`afx-seg__btn${modoBaja === 'sin-cb' ? ' is-active' : ''}`}
                  onClick={() => setModoBaja('sin-cb')}
                  title="Bienes con BJ registrada pero sin su Comprobante de Baja (CB)."
                >
                  <FaHistory className="afx-seg__icon" />
                  Pendientes de CB
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modoBaja === 'por-anio'}
                  className={`afx-seg__btn${modoBaja === 'por-anio' ? ' is-active' : ''}`}
                  onClick={() => setModoBaja('por-anio')}
                  title="Todas las bajas (con o sin CB) de los años seleccionados."
                >
                  <FaHistory className="afx-seg__icon" />
                  Historial por año
                </button>
              </div>

              {modoBaja === 'sin-cb' ? (
                <>
                  <p className="afx-seg-hint">
                    Bienes con documento BJ registrado y sin CB. Puede filtrar por un número de BJ específico.
                  </p>
                  <div className="afx-filtro" style={{ maxWidth: '320px', marginBottom: '1rem' }}>
                    <label className="afx-filtro__label" htmlFor={`${uid}-bj`}>Número de BJ (opcional)</label>
                    <input
                      id={`${uid}-bj`}
                      type="text"
                      className="admin-db-field-input"
                      placeholder="Ej: 997"
                      value={filtroBJ}
                      onChange={(e) => setFiltroBJ(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void buscarBJSinCB() }}
                    />
                  </div>
                  <div className="afx-filtros-actions">
                    <button type="button" className="admin-db-btn-cancel" onClick={limpiarBJSinCB} disabled={cargandoBJSinCB}>Limpiar</button>
                    <button type="button" className="admin-db-search-btn" onClick={() => void buscarBJSinCB()} disabled={cargandoBJSinCB}>
                      {cargandoBJSinCB ? (
                        <><span className="spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.5rem' }}></span>Consultando…</>
                      ) : (
                        <><FaSearch style={{ marginRight: '0.5rem' }} /> Consultar</>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="afx-seg-hint">
                    Todas las bajas (BJ) de los años seleccionados, tengan o no comprobante (CB).
                  </p>
                  <label className="afx-filtro__label" style={{ display: 'block', marginBottom: '0.5rem' }}>Años a consultar</label>
                  <div className="afx-anios">
                    {(() => {
                      const actual = new Date().getFullYear()
                      const anios: number[] = []
                      for (let a = actual; a >= 2020; a--) anios.push(a)
                      return anios.map((a) => (
                        <button
                          key={a}
                          type="button"
                          className={`afx-anio-chip${aniosBaja.has(a) ? ' is-active' : ''}`}
                          onClick={() => toggleAnioBaja(a)}
                        >
                          {a}
                        </button>
                      ))
                    })()}
                  </div>
                  <div className="afx-filtros-actions" style={{ marginTop: '1rem' }}>
                    <button type="button" className="admin-db-btn-cancel" onClick={limpiarBJSinCB} disabled={cargandoBJSinCB}>Limpiar</button>
                    <button type="button" className="admin-db-search-btn" onClick={() => void buscarBajasPorAnio()} disabled={cargandoBJSinCB || aniosBaja.size === 0}>
                      {cargandoBJSinCB ? (
                        <><span className="spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.5rem' }}></span>Consultando…</>
                      ) : (
                        <><FaSearch style={{ marginRight: '0.5rem' }} /> Consultar</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mientras consulta: colibrí dentro de la tarjeta de resultados */}
          {tipoBase === 'bj-sin-cb' && cargandoBJSinCB && (
            <div className="admin-db-results">
              <div className="admin-db-card">
                <div className="admin-db-card-header">
                  <h3>Resultados</h3>
                </div>
                <div className="afx-loader">
                  <Animacion type="colibri" width={200} />
                  <p className="afx-loader__text">
                    Consultando bajas…{resultadosBJSinCB.length > 0 ? ` ${resultadosBJSinCB.length.toLocaleString()}` : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Resultados unificados (solo cuando terminó) */}
          {tipoBase === 'bj-sin-cb' && !cargandoBJSinCB && resultadosBJSinCB.length > 0 && (
            <div className="admin-db-results">
              <div className="admin-db-card" style={{ borderRadius: '14px', overflow: 'hidden' }}>
                {/* Header de resultados */}
                <div className="admin-db-card-header">
                  <h3>{modoBaja === 'sin-cb' ? 'Bajas pendientes de Comprobante' : 'Historial de bajas'}</h3>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <span className="admin-db-badge">{resultadosBJSinCB.length} bienes</span>
                    <span className="admin-db-badge" style={{ background: 'rgba(214,51,132,0.12)', color: '#d63384' }}>
                      {new Set(resultadosBJSinCB.map(b => b.numero_bj)).size} BJ distintas
                    </span>
                    <button
                      type="button"
                      className="admin-db-btn-edit"
                      onClick={exportarBJSinCBExcel}
                      style={{ background: '#28a745', borderColor: '#28a745' }}
                    >
                      <FaFileExcel /> Exportar a Excel
                    </button>
                  </div>
                </div>

                {/* Filtro de texto sobre resultados */}
                <div style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid #edf0f4', background: '#fafbfc' }}>
                  <div style={{ position: 'relative' }}>
                    <FaSearch style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#adb5bd', fontSize: '0.85rem' }} />
                    <input
                      type="text"
                      placeholder="Buscar por placa, descripción, serial, N° BJ, responsable, cédula..."
                      value={filtroTextoBJSinCB}
                      onChange={(e) => { setFiltroTextoBJSinCB(e.target.value); setPaginaBJSinCB(1) }}
                      style={{ width: '100%', padding: '0.6rem 0.85rem 0.6rem 2.3rem', border: '1px solid #e0e4ea', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', transition: 'border-color 0.2s', background: '#fff' }}
                    />
                  </div>
                  {filtroTextoBJSinCB && (() => {
                    const filtrados = resultadosBJSinCB.filter(b => {
                      const txt = filtroTextoBJSinCB.toLowerCase()
                      return b.placa.toLowerCase().includes(txt)
                        || b.descripcion.toLowerCase().includes(txt)
                        || b.serial.toLowerCase().includes(txt)
                        || String(b.numero_bj).includes(txt)
                        || b.responsable.toLowerCase().includes(txt)
                        || b.cedula.toLowerCase().includes(txt)
                        || b.detalle_bj.toLowerCase().includes(txt)
                    })
                    return (
                      <p style={{ margin: '0.4rem 0 0', color: '#6c757d', fontSize: '0.8rem' }}>
                        Mostrando <strong>{filtrados.length}</strong> de {resultadosBJSinCB.length} resultados
                      </p>
                    )
                  })()}
                </div>

                {/* Tabla */}
                {(() => {
                  const filtrados = resultadosBJSinCB.filter(b => {
                    if (!filtroTextoBJSinCB) return true
                    const txt = filtroTextoBJSinCB.toLowerCase()
                    return b.placa.toLowerCase().includes(txt)
                      || b.descripcion.toLowerCase().includes(txt)
                      || b.serial.toLowerCase().includes(txt)
                      || String(b.numero_bj).includes(txt)
                      || b.responsable.toLowerCase().includes(txt)
                      || b.cedula.toLowerCase().includes(txt)
                      || b.detalle_bj.toLowerCase().includes(txt)
                      || (b.tipo_bj || '').toLowerCase().includes(txt)
                  })
                  const totalPaginas = Math.ceil(filtrados.length / ITEMS_POR_PAGINA_BJ)
                  const inicio = (paginaBJSinCB - 1) * ITEMS_POR_PAGINA_BJ
                  const paginaActual = filtrados.slice(inicio, inicio + ITEMS_POR_PAGINA_BJ)

                  return (
                    <>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="admin-db-table" style={{ fontSize: '0.87rem' }}>
                          <thead>
                            <tr style={{ background: '#f5f6f8' }}>
                              <th style={{ width: '45px', textAlign: 'center', color: '#8a92a6' }}>#</th>
                              <th>Placa</th>
                              <th>Descripción</th>
                              <th>Serial</th>
                              <th style={{ color: '#d63384' }}>N° BJ</th>
                              <th>Fecha BJ</th>
                              <th style={{ color: '#6610f2' }}>Tipo Baja</th>
                              <th>Detalle</th>
                              <th>Responsable</th>
                              <th>Cédula</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginaActual.map((bien, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f0f1f3' }}>
                                <td style={{ textAlign: 'center', color: '#adb5bd', fontSize: '0.8rem', fontWeight: 500 }}>{inicio + idx + 1}</td>
                                <td style={{ fontWeight: 600, whiteSpace: 'nowrap', color: '#303d50' }}>{bien.placa || '-'}</td>
                                <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={bien.descripcion}>{bien.descripcion || '-'}</td>
                                <td style={{ color: '#6c757d' }}>{bien.serial || '-'}</td>
                                <td>
                                  <span style={{ background: '#fce4f0', color: '#d63384', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.83rem' }}>
                                    {bien.numero_bj || '-'}
                                  </span>
                                </td>
                                <td style={{ whiteSpace: 'nowrap', color: '#6c757d', fontSize: '0.83rem' }}>{bien.fecha_bj || '-'}</td>
                                <td>
                                  <span style={{ background: '#ede7f6', color: '#6610f2', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 500, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                    {bien.tipo_bj || '-'}
                                  </span>
                                </td>
                                <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6c757d' }} title={bien.detalle_bj}>{bien.detalle_bj || '-'}</td>
                                <td style={{ fontWeight: 500 }}>{bien.responsable || '-'}</td>
                                <td style={{ color: '#6c757d', fontSize: '0.83rem' }}>{bien.cedula || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Paginación */}
                      {totalPaginas > 1 && (
                        <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid #edf0f4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
                          <span style={{ fontSize: '0.83rem', color: '#6c757d' }}>
                            {inicio + 1}–{Math.min(inicio + ITEMS_POR_PAGINA_BJ, filtrados.length)} de {filtrados.length}
                          </span>
                          <div style={{ display: 'flex', gap: '0.3rem' }}>
                            <button
                              onClick={() => setPaginaBJSinCB(1)}
                              disabled={paginaBJSinCB === 1}
                              style={{ padding: '0.35rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', background: paginaBJSinCB === 1 ? '#f8f9fa' : '#fff', cursor: paginaBJSinCB === 1 ? 'default' : 'pointer', fontSize: '0.8rem', color: '#495057' }}
                            >
                              «
                            </button>
                            <button
                              onClick={() => setPaginaBJSinCB(p => Math.max(1, p - 1))}
                              disabled={paginaBJSinCB === 1}
                              style={{ padding: '0.35rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', background: paginaBJSinCB === 1 ? '#f8f9fa' : '#fff', cursor: paginaBJSinCB === 1 ? 'default' : 'pointer', fontSize: '0.8rem', color: '#495057' }}
                            >
                              ‹
                            </button>
                            <span style={{ padding: '0.35rem 0.75rem', fontSize: '0.83rem', color: '#303d50', fontWeight: 500 }}>
                              Pág {paginaBJSinCB} / {totalPaginas}
                            </span>
                            <button
                              onClick={() => setPaginaBJSinCB(p => Math.min(totalPaginas, p + 1))}
                              disabled={paginaBJSinCB === totalPaginas}
                              style={{ padding: '0.35rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', background: paginaBJSinCB === totalPaginas ? '#f8f9fa' : '#fff', cursor: paginaBJSinCB === totalPaginas ? 'default' : 'pointer', fontSize: '0.8rem', color: '#495057' }}
                            >
                              ›
                            </button>
                            <button
                              onClick={() => setPaginaBJSinCB(totalPaginas)}
                              disabled={paginaBJSinCB === totalPaginas}
                              style={{ padding: '0.35rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', background: paginaBJSinCB === totalPaginas ? '#f8f9fa' : '#fff', cursor: paginaBJSinCB === totalPaginas ? 'default' : 'pointer', fontSize: '0.8rem', color: '#495057' }}
                            >
                              »
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}

                {/* Footer con stats */}
                <div style={{ padding: '1.2rem 1.5rem', borderTop: '1px solid #edf0f4', background: '#fafbfc', display: 'flex', gap: '2rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#303d50' }} />
                    <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>Total bienes:</span>
                    <strong style={{ fontSize: '1.1rem', color: '#303d50' }}>{resultadosBJSinCB.length}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d63384' }} />
                    <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>Documentos BJ:</span>
                    <strong style={{ fontSize: '1.1rem', color: '#d63384' }}>{new Set(resultadosBJSinCB.map(b => b.numero_bj)).size}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Resultados */}
          {tipoBase !== 'reportes' && tipoBase !== 'depreciacion' && tipoBase !== 'consulta-cb' && tipoBase !== 'bj-sin-cb' && hayResultados && (
            <div className="admin-db-results">
              {/* Artículo individual de Almacén */}
              {articuloAlmacen && (
                <div className="admin-db-card">
                  <div className="admin-db-card-header">
                    <h3>Artículo de Almacén</h3>
                    {!modoEdicion && (
                      <button
                        type="button"
                        className="admin-db-btn-edit"
                        onClick={() => setModoEdicion(true)}
                      >
                        <FaEdit /> Editar
                      </button>
                    )}
                  </div>
                  <div className="admin-db-card-body">
                    <div className="admin-db-field">
                      <label>Código:</label>
                      <span>{articuloAlmacen.codigo}</span>
                    </div>
                    <div className="admin-db-field">
                      <label>Costo:</label>
                      <span>${articuloAlmacen.costo.toLocaleString('es-CO')}</span>
                    </div>
                    <div className="admin-db-field">
                      <label>Nombre:</label>
                      {modoEdicion ? (
                        <input
                          type="text"
                          className="admin-db-field-input"
                          value={articuloAlmacen.nombre}
                          onChange={(e) =>
                            setArticuloAlmacen({ ...articuloAlmacen, nombre: e.target.value })
                          }
                        />
                      ) : (
                        <span>{articuloAlmacen.nombre}</span>
                      )}
                    </div>
                    <div className="admin-db-field">
                      <label>Descripción:</label>
                      {modoEdicion ? (
                        <input
                          type="text"
                          className="admin-db-field-input"
                          value={articuloAlmacen.descripcion || ''}
                          onChange={(e) =>
                            setArticuloAlmacen({ ...articuloAlmacen, descripcion: e.target.value })
                          }
                        />
                      ) : (
                        <span>{articuloAlmacen.descripcion}</span>
                      )}
                    </div>
                    <div className="admin-db-field">
                      <label>GRUPMATID:</label>
                      {modoEdicion ? (
                        <select
                          className="admin-db-field-input"
                          value={articuloAlmacen.grupmatid}
                          onChange={(e) =>
                            setArticuloAlmacen({ ...articuloAlmacen, grupmatid: parseInt(e.target.value) || 0 })
                          }
                        >
                          {gruposArticulo.map((grupo) => (
                            <option key={grupo.id} value={grupo.id}>
                              {grupo.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{articuloAlmacen.grupmatid}</span>
                      )}
                    </div>
                    <div className="admin-db-field">
                      <label>Grupo Artículo:</label>
                      <span>{articuloAlmacen.grupoArticulo}</span>
                    </div>
                    <div className="admin-db-field">
                      <label>GCMATID:</label>
                      {modoEdicion ? (
                        <select
                          className="admin-db-field-input"
                          value={articuloAlmacen.gcmatid}
                          onChange={(e) =>
                            setArticuloAlmacen({ ...articuloAlmacen, gcmatid: parseInt(e.target.value) || 0 })
                          }
                        >
                          {gruposContables.map((grupo) => (
                            <option key={grupo.id} value={grupo.id}>
                              {grupo.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{articuloAlmacen.gcmatid}</span>
                      )}
                    </div>
                    <div className="admin-db-field">
                      <label>Grupo Contable:</label>
                      <span>{articuloAlmacen.grupoContable}</span>
                    </div>
                  </div>
                  {modoEdicion && (
                    <div className="admin-db-card-actions">
                      <button
                        type="button"
                        className="admin-db-btn-cancel"
                        onClick={cancelarEdicion}
                      >
                        <FaTimes /> Cancelar
                      </button>
                      <button
                        type="button"
                        className="admin-db-btn-save"
                        onClick={guardarCambios}
                      >
                        <FaSave /> Guardar Cambios
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Bien individual de Activos Fijos — tarjeta estilo Consulta Bienes */}
              {bienActivo && (
                <div className="afx-card">
                  {/* Cabecera: placa + acciones */}
                  <div className="afx-card__header">
                    <div className="afx-card__header-left">
                      <FaBox className="afx-card__header-icon" />
                      <span className="afx-card__placa">{bienActivo.codigo}</span>
                      {modoEdicion && <span className="afx-card__estado">Editando</span>}
                    </div>
                    {!modoEdicion && (
                      <div className="afx-card__actions">
                        <button
                          type="button"
                          className="afx-action afx-action--history"
                          onClick={async () => {
                            setCargandoHistorial(true)
                            setMostrarHistorial(true)
                            setHistorialBien([])
                            try {
                              const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')
                              const res = await fetch(`${API_URL}/almacen/admin/historial-bien/?placa=${bienActivo.codigo}`)
                              if (res.ok) {
                                const data = await res.json()
                                setHistorialBien(data.data || [])
                              }
                            } catch { /* silenciar */ }
                            setCargandoHistorial(false)
                          }}
                          title="Ver el histórico de movimientos de este bien"
                        >
                          <FaHistory /> Histórico
                        </button>
                        <button
                          type="button"
                          className="afx-action afx-action--edit"
                          onClick={() => setModoEdicion(true)}
                          title="Editar los datos de este bien"
                        >
                          <FaEdit /> Editar
                        </button>
                        <button
                          type="button"
                          className="afx-action afx-action--delete"
                          onClick={() => solicitarEliminar(bienActivo.codigo)}
                          title="Eliminar este bien de la base"
                        >
                          <FaTrash /> Eliminar
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Cuerpo */}
                  <div className="afx-card__body">
                    {/* Nombre destacado + valor */}
                    <div className="afx-card__desc">
                      {modoEdicion ? (
                        <input type="text" className="admin-db-field-input" value={bienActivo.desmat}
                          onChange={(e) => setBienActivo({ ...bienActivo, desmat: e.target.value })} />
                      ) : (
                        <>
                          <span className="afx-card__desc-text">{bienActivo.desmat || 'Sin nombre'}</span>
                          <span className="afx-card__valor">${bienActivo.valorcomp.toLocaleString('es-CO')}</span>
                        </>
                      )}
                    </div>

                    <div className="afx-card__grid">
                      {/* Descripción */}
                      <div className="afx-card__field afx-card__field--wide">
                        <FaAlignLeft className="afx-card__field-icon" />
                        <div className="afx-card__field-content">
                          <span className="afx-card__field-label">Descripción</span>
                          {modoEdicion ? (
                            <input type="text" className="admin-db-field-input" value={bienActivo.descrip || ''}
                              onChange={(e) => setBienActivo({ ...bienActivo, descrip: e.target.value })} />
                          ) : (
                            <span className="afx-card__field-value">{bienActivo.descrip || '—'}</span>
                          )}
                        </div>
                      </div>

                      {/* Serial */}
                      <div className="afx-card__field">
                        <FaBarcode className="afx-card__field-icon" />
                        <div className="afx-card__field-content">
                          <span className="afx-card__field-label">Serial</span>
                          {modoEdicion ? (
                            <input type="text" className="admin-db-field-input" value={bienActivo.serial ?? ''} maxLength={80} placeholder="Sin serial"
                              onChange={(e) => setBienActivo({ ...bienActivo, serial: e.target.value })} />
                          ) : (
                            <span className="afx-card__field-value">{bienActivo.serial || 'Sin serial'}</span>
                          )}
                        </div>
                      </div>

                      {/* Serial 2 */}
                      <div className="afx-card__field">
                        <FaBarcode className="afx-card__field-icon" />
                        <div className="afx-card__field-content">
                          <span className="afx-card__field-label">Serial 2</span>
                          {modoEdicion ? (
                            <input type="text" className="admin-db-field-input" value={bienActivo.serial2 ?? ''} maxLength={20} placeholder="Sin segundo serial"
                              onChange={(e) => setBienActivo({ ...bienActivo, serial2: e.target.value })} />
                          ) : (
                            <span className="afx-card__field-value">{bienActivo.serial2 || 'Sin segundo serial'}</span>
                          )}
                        </div>
                      </div>

                      {/* Responsable */}
                      <div className="afx-card__field afx-card__field--wide">
                        <FaUser className="afx-card__field-icon" />
                        <div className="afx-card__field-content">
                          <span className="afx-card__field-label">Responsable</span>
                          <span className="afx-card__field-value">
                            {bienActivo.responsable
                              ? `${bienActivo.responsable} (${bienActivo.cedulaResponsable})`
                              : 'Sin responsable asignado'}
                          </span>
                        </div>
                      </div>

                      {/* Dependencia */}
                      <div className="afx-card__field afx-card__field--wide">
                        <FaBuilding className="afx-card__field-icon" />
                        <div className="afx-card__field-content">
                          <span className="afx-card__field-label">Dependencia</span>
                          {modoEdicion ? (
                            <SelectorDependencia
                              dependencias={servicios}
                              valor={bienActivo.servicioId ?? null}
                              onSeleccionar={(id) => setBienActivo({ ...bienActivo, servicioId: id })}
                              placeholder="Buscar dependencia (código o nombre)…"
                            />
                          ) : (
                            <span className="afx-card__field-value">{bienActivo.dependencia || 'Sin dependencia'}</span>
                          )}
                        </div>
                      </div>

                      {/* Grupo del bien */}
                      <div className="afx-card__field">
                        <FaTag className="afx-card__field-icon" />
                        <div className="afx-card__field-content">
                          <span className="afx-card__field-label">Grupo del bien</span>
                          {modoEdicion ? (
                            <select className="admin-db-field-input" value={bienActivo.grupmatid}
                              onChange={(e) => setBienActivo({ ...bienActivo, grupmatid: parseInt(e.target.value) || 0 })}>
                              {gruposBien.map((grupo) => (
                                <option key={grupo.id} value={grupo.id}>{grupo.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="afx-card__field-value">{bienActivo.grupoArticulo || bienActivo.grupoBien}</span>
                          )}
                        </div>
                      </div>

                      {/* Grupo contable */}
                      <div className="afx-card__field afx-card__field--wide">
                        <FaLayerGroup className="afx-card__field-icon" />
                        <div className="afx-card__field-content">
                          <span className="afx-card__field-label">Grupo contable</span>
                          {modoEdicion ? (
                            <select className="admin-db-field-input" value={bienActivo.gcmatid || 0}
                              onChange={(e) => setBienActivo({ ...bienActivo, gcmatid: parseInt(e.target.value) || 0 })}>
                              {gruposContablesActivos.map((grupo) => (
                                <option key={grupo.id} value={grupo.id}>{grupo.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="afx-card__field-value">{bienActivo.grupoContable || 'Sin grupo contable'}</span>
                          )}
                        </div>
                      </div>

                      {/* Valor (solo en edición, para no duplicar el del encabezado) */}
                      {modoEdicion && (
                        <div className="afx-card__field">
                          <FaMoneyBillWave className="afx-card__field-icon" />
                          <div className="afx-card__field-content">
                            <span className="afx-card__field-label">Valor de compra</span>
                            <span className="afx-card__field-value">${bienActivo.valorcomp.toLocaleString('es-CO')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {modoEdicion && (
                    <div className="admin-db-card-actions">
                      <button
                        type="button"
                        className="admin-db-btn-cancel"
                        onClick={cancelarEdicion}
                      >
                        <FaTimes /> Cancelar
                      </button>
                      <button
                        type="button"
                        className="admin-db-btn-save"
                        onClick={guardarCambios}
                      >
                        <FaSave /> Guardar Cambios
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Lista de artículos de factura */}
              {articulosFactura.length > 0 && (
                <div className="admin-db-card">
                  <div className="admin-db-card-header">
                    <h3>Artículos de la Factura {codigoBusqueda}</h3>
                    <span className="admin-db-badge">{articulosFactura.length} artículos</span>
                  </div>
                  <div className="admin-db-info-documentos" style={{ marginBottom: '20px' }}>
                    {articulosFactura.length > 0 && articulosFactura[0].documentoCompleto && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '15px' }}>
                        <div>
                          <strong>Documento:</strong> {articulosFactura[0].documentoCompleto}
                        </div>
                        {articulosFactura[0].fecha && (
                          <div>
                            <strong>Fecha:</strong> {articulosFactura[0].fecha}
                          </div>
                        )}
                        {articulosFactura[0].observaciones && (
                          <div>
                            <strong>Observaciones:</strong> {articulosFactura[0].observaciones}
                          </div>
                        )}
                        {articulosFactura[0].proveedor && (
                          <div>
                            <strong>Proveedor:</strong> {articulosFactura[0].proveedor}
                          </div>
                        )}
                        {articulosFactura[0].usuario && (
                          <div>
                            <strong>Usuario:</strong> {articulosFactura[0].usuario}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="admin-db-table-wrapper">
                    <table className="admin-db-table">
                      <thead>
                        <tr>
                          <th>Documento</th>
                          <th>Código</th>
                          <th>Nombre</th>
                          <th>Descripción</th>
                          <th>Tipo</th>
                          <th>Cantidad</th>
                          <th>Fecha</th>
                          <th>Bodega</th>
                          <th>Responsable</th>
                          <th>Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {articulosFactura.map((art, index) => (
                          <tr key={`${art.matid}-${index}`}>
                            <td><strong>{art.documentoCompleto || 'N/A'}</strong></td>
                            <td>{art.codigo}</td>
                            <td>{art.nombre}</td>
                            <td>{art.descripcion}</td>
                            <td>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                backgroundColor: 
                                  art.tipoMovimiento === 'RECIBE' ? '#d4edda' : 
                                  art.tipoMovimiento === 'ENTREGA' ? '#f8d7da' : 
                                  art.tipoMovimiento === 'ENTRADA' ? '#d1ecf1' : 
                                  art.tipoMovimiento === 'SALIDA' ? '#fff3cd' : 
                                  '#e2e3e5',
                                color: 
                                  art.tipoMovimiento === 'RECIBE' ? '#155724' : 
                                  art.tipoMovimiento === 'ENTREGA' ? '#721c24' : 
                                  art.tipoMovimiento === 'ENTRADA' ? '#0c5460' : 
                                  art.tipoMovimiento === 'SALIDA' ? '#856404' : 
                                  '#383d41'
                              }}>
                                {art.tipoMovimiento || 'N/A'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>{art.cantidad?.toLocaleString('es-CO')}</td>
                            <td>{art.fecha || 'N/A'}</td>
                            <td>{art.bodega || 'N/A'}</td>
                            <td>{art.responsable || 'N/A'}</td>
                            <td style={{ textAlign: 'right' }}>${art.costo?.toLocaleString('es-CO')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Lista de bienes de factura - TABLA EDITABLE */}
              {bienesFactura.length > 0 && (
                <TablaEditableBienes
                  bienes={bienesFactura}
                  gruposBien={gruposBien}
                  onGuardarCambios={manejarGuardadoMasivo}
                  onPrefijoActualizado={() => {
                    // Recargar los bienes después de actualizar el prefijo
                    toast.success('Prefijo actualizado correctamente')
                    buscar()
                  }}
                  onResponsableActualizado={() => {
                    toast.success('Responsable del documento actualizado correctamente')
                    buscar()
                  }}
                  encabezado={encabezadoDocumento}
                  tipoDocumento={tipoDocumento}
                  numeroDocumento={codigoBusqueda}
                />
              )}
            </div>
          )}
          </div>
        </main>

        {/* ── Panel Derecho: ACCIONES MASIVAS (solo en Reporte de bienes) ── */}
        {tipoBase === 'reportes' && (
          <div className={`consulta-lateral consulta-lateral--der afx-masivo-der${panelMasivoAbierto ? '' : ' is-collapsed'}`}>
            {!panelMasivoAbierto && (
              <div className="consulta-lateral__tab-vertical" onClick={() => setPanelMasivoAbierto(true)} role="button" tabIndex={0} aria-label="Abrir acciones masivas" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPanelMasivoAbierto(true) }}>
                <span className="consulta-lateral__tab-icon"><FaWarehouse size={13} /></span>
                <span className="consulta-lateral__tab-text">Acciones</span>
              </div>
            )}
            <div className="consulta-lateral__panel" style={panelMasivoAbierto ? undefined : { position: 'fixed', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
              <div className="consulta-lateral__panel-header">
                <div className="consulta-lateral__panel-header-left">
                  <span className="consulta-lateral__panel-header-icon"><FaWarehouse size={13} /></span>
                  <h2 className="consulta-lateral__panel-header-title">Acciones masivas</h2>
                </div>
                <button type="button" className="consulta-lateral__collapse-btn" onClick={() => setPanelMasivoAbierto(false)} aria-label="Colapsar panel">
                  <FaAngleLeft size={12} style={{ transform: 'rotate(180deg)' }} />
                </button>
              </div>

              <div className="consulta-lateral__panel-body afx-masivo-body">
                {/* Selector de herramienta */}
                <div className="afx-masivo-tools">
                  <button
                    type="button"
                    className={`afx-masivo-tool${mostrarModalCambioBodega ? ' is-active' : ''}`}
                    onClick={abrirModalCambioBodega}
                  >
                    <FaWarehouse />
                    <span>Cambio de bodega</span>
                  </button>
                  <button
                    type="button"
                    className={`afx-masivo-tool${mostrarModalCambioUbicacion ? ' is-active' : ''}`}
                    onClick={abrirModalCambioUbicacion}
                  >
                    <FaMapMarkerAlt />
                    <span>Cambio de ubicación</span>
                  </button>
                </div>

                {!mostrarModalCambioBodega && !mostrarModalCambioUbicacion && (
                  <p className="afx-masivo-hint">
                    Elija una herramienta. Puede aplicar el cambio a una lista de placas pegadas
                    o a los bienes que marque en la tabla de resultados.
                  </p>
                )}

                {/* Contenido de la herramienta activa */}
                {mostrarModalCambioBodega && renderHerramientaBodega()}
                {mostrarModalCambioUbicacion && renderHerramientaUbicacion()}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
