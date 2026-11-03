/**
 * IndicadorColaborador — Indicador elegante y discreto de con quién estás
 * colaborando. Muestra un ícono de colaboración + el/los nombre(s), sin avatares
 * de iniciales. Se ubica entre "Bienes escaneados" y el filtro de la tabla.
 *
 * Aparición/desaparición SUAVE: mantiene el elemento montado durante la
 * animación de salida (fade + scale) y solo lo desmonta al terminar. El
 * contenedor padre reserva el espacio central, así que aparecer/desaparecer NO
 * mueve bruscamente el resto del header.
 */
import { useEffect, useRef, useState } from 'react'
import { FaUserGroup } from 'react-icons/fa6'

export interface ColaboradorInfo {
  usuario: string
  cedula: string
  cargo?: string
}

interface IndicadorColaboradorProps {
  /** Otros participantes online del mismo servicio (sin incluirme a mí). */
  colaboradores: ColaboradorInfo[]
}

/** Nombre corto: primeros dos tokens (nombre + primer apellido). */
function nombreCorto(name: string): string {
  return (name || '').trim().split(/\s+/).slice(0, 2).join(' ')
}

export default function IndicadorColaborador({ colaboradores }: IndicadorColaboradorProps) {
  const hayColaboradores = colaboradores && colaboradores.length > 0

  // `montado` mantiene el nodo en el DOM mientras dura la animación de salida.
  // `visible` controla la clase que dispara la transición (opacity/scale).
  const [montado, setMontado] = useState(hayColaboradores)
  const [visible, setVisible] = useState(hayColaboradores)
  // Conserva los últimos datos para poder animar la SALIDA con el nombre aún visible.
  const ultimosRef = useRef<ColaboradorInfo[]>(colaboradores)

  useEffect(() => {
    if (hayColaboradores) {
      ultimosRef.current = colaboradores
      setMontado(true)
      // Doble rAF: montar primero oculto y luego activar la clase visible para
      // que la transición de entrada corra (evita saltar directo al estado final).
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(raf)
    }
    // Salida: animar a oculto y desmontar al terminar la transición (~280ms).
    setVisible(false)
    const t = window.setTimeout(() => setMontado(false), 300)
    return () => window.clearTimeout(t)
  }, [hayColaboradores, colaboradores])

  if (!montado) return null

  const datos = hayColaboradores ? colaboradores : ultimosRef.current
  const nombres = datos.map(c => nombreCorto(c.usuario))
  const etiqueta = datos.length <= 1
    ? (nombres[0] || '')
    : `${nombres[0]} +${datos.length - 1}`

  return (
    <div
      className={`indicador-colab${visible ? ' indicador-colab--visible' : ''}`}
      title={`Trabajando en modo colaborativo con: ${datos.map(c => c.usuario).join(', ')}`}
    >
      <span className="indicador-colab__icono" aria-hidden>
        <FaUserGroup />
      </span>
      <span className="indicador-colab__texto">
        <span className="indicador-colab__label">Colaborando con</span>
        <span className="indicador-colab__nombre">{etiqueta}</span>
      </span>
      <span className="indicador-colab__pulso" aria-hidden />
    </div>
  )
}
