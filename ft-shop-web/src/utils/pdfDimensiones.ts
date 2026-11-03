/**
 * Utilidades para leer el tamaño de página de un PDF sin librerías externas.
 *
 * Un PDF declara el tamaño de cada página con la entrada `/MediaBox [x0 y0 x1 y1]`
 * (en puntos, 1/72 pulgada). Con esos valores calculamos el aspect-ratio real
 * y sabemos si la hoja es vertical (portrait) u horizontal (landscape).
 */

export interface PdfDimensiones {
  ancho: number
  alto: number
  /** ancho / alto — usable directamente en CSS `aspect-ratio`. */
  aspectRatio: number
  orientacion: 'vertical' | 'horizontal'
}

/** Proporción por defecto si no se puede leer el PDF (A4 vertical). */
const FALLBACK: PdfDimensiones = {
  ancho: 1,
  alto: 1.4142,
  aspectRatio: 1 / 1.4142,
  orientacion: 'vertical',
}

/**
 * Extrae el tamaño de la primera página desde el contenido crudo del PDF.
 * Busca el primer `/MediaBox [ ... ]`.
 */
function parsearMediaBox(pdfTexto: string): PdfDimensiones | null {
  const match = pdfTexto.match(
    /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/,
  )
  if (!match) return null

  const x0 = parseFloat(match[1])
  const y0 = parseFloat(match[2])
  const x1 = parseFloat(match[3])
  const y1 = parseFloat(match[4])

  const ancho = Math.abs(x1 - x0)
  const alto = Math.abs(y1 - y0)
  if (!ancho || !alto) return null

  return {
    ancho,
    alto,
    aspectRatio: ancho / alto,
    orientacion: ancho >= alto ? 'horizontal' : 'vertical',
  }
}

/**
 * Calcula las dimensiones de un PDF a partir de su cadena base64
 * (sin el prefijo `data:...;base64,` o con él, ambos sirven).
 */
export function dimensionesDesdeBase64(base64: string): PdfDimensiones {
  try {
    const limpio = base64.includes(',') ? base64.split(',')[1] : base64
    const binario = atob(limpio)
    // El MediaBox suele estar en la cabecera del PDF; leer todo es seguro
    // para documentos pequeños como estos formatos de una página.
    return parsearMediaBox(binario) ?? FALLBACK
  } catch {
    return FALLBACK
  }
}

/**
 * Calcula las dimensiones de un PDF a partir de un data URL
 * (`data:application/pdf;base64,....`).
 */
export function dimensionesDesdeDataUrl(dataUrl: string): PdfDimensiones {
  return dimensionesDesdeBase64(dataUrl)
}
