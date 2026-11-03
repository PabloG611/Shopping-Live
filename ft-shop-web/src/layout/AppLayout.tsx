import { Outlet, useLocation } from 'react-router-dom'
import { VentanaLienzo } from 'react-ecosistema-unp/shared'

import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** Mapa de rutas a breadcrumb */
function getBreadcrumb(pathname: string) {
  const base = [{ label: 'Almacén', link: '/sg/gag/transferencia-bienes' }]

  if (pathname.includes('transferencia-bienes')) {
    return [...base, { label: 'Gestión de Bines' }]
  }
  if (pathname.includes('consulta-bienes')) {
    return [...base, { label: 'Consulta de Bienes' }]
  }
  if (pathname.includes('admin-transferencias')) {
    return [...base, { label: 'Administración', link: '/sg/gag/admin-transferencias' }, { label: 'Transferencias' }]
  }
  if (pathname.includes('gestion-inventario')) {
    return [...base, { label: 'Gestión Inventario' }]
  }
  if (pathname.includes('admin-base-datos')) {
    return [...base, { label: 'Administración', link: '/sg/gag/admin-base-datos' }, { label: 'Base de Datos' }]
  }
  if (pathname.includes('gestion-unp')) {
    return [...base, { label: 'Gestión UNP' }]
  }

  return base
}

export function AppLayout() {
  useDocumentTitle()
  const { pathname } = useLocation()
  const breadcrumbItems = getBreadcrumb(pathname)

  return (
    <VentanaLienzo items={breadcrumbItems}>
      <Outlet />
    </VentanaLienzo>
  )
}
