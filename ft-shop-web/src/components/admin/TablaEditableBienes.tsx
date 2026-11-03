import { useState, useId, useEffect } from 'react'
import { FaSave, FaTimes, FaEdit, FaCheck } from 'react-icons/fa'
import type { BienActivoFijo, GrupoOption, EncabezadoDocumento, UbicacionOption } from '../../services/adminBaseDatosService'
import { actualizarPrefijoDocumento, actualizarResponsableDocumento, listarUbicacionesActivos } from '../../services/adminBaseDatosService'
import { ModalConfirmarCambiosMasivos } from './ModalConfirmarCambiosMasivos'
import SelectorCoordinador from '../inventario/SelectorCoordinador'
import type { TerceroFirebird } from '../inventario/SelectorCoordinador'
import SelectorUbicacion from './SelectorUbicacion'
import './TablaEditableBienes.css'

interface BienEditable extends BienActivoFijo {
  editando?: boolean
  cambios?: Partial<BienActivoFijo> & { ubicacionid?: number | null }
}

interface TablaEditableBienesProps {
  bienes: BienActivoFijo[]
  gruposBien: GrupoOption[]
  onGuardarCambios: (cambios: Array<{ matid: number; datos: Partial<BienActivoFijo> }>) => Promise<void>
  onPrefijoActualizado?: () => void
  onResponsableActualizado?: () => void
  encabezado?: EncabezadoDocumento | null
  tipoDocumento: string
  numeroDocumento: string
}

export function TablaEditableBienes({
  bienes,
  gruposBien,
  onGuardarCambios,
  onPrefijoActualizado,
  onResponsableActualizado,
  encabezado,
  tipoDocumento,
  numeroDocumento,
}: TablaEditableBienesProps) {
  const uid = useId()
  const [bienesEditables, setBienesEditables] = useState<BienEditable[]>(
    bienes.map(bien => ({ ...bien, editando: false, cambios: {} }))
  )
  const [guardando, setGuardando] = useState(false)
  const [modoEdicionMasiva, setModoEdicionMasiva] = useState(false)
  const [filtro, setFiltro] = useState('')
  
  // Catálogo de ubicaciones — se carga una sola vez al montar
  const [ubicaciones, setUbicaciones] = useState<UbicacionOption[]>([])
  useEffect(() => {
    listarUbicacionesActivos()
      .then(setUbicaciones)
      .catch(err => console.warn('[TablaEditableBienes] No se pudo cargar catálogo de ubicaciones:', err))
  }, [])
  
  // Estados para modal de confirmación
  const [mostrarModal, setMostrarModal] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const idModalTitulo = `${uid}-confirmar-cambios-masivos`
  
  // Estados para edición de prefijo
  const [editandoPrefijo, setEditandoPrefijo] = useState(false)
  const [nuevoPrefijo, setNuevoPrefijo] = useState(bienes[0]?.codprefijo || '')
  const [guardandoPrefijo, setGuardandoPrefijo] = useState(false)
  
  // Estados para edición de responsable del documento
  const [editandoResponsable, setEditandoResponsable] = useState(false)
  const [guardandoResponsable, setGuardandoResponsable] = useState(false)
  const [terceroSeleccionado, setTerceroSeleccionado] = useState<TerceroFirebird | null>(null)
  
  // Verificar si todos los bienes tienen el mismo TRANSAID (mismo documento)
  const transaidUnico = bienes.length > 0 && bienes[0].transaid
  const prefijoActual = bienes[0]?.codprefijo || ''
  const tieneTransaid = bienes.every(b => b.transaid === transaidUnico)
  
  const prefijosDisponibles = ['FC', 'EA', 'BJ', 'TB', '00', 'TS', 'SA', 'SD', 'SI', 'CB']

  const activarEdicion = (matid: number) => {
    setBienesEditables(prev =>
      prev.map(bien =>
        bien.matid === matid ? { ...bien, editando: true } : bien
      )
    )
  }

  const cancelarEdicion = (matid: number) => {
    setBienesEditables(prev =>
      prev.map(bien =>
        bien.matid === matid ? { ...bien, editando: false, cambios: {} } : bien
      )
    )
  }

  const actualizarCambio = (matid: number, campo: keyof BienActivoFijo | 'ubicacionid', valor: unknown) => {
    setBienesEditables(prev =>
      prev.map(bien =>
        bien.matid === matid
          ? { ...bien, cambios: { ...bien.cambios, [campo]: valor } }
          : bien
      )
    )
  }

  // Aplica una ubicación a TODOS los bienes actualmente visibles (respeta el filtro).
  // Marca el cambio en 'ubicacionid' para que entre en el guardado masivo.
  const aplicarUbicacionATodos = (ubicacionId: number | null) => {
    const idsVisibles = new Set(bienesFiltrados.map(b => b.matid))
    setBienesEditables(prev =>
      prev.map(bien =>
        idsVisibles.has(bien.matid)
          ? { ...bien, cambios: { ...bien.cambios, ubicacionid: ubicacionId } }
          : bien
      )
    )
  }

  const guardarBien = async (matid: number) => {
    const bien = bienesEditables.find(b => b.matid === matid)
    if (!bien || !bien.cambios || Object.keys(bien.cambios).length === 0) {
      cancelarEdicion(matid)
      return
    }

    setGuardando(true)
    try {
      await onGuardarCambios([{ matid, datos: bien.cambios }])
      
      // Actualizar el bien con los cambios guardados
      setBienesEditables(prev =>
        prev.map(b =>
          b.matid === matid
            ? { ...b, ...bien.cambios, editando: false, cambios: {} }
            : b
        )
      )
    } catch (error) {
      console.error('Error guardando bien:', error)
    } finally {
      setGuardando(false)
    }
  }

  const activarEdicionMasiva = () => {
    setModoEdicionMasiva(true)
    setBienesEditables(prev => prev.map(bien => ({ ...bien, editando: true })))
  }

  const cancelarEdicionMasiva = () => {
    setModoEdicionMasiva(false)
    setBienesEditables(prev =>
      prev.map(bien => ({ ...bien, editando: false, cambios: {} }))
    )
  }

  const guardarTodos = async () => {
    const cambiosPendientes = bienesEditables
      .filter(bien => bien.cambios && Object.keys(bien.cambios).length > 0)
      .map(bien => ({ matid: bien.matid, datos: bien.cambios! }))

    if (cambiosPendientes.length === 0) {
      cancelarEdicionMasiva()
      return
    }

    // Abrir modal de confirmación
    setModalError(null)
    setMostrarModal(true)
  }

  const confirmarGuardadoMasivo = async () => {
    const cambiosPendientes = bienesEditables
      .filter(bien => bien.cambios && Object.keys(bien.cambios).length > 0)
      .map(bien => ({ matid: bien.matid, datos: bien.cambios! }))

    setGuardando(true)
    setModalError(null)
    
    try {
      await onGuardarCambios(cambiosPendientes)
      
      // Actualizar todos los bienes con los cambios guardados
      setBienesEditables(prev =>
        prev.map(bien => ({
          ...bien,
          ...bien.cambios,
          editando: false,
          cambios: {},
        }))
      )
      setModoEdicionMasiva(false)
      setMostrarModal(false)
    } catch (error) {
      console.error('Error guardando cambios masivos:', error)
      const errorMsg = error instanceof Error ? error.message : 'Error al guardar cambios masivos'
      setModalError(errorMsg)
    } finally {
      setGuardando(false)
    }
  }

  const cerrarModal = () => {
    if (guardando) return
    setMostrarModal(false)
    setModalError(null)
  }

  const bienesFiltrados = filtro.trim()
    ? bienesEditables.filter(b => {
        const t = filtro.trim().toLowerCase()
        return (
          b.codigo.toLowerCase().includes(t) ||
          (b.desmat || '').toLowerCase().includes(t) ||
          (b.serial || '').toLowerCase().includes(t) ||
          (b.grupoBien || '').toLowerCase().includes(t)
        )
      })
    : bienesEditables

  const tieneCambiosPendientes = bienesEditables.some(
    bien => bien.cambios && Object.keys(bien.cambios).length > 0
  )

  const cambiosParaModal = bienesEditables
    .filter(bien => bien.cambios && Object.keys(bien.cambios).length > 0)
    .map(bien => ({
      matid: bien.matid,
      codigo: bien.codigo,
      cambios: bien.cambios!
    }))
  
  const guardarPrefijo = async () => {
    if (!transaidUnico || !nuevoPrefijo || nuevoPrefijo === prefijoActual) {
      setEditandoPrefijo(false)
      return
    }
    
    setGuardandoPrefijo(true)
    try {
      await actualizarPrefijoDocumento(transaidUnico, nuevoPrefijo)
      
      // Actualizar el prefijo en todos los bienes
      setBienesEditables(prev =>
        prev.map(bien => ({
          ...bien,
          codprefijo: nuevoPrefijo
        }))
      )
      
      setEditandoPrefijo(false)
      
      // Notificar al componente padre para recargar
      if (onPrefijoActualizado) {
        onPrefijoActualizado()
      }
    } catch (error) {
      console.error('Error actualizando prefijo:', error)
      alert(error instanceof Error ? error.message : 'Error al actualizar prefijo')
    } finally {
      setGuardandoPrefijo(false)
    }
  }
  
  const cancelarEdicionPrefijo = () => {
    setNuevoPrefijo(prefijoActual)
    setEditandoPrefijo(false)
  }

  const guardarResponsable = async () => {
    if (!terceroSeleccionado || !encabezado?.transaid) return
    
    setGuardandoResponsable(true)
    try {
      await actualizarResponsableDocumento(encabezado.transaid, terceroSeleccionado.cedula)
      setEditandoResponsable(false)
      setTerceroSeleccionado(null)
      if (onResponsableActualizado) {
        onResponsableActualizado()
      }
    } catch (error) {
      console.error('Error actualizando responsable:', error)
      alert(error instanceof Error ? error.message : 'Error al actualizar responsable')
    } finally {
      setGuardandoResponsable(false)
    }
  }

  const cancelarEdicionResponsable = () => {
    setEditandoResponsable(false)
    setTerceroSeleccionado(null)
  }

  return (
    <>
      {mostrarModal && (
        <ModalConfirmarCambiosMasivos
          tituloId={idModalTitulo}
          baseDatos="Activos Fijos (ACTIVOS FIJOS UNP.GDB)"
          tipoDocumento={tipoDocumento}
          numeroDocumento={numeroDocumento}
          cambios={cambiosParaModal}
          error={modalError}
          enviando={guardando}
          onCerrar={cerrarModal}
          onConfirmar={() => void confirmarGuardadoMasivo()}
        />
      )}
      
      <div className="tabla-editable-container">
        {/* ─── TARJETA INFORMACIÓN DEL DOCUMENTO ─── */}
        {encabezado && (
          <div className="tabla-editable-info-doc">
            <div className="tabla-editable-info-doc__header">
              <h4 className="tabla-editable-info-doc__title">Información del Documento</h4>
              
              {/* Badge con prefijo editable */}
              {editandoPrefijo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <select
                    value={nuevoPrefijo}
                    onChange={(e) => setNuevoPrefijo(e.target.value)}
                    disabled={guardandoPrefijo}
                    style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    {prefijosDisponibles.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>-{String(encabezado.numero).padStart(6, '0')}</span>
                  <button type="button" onClick={guardarPrefijo} disabled={guardandoPrefijo || nuevoPrefijo === prefijoActual}
                    style={{ padding: '0.25rem 0.5rem', borderRadius: '5px', border: 'none', background: '#10b981', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', opacity: guardandoPrefijo || nuevoPrefijo === prefijoActual ? 0.5 : 1 }}>
                    <FaCheck />
                  </button>
                  <button type="button" onClick={cancelarEdicionPrefijo} disabled={guardandoPrefijo}
                    style={{ padding: '0.25rem 0.5rem', borderRadius: '5px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <FaTimes />
                  </button>
                </div>
              ) : (
                <span
                  className={`tabla-editable-info-doc__badge ${tieneTransaid ? 'tabla-editable-info-doc__badge--editable' : ''}`}
                  onClick={tieneTransaid ? () => setEditandoPrefijo(true) : undefined}
                  title={tieneTransaid ? 'Clic para cambiar prefijo' : ''}
                >
                  {prefijoActual}-{String(encabezado.numero).padStart(6, '0')}
                  {tieneTransaid && <FaEdit className="tabla-editable-info-doc__badge-edit-icon" />}
                </span>
              )}
            </div>
            
            <div className="tabla-editable-info-doc__grid">
              {/* Fecha */}
              <div className="tabla-editable-info-doc__field">
                <span className="tabla-editable-info-doc__label">Fecha</span>
                <span className="tabla-editable-info-doc__value">
                  {encabezado.fecha
                    ? new Date(encabezado.fecha + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
                    : '—'}
                </span>
              </div>
              
              {/* Destinación */}
              <div className="tabla-editable-info-doc__field">
                <span className="tabla-editable-info-doc__label">Destinación</span>
                <span className="tabla-editable-info-doc__value">
                  {encabezado.codDestinacion
                    ? `${encabezado.codDestinacion} — ${encabezado.destinacion}`
                    : encabezado.destinacion || <span className="tabla-editable-info-doc__value--empty">Sin destinación</span>}
                </span>
              </div>
              
              {/* Recibido por */}
              <div className="tabla-editable-info-doc__field">
                <span className="tabla-editable-info-doc__label">Recibido por</span>
                {editandoResponsable ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2px', gridColumn: '1 / -1' }}>
                    <div style={{ flex: 1, maxWidth: '300px' }}>
                      <SelectorCoordinador
                        valor={terceroSeleccionado?.cedula || ''}
                        onChange={() => {}}
                        onSeleccionar={(tercero) => setTerceroSeleccionado(tercero)}
                        placeholder="Buscar por cédula o nombre..."
                        permitirManual={false}
                        autoFocus
                      />
                    </div>
                    {terceroSeleccionado && (
                      <span style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 500 }}>
                        {terceroSeleccionado.nombre}
                      </span>
                    )}
                    <button type="button" onClick={guardarResponsable} disabled={guardandoResponsable || !terceroSeleccionado}
                      className="tabla-editable-btn tabla-editable-btn--success" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}>
                      {guardandoResponsable ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button type="button" onClick={cancelarEdicionResponsable} disabled={guardandoResponsable}
                      className="tabla-editable-btn tabla-editable-btn--secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="tabla-editable-info-doc__responsable">
                    {encabezado.cedulaRecibido ? (
                      <>
                        <span className="tabla-editable-info-doc__cedula-badge">{encabezado.cedulaRecibido}</span>
                        <span className="tabla-editable-info-doc__value">{encabezado.recibidoPor}</span>
                      </>
                    ) : (
                      <span className="tabla-editable-info-doc__value tabla-editable-info-doc__value--empty">Sin responsable asignado</span>
                    )}
                    <button type="button" onClick={() => setEditandoResponsable(true)} disabled={modoEdicionMasiva}
                      className="tabla-editable-info-doc__btn-cambiar">
                      <FaEdit /> Cambiar
                    </button>
                  </div>
                )}
              </div>
              
              {/* Detalle */}
              <div className="tabla-editable-info-doc__field">
                <span className="tabla-editable-info-doc__label">Detalle</span>
                <span className="tabla-editable-info-doc__value">
                  {encabezado.detalle || <span className="tabla-editable-info-doc__value--empty">—</span>}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ─── SECCIÓN DE BIENES ─── */}
        <div className="tabla-editable-bienes-section">
          {/* Toolbar */}
          <div className="tabla-editable-bienes-toolbar">
            <div className="tabla-editable-bienes-toolbar__left">
              <h4 className="tabla-editable-bienes-toolbar__title">Bienes</h4>
              <span className="tabla-editable-bienes-toolbar__count">{bienes.length}</span>
            </div>
            
            <input
              type="text"
              className="tabla-editable-bienes-toolbar__filter"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por placa, descripción, serial..."
            />
            
            <div className="tabla-editable-bienes-toolbar__right">
              {!modoEdicionMasiva ? (
                <button type="button" className="tabla-editable-btn tabla-editable-btn--primary" onClick={activarEdicionMasiva} disabled={editandoPrefijo}>
                  <FaEdit /> Editar Todos
                </button>
              ) : (
                <>
                  <button type="button" className="tabla-editable-btn tabla-editable-btn--secondary" onClick={cancelarEdicionMasiva} disabled={guardando}>
                    <FaTimes /> Cancelar
                  </button>
                  <button type="button" className="tabla-editable-btn tabla-editable-btn--success" onClick={guardarTodos} disabled={guardando || !tieneCambiosPendientes}>
                    <FaSave /> {guardando ? 'Guardando...' : `Guardar (${bienesEditables.filter(b => b.cambios && Object.keys(b.cambios).length > 0).length})`}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Barra maestra: aplicar una ubicación a todos los bienes visibles */}
          {modoEdicionMasiva && (
            <div className="tabla-editable-ubic-masiva">
              <div className="tabla-editable-ubic-masiva__head">
                <span className="tabla-editable-ubic-masiva__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <div className="tabla-editable-ubic-masiva__texts">
                  <span className="tabla-editable-ubic-masiva__title">Asignación rápida de ubicación</span>
                  <span className="tabla-editable-ubic-masiva__subtitle">
                    Se aplicará a <strong>{bienesFiltrados.length}</strong> {bienesFiltrados.length === 1 ? 'bien' : 'bienes'}
                    {filtro.trim() ? ' del filtro actual' : ' del documento'}
                  </span>
                </div>
              </div>
              <div className="tabla-editable-ubic-masiva__selector">
                <SelectorUbicacion
                  ubicaciones={ubicaciones}
                  valor={null}
                  onSeleccionar={(id) => aplicarUbicacionATodos(id)}
                  placeholder="Buscar y aplicar a todos..."
                />
              </div>
            </div>
          )}

          {/* Tabla */}
          <div className="tabla-editable-thead-wrapper">
            <table className="tabla-editable">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Descripción</th>
                  <th>Grupo del Bien</th>
                  <th>Serial</th>
                  <th>Valor</th>
                  <th>Ubicación</th>
                  {!modoEdicionMasiva && <th>Acciones</th>}
                </tr>
              </thead>
            </table>
          </div>

          <div className="tabla-editable-scroll">
            <table className="tabla-editable">
              <tbody>
                {bienesFiltrados.map((bien) => (
                  <tr key={bien.matid} className={bien.editando ? 'tabla-editable-row--editando' : ''}>
                    <td><strong>{bien.codigo}</strong></td>
                    <td>
                      {bien.editando ? (
                        <input type="text" className="tabla-editable-input" defaultValue={bien.desmat}
                          onChange={(e) => actualizarCambio(bien.matid, 'desmat', e.target.value)} placeholder="Descripción del bien" />
                      ) : (
                        <span>{bien.cambios?.desmat || bien.desmat}</span>
                      )}
                    </td>
                    <td>
                      {bien.editando ? (
                        <select className="tabla-editable-select" defaultValue={bien.grupmatid}
                          onChange={(e) => actualizarCambio(bien.matid, 'grupmatid', parseInt(e.target.value))}>
                          {gruposBien.map((grupo) => (
                            <option key={grupo.id} value={grupo.id}>{grupo.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{bien.cambios?.grupmatid ? gruposBien.find(g => g.id === bien.cambios?.grupmatid)?.label : bien.grupoArticulo || bien.grupoBien}</span>
                      )}
                    </td>
                    <td>
                      {bien.editando ? (
                        <input type="text" className="tabla-editable-input tabla-editable-input--small" defaultValue={bien.serial || ''}
                          onChange={(e) => actualizarCambio(bien.matid, 'serial', e.target.value)} placeholder="Serial" />
                      ) : (
                        <span>{bien.serial || '-'}</span>
                      )}
                    </td>
                    <td>
                      {bien.editando ? (
                        <input type="number" className="tabla-editable-input tabla-editable-input--small"
                          value={bien.cambios?.valorcomp ?? bien.valorcomp}
                          onChange={(e) => actualizarCambio(bien.matid, 'valorcomp', parseFloat(e.target.value) || 0)}
                          placeholder="Valor" min={0} step={1} style={{ textAlign: 'right' }} />
                      ) : (
                        <span className="tabla-editable-valor">${(bien.cambios?.valorcomp ?? bien.valorcomp).toLocaleString('es-CO')}</span>
                      )}
                    </td>
                    {/* ── UBICACIÓN ── */}
                    <td className={`tabla-editable-td-ubic ${bien.cambios?.ubicacionid !== undefined ? 'tabla-editable-td-ubic--cambiado' : ''}`}>
                      {bien.editando ? (
                        <SelectorUbicacion
                          ubicaciones={ubicaciones}
                          valor={(bien.cambios?.ubicacionid !== undefined ? bien.cambios.ubicacionid : bien.ubicacionId) ?? null}
                          onSeleccionar={(id) => actualizarCambio(bien.matid, 'ubicacionid', id)}
                          compacto
                        />
                      ) : (
                        <span className="tabla-editable-ubicacion">
                          {(() => {
                            const idActual = (bien.cambios?.ubicacionid !== undefined
                              ? bien.cambios.ubicacionid
                              : bien.ubicacionId) ?? null
                            if (idActual === null) return <span className="tabla-editable-vacio">Sin asignar</span>
                            const ub = ubicaciones.find(u => u.ubicacionId === idActual)
                            const label = ub?.label ?? bien.ubicacion ?? String(idActual)
                            return <span className="tabla-editable-ubicacion-badge">{label}</span>
                          })()}
                        </span>
                      )}
                    </td>
                    {!modoEdicionMasiva && (
                      <td>
                        {bien.editando ? (
                          <div className="tabla-editable-acciones-fila">
                            <button type="button" className="tabla-editable-btn-icono tabla-editable-btn-icono--success"
                              onClick={() => guardarBien(bien.matid)} disabled={guardando} title="Guardar">
                              <FaCheck />
                            </button>
                            <button type="button" className="tabla-editable-btn-icono tabla-editable-btn-icono--danger"
                              onClick={() => cancelarEdicion(bien.matid)} disabled={guardando} title="Cancelar">
                              <FaTimes />
                            </button>
                          </div>
                        ) : (
                          <button type="button" className="tabla-editable-btn-icono tabla-editable-btn-icono--primary"
                            onClick={() => activarEdicion(bien.matid)} title="Editar">
                            <FaEdit />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
