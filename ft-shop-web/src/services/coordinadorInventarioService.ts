/**
 * Servicio de consulta de bienes por coordinador para el inventario físico.
 *
 * Encapsula la llamada al endpoint que devuelve todos los bienes asignados a un
 * coordinador (en todos los servicios), a partir de su cédula.
 */

const API_URL = (import.meta.env.VITE_APP_API_GAG ?? 'http://localhost:8000/api-gateway/').replace(/\/$/, '')

export interface BienCoordinador {
  placa: string
  descripcion?: string
  serial?: string
  servicio?: string
  servicio_nombre?: string
  responsable?: string
  [key: string]: any
}

export interface ResultadoBienesCoordinador {
  nombre: string
  bienes: BienCoordinador[]
}

/**
 * Consulta los bienes de un coordinador por cédula en TODOS los servicios.
 * Aplica un timeout de 90s vía AbortController.
 *
 * @throws Error con name 'AbortError' si se agota el tiempo, u otro Error si
 *         la respuesta no es OK.
 */
export async function buscarBienesPorCoordinador(cedula: string): Promise<ResultadoBienesCoordinador> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 90000)
  try {
    const res = await fetch(
      `${API_URL}/almacen/admin/bienes-por-coordinador/?cedula=${encodeURIComponent(cedula)}`,
      { signal: controller.signal }
    )
    if (!res.ok) throw new Error(`Error ${res.status} al consultar los bienes del coordinador`)
    const data = await res.json()
    const bienes: BienCoordinador[] = data.bienes || []
    const nombre: string = data.nombre || (bienes.length > 0 ? (bienes[0].responsable || cedula) : cedula)
    return { nombre, bienes }
  } finally {
    clearTimeout(timeoutId)
  }
}
