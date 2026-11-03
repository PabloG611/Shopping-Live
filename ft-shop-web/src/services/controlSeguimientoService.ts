/**
 * Servicio para Control y Seguimiento de inventario.
 * Gestiona: servicios habilitados, conteo de bienes, detalle por servicio,
 * bienes inventariados del año, y bienes pendientes.
 * 
 * La configuración de servicios habilitados se persiste en BD (PostgreSQL)
 * a través del endpoint /almacen/configuracion-inventario/.
 */

import { getApiHeaders } from '../utils/apiHeaders'
import { idbGet, idbSet, idbDeletePrefijo } from './idbCache'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

// ============================================
// TIPOS
// ============================================

export interface Servicio {
  codigo: string
  nombre: string
  cantidad: number
  es_bodega: boolean
}

export interface BienInventariado {
  placa: string
  descripcion: string
  responsable: string
  cedula: string
  estado: string
  estado_bien: string
  custodio_nombre: string
  custodio_cedula: string
  fecha_lectura: string
  serial?: string
  observacion?: string
  sesion_nombre?: string
  sesion_servicio?: string
  sesion_fecha?: string
  // Quién realizó el inventario (hasta dos colaboradores).
  sesion_colaborador1_nombre?: string
  sesion_colaborador1_cargo?: string
  sesion_colaborador2_nombre?: string
  sesion_colaborador2_cargo?: string
}

export interface BienPendiente {
  placa: string
  descripcion: string
  responsable?: string
  cedula?: string
}

export type Categoria = 'todos' | 'floresta' | 'unp' | 'comodato' | 'sin_placa'

// ============================================
// UTILIDADES
// ============================================

export function categorizarBien(placa: string): Categoria {
  if (!placa || placa.trim() === '' || placa.startsWith('SP-')) return 'sin_placa'
  const p = placa.toUpperCase()
  if (p.startsWith('F')) return 'floresta'
  if (p.startsWith('C')) return 'comodato'
  return 'unp'
}

export function labelCategoria(cat: Categoria): string {
  switch (cat) {
    case 'floresta': return 'Floresta'
    case 'unp': return 'UNP'
    case 'comodato': return 'Comodato'
    case 'sin_placa': return 'Sin Placa'
    default: return 'Todos'
  }
}

// ============================================
// SERVICIOS HABILITADOS (BD vía API)
// ============================================

/** @deprecated Mantener solo para compatibilidad temporal. Usar fetchServiciosHabilitados. */
export const STORAGE_KEY_SERVICIOS_HABILITADOS = 'inventario_servicios_habilitados_global'

/**
 * Obtiene los servicios habilitados desde el backend (BD).
 * Fallback a localStorage si la API no responde (modo offline).
 */
export async function fetchServiciosHabilitados(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/almacen/configuracion-inventario/?clave=servicios_habilitados`, {
      headers: getApiHeaders(),
    })
    if (res.ok) {
      const data = await res.json()
      const valor = data.valor ?? []
      // Sincronizar localStorage como cache local
      localStorage.setItem(STORAGE_KEY_SERVICIOS_HABILITADOS, JSON.stringify(valor))
      return valor
    }
  } catch { /* fallback a localStorage */ }
  // Fallback: leer de localStorage (modo offline)
  return getServiciosHabilitadosLocal()
}

/**
 * Guarda los servicios habilitados en el backend (BD).
 * También actualiza localStorage como cache.
 */
export async function guardarServiciosHabilitados(codigos: string[]): Promise<boolean> {
  // Actualizar cache local inmediatamente
  localStorage.setItem(STORAGE_KEY_SERVICIOS_HABILITADOS, JSON.stringify(codigos))
  try {
    const res = await fetch(`${API_URL}/almacen/configuracion-inventario/guardar/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        clave: 'servicios_habilitados',
        valor: codigos,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ============================================
// SERVICIOS HABILITADOS POR USUARIO (INVENTARIADOR)
// ============================================

/** Construye la clave de configuración por usuario. */
function claveServiciosUsuario(username: string): string {
  return `servicios_habilitados::${username.trim().toLowerCase()}`
}

/**
 * Obtiene los servicios habilitados (asignados) a un usuario/inventariador específico.
 * Usa la clave `servicios_habilitados::<username>` en la configuración de inventario.
 */
export async function fetchServiciosHabilitadosUsuario(username: string): Promise<string[]> {
  if (!username) return []
  try {
    const res = await fetch(
      `${API_URL}/almacen/configuracion-inventario/?clave=${encodeURIComponent(claveServiciosUsuario(username))}`,
      { headers: getApiHeaders() },
    )
    if (res.ok) {
      const data = await res.json()
      return Array.isArray(data.valor) ? data.valor : []
    }
  } catch { /* silenciar */ }
  return []
}

/**
 * Guarda los servicios asignados a un usuario/inventariador específico.
 */
export async function guardarServiciosHabilitadosUsuario(username: string, codigos: string[], nombreCompleto?: string): Promise<boolean> {
  if (!username) return false
  try {
    const res = await fetch(`${API_URL}/almacen/configuracion-inventario/guardar/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        clave: claveServiciosUsuario(username),
        valor: codigos,
        // Guardamos el nombre del inventariador para poder reconstruir el tablero
        // (la clave solo tiene el username). Se persiste en 'actualizado_por'.
        actualizado_por: nombreCompleto || undefined,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Reconstruye el tablero de inventariadores directamente desde la BD:
 * lee todas las configuraciones cuya clave empieza por 'servicios_habilitados::'
 * y devuelve cada inventariador con su username, nombre y servicios asignados.
 * Es la ÚNICA fuente de verdad (no requiere lista aparte del tablero).
 */
export async function reconstruirTableroDesdeBD(): Promise<Array<{ username: string; nombreCompleto: string; servicios: string[] }>> {
  try {
    // GET sin clave → devuelve todas las configuraciones
    const res = await fetch(`${API_URL}/almacen/configuracion-inventario/`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return []
    const data = await res.json()
    const configs: any[] = data.configuraciones ?? []
    const prefijo = 'servicios_habilitados::'
    return configs
      .filter((c) => typeof c.clave === 'string' && c.clave.startsWith(prefijo))
      .map((c) => {
        const username = c.clave.slice(prefijo.length)
        return {
          username,
          nombreCompleto: c.actualizado_por || username,
          servicios: Array.isArray(c.valor) ? c.valor : [],
        }
      })
      // Ignorar filas sin servicios (asignaciones vaciadas)
      .filter((inv) => inv.servicios.length > 0)
  } catch {
    return []
  }
}

// ============================================
// BÚSQUEDA DE USUARIOS DEL ECOSISTEMA (DIRECTORIO)
// ============================================

export interface UsuarioEcosistema {
  uuidUsuario: string
  username: string | null
  nombreCompleto: string
  cedula: string
  dependencia: string | null
  grupo: string | null
  email?: string
}

/**
 * Busca usuarios del ecosistema (directorio auth_user, el mismo que usa OTSI).
 * Usa el endpoint `usuario/listar/?search=` que hace una búsqueda flexible (OR)
 * sobre username, nombre, apellido y correo. Devuelve el username (ej. "pablo.gamboa").
 */
export async function buscarUsuariosEcosistema(termino: string): Promise<UsuarioEcosistema[]> {
  const q = termino.trim()
  if (q.length < 3) return []

  try {
    const res = await fetch(`${API_URL}/usuario/listar/?search=${encodeURIComponent(q)}`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return []
    const data = await res.json()
    const resultados: any[] = data.results ?? []
    return resultados.map((r) => ({
      uuidUsuario: String(r.id),
      username: r.username ?? null,
      nombreCompleto: (r.nombre_completo || r.username || '').trim(),
      cedula: '',
      dependencia: null,
      grupo: null,
      email: r.email ?? '',
    }))
  } catch {
    return []
  }
}

/** Lee servicios habilitados del localStorage (cache local / fallback offline). */
export function getServiciosHabilitadosLocal(): string[] {
  try {
    const guardados = localStorage.getItem(STORAGE_KEY_SERVICIOS_HABILITADOS)
    return guardados ? JSON.parse(guardados) : []
  } catch { return [] }
}

/**
 * @deprecated Usar guardarServiciosHabilitados (async, persiste en BD).
 * Mantener para compatibilidad temporal con componentes que aún no se migraron.
 */
export function getServiciosHabilitados(): string[] {
  return getServiciosHabilitadosLocal()
}

// ============================================
// API: CARGAR SERVICIOS CON CONTEO
// ============================================

export async function cargarServicios(): Promise<Servicio[]> {
  try {
    const res = await fetch(`${API_URL}/almacen/admin/contar-bienes-servicio/`)
    if (res.ok) {
      const data = await res.json()
      return data.servicios ?? []
    }
  } catch { /* silenciar */ }
  return []
}

// ============================================
// API: CARGA REAL DE UN SERVICIO (TNS) — UNA sola pasada
// ============================================

/** Mapa servicio → ciudad para fusionar con la ubicación TNS. */
const CIUDAD_POR_SERVICIO: Record<string, string> = {
  '3000-GURPBLLA': 'BARRANQUILLA', '3000-GURPCALI': 'CALI', '3000-GURPCAR': 'CARTAGENA',
  '3000-GURPCUC': 'CUCUTA', '3000-GURPFLO': 'FLORENCIA', '3000-GURPMED': 'MEDELLIN',
  '3000-GURPNEIVA': 'NEIVA', '3000-GURPPO': 'POPAYAN', '3000-GURPVILLA': 'VILLAVICENCIO',
  '3000-ENLARIOHACHA': 'RIOHACHA', '3000-ENLSANTAMARTA': 'SANTA MARTA',
  '3000-ENLVALLEDUPAR': 'VALLEDUPAR', '3000-ENLARM': 'ARMENIA',
  '3000-ENLB/TURA': 'BUENAVENTURA', '3000-ENLMANIZALES': 'MANIZALES',
  '3000-ENLPEREI': 'PEREIRA', '3000-ENLMONT': 'MONTERIA', '3000-ENLSINCE': 'SINCELEJO',
  '3000-ENLB/MANGA': 'BUCARAMANGA', '3000-ENLB/MEJA': 'BARRANCABERMEJA',
  '3000-ENLMOCOA': 'MOCOA', '3000-ENLAPAR': 'APARTADO', '3000-ENLQUIBDO': 'QUIBDO',
  '3000-ENLIBAGUE': 'IBAGUE', '3000-ENLPASTO': 'PASTO', '3000-ENLTUM': 'TUMACO',
  '3000-ENLARAUCA': 'ARAUCA', '3000-ENLYOPAL': 'YOPAL', '3000-ENLTUNJA': 'TUNJA',
  'BOGOTA': 'BOGOTA',
}

const PATRONES_ARMAMENTO = ['PISTOLA', 'GLOCK', 'CHALECO', 'BLINDADO', 'BALISTIC', 'SUBAMET', 'MUNICION', 'CAL.', 'CAL ']

/** ¿El bien debe excluirse? (armamento 201, vehículos 213, PED). */
function bienExcluido(bien: any): boolean {
  const grupoContable = (bien.grupo_contable || '').trim()
  const grupoBien = (bien.grupo_bien || '').trim()
  const descripcion = (bien.descripcion || '').toUpperCase()
  const dependencia = (bien.dependencia || '').toUpperCase()
  if (grupoContable.startsWith('201') || grupoBien.startsWith('201')) return true
  if (grupoContable.startsWith('213') || grupoBien.startsWith('213')) return true
  if (PATRONES_ARMAMENTO.some(p => descripcion.includes(p))) return true
  if (dependencia.includes('POBLACION') && dependencia.includes('ENFOQUE') && dependencia.includes('DIFERENCIAL')) return true
  return false
}

/** Resultado real de un servicio: total neto, nombre y bienes pendientes. */
export interface ServicioReal {
  codigo: string
  nombre: string
  total: number
  pendientes: BienPendiente[]
}

// Caché en 3 niveles para evitar re-consultar TNS (lento) en cada visita:
//   1. memoria (Map): vida de la pestaña, instantáneo.
//   2. sessionStorage: sobrevive recargas de la misma pestaña (TTL 5 min).
//   3. IndexedDB: PERSISTE entre sesiones y cierres (TTL 24 h). Es el que hace
//      que el dashboard cargue al instante la primera vez tras abrir la app.
// Patrón stale-while-revalidate: el dato de IDB se usa aunque sea viejo (los
// pendientes se recalculan igual contra las placas inventariadas actuales) y
// no se re-consulta TNS si está dentro del TTL en memoria/session.
const TTL_CACHE_MS = 5 * 60 * 1000 // 5 minutos (memoria / sessionStorage)
const TTL_IDB_MS = 24 * 60 * 60 * 1000 // 24 horas (IndexedDB persistente)
const cacheServicio = new Map<string, { ts: number; data: Omit<ServicioReal, 'pendientes'> & { bienes: any[] } }>()

interface CacheServicioIDB { bienes: any[]; nombre: string }

function leerCacheSession(codigo: string): { ts: number; bienes: any[]; nombre: string } | null {
  try {
    const raw = sessionStorage.getItem(`svc_real_${codigo}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.ts > TTL_CACHE_MS) return null
    return parsed
  } catch { return null }
}

function guardarCacheSession(codigo: string, bienes: any[], nombre: string) {
  try {
    sessionStorage.setItem(`svc_real_${codigo}`, JSON.stringify({ ts: Date.now(), bienes, nombre }))
  } catch { /* cuota llena: ignorar */ }
}

/**
 * Carga la data REAL de un servicio desde TNS (Firebird), fusionando
 * bienes por servicio + bienes por ubicación (misma lógica que Inventario
 * Regional), en UNA sola pasada. Devuelve total neto y pendientes juntos,
 * evitando la doble consulta que hacía el dashboard antes.
 *
 * Cachea el conjunto de bienes (sessionStorage, TTL 5 min) para que las
 * recargas del dashboard sean instantáneas sin re-golpear TNS.
 */
export async function cargarServicioReal(
  codigoServicio: string,
  placasInventariadas: Set<string>,
): Promise<ServicioReal> {
  // ── Intentar caché primero ──
  let bienesFusion: any[] | null = null
  let nombreServicio = codigoServicio

  const mem = cacheServicio.get(codigoServicio)
  if (mem && Date.now() - mem.ts <= TTL_CACHE_MS) {
    bienesFusion = mem.data.bienes
    nombreServicio = mem.data.nombre
  } else {
    const ses = leerCacheSession(codigoServicio)
    if (ses) {
      bienesFusion = ses.bienes
      nombreServicio = ses.nombre
    } else {
      // Nivel 3: IndexedDB (persiste entre sesiones). Si hay dato dentro del
      // TTL de 24 h, se usa al instante sin golpear TNS.
      const idb = await idbGet<CacheServicioIDB>(`svc_real_${codigoServicio}`, TTL_IDB_MS)
      if (idb) {
        bienesFusion = idb.bienes
        nombreServicio = idb.nombre
        // Rehidratar los niveles rápidos para el resto de la sesión.
        cacheServicio.set(codigoServicio, { ts: Date.now(), data: { codigo: codigoServicio, nombre: nombreServicio, total: 0, bienes: bienesFusion } })
        guardarCacheSession(codigoServicio, bienesFusion, nombreServicio)
      }
    }
  }

  // ── Si no hay caché, consultar TNS una sola vez ──
  if (!bienesFusion) {
    const bienesPorPlaca = new Map<string, any>()
    try {
      const res = await fetch(`${API_URL}/almacen/inventario-regional/?servicio=${encodeURIComponent(codigoServicio)}`, { headers: getApiHeaders() })
      if (res.ok) {
        const data = await res.json()
        const bienesServicio: any[] = data.data ?? []
        for (const b of bienesServicio) {
          if (b.placa) bienesPorPlaca.set(b.placa, b)
        }
        if (bienesServicio.length > 0) nombreServicio = (bienesServicio[0].dependencia || '').trim() || codigoServicio
      }

      // Fusionar con ubicación TNS (misma lógica que regionales)
      const ciudad = CIUDAD_POR_SERVICIO[codigoServicio]
      if (ciudad) {
        const resUbic = await fetch(`${API_URL}/almacen/ubicaciones-tns/?q=${encodeURIComponent(ciudad)}`, { headers: getApiHeaders() })
        if (resUbic.ok) {
          const ubicData = await resUbic.json()
          const ubic = (ubicData.ubicaciones ?? []).find((u: any) => (u.nombre || '').toUpperCase().includes(ciudad))
          if (ubic) {
            const resB = await fetch(`${API_URL}/almacen/bienes-por-ubicacion/?ubicacion_id=${ubic.id}`, { headers: getApiHeaders() })
            if (resB.ok) {
              const bData = await resB.json()
              for (const b of (bData.data ?? [])) {
                if (b.placa && !bienesPorPlaca.has(b.placa)) bienesPorPlaca.set(b.placa, b)
              }
            }
          }
        }
      }
    } catch { /* devolver lo que se haya podido */ }

    bienesFusion = Array.from(bienesPorPlaca.values())
    cacheServicio.set(codigoServicio, { ts: Date.now(), data: { codigo: codigoServicio, nombre: nombreServicio, total: 0, bienes: bienesFusion } })
    guardarCacheSession(codigoServicio, bienesFusion, nombreServicio)
    // Persistir en IndexedDB para que la próxima sesión cargue al instante.
    void idbSet<CacheServicioIDB>(`svc_real_${codigoServicio}`, { bienes: bienesFusion, nombre: nombreServicio })
  }

  // ── Aplicar exclusiones y separar total/pendientes (data en memoria, sin más red) ──
  const bienesNetos = bienesFusion.filter(b => !bienExcluido(b))
  const pendientes: BienPendiente[] = bienesNetos
    .filter(b => !placasInventariadas.has(b.placa))
    .map(b => ({
      placa: b.placa,
      descripcion: b.descripcion || '',
      responsable: b.responsable || '',
      cedula: b.cedula || '',
    }))
    .sort((a, b) => a.placa.localeCompare(b.placa))

  return { codigo: codigoServicio, nombre: nombreServicio, total: bienesNetos.length, pendientes }
}

/** Limpia la caché de servicios en los 3 niveles (usar al forzar refresco). */
export function limpiarCacheServiciosReal() {
  cacheServicio.clear()
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith('svc_real_')) sessionStorage.removeItem(k)
    }
  } catch { /* ignorar */ }
  // Borrar también la capa persistente (IndexedDB).
  void idbDeletePrefijo('svc_real_')
}

// ============================================
// PLACAS EN SESIONES COLABORATIVAS ACTIVAS (otras duplas)
// ============================================

export interface PlacaOtraDupla {
  usuario: string
  cedula: string
  servicio: string
  codigo_servicio: string
}

/**
 * Trae todas las placas que otras duplas tienen ahora mismo en sesiones
 * colaborativas activas (con su usuario/servicio). Sirve para bloquear al
 * instante que un usuario agregue una placa que otro servicio ya inventarió,
 * aunque haya entrado tarde y no recibiera el evento WS en vivo.
 *
 * @param excluirServicio Código del servicio propio (para no bloquearse a sí mismo).
 */
export async function cargarPlacasOtrasDuplas(excluirServicio?: string): Promise<Map<string, PlacaOtraDupla>> {
  const mapa = new Map<string, PlacaOtraDupla>()
  try {
    const q = excluirServicio ? `?excluir_servicio=${encodeURIComponent(excluirServicio)}` : ''
    const res = await fetch(`${API_URL}/almacen/colaborativo/placas-activas/${q}`, { headers: getApiHeaders() })
    if (res.ok) {
      const data = await res.json()
      const placas = data.placas ?? {}
      for (const placa of Object.keys(placas)) {
        const info = placas[placa]
        mapa.set(placa, {
          usuario: info.usuario || 'Otra persona',
          cedula: info.cedula || '',
          servicio: info.servicio || 'otro servicio',
          codigo_servicio: info.codigo_servicio || '',
        })
      }
    }
  } catch { /* silenciar */ }
  return mapa
}

/**
 * Obtiene el total NETO de bienes de un servicio usando inventario-regional
 * y fusionando con bienes-por-ubicacion (misma lógica que Inventario Regional).
 * Aplica la misma exclusión que AdminFlorestaPage: grupo_contable 201 (armamento),
 * 213 (vehículos), patrones de descripción y PED.
 */
export async function obtenerTotalRealServicio(codigoServicio: string): Promise<number> {
  try {
    // 1. Consultar bienes por servicio
    const res = await fetch(`${API_URL}/almacen/inventario-regional/?servicio=${encodeURIComponent(codigoServicio)}`)
    if (!res.ok) return 0
    const data = await res.json()
    const bienesServicio: any[] = data.data ?? []

    // Mapa placa → bien (para luego excluir con info)
    const bienesPorPlaca = new Map<string, any>()
    for (const b of bienesServicio) {
      if (b.placa) bienesPorPlaca.set(b.placa, b)
    }

    // 2. Buscar ubicación TNS que corresponda al servicio (por nombre de ciudad)
    const ciudadMap: Record<string, string> = {
      '3000-GURPBLLA': 'BARRANQUILLA', '3000-GURPCALI': 'CALI', '3000-GURPCAR': 'CARTAGENA',
      '3000-GURPCUC': 'CUCUTA', '3000-GURPFLO': 'FLORENCIA', '3000-GURPMED': 'MEDELLIN',
      '3000-GURPNEIVA': 'NEIVA', '3000-GURPPO': 'POPAYAN', '3000-GURPVILLA': 'VILLAVICENCIO',
      '3000-ENLARIOHACHA': 'RIOHACHA', '3000-ENLSANTAMARTA': 'SANTA MARTA',
      '3000-ENLVALLEDUPAR': 'VALLEDUPAR', '3000-ENLARM': 'ARMENIA',
      '3000-ENLB/TURA': 'BUENAVENTURA', '3000-ENLMANIZALES': 'MANIZALES',
      '3000-ENLPEREI': 'PEREIRA', '3000-ENLMONT': 'MONTERIA', '3000-ENLSINCE': 'SINCELEJO',
      '3000-ENLB/MANGA': 'BUCARAMANGA', '3000-ENLB/MEJA': 'BARRANCABERMEJA',
      '3000-ENLMOCOA': 'MOCOA', '3000-ENLAPAR': 'APARTADO', '3000-ENLQUIBDO': 'QUIBDO',
      '3000-ENLIBAGUE': 'IBAGUE', '3000-ENLPASTO': 'PASTO', '3000-ENLTUM': 'TUMACO',
      '3000-ENLARAUCA': 'ARAUCA', '3000-ENLYOPAL': 'YOPAL', '3000-ENLTUNJA': 'TUNJA',
      'BOGOTA': 'BOGOTA',
    }

    const ciudad = ciudadMap[codigoServicio]
    if (ciudad) {
      const resUbic = await fetch(`${API_URL}/almacen/ubicaciones-tns/?q=${encodeURIComponent(ciudad)}`)
      if (resUbic.ok) {
        const ubicData = await resUbic.json()
        const ubicaciones = ubicData.ubicaciones ?? []
        const ubic = ubicaciones.find((u: any) => (u.nombre || '').toUpperCase().includes(ciudad))
        if (ubic) {
          const resB = await fetch(`${API_URL}/almacen/bienes-por-ubicacion/?ubicacion_id=${ubic.id}`)
          if (resB.ok) {
            const bData = await resB.json()
            const bienesUbic: any[] = bData.data ?? []
            for (const b of bienesUbic) {
              if (b.placa && !bienesPorPlaca.has(b.placa)) {
                bienesPorPlaca.set(b.placa, b)
              }
            }
          }
        }
      }
    }

    // 3. Excluir: misma lógica que AdminFlorestaPage
    const patronesArmamento = ['PISTOLA', 'GLOCK', 'CHALECO', 'BLINDADO', 'BALISTIC', 'SUBAMET', 'MUNICION', 'CAL.', 'CAL ']
    let excluidos = 0
    for (const bien of bienesPorPlaca.values()) {
      const grupoContable = (bien.grupo_contable || '').trim()
      const grupoBien = (bien.grupo_bien || '').trim()
      const descripcion = (bien.descripcion || '').toUpperCase()
      const dependencia = (bien.dependencia || '').toUpperCase()

      if (grupoContable.startsWith('201') || grupoBien.startsWith('201')) { excluidos++; continue }
      if (grupoContable.startsWith('213') || grupoBien.startsWith('213')) { excluidos++; continue }
      if (patronesArmamento.some(p => descripcion.includes(p))) { excluidos++; continue }
      if (dependencia.includes('POBLACION') && dependencia.includes('ENFOQUE') && dependencia.includes('DIFERENCIAL')) { excluidos++; continue }
    }

    return bienesPorPlaca.size - excluidos
  } catch {
    return 0
  }
}

/**
 * Carga los totales reales para múltiples servicios en paralelo (máx 3 concurrentes).
 * Retorna un mapa codigo → total real.
 */
export async function cargarTotalesRealesServicios(codigos: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  const CONCURRENCIA = 3

  for (let i = 0; i < codigos.length; i += CONCURRENCIA) {
    const chunk = codigos.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.allSettled(
      chunk.map(async (cod) => {
        const total = await obtenerTotalRealServicio(cod)
        return { codigo: cod, total }
      })
    )
    for (const r of resultados) {
      if (r.status === 'fulfilled') {
        mapa.set(r.value.codigo, r.value.total)
      }
    }
  }

  return mapa
}

// ============================================
// API: BIENES INVENTARIADOS DEL AÑO
// ============================================

export async function cargarBienesInventariadosAnio(anio?: number): Promise<{
  bienes: BienInventariado[]
  placas: Set<string>
}> {
  const year = anio ?? new Date().getFullYear()
  const todosBienes: BienInventariado[] = []
  const todasPlacas = new Set<string>()

  try {
    const res = await fetch(`${API_URL}/almacen/admin/listar-inventarios/?anio=${year}`)
    if (res.ok) {
      const data = await res.json()
      const inventarios = data.inventarios ?? []

      // Fetch detalles en paralelo (máx 5 concurrentes para no saturar)
      const chunks: any[][] = []
      for (let i = 0; i < inventarios.length; i += 5) {
        chunks.push(inventarios.slice(i, i + 5))
      }

      for (const chunk of chunks) {
        const resultados = await Promise.allSettled(
          chunk.map(async (inv: any) => {
            const resDetalle = await fetch(`${API_URL}/almacen/admin/detalle-inventario/${inv.id}/`)
            if (resDetalle.ok) {
              const detalle = await resDetalle.json()
              const s = detalle.sesion || {}
              return (detalle.bienes ?? []).map((b: any) => ({
                ...b,
                sesion_nombre: inv.nombre,
                sesion_servicio: inv.servicio || '',
                sesion_fecha: inv.fecha || '',
                // Colaboradores que realizaron el inventario (para "quién lo hizo").
                sesion_colaborador1_nombre: s.colaborador1_nombre || '',
                sesion_colaborador1_cargo: s.colaborador1_cargo || '',
                sesion_colaborador2_nombre: s.colaborador2_nombre || '',
                sesion_colaborador2_cargo: s.colaborador2_cargo || '',
              }))
            }
            return []
          })
        )
        for (const r of resultados) {
          if (r.status === 'fulfilled' && r.value) {
            r.value.forEach((b: any) => { if (b.placa) todasPlacas.add(b.placa) })
            todosBienes.push(...r.value)
          }
        }
      }
    }
  } catch { /* silenciar */ }

  return { bienes: todosBienes, placas: todasPlacas }
}

// ============================================
// API: BIENES PENDIENTES DE UN SERVICIO (paginado)
// ============================================

export interface ResultadoPendientesPaginado {
  bienes: BienPendiente[]
  total: number
  hayMas: boolean
  offset: number
  nombreServicio?: string
}

/**
 * Carga bienes pendientes de un servicio usando inventario-regional + ubicación.
 * Misma lógica que la pestaña de Inventario Regional (servicio + ubicación fusionados).
 * @param codigoServicio Código del servicio
 * @param placasInventariadas Set de placas ya inventariadas (para filtrar)
 * @param offset No se usa (mantiene compatibilidad de firma)
 */
export async function cargarBienesPendientesServicioPaginado(
  codigoServicio: string,
  placasInventariadas: Set<string>,
  offset = 0,
): Promise<ResultadoPendientesPaginado> {
  // Si es segunda página (offset > 0), no hay más — ya se cargó todo en la primera
  if (offset > 0) {
    return { bienes: [], total: 0, hayMas: false, offset }
  }

  try {
    // 1. Traer bienes por servicio
    const res = await fetch(`${API_URL}/almacen/inventario-regional/?servicio=${encodeURIComponent(codigoServicio)}`)
    if (!res.ok) return { bienes: [], total: 0, hayMas: false, offset: 0 }
    const data = await res.json()
    const bienesServicio: any[] = data.data ?? []

    // Mapa de placas para fusión
    const placasMap = new Map<string, BienPendiente>()
    for (const b of bienesServicio) {
      if (b.placa) {
        placasMap.set(b.placa, {
          placa: b.placa,
          descripcion: b.descripcion || '',
          responsable: b.responsable || '',
          cedula: b.cedula || '',
        })
      }
    }

    // 2. Buscar ubicación TNS del servicio y fusionar
    const ciudadMap: Record<string, string> = {
      '3000-GURPBLLA': 'BARRANQUILLA', '3000-GURPCALI': 'CALI', '3000-GURPCAR': 'CARTAGENA',
      '3000-GURPCUC': 'CUCUTA', '3000-GURPFLO': 'FLORENCIA', '3000-GURPMED': 'MEDELLIN',
      '3000-GURPNEIVA': 'NEIVA', '3000-GURPPO': 'POPAYAN', '3000-GURPVILLA': 'VILLAVICENCIO',
      '3000-ENLARIOHACHA': 'RIOHACHA', '3000-ENLSANTAMARTA': 'SANTA MARTA',
      '3000-ENLVALLEDUPAR': 'VALLEDUPAR', '3000-ENLARM': 'ARMENIA',
      '3000-ENLB/TURA': 'BUENAVENTURA', '3000-ENLMANIZALES': 'MANIZALES',
      '3000-ENLPEREI': 'PEREIRA', '3000-ENLMONT': 'MONTERIA', '3000-ENLSINCE': 'SINCELEJO',
      '3000-ENLB/MANGA': 'BUCARAMANGA', '3000-ENLB/MEJA': 'BARRANCABERMEJA',
      '3000-ENLMOCOA': 'MOCOA', '3000-ENLAPAR': 'APARTADO', '3000-ENLQUIBDO': 'QUIBDO',
      '3000-ENLIBAGUE': 'IBAGUE', '3000-ENLPASTO': 'PASTO', '3000-ENLTUM': 'TUMACO',
      '3000-ENLARAUCA': 'ARAUCA', '3000-ENLYOPAL': 'YOPAL', '3000-ENLTUNJA': 'TUNJA',
      'BOGOTA': 'BOGOTA',
    }

    const ciudad = ciudadMap[codigoServicio]
    if (ciudad) {
      try {
        const resUbic = await fetch(`${API_URL}/almacen/ubicaciones-tns/?q=${encodeURIComponent(ciudad)}`)
        if (resUbic.ok) {
          const ubicData = await resUbic.json()
          const ubicaciones = ubicData.ubicaciones ?? []
          const ubic = ubicaciones.find((u: any) => (u.nombre || '').toUpperCase().includes(ciudad))
          if (ubic) {
            const resB = await fetch(`${API_URL}/almacen/bienes-por-ubicacion/?ubicacion_id=${ubic.id}`)
            if (resB.ok) {
              const bData = await resB.json()
              const bienesUbic: any[] = bData.data ?? []
              for (const b of bienesUbic) {
                if (b.placa && !placasMap.has(b.placa)) {
                  placasMap.set(b.placa, {
                    placa: b.placa,
                    descripcion: b.descripcion || '',
                    responsable: b.responsable || '',
                    cedula: b.cedula || '',
                  })
                }
              }
            }
          }
        }
      } catch { /* no bloquear */ }
    }

    // 3. Filtrar: solo los NO inventariados
    const bienesPendientes = Array.from(placasMap.values()).filter(
      b => !placasInventariadas.has(b.placa)
    )

    // Ordenar por placa
    bienesPendientes.sort((a, b) => a.placa.localeCompare(b.placa))

    // Extraer nombre del servicio desde el primer bien
    const nombreServicio = bienesServicio.length > 0
      ? (bienesServicio[0].dependencia || '').trim()
      : ''

    return {
      bienes: bienesPendientes,
      total: placasMap.size,
      hayMas: false,
      offset: 0,
      nombreServicio,
    }
  } catch { /* silenciar */ }
  return { bienes: [], total: 0, hayMas: false, offset }
}

/**
 * @deprecated Usar cargarBienesPendientesServicioPaginado en su lugar.
 * Mantiene compatibilidad con componentes que aún no migran.
 */
export async function cargarBienesPendientesServicio(
  codigoServicio: string,
  placasInventariadas: Set<string>,
): Promise<BienPendiente[]> {
  try {
    const res = await fetch(`${API_URL}/almacen/admin/contar-bienes-servicio/?detalle_servicio=${codigoServicio}`)
    if (res.ok) {
      const data = await res.json()
      const bienes = data.bienes ?? []
      return bienes.filter((b: any) => !placasInventariadas.has(b.placa))
    }
  } catch { /* silenciar */ }
  return []
}


/** Usuario trabajando ahora en un servicio (presencia en vivo del dashboard). */
export interface ServicioActivoUsuarios {
  codigo_servicio: string
  nombre_servicio: string
  usuarios: { usuario: string; cedula: string }[]
  total_bienes: number
}

/**
 * Trae las sesiones colaborativas ACTIVAS con los usuarios que están
 * inventariando ahora en cada servicio (presencia en vivo). Para el Dashboard:
 * "quién está trabajando en qué servicio". Devuelve un mapa código→info.
 */
export async function cargarSesionesActivas(): Promise<Map<string, ServicioActivoUsuarios>> {
  const mapa = new Map<string, ServicioActivoUsuarios>()
  try {
    const res = await fetch(`${API_URL}/almacen/colaborativo/sesiones-activas/`, { headers: getApiHeaders() })
    if (res.ok) {
      const data = await res.json()
      const servicios = data.servicios ?? {}
      for (const cod of Object.keys(servicios)) {
        const s = servicios[cod]
        mapa.set(cod, {
          codigo_servicio: s.codigo_servicio || cod,
          nombre_servicio: s.nombre_servicio || cod,
          usuarios: Array.isArray(s.usuarios) ? s.usuarios : [],
          total_bienes: s.total_bienes || 0,
        })
      }
    }
  } catch { /* silenciar */ }
  return mapa
}
