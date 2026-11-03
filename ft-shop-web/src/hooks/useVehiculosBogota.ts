/**
 * useVehiculosBogota.ts
 *
 * Estado y lógica del tablero de asignación de vehículos de Bogotá por
 * inventariador. Copia el patrón de useServiciosHabilitados pero sobre placas
 * de vehículos en lugar de códigos de servicio.
 *
 * - Carga el catálogo de vehículos de Bogotá y las placas ya inventariadas.
 * - Reconstruye el tablero desde BD.
 * - Permite asignar/quitar placas por inventariador (persistiendo en BD).
 * - Repartición automática equilibrada entre motos y carros.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { listarVehiculos, obtenerPlacasInventariadas, esMoto, type Vehiculo } from '../services/vehiculosService'
import { type UsuarioEcosistema } from '../services/controlSeguimientoService'
import {
  fetchVehiculosAsignados,
  guardarVehiculosAsignados,
  fetchTableroMiembros,
  guardarTableroMiembros,
  type MiembroTablero,
} from '../services/vehiculosBogotaService'

/** Un inventariador en el tablero con sus placas asignadas. */
export interface InventariadorVehiculos {
  usuario: UsuarioEcosistema
  placas: string[]
  cargando: boolean
}

/** Resultado del cálculo de repartición (para el modal de preview). */
export interface PreviewReparticion {
  porInventariador: Array<{ username: string; nombre: string; motos: number; carros: number; total: number }>
  totalMotos: number
  totalCarros: number
}

export function useVehiculosBogota() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [placasInventariadas, setPlacasInventariadas] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [inventariadores, setInventariadores] = useState<InventariadorVehiculos[]>([])
  const [vista, setVista] = useState<'vehiculo' | 'inventariador'>('vehiculo')
  // Placa que se debe RESALTAR en el panel central (al hacer clic en una placa
  // asignada del catálogo). El panel central escucha este valor para hacer
  // scroll + resaltado temporal a la tarjeta del inventariador que la tiene.
  const [placaResaltada, setPlacaResaltada] = useState<string | null>(null)
  // Evita doble carga por el doble-montaje de React StrictMode.
  const yaCargado = useRef(false)

  // Carga inicial: catálogo de vehículos + placas inventariadas + tablero de
  // inventariadores (con sus placas). Todo en un solo efecto para evitar
  // condiciones de carrera. No se cancela: siempre aplica el resultado.
  useEffect(() => {
    if (yaCargado.current) return
    yaCargado.current = true

    // (1) Reconstruir el tablero de inventariadores desde BD. Va en su PROPIO
    // bloque con try/catch para que un fallo/lentitud de Firebird al cargar el
    // catálogo NO impida mostrar los inventariadores ya guardados.
    void (async () => {
      try {
        const miembros = await fetchTableroMiembros()
        if (miembros.length === 0) return
        const conPlacas = await Promise.all(
          miembros.map(async (m) => ({
            usuario: {
              uuidUsuario: m.username,
              username: m.username,
              nombreCompleto: m.nombreCompleto,
              cedula: '',
              dependencia: null,
              grupo: null,
            },
            placas: await fetchVehiculosAsignados(m.username),
            cargando: false,
          })),
        )
        setInventariadores(conPlacas)
      } catch { /* si falla, el tablero queda vacío pero no rompe */ }
    })()

    // (2) Cargar catálogo de vehículos + placas inventariadas (independiente).
    setCargando(true)
    void (async () => {
      try {
        const [res, inventariadas] = await Promise.all([
          listarVehiculos({ servicio: 'BOGOTA' }),
          obtenerPlacasInventariadas(),
        ])
        setVehiculos(res.vehiculos)
        setPlacasInventariadas(new Set(inventariadas.map((p) => p.toUpperCase())))
      } catch { /* catálogo vacío si Firebird falla */ } finally {
        setCargando(false)
      }
    })()
  }, [])

  // Persiste la lista de miembros del tablero (username + nombre).
  const persistirMiembros = useCallback((lista: InventariadorVehiculos[]) => {
    const miembros: MiembroTablero[] = lista
      .filter((i) => i.usuario.username)
      .map((i) => ({ username: i.usuario.username as string, nombreCompleto: i.usuario.nombreCompleto }))
    void guardarTableroMiembros(miembros)
  }, [])

  /** Placa ya inventariada (no asignable). */
  const estaInventariada = useCallback(
    (placa: string) => placasInventariadas.has(placa.trim().toUpperCase()),
    [placasInventariadas],
  )

  /** Inventariador al que está asignada una placa (o null si no está asignada). */
  const inventariadorDePlaca = useCallback(
    (placa: string): InventariadorVehiculos | null =>
      inventariadores.find((i) => i.placas.includes(placa)) ?? null,
    [inventariadores],
  )

  /** Marca una placa para resaltarla en el panel central (clic desde catálogo). */
  const resaltarPlaca = useCallback((placa: string) => {
    // Reinicia primero para que un clic repetido vuelva a disparar el efecto.
    setPlacaResaltada(null)
    requestAnimationFrame(() => setPlacaResaltada(placa))
  }, [])

  // Agregar inventariador al tablero (carga sus placas de BD, persiste el tablero)
  const agregarInventariador = useCallback((usuario: UsuarioEcosistema) => {
    if (!usuario.username) return
    setInventariadores((prev) => {
      if (prev.some((i) => i.usuario.username === usuario.username)) return prev
      const nueva = [...prev, { usuario, placas: [], cargando: true }]
      persistirMiembros(nueva)
      return nueva
    })
    void fetchVehiculosAsignados(usuario.username).then((placas) => {
      setInventariadores((prev) => prev.map((i) =>
        i.usuario.username === usuario.username ? { ...i, placas, cargando: false } : i,
      ))
    })
  }, [persistirMiembros])

  // Quitar inventariador (vacía su asignación en BD y actualiza el tablero)
  const quitarInventariador = useCallback((username: string) => {
    void guardarVehiculosAsignados(username, [])
    setInventariadores((prev) => {
      const nueva = prev.filter((i) => i.usuario.username !== username)
      persistirMiembros(nueva)
      return nueva
    })
  }, [persistirMiembros])

  // Asignar una placa a un inventariador (no si ya está inventariada)
  const asignarPlaca = useCallback((username: string, placa: string) => {
    if (estaInventariada(placa)) return
    setInventariadores((prev) => prev.map((i) => {
      if (i.usuario.username !== username) return i
      if (i.placas.includes(placa)) return i
      const nuevas = [...i.placas, placa]
      void guardarVehiculosAsignados(username, nuevas, i.usuario.nombreCompleto)
      return { ...i, placas: nuevas }
    }))
  }, [estaInventariada])

  // Quitar una placa de un inventariador
  const quitarPlaca = useCallback((username: string, placa: string) => {
    setInventariadores((prev) => prev.map((i) => {
      if (i.usuario.username !== username) return i
      const nuevas = i.placas.filter((p) => p !== placa)
      void guardarVehiculosAsignados(username, nuevas, i.usuario.nombreCompleto)
      return { ...i, placas: nuevas }
    }))
  }, [])

  // Mover una placa de un inventariador a OTRO (drag & drop entre tarjetas).
  // Atómico: la quita del origen y la suma al destino en una sola actualización,
  // persistiendo ambos cambios en BD. No hace nada si origen === destino, si la
  // placa ya está inventariada, o si el destino ya la tiene.
  const moverPlaca = useCallback((placa: string, usernameOrigen: string, usernameDestino: string) => {
    if (usernameOrigen === usernameDestino) return
    if (estaInventariada(placa)) return
    setInventariadores((prev) => {
      const destino = prev.find((i) => i.usuario.username === usernameDestino)
      if (!destino || destino.placas.includes(placa)) return prev
      return prev.map((i) => {
        if (i.usuario.username === usernameOrigen) {
          const nuevas = i.placas.filter((p) => p !== placa)
          void guardarVehiculosAsignados(usernameOrigen, nuevas, i.usuario.nombreCompleto)
          return { ...i, placas: nuevas }
        }
        if (i.usuario.username === usernameDestino) {
          const nuevas = [...i.placas, placa]
          void guardarVehiculosAsignados(usernameDestino, nuevas, i.usuario.nombreCompleto)
          return { ...i, placas: nuevas }
        }
        return i
      })
    })
  }, [estaInventariada])

  // Placas pendientes (no inventariadas), separadas en motos y carros
  const { motosPendientes, carrosPendientes } = useMemo(() => {
    const motos: string[] = []
    const carros: string[] = []
    for (const v of vehiculos) {
      if (estaInventariada(v.placa)) continue
      if (esMoto(v.placa)) motos.push(v.placa)
      else carros.push(v.placa)
    }
    return { motosPendientes: motos, carrosPendientes: carros }
  }, [vehiculos, estaInventariada])

  /** Calcula el preview de la repartición equilibrada (sin aplicar). */
  const calcularPreviewReparticion = useCallback((): PreviewReparticion | null => {
    const activos = inventariadores.filter((i) => i.usuario.username)
    const n = activos.length
    if (n === 0) return null
    const base = (total: number, idx: number) =>
      Math.floor(total / n) + (idx < total % n ? 1 : 0)
    return {
      totalMotos: motosPendientes.length,
      totalCarros: carrosPendientes.length,
      porInventariador: activos.map((inv, idx) => {
        const motos = base(motosPendientes.length, idx)
        const carros = base(carrosPendientes.length, idx)
        return {
          username: inv.usuario.username as string,
          nombre: inv.usuario.nombreCompleto,
          motos,
          carros,
          total: motos + carros,
        }
      }),
    }
  }, [inventariadores, motosPendientes, carrosPendientes])

  /** Aplica la repartición equilibrada: reemplaza las asignaciones actuales. */
  const aplicarReparticion = useCallback(() => {
    const activos = inventariadores.filter((i) => i.usuario.username)
    const n = activos.length
    if (n === 0) return
    const motos = [...motosPendientes]
    const carros = [...carrosPendientes]
    const reparto: Record<string, string[]> = {}
    activos.forEach((inv) => { reparto[inv.usuario.username as string] = [] })
    // Repartir round-robin cada grupo por separado → queda equilibrado motos/carros
    motos.forEach((placa, i) => {
      const inv = activos[i % n]
      reparto[inv.usuario.username as string].push(placa)
    })
    carros.forEach((placa, i) => {
      const inv = activos[i % n]
      reparto[inv.usuario.username as string].push(placa)
    })
    setInventariadores((prev) => prev.map((i) => {
      if (!i.usuario.username || !(i.usuario.username in reparto)) return i
      const nuevas = reparto[i.usuario.username]
      void guardarVehiculosAsignados(i.usuario.username, nuevas, i.usuario.nombreCompleto)
      return { ...i, placas: nuevas }
    }))
  }, [inventariadores, motosPendientes, carrosPendientes])

  return {
    vehiculos,
    cargando,
    inventariadores,
    vista,
    setVista,
    estaInventariada,
    inventariadorDePlaca,
    placaResaltada,
    resaltarPlaca,
    agregarInventariador,
    quitarInventariador,
    asignarPlaca,
    quitarPlaca,
    moverPlaca,
    calcularPreviewReparticion,
    aplicarReparticion,
    motosPendientes,
    carrosPendientes,
  }
}

export type UseVehiculosBogota = ReturnType<typeof useVehiculosBogota>
