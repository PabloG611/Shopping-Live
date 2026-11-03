import type { Persona } from '../types'

/** Nombre a mostrar o validar: explícito o compuesto por partes. */
export function nombreCompletoEfectivo(p: Persona): string {
  const nc = p.nombreCompleto?.trim() ?? ''
  if (nc) return nc
  const s = (x?: string) => (x?.trim() ? x.trim() : '')
  return [s(p.primerNombre), s(p.segundoNombre), s(p.primerApellido), s(p.segundoApellido)]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
