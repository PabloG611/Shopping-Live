import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  consultarBienesPorCedula,
  obtenerConfiguracionSesion,
  consultarPendientesInventario,
} from '../services/consultaBienesService'
import {
  enviarDecisionTransferencia,
  enviarSolicitudTransferencia,
  cancelarTransferencia,
} from '../services/transferenciasEnvioService'
import { consultarTransferencias } from '../services/transferenciasConsultaService'
import { useTransferenciasWebSocket } from '../hooks/useTransferenciasWebSocket'
import type { Bien, Persona, SolicitudTransferencia, TipoBien } from '../types'
import { nombreCompletoEfectivo } from '../utils/persona'
import { 
  getAuthUserFullName, 
  getAuthUserCargo, 
  getAuthUserDependencia, 
  getAuthUserGrupo, 
  getAuthUserSede 
} from '../utils/authState'

import {
  TransferenciasContext,
  type CrearSolicitudRespuesta,
} from './transferenciasContext'

function generarCodigo(seq: number, tipo: 'normal' | 'floresta' = 'normal'): string {
  const y = new Date().getFullYear()
  const prefijo = tipo === 'floresta' ? 'TRF-F' : 'TRF'
  return `${prefijo}-${y}-${String(seq).padStart(5, '0')}`
}

function clonarBienes(lista: Bien[]): Bien[] {
  return lista.map((b) => ({ ...b }))
}

export function TransferenciasProvider({ children }: { children: ReactNode }) {
  const [sesionUsuario, setSesionUsuario] = useState<Persona | null>(null)
  const [sesionEstado, setSesionEstado] = useState<'cargando' | 'lista' | 'error'>('cargando')
  const [cedulaSesion, setCedulaSesion] = useState<string>('')
  const [normal, setNormal] = useState<Bien[]>([])
  const [floresta, setFloresta] = useState<Bien[]>([])
  const [solicitudes, setSolicitudes] = useState<SolicitudTransferencia[]>([])
  const [placasPendientesInventario, setPlacasPendientesInventario] = useState<Set<string>>(new Set())
  const [transferenciasRevisando, setTransferenciasRevisando] = useState<Set<string>>(new Set())
  const seqRef = useRef(1)

  useEffect(() => {
    let cancelado = false
    const cargarSesion = async () => {
      try {
        const cfg = await obtenerConfiguracionSesion()
        setCedulaSesion(cfg.numeroIdentificacionSesion)
        const inv = await consultarBienesPorCedula(cfg.numeroIdentificacionSesion)

        if (cancelado) return
        if (inv) {
          // Enriquecer los datos de la persona con información del auth_state
          const personaEnriquecida: Persona = {
            ...inv.persona,
            // Sobrescribir con datos del auth_state si están disponibles
            nombreCompleto: getAuthUserFullName() || inv.persona.nombreCompleto,
            cargo: getAuthUserCargo() || inv.persona.cargo || '',
            dependencia: getAuthUserDependencia() || inv.persona.dependencia || '',
            grupo: getAuthUserGrupo() || inv.persona.grupo || '',
            sede: getAuthUserSede() || inv.persona.sede || '',
          }

          setSesionUsuario(personaEnriquecida)
          setNormal(clonarBienes(inv.bienesNormal))
          setFloresta(clonarBienes(inv.bienesFloresta))

          // Cargar solicitudes desde el backend
          const solicitudesBackend = await consultarTransferencias()
          setSolicitudes(solicitudesBackend)

          // Cargar placas pendientes de inventario
          const pendientes = await consultarPendientesInventario(cfg.numeroIdentificacionSesion)
          setPlacasPendientesInventario(new Set(pendientes))
          // Calcular el siguiente secuencial basado en el código más alto existente
          const maxSeq = solicitudesBackend.reduce((max, s) => {
            const match = s.codigo.match(/TRF-?F?-?\d{4}-(\d+)/)
            const num = match ? parseInt(match[1], 10) : 0
            return num > max ? num : max
          }, 0)
          seqRef.current = maxSeq + 1

          setSesionEstado('lista')
        } else {
          setSesionUsuario(null)
          setNormal([])
          setFloresta([])
          try {
            const solicitudesBackend = await consultarTransferencias()
            setSolicitudes(solicitudesBackend)
          } catch {
            setSolicitudes([])
          }
          setSesionEstado('lista')
        }
      } catch (error) {
        console.error('[TransferenciasProvider] Error:', error)
        if (!cancelado) setSesionEstado('error')
      }
    }

    cargarSesion()

    return () => {
      cancelado = true
    }
  }, [])

  // Cargar pendientes de inventario solo al inicio
  useEffect(() => {
    if (!sesionUsuario) return
    const cedula = sesionUsuario.numeroIdentificacion
    void (async () => {
      const pendientes = await consultarPendientesInventario(cedula)
      setPlacasPendientesInventario(new Set(pendientes))
    })()
  }, [sesionUsuario])

  // WebSocket para actualizaciones en tiempo real de inventarios
  // TEMPORAL: Desactivado desde .env (VITE_WEBSOCKET_ENABLED=false)
  useTransferenciasWebSocket({
    onTransferenciaCreada: async () => {
      const solicitudesBackend = await consultarTransferencias()
      setSolicitudes(solicitudesBackend)
    },
    onTransferenciaAceptada: async (_id, data) => {
      const codigo = data?.codigo || String(_id)
      if (codigo) {
        setSolicitudes((prev) =>
          prev.map((s) => s.codigo === codigo ? { ...s, estado: 'aceptada' as const } : s)
        )
      }
      await new Promise(r => setTimeout(r, 1000))
      try {
        const solicitudesBackend = await consultarTransferencias()
        setSolicitudes(solicitudesBackend)
      } catch { /* silenciar */ }
    },
    onTransferenciaRechazada: async (_id, motivo, data) => {
      const codigo = data?.codigo || String(_id)
      if (codigo) {
        setSolicitudes((prev) =>
          prev.map((s) => s.codigo === codigo ? { ...s, estado: 'rechazada' as const, observacionRechazo: motivo } : s)
        )
      }
      await new Promise(r => setTimeout(r, 1000))
      try {
        const solicitudesBackend = await consultarTransferencias()
        setSolicitudes(solicitudesBackend)
      } catch { /* silenciar */ }
    },
    onTransferenciaRevisando: (transferencia_id, revisando) => {
      setTransferenciasRevisando(prev => {
        const next = new Set(prev)
        if (revisando) {
          next.add(transferencia_id)
        } else {
          next.delete(transferencia_id)
        }
        return next
      })
    },
    onInventarioIniciado: (_sesion_id, _cedula, placas) => {
      setPlacasPendientesInventario(prev => {
        const next = new Set(prev)
        placas.forEach(placa => next.add(placa))
        return next
      })
    },
    onInventarioCompletado: (_sesion_id, _cedula, placas) => {
      setPlacasPendientesInventario(prev => {
        const next = new Set(prev)
        placas.forEach(placa => next.delete(placa))
        return next
      })
    },
    onBienInventarioAgregado: (placa, _cedula) => {
      setPlacasPendientesInventario(prev => new Set(prev).add(placa))
    },
    onBienInventarioRemovido: (placa, _cedula) => {
      setPlacasPendientesInventario(prev => {
        const next = new Set(prev)
        next.delete(placa)
        return next
      })
    },
  })

  /**
   * Placas de bienes que están en transferencias pendientes.
   * Estos bienes se muestran deshabilitados en la tabla (no desaparecen).
   */
  const placasEnProceso = useMemo(() => {
    const placas = new Set<string>()
    for (const s of solicitudes) {
      if (s.estado === 'pendiente') {
        for (const b of s.bienes) {
          placas.add(b.placa)
        }
      }
    }
    return placas
  }, [solicitudes])

  const crearSolicitudTransferencia = useCallback(
    async (tipo: TipoBien, placasBienes: string[], receptor: Persona, pdfData?: { pdfBase64: string; nombreArchivoPdf: string }): Promise<CrearSolicitudRespuesta> => {
      if (!sesionUsuario) {
        return { ok: false, mensaje: 'La sesión de usuario no está disponible.' }
      }
      if (placasBienes.length === 0) {
        return { ok: false, mensaje: 'Seleccione al menos un bien.' }
      }
      const nombreRec = nombreCompletoEfectivo(receptor)
      if (!nombreRec) {
        return { ok: false, mensaje: 'Complete los datos de quien recibe' }
      }
      if (!receptor.numeroIdentificacion.trim()) {
        return { ok: false, mensaje: 'Indique el número de identificación de quien recibe.' }
      }
      if (!receptor.cargo?.trim()) {
        return { ok: false, mensaje: 'Indique el cargo de quien recibe.' }
      }
      if (!receptor.dependencia?.trim()) {
        return { ok: false, mensaje: 'Seleccione la dependencia de quien recibe.' }
      }
      if (!receptor.grupo?.trim()) {
        return { ok: false, mensaje: 'Seleccione el grupo de quien recibe.' }
      }
      if (!receptor.sede?.trim()) {
        return { ok: false, mensaje: 'Seleccione la sede de quien recibe.' }
      }

      const lista = tipo === 'normal' ? normal : floresta
      const seleccionados = lista.filter((b) => placasBienes.includes(b.placa))
      if (seleccionados.length !== placasBienes.length) {
        return { ok: false, mensaje: 'Algunos bienes no están disponibles.' }
      }

      const codigo = generarCodigo(seqRef.current, tipo)
      seqRef.current += 1

      const solicitud: SolicitudTransferencia = {
        codigo,
        fechaISO: new Date().toISOString(),
        estado: 'pendiente',
        tipoBien: tipo,
        emisor: { ...sesionUsuario },
        receptor: {
          ...receptor,
          nombreCompleto: nombreRec,
        },
        bienes: clonarBienes(seleccionados),
        ...(pdfData ? { pdfBase64: pdfData.pdfBase64, nombreArchivoPdf: pdfData.nombreArchivoPdf } : {}),
      }

      const envio = await enviarSolicitudTransferencia(solicitud)
      if (!envio.ok) {
        return { ok: false, mensaje: envio.mensaje ?? 'Error desconocido' }
      }

      // NO quitamos los bienes del inventario — solo los marcamos como "en proceso"
      // al agregar la solicitud al state, placasEnProceso se recalcula automáticamente
      setSolicitudes((prev) => [solicitud, ...prev])

      return { ok: true, codigo, solicitud }
    },
    [normal, floresta, sesionUsuario],
  )

  const obtenerSolicitud = useCallback(
    (codigo: string) => solicitudes.find((s) => s.codigo === codigo),
    [solicitudes],
  )

  const aceptarSolicitud = useCallback(
    async (codigo: string, consecutivoTns?: string) => {
      const s = solicitudes.find((x) => x.codigo === codigo)
      if (!s) return { ok: false, mensaje: 'Solicitud no encontrada.' }
      if (s.estado !== 'pendiente') return { ok: false, mensaje: 'La solicitud ya fue gestionada.' }

      const envio = await enviarDecisionTransferencia({ codigo, accion: 'aceptar', consecutivoTns })
      if (!envio.ok) return { ok: false, mensaje: envio.mensaje }

      // Al aceptar, los bienes SÍ se quitan del inventario (transferencia efectiva)
      const placasAceptadas = new Set(s.bienes.map((b) => b.placa))
      if (s.tipoBien === 'normal') {
        setNormal((prev) => prev.filter((b) => !placasAceptadas.has(b.placa)))
      } else {
        setFloresta((prev) => prev.filter((b) => !placasAceptadas.has(b.placa)))
      }

      setSolicitudes((prev) =>
        prev.map((x) => (x.codigo === codigo ? { ...x, estado: 'aceptada' as const } : x)),
      )
      return { ok: true }
    },
    [solicitudes],
  )

  const rechazarSolicitud = useCallback(
    async (codigo: string, observacion: string) => {
      const obs = observacion.trim()
      if (!obs) return { ok: false, mensaje: 'La observación es obligatoria al rechazar.' }
      if (obs.length < 30) {
        return { ok: false, mensaje: 'La observación debe tener al menos 30 caracteres.' }
      }
      if (obs.length > 500) {
        return { ok: false, mensaje: 'La observación no puede superar 500 caracteres.' }
      }
      const s = solicitudes.find((x) => x.codigo === codigo)
      if (!s) return { ok: false, mensaje: 'Solicitud no encontrada.' }
      if (s.estado !== 'pendiente') return { ok: false, mensaje: 'La solicitud ya fue gestionada.' }

      const envio = await enviarDecisionTransferencia({
        codigo,
        accion: 'rechazar',
        observacion: obs,
      })
      if (!envio.ok) return { ok: false, mensaje: envio.mensaje }

      // Al rechazar, los bienes vuelven a estar disponibles (se desbloquean automáticamente
      // porque la solicitud deja de ser "pendiente" y placasEnProceso se recalcula)
      setSolicitudes((prev) =>
        prev.map((x) =>
          x.codigo === codigo
            ? { ...x, estado: 'rechazada' as const, observacionRechazo: obs }
            : x,
        ),
      )
      return { ok: true }
    },
    [solicitudes],
  )

  const refrescarSolicitudes = useCallback(async () => {
    const solicitudesBackend = await consultarTransferencias()
    setSolicitudes(solicitudesBackend)
    const maxSeq = solicitudesBackend.reduce((max, s) => {
      const match = s.codigo.match(/TRF-\d{4}-(\d+)/)
      const num = match ? parseInt(match[1], 10) : 0
      return num > max ? num : max
    }, 0)
    seqRef.current = maxSeq + 1
  }, [])

  const cancelarSolicitud = useCallback(
    async (codigo: string) => {
      const s = solicitudes.find((x) => x.codigo === codigo)
      if (!s) return { ok: false, mensaje: 'Solicitud no encontrada.' }
      if (s.estado !== 'pendiente') return { ok: false, mensaje: 'Solo se pueden cancelar solicitudes pendientes.' }

      const envio = await cancelarTransferencia(codigo)
      if (!envio.ok) return { ok: false, mensaje: envio.mensaje }

      // Quitar la solicitud del state — los bienes se desbloquean automáticamente
      setSolicitudes((prev) => prev.filter((x) => x.codigo !== codigo))
      return { ok: true }
    },
    [solicitudes],
  )

  const historialPorEmisor = useCallback(
    (cedula: string) => {
      const c = cedula.replace(/\D/g, '')
      return solicitudes.filter((s) => s.emisor.numeroIdentificacion.replace(/\D/g, '') === c)
    },
    [solicitudes],
  )

  const value = useMemo(
    () => ({
      sesionUsuario,
      sesionEstado,
      cedulaSesion,
      inventarioNormal: normal,
      inventarioFloresta: floresta,
      solicitudes,
      placasEnProceso,
      placasPendientesInventario,
      crearSolicitudTransferencia,
      obtenerSolicitud,
      aceptarSolicitud,
      rechazarSolicitud,
      cancelarSolicitud,
      historialPorEmisor,
      refrescarSolicitudes,
      transferenciasRevisando,
    }),
    [
      sesionUsuario,
      sesionEstado,
      cedulaSesion,
      normal,
      floresta,
      solicitudes,
      placasEnProceso,
      placasPendientesInventario,
      transferenciasRevisando,
      crearSolicitudTransferencia,
      obtenerSolicitud,
      aceptarSolicitud,
      rechazarSolicitud,
      cancelarSolicitud,
      historialPorEmisor,
      refrescarSolicitudes,
    ],
  )

  return <TransferenciasContext.Provider value={value}>{children}</TransferenciasContext.Provider>
}
