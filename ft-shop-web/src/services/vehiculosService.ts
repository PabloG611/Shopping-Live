/**
 * Servicio para el módulo de Inventario de Vehículos.
 * Consume endpoints de almacen/vehiculos/* del backend.
 */

import { getApiHeaders } from '../utils/apiHeaders'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface Vehiculo {
  matid: string
  placa: string
  descripcion: string
  serial: string
  responsable_nombre: string
  responsable_cedula: string
  servicio_codigo: string
  servicio_nombre: string
  /** Dependencia del bien (= servicio en vehículos). Lo trae listar_vehiculos. */
  dependencia?: string
  /** Ubicación física (CODUBICA - NOMUBICA). Lo trae listar_vehiculos. */
  ubicacion?: string
}

export interface FotoCaptura {
  tipo_foto: TipoFoto
  imagen_base64: string
  nombre_archivo?: string
}

export type TipoFoto = 'frente' | 'costado_izq' | 'costado_der' | 'trasera' | 'tablero' | 'interior' | 'danos' | 'danos_2'

export type EstadoItem = 'si' | 'no' | 'na'
export type EstadoCondicion = 'bueno' | 'regular' | 'malo' | 'na'

export interface ChecklistVehiculo {
  [key: string]: string
}

export interface DocumentosVehiculo {
  tiene_soat: boolean
  tiene_tecnicomecanica: boolean
  tiene_tarjeta_propiedad: boolean
  tiene_extintor: boolean
  tiene_botiquin: boolean
  tiene_kit_herramientas: boolean
  tiene_kit_carretera: boolean
  tiene_gato: boolean
  tiene_triangulos: boolean
  tiene_chaleco: boolean
}

export interface RegistroInventarioPayload {
  matid: string
  placa_vehiculo: string
  placa_inventario?: string
  descripcion?: string
  responsable_nombre?: string
  responsable_cedula?: string
  regional?: string
  ubicacion?: string
  checklist: ChecklistVehiculo
  documentos: DocumentosVehiculo
  kilometraje?: number | string | null
  observaciones?: string
  estado_general: 'bueno' | 'regular' | 'malo'
  realizado_por_nombre?: string
  realizado_por_cedula?: string
  fotos: FotoCaptura[]
  datos_formato?: Record<string, unknown> | null
}

export interface InventarioResumen {
  id_inventario: string
  placa_vehiculo: string
  placa_inventario: string
  descripcion: string
  responsable_nombre: string
  responsable_cedula: string
  regional: string
  servicio_codigo?: string  // código del servicio (3000-GURPVILLA, etc.) para SharePoint
  estado_general: string
  kilometraje: number | null
  fecha_inventario: string
  realizado_por_nombre: string
  fotos_count: number
}

export interface FotoDetalle {
  id_foto: string
  tipo_foto: TipoFoto
  nombre_archivo: string
  sharepoint_url: string
  tiene_imagen: boolean
  fecha_captura: string
}

export interface InventarioDetalle {
  id_inventario: string
  matid: string
  placa_vehiculo: string
  placa_inventario: string
  descripcion: string
  responsable_nombre: string
  responsable_cedula: string
  regional: string
  ubicacion: string
  checklist: ChecklistVehiculo
  documentos: DocumentosVehiculo
  kilometraje: number | null
  observaciones: string
  estado_general: string
  realizado_por_nombre: string
  realizado_por_cedula: string
  fecha_inventario: string
  fecha_ultima_edicion?: string
  datos_formato?: EditarInventarioPayload['datos_formato'] | null
  fotos: FotoDetalle[]
}


// ─── CONSTANTES ───────────────────────────────────────────────────────────────

export const TIPOS_FOTO: { key: TipoFoto; label: string }[] = [
  { key: 'frente', label: 'Frente' },
  { key: 'costado_izq', label: 'Costado Izquierdo' },
  { key: 'costado_der', label: 'Costado Derecho' },
  { key: 'trasera', label: 'Trasera' },
  { key: 'tablero', label: 'Tablero' },
  { key: 'interior', label: 'Interior' },
  { key: 'danos', label: 'Daños 1' },
  { key: 'danos_2', label: 'Daños 2' },
]

export const CHECKLIST_SECCIONES = [
  {
    titulo: 'Luces y Exterior',
    items: [
      { key: 'luces_reversa', label: 'Luces Reversa' },
      { key: 'luces_stop', label: 'Luces Stop' },
      { key: 'luces_parqueo', label: 'Luces de Parqueo' },
      { key: 'direccionales', label: 'Direccionales' },
      { key: 'exploradoras', label: 'Exploradoras' },
      { key: 'cocuyos_techo', label: 'Cocuyos Techo' },
      { key: 'strobers', label: 'Strobers' },
      { key: 'limpiaparabrisas', label: 'Limpiaparabrisas' },
      { key: 'espejos_externos', label: 'Espejos Externos' },
      { key: 'parrilla_techo', label: 'Parrilla Techo' },
      { key: 'rines', label: 'Rines' },
      { key: 'llantas', label: 'Llantas' },
    ],
  },
  {
    titulo: 'Carrocería y Motor',
    items: [
      { key: 'boceles', label: 'Boceles' },
      { key: 'puertas', label: 'Puertas' },
      { key: 'estribos', label: 'Estribos' },
      { key: 'vidrios', label: 'Vidrios' },
      { key: 'varilla_blindaje', label: 'Varilla Blindaje' },
      { key: 'bateria', label: 'Batería' },
      { key: 'varilla_medicion_aceite', label: 'Varilla Medición Aceite' },
      { key: 'gancho_remolque', label: 'Gancho y/o Remolque' },
      { key: 'wincher', label: 'Wincher' },
      { key: 'emblemas_letreros', label: 'Emblemas y Letreros' },
      { key: 'antena_radio', label: 'Antena Radio' },
      { key: 'elevacion_vidrios_electrico', label: 'Elevación de Vidrios Eléctrico' },
    ],
  },
  {
    titulo: 'Interior y Electrónico',
    items: [
      { key: 'bloqueo_central', label: 'Bloqueo Central' },
      { key: 'manijas', label: 'Manijas' },
      { key: 'sirena', label: 'Sirena' },
      { key: 'altavoz_modulo', label: 'Altavoz y Módulo' },
      { key: 'alarma', label: 'Alarma' },
      { key: 'radio', label: 'Radio' },
      { key: 'tapetes', label: 'Tapetes' },
      { key: 'parasoles', label: 'Parasoles' },
      { key: 'manuales', label: 'Manuales' },
      { key: 'llaves_switch_puertas', label: 'Llaves: Switch/Puertas' },
      { key: 'cruceta_llave_pernos', label: 'Cruceta o Llave Pernos' },
      { key: 'sillas', label: 'Sillas' },
    ],
  },
  {
    titulo: 'Seguridad y Accesorios',
    items: [
      { key: 'cinturones_seguridad', label: 'Cinturones de Seguridad' },
      { key: 'descansa_cabezas', label: 'Descansa Cabezas' },
      { key: 'descansabrazos_puertas', label: 'Descansabrazos Puertas' },
      { key: 'cojineria', label: 'Cojinería', tieneEstado: true },
      { key: 'tapizado', label: 'Tapizado', tieneEstado: true },
      { key: 'persiana_baul', label: 'Persiana Baúl' },
      { key: 'gato_palancas', label: 'Gato y Palancas' },
      { key: 'llanta_repuesto', label: 'Llanta de Repuesto' },
      { key: 'herramientas', label: 'Herramientas' },
      { key: 'extintor', label: 'Extintor' },
      { key: 'equipo_carretera', label: 'Equipo Carretera' },
    ],
  },
] as const

export const CHECKLIST_MOTO_SECCIONES = [
  {
    titulo: 'Eléctrico y Óptico',
    items: [
      { key: 'unidades_selladas', label: 'Unidades Selladas' },
      { key: 'luces', label: 'Luces' },
      { key: 'frenos', label: 'Frenos' },
      { key: 'pito', label: 'Pito' },
      { key: 'telescopicos', label: 'Telescópicos' },
      { key: 'bateria_moto', label: 'Batería' },
      { key: 'encendido', label: 'Encendido' },
      { key: 'espejos', label: 'Espejos' },
      { key: 'parrilla', label: 'Parrilla' },
    ],
  },
  {
    titulo: 'Carrocería y Protección',
    items: [
      { key: 'vidrio_protector', label: 'Vidrio Protector' },
      { key: 'descansa_pies', label: 'Descansa Pies' },
      { key: 'cocuyos', label: 'Cocuyos' },
      { key: 'stop', label: 'Stop' },
      { key: 'carenaje', label: 'Carenaje' },
      { key: 'maletero', label: 'Maletero' },
      { key: 'llantas_moto', label: 'Llantas' },
      { key: 'rines_moto', label: 'Rines' },
      { key: 'manillar_freno', label: 'Manillar Freno' },
    ],
  },
  {
    titulo: 'Señalización y Accesorios',
    items: [
      { key: 'amortiguadores', label: 'Amortiguadores' },
      { key: 'placa_moto', label: 'Placa' },
      { key: 'direccionales_moto', label: 'Direccionales' },
      { key: 'emblemas_letreros_moto', label: 'Emblemas y Letreros' },
      { key: 'llaves_moto', label: 'Llaves' },
      { key: 'silla_moto', label: 'Silla' },
      { key: 'sirena_moto', label: 'Sirena' },
      { key: 'strobers_moto', label: 'Strobers' },
      { key: 'manillar_embrague', label: 'Manillar Embrague' },
    ],
  },
  {
    titulo: 'Estructura y Transmisión',
    items: [
      { key: 'apoya_pies', label: 'Apoya Pies' },
      { key: 'tanque_gasolina', label: 'Tanque Gasolina' },
      { key: 'pata_gato_lateral', label: 'Pata o Gato de Apoyo Lateral' },
      { key: 'tubo_escape', label: 'Tubo Escape' },
      { key: 'soporte_principal', label: 'Soporte Principal' },
      { key: 'guardabarros', label: 'Guardabarros' },
      { key: 'selector_cambios', label: 'Selector de Cambios' },
      { key: 'kit_arrastre', label: 'Kit de Arrastre' },
      { key: 'llanta_delantera', label: 'Llanta Delantera' },
      { key: 'llanta_trasera', label: 'Llanta Trasera' },
    ],
  },
] as const


/** Detecta si una placa es de moto o de carro */
export function esMoto(placa: string): boolean {
  if (!placa) return false
  const placaLimpia = placa.trim().toUpperCase()
  // Motos: terminan en 2 dígitos + letra (12A) o solo 2 dígitos (12)
  // Carros: terminan en 3 dígitos (123)
  const ultimosTres = placaLimpia.slice(-3)
  // Si los últimos 3 son todos dígitos → carro
  if (/^\d{3}$/.test(ultimosTres)) return false
  // Si termina en 2 dígitos + letra → moto
  if (/\d{2}[A-Z]$/.test(placaLimpia)) return true
  // Si termina en solo 2 dígitos (placa corta de moto vieja)
  if (/^[A-Z]{3}\d{2}$/.test(placaLimpia)) return true
  // Default: asumir carro
  return false
}

export const DOCUMENTOS_ITEMS: { key: keyof DocumentosVehiculo; label: string }[] = [
  { key: 'tiene_soat', label: 'SOAT' },
  { key: 'tiene_tecnicomecanica', label: 'Técnico-Mecánica' },
  { key: 'tiene_tarjeta_propiedad', label: 'Tarjeta de Propiedad' },
  { key: 'tiene_extintor', label: 'Extintor' },
  { key: 'tiene_botiquin', label: 'Botiquín' },
  { key: 'tiene_kit_herramientas', label: 'Kit de Herramientas' },
  { key: 'tiene_kit_carretera', label: 'Kit de Carretera' },
  { key: 'tiene_gato', label: 'Gato Hidráulico' },
  { key: 'tiene_triangulos', label: 'Triángulos Reflectivos' },
  { key: 'tiene_chaleco', label: 'Chaleco Reflectivo' },
]


// ─── FUNCIONES ────────────────────────────────────────────────────────────────

/** Listar vehículos de un servicio/regional o buscar por placa */
export async function listarVehiculos(params?: { servicio?: string; buscar?: string; ubicacion_id?: number | string }): Promise<{ vehiculos: Vehiculo[]; total: number }> {
  try {
    const queryParams = new URLSearchParams()
    if (params?.servicio) queryParams.set('servicio', params.servicio)
    if (params?.buscar) queryParams.set('buscar', params.buscar)
    if (params?.ubicacion_id) queryParams.set('ubicacion_id', String(params.ubicacion_id))
    const qs = queryParams.toString() ? `?${queryParams.toString()}` : ''

    const res = await fetch(`${API_URL}/almacen/vehiculos/listar/${qs}`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return { vehiculos: [], total: 0 }
    const json = await res.json()
    return { vehiculos: json.vehiculos ?? [], total: json.total ?? 0 }
  } catch {
    return { vehiculos: [], total: 0 }
  }
}

/** Un grupo/servicio coincidente con vehículos (para el autocompletado) */
export interface ServicioVehiculo {
  codigo: string
  nombre: string
  total: number
}

/** Buscar GRUPOS/SERVICIOS que tengan vehículos y coincidan con el texto */
export async function buscarServiciosVehiculos(buscar: string): Promise<ServicioVehiculo[]> {
  try {
    const qs = `?buscar=${encodeURIComponent(buscar)}`
    const res = await fetch(`${API_URL}/almacen/vehiculos/buscar-servicios/${qs}`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.servicios ?? []
  } catch {
    return []
  }
}

/** Registrar un inventario vehicular completo */
export async function registrarInventarioVehiculo(payload: RegistroInventarioPayload): Promise<{ ok: boolean; mensaje?: string; id_inventario?: string }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/registrar-inventario/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (res.ok && json.ok) return { ok: true, mensaje: json.mensaje, id_inventario: json.id_inventario }
    return { ok: false, mensaje: json.mensaje ?? 'Error registrando inventario' }
  } catch {
    return { ok: false, mensaje: 'No se pudo conectar con el servidor.' }
  }
}

/** Listar inventarios vehiculares realizados */
export async function listarInventariosVehiculos(params?: { regional?: string; placa?: string; soloMios?: string }): Promise<{ inventarios: InventarioResumen[]; total: number }> {
  try {
    const queryParams = new URLSearchParams()
    if (params?.regional) queryParams.set('regional', params.regional)
    if (params?.placa) queryParams.set('placa', params.placa)
    if (params?.soloMios) queryParams.set('solo_mios', params.soloMios)
    const qs = queryParams.toString() ? `?${queryParams.toString()}` : ''

    const res = await fetch(`${API_URL}/almacen/vehiculos/listar-inventarios/${qs}`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return { inventarios: [], total: 0 }
    return await res.json()
  } catch {
    return { inventarios: [], total: 0 }
  }
}

/** Obtener solo las placas que ya tienen inventario registrado (endpoint ligero) */
export async function obtenerPlacasInventariadas(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/placas-inventariadas/`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.placas ?? []
  } catch {
    return []
  }
}

/** Resumen de vehículos para el dashboard (total vs inventariados) */
export interface ResumenVehiculosDashboard {
  total_vehiculos: number
  inventariados: number
  pendientes: number
  porcentaje: number
}

export async function obtenerResumenVehiculosDashboard(): Promise<ResumenVehiculosDashboard> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/resumen-dashboard/`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return { total_vehiculos: 0, inventariados: 0, pendientes: 0, porcentaje: 0 }
    return await res.json()
  } catch {
    return { total_vehiculos: 0, inventariados: 0, pendientes: 0, porcentaje: 0 }
  }
}

/** Detalle de vehículos para el dashboard (desglose por grupo contable) */
export interface VehiculoDashboardDetalle {
  placa: string
  descripcion: string
  grupo: string
  regional: string
  cod_servicio: string
  ubicacion: string
  responsable: string
  responsable_cedula: string
  inventariado: boolean
}

export interface DetalleVehiculosDashboard {
  vehiculos: VehiculoDashboardDetalle[]
  total: number
  grupos: Record<string, number>
}

export async function obtenerDetalleVehiculosDashboard(): Promise<DetalleVehiculosDashboard> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/detalle-dashboard/`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return { vehiculos: [], total: 0, grupos: {} }
    return await res.json()
  } catch {
    return { vehiculos: [], total: 0, grupos: {} }
  }
}

/** Obtener detalle completo de un inventario */
export async function detalleInventarioVehiculo(id: string): Promise<{ ok: boolean; inventario?: InventarioDetalle }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/detalle-inventario/${id}/`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return { ok: false }
    const json = await res.json()
    return { ok: true, inventario: json.inventario }
  } catch {
    return { ok: false }
  }
}

/** Obtener foto base64 de un inventario */
export async function obtenerFotoVehiculo(fotoId: string): Promise<{ ok: boolean; imagen_base64?: string }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/foto/${fotoId}/`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return { ok: false }
    const json = await res.json()
    return { ok: true, imagen_base64: json.foto?.imagen_base64 }
  } catch {
    return { ok: false }
  }
}

/** Eliminar un inventario vehicular */
export async function eliminarInventarioVehiculo(id: string): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/eliminar-inventario/${id}/`, {
      method: 'DELETE',
      headers: getApiHeaders(),
    })
    const json = await res.json()
    return { ok: json.ok, mensaje: json.mensaje }
  } catch {
    return { ok: false, mensaje: 'Error de conexión.' }
  }
}

/** Payload para editar un inventario vehicular */
export interface EditarInventarioPayload {
  kilometraje?: number | null
  observaciones?: string
  estado_general?: 'bueno' | 'regular' | 'malo'
  regional?: string
  realizado_por_nombre?: string
  realizado_por_cedula?: string
  datos_formato: {
    ciudad: string
    presenta: { nombre: string; cedula: string; cargo: string; grupo: string; telefono: string }
    elabora: { nombre: string; cedula: string; cargo: string; dependencia: string; grupo: string }
    idVehiculo: {
      blindado: string; modelo: string; color: string; combustible: string
      licencia: string; linea: string; cilindraje: string; motor: string
      soat: string; fechaSoat: string; rtm: string; fechaRtm: string
      marca: string; n_serie: string
    }
    checklist: ChecklistVehiculo
  }
}

/** Editar un inventario vehicular existente (PUT) */
export async function editarInventarioVehiculo(id: string, payload: EditarInventarioPayload): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/editar-inventario/${id}/`, {
      method: 'PUT',
      headers: getApiHeaders(),
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, mensaje: json.mensaje || json.error || `Error ${res.status}` }
    }
    return { ok: json.ok ?? true, mensaje: json.mensaje }
  } catch {
    return { ok: false, mensaje: 'Error de conexión al servidor.' }
  }
}


// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Checklist inicial con todos los valores en 'si' (tiene) */
export function crearChecklistInicial(): ChecklistVehiculo {
  const checklist: ChecklistVehiculo = {}
  // Inicializar items de vehículos
  for (const seccion of CHECKLIST_SECCIONES) {
    for (const item of seccion.items) {
      checklist[item.key] = 'tieneEstado' in item && item.tieneEstado ? 'bueno' : 'si'
    }
  }
  // Inicializar items de motos (para que también queden en 'si' por defecto)
  for (const seccion of CHECKLIST_MOTO_SECCIONES) {
    for (const item of seccion.items) {
      checklist[item.key] = 'si'
    }
  }
  return checklist
}

/** Documentos/accesorios iniciales (todos en false) */
export function crearDocumentosInicial(): DocumentosVehiculo {
  return {
    tiene_soat: false,
    tiene_tecnicomecanica: false,
    tiene_tarjeta_propiedad: false,
    tiene_extintor: false,
    tiene_botiquin: false,
    tiene_kit_herramientas: false,
    tiene_kit_carretera: false,
    tiene_gato: false,
    tiene_triangulos: false,
    tiene_chaleco: false,
  }
}

/** Buscar tercero por cédula o nombre (autocomplete) */
export async function buscarTerceroVehiculo(query: string): Promise<{ nombre: string; cedula: string }[]> {
  if (!query || query.length < 3) return []
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/buscar-tercero/?q=${encodeURIComponent(query)}`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.resultados ?? []
  } catch {
    return []
  }
}


/** Genera el PDF del inventario vehicular y retorna base64 para previsualización */
export async function generarFormatoVehiculo(payload: {
  placa: string
  regional: string
  tipo?: 'carro' | 'moto' | 'auto'
  elabora: { nombre: string; cedula: string; cargo: string; dependencia: string; grupo: string }
  presenta: { nombre: string; cedula: string; cargo: string; grupo: string; telefono: string }
  checklist: ChecklistVehiculo
  // Datos de identificación del vehículo (sección 3 del formato)
  blindado?: string
  modelo?: string
  color?: string
  combustible?: string
  kilometraje?: string
  licencia?: string
  linea?: string
  cilindraje?: string
  motor?: string
  soat?: string
  fecha_soat?: string
  rtm?: string
  fecha_rtm?: string
  marca?: string
  n_serie?: string
  observaciones?: string
}): Promise<{ ok: boolean; pdf_base64?: string; nombre_archivo?: string; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/generar-formato/?preview=true`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return { ok: false, error: json.error || `Error ${res.status}` }
    }

    const data = await res.json() as { pdf_base64: string; nombre_archivo: string }
    return { ok: true, pdf_base64: data.pdf_base64, nombre_archivo: data.nombre_archivo }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}


/** Convierte un File a base64 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Quitar el prefijo data:image/...;base64,
      const base64 = result.split(',')[1] || result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Comprime una imagen antes de subirla (reduce tamaño) */
export function comprimirImagen(file: File, maxWidth = 1280, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height

      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas context')); return }

      ctx.drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      const base64 = dataUrl.split(',')[1] || dataUrl
      resolve(base64)
    }
    img.onerror = reject
    img.src = url
  })
}


// ─── DOCUMENTACIÓN DE VEHÍCULOS ───────────────────────────────────────────────

export interface DocumentacionVehiculoDTO {
  id?: string
  placa: string
  marca: string
  linea: string
  modelo: string
  color: string
  tipo_vehiculo: string
  blindaje: string
  combustible: string
  cilindraje: string
  potencia: string
  traccion: string
  capacidad: string
  carroceria: string
  fecha_soat: string
  soat: string
  licencia: string
  motor: string
  chasis: string
  n_serie: string
  fecha_carga?: string
}

/** Cargar documentación masiva (upsert por placa) */
export async function cargarDocumentacionVehiculos(vehiculos: DocumentacionVehiculoDTO[]): Promise<{ ok: boolean; mensaje?: string; creados?: number; actualizados?: number }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/documentacion/cargar/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ vehiculos }),
    })
    const json = await res.json()
    return { ok: json.ok, mensaje: json.mensaje, creados: json.creados, actualizados: json.actualizados }
  } catch {
    return { ok: false, mensaje: 'Error de conexión al servidor.' }
  }
}

/** Listar documentación guardada */
export async function listarDocumentacionVehiculos(buscar?: string): Promise<{ documentacion: DocumentacionVehiculoDTO[]; total: number }> {
  try {
    const qs = buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''
    const res = await fetch(`${API_URL}/almacen/vehiculos/documentacion/${qs}`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return { documentacion: [], total: 0 }
    const json = await res.json()
    return { documentacion: json.documentacion ?? [], total: json.total ?? 0 }
  } catch {
    return { documentacion: [], total: 0 }
  }
}

/** Eliminar un registro de documentación */
export async function eliminarDocumentacionVehiculo(id: string): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/documentacion/eliminar/${id}/`, {
      method: 'DELETE',
      headers: getApiHeaders(),
    })
    const json = await res.json()
    return { ok: json.ok, mensaje: json.mensaje }
  } catch {
    return { ok: false, mensaje: 'Error de conexión.' }
  }
}

/** Limpiar toda la documentación */
export async function limpiarDocumentacionVehiculos(): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/documentacion/limpiar/`, {
      method: 'DELETE',
      headers: getApiHeaders(),
    })
    const json = await res.json()
    return { ok: json.ok, mensaje: json.mensaje }
  } catch {
    return { ok: false, mensaje: 'Error de conexión.' }
  }
}


// ─── SHAREPOINT (subida de fotos a la nube) ───────────────────────────────────

// Usar fetch nativo para SharePoint (evitar interceptor de auth que borra sesión en 401)
const spFetch = typeof window !== 'undefined' && window.originalFetch ? window.originalFetch : fetch

/** Sube las fotos de un inventario vehicular a SharePoint (token viene de MSAL.js) */
export async function sharepointUploadFotos(params: {
  spToken: string
  placa: string
  servicio: string
  inventarioId?: string
  fotos?: FotoCaptura[]
}): Promise<{ ok: boolean; subidas?: number; errores?: number; error?: string; requiere_auth?: boolean }> {
  try {
    const body: any = {
      sp_token: params.spToken,
      placa: params.placa,
      servicio: params.servicio,
    }
    if (params.inventarioId) body.inventario_id = params.inventarioId
    if (params.fotos) body.fotos = params.fotos

    const res = await spFetch(`${API_URL}/almacen/sharepoint/upload-fotos/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await res.json()
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}


// ─── BLOQUEO/PRESENCIA DE VEHÍCULOS ──────────────────────────────────────────

export interface VehiculoBloqueadoDTO {
  placa: string
  usuario: string
  cedula: string
  servicio: string
  desde: number
}

/** Bloquear un vehículo para inventario (marca como INVENTARIANDO) */
export async function bloquearVehiculo(params: { placa: string; usuario: string; cedula: string; servicio: string }): Promise<{ ok: boolean; mensaje?: string; bloqueado_por?: string }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/bloquear/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(params),
    })
    return await res.json()
  } catch {
    return { ok: false, mensaje: 'Error de conexión' }
  }
}

/** Liberar un vehículo del estado INVENTARIANDO */
export async function liberarVehiculo(params: { placa: string; usuario: string; cedula: string }): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/liberar/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(params),
    })
    return await res.json()
  } catch {
    return { ok: false, mensaje: 'Error de conexión' }
  }
}

/** Consultar vehículos actualmente bloqueados */
export async function obtenerVehiculosBloqueados(servicio?: string): Promise<{ bloqueados: VehiculoBloqueadoDTO[]; total: number }> {
  try {
    const qs = servicio ? `?servicio=${encodeURIComponent(servicio)}` : ''
    const res = await fetch(`${API_URL}/almacen/vehiculos/bloqueados/${qs}`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return { bloqueados: [], total: 0 }
    const json = await res.json()
    return { bloqueados: json.bloqueados ?? [], total: json.total ?? 0 }
  } catch {
    return { bloqueados: [], total: 0 }
  }
}

/** Heartbeat para renovar TTL de bloqueo mientras se inventaría */
export async function heartbeatVehiculo(params: { placa: string; cedula: string }): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(`${API_URL}/almacen/vehiculos/heartbeat/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(params),
    })
    const json = await res.json()
    return { ok: json.ok ?? false }
  } catch {
    return { ok: false }
  }
}


// ─── RESPALDO LOCAL DE FOTOS ──────────────────────────────────────────────────

/**
 * Descarga las fotos del inventario vehicular como un archivo ZIP al dispositivo.
 * Sirve como respaldo local en caso de que SharePoint falle o no tenga permisos.
 * 
 * @param placa - Placa del vehículo
 * @param fotos - Map de TipoFoto → FotoCaptura con las imágenes en base64
 * @param regional - Nombre de la regional/servicio (para el nombre del ZIP)
 * @returns true si la descarga fue exitosa, false si hubo error
 */
export async function descargarRespaldoFotosLocal(
  placa: string,
  fotos: Map<TipoFoto, FotoCaptura>,
  regional?: string,
): Promise<boolean> {
  if (fotos.size === 0) return true // Nada que respaldar

  try {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    // Agregar cada foto al ZIP
    for (const [tipo, foto] of fotos.entries()) {
      if (!foto.imagen_base64) continue
      // Limpiar el prefijo data:image/...;base64, si existe
      let base64Data = foto.imagen_base64
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1]
      }
      const nombreArchivo = `${tipo}.jpg`
      zip.file(nombreArchivo, base64Data, { base64: true })
    }

    // Generar el ZIP
    const contenido = await zip.generateAsync({ type: 'blob' })

    // Crear nombre descriptivo para el archivo
    const fecha = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const regionalLimpia = (regional || 'sin_regional').replace(/[\s/\\:*?"<>|]+/g, '_').slice(0, 30)
    const nombreZip = `FOTOS_${placa}_${regionalLimpia}_${fecha}.zip`

    // Descargar al dispositivo
    const url = URL.createObjectURL(contenido)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreZip
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    return true
  } catch (err) {
    console.error('[RespaldoLocal] Error generando ZIP de fotos:', err)
    return false
  }
}
