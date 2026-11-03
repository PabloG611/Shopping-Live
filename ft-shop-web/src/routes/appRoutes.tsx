
import { Navigate, Outlet, useRoutes } from 'react-router-dom'
import { ProtectedRoute } from 'react-ecosistema-unp/utils'
import { AppLayout } from '../layout/AppLayout'

import AdminAlmacenPage from '../pages/AdminAlmacenPage'
import AdminBaseDatosPage from '../pages/AdminBaseDatosPage'
import AdminFlorestaPage from '../pages/AdminFlorestaPage'
import GestionUnpPage from '../pages/GestionUnp'
import ConsultaBienesPage from '../pages/ConsultaBienesPage'
import TransferenciaBienesPage from '../pages/TransferenciaBienesPage'

const routesConfig = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/sg/gag/transferencia-bienes" replace /> },

      // Rutas accesibles para usuarios autenticados
      {
        element: <Outlet />,
        children: [
          { path: '/sg/gag/transferencia-bienes', element: <TransferenciaBienesPage /> },
          { path: '/sg/gag/consulta-bienes', element: <ConsultaBienesPage /> },
          // mis-bienes fue unificado en transferencia-bienes: redirigir por compatibilidad
          { path: '/sg/gag/mis-bienes', element: <Navigate to="/sg/gag/transferencia-bienes" replace /> },
        ],
      },

      //  roles (ProtectedRoute)
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/sg/gag/admin-transferencias', element: <AdminAlmacenPage /> },
          { path: '/sg/gag/gestion-inventario', element: <AdminFlorestaPage /> },
          { path: '/sg/gag/admin-base-datos', element: <AdminBaseDatosPage /> },
          { path: '/sg/gag/gestion-unp', element: <GestionUnpPage /> },
        ],
      },
    ],
  },
]

export function AppRoutes() {
  return useRoutes(routesConfig)
}
