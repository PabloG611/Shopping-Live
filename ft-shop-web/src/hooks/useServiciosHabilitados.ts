import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  type Servicio,
  type UsuarioEcosistema,
  fetchServiciosHabilitados,
  guardarServiciosHabilitados,
  fetchServiciosHabilitadosUsuario,
  guardarServiciosHabilitadosUsuario,
  reconstruirTableroDesdeBD,
  cargarServicios,
  cargarTotalesRealesServicios,
  STORAGE_KEY_SERVICIOS_HABILITADOS,
} from '../services/controlSeguimientoService'
import { useTransferenciasWebSocket } from './useTransferenciasWebSocket'

/**
 * Estado y lógica de "Servicios habilitados" compartido entre el panel central
 * (zona de habilitados) y el panel derecho (catálogo). Persiste en BD y se
 * sincroniza en tiempo real vía WebSocket.
 */
export function useServiciosHabilitados() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [serviciosHabilitados, setServiciosHabilitados] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)

  // Cargar catálogo de servicios (con conteo de bienes)
  useEffect(() => {
    let activo = true
    setCargando(true)
    void cargarServicios().then((s) => {
      if (activo) {
        setServicios(s)
        setCargando(false)
      }
    })
    return () => { activo = false }
  }, [])

  // Cargar habilitados desde BD
  useEffect(() => {
    void fetchServiciosHabilitados().then(setServiciosHabilitados)
  }, [])

  // Cargar totales reales para los servicios habilitados (fusión servicio + ubicación TNS)
  // Mientras no se tenga el dato real, se marca cantidad = -1 (indicador de "cargando")
  useEffect(() => {
    if (serviciosHabilitados.length === 0 || servicios.length === 0) return

    // Marcar habilitados como "cargando" (cantidad = -1)
    setServicios((prev) => prev.map((s) =>
      serviciosHabilitados.includes(s.codigo) ? { ...s, cantidad: -1 } : s
    ))

    void cargarTotalesRealesServicios(serviciosHabilitados).then((mapa) => {
      setServicios((prev) => prev.map((s) => {
        const totalReal = mapa.get(s.codigo)
        if (totalReal != null && totalReal > 0) return { ...s, cantidad: totalReal }
        // Si no se pudo obtener, restaurar a 0 (mejor que -1)
        if (serviciosHabilitados.includes(s.codigo) && s.cantidad === -1) return { ...s, cantidad: 0 }
        return s
      }))
    })
  }, [serviciosHabilitados, servicios.length])

  // Sincronización en tiempo real vía WebSocket.
  // Este hook maneja la config GLOBAL (tab Servicio); ignora eventos por-usuario
  // (clave 'servicios_habilitados::<username>') para no pisar la lista global.
  const handleConfiguracionWS = useCallback((nuevos: string[], meta?: { username?: string | null }) => {
    if (meta?.username) return // evento por-usuario → no afecta la config global
    setServiciosHabilitados(nuevos)
    localStorage.setItem(STORAGE_KEY_SERVICIOS_HABILITADOS, JSON.stringify(nuevos))
  }, [])

  useTransferenciasWebSocket({
    onConfiguracionServiciosActualizada: handleConfiguracionWS,
  })

  // Persistir cambios en BD
  const actualizar = useCallback((nuevos: string[]) => {
    setServiciosHabilitados(nuevos)
    void guardarServiciosHabilitados(nuevos)
  }, [])

  const habilitar = useCallback((codigo: string) => {
    setServiciosHabilitados((prev) => {
      if (prev.includes(codigo)) return prev
      const nuevos = [...prev, codigo]
      void guardarServiciosHabilitados(nuevos)
      return nuevos
    })
  }, [])

  const deshabilitar = useCallback((codigo: string) => {
    setServiciosHabilitados((prev) => {
      const nuevos = prev.filter((c) => c !== codigo)
      void guardarServiciosHabilitados(nuevos)
      return nuevos
    })
  }, [])

  const toggleServicio = useCallback((codigo: string) => {
    setServiciosHabilitados((prev) => {
      const nuevos = prev.includes(codigo) ? prev.filter((c) => c !== codigo) : [...prev, codigo]
      void guardarServiciosHabilitados(nuevos)
      return nuevos
    })
  }, [])

  const totalBienesHabilitados = useMemo(
    () => servicios
      .filter((s) => serviciosHabilitados.includes(s.codigo) && s.cantidad > 0)
      .reduce((acc, s) => acc + s.cantidad, 0),
    [servicios, serviciosHabilitados],
  )

  // ─── Modo por usuario (multi-inventariador) ─────────────────────────────
  // Vista activa compartida entre panel derecho (tabs) y panel central.
  const [vista, setVista] = useState<'servicio' | 'inventariador'>('servicio')
  // Lista de inventariadores agregados al tablero, cada uno con sus servicios.
  const [inventariadores, setInventariadores] = useState<InventariadorAsignacion[]>([])

  // Reconstruir el tablero al montar DIRECTAMENTE desde la BD: se leen todas las
  // asignaciones existentes (claves 'servicios_habilitados::<username>') y se
  // arma una tarjeta por cada inventariador que ya tenga servicios. Única fuente
  // de verdad; no requiere lista aparte del tablero.
  useEffect(() => {
    let activo = true
    void reconstruirTableroDesdeBD().then((filas) => {
      if (!activo || filas.length === 0) return
      setInventariadores(filas.map((f) => ({
        usuario: {
          uuidUsuario: f.username,
          username: f.username,
          nombreCompleto: f.nombreCompleto,
          cedula: '',
          dependencia: null,
          grupo: null,
        },
        servicios: f.servicios,
        cargando: false,
      })))
    })
    return () => { activo = false }
  }, [])

  // Agregar un inventariador al tablero (si no está ya) y cargar sus servicios.
  const agregarInventariador = useCallback((usuario: UsuarioEcosistema) => {
    if (!usuario.username) return
    setInventariadores((prev) => {
      if (prev.some((i) => i.usuario.username === usuario.username)) return prev
      return [...prev, { usuario, servicios: [], cargando: true }]
    })
    void fetchServiciosHabilitadosUsuario(usuario.username).then((codigos) => {
      setInventariadores((prev) => prev.map((i) =>
        i.usuario.username === usuario.username ? { ...i, servicios: codigos, cargando: false } : i
      ))
    })
  }, [])

  // Quitar un inventariador del tablero. Como la reconstrucción se hace desde las
  // asignaciones, vaciamos también sus servicios en BD para que no reaparezca.
  const quitarInventariador = useCallback((username: string) => {
    void guardarServiciosHabilitadosUsuario(username, [])
    setInventariadores((prev) => prev.filter((i) => i.usuario.username !== username))
  }, [])

  // Asignar un servicio a un inventariador específico (persiste en BD, con su nombre).
  const asignarServicioAInventariador = useCallback((username: string, codigo: string) => {
    setInventariadores((prev) => prev.map((i) => {
      if (i.usuario.username !== username) return i
      if (i.servicios.includes(codigo)) return i
      const nuevos = [...i.servicios, codigo]
      void guardarServiciosHabilitadosUsuario(username, nuevos, i.usuario.nombreCompleto)
      return { ...i, servicios: nuevos }
    }))
  }, [])

  // Quitar un servicio de un inventariador específico (persiste en BD, con su nombre).
  const quitarServicioDeInventariador = useCallback((username: string, codigo: string) => {
    setInventariadores((prev) => prev.map((i) => {
      if (i.usuario.username !== username) return i
      const nuevos = i.servicios.filter((c) => c !== codigo)
      void guardarServiciosHabilitadosUsuario(username, nuevos, i.usuario.nombreCompleto)
      return { ...i, servicios: nuevos }
    }))
  }, [])

  return {
    servicios,
    serviciosHabilitados,
    cargando,
    totalBienesHabilitados,
    actualizar,
    habilitar,
    deshabilitar,
    toggleServicio,
    // Modo multi-inventariador
    vista,
    setVista,
    inventariadores,
    agregarInventariador,
    quitarInventariador,
    asignarServicioAInventariador,
    quitarServicioDeInventariador,
  }
}

/** Un inventariador en el tablero de asignación, con sus servicios asignados. */
export interface InventariadorAsignacion {
  usuario: UsuarioEcosistema
  servicios: string[]
  cargando: boolean
}

export type UseServiciosHabilitados = ReturnType<typeof useServiciosHabilitados>
