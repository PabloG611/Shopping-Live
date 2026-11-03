/**
 * tokenStore.ts — Capa de acceso centralizada a tokens de autenticación
 *
 * Los tokens se mantienen en localStorage (requerido por el ecosistema UNP:
 * bk-login, react-ecosistema-unp y otros micro-frontends los leen de ahí).
 *
 * Este módulo centraliza el acceso para que ningún otro archivo del proyecto
 * acceda directamente a localStorage para tokens — facilitando futuras
 * migraciones de seguridad cuando el ecosistema lo soporte.
 *
 * Flujo:
 * 1. El portal de auth (bk-login) deposita access_token, refresh_token
 *    y auth_state en localStorage.
 * 2. Este módulo lee/escribe de localStorage como fuente de verdad.
 * 3. El fetchInterceptor usa getAccessToken() para inyectar el Bearer.
 * 4. Al cerrar sesión, clearTokens() limpia todo.
 */

// ─── API Pública ───────────────────────────────────────────────────────────────

/**
 * Inicializa el token store.
 * En esta versión no hace operaciones pesadas — los tokens se leen
 * directamente de localStorage bajo demanda.
 * Se mantiene por compatibilidad con main.tsx.
 */
export function initTokenStore(): void {
  // No-op: los tokens viven en localStorage y se leen bajo demanda.
}

/**
 * Obtiene el access token desde localStorage.
 */
export function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
}

/**
 * Obtiene el refresh token desde localStorage.
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem('refresh_token');
}

/**
 * Actualiza ambos tokens en localStorage (usado tras un refresh exitoso).
 */
export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('access_token', accessToken);
  localStorage.setItem('refresh_token', refreshToken);
}

/**
 * Obtiene el auth_state crudo (string JSON) desde localStorage.
 */
export function getAuthStateRaw(): string | null {
  return localStorage.getItem('auth_state');
}

/**
 * Actualiza el auth_state en localStorage.
 */
export function setAuthState(authState: string): void {
  localStorage.setItem('auth_state', authState);
}

/**
 * Limpia todos los tokens y auth_state de localStorage.
 * Usado al cerrar sesión o cuando el token es irrecuperable.
 */
export function clearTokens(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('auth_state');
}

/**
 * Indica si hay un token disponible (el store está "listo").
 */
export function isTokenStoreReady(): boolean {
  return !!localStorage.getItem('access_token');
}
