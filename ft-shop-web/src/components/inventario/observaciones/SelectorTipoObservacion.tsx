/**
 * Selector estandarizado de observación con desplegable CUSTOM (acorde al estilo
 * del modal: píldoras, bordes redondeados, chips). El usuario elige un TIPO del
 * catálogo (y un subtipo si aplica) o "Otra observación" para texto libre.
 */
import { useState } from 'react'
import { FaChevronDown, FaTag, FaRightLeft, FaPenToSquare, FaLocationDot, FaRegPenToSquare, FaCircleCheck } from 'react-icons/fa6'
import { CATALOGO_OBSERVACIONES, type TipoObservacionBackend } from '../../../services/observacionesApiService'

export interface SeleccionObservacion {
  tipo: TipoObservacionBackend | ''
  subtipo: string
  texto: string
}

interface Props {
  valor: SeleccionObservacion
  onChange: (v: SeleccionObservacion) => void
}

const ICONO: Record<TipoObservacionBackend, React.ReactNode> = {
  cambio_placa: <FaTag size={14} />,
  cambio_servicio: <FaRightLeft size={14} />,
  cambio_descripcion: <FaPenToSquare size={14} />,
  validacion_servicio: <FaLocationDot size={14} />,
  otra: <FaRegPenToSquare size={14} />,
}

export default function SelectorTipoObservacion({ valor, onChange }: Props) {
  const [abierto, setAbierto] = useState(false)
  const opcion = CATALOGO_OBSERVACIONES.find(o => o.tipo === valor.tipo)
  const esOtra = valor.tipo === 'otra'
  const requiereTexto = esOtra || valor.tipo === 'cambio_servicio' || valor.tipo === 'cambio_descripcion'

  return (
    <div className="obs-selector">
      {/* Tipo — desplegable custom */}
      <label className="obs-selector__label">Tipo de observación</label>
      <div className="obs-dd">
        <button type="button" className={`obs-dd__btn${abierto ? ' is-open' : ''}`} onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
          {opcion ? (
            <>
              <span className={`obs-dd__ic obs-dd__ic--${opcion.escala ? 'escala' : 'local'}`}>{ICONO[opcion.tipo]}</span>
              <span className="obs-dd__txt">{opcion.label}</span>
              <span className={`obs-dd__badge${opcion.escala ? ' is-escala' : ' is-local'}`}>{opcion.escala ? 'Escala' : 'No escala'}</span>
            </>
          ) : (
            <span className="obs-dd__placeholder">Seleccione un tipo…</span>
          )}
          <FaChevronDown size={12} className="obs-dd__chevron" />
        </button>

        {abierto && (
          <>
            <div className="obs-dd__backdrop" onClick={() => setAbierto(false)} />
            <div className="obs-dd__menu" role="listbox">
              {CATALOGO_OBSERVACIONES.map(o => {
                const activo = o.tipo === valor.tipo
                return (
                  <button
                    key={o.tipo}
                    type="button"
                    role="option"
                    aria-selected={activo}
                    className={`obs-dd__item${activo ? ' is-active' : ''}`}
                    onClick={() => { onChange({ tipo: o.tipo, subtipo: '', texto: '' }); setAbierto(false) }}
                  >
                    <span className={`obs-dd__ic obs-dd__ic--${o.escala ? 'escala' : 'local'}`}>{ICONO[o.tipo]}</span>
                    <span className="obs-dd__item-txt">{o.label}</span>
                    <span className={`obs-dd__badge${o.escala ? ' is-escala' : ' is-local'}`}>{o.escala ? 'Escala' : 'No escala'}</span>
                    {activo && <FaCircleCheck size={14} className="obs-dd__check" />}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Subtipo — píldoras seleccionables (acorde al estilo del modal) */}
      {opcion && opcion.subtipos.length > 0 && (
        <>
          <label className="obs-selector__label">Detalle</label>
          <div className="obs-subtipos">
            {opcion.subtipos.map(s => (
              <button
                key={s}
                type="button"
                className={`obs-subtipo${valor.subtipo === s ? ' is-active' : ''}`}
                onClick={() => onChange({ ...valor, subtipo: s })}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Texto */}
      {valor.tipo && (
        <>
          <label className="obs-selector__label">
            {esOtra ? 'Describa la novedad (obligatorio)' : `Observación adicional${requiereTexto ? ' (recomendado)' : ' (opcional)'}`}
          </label>
          <textarea
            className="obs-selector__textarea"
            rows={3}
            value={valor.texto}
            maxLength={300}
            placeholder={
              esOtra
                ? 'Describa la novedad detectada durante la toma…'
                : valor.tipo === 'cambio_descripcion'
                  ? 'Ej: El bien físico es una silla, en el sistema figura como nevera.'
                  : valor.tipo === 'cambio_servicio'
                    ? 'Ej: El bien está físicamente en Viáticos, en el sistema figura en Almacén General.'
                    : 'Detalle adicional (opcional)…'
            }
            onChange={(e) => onChange({ ...valor, texto: e.target.value })}
          />
          <div className="obs-selector__contador">{valor.texto.trim().length}/300</div>
        </>
      )}

      {/* Aviso de escalamiento */}
      {opcion && (
        <p className={`obs-selector__aviso${opcion.escala ? ' is-escala' : ' is-local'}`}>
          {opcion.escala
            ? 'Esta observación se enviará a la bandeja del gestor para su resolución y bloqueará el guardado hasta resolverse.'
            : 'Esta observación se gestiona en caliente durante la toma y no bloquea el guardado.'}
        </p>
      )}
    </div>
  )
}
