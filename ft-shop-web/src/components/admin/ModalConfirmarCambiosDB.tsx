import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { useModalAnimacionSalida } from '../../hooks/useModalAnimacionSalida'

import '../../pages/PageLayout.css'
import '../transferencia/HistorialTransferencias.css'

interface CambioDetalle {
  campo: string
  valorAnterior: string | number
  valorNuevo: string | number
}

interface ModalConfirmarCambiosDBProps {
  tituloId: string
  baseDatos: string
  codigoArticulo: string
  nombreArticulo: string
  cambios: CambioDetalle[]
  error: string | null
  enviando: boolean
  onCerrar: () => void
  onConfirmar: () => void
}

export function ModalConfirmarCambiosDB({
  tituloId,
  baseDatos,
  codigoArticulo,
  nombreArticulo,
  cambios,
  error,
  enviando,
  onCerrar,
  onConfirmar,
}: ModalConfirmarCambiosDBProps) {
  const { claseBackdrop, solicitarCierre, onFinAnimacionBackdrop } = useModalAnimacionSalida(onCerrar)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !enviando) solicitarCierre()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [solicitarCierre, enviando])

  return createPortal(
    <div
      className={`historial-modal-backdrop${claseBackdrop ? ` ${claseBackdrop}` : ''}`}
      role="presentation"
      onClick={enviando ? undefined : solicitarCierre}
      onAnimationEnd={onFinAnimacionBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="historial-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="historial-modal__cabecera">
          <h4 id={tituloId} className="historial-modal__titulo">
            ⚠️ Confirmar cambios en base de datos
          </h4>
          <button
            type="button"
            className="historial-modal__cerrar"
            onClick={solicitarCierre}
            disabled={enviando}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="historial-modal__seccion historial-modal__seccion--alerta">
          <p className="historial-modal__texto" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
            ⚠️ Esta operación modificará directamente la base de datos en producción.
          </p>
          <p className="historial-modal__texto">
            Revise cuidadosamente los cambios antes de confirmar. Esta acción no se puede deshacer automáticamente.
          </p>
        </div>

        <dl className="historial-modal__meta">
          <div>
            <dt>Base de datos</dt>
            <dd>{baseDatos}</dd>
          </div>
          <div>
            <dt>Código/Placa</dt>
            <dd className="historial-modal__titulo-codigo">{codigoArticulo}</dd>
          </div>
        </dl>

        <section className="historial-modal__seccion" aria-labelledby={`${tituloId}-art`}>
          <h5 id={`${tituloId}-art`} className="historial-modal__subtitulo">
            Artículo/Bien
          </h5>
          <p className="historial-modal__texto">
            <strong>{nombreArticulo}</strong>
          </p>
        </section>

        <section className="historial-modal__seccion" aria-labelledby={`${tituloId}-cambios`}>
          <h5 id={`${tituloId}-cambios`} className="historial-modal__subtitulo">
            Cambios a realizar ({cambios.length})
          </h5>
          <div className="historial-modal__tabla-wrap">
            <div className="historial__scroll">
              <table className="historial__table">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Valor anterior</th>
                    <th>Valor nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  {cambios.map((cambio, idx) => (
                    <tr key={idx}>
                      <td>
                        <strong>{cambio.campo}</strong>
                      </td>
                      <td>
                        <span style={{ color: '#dc3545' }}>{cambio.valorAnterior}</span>
                      </td>
                      <td>
                        <span style={{ color: '#28a745', fontWeight: 600 }}>{cambio.valorNuevo}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {error ? (
          <p className="page__error" style={{ margin: '0.5rem 0 0' }} role="alert">
            {error}
          </p>
        ) : null}

        <div className="historial-modal__acciones">
          <button type="button" className="page__btn page__btn--secondary" onClick={solicitarCierre} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="page__btn page__btn--danger" onClick={onConfirmar} disabled={enviando}>
            {enviando ? 'Guardando…' : 'Confirmar y guardar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
