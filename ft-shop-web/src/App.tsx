import { BrowserRouter } from 'react-router-dom'
import { Suspense } from 'react'
import { Animacion } from 'react-ecosistema-unp/ui'
import { EcoProvider } from 'react-ecosistema-unp/utils'
import { Toaster } from 'sileo'
import 'sileo/styles.css'

import { TransferenciasProvider } from './context/TransferenciasProvider'
import { AppRoutes } from './routes/appRoutes'

function App() {
  return (
    <EcoProvider>
      {/* NOTA: sileo 0.1.5 (SileoToasterProps) NO expone un prop de máximo de
          toasts visibles. El tope de toasts de acción simultáneos se controla
          en useToast (MAX_TOASTS_ACCION) cerrando el más antiguo. */}
      <Toaster theme="light" position="top-center" offset={50} options={{ fill: '#ffffff' }} />
      <BrowserRouter>
        <TransferenciasProvider>
          <Suspense
            fallback={
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100vh',
                }}
              >
                <Animacion type="colibri" width={600} />
              </div>
            }
          >
            <AppRoutes />
          </Suspense>
        </TransferenciasProvider>
      </BrowserRouter>
    </EcoProvider>
  )
}

export default App
