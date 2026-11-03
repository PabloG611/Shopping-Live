import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { initTokenStore } from './services/tokenStore'
import './services/fetchInterceptor'
import { getMsalInstance, saveSpToken, isMsalAvailable } from './services/msalSharepointService'

// Inicializar token store (compatibilidad)
initTokenStore()

// Procesar el redirect de SharePoint si Microsoft acaba de redirigir de vuelta.
// Solo si MSAL está disponible (HTTPS o localhost — no en HTTP con IP).
;(async () => {
  if (!isMsalAvailable()) {
    console.info('[MSAL] No disponible en este entorno (HTTP sin localhost). SharePoint deshabilitado.')
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    return
  }

  try {
    const msal = await getMsalInstance()
    const result = await msal.handleRedirectPromise()

    if (result?.accessToken) {
      const user = result.account?.username ?? result.account?.name ?? ''
      saveSpToken(result.accessToken, user)
      console.log('[MSAL] SharePoint token guardado para:', user)

      const redirectBack = sessionStorage.getItem('sp_redirect_back')
      sessionStorage.removeItem('sp_redirect_back')
      if (redirectBack && redirectBack !== window.location.href) {
        window.location.replace(redirectBack)
        return
      }
    }
  } catch (e) {
    console.error('[MSAL] Error procesando redirect de SharePoint:', e)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})()
