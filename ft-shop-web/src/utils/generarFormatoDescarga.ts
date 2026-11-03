import type { Persona } from '../types'

export function personaVacia(): Persona {
  return {
    nombreCompleto: '',
    tipoIdentificacion: 'CC',
    numeroIdentificacion: '',
    cargo: '',
    dependencia: '',
    grupo: '',
    sede: '',
    numeroContrato: '',
    primerNombre: '',
    segundoNombre: '',
    primerApellido: '',
    segundoApellido: '',
  }
}
