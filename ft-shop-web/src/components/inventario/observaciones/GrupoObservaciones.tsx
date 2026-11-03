/**
 * Grupo de observaciones de UN tipo (cambio de placa/servicio/descripción),
 * agrupado internamente por Servicio → Usuario que reportó. Acordeón colapsable.
 */
import { useState, useMemo } from 'react'
import { FaChevronRight, FaUser } from 'react-icons/fa6'
import type { ObservacionBackend } from '../../../services/observacionesApiService'

interface Props {
  titulo: string
  icon: React.ReactNode
  color: string
  observaciones: ObservacionBackend[]
  resueltas: boolean
  onResolver: (obs: ObservacionBackend) => void
}

export default function GrupoObservaciones({ titulo, icon, color, observaciones, resueltas, onResolver }: Props) {
  const [abierto, setAbierto] = useState(true)

  // Agrupar por servicio → usuario que reportó.
  const porServicio = useMemo(() => {
    const mapa = new Map<string, Map<string, ObservacionBackend[]>>()
    for (const o of observaciones) {
      const svc = o.servicio || 'Sin servicio'
      const usr = o.reportado_por_nombre || o.reportado_por_cedula || 'Sin usuario'
      if (!mapa.has(svc)) mapa.set(svc, new Map())
      const porUsr = mapa.get(svc)!
      if (!porUsr.has(usr)) porUsr.set(usr, [])
      porUsr.get(usr)!.push(o)
    }
    return mapa
  }, [observaciones])

  const fmtFecha = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }) } catch { return '' }
  }

  return (
    <section className={`gi-band-grupo${abierto ? ' is-open' : ''}`} style={{ ['--g-color' as any]: color }}>
      <button type="button" className="gi-band-grupo__head" onClick={() => setAbierto(!abierto)}>
        <FaChevronRight className="gi-band-grupo__chevron" size={11} />
        <span className="gi-band-grupo__ic">{icon}</span>
        <span className="gi-band-grupo__titulo">{titulo}</span>
        <span className="gi-band-grupo__badge">{observaciones.length}</span>
      </button>

      {abierto && (
        <div className="gi-band-grupo__body">
          {Array.from(porServicio.entries()).map(([servicio, porUsr]) => (
            <div key={servicio} className="gi-band-svc">
              <div className="gi-band-svc__nombre">{servicio}</div>
              {Array.from(porUsr.entries()).map(([usuario, items]) => (
                <div key={usuario} className="gi-band-usr">
                  <div className="gi-band-usr__nombre"><FaUser size={9} /> {usuario}</div>
                  {items.map(o => (
                    <div key={o.id} className="gi-band-item">
                      <div className="gi-band-item__top">
                        <span className="gi-band-item__placa">{o.placa}</span>
                        {o.subtipo && <span className="gi-band-item__subtipo">{o.subtipo}</span>}
                        <span className={`gi-band-item__estado is-${o.estado}`}>{o.estado_display}</span>
                        <span className="gi-band-item__fecha">{fmtFecha(o.fecha_creacion)}</span>
                      </div>
                      {o.descripcion_bien && <span className="gi-band-item__desc">{o.descripcion_bien}</span>}
                      {o.texto && <span className="gi-band-item__texto">{o.texto}</span>}
                      {o.responsable_nombre && <span className="gi-band-item__resp">Responsable: {o.responsable_nombre}{o.responsable_cedula ? ` · CC ${o.responsable_cedula}` : ''}</span>}

                      {resueltas ? (
                        <div className="gi-band-item__resol">
                          <span className="gi-band-item__resol-label">Resuelta por {o.resuelto_por_nombre || '—'}{o.fecha_resolucion ? ` · ${fmtFecha(o.fecha_resolucion)}` : ''}</span>
                          {o.accion_realizada && <span className="gi-band-item__resol-accion">{o.accion_realizada}</span>}
                          {o.detalle_solucion && <span className="gi-band-item__resol-detalle">{o.detalle_solucion}</span>}
                        </div>
                      ) : (
                        <div className="gi-band-item__acciones">
                          <button type="button" className="gi-band-btn-resolver" onClick={() => onResolver(o)}>Resolver</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
