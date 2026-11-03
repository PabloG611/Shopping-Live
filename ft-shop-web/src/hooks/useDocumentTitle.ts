import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const TITULOS: Record<string, string> = {
  '/consulta-bienes': 'Consulta de Bienes',
  '/transferencia-bienes': 'Gestión de Bines',
  '/admin-almacen': 'Admin Almacen',
  '/admin-floresta': 'Admin Floresta',
  '/inventario-fisico': 'Inventario Fisico',
  '/admin-base-datos': 'Admin Base de Datos',
}

export function useDocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    const ruta = pathname.replace(/^\/sg\/gag/, '') || '/consulta-bienes'
    const titulo = TITULOS[ruta] ?? 'Almacén'
    document.title = `${titulo} | GAG - UNP`
  }, [pathname])
}
