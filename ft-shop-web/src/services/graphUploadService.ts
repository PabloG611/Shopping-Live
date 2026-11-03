/**
 * graphUploadService.ts
 *
 * Sube archivos directamente a SharePoint via Microsoft Graph API,
 * sin pasar por el backend ni el API Gateway.
 *
 * Estructura en SharePoint:
 *   Library "Inventario web" (drive 'iv') → {servicio}/{placa}/{archivo}.jpg
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const SHAREPOINT_HOST = 'unproteccion.sharepoint.com'
const SHAREPOINT_SITE_PATH = '/sites/sg/gag'

// Cache de site_id y drive_id para no resolverlos en cada subida
let _siteId: string | null = null
let _driveId: string | null = null

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

async function resolveSiteAndDrive(token: string): Promise<{ siteId: string; driveId: string | null }> {
  if (_siteId) return { siteId: _siteId, driveId: _driveId }

  // Resolver site_id
  const siteRes = await fetch(
    `${GRAPH_BASE}/sites/${SHAREPOINT_HOST}:${SHAREPOINT_SITE_PATH}`,
    { headers: authHeader(token) }
  )
  if (!siteRes.ok) {
    throw new Error(`No se pudo resolver el site de SharePoint (${siteRes.status})`)
  }
  _siteId = (await siteRes.json()).id

  // Buscar drive 'Inventario web' o 'iv'
  const drivesRes = await fetch(
    `${GRAPH_BASE}/sites/${_siteId}/drives`,
    { headers: authHeader(token) }
  )
  if (drivesRes.ok) {
    const drives: { id: string; name: string; webUrl: string }[] = (await drivesRes.json()).value ?? []
    for (const d of drives) {
      const name = d.name.toLowerCase()
      const url = d.webUrl.toLowerCase()
      if (name === 'iv' || name === 'inventario web' || url.endsWith('/iv')) {
        _driveId = d.id
        break
      }
    }
  }

  return { siteId: _siteId!, driveId: _driveId }
}

function limpiarServicio(servicio: string): string {
  return resolverRutaSharepoint(servicio)
}

/**
 * Mapeo de códigos de servicio a su estructura jerárquica en SharePoint.
 * Estructura: GURP_Nombre/Ciudad
 * Los GURP mismos se mapean a: GURP_Nombre/Nombre
 * Bogotá y Tunja (independientes) van sin carpeta GURP padre.
 */
const ENLACE_A_GURP: Record<string, { gurp: string; ciudad: string }> = {
  // GURP Barranquilla (310)
  '3000-ENLARIOHACHA': { gurp: 'GURP_Barranquilla', ciudad: 'Riohacha' },
  '3000-ENLSANTAMARTA': { gurp: 'GURP_Barranquilla', ciudad: 'Santa_Marta' },
  '3000-ENLVALLEDUPAR': { gurp: 'GURP_Barranquilla', ciudad: 'Valledupar' },
  '3000-GURPBLLA': { gurp: 'GURP_Barranquilla', ciudad: 'Barranquilla' },
  // GURP Cali (320)
  '3000-ENLARM': { gurp: 'GURP_Cali', ciudad: 'Armenia' },
  '3000-ENLB/TURA': { gurp: 'GURP_Cali', ciudad: 'Buenaventura' },
  '3000-ENLMANIZALES': { gurp: 'GURP_Cali', ciudad: 'Manizales' },
  '3000-ENLPEREI': { gurp: 'GURP_Cali', ciudad: 'Pereira' },
  '3000-GURPCALI': { gurp: 'GURP_Cali', ciudad: 'Cali' },
  // GURP Cartagena (330)
  '3000-ENLMONT': { gurp: 'GURP_Cartagena', ciudad: 'Monteria' },
  '3000-ENLSINCE': { gurp: 'GURP_Cartagena', ciudad: 'Sincelejo' },
  '3000-GURPCAR': { gurp: 'GURP_Cartagena', ciudad: 'Cartagena' },
  // GURP Cúcuta (340)
  '3000-ENLB/MEJA': { gurp: 'GURP_Cucuta', ciudad: 'Barrancabermeja' },
  '3000-ENLB/MANGA': { gurp: 'GURP_Cucuta', ciudad: 'Bucaramanga' },
  '3000-GURPCUC': { gurp: 'GURP_Cucuta', ciudad: 'Cucuta' },
  // GURP Florencia (350)
  '3000-ENLMOCOA': { gurp: 'GURP_Florencia', ciudad: 'Mocoa' },
  '3000-GURPFLO': { gurp: 'GURP_Florencia', ciudad: 'Florencia' },
  // GURP Medellín (360)
  '3000-ENLAPAR': { gurp: 'GURP_Medellin', ciudad: 'Apartado' },
  '3000-ENLQUIBDO': { gurp: 'GURP_Medellin', ciudad: 'Quibdo' },
  '3000-GURPMED': { gurp: 'GURP_Medellin', ciudad: 'Medellin' },
  // GURP Neiva (370)
  '3000-ENLIBAGUE': { gurp: 'GURP_Neiva', ciudad: 'Ibague' },
  '3000-GURPNEIVA': { gurp: 'GURP_Neiva', ciudad: 'Neiva' },
  // GURP Popayán (380)
  '3000-ENLPASTO': { gurp: 'GURP_Popayan', ciudad: 'Pasto' },
  '3000-ENLTUM': { gurp: 'GURP_Popayan', ciudad: 'Tumaco' },
  '3000-GURPPO': { gurp: 'GURP_Popayan', ciudad: 'Popayan' },
  // GURP Villavicencio (390)
  '3000-ENLARAUCA': { gurp: 'GURP_Villavicencio', ciudad: 'Arauca' },
  '3000-ENLYOPAL': { gurp: 'GURP_Villavicencio', ciudad: 'Yopal' },
  '3000-GURPVILLA': { gurp: 'GURP_Villavicencio', ciudad: 'Villavicencio' },
  // Independientes
  '3000-ENLTUNJA': { gurp: '', ciudad: 'Tunja' },
  'BOGOTA': { gurp: '', ciudad: 'Bogota' },
  'BP001': { gurp: '', ciudad: 'Bodega_Principal' },
}

/**
 * Resuelve la ruta de carpeta en SharePoint para un servicio dado.
 * Retorna: "GURP_Villavicencio/Yopal" o "Bogota" (sin GURP padre).
 */
function resolverRutaSharepoint(servicio: string): string {
  const codigo = (servicio ?? '').trim()
  if (!codigo) return ''

  // Buscar en el mapeo
  const entry = ENLACE_A_GURP[codigo]
  if (entry) {
    return entry.gurp ? `${entry.gurp}/${entry.ciudad}` : entry.ciudad
  }

  // Fallback: limpiar el código como antes (para códigos no mapeados)
  return codigo
    .replace('3000-', '')
    .replace('ENLACE ', '')
    .replace('GURP ', '')
    .trim()
    .replace(/[\s/]+/g, '_')
    .slice(0, 40)
}

/**
 * Sube un archivo (base64) a SharePoint via Graph API.
 * - Si el archivo es <= 4 MB: usa upload simple (PUT /content)
 * - Si el archivo es > 4 MB: usa upload session con chunks (hasta 250 GB)
 *
 * Retorna la webUrl del archivo subido, o null si falla.
 */
export async function uploadFileToSharepoint(params: {
  token: string
  base64: string
  placa: string
  servicio: string
  nombreArchivo: string
  onProgress?: (percent: number) => void
}): Promise<string | null> {
  const { token, base64, placa, servicio, nombreArchivo, onProgress } = params

  // Decodificar base64
  let raw = base64
  if (raw.includes(',')) raw = raw.split(',')[1]
  const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0))

  const { siteId, driveId } = await resolveSiteAndDrive(token)

  const placa_ = placa.trim().toUpperCase()
  const servicio_ = limpiarServicio(servicio)
  const archivo_ = nombreArchivo.replace(/[\s#%]/g, '_')

  // Construir ruta del archivo
  let filePath: string
  if (driveId) {
    filePath = servicio_ ? `${servicio_}/${placa_}/${archivo_}` : `${placa_}/${archivo_}`
  } else {
    filePath = servicio_ ? `iv/${servicio_}/${placa_}/${archivo_}` : `iv/${placa_}/${archivo_}`
  }

  // Decidir método según tamaño
  const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024 // 4 MB

  if (bytes.length <= SIMPLE_UPLOAD_LIMIT) {
    return _simpleUpload({ token, bytes, siteId, driveId, filePath })
  }

  return _chunkedUpload({ token, bytes, siteId, driveId, filePath, onProgress })
}

/**
 * Upload simple para archivos <= 4 MB (PUT /content).
 */
async function _simpleUpload(params: {
  token: string
  bytes: Uint8Array
  siteId: string
  driveId: string | null
  filePath: string
}): Promise<string | null> {
  const { token, bytes, siteId, driveId, filePath } = params

  const uploadUrl = driveId
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${filePath}:/content`
    : `${GRAPH_BASE}/sites/${siteId}/drive/root:/${filePath}:/content`

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/octet-stream',
    },
    body: new Blob([bytes as BlobPart]),
  })

  if (res.ok) {
    return (await res.json()).webUrl ?? null
  }

  console.error(`[GraphUpload] Error ${res.status} subiendo ${filePath}:`, await res.text())
  return null
}

/**
 * Upload con sesión resumable para archivos > 4 MB.
 *
 * Especificaciones:
 * - Chunk size: 3.2 MB (múltiplo de 320 KB, recomendado por Microsoft)
 * - La uploadUrl devuelta por Graph es pre-autenticada (NO enviar Bearer)
 * - Sesión expira después de ~36 horas si no se completa
 * - Chunks deben ser secuenciales (no paralelos)
 * - Soporta hasta 250 GB
 */
async function _chunkedUpload(params: {
  token: string
  bytes: Uint8Array
  siteId: string
  driveId: string | null
  filePath: string
  onProgress?: (percent: number) => void
}): Promise<string | null> {
  const { token, bytes, siteId, driveId, filePath, onProgress } = params

  // Tamaño de chunk: 3.2 MB (3276800 bytes) — múltiplo de 320 KB
  const CHUNK_SIZE = 3.2 * 1024 * 1024
  const totalSize = bytes.length

  // Paso 1: Crear upload session
  const sessionEndpoint = driveId
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${filePath}:/createUploadSession`
    : `${GRAPH_BASE}/sites/${siteId}/drive/root:/${filePath}:/createUploadSession`

  const sessionRes = await fetch(sessionEndpoint, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item: {
        '@microsoft.graph.conflictBehavior': 'replace',
        name: filePath.split('/').pop() ?? 'archivo',
      }
    }),
  })

  if (!sessionRes.ok) {
    const errText = await sessionRes.text()
    console.error(`[GraphUpload] Error creando upload session (${sessionRes.status}):`, errText)
    return null
  }

  const { uploadUrl } = await sessionRes.json()

  // Paso 2: Subir en chunks secuenciales
  let offset = 0
  let webUrl: string | null = null

  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize)
    const chunk = bytes.slice(offset, end)
    const contentRange = `bytes ${offset}-${end - 1}/${totalSize}`

    // IMPORTANTE: NO enviar Authorization header a la uploadUrl
    // La URL ya tiene autenticación embebida
    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': `${chunk.length}`,
        'Content-Range': contentRange,
      },
      body: new Blob([chunk as BlobPart]),
    })

    if (!chunkRes.ok) {
      const errText = await chunkRes.text()
      console.error(`[GraphUpload] Error subiendo chunk ${contentRange} (${chunkRes.status}):`, errText)

      // Si es 416 (Range Not Satisfiable), la sesión se desincronizó
      if (chunkRes.status === 416) {
        console.error('[GraphUpload] Range no válido — sesión desincronizada')
      }
      return null
    }

    const data = await chunkRes.json()

    // El último chunk devuelve el item completo (tiene "id" y "webUrl")
    if (data.id && data.webUrl) {
      webUrl = data.webUrl
    }

    offset = end
    onProgress?.(Math.round((offset / totalSize) * 100))
  }

  return webUrl
}

/** Limpia el cache de site/drive (útil si cambia el tenant) */
export function clearGraphCache(): void {
  _siteId = null
  _driveId = null
}

/**
 * Verifica que hay CONEXIÓN REAL a SharePoint/Graph (no solo navigator.onLine,
 * que miente en muchos casos). Hace una petición ligera autenticada al site.
 * Devuelve true solo si Graph responde OK. Útil para abortar ANTES de intentar
 * un guardado que, sin red, dejaría el proceso en falso positivo.
 */
export async function verificarConexionSharepoint(token: string): Promise<boolean> {
  // Atajo barato: si el navegador sabe que está offline, ni intentamos.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    const res = await fetch(
      `${GRAPH_BASE}/sites/${SHAREPOINT_HOST}:${SHAREPOINT_SITE_PATH}`,
      { headers: authHeader(token) },
    )
    return res.ok
  } catch {
    return false
  }
}

/**
 * Lista los nombres de archivo que existen en la carpeta {servicio}/{placa} de
 * SharePoint. Es la verificación FUERTE contra el "falso subido": tras subir,
 * se listan los archivos reales de la carpeta y se confirma que están todos.
 * Devuelve un Set de nombres (en minúsculas) o null si no se pudo consultar
 * (p.ej. la carpeta no existe → nada se subió).
 */
export async function listarArchivosCarpeta(params: {
  token: string
  placa: string
  servicio: string
}): Promise<Set<string> | null> {
  const { token, placa, servicio } = params
  try {
    const { siteId, driveId } = await resolveSiteAndDrive(token)
    const placa_ = placa.trim().toUpperCase()
    const servicio_ = limpiarServicio(servicio)
    const ruta = servicio_ ? `${servicio_}/${placa_}` : placa_

    const url = driveId
      ? `${GRAPH_BASE}/drives/${driveId}/root:/${ruta}:/children?$select=name&$top=200`
      : `${GRAPH_BASE}/sites/${siteId}/drive/root:/${ruta}:/children?$select=name&$top=200`

    const res = await fetch(url, { headers: authHeader(token) })
    if (!res.ok) return null // 404 = carpeta inexistente → no se subió nada
    const data = await res.json()
    const nombres: string[] = (data.value ?? []).map((it: { name: string }) => (it.name || '').toLowerCase())
    return new Set(nombres)
  } catch {
    return null
  }
}

/**
 * Elimina una carpeta completa de SharePoint via Graph API.
 * Estructura esperada: {servicio}/{placa} dentro del drive "iv".
 * Retorna true si se eliminó (o no existía), false si hubo error.
 */
export async function deleteSharepointFolder(params: {
  token: string
  placa: string
  servicio: string
}): Promise<boolean> {
  const { token, placa, servicio } = params

  try {
    const { siteId, driveId } = await resolveSiteAndDrive(token)

    const placa_ = placa.trim().toUpperCase()
    const servicio_ = limpiarServicio(servicio)

    let folderUrl: string
    if (driveId) {
      const ruta = servicio_ ? `${servicio_}/${placa_}` : placa_
      folderUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${ruta}`
    } else {
      const ruta = servicio_ ? `iv/${servicio_}/${placa_}` : `iv/${placa_}`
      folderUrl = `${GRAPH_BASE}/sites/${siteId}/drive/root:/${ruta}`
    }

    const res = await fetch(folderUrl, {
      method: 'DELETE',
      headers: authHeader(token),
    })

    // 204 = eliminado, 404 = no existía (ambos OK)
    if (res.ok || res.status === 204 || res.status === 404) {
      return true
    }

    console.error(`[GraphDelete] Error ${res.status} eliminando carpeta ${placa_}:`, await res.text())
    return false
  } catch (err) {
    console.error('[GraphDelete] Error:', err)
    return false
  }
}


/**
 * Verifica que el usuario tiene permisos de ESCRITURA reales en la carpeta destino
 * de SharePoint. Sube un archivo de prueba de 1 byte, confirma que se creó, y lo elimina.
 * 
 * @param token - Access token de SharePoint/Graph
 * @param placa - Placa del vehículo (para construir la ruta)
 * @param servicio - Código del servicio (para construir la ruta)
 * @returns { ok: boolean; error?: string } - ok=true si tiene permisos de escritura
 */
export async function testSharepointWriteAccess(params: {
  token: string
  placa: string
  servicio: string
}): Promise<{ ok: boolean; error?: string }> {
  const { token, placa, servicio } = params

  try {
    const { siteId, driveId } = await resolveSiteAndDrive(token)

    const placa_ = placa.trim().toUpperCase()
    const servicio_ = limpiarServicio(servicio)
    const testFileName = `.write_test_${Date.now()}.tmp`

    // Construir URL de upload para el archivo de prueba
    let uploadUrl: string
    if (driveId) {
      const ruta = servicio_ ? `${servicio_}/${placa_}/${testFileName}` : `${placa_}/${testFileName}`
      uploadUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${ruta}:/content`
    } else {
      const ruta = servicio_ ? `iv/${servicio_}/${placa_}/${testFileName}` : `iv/${placa_}/${testFileName}`
      uploadUrl = `${GRAPH_BASE}/sites/${siteId}/drive/root:/${ruta}:/content`
    }

    // Intentar subir 1 byte
    const testBytes = new Uint8Array([0x00])
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        ...authHeader(token),
        'Content-Type': 'application/octet-stream',
      },
      body: new Blob([testBytes as BlobPart]),
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      if (res.status === 403) {
        return { ok: false, error: 'No tiene permisos de escritura en SharePoint. Contacte al administrador para que le asigne "Control Total" en la biblioteca.' }
      }
      if (res.status === 401) {
        return { ok: false, error: 'La sesión de SharePoint expiró. Reconecte SharePoint.' }
      }
      return { ok: false, error: `Error de SharePoint (${res.status}): ${errorText.slice(0, 100)}` }
    }

    // Upload exitoso — obtener el ID del archivo para eliminarlo
    const json = await res.json()
    const itemId = json.id

    // Eliminar el archivo de prueba
    if (itemId) {
      try {
        let deleteUrl: string
        if (driveId) {
          deleteUrl = `${GRAPH_BASE}/drives/${driveId}/items/${itemId}`
        } else {
          deleteUrl = `${GRAPH_BASE}/sites/${siteId}/drive/items/${itemId}`
        }
        await fetch(deleteUrl, { method: 'DELETE', headers: authHeader(token) })
      } catch {
        // No bloquear si la eliminación del test falla — el archivo es de 1 byte
      }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error verificando permisos de SharePoint' }
  }
}
