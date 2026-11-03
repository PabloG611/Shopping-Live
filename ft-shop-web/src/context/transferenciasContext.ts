import { createContext } from 'react'

import type { Bien, Persona, SolicitudTransferencia, TipoBien } from '../types'

export interface CrearSolicitudResultado {
  ok: true
  codigo: string
  solicitud: SolicitudTransferencia
}

export interface CrearSolicitudError {
  ok: false
  mensaje: string
}

export type CrearSolicitudRespuesta = CrearSolicitudResultado | CrearSolicitudError

export type SesionEstado = 'cargando' | 'lista' | 'error'

export interface TransferenciasContextValue {
  sesionUsuario: Persona | null
  sesionEstado: SesionEstado
  cedulaSesion?: string
  inventarioNormal: Bien[]
  inventarioFloresta: Bien[]
  solicitudes: SolicitudTransferencia[]
  /** Placas de bienes en transferencias pendientes (deshabilitados en la tabla) */
  placasEnProceso: Set<string>
  /** Placas de bienes pendientes de inventario (bloqueados, no se pueden transferir) */
  placasPendientesInventario: Set<string>
  /** IDs de transferencias que un admin está revisando en este momento */
  transferenciasRevisando: Set<string>
  crearSolicitudTransferencia: (
    tipo: TipoBien,
    placasBienes: string[],
    receptor: Persona,
    pdfData?: { pdfBase64: string; nombreArchivoPdf: string },
  ) => Promise<CrearSolicitudRespuesta>
  obtenerSolicitud: (codigo: string) => SolicitudTransferencia | undefined
  aceptarSolicitud: (codigo: string, consecutivoTns?: string) => Promise<{ ok: boolean; mensaje?: string }>
  rechazarSolicitud: (codigo: string, observacion: string) => Promise<{ ok: boolean; mensaje?: string }>
  cancelarSolicitud: (codigo: string) => Promise<{ ok: boolean; mensaje?: string }>
  historialPorEmisor: (cedula: string) => SolicitudTransferencia[]
  /** Recarga las solicitudes desde el backend */
  refrescarSolicitudes: () => Promise<void>
}

export const TransferenciasContext = createContext<TransferenciasContextValue | null>(null)
