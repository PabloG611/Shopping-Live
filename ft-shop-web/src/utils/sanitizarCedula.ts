/** Misma regla que la pantalla de consulta de bienes (cédula de ciudadanía). */
export const MAX_CEDULA_DIGITOS = 10

/** Solo dígitos, recortado a la longitud máxima permitida (entrada de usuario). */
export function sanitizarCedula(valor: string): string {
  return valor.replace(/\D/g, '').slice(0, MAX_CEDULA_DIGITOS)
}

/** Comparar identificaciones numéricas en datos (inventario, catálogo): solo quita no-dígitos. */
export function normalizarCedulaParaComparar(valor: string): string {
  return valor.replace(/\D/g, '')
}
