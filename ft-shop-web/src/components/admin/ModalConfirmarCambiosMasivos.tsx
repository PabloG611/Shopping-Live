import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { useModalAnimacionSalida } from '../../hooks/useModalAnimacionSalida'

import '../../pages/PageLayout.css'
import '../transferencia/HistorialTransferencias.css'

interface CambioMasivoDetalle {
  matid: number
  codigo: string
  cambios: {
    desmat?: string
    grupmatid?: number
    serial?: string | null
    serial2?: string | null
  }
}

interface ModalConfirmarCambiosMasivosProps {
  tituloId: string
  baseDatos: string
  tipoDocumento: string
  numeroDocumento: string
  cambios: CambioMasivoDetalle[]
  error: string | null
  enviando: boolean
  onCerrar: () => void
  onConfirmar: () => void
}

export function ModalConfirmarCambiosMasivos({
  tituloId,
  baseDatos,
  tipoDocumento,
  numeroDocumento,
  cambios,
  error,
  enviando,
  onCerrar,
  onConfirmar,
}: ModalConfirmarCambiosMasivosProps) {
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
        style={{ maxWidth: '720px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="historial-modal__cabecera">
          <h4 id={tituloId} className="historial-modal__titulo">
            ⚠️ Confirmar cambios masivos en base de datos
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
            ⚠️ Esta operación modificará {cambios.length} bienes directamente en la base de datos en producción.
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
            <dt>Documento</dt>
            <dd className="historial-modal__titulo-codigo">{tipoDocumento}-{numeroDocumento}</dd>
          </div>
          <div>
            <dt>Bienes a actualizar</dt>
            <dd><strong>{cambios.length}</strong></dd>
          </div>
        </dl>

        <section className="historial-modal__seccion" aria-labelledby={`${tituloId}-cambios`}>
          <h5 id={`${tituloId}-cambios`} className="historial-modal__subtitulo">
            Resumen de cambios
          </h5>
          <div className="historial-modal__tabla-wrap">
            <div className="historial__scroll" style={{ maxHeight: '350px' }}>
              <table className="historial__table">
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Campos modificados</th>
                  </tr>
                </thead>
                <tbody>
                  {cambios.map((cambio) => {
                    const camposModificados = []
                    if (cambio.cambios.desmat) camposModificados.push('Descripción')
                    if (cambio.cambios.grupmatid) camposModificados.push('Grupo del Bien')
                    if (cambio.cambios.serial !== undefined) camposModificados.push('Serial')
                    
                    return (
                      <tr key={cambio.matid}>
                        <td>
                          <strong style={{ fontFamily: 'monospace' }}>{cambio.codigo}</strong>
                        </td>
                        <td>
                          <span style={{ color: '#28a745', fontWeight: 500 }}>
                            {camposModificados.join(', ')}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
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
            {enviando ? 'Guardando…' : `Confirmar y guardar ${cambios.length} bienes`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
