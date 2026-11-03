/**
 * msalSharepointService.ts
 *
 * Autenticación con SharePoint/Microsoft Graph usando MSAL loginRedirect.
 *
 * loginPopup no funciona porque Microsoft agrega COOP: same-origin en el
 * login form, lo que rompe window.opener y el handshake del popup con el padre.
 *
 * Con loginRedirect: la página navega a Microsoft, el usuario hace login,
 * Microsoft redirige de vuelta a la app. main.tsx llama handleRedirectPromise()
 * antes de que React monte y captura el token.
 */

import {
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from '@azure/msal-browser'

const CLIENT_ID = import.meta.env.VITE_MSAL_CLIENT_ID as string
const TENANT_ID = import.meta.env.VITE_MSAL_TENANT_ID as string

const SP_SCOPES = ['Files.ReadWrite.All', 'Sites.ReadWrite.All', 'offline_access']

// Esta URI debe estar registrada como SPA en Azure AD
const SP_REDIRECT_URI = window.location.origin + '/sg/gag/'

/**
 * Detecta si el entorno soporta MSAL (requiere crypto.subtle).
 * Solo disponible en: HTTPS, http://localhost, http://127.0.0.1
 * NO disponible en: http://172.16.x.x u otras IPs por HTTP.
 */
export function isMsalAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.crypto?.subtle) return false
  if (!CLIENT_ID || !TENANT_ID) return false
  return true
}

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: SP_REDIRECT_URI,
  },
  cache: { cacheLocation: 'sessionStorage' as const },
}

let _msalInstance: PublicClientApplication | null = null

export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (!isMsalAvailable()) {
    throw new Error('MSAL no disponible: requiere HTTPS o localhost')
  }
  if (!_msalInstance) {
    _msalInstance = new PublicClientApplication(msalConfig)
    await _msalInstance.initialize()
  }
  return _msalInstance
}

const SP_TOKEN_KEY = 'sp_token'
const SP_USER_KEY = 'sp_user'

export function saveSpToken(token: string, user: string): void {
  sessionStorage.setItem(SP_TOKEN_KEY, token)
  sessionStorage.setItem(SP_USER_KEY, user)
}

export function getSharepointStatus(): { authenticated: boolean; user: string } {
  return {
    authenticated: !!sessionStorage.getItem(SP_TOKEN_KEY),
    user: sessionStorage.getItem(SP_USER_KEY) ?? '',
  }
}

/**
 * Inicia login de SharePoint.
 * Si hay cuenta en caché, intenta silent primero (sin navegación).
 * Si no, redirige a Microsoft — la app recarga al volver.
 */
export async function loginSharepoint(): Promise<{ ok: boolean; user: string; error?: string }> {
  if (!isMsalAvailable()) {
    return { ok: false, user: '', error: 'SharePoint no disponible en este entorno (requiere HTTPS o localhost).' }
  }
  try {
    const msal = await getMsalInstance()

    // Intentar silent si ya hay cuenta — no recarga la página
    const accounts: AccountInfo[] = msal.getAllAccounts()
    if (accounts.length > 0) {
      try {
        const result: AuthenticationResult = await msal.acquireTokenSilent({
          scopes: SP_SCOPES,
          account: accounts[0],
        })
        const user = result.account?.username ?? ''
        saveSpToken(result.accessToken, user)
        return { ok: true, user }
      } catch {
        // Silent falló — hacer redirect
      }
    }

    // Guardar página actual para volver después del redirect
    sessionStorage.setItem('sp_redirect_back', window.location.href)

    // Navegar a Microsoft — la función no retorna, la página se va
    await msal.loginRedirect({
      scopes: SP_SCOPES,
      redirectUri: SP_REDIRECT_URI,
      prompt: 'select_account',
    })

    return { ok: false, user: '' } // nunca llega aquí
  } catch (err) {
    return { ok: false, user: '', error: err instanceof Error ? err.message : String(err) }
  }
}

export async function getSpAccessToken(): Promise<string | null> {
  try {
    const msal = await getMsalInstance()
    const accounts = msal.getAllAccounts()
    if (accounts.length > 0) {
      const result = await msal.acquireTokenSilent({
        scopes: SP_SCOPES,
        account: accounts[0],
      })
      saveSpToken(result.accessToken, result.account?.username ?? '')
      return result.accessToken
    }
  } catch {
    // Silent token acquisition failed — token is expired or invalid
    // Clear the stored token to avoid false "connected" status
    sessionStorage.removeItem(SP_TOKEN_KEY)
    return null
  }
  // No accounts in MSAL cache — clear stale token
  sessionStorage.removeItem(SP_TOKEN_KEY)
  return null
}

/**
 * Validates the current SharePoint token by making a lightweight Graph API call.
 * Returns true if the token is valid and can make requests, false otherwise.
 * Use this before starting an upload to detect stale/expired sessions early.
 */
export async function validateSpConnection(): Promise<boolean> {
  const token = await getSpAccessToken()
  if (!token) return false

  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return true
    // SOLO un 401/403 significa token inválido/expirado → desconectar y limpiar.
    // Cualquier otro código (5xx, 429, etc.) es un problema TRANSITORIO del
    // servicio o de red: NO desconectamos ni borramos el token para evitar
    // falsos "SharePoint desconectado" por hipos momentáneos.
    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem(SP_TOKEN_KEY)
      sessionStorage.removeItem(SP_USER_KEY)
      return false
    }
    // Error transitorio: mantener la sesión como válida (hay token).
    return true
  } catch {
    // Fallo de red (sin conexión, CORS momentáneo, timeout): NO desconectar.
    // El token sigue en caché; se revalida en el próximo ciclo. Así el banner
    // no parpadea a "desconectado" por una micro-caída de red.
    return true
  }
}

export function logoutSharepoint(): void {
  sessionStorage.removeItem(SP_TOKEN_KEY)
  sessionStorage.removeItem(SP_USER_KEY)
}
