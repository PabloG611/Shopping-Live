/**
 * Utilidad para obtener datos del usuario autenticado desde auth_state
 * Los datos vienen de graph_data (Microsoft Graph API)
 */

import { getAuthStateRaw } from '../services/tokenStore'

export interface GraphData {
  displayName: string
  givenName: string
  surname: string
  mail: string
  userPrincipalName: string
  jobTitle: string
  officeLocation: string
  businessPhones: string[]
  mobilePhone: string | null
  preferredLanguage: string | null
  id: string
}

export interface AuthStateUser {
  id_busuario: string
  username: string
  nombres: string
  cedula?: string
}

export interface AuthState {
  user: AuthStateUser
  graph_data: GraphData
  access_token: string
  refresh_token: string
  session_id: string
  expiresAt: number
}

/**
 * Obtiene el auth_state completo desde el tokenStore
 */
export function getAuthState(): AuthState | null {
  try {
    const authStateStr = getAuthStateRaw()
    if (!authStateStr) return null
    
    const authState = JSON.parse(authStateStr) as AuthState
    return authState
  } catch (error) {
    console.error('[getAuthState] Error parseando auth_state:', error)
    return null
  }
}

/**
 * Obtiene solo los datos del usuario desde auth_state
 */
export function getAuthUser(): AuthStateUser | null {
  const authState = getAuthState()
  return authState?.user ?? null
}

/**
 * Obtiene los datos de Microsoft Graph
 */
export function getGraphData(): GraphData | null {
  const authState = getAuthState()
  return authState?.graph_data ?? null
}

/**
 * Obtiene el nombre completo del usuario autenticado desde graph_data.displayName
 */
export function getAuthUserFullName(): string {
  const graphData = getGraphData()
  return graphData?.displayName?.trim() || ''
}

/**
 * Obtiene un IDENTIFICADOR ÚNICO del usuario autenticado.
 *
 * Se prioriza la cédula real, pero el auth_state del ecosistema (Microsoft
 * Graph) NO siempre trae `user.cedula` (llega vacía). El inventario colaborativo
 * usa este valor como identificador para DIRIGIR y FILTRAR eventos por usuario
 * (participante_unido, observaciones, alertas de duplicado, etc.). Si va vacío,
 * TODOS esos filtros fallan (dos usuarios se ven como "el mismo" o como "nadie").
 *
 * Por eso, cuando la cédula real no existe, se cae a un identificador único y
 * ESTABLE del usuario: `id_busuario` (o el userPrincipalName/mail de Graph como
 * último recurso). Así cada participante tiene un id distinto y no vacío.
 */
export function getAuthUserCedula(): string {
  const user = getAuthUser()
  const cedulaReal = (user?.cedula || '').trim()
  if (cedulaReal) return cedulaReal

  // Fallback: identificador único del usuario que SÍ viene en el auth_state.
  const idBusuario = (user?.id_busuario || '').trim()
  if (idBusuario) return idBusuario

  const graph = getGraphData()
  return (graph?.id || graph?.userPrincipalName || graph?.mail || '').trim()
}

/**
 * Obtiene ÚNICAMENTE la cédula REAL del usuario (sin fallback a id_busuario).
 *
 * A diferencia de `getAuthUserCedula()` —que cae a `id_busuario`/Graph para
 * tener un identificador estable en el colaborativo—, esta función devuelve
 * cadena vacía si no hay una cédula real. Úsese donde el valor se muestra o se
 * guarda como CÉDULA de una persona (ej. modal de guardar inventario), donde un
 * UUID no tiene sentido.
 */
export function getAuthUserCedulaReal(): string {
  const user = getAuthUser()
  return (user?.cedula || '').trim()
}

/**
 * Obtiene el cargo del usuario autenticado
 * Extrae la primera parte del jobTitle antes del " - "
 * Ejemplo: "Contratista - Almacen General" → "Contratista"
 */
export function getAuthUserCargo(): string {
  const graphData = getGraphData()
  const jobTitle = graphData?.jobTitle?.trim() || ''
  
  if (!jobTitle) return ''
  
  // Si tiene " - ", tomar solo la primera parte (cargo)
  const indexGuion = jobTitle.indexOf(' - ')
  if (indexGuion === -1) return jobTitle
  
  return jobTitle.substring(0, indexGuion).trim()
}

/**
 * Obtiene la dependencia del usuario autenticado desde graph_data.officeLocation
 */
export function getAuthUserDependencia(): string {
  const graphData = getGraphData()
  return graphData?.officeLocation?.trim() || ''
}

/**
 * Obtiene el grupo del usuario autenticado
 * Extrae la segunda parte del jobTitle después del " - "
 * Ejemplo: "Contratista - Almacen General" → "Almacen General"
 */
export function getAuthUserGrupo(): string {
  const graphData = getGraphData()
  const jobTitle = graphData?.jobTitle?.trim() || ''
  
  if (!jobTitle) return ''
  
  // Si tiene " - ", tomar la segunda parte (grupo)
  const indexGuion = jobTitle.indexOf(' - ')
  if (indexGuion === -1) return ''
  
  return jobTitle.substring(indexGuion + 3).trim()
}

/**
 * Obtiene la sede del usuario autenticado
 * Por defecto retorna "SEDE PRINCIPAL" (puede ajustarse según necesidad)
 */
export function getAuthUserSede(): string {
  // La sede no viene en graph_data, usar valor por defecto
  return 'SEDE PRINCIPAL'
}

/**
 * Obtiene el id_busuario del usuario autenticado
 */
export function getAuthUserId(): string {
  const user = getAuthUser()
  return user?.id_busuario || ''
}
