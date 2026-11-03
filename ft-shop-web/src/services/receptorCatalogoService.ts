import type { Persona } from '../types'

const API_BASE_URL = import.meta.env.VITE_APP_API_GAG || 'http://localhost:8000/api-gateway/'

export type OpcionSelect = { value: string; label: string; nombre?: string }

export interface CatalogoReceptoresData {
  dependencias: OpcionSelect[]
  grupos: OpcionSelect[]
  sedes: OpcionSelect[]
  receptoresRegistrados: Persona[]
}

// Cache para evitar múltiples llamadas
let cacheDependencias: OpcionSelect[] | null = null
const cacheGrupos: Map<string, OpcionSelect[]> = new Map() // Cache por dependencia
let cacheSedes: OpcionSelect[] | null = null

/**
 * Obtiene las dependencias desde el endpoint del sistema (ecosistema)
 */
async function cargarDependencias(): Promise<OpcionSelect[]> {
  if (cacheDependencias) return cacheDependencias
  
  try {
    // Usar el endpoint del sistema que usa el ecosistema
    const response = await fetch(`${API_BASE_URL}sistema/dependencia`)
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Error cargando dependencias:', response.status, errorText)
      throw new Error(`Error cargando dependencias: ${response.status}`)
    }
    const data = await response.json()
    
    const arrayDependencias = Array.isArray(data) ? data : (data.data || data.results || data.dependencias || [])
    
    const dependencias = arrayDependencias.map((dep: any) => ({
      value: String(dep.id_dependencia),
      label: dep.nombre_dependencia,
      nombre: dep.nombre_dependencia,
    }))
    
    cacheDependencias = dependencias
    return dependencias
  } catch (error) {
    console.error('Error cargando dependencias:', error)
    throw error // Re-lanzar el error para que se vea en el componente
  }
}

/**
 * Obtiene los grupos filtrados por dependencia
 * NOTA: El endpoint del ecosistema no filtra por dependencia, 
 * así que debemos filtrar localmente
 */
async function cargarGruposPorDependencia(dependenciaId: string): Promise<OpcionSelect[]> {
  if (cacheGrupos.has(dependenciaId)) {
    return cacheGrupos.get(dependenciaId)!
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}usuario/grupo`)
    if (!response.ok) throw new Error('Error cargando grupos')
    const data = await response.json()
    
    const arrayGrupos = Array.isArray(data) ? data : (data.data || data.results || data.grupos || [])
    
    // Filtrar por dependencia (el campo se llama 'dependencia', no 'dependencia_id')
    const gruposFiltrados = arrayGrupos.filter((grupo: any) => 
      String(grupo.dependencia) === String(dependenciaId)
    )
    
    const grupos = gruposFiltrados.map((grupo: any) => ({
      value: String(grupo.id_grupo),
      label: grupo.nombre_grupo,
      nombre: grupo.nombre_grupo,
    }))
    
    cacheGrupos.set(dependenciaId, grupos)
    return grupos
  } catch (error) {
    console.error('Error cargando grupos por dependencia:', error)
    return []
  }
}

/**
 * Obtiene todos los grupos (sin filtrar) desde el endpoint del usuario (ecosistema)
 */
async function cargarTodosLosGrupos(): Promise<OpcionSelect[]> {
  try {
    const response = await fetch(`${API_BASE_URL}usuario/grupo`)
    if (!response.ok) throw new Error('Error cargando grupos')
    const data = await response.json()
    
    const arrayGrupos = Array.isArray(data) ? data : (data.data || data.results || data.grupos || [])
    
    const grupos = arrayGrupos.map((grupo: any) => ({
      value: String(grupo.id_grupo),
      label: grupo.nombre_grupo,
      nombre: grupo.nombre_grupo,
    }))
    return grupos
  } catch (error) {
    console.error('Error cargando todos los grupos:', error)
    return []
  }
}

/**
 * Obtiene las sedes desde el endpoint del módulo almacen
 */
async function cargarSedes(): Promise<OpcionSelect[]> {
  if (cacheSedes) return cacheSedes
  
  try {
    const response = await fetch(`${API_BASE_URL}almacen/catalogos/sedes/`)
    if (!response.ok) throw new Error('Error cargando sedes')
    const data = await response.json()
    const sedes = data.map((sede: any) => ({
      value: sede.nombre,
      label: sede.nombre,
    }))
    cacheSedes = sedes
    return sedes
  } catch (error) {
    console.error('Error cargando sedes:', error)
    return []
  }
}

export async function obtenerOpcionesReceptorCatalogo(dependenciaId?: string): Promise<{
  dependencias: OpcionSelect[]
  grupos: OpcionSelect[]
  sedes: OpcionSelect[]
}> {
  const [dependencias, sedes] = await Promise.all([
    cargarDependencias(),
    cargarSedes(),
  ])
  
  // Si se proporciona dependenciaId, cargar grupos filtrados
  // Si no, cargar todos los grupos
  const grupos = dependenciaId 
    ? await cargarGruposPorDependencia(dependenciaId)
    : await cargarTodosLosGrupos()
  
  return {
    dependencias,
    grupos,
    sedes,
  }
}

/**
 * Busca datos básicos del usuario en la base de datos de usuarios (DatosBasicosUsuario)
 * usando el endpoint ConsultarUsuario
 * Solo funciona para CC (cédula de ciudadanía)
 */
async function buscarDatosBasicosPorCedula(cedula: string): Promise<Persona | null> {
  try {
    const response = await fetch(`${API_BASE_URL}almacen/usuario/buscar-por-cedula/?cedula=${cedula}`)
    
    if (!response.ok) {
      return null
    }
    
    const data = await response.json()
    
    if (data.ok) {
      return {
        tipoIdentificacion: 'CC',
        numeroIdentificacion: data.cedula || cedula,
        primerNombre: '',
        segundoNombre: '',
        primerApellido: '',
        segundoApellido: '',
        nombreCompleto: data.nombreCompleto || '',
        cargo: data.cargo || '',
        dependencia: data.dependencia || '',
        grupo: data.grupo || '',
        sede: data.sede || '',
        numeroContrato: data.numeroContrato || '',
      }
    }
    
    return null
  } catch (error) {
    console.error('Error consultando datos básicos:', error)
    return null
  }
}

export async function buscarReceptorPorDocumento(
  tipoIdentificacion: string,
  numeroIdentificacion: string,
): Promise<Persona | null> {
  if (tipoIdentificacion === 'CC') {
    const datosBasicos = await buscarDatosBasicosPorCedula(numeroIdentificacion)
    if (datosBasicos) {
      return datosBasicos
    }
  }
  
  try {
    const response = await fetch(
      `${API_BASE_URL}almacen/catalogos/buscar-receptor/?tipo=${tipoIdentificacion}&numero=${numeroIdentificacion}`
    )
    
    if (!response.ok) {
      return null
    }
    
    const data = await response.json()
    
    if (data.encontrado) {
      const receptor = data.receptor
      const resultado = {
        tipoIdentificacion: receptor.tipoIdentificacion,
        numeroIdentificacion: receptor.numeroIdentificacion,
        primerNombre: receptor.primerNombre || '',
        segundoNombre: receptor.segundoNombre || '',
        primerApellido: receptor.primerApellido || '',
        segundoApellido: receptor.segundoApellido || '',
        nombreCompleto: receptor.nombreCompleto || '',
        cargo: receptor.cargo || '',
        dependencia: receptor.dependencia || '',
        grupo: receptor.grupo || '',
        sede: receptor.sede || '',
        numeroContrato: '',
      }
      console.log('[buscarReceptorPorDocumento] RETORNANDO datos del catálogo:', resultado)
      return resultado
    }
    
    return null
  } catch (error) {
    console.error('Error buscando receptor:', error)
    return null
  }
}

// ============================================
// BÚSQUEDA COMBINADA POR NOMBRE (Firebird + API)
// ============================================

export interface TerceroFirebird {
  terid: number
  nombre: string
  cedula: string
}

/**
 * Busca terceros en Firebird por nombre o cédula parcial.
 * Retorna lista de resultados para autocompletado.
 * GET /almacen/vehiculos/buscar-tercero/?q=GAMBOA
 */
export async function buscarTerceroPorNombreOCedula(query: string): Promise<TerceroFirebird[]> {
  if (!query || query.trim().length < 3) return []

  try {
    const response = await fetch(
      `${API_BASE_URL}almacen/vehiculos/buscar-tercero/?q=${encodeURIComponent(query.trim())}`
    )
    if (!response.ok) return []
    const data = await response.json()
    return data.resultados ?? []
  } catch {
    return []
  }
}

/**
 * Busca un tercero por nombre/cédula en Firebird y luego trae sus datos completos
 * de la API de usuarios (cargo, dependencia, grupo, sede).
 * Combina ambas fuentes.
 */
export async function buscarReceptorCombinado(cedula: string): Promise<Persona | null> {
  // Primero buscar datos completos en la API de usuarios
  const datosCompletos = await buscarReceptorPorDocumento('CC', cedula)
  if (datosCompletos) return datosCompletos

  // Si no hay datos en la API, buscar al menos nombre en Firebird
  try {
    const response = await fetch(
      `${API_BASE_URL}almacen/vehiculos/buscar-tercero/?q=${encodeURIComponent(cedula)}`
    )
    if (response.ok) {
      const data = await response.json()
      const resultados = data.resultados ?? []
      const encontrado = resultados.find((r: TerceroFirebird) => r.cedula === cedula)
      if (encontrado) {
        return {
          tipoIdentificacion: 'CC',
          numeroIdentificacion: encontrado.cedula,
          primerNombre: '',
          segundoNombre: '',
          primerApellido: '',
          segundoApellido: '',
          nombreCompleto: encontrado.nombre,
          cargo: '',
          dependencia: '',
          grupo: '',
          sede: '',
          numeroContrato: '',
        }
      }
    }
  } catch { /* silenciar */ }

  return null
}
