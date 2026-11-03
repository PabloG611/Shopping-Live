/**
 * Servicio para gestión de observaciones y notas del inventario físico.
 *
 * Observaciones: bloquean el guardado del inventario hasta resolverse.
 * Notas: informativas, se guardan con el reporte, no bloquean.
 *
 * Cuando una observación se "resuelve" → se convierte en nota (traza).
 * Las notas de placa duplicada se crean automáticamente.
 */

// ============================================
// TIPOS
// ============================================

export type TipoRegistro = 'observacion' | 'nota'
// 'en_gestion' = observación estandarizada que escaló al gestor (Gestión UNP) y
// NO puede ser resuelta por el inventariador; espera autorización/resolución del gestor.
export type EstadoObservacion = 'pendiente' | 'en_gestion' | 'resuelta'

export interface RegistroObservacion {
  id: string
  tipo: TipoRegistro
  placa: string
  descripcionBien: string
  texto: string
  estado: EstadoObservacion
  servicio?: string
  ubicacion?: string
  /** Cédula (o identificador estable) del usuario que creó el registro.
   *  Permite filtrar observaciones/notas por usuario en sesiones colaborativas. */
  cedulaCreador?: string
  /** Fecha de creación */
  fechaCreacion: string
  /** Fecha de resolución (si aplica) */
  fechaResolucion?: string
  /** Contexto adicional para trazabilidad */
  contexto?: string
  /** true si la nota fue generada automáticamente por el sistema (no por el usuario) */
  automatica?: boolean
  /** id de la observación en el backend (solo las que escalan al gestor). */
  backendId?: string
  /** tipo estandarizado (cambio_placa, etc.) de la observación que escaló. */
  tipoObservacion?: string
}

// ============================================
// GENERACIÓN DE IDs
// ============================================

let _idCounter = 0
function generarId(): string {
  _idCounter++
  return `obs-${Date.now()}-${_idCounter}`
}

// ============================================
// CREAR REGISTROS
// ============================================

/**
 * Crea una nueva observación (bloqueante).
 */
export function crearObservacion(
  placa: string,
  descripcionBien: string,
  texto: string,
  servicio?: string,
  ubicacion?: string,
  cedulaCreador?: string,
): RegistroObservacion {
  return {
    id: generarId(),
    tipo: 'observacion',
    placa,
    descripcionBien,
    texto,
    estado: 'pendiente',
    servicio,
    ubicacion,
    cedulaCreador,
    fechaCreacion: new Date().toISOString(),
  }
}

/**
 * Crea una nueva nota (informativa, no bloquea).
 */
export function crearNota(
  placa: string,
  descripcionBien: string,
  texto: string,
  servicio?: string,
  ubicacion?: string,
  contexto?: string,
  automatica = false,
  cedulaCreador?: string,
): RegistroObservacion {
  return {
    id: generarId(),
    tipo: 'nota',
    placa,
    descripcionBien,
    texto,
    estado: 'resuelta', // Las notas no tienen estado pendiente
    servicio,
    ubicacion,
    cedulaCreador,
    fechaCreacion: new Date().toISOString(),
    contexto,
    automatica,
  }
}

/**
 * Crea una nota generada automáticamente por el sistema (duplicados, alertas).
 * Se marca con `automatica: true` para distinguirla de las notas manuales.
 */
export function crearNotaAutomatica(
  placa: string,
  descripcionBien: string,
  texto: string,
  servicio?: string,
  ubicacion?: string,
  contexto?: string,
  cedulaCreador?: string,
): RegistroObservacion {
  return crearNota(placa, descripcionBien, texto, servicio, ubicacion, contexto, true, cedulaCreador)
}

/**
 * Crea una nota automática por placa duplicada.
 */
export function crearNotaDuplicado(
  placa: string,
  descripcionBien1: string,
  servicio1: string,
  ubicacion1: string,
  descripcionBien2: string,
  servicio2: string,
  ubicacion2: string,
  cedulaCreador?: string,
): RegistroObservacion {
  const texto = `Placa duplicada detectada: "${descripcionBien1}" en ${servicio1} (${ubicacion1}) vs "${descripcionBien2}" en ${servicio2} (${ubicacion2}). Verificar bien físico para determinar placa real.`
  return crearNota(
    placa,
    `${descripcionBien1} / ${descripcionBien2}`,
    texto,
    servicio1,
    ubicacion1,
    `DUPLICADO: ${servicio1} ↔ ${servicio2}`,
    false,
    cedulaCreador,
  )
}

// ============================================
// OPERACIONES SOBRE REGISTROS
// ============================================

/**
 * Resuelve una observación convirtiéndola en nota (mantiene traza).
 */
export function resolverObservacion(registro: RegistroObservacion): RegistroObservacion {
  return {
    ...registro,
    tipo: 'nota',
    estado: 'resuelta',
    fechaResolucion: new Date().toISOString(),
    contexto: registro.contexto
      ? `${registro.contexto} | Resuelta`
      : 'Observación resuelta',
  }
}

// ============================================
// CONSULTAS
// ============================================

/**
 * Filtra las observaciones que bloquean el guardado:
 * - 'pendiente': aún resoluble por el inventariador.
 * - 'en_gestion': escaló al gestor (Gestión UNP); el inventariador NO puede resolverla.
 * Ambos estados impiden guardar el inventario.
 */
export function obtenerObservacionesPendientes(registros: RegistroObservacion[]): RegistroObservacion[] {
  return registros.filter(
    r => r.tipo === 'observacion' && (r.estado === 'pendiente' || r.estado === 'en_gestion'),
  )
}

/**
 * Filtra solo notas (incluye observaciones resueltas).
 */
export function obtenerNotas(registros: RegistroObservacion[]): RegistroObservacion[] {
  return registros.filter(r => r.tipo === 'nota')
}

/**
 * Obtiene todos los registros de una placa específica.
 */
export function registrosPorPlaca(registros: RegistroObservacion[], placa: string): RegistroObservacion[] {
  return registros.filter(r => r.placa === placa)
}

/**
 * Verifica si hay observaciones que bloquean el guardado.
 * Bloquean tanto las 'pendiente' (resolubles por el inventariador) como las
 * 'en_gestion' (escaladas al gestor, no resolubles por el inventariador).
 */
export function tieneObservacionesBloqueantes(registros: RegistroObservacion[]): boolean {
  return registros.some(
    r => r.tipo === 'observacion' && (r.estado === 'pendiente' || r.estado === 'en_gestion'),
  )
}

// ============================================
// FILTRADO UNIFICADO POR SERVICIO + CÉDULA
// ============================================

/** Opciones de filtrado de registros por contexto (servicio activo + usuario). */
export interface OpcionesFiltroRegistro {
  /** Servicio activo. Si va vacío, no se filtra por servicio. */
  servicio?: string
  /** Cédula/identificador del usuario. Si va vacío, no se filtra por usuario. */
  cedula?: string
}

/**
 * Determina si un registro es visible para el contexto dado (servicio + cédula).
 *
 * Reglas (equivalentes a perteneceAlServicio de ModalObservacionesNotas para no
 * divergir, extendidas con la cédula del creador):
 * - Las alertas del sistema (automatica === true) son SIEMPRE visibles: son
 *   novedades cross-servicio que todos deben ver.
 * - En otro caso, el registro es visible cuando:
 *     · no hay servicio activo, o el registro no tiene servicio, o coinciden; Y
 *     · no hay cédula de contexto, o el registro no tiene cedulaCreador, o coinciden.
 *   Un registro sin servicio/cédula asignada no se oculta (retrocompatible con
 *   los registros creados antes de añadir estos campos).
 */
export function registroVisible(
  r: RegistroObservacion,
  { servicio, cedula }: OpcionesFiltroRegistro = {},
): boolean {
  if (r.automatica) return true // las alertas del sistema no se filtran
  const servicioOk = !servicio || !r.servicio || r.servicio === servicio
  const cedulaOk = !cedula || !r.cedulaCreador || r.cedulaCreador === cedula
  return servicioOk && cedulaOk
}

/**
 * Filtra una lista de registros dejando solo los visibles para el contexto.
 */
export function filtrarRegistrosVisibles(
  registros: RegistroObservacion[],
  opts: OpcionesFiltroRegistro = {},
): RegistroObservacion[] {
  return registros.filter(r => registroVisible(r, opts))
}

/**
 * Observaciones que bloquean el guardado (pendiente/en_gestion) y que además
 * son visibles para el contexto dado (servicio activo + cédula del usuario).
 * Es la base para que la campana (ModalAlertas) y el bloqueo de guardado
 * cuenten EXACTAMENTE lo mismo.
 */
export function obtenerBloqueantesVisibles(
  registros: RegistroObservacion[],
  opts: OpcionesFiltroRegistro = {},
): RegistroObservacion[] {
  return registros.filter(
    r =>
      r.tipo === 'observacion' &&
      (r.estado === 'pendiente' || r.estado === 'en_gestion') &&
      registroVisible(r, opts),
  )
}

/**
 * Crea una observación que escaló al gestor (Gestión UNP).
 * Queda en estado 'en_gestion': bloquea el guardado y NO es resoluble por el
 * inventariador. Guarda el id del backend y el tipo estandarizado para trazabilidad.
 */
export function crearObservacionEnGestion(
  placa: string,
  descripcionBien: string,
  texto: string,
  backendId: string,
  tipoObservacion: string,
  servicio?: string,
  ubicacion?: string,
  cedulaCreador?: string,
): RegistroObservacion {
  return {
    id: generarId(),
    tipo: 'observacion',
    placa,
    descripcionBien,
    texto,
    estado: 'en_gestion',
    servicio,
    ubicacion,
    cedulaCreador,
    fechaCreacion: new Date().toISOString(),
    backendId,
    tipoObservacion,
  }
}

// ============================================
// PERSISTENCIA LOCAL (localStorage)
// ============================================

const STORAGE_KEY = 'inventario_observaciones_notas'

export function guardarRegistrosEnStorage(registros: RegistroObservacion[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registros))
  } catch { /* silenciar */ }
}

export function cargarRegistrosDesdeStorage(): RegistroObservacion[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch { return [] }
}

export function limpiarRegistrosStorage(): void {
  localStorage.removeItem(STORAGE_KEY)
}
