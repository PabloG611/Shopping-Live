import type { Persona } from '../../types'

import './PersonaCard.css'

interface PersonaCardProps {
  persona: Persona
  titulo?: string
}

export function PersonaCard({ persona, titulo = 'Persona consultada' }: PersonaCardProps) {
  return (
    <section className="persona-card" aria-label={titulo}>
      <h2 className="persona-card__titulo">{titulo}</h2>
      <div className="persona-card__body">
        <div className="persona-card__nombre">{persona.nombreCompleto}</div>
        <div className="persona-card__doc">
          <span className="persona-card__tipo">{persona.tipoIdentificacion}</span>
          <span className="persona-card__numero">{persona.numeroIdentificacion}</span>
        </div>
      </div>
    </section>
  )
}
