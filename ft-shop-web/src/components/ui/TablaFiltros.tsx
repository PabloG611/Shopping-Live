import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { FaFilter, FaSlash } from 'react-icons/fa'

import type { CabeceraFiltrosCaja } from '../../hooks/useTheadFiltrosCabecal'

import './TablaFiltros.css'

interface TablaFiltrosCurtainProps {
  /** Muestra sombra + botón (cursor sobre el thead). */
  muestra: boolean
  caja: CabeceraFiltrosCaja
  expandido: boolean
  onToggle: () => void
  idBoton: string
  idPanel: string
}

/** Velo alineado a la fila de títulos del `<thead>`: sombreado y botón centrado; solo el botón recibe clics. */
export function TablaFiltrosCurtain({ muestra, caja, expandido, onToggle, idBoton, idPanel }: TablaFiltrosCurtainProps) {
  if (caja.height <= 0) return null
  return (
    <div
      className={`tabla-filtros-curtain${muestra ? ' tabla-filtros-curtain--visible' : ''}`}
      style={{
        top: caja.top,
        left: caja.left,
        width: caja.width,
        height: caja.height,
      }}
      aria-hidden={!muestra}
    >
      <div className="tabla-filtros-curtain__sombra" aria-hidden />
      <div className="tabla-filtros-curtain__centro">
        <TablaFiltrosToolbar
          visible
          expandido={expandido}
          onToggle={onToggle}
          idBoton={idBoton}
          idPanel={idPanel}
          soloIcono
          estiloCabecera
        />
      </div>
    </div>
  )
}

interface TablaFiltrosToolbarProps {
  /** La tabla ofrece filtros. */
  visible: boolean
  expandido: boolean
  onToggle: () => void
  idBoton: string
  idPanel: string
  /** Solo icono (botón flotante sobre el encabezado). */
  soloIcono?: boolean
  /** Estilo transparente / icono blanco para el velo sobre el encabezado. */
  estiloCabecera?: boolean
}

const TOOLTIP_FILTROS_MS = 420

export function TablaFiltrosToolbar({
  visible,
  expandido,
  onToggle,
  idBoton,
  idPanel,
  soloIcono = false,
  estiloCabecera = false,
}: TablaFiltrosToolbarProps) {
  const tipId = useId()
  const [tipVisible, setTipVisible] = useState(false)
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const textoTip = expandido ? 'Ocultar filtros por columna' : 'Mostrar filtros por columna'

  const programarTip = useCallback(() => {
    if (!estiloCabecera) return
    if (tipTimer.current) clearTimeout(tipTimer.current)
    tipTimer.current = setTimeout(() => setTipVisible(true), TOOLTIP_FILTROS_MS)
  }, [estiloCabecera])

  const ocultarTip = useCallback(() => {
    if (tipTimer.current) {
      clearTimeout(tipTimer.current)
      tipTimer.current = null
    }
    setTipVisible(false)
  }, [])

  useEffect(
    () => () => {
      if (tipTimer.current) clearTimeout(tipTimer.current)
    },
    [],
  )

  if (!visible) return null
  const clasesBtn = [
    'tabla-filtros-toolbar__btn',
    soloIcono && 'tabla-filtros-toolbar__btn--icono',
    estiloCabecera && 'tabla-filtros-toolbar__btn--cabecera',
  ]
    .filter(Boolean)
    .join(' ')

  const boton = (
    <button
      id={idBoton}
      type="button"
      className={clasesBtn}
      aria-expanded={expandido}
      aria-controls={idPanel}
      aria-describedby={estiloCabecera && tipVisible ? tipId : undefined}
      onClick={onToggle}
      title={estiloCabecera ? undefined : textoTip}
      onFocus={programarTip}
      onBlur={ocultarTip}
    >
      {estiloCabecera ? (
        <span className="tabla-filtros-toolbar__icon-filtro" aria-hidden>
          <FaFilter className="tabla-filtros-toolbar__icon-filtro-base" />
          {expandido ? <FaSlash className="tabla-filtros-toolbar__icon-filtro-tacha" /> : null}
        </span>
      ) : (
        <FaFilter aria-hidden />
      )}
      <span className="tabla-filtros-toolbar__sr">{expandido ? 'Ocultar filtros' : 'Filtros por columna'}</span>
    </button>
  )

  return (
    <div className="tabla-filtros-toolbar">
      {estiloCabecera ? (
        <div className="tabla-filtros-toolbar__cabecera-bar" onMouseEnter={programarTip} onMouseLeave={ocultarTip}>
          {boton}
          <span
            id={tipId}
            role="tooltip"
            className={`tabla-filtros-tooltip${tipVisible ? ' tabla-filtros-tooltip--visible' : ''}`}
          >
            {textoTip}
          </span>
        </div>
      ) : (
        boton
      )}
    </div>
  )
}
