/**
 * idbCache.ts
 *
 * Caché persistente en IndexedDB para consultas lentas (TNS/Firebird del
 * dashboard). A diferencia de sessionStorage —que se borra al cerrar la
 * pestaña y tiene una cuota pequeña (~5 MB)—, IndexedDB:
 *   - Persiste entre sesiones y recargas (los datos sobreviven al cierre).
 *   - Soporta mucho más volumen (decenas/cientos de MB).
 *   - Guarda objetos estructurados sin serializar a string manualmente.
 *
 * API mínima tipo clave/valor con TTL. Es tolerante a fallos: si IndexedDB no
 * está disponible (modo incógnito estricto, navegador viejo), todas las
 * operaciones degradan a "no cacheado" sin lanzar errores.
 */

const DB_NAME = 'sgai-cache'
const DB_VERSION = 1
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase | null> | null = null

function abrirDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

interface Entrada<T> {
  ts: number
  data: T
}

/**
 * Lee un valor del caché. Devuelve `null` si no existe, está expirado (según
 * `ttlMs`) o IndexedDB no está disponible.
 */
export async function idbGet<T>(clave: string, ttlMs: number): Promise<T | null> {
  const db = await abrirDB()
  if (!db) return null
  return new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(clave)
      req.onsuccess = () => {
        const entrada = req.result as Entrada<T> | undefined
        if (!entrada) { resolve(null); return }
        if (Date.now() - entrada.ts > ttlMs) { resolve(null); return }
        resolve(entrada.data)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Variante que devuelve el valor junto con su antigüedad, incluso si está
 * vencido. Útil para "stale-while-revalidate": pintar el dato viejo al
 * instante y refrescar en segundo plano. `stale` indica si superó el TTL.
 */
export async function idbGetConEdad<T>(
  clave: string,
  ttlMs: number,
): Promise<{ data: T; stale: boolean } | null> {
  const db = await abrirDB()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(clave)
      req.onsuccess = () => {
        const entrada = req.result as Entrada<T> | undefined
        if (!entrada) { resolve(null); return }
        resolve({ data: entrada.data, stale: Date.now() - entrada.ts > ttlMs })
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Guarda un valor con marca de tiempo. No lanza si IndexedDB no existe. */
export async function idbSet<T>(clave: string, data: T): Promise<void> {
  const db = await abrirDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ ts: Date.now(), data } as Entrada<T>, clave)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Borra una clave concreta. */
export async function idbDelete(clave: string): Promise<void> {
  const db = await abrirDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(clave)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Borra todas las claves que empiezan por un prefijo (p. ej. "svc_real_"). */
export async function idbDeletePrefijo(prefijo: string): Promise<void> {
  const db = await abrirDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefijo)) {
          cursor.delete()
        }
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
