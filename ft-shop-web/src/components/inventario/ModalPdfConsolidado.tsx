import { useState, useEffect } from 'react'
import type { ColaboradorPdf } from '../../services/pdfInventarioConsolidadoService'
import {
  consolidarBienesDeInventarios,
  generarPdfConsolidado,
} from '../../services/pdfInventarioConsolidadoService'
import SelectorCoordinador from './SelectorCoordinador'
import type { TerceroFirebird } from './SelectorCoordinador'

interface InventarioItem {
  id: string
  nombre: string
  fecha: string
  responsable: string
  cedula?: string
  total_bienes: number
  observaciones: string
}

interface ModalPdfConsolidadoProps {
  isOpen: boolean
  onClose: () => void
  inventarios: InventarioItem[]
  onSuccess: (mensaje: string) => void
  onError: (mensaje: string) => void
}

export default function ModalPdfConsolidado({
  isOpen,
  onClose,
  inventarios,
  onSuccess,
  onError,
}: ModalPdfConsolidadoProps) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [sede, setSede] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  // Fecha que se imprime en el formato PDF (YYYY-MM-DD). Se prellena con la
  // fecha real del inventario seleccionado y el usuario la puede editar.
  const [fechaFormato, setFechaFormato] = useState('')
  const [colaborador1, setColaborador1] = useState<ColaboradorPdf>({ nombre: '', cedula: '', cargo: '' })
  const [colaborador2, setColaborador2] = useState<ColaboradorPdf>({ nombre: '', cedula: '', cargo: '' })
  const [generando, setGenerando] = useState(false)
  const [paso, setPaso] = useState<'seleccion' | 'datos' | 'preview'>('seleccion')
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfNombreArchivo, setPdfNombreArchivo] = useState('')

  // Escape para cerrar
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generando) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, generando, onClose])

  if (!isOpen) return null

  const toggleSeleccion = (id: string) => {
    setSeleccionados(prev => {
      const copia = new Set(prev)
      if (copia.has(id)) copia.delete(id)
      else copia.add(id)
      return copia
    })
  }

  const seleccionarTodos = () => {
    if (seleccionados.size === inventarios.length) setSeleccionados(new Set())
    else setSeleccionados(new Set(inventarios.map(inv => inv.id)))
  }

  const totalBienesSeleccionados = inventarios
    .filter(inv => seleccionados.has(inv.id))
    .reduce((sum, inv) => sum + inv.total_bienes, 0)

  // Normaliza la fecha del inventario a formato YYYY-MM-DD (para <input type="date">).
  // Acepta "YYYY-MM-DD HH:MM:SS", "YYYY-MM-DDT...", "DD/MM/YYYY", etc.
  const normalizarFecha = (valor: string): string => {
    if (!valor) return ''
    const solo = valor.trim().split(/[ T]/)[0]
    // Ya viene como YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(solo)) return solo
    // DD/MM/YYYY -> YYYY-MM-DD
    const m = solo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) {
      const [, d, mes, a] = m
      return `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return ''
  }

  const handleSeleccionarColaborador = (n: 1 | 2) => (t: TerceroFirebird) => {
    if (n === 1) setColaborador1({ ...colaborador1, nombre: t.nombre, cedula: t.cedula })
    else setColaborador2({ ...colaborador2, nombre: t.nombre, cedula: t.cedula })
  }

  const handleGenerar = async () => {
    if (!sede.trim() || !ubicacion.trim()) { onError('Sede y Ubicación son obligatorias'); return }
    if (!fechaFormato) { onError('La fecha del formato es obligatoria'); return }
    if (!colaborador1.nombre.trim() || !colaborador1.cedula.trim() || !colaborador1.cargo.trim()) { onError('Responsable 1 (nombre, cédula y cargo) es obligatorio'); return }
    setGenerando(true)
    try {
      const bienes = await consolidarBienesDeInventarios(Array.from(seleccionados))
      const resultado = await generarPdfConsolidado(colaborador1, colaborador2, bienes, sede, ubicacion, fechaFormato)
      // Crear URL para previsualización
      const url = URL.createObjectURL(resultado.blob)
      setPdfPreviewUrl(url)
      setPdfNombreArchivo(resultado.nombreArchivo)
      setPaso('preview')
      onSuccess(`PDF generado: ${bienes.length} bienes de ${seleccionados.size} inventario(s). Previsualice y descargue.`)
    } catch (err: any) {
      onError(err.message || 'Error generando PDF consolidado')
    } finally {
      setGenerando(false)
    }
  }

  const handleDescargar = () => {
    if (!pdfPreviewUrl) return
    const link = document.createElement('a')
    link.href = pdfPreviewUrl
    link.download = pdfNombreArchivo
    link.click()
    onSuccess(`PDF descargado: ${pdfNombreArchivo}`)
  }

  const handleCerrar = () => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(null)
    setPdfNombreArchivo('')
    setFechaFormato('')
    setPaso('seleccion')
    onClose()
  }

  const esPreview = paso === 'preview'

  return (
    <div className="inventario-fisico__modal-overlay">
      <div
        className="inventario-fisico__modal"
        style={{
          // En vista previa el modal se agranda para que el PDF sea legible.
          maxWidth: esPreview ? '1100px' : '680px',
          width: esPreview ? '95vw' : undefined,
          height: esPreview ? '94vh' : undefined,
          maxHeight: esPreview ? '94vh' : '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e9ecef', textAlign: 'center', position: 'relative' }}>
          <h5 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#303d50' }}>
            Generar Formato PDF
          </h5>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#6c757d' }}>
            {paso === 'seleccion' ? 'Seleccione los inventarios a consolidar' : paso === 'datos' ? `${seleccionados.size} inventario(s) · ${totalBienesSeleccionados} bienes` : 'Previsualice el formato antes de descargar'}
          </p>
          {/* Steps indicator */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.6rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#303d50', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>1</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: paso === 'seleccion' ? '#303d50' : '#6c757d' }}>Seleccionar</span>
            </div>
            <span style={{ width: '24px', height: '2px', background: paso !== 'seleccion' ? '#303d50' : '#dee2e6', borderRadius: '1px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: paso !== 'seleccion' ? '#303d50' : '#dee2e6', color: paso !== 'seleccion' ? 'white' : '#6c757d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>2</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: paso === 'datos' ? '#303d50' : '#6c757d' }}>Datos</span>
            </div>
            <span style={{ width: '24px', height: '2px', background: paso === 'preview' ? '#303d50' : '#dee2e6', borderRadius: '1px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: paso === 'preview' ? '#2e7d32' : '#dee2e6', color: paso === 'preview' ? 'white' : '#6c757d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>3</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: paso === 'preview' ? '#2e7d32' : '#6c757d' }}>Vista previa</span>
            </div>
          </div>
          <button className="inventario-fisico__modal-close" onClick={handleCerrar} disabled={generando} style={{ position: 'absolute', right: '1rem', top: '0.75rem' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: esPreview ? 'hidden' : 'auto', padding: esPreview ? '0.9rem 1rem 0' : '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* PASO 1: Seleccionar inventarios */}
          {paso === 'seleccion' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <button onClick={seleccionarTodos} style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', border: '2px solid #303d50', borderRadius: '6px', background: seleccionados.size === inventarios.length ? '#303d50' : 'transparent', color: seleccionados.size === inventarios.length ? 'white' : '#303d50', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}>
                  {seleccionados.size === inventarios.length ? '✓ Todos' : 'Seleccionar todos'}
                </button>
                {seleccionados.size > 0 && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#2e7d32' }}>
                    {seleccionados.size} seleccionado(s)
                  </span>
                )}
              </div>

              <div style={{ borderRadius: '8px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
                {inventarios.length === 0 ? (
                  <p style={{ padding: '2rem', textAlign: 'center', color: '#6c757d', fontSize: '0.85rem' }}>No hay inventarios disponibles.</p>
                ) : (
                  <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {inventarios.map(inv => {
                      const activo = seleccionados.has(inv.id)
                      return (
                        <label
                          key={inv.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                            borderBottom: '1px solid #f0f0f0', cursor: 'pointer', transition: 'all 0.15s',
                            background: activo ? '#f0f7ff' : 'white',
                            borderLeft: activo ? '3px solid #303d50' : '3px solid transparent',
                          }}
                        >
                          <input type="checkbox" checked={activo} onChange={() => toggleSeleccion(inv.id)} style={{ width: '16px', height: '16px', accentColor: '#303d50', cursor: 'pointer', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#303d50', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.nombre}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '0.15rem' }}>
                              {inv.fecha} · {inv.responsable} · <strong>{inv.total_bienes} bienes</strong>
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* PASO 2: Datos del PDF */}
          {paso === 'datos' && (
            <>
              {/* Datos del formato: Sede · Ubicación · Fecha */}
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px', gap: '0.75rem', alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.2rem' }}>Sede *</label>
                    <input type="text" value={sede} onChange={(e) => setSede(e.target.value.toUpperCase())} placeholder="PUENTE ARANDA" disabled={generando} style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.2rem' }}>Ubicación *</label>
                    <input type="text" value={ubicacion} onChange={(e) => setUbicacion(e.target.value.toUpperCase())} placeholder="OFICINA ALMACEN" disabled={generando} style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.2rem' }}>Fecha *</label>
                    <input type="date" value={fechaFormato} onChange={(e) => setFechaFormato(e.target.value)} disabled={generando} style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.68rem', color: '#adb5bd' }}>
                  La fecha corresponde al día en que se realizó el inventario. Puede editarla si es necesario.
                </p>
              </div>

              {/* Colaborador 1 */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#303d50', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>1</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#303d50' }}>Responsable</span>
                </div>
                {!colaborador1.nombre ? (
                  <SelectorCoordinador valor="" onChange={() => {}} onSeleccionar={handleSeleccionarColaborador(1)} placeholder="Buscar por cédula o nombre..." permitirManual={true} />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.15rem' }}>Nombre *</label>
                      <input type="text" value={colaborador1.nombre} onChange={(e) => setColaborador1({ ...colaborador1, nombre: e.target.value.toUpperCase() })} disabled={generando} style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 500 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.15rem' }}>Cédula *</label>
                      <input type="text" value={colaborador1.cedula} onChange={(e) => setColaborador1({ ...colaborador1, cedula: e.target.value.replace(/\D/g, '') })} disabled={generando} style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '0.82rem' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.15rem' }}>Cargo *</label>
                        <input type="text" value={colaborador1.cargo} onChange={(e) => setColaborador1({ ...colaborador1, cargo: e.target.value.toUpperCase() })} placeholder="FUNCIONARIO" disabled={generando} style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '0.82rem' }} />
                      </div>
                      <button type="button" onClick={() => setColaborador1({ nombre: '', cedula: '', cargo: '' })} style={{ padding: '0.35rem 0.5rem', fontSize: '0.68rem', background: '#fee2e2', border: 'none', color: '#dc2626', borderRadius: '6px', cursor: 'pointer', lineHeight: 1, fontWeight: 600, whiteSpace: 'nowrap', marginBottom: '1px' }} title="Limpiar responsable">Limpiar</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Colaborador 2 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#adb5bd', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>2</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6c757d' }}>Responsable (opcional)</span>
                </div>
                {!colaborador2.nombre ? (
                  <SelectorCoordinador valor="" onChange={() => {}} onSeleccionar={handleSeleccionarColaborador(2)} placeholder="Buscar por cédula o nombre..." permitirManual={true} />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.15rem' }}>Nombre</label>
                      <input type="text" value={colaborador2.nombre} onChange={(e) => setColaborador2({ ...colaborador2, nombre: e.target.value.toUpperCase() })} disabled={generando} style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 500 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.15rem' }}>Cédula</label>
                      <input type="text" value={colaborador2.cedula} onChange={(e) => setColaborador2({ ...colaborador2, cedula: e.target.value.replace(/\D/g, '') })} disabled={generando} style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '0.82rem' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.15rem' }}>Cargo</label>
                        <input type="text" value={colaborador2.cargo} onChange={(e) => setColaborador2({ ...colaborador2, cargo: e.target.value.toUpperCase() })} placeholder="FUNCIONARIO" disabled={generando} style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '0.82rem' }} />
                      </div>
                      <button type="button" onClick={() => setColaborador2({ nombre: '', cedula: '', cargo: '' })} style={{ padding: '0.35rem 0.5rem', fontSize: '0.68rem', background: '#fee2e2', border: 'none', color: '#dc2626', borderRadius: '6px', cursor: 'pointer', lineHeight: 1, fontWeight: 600, whiteSpace: 'nowrap', marginBottom: '1px' }} title="Limpiar responsable">Limpiar</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* PASO 3: Vista previa del PDF — ocupa todo el alto disponible */}
          {paso === 'preview' && pdfPreviewUrl && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#303d50', margin: '0 0 0.6rem', textAlign: 'center' }}>
                {pdfNombreArchivo.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()}
              </p>
              <iframe
                src={`${pdfPreviewUrl}#toolbar=1&navpanes=0&view=FitH`}
                style={{ flex: 1, width: '100%', minHeight: 0, border: '1px solid #dee2e6', borderRadius: '6px', background: '#525659' }}
                title="Vista previa del PDF"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="inventario-fisico__modal-footer" style={{ justifyContent: 'center', gap: '0.75rem' }}>
          {paso === 'seleccion' && (
            <>
              <button className="floresta-busqueda__btn" style={{ background: 'transparent', border: '2px solid #303d50', color: '#303d50', borderRadius: '8px' }} onClick={handleCerrar}>Cancelar</button>
              <button className="floresta-busqueda__btn" disabled={seleccionados.size === 0} onClick={() => {
                // Pre-llenar sede, ubicación y responsables desde el primer inventario seleccionado
                const primerSeleccionado = inventarios.find(inv => seleccionados.has(inv.id))
                if (primerSeleccionado) {
                  // Fecha del formato = fecha real del inventario (editable después)
                  const fechaInv = normalizarFecha(primerSeleccionado.fecha || '')
                  setFechaFormato(fechaInv || new Date().toISOString().split('T')[0])
                  const obs = primerSeleccionado.observaciones || ''
                  const sedeMatch = obs.match(/Sede:\s*([^|]+)/)
                  const ubicMatch = obs.match(/Ubicaci[oó]n:\s*([^|]+)/)
                  const col1Match = obs.match(/Colaborador 1:\s*([^(|]+?)(?:\s*\(([^)]*)\))?(?:\s*\||$)/)
                  const col2Match = obs.match(/Colaborador 2:\s*([^(|]+?)(?:\s*\(([^)]*)\))?(?:\s*\||\s*$)/)
                  if (sedeMatch) setSede(sedeMatch[1].trim())
                  else setSede('')
                  if (ubicMatch) setUbicacion(ubicMatch[1].trim())
                  else setUbicacion('')
                  if (col1Match) {
                    const nombre = col1Match[1].trim()
                    const cargo = col1Match[2]?.trim() || ''
                    const cedula = primerSeleccionado.cedula || ''
                    if (nombre) setColaborador1({ nombre, cedula, cargo })
                  }
                  if (col2Match) {
                    const nombre2 = col2Match[1].trim()
                    const cargo2 = col2Match[2]?.trim() || ''
                    if (nombre2 && nombre2 !== '()') setColaborador2({ nombre: nombre2, cedula: '', cargo: cargo2 })
                  }
                }
                setPaso('datos')
              }} style={{ opacity: seleccionados.size === 0 ? 0.5 : 1, borderRadius: '8px' }}>
                Siguiente →
              </button>
            </>
          )}
          {paso === 'datos' && (
            <>
              <button className="floresta-busqueda__btn" style={{ background: 'transparent', border: '2px solid #303d50', color: '#303d50', borderRadius: '8px' }} onClick={() => setPaso('seleccion')} disabled={generando}>← Volver</button>
              <button className="floresta-busqueda__btn" onClick={() => void handleGenerar()} disabled={generando} style={{ background: '#2e7d32', borderRadius: '8px' }}>
                {generando ? 'Generando...' : 'Generar PDF →'}
              </button>
            </>
          )}
          {paso === 'preview' && (
            <>
              <button className="floresta-busqueda__btn" style={{ background: 'transparent', border: '2px solid #303d50', color: '#303d50', borderRadius: '8px' }} onClick={() => setPaso('datos')}>← Volver</button>
              <button className="floresta-busqueda__btn" onClick={handleDescargar} style={{ background: '#2e7d32', borderRadius: '8px' }}>
                Descargar PDF
              </button>
              <button className="floresta-busqueda__btn" style={{ background: '#6c757d', borderRadius: '8px' }} onClick={handleCerrar}>Cerrar</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
