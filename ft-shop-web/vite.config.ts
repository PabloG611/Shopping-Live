import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// ============================================================================
// Content-Security-Policy (hallazgo M-001)
// ----------------------------------------------------------------------------
// Control compensatorio principal frente a XSS: como el token de sesión se
// guarda en Web Storage (decisión de arquitectura del ecosistema), la CSP es
// la barrera que impide que un script inyectado exfiltre la sesión.
//
// Orígenes permitidos (derivados de .env y del código, cubren todos los
// ambientes: local, dev-server, pruebas/main, thais, producción):
//   - API GAG / gateway:   ecosistema(.|desarrollo.|pruebas.)unp.gov.co, thais.unp.gov.co
//   - MSAL / Azure AD:      login.microsoftonline.com (redirect/popup de login), graph.microsoft.com
//   - WebSocket (Redis):    wss://ecosistema*.unp.gov.co, wss://thais.unp.gov.co
//   - Animaciones Lottie:   https://lottie.host
//
// Notas:
//   - style-src incluye 'unsafe-inline' porque la app usa estilos inline de
//     React (atributos style=) de forma extensiva; sin esto la UI se rompe.
//   - script-src es 'self' (sin 'unsafe-inline' ni 'unsafe-eval'): Vite emite
//     el JS como bundles externos.
//   - frame-ancestors 'none' evita clickjacking; frame-src/form-action
//     permiten el flujo de login de Microsoft.
//   - Se inyecta SOLO en build (apply: 'build') para no romper el HMR de dev.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Google Fonts: el CSS de la fuente viene de fonts.googleapis.com (style-src)
  // y los archivos .woff2 de fonts.gstatic.com (font-src). La librería del
  // ecosistema carga la fuente Roboto desde ahí.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://lottie.host",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' " +
    "https://ecosistema.unp.gov.co https://ecosistemadesarrollo.unp.gov.co " +
    "https://ecosistemapruebas.unp.gov.co https://thais.unp.gov.co " +
    "wss://ecosistema.unp.gov.co wss://ecosistemadesarrollo.unp.gov.co " +
    "wss://ecosistemapruebas.unp.gov.co wss://thais.unp.gov.co " +
    "https://login.microsoftonline.com https://graph.microsoft.com https://lottie.host",
  // 'self' es NECESARIO: MSAL hace el token silencioso dentro de un iframe que,
  // tras autenticar en Microsoft, redirige de vuelta al redirectUri (nuestro
  // propio origen con #code=...). Sin 'self', el navegador bloquea ese framing
  // de retorno y el silent token falla ("violates frame-src ... blocked").
  "frame-src 'self' https://login.microsoftonline.com",
  "form-action 'self' https://login.microsoftonline.com",
  "object-src 'none'",
  // NOTA: 'frame-ancestors' NO se incluye aquí porque esta CSP se entrega vía
  // <meta http-equiv> y los navegadores IGNORAN frame-ancestors en <meta>
  // (solo funciona como header HTTP), generando un warning en consola. La
  // protección anti-clickjacking debe aplicarse como header del servidor/gateway
  // (Content-Security-Policy: frame-ancestors 'none'  o  X-Frame-Options: DENY).
  "base-uri 'self'",
].join('; ')

// Plugin que inyecta la CSP como <meta http-equiv> al inicio del <head>.
// Solo en build: en desarrollo, el HMR de Vite necesita eval/inline y rompería.
const cspPlugin: PluginOption = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
}

export default defineConfig({
  plugins: [react(), cspPlugin],
  base: '/sg/gag/',
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    hmr: { overlay: false },
    proxy: {
      '/api-notificaciones': {
        target: 'http://172.16.194.200:8001',
        changeOrigin: true,
      },
      // La librería del ecosistema (react-ecosistema-unp) llama a la campana con
      // `${host}/api-gateway/usuarios/.../notificaciones`. En local no hay gateway,
      // así que ese prefijo se reenvía al servicio bk-notificaciones, que expone
      // sus rutas bajo /api-notificaciones/. Por eso se reescribe el prefijo.
      // OJO: las peticiones de ALMACÉN NO usan esta ruta — van por URL absoluta a
      // VITE_APP_API_GAG (172.16.194.81:8001), no a localhost:5173/api-gateway.
      '/api-gateway': {
        target: 'http://172.16.194.200:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-gateway/, '/api-notificaciones'),
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') },
      output: {
        manualChunks(id) {
          if (id.includes('@azure/msal-browser')) return 'PublicClientApplication'
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'react-select', 'react-icons'],
  },
})
