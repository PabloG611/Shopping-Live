/**
 * Modal de selección de servicio destino al "Incluir al inventario" un bien
 * desde el panel Coordinador.
 *
 * Reemplaza la antigua obligación de tener un servicio activo previo en la Toma
 * de inventario principal: ahora el usuario elige, en el momento de incluir el
 * bien, a cuál de SUS servicios habilitados lo quiere agregar. Lista los
 * servicios habilitados del usuario (fetchServiciosHabilitadosUsuario con
 * fallback a getServiciosHabilitados) y resuelve el nombre de cada servicio con
 * el conteo general (cargarServicios). Si no se puede resolver el nombre, se
 * muestra solo el código.
 */
import { useEffect, useMemo, useState } from 'react'
import { FaLayerGroup, FaXmark } from 'react-icons/fa6'
import { getAuthUser } from '../../utils/authState'
import {
  cargarServicios,
  fetchServiciosHabilitadosUsuario,
  getServiciosHabilitados,
} from '../../services/controlSeguimientoService'
import './ModalSeleccionServicio.css'

export interface ServicioSeleccionable {
  codigo: string
  nombre: string
}

interface Props {
  isOpen: boolean
  /** Placa del bien que se va a incluir (solo para el encabezado informativo). */
  placa?: string
  onCerrar: () => void
  /** El usuario eligió un servicio destino. */
  onSeleccionar: (servicio: ServicioSeleccionable) => void
}

export default function ModalSeleccionServicio({ isOpen, placa, onCerrar, onSeleccionar }: Props) {
  const [servicios, setServicios] = useState<ServicioSeleccionable[]>([])
  const [cargando, setCargando] = useState(false)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    if (!isOpen) return
    let cancelado = false
    const cargar = async () => {
      setCargando(true)
      setFiltro('')
      try {
        // 1) Códigos de servicios habilitados del usuario logueado.
        const username = (getAuthUser()?.username || '').trim().toLowerCase()
        let codigos = username ? await fetchServiciosHabilitadosUsuario(username) : []
        // Fallback a la configuración global si el usuario no tiene asignación.
        if (!codigos || codigos.length === 0) codigos = getServiciosHabilitados()

        // 2) Resolver nombres con el conteo general de servicios.
        const catalogo = await cargarServicios()
        const nombrePorCodigo = new Map(catalogo.map((s) => [s.codigo, s.nombre]))

        const lista: ServicioSeleccionable[] = (codigos || []).map((cod) => ({
          codigo: cod,
          nombre: nombrePorCodigo.get(cod) || '',
        }))
        lista.sort((a, b) => a.codigo.localeCompare(b.codigo))
        if (!cancelado) setServicios(lista)
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    void cargar()
    return () => { cancelado = true }
  }, [isOpen])

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return servicios
    return servicios.filter(
      (s) => s.codigo.toLowerCase().includes(q) || s.nombre.toLowerCase().includes(q),
    )
  }, [servicios, filtro])

  if (!isOpen) return null

  return (
    <div className="gi-selserv-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="gi-selserv" role="dialog" aria-modal="true">
        <div className="gi-selserv__header">
          <span className="gi-selserv__icono"><FaLayerGroup size={18} /></span>
          <div className="gi-selserv__titulos">
            <h5 className="gi-selserv__titulo">Seleccione el servicio</h5>
            <p className="gi-selserv__sub">
              {placa ? `Elija a qué servicio desea incluir el bien ${placa}.` : 'Elija el servicio al que desea incluir el bien.'}
            </p>
          </div>
          <button type="button" className="gi-selserv__cerrar" onClick={onCerrar} title="Cerrar">
            <FaXmark size={16} />
          </button>
        </div>

        <div className="gi-selserv__body">
          {servicios.length > 6 && (
            <input
              type="text"
              className="gi-selserv__filtro"
              placeholder="Filtrar por código o nombre del servicio..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          )}

          {cargando ? (
            <p className="gi-selserv__hint">Cargando servicios habilitados...</p>
          ) : servicios.length === 0 ? (
            <p className="gi-selserv__hint">
              No tiene servicios habilitados. Solicite al gestor de inventarios que le asigne al menos un servicio.
            </p>
          ) : filtrados.length === 0 ? (
            <p className="gi-selserv__hint">Ningún servicio coincide con el filtro.</p>
          ) : (
            <div className="gi-selserv__lista">
              {filtrados.map((s) => (
                <button
                  key={s.codigo}
                  type="button"
                  className="gi-selserv__item"
                  onClick={() => onSeleccionar(s)}
                >
                  <span className="gi-selserv__item-codigo">{s.codigo}</span>
                  {s.nombre && <span className="gi-selserv__item-nombre">{s.nombre}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
