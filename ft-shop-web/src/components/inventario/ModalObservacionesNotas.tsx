import { useState, useRef } from 'react'
import type { RegistroObservacion } from '../../services/observacionesInventarioService'
import {
  resolverObservacion,
  obtenerObservacionesPendientes,
  obtenerNotas,
  crearNota,
  crearObservacionEnGestion,
  registroVisible,
} from '../../services/observacionesInventarioService'
import SelectorTipoObservacion, { type SeleccionObservacion } from './observaciones/SelectorTipoObservacion'
import { crearObservacionBackend, CATALOGO_OBSERVACIONES } from '../../services/observacionesApiService'
import { getAuthUserFullName, getAuthUserCedula, getAuthUserCedulaReal } from '../../utils/authState'
import './observaciones/SelectorTipoObservacion.css'

interface ModalObservacionesNotasProps {
  isOpen: boolean
  onClose: () => void
  placa: string
  descripcionBien: string
  servicio?: string
  ubicacion?: string
  /** Cédula del usuario activo: filtra los registros por servicio + usuario. */
  cedulaUsuario?: string
  /** Responsable del bien (para la observación estandarizada que escala). */
  responsableNombre?: string
  responsableCedula?: string
  registros: RegistroObservacion[]
  onRegistrosChange: (registros: RegistroObservacion[]) => void
  onSuccess: (msg: string) => void
  onWarning: (msg: string) => void
  tabInicial?: 'observaciones' | 'notas'
  notaObligatoria?: boolean
  /** Timestamp desde el cual buscar notas válidas para estado M */
  notaDesde?: string
}

type TabModal = 'observaciones' | 'notas'

export default function ModalObservacionesNotas({
  isOpen,
  onClose,
  placa,
  descripcionBien,
  servicio,
  ubicacion,
  cedulaUsuario,
  responsableNombre,
  responsableCedula,
  registros,
  onRegistrosChange,
  onSuccess,
  onWarning,
  tabInicial = 'observaciones',
  notaObligatoria = false,
  notaDesde,
}: ModalObservacionesNotasProps) {
  const [tab, setTab] = useState<TabModal>(tabInicial)
  // Separate text state per tab so switching doesn't erase what was typed
  const textoNotaRef = useRef('')
  const [textoNota, setTextoNota] = useState('')
  // Selección estandarizada de la observación (tipo + subtipo + texto).
  const [seleccion, setSeleccion] = useState<SeleccionObservacion>({ tipo: '', subtipo: '', texto: '' })
  const [enviando, setEnviando] = useState(false)

  if (!isOpen) return null

  // Filtro por servicio activo: los registros se guardan en una lista global por
  // sesión, así que SIN este filtro una nota creada en el servicio A aparecería
  // también al revisar el servicio B (mismo bien o misma sesión). Reglas:
  // - Observaciones y notas MANUALES: solo las del servicio activo. Si el
  //   registro no tiene servicio asignado (nota suelta sin contexto) se muestra
  //   igual para no esconder nada.
  // - Alertas del sistema (automaticas, p.ej. placa duplicada en vivo): se
  //   muestran SIEMPRE porque son cross-servicio por naturaleza.
  // Se delega en el helper unificado registroVisible (servicio + cédula) para
  // no divergir del bloqueo de guardado, la campana y el indicador de la tabla.
  const perteneceAlServicio = (r: RegistroObservacion): boolean =>
    registroVisible(r, { servicio, cedula: cedulaUsuario })

  const observaciones = obtenerObservacionesPendientes(registros)
    .filter(r => r.placa === placa && perteneceAlServicio(r))
  const todasLasNotas = obtenerNotas(registros)
    .filter(r => r.placa === placa && perteneceAlServicio(r))
  // Separación visual: alertas del sistema vs notas manuales/Excel.
  const alertasSistema = todasLasNotas.filter(n => n.automatica)
  const notasManuales = todasLasNotas.filter(n => !n.automatica)
  // Para el conteo del tab y el estado "obligatorio" solo cuentan las manuales.
  const notas = notasManuales
  const tieneNotaRegistrada = notasManuales.some(n =>
    n.texto.trim() !== '' &&
    !n.fechaResolucion &&  // No es una observación resuelta
    (!notaDesde || n.fechaCreacion >= notaDesde)  // Fue creada después de marcar estado M
  )

  const handleAgregarObservacion = async () => {
    if (!seleccion.tipo) {
      onWarning('Seleccione el tipo de observación.')
      return
    }
    const opcion = CATALOGO_OBSERVACIONES.find(o => o.tipo === seleccion.tipo)
    // Validaciones por tipo.
    if (opcion && opcion.subtipos.length > 0 && !seleccion.subtipo) {
      onWarning('Seleccione el detalle de la observación.')
      return
    }
    if (seleccion.tipo === 'otra' && seleccion.texto.trim().length < 10) {
      onWarning('Describa la novedad (mínimo 10 caracteres).')
      return
    }

    // Texto legible para el registro local (lo que ve el inventariador).
    const partes = [opcion?.label, seleccion.subtipo, seleccion.texto.trim()].filter(Boolean)
    const textoLegible = partes.join(' · ')
    const escala = !!opcion?.escala

    setEnviando(true)
    try {
      if (escala) {
        // Las que escalan se persisten en el backend (bandeja del gestor) y
        // quedan como observación local 'en_gestion': bloquean el guardado y
        // NO son resolubles por el inventariador. Solo el gestor las resuelve
        // desde Gestión UNP.
        const resp = await crearObservacionBackend({
          placa,
          descripcion_bien: descripcionBien,
          responsable_nombre: responsableNombre || '',
          responsable_cedula: responsableCedula || '',
          servicio: servicio || '',
          ubicacion: ubicacion || '',
          tipo: seleccion.tipo,
          subtipo: seleccion.subtipo,
          texto: seleccion.texto.trim(),
          reportado_por_nombre: getAuthUserFullName(),
          reportado_por_cedula: getAuthUserCedula(),
        })
        if (!resp.ok || !resp.observacion) {
          onWarning(resp.error || 'No se pudo registrar la observación en el servidor.')
          setEnviando(false)
          return
        }
        const cedulaCreador = getAuthUserCedulaReal() || getAuthUserCedula()
        onRegistrosChange([
          ...registros,
          crearObservacionEnGestion(
            placa,
            descripcionBien,
            textoLegible,
            resp.observacion.id,
            seleccion.tipo,
            servicio,
            ubicacion,
            cedulaCreador,
          ),
        ])
        onSuccess('Observación enviada al gestor. El guardado queda bloqueado hasta que la autorice.')
      } else {
        // Las que no escalan (validación/otra) quedan como nota informativa.
        const cedulaCreador = getAuthUserCedulaReal() || getAuthUserCedula()
        onRegistrosChange([...registros, crearNota(placa, descripcionBien, textoLegible, servicio, ubicacion, undefined, false, cedulaCreador)])
        onSuccess('Observación registrada')
      }
      setSeleccion({ tipo: '', subtipo: '', texto: '' })
    } finally {
      setEnviando(false)
    }
  }

  const handleAgregarNota = () => {
    if (textoNota.trim().length < 10) {
      onWarning('La nota debe tener al menos 10 caracteres.')
      return
    }
    const cedulaCreador = getAuthUserCedulaReal() || getAuthUserCedula()
    const nueva = crearNota(placa, descripcionBien, textoNota.trim(), servicio, ubicacion, undefined, false, cedulaCreador)
    onRegistrosChange([...registros, nueva])
    setTextoNota('')
    textoNotaRef.current = ''
    onSuccess(notaObligatoria ? 'Motivo de la baja registrado' : 'Nota agregada')
  }

  const handleResolver = (id: string) => {
    const registro = registros.find(r => r.id === id)
    // Las observaciones escaladas (en_gestion) solo las resuelve el gestor desde
    // Gestión UNP; el inventariador no puede resolverlas aquí.
    if (registro?.estado === 'en_gestion') {
      onWarning('Esta observación está en gestión del coordinador. Solo el gestor puede resolverla desde Gestión UNP.')
      return
    }
    const actualizados = registros.map(r => r.id === id ? resolverObservacion(r) : r)
    onRegistrosChange(actualizados)
    onSuccess('Observacion resuelta (convertida en nota)')
  }

  const handleEliminarNota = (id: string) => {
    onRegistrosChange(registros.filter(r => r.id !== id))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99990,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: '100%', maxWidth: '640px', maxHeight: '92vh', minHeight: '560px',
        background: '#fff', borderRadius: '16px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.18), 0 8px 16px rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h5 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>{notaObligatoria ? 'Bien para baja' : 'Alertas'}</h5>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              <span style={{ fontWeight: 600, color: '#334155' }}>{placa}</span> — {descripcionBien || 'Sin descripcion'}
            </p>
            {servicio && <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>{servicio}</p>}
          </div>
          <button
            onClick={onClose}
            style={{ width: '30px', height: '30px', borderRadius: '8px', border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', color: '#64748b', transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#1e293b' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b' }}
          >
            ✕
          </button>
        </div>

        {/* Banner nota obligatoria */}
        {notaObligatoria && !tieneNotaRegistrada && (
          <div style={{ padding: '0.6rem 1.5rem', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ fontSize: '0.78rem', color: '#991b1b', fontWeight: 600 }}>
              Registre una nota con el motivo del estado Malo para poder cerrar.
            </span>
          </div>
        )}

        {/* Tabs — centered */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.85rem 1.5rem 0' }}>
          <div style={{ display: 'flex', gap: '0.3rem', padding: '0.25rem', background: '#f1f5f9', borderRadius: '10px' }}>
            <button
              onClick={() => setTab('observaciones')}
              style={{
                padding: '0.5rem 1.1rem', border: 'none', borderRadius: '8px',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                background: tab === 'observaciones' ? '#d97706' : 'transparent',
                color: tab === 'observaciones' ? '#fff' : '#64748b',
                boxShadow: tab === 'observaciones' ? '0 2px 8px rgba(217, 119, 6, 0.3)' : 'none',
              }}
            >
              Observaciones{observaciones.length > 0 ? ` (${observaciones.length})` : ''}
            </button>
            <button
              onClick={() => setTab('notas')}
              style={{
                padding: '0.5rem 1.1rem', border: 'none', borderRadius: '8px',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                background: tab === 'notas' ? (notaObligatoria ? '#dc2626' : '#4f46e5') : 'transparent',
                color: tab === 'notas' ? '#fff' : '#64748b',
                boxShadow: tab === 'notas' ? (notaObligatoria ? '0 2px 8px rgba(220, 38, 38, 0.3)' : '0 2px 8px rgba(79, 70, 229, 0.3)') : 'none',
              }}
            >
              {notaObligatoria ? 'Motivo de la baja' : 'Notas'}{notas.length > 0 ? ` (${notas.length})` : ''}
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1rem 1.5rem', overflow: 'auto', flex: 1 }}>

          {/* TAB OBSERVACIONES */}
          {tab === 'observaciones' && (
            <>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: '#92400e', fontWeight: 500, background: '#fffbeb', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fde68a' }}>
                Las observaciones pendientes bloquean el guardado. Resuélvalas antes de guardar el inventario.
              </p>

              {/* Lista de observaciones que bloquean el guardado */}
              {observaciones.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  {observaciones.map(obs => {
                    const enGestion = obs.estado === 'en_gestion'
                    return (
                      <div
                        key={obs.id}
                        style={{
                          padding: '0.65rem 0.85rem', borderRadius: '8px', marginBottom: '0.5rem',
                          background: enGestion ? '#eff6ff' : '#fffbeb',
                          border: `1px solid ${enGestion ? '#bfdbfe' : '#fde68a'}`,
                        }}
                      >
                        {enGestion && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.4rem',
                            fontSize: '0.68rem', fontWeight: 700, color: '#1d4ed8',
                            background: '#dbeafe', borderRadius: '999px', padding: '0.15rem 0.6rem',
                          }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            En gestión del coordinador
                          </span>
                        )}
                        <p style={{ margin: '0 0 0.4rem', fontSize: '0.83rem', color: '#1e293b', lineHeight: 1.4 }}>{obs.texto}</p>
                        {enGestion && (
                          <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', color: '#1e40af', lineHeight: 1.4 }}>
                            El gestor debe validar y autorizar esta novedad desde Gestión UNP. No puede resolverse aquí ni guardar el inventario hasta que se resuelva.
                          </p>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            {new Date(obs.fechaCreacion).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {!enGestion && (
                            <button
                              onClick={() => handleResolver(obs.id)}
                              style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem', fontWeight: 600, border: 'none', borderRadius: '6px', background: '#059669', color: '#fff', cursor: 'pointer', transition: 'all 0.15s' }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#047857' }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#059669' }}
                            >
                              Resolver
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Agregar nueva observación — selector estandarizado */}
              <SelectorTipoObservacion valor={seleccion} onChange={setSeleccion} />
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.6rem' }}>
                <button
                  onClick={() => void handleAgregarObservacion()}
                  disabled={!seleccion.tipo || enviando}
                  style={{
                    padding: '0.5rem 1.5rem', fontSize: '0.82rem', fontWeight: 600,
                    border: 'none', borderRadius: '8px', cursor: seleccion.tipo && !enviando ? 'pointer' : 'not-allowed',
                    background: seleccion.tipo && !enviando ? '#d97706' : '#e2e8f0',
                    color: seleccion.tipo && !enviando ? '#fff' : '#94a3b8',
                    transition: 'all 0.15s',
                  }}
                >
                  {enviando ? 'Registrando…' : 'Agregar Observación'}
                </button>
              </div>
            </>
          )}

          {/* TAB NOTAS */}
          {tab === 'notas' && (
            <>
              <p style={{
                margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: 500, padding: '0.5rem 0.75rem', borderRadius: '6px',
                ...(notaObligatoria
                  ? { color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca' }
                  : { color: '#4338ca', background: '#eef2ff', border: '1px solid #c7d2fe' }),
              }}>
                {notaObligatoria
                  ? 'Este bien está marcado en estado Malo (M). Describa el MOTIVO DE LA BAJA; es obligatorio y quedará en el reporte.'
                  : 'Las notas son informativas y se guardan con el reporte. No bloquean el guardado.'}
              </p>

              {/* GRUPO 1: Alertas del sistema (automáticas, cross-servicio, no editables) */}
              {alertasSistema.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0 0 0.5rem' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Alertas del sistema ({alertasSistema.length})
                    </span>
                  </div>
                  {alertasSistema.map(nota => (
                    <div key={nota.id} style={{ padding: '0.65rem 0.85rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '0.5rem' }}>
                      <p style={{ margin: '0 0 0.3rem', fontSize: '0.83rem', color: '#1e293b', lineHeight: 1.4 }}>{nota.texto}</p>
                      {nota.contexto && (
                        <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', color: '#b45309', fontStyle: 'italic' }}>{nota.contexto}</p>
                      )}
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        {new Date(nota.fechaCreacion).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {nota.servicio ? ` · ${nota.servicio}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* GRUPO 2: Notas manuales / Excel (del servicio activo, editables) */}
              {notasManuales.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  {alertasSistema.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0 0 0.5rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Notas ({notasManuales.length})
                      </span>
                    </div>
                  )}
                  {notasManuales.map(nota => (
                    <div key={nota.id} style={{ padding: '0.65rem 0.85rem', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '8px', marginBottom: '0.5rem' }}>
                      <p style={{ margin: '0 0 0.3rem', fontSize: '0.83rem', color: '#1e293b', lineHeight: 1.4 }}>{nota.texto}</p>
                      {nota.contexto && (
                        <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', color: '#4f46e5', fontStyle: 'italic' }}>{nota.contexto}</p>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                          {new Date(nota.fechaCreacion).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {nota.fechaResolucion && ' (resuelta)'}
                        </span>
                        {!nota.fechaResolucion && (
                          <button
                            onClick={() => handleEliminarNota(nota.id)}
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem', border: '1px solid #e2e8f0', borderRadius: '5px', background: '#fff', color: '#64748b', cursor: 'pointer', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b' }}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {notasManuales.length === 0 && alertasSistema.length === 0 && !notaObligatoria && (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '0.75rem', fontSize: '0.82rem' }}>No hay notas para este bien.</p>
              )}

              {/* Agregar nueva nota */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                  {notaObligatoria ? 'Motivo de la baja (obligatorio)' : 'Nueva nota'}
                </label>
                <textarea
                  rows={3}
                  value={textoNota}
                  onChange={(e) => { setTextoNota(e.target.value.slice(0, 200)); textoNotaRef.current = e.target.value.slice(0, 200) }}
                  placeholder={notaObligatoria ? 'Ej: El bien presenta daño estructural en la base...' : 'Ej: Bien verificado fisicamente, corresponde a silla ergonomica...'}
                  maxLength={200}
                  style={{
                    width: '100%', padding: '0.6rem 0.75rem',
                    border: `1.5px solid ${notaObligatoria && !tieneNotaRegistrada ? '#c7d2fe' : '#e2e8f0'}`,
                    borderRadius: '8px', fontSize: '0.83rem', resize: 'vertical',
                    outline: 'none', transition: 'border-color 0.15s', background: '#fafbfd',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.background = '#fff' }}
                  onBlur={e => { e.currentTarget.style.borderColor = notaObligatoria && !tieneNotaRegistrada ? '#c7d2fe' : '#e2e8f0'; e.currentTarget.style.background = '#fafbfd' }}
                  autoFocus={tab === 'notas'}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                  <span style={{ fontSize: '0.68rem', color: textoNota.trim().length > 0 && textoNota.trim().length < 10 ? '#4f46e5' : '#94a3b8' }}>
                    {textoNota.trim().length > 0 ? `${textoNota.trim().length}/200 (min. 10)` : 'Min. 10 caracteres'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.6rem' }}>
                  <button
                    onClick={handleAgregarNota}
                    disabled={textoNota.trim().length < 10}
                    style={{
                      padding: '0.5rem 1.5rem', fontSize: '0.82rem', fontWeight: 600,
                      border: 'none', borderRadius: '8px', cursor: textoNota.trim().length >= 10 ? 'pointer' : 'not-allowed',
                      background: textoNota.trim().length >= 10 ? '#4f46e5' : '#e2e8f0',
                      color: textoNota.trim().length >= 10 ? '#fff' : '#94a3b8',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (textoNota.trim().length >= 10) e.currentTarget.style.background = '#4338ca' }}
                    onMouseLeave={e => { if (textoNota.trim().length >= 10) e.currentTarget.style.background = '#4f46e5' }}
                  >
                    {notaObligatoria ? 'Registrar motivo' : 'Agregar Nota'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', background: '#f8fafc' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 2rem', fontSize: '0.82rem', fontWeight: 600, borderRadius: '8px', transition: 'all 0.15s',
              ...(notaObligatoria && !tieneNotaRegistrada
                ? { background: '#f1f5f9', border: '1.5px solid #e2e8f0', color: '#94a3b8', cursor: 'not-allowed' }
                : { background: '#1e293b', border: '1.5px solid #1e293b', color: '#fff', cursor: 'pointer' }
              ),
            }}
            onMouseEnter={e => { if (!notaObligatoria || tieneNotaRegistrada) e.currentTarget.style.background = '#334155' }}
            onMouseLeave={e => { if (!notaObligatoria || tieneNotaRegistrada) e.currentTarget.style.background = '#1e293b' }}
          >
            {notaObligatoria && !tieneNotaRegistrada ? 'Registre una nota para cerrar' : 'Cerrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
