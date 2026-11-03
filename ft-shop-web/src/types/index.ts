export type TipoBien = 'normal' | 'floresta'

export type EstadoSolicitud = 'pendiente' | 'aceptada' | 'rechazada'

export interface Bien {
  /** Identificador de origen; puede repetirse en datos de ejemplo. La clave única en UI e inventario es `placa`. */
  id: string
  placa: string
  descripcion: string
  serial: string | null
  codigo: string
  nombreDependencia?: string | null
  tipo: TipoBien
  /** Indica si el bien está pendiente de inventario (faltante). Si es true, no se puede transferir. */
  pendienteInventario?: boolean
  /** Último prefijo de documento del bien (BJ = dado de baja, CB = confirmado baja, etc.) */
  ultimoPrefijo?: string
  /** Valor actual del bien (VALORCOMP de Firebird) */
  valorActual?: number | null
}

export interface Persona {
  nombreCompleto: string
  tipoIdentificacion: string
  numeroIdentificacion: string
  /** Datos laborales / ubicación (transferencia de bienes) */
  cargo?: string
  dependencia?: string
  grupo?: string
  sede?: string
  numeroContrato?: string
  /** Solo si el receptor no está en catálogo; se arma `nombreCompleto` al enviar */
  primerNombre?: string
  segundoNombre?: string
  primerApellido?: string
  segundoApellido?: string
}

export interface SolicitudTransferencia {
  codigo: string
  fechaISO: string
  estado: EstadoSolicitud
  tipoBien: TipoBien
  emisor: Persona
  receptor: Persona
  bienes: Bien[]
  observacionRechazo?: string
  pdfBase64?: string
  nombreArchivoPdf?: string
  consecutivoTns?: string
}

export interface ResultadoConsulta {
  persona: Persona
  bienesNormal: Bien[]
  bienesFloresta: Bien[]
}
