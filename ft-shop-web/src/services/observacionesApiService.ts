/**
 * Servicio HTTP del flujo de Observaciones Estandarizadas (backend bk-sgai).
 * Consume endpoints de almacen/observaciones/*.
 *
 * NO confundir con observacionesInventarioService.ts (ese maneja el estado
 * local/localStorage de observaciones-nota que bloquean el guardado). Este
 * service persiste las observaciones TIPIFICADAS que escalan a la bandeja.
 */
import { getApiHeaders } from '../utils/apiHeaders'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

// ─── TIPOS ──────────────────────────────────────────────────────────────────

export type TipoObservacionBackend =
  | 'cambio_placa'
  | 'cambio_servicio'
  | 'cambio_descripcion'
  | 'validacion_servicio'
  | 'otra'

export type EstadoObservacionBackend =
  | 'pendiente'
  | 'en_gestion'
  | 'resuelta'
  | 'rechazada'
  | 'cancelada'

/** Tipos que generan flujo (escalan a la bandeja del gestor). */
export const TIPOS_CON_FLUJO: TipoObservacionBackend[] = ['cambio_placa', 'cambio_servicio', 'cambio_descripcion']

export interface ObservacionBackend {
  id: string
  placa: string
  descripcion_bien: string
  responsable_nombre: string
  responsable_cedula: string
  servicio: string
  ubicacion: string
  tipo: TipoObservacionBackend
  tipo_display: string
  subtipo: string
  texto: string
  estado: EstadoObservacionBackend
  estado_display: string
  reportado_por_nombre: string
  reportado_por_cedula: string
  fecha_creacion: string
  resuelto_por_nombre: string
  resuelto_por_cedula: string
  fecha_resolucion: string | null
  accion_realizada: string
  detalle_solucion: string
  evidencia: string
  valor_anterior: string
  valor_nuevo: string
  actualizado_en: string
}

export interface CrearObservacionPayload {
  placa: string
  descripcion_bien?: string
  responsable_nombre?: string
  responsable_cedula?: string
  servicio?: string
  ubicacion?: string
  tipo: TipoObservacionBackend
  subtipo?: string
  texto?: string
  reportado_por_nombre?: string
  reportado_por_cedula?: string
}

// ─── CATÁLOGO DE TIPOS Y SUBTIPOS (para el selector del modal) ────────────────

export interface OpcionTipo {
  tipo: TipoObservacionBackend
  label: string
  escala: boolean
  subtipos: string[]
}

export const CATALOGO_OBSERVACIONES: OpcionTipo[] = [
  {
    tipo: 'cambio_placa', label: 'Cambio de placa', escala: true,
    subtipos: ['Placa deteriorada', 'Placa ilegible', 'Placa parcialmente desprendida', 'Placa completamente desprendida', 'Identificado por pirograbado'],
  },
  {
    tipo: 'cambio_servicio', label: 'Cambio de servicio (mismo responsable)', escala: true,
    subtipos: [],
  },
  {
    tipo: 'cambio_descripcion', label: 'Cambio de descripción', escala: true,
    subtipos: [],
  },
  {
    tipo: 'validacion_servicio', label: 'Validación de servicio (fuera de bodega)', escala: false,
    subtipos: [],
  },
  {
    tipo: 'otra', label: 'Otra observación', escala: false,
    subtipos: [],
  },
]

// ─── LLAMADAS HTTP ────────────────────────────────────────────────────────────

interface RespuestaCrear { ok: boolean; observacion?: ObservacionBackend; escala?: boolean; error?: string }

export async function crearObservacionBackend(payload: CrearObservacionPayload): Promise<RespuestaCrear> {
  try {
    const res = await fetch(`${API_URL}/almacen/observaciones/crear/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error || 'Error creando la observación' }
    return { ok: true, observacion: data.observacion, escala: data.escala }
  } catch {
    return { ok: false, error: 'Error de conexión al crear la observación' }
  }
}

export interface BandejaResponse {
  ok: boolean
  observaciones: ObservacionBackend[]
  conteo_por_tipo: Record<string, number>
}

export async function cargarBandejaObservaciones(estado?: string, tipo?: string): Promise<BandejaResponse> {
  try {
    const qs = new URLSearchParams()
    if (estado) qs.set('estado', estado)
    if (tipo) qs.set('tipo', tipo)
    const res = await fetch(`${API_URL}/almacen/observaciones/bandeja/?${qs.toString()}`, { headers: getApiHeaders() })
    if (!res.ok) return { ok: false, observaciones: [], conteo_por_tipo: {} }
    const data = await res.json()
    return { ok: true, observaciones: data.observaciones ?? [], conteo_por_tipo: data.conteo_por_tipo ?? {} }
  } catch {
    return { ok: false, observaciones: [], conteo_por_tipo: {} }
  }
}

export async function tomarObservacion(id: string, gestorCedula: string, gestorNombre: string): Promise<RespuestaCrear> {
  return _postAccion(`${API_URL}/almacen/observaciones/${id}/tomar/`, { gestor_cedula: gestorCedula, gestor_nombre: gestorNombre })
}

export interface ResolverPayload {
  resuelto_por_cedula: string
  resuelto_por_nombre: string
  accion_realizada: string
  detalle_solucion: string
  evidencia?: string
  valor_anterior?: string
  valor_nuevo?: string
}

export async function resolverObservacionBackend(id: string, payload: ResolverPayload): Promise<RespuestaCrear> {
  return _postAccion(`${API_URL}/almacen/observaciones/${id}/resolver/`, payload)
}

export async function cerrarObservacion(id: string, accion: 'rechazar' | 'cancelar', motivo: string, gestorCedula: string, gestorNombre: string): Promise<RespuestaCrear> {
  return _postAccion(`${API_URL}/almacen/observaciones/${id}/cerrar/`, { accion, motivo, resuelto_por_cedula: gestorCedula, resuelto_por_nombre: gestorNombre })
}

export async function cargarHistorialObservaciones(placa: string): Promise<ObservacionBackend[]> {
  try {
    const res = await fetch(`${API_URL}/almacen/observaciones/historial/?placa=${encodeURIComponent(placa)}`, { headers: getApiHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.observaciones ?? []
  } catch {
    return []
  }
}

async function _postAccion(url: string, body: object): Promise<RespuestaCrear> {
  try {
    const res = await fetch(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error || 'Error en la operación' }
    return { ok: true, observacion: data.observacion }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}
