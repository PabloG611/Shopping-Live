/**
 * Servicio de notificaciones centralizado.
 * Usa Sileo como motor. Importar y usar en cualquier parte del proyecto.
 *
 * Los toasts son efímeros (solo en pantalla). NO se replican a la campana del
 * ecosistema: esa bandeja se reserva para alertas de negocio importantes que
 * se envían explícitamente con `alertaInventario.*` (duplicados, bajas, etc.).
 */
import { sileo } from 'sileo'

const POSICION = 'top-center' as const
const DURACION = 5000

/**
 * Color de fondo del toast (relleno del SVG de Sileo) según el tipo.
 * Tonos suaves pero con suficiente contraste sobre la página blanca.
 */
const FONDO: Record<'exito' | 'error' | 'info' | 'aviso', string> = {
  exito: '#e9f9ef', // verde suave
  error: '#fdecec', // rojo/rosado suave
  info: '#e8f1fd', // azul suave
  aviso: '#fef6e7', // ámbar suave
}

export function notificar(tipo: 'exito' | 'error' | 'info' | 'aviso', mensaje: string) {
  switch (tipo) {
    case 'exito':
      sileo.success({ title: 'Éxito', description: mensaje, position: POSICION, duration: DURACION, fill: FONDO.exito })
      break
    case 'error':
      sileo.error({ title: 'Error', description: mensaje, position: POSICION, duration: DURACION, fill: FONDO.error })
      break
    case 'info':
      sileo.info({ title: 'Información', description: mensaje, position: POSICION, duration: DURACION, fill: FONDO.info })
      break
    case 'aviso':
      sileo.warning({ title: 'Atención', description: mensaje, position: POSICION, duration: DURACION, fill: FONDO.aviso })
      break
  }
  // Los toasts NO se replican a la campana: la bandeja queda reservada solo
  // para alertas de negocio enviadas explícitamente vía alertaInventario.*
}

export const notificacion = {
  exito: (msg: string) => notificar('exito', msg),
  error: (msg: string) => notificar('error', msg),
  info: (msg: string) => notificar('info', msg),
  aviso: (msg: string) => notificar('aviso', msg),
}
