import type { Bien, Persona, ResultadoConsulta } from '../types'
import { normalizarCedulaParaComparar } from '../utils/sanitizarCedula'
import { consultarActivosFirebird } from './activosFirebirdService'
import { florestaBuscarPorCedula, florestaBuscarPorPlaca } from './florestaService'
import { getApiHeaders } from '../utils/apiHeaders'
import { getAccessToken } from './tokenStore'
import { getAuthState } from '../utils/authState'

const API_BASE_URL = import.meta.env.VITE_APP_API_GAG || 'http://localhost:8000/api-gateway/'

export interface ConfiguracionSesionJson {
  numeroIdentificacionSesion: string
}

/** Consulta inventario por cédula usando el backend Firebird + Floresta SQL. */
export async function consultarBienesPorCedula(cedula: string): Promise<ResultadoConsulta | null> {
  const limpio = normalizarCedulaParaComparar(cedula)
  if (!limpio) return null

  try {
    // Consultar ambas fuentes en paralelo
    const [activosResp, bienesFloresta] = await Promise.all([
      consultarActivosFirebird(limpio).catch(() => null),
      florestaBuscarPorCedula(limpio).catch(() => []),
    ])

    // Si activos es null significa que falló la consulta (por ejemplo, error de conexión o 500)
    if (activosResp === null) {
      throw new Error('Error de conexión con el servicio de activos.')
    }

    const activos = activosResp.data
    const personaFirebird = activosResp.persona
    const tieneUNP = activos.length > 0
    const tieneFloresta = bienesFloresta.length > 0

    // Si no tiene bienes pero existe la persona en Firebird, retornar info básica
    if (!tieneUNP && !tieneFloresta && personaFirebird) {
      return {
        persona: {
          nombreCompleto: personaFirebird.nombre ?? '',
          tipoIdentificacion: 'CC',
          numeroIdentificacion: limpio,
          cargo: '',
          dependencia: '',
          grupo: '',
          sede: '',
        },
        bienesNormal: [],
        bienesFloresta: [],
      }
    }

    if (!tieneUNP && !tieneFloresta) return null

    // Persona: tomar de Firebird si está disponible, si no del primer resultado
    const persona: Persona = personaFirebird
      ? {
          nombreCompleto: personaFirebird.nombre ?? '',
          tipoIdentificacion: 'CC',
          numeroIdentificacion: limpio,
          cargo: '',
          dependencia: '',
          grupo: '',
          sede: '',
        }
      : {
          nombreCompleto: tieneUNP
            ? (activos[0].nombre_responsable ?? '')
            : (bienesFloresta[0].responsable_nombre ?? ''),
          tipoIdentificacion: 'CC',
          numeroIdentificacion: limpio,
          cargo: '',
          dependencia: '',
          grupo: '',
          sede: '',
        }

    // Bienes UNP (Firebird)
    const bienesNormal: Bien[] = tieneUNP
      ? activos.map((a, idx) => ({
          id: `${a.placa}-${idx}`,
          placa: a.placa,
          descripcion: a.descripcion ?? '',
          serial: a.serial ?? null,
          codigo: a.grupo_bien ?? '',
          nombreDependencia: a.nombre_dependencia ?? null,
          tipo: 'normal' as const,
          pendienteInventario: !a.inventariado,
          ultimoPrefijo: a.ultimo_prefijo ?? '',
          valorActual: a.valorcomp ?? null,
        }))
      : []

    // Bienes Floresta (SQL local)
    const bienesFlo: Bien[] = bienesFloresta.map((b, idx) => ({
      id: `F-${b.placa}-${idx}`,
      placa: b.placa,
      descripcion: b.descripcion ?? '',
      serial: null,
      codigo: '',
      tipo: 'floresta' as const,
      pendienteInventario: !b.inventariado, // Si NO está inventariado, está pendiente
    }))

    return {
      persona,
      bienesNormal,
      bienesFloresta: bienesFlo,
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error consultando bienes:', error)
    }
    return null
  }
}

// Cache para la cédula del usuario
let cedulaCache: string | null = null
let cedulaCachePromise: Promise<string> | null = null

/** Configuración de sesión - Obtiene la cédula del usuario autenticado desde el bk-sgai */
export async function obtenerConfiguracionSesion(): Promise<ConfiguracionSesionJson> {
  // Si ya tenemos la cédula en caché, retornarla inmediatamente
  if (cedulaCache) {
    return { numeroIdentificacionSesion: cedulaCache }
  }

  // Si ya hay una petición en curso, esperar a que termine
  if (cedulaCachePromise) {
    const cedula = await cedulaCachePromise
    return { numeroIdentificacionSesion: cedula }
  }

  // Crear una nueva petición y guardarla en el caché de promesas
  cedulaCachePromise = (async () => {
    try {
      // Esperar a que el token esté disponible (UserRoute puede no haber validado aún)
      let intentos = 0
      while (!getAccessToken() && intentos < 20) {
        await new Promise(resolve => setTimeout(resolve, 250))
        intentos++
      }
      
      if (!getAccessToken()) {
        throw new Error('No se encontró token de autenticación')
      }

      // Obtener id_busuario del auth_state (desde memoria)
      const authState = getAuthState()
      if (!authState) {
        throw new Error('No hay sesión activa')
      }
      
      const idBusuario = authState.user?.id_busuario
      
      if (!idBusuario) {
        throw new Error('No se encontró id_busuario en la sesión')
      }

      const url = `${API_BASE_URL}almacen/usuario/mi-cedula/?id_busuario=${idBusuario}`

      const response = await fetch(url, {
        method: 'GET',
        headers: getApiHeaders(),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Error HTTP: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (!data.ok || !data.cedula) {
        throw new Error('No se pudo obtener la cédula del usuario')
      }
      
      cedulaCache = data.cedula
      return data.cedula
      
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[obtenerConfiguracionSesion] Error al obtener configuración:', error)
      }
      
      cedulaCachePromise = null
      throw new Error('No se pudo obtener la cédula del usuario.')
    }
  })()

  const cedula = await cedulaCachePromise
  cedulaCachePromise = null
  return { numeroIdentificacionSesion: cedula }
}

/** Invalida el caché de la cédula (útil al hacer logout o cambiar de usuario) */
export function invalidarCacheCedula(): void {
  cedulaCache = null
  cedulaCachePromise = null
}

/** Útil en pruebas o al cambiar de usuario sin recargar el módulo. */
export function invalidarCacheInventarios(): void {
  // Ya no hay caché local — Firebird responde en tiempo real
}

/** Resultado de consulta por placa individual */
export interface ResultadoConsultaPlaca {
  placa: string
  descripcion: string
  serial: string | null
  responsable: string | null
  cedulaResponsable: string | null
  dependencia: string | null
  codigoDependencia: string | null
  pendienteInventario?: boolean
  /** Último prefijo de documento (BJ = en proceso de baja, CB = confirmado baja) */
  ultimoPrefijo?: string | null
  /** Valor/precio actual del bien */
  valorActual?: number | null
}

/** Consulta un bien individual por su placa. Si empieza con F → Floresta primero, si no → Firebird. */
export async function consultarBienPorPlaca(placa: string): Promise<ResultadoConsultaPlaca | null> {
  const limpio = placa.trim()
  if (!limpio) return null

  // Si empieza con F → buscar primero en Floresta, con fallback a Firebird
  if (limpio.toUpperCase().startsWith('F')) {
    const bien = await florestaBuscarPorPlaca(limpio)
    if (bien) {
      return {
        placa: bien.placa,
        descripcion: bien.descripcion ?? '',
        serial: null,
        responsable: bien.responsable_nombre ?? null,
        cedulaResponsable: bien.responsable_cedula ?? null,
        dependencia: bien.ubicacion ?? 'Sin ubicación',
        codigoDependencia: null,  // No agregar prefijo, la ubicación ya viene completa
        pendienteInventario: !bien.inventariado,
      }
    }
    // Si no se encontró en Floresta, intentar en Firebird como fallback
  }

  // Si no → buscar en Firebird (UNP)
  try {
    const url = `${API_BASE_URL}almacen/admin/buscar-bien/?placa=${encodeURIComponent(limpio)}`
    const response = await fetch(url, {
      method: 'GET',
      headers: getApiHeaders(),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Error HTTP: ${response.status}`)
    }

    const data = await response.json()

    if ('error' in data) {
      throw new Error(data.error)
    }

    const bien = data.data

    // Verificar si está pendiente de inventario
    let pendienteInventario = false
    try {
      const resPend = await fetch(`${API_BASE_URL}almacen/pendientes-inventario/?cedula=${bien.cedulaResponsable ?? ''}`, {
        headers: getApiHeaders()
      })
      if (resPend.ok) {
        const jsonPend = await resPend.json()
        const placasPend: string[] = (jsonPend.data ?? []).map((p: { placa: string }) => p.placa)
        pendienteInventario = placasPend.includes(limpio)
      }
    } catch { /* ignorar */ }

    return {
      placa: bien.codigo,
      descripcion: bien.desmat ?? '',
      serial: bien.serial ?? null,
      responsable: bien.responsable ?? null,
      cedulaResponsable: bien.cedulaResponsable ?? null,
      dependencia: bien.dependencia ?? null,
      codigoDependencia: bien.codigoDependencia ?? null,
      pendienteInventario,
      ultimoPrefijo: bien.ultimoPrefijo ?? null,
      valorActual: bien.valorcomp ?? null,
    }
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error('Error desconocido al consultar placa')
  }
}


/** Resultado individual dentro de una consulta masiva */
export interface ResultadoConsultaMasiva {
  cedula: string
  persona: Persona | null
  bienesNormal: Bien[]
  bienesFloresta: Bien[]
  error?: string
}

/**
 * Consulta masiva: recibe un array de cédulas y consulta bienes de cada una.
 * Ejecuta en lotes para no saturar el backend.
 */
export async function consultarBienesMasivo(
  cedulas: string[],
  onProgreso?: (completadas: number, total: number) => void,
): Promise<ResultadoConsultaMasiva[]> {
  const TAMANO_LOTE = 3
  const resultados: ResultadoConsultaMasiva[] = []
  let completadas = 0

  for (let i = 0; i < cedulas.length; i += TAMANO_LOTE) {
    const lote = cedulas.slice(i, i + TAMANO_LOTE)
    const promesas = lote.map(async (cedula): Promise<ResultadoConsultaMasiva> => {
      try {
        const r = await consultarBienesPorCedula(cedula)
        if (!r) {
          return { cedula, persona: null, bienesNormal: [], bienesFloresta: [], error: 'Sin resultados' }
        }
        return {
          cedula,
          persona: r.persona,
          bienesNormal: r.bienesNormal,
          bienesFloresta: r.bienesFloresta,
        }
      } catch {
        return { cedula, persona: null, bienesNormal: [], bienesFloresta: [], error: 'Error de consulta' }
      }
    })

    const resLote = await Promise.all(promesas)
    resultados.push(...resLote)
    completadas += lote.length
    onProgreso?.(completadas, cedulas.length)
  }

  return resultados
}

/** Placas pendientes de inventario para una cédula */
export async function consultarPendientesInventario(cedula: string): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE_URL}almacen/pendientes-inventario/?cedula=${cedula}`, {
      headers: getApiHeaders()
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []).map((p: { placa: string }) => p.placa)
  } catch {
    return []
  }
}
