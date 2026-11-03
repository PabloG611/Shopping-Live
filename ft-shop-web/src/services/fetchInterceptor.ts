import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokenStore';

/* fetchInterceptor.ts
  Interceptor global de fetch para tu app:
  - Omite endpoints de refresh o validación.
  - Detecta 401 en peticiones normales, encola y lanza un solo refresh.
  - Actualiza localStorage SOLO si recibe un nuevo token válido.
  - Reintenta peticiones en cola.
*/

declare global {
  interface Window {
    originalFetch: typeof fetch;
  }
}

const tokenErrors = [
  'Token no proporcionado',
  'Formato de token inválido. Use: Bearer <token>',
  'Token revocado',
  'Tipo de token no soportado',
  'No se pudo identificar al usuario',
  'Usuario no encontrado',
  'Token no vinculado a una sesión activa',
  'Token expirado',
  'Token inválido',
  'Error de autenticación',
  'Invalid or expired token'
];

const tokenErrorsTwo = [
  'Token revocado',
  'Token expirado',
  'Invalid or expired token'
];

// Guardar referencia al fetch original
window.originalFetch = window.fetch.bind(window);

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

interface PendingRequest {
  input: RequestInfo | URL;
  init?: RequestInit;
  resolve: (value: Response) => void;
  reject: (reason?: any) => void;
}

const requestQueue: PendingRequest[] = [];

/**
 * Llama al endpoint de refresh_token y devuelve el nuevo token formateado.
 * Lanza error si no recibe token válido.
 */
async function refreshToken(): Promise<string> {
  const urlAuth = `${window.location.protocol}//${window.location.host}/`;
  const url = `${urlAuth}api-auth/auth/refresh_token/`;

  const currentRefreshToken = getRefreshToken();

  const response = await window.originalFetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({
      refresh: currentRefreshToken
    })
  });

  if (!response.ok) {
    clearTokens();
    window.location.href = `${window.location.protocol}//${window.location.host}/`;
    throw new Error('Error al refrescar token, status ' + response.status);
  }

  const data = await response.json();
  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token;
  setTokens(newAccessToken, newRefreshToken);

  return 'Token refreshed';
}

// Sobrescribir window.fetch con el mismo tipo
window.fetch = async function (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();

  // Peticiones que deben pasar SIN interceptar (sin inyectar headers de auth):
  // 1. Endpoints de refresh, validación o Microsoft identity.
  // 2. Peticiones a dominios EXTERNOS (CDNs, APIs de terceros, etc.).
  //    "Externo" = distinto del host del frontend Y distinto del host del backend
  //    configurado en VITE_APP_API_GAG. En producción ambos coinciden; en local
  //    el frontend corre en localhost:5173 y el backend en 172.16.x.x:8001.
  //    Sin este matiz, las peticiones al backend local se tratan como externas
  //    y se envían sin Authorization → 401.
  const apiGagHost = (() => {
    try {
      const apiUrl = import.meta.env.VITE_APP_API_GAG ?? ''
      return apiUrl ? new URL(apiUrl).origin : ''
    } catch { return '' }
  })()
  const esExterno = url.startsWith('http')
    && !url.startsWith(`${window.location.protocol}//${window.location.host}`)
    && !(apiGagHost && url.startsWith(apiGagHost))
  if (
    esExterno ||
    url.includes('/api-auth/') ||
    url.includes('login.microsoftonline.com') ||
    url.includes('graph.microsoft.com')
  ) {
    return window.originalFetch(input, init);
  }

  init = init || {};
  const storedToken = getAccessToken();

  // Headers entrantes de ESTA petición (los que puso el llamador o una librería).
  const headersEntrantes = (init.headers as Record<string, any>) || {};
  // ¿La petición YA trae un BK-Service propio? La librería del ecosistema envía
  // las notificaciones con 'BK-Service: api-noti'. Si el interceptor forzara
  // 'api-sgai' SIEMPRE, pisaría ese valor y el gateway enrutaría mal (404 en
  // /api-notificaciones). Por eso 'api-sgai' se aplica solo como DEFAULT:
  // primero el default, luego los headers entrantes, para que un BK-Service
  // propio (p.ej. api-noti) prevalezca.
  init.headers = {
    'BK-Service': 'api-sgai',
    ...headersEntrantes,
    ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
  };

  try {
    const urlAuth = `${window.location.protocol}//${window.location.host}/`;
    const response = await window.originalFetch(input, init);

    if (response.status !== 401) {
      const responseClone = response.clone();

      // Revisamos si hay errores en el cuerpo de la respuesta
      let responseBody;
      try {
        responseBody = await responseClone.json(); // Intentamos parsear la respuesta como JSON
      } catch (_e) {
        // Si no es JSON válido, no hacemos nada
      }

      // Verificamos si el mensaje de error está presente
      if (responseBody?.message && tokenErrorsTwo.some(err => responseBody.message.includes(err))) {
        if (tokenErrors.some(err => responseBody.message.includes(err))) {
          console.warn('El token expiró');
          clearTokens();
          setTimeout(() => {
            window.location.href = urlAuth;
          }, 1000);
          return response;
        }
      }
      return response; // Devuelve el response original si no hay error
    }

    // Error 401 en petición normal: encolar y refrescar
    return new Promise<Response>((resolve, reject) => {
      requestQueue.push({ input, init, resolve, reject });

      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshToken();

        refreshPromise
          .then(() => {
            requestQueue.forEach(({ input, init, resolve, reject }) => {
              // Al reintentar tras el refresh, conservar el BK-Service que ya
              // traía la petición (p.ej. api-noti de la librería de ecosistema):
              // 'api-sgai' solo como default si no venía ninguno.
              const retryInit = {
                ...init,
                headers: {
                  'BK-Service': 'api-sgai',
                  ...(init!.headers as any),
                  Authorization: `Bearer ${getAccessToken()}`,
                }
              };
              window.originalFetch(input, retryInit)
                .then(resolve)
                .catch(reject);
            });
          })
          .catch(err => {
            requestQueue.forEach(({ reject }) => reject(err));
          })
          .finally(() => {
            requestQueue.length = 0;
            isRefreshing = false;
            refreshPromise = null;
          });
      }
    });
  } catch (error) {
    return Promise.reject(error);
  }
} as typeof window.fetch;

export default {};
