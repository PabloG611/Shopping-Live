/**
 * vehiculosBogotaService.ts
 *
 * Persistencia de asignación de vehículos de Bogotá (Sede Principal) por
 * inventariador. Reutiliza el endpoint genérico de configuración de inventario
 * con la clave `vehiculos_bogota::<username>` → lista de placas asignadas.
 *
 * También expone la reconstrucción del tablero desde BD (todas las claves con
 * el prefijo) para armar la vista de asignaciones en GestionUnp.
 */

import { getApiHeaders } from '../utils/apiHeaders'

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

const PREFIJO_CLAVE = 'vehiculos_bogota::'
// Clave que guarda la lista de inventariadores del tablero (aunque no tengan
// placas todavía), para que el tablero se conserve al recargar la página.
const CLAVE_TABLERO = 'vehiculos_bogota_tablero'

/** Construye la clave de configuración por usuario. */
function claveVehiculosUsuario(username: string): string {
  return `${PREFIJO_CLAVE}${username.trim().toLowerCase()}`
}

/** Miembro del tablero: username + nombre para reconstruir aunque no tenga placas. */
export interface MiembroTablero {
  username: string
  nombreCompleto: string
}

/**
 * Guarda la lista de miembros del tablero. Se persiste como JSON de strings
 * "username|nombre" en valor_json (que es una lista de strings).
 */
export async function guardarTableroMiembros(miembros: MiembroTablero[]): Promise<boolean> {
  try {
    const valor = miembros.map((m) => `${m.username}|${m.nombreCompleto}`)
    const res = await fetch(`${API_URL}/almacen/configuracion-inventario/guardar/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ clave: CLAVE_TABLERO, valor }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Lee la lista de miembros del tablero. */
export async function fetchTableroMiembros(): Promise<MiembroTablero[]> {
  try {
    const res = await fetch(
      `${API_URL}/almacen/configuracion-inventario/?clave=${encodeURIComponent(CLAVE_TABLERO)}`,
      { headers: getApiHeaders() },
    )
    if (!res.ok) return []
    const data = await res.json()
    const valor: string[] = Array.isArray(data.valor) ? data.valor : []
    return valor.map((s) => {
      const [username, ...resto] = s.split('|')
      return { username, nombreCompleto: resto.join('|') || username }
    }).filter((m) => m.username)
  } catch {
    return []
  }
}

/** Fila de asignación reconstruida desde BD. */
export interface AsignacionVehiculosFila {
  username: string
  nombreCompleto: string
  placas: string[]
}

/**
 * Obtiene las placas de Bogotá asignadas a un usuario/inventariador específico.
 * Clave: `vehiculos_bogota::<username>`.
 */
export async function fetchVehiculosAsignados(username: string): Promise<string[]> {
  if (!username) return []
  try {
    const res = await fetch(
      `${API_URL}/almacen/configuracion-inventario/?clave=${encodeURIComponent(claveVehiculosUsuario(username))}`,
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
 * Guarda las placas de Bogotá asignadas a un usuario/inventariador.
 * Persiste también el nombre completo para poder reconstruir el tablero.
 */
export async function guardarVehiculosAsignados(
  username: string,
  placas: string[],
  nombreCompleto?: string,
): Promise<boolean> {
  if (!username) return false
  try {
    const res = await fetch(`${API_URL}/almacen/configuracion-inventario/guardar/`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        clave: claveVehiculosUsuario(username),
        valor: placas,
        actualizado_por: nombreCompleto || undefined,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Reconstruye el tablero de asignaciones de vehículos Bogotá directamente
 * desde BD: lee todas las configuraciones cuya clave empieza por
 * `vehiculos_bogota::` y devuelve cada inventariador con sus placas.
 * Es la única fuente de verdad (no requiere lista aparte).
 */
export async function reconstruirTableroVehiculosBogota(): Promise<AsignacionVehiculosFila[]> {
  try {
    const res = await fetch(`${API_URL}/almacen/configuracion-inventario/`, {
      headers: getApiHeaders(),
    })
    if (!res.ok) return []
    const data = await res.json()
    const configs: Array<{ clave?: string; valor?: unknown; actualizado_por?: string }> = data.configuraciones ?? []
    return configs
      .filter((c) => typeof c.clave === 'string' && c.clave.startsWith(PREFIJO_CLAVE))
      .map((c) => {
        const username = (c.clave as string).slice(PREFIJO_CLAVE.length)
        return {
          username,
          nombreCompleto: c.actualizado_por || username,
          placas: Array.isArray(c.valor) ? (c.valor as string[]) : [],
        }
      })
      .filter((fila) => fila.placas.length > 0)
  } catch {
    return []
  }
}
