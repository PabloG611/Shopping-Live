import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useToast } from '../../hooks/useToast'
import { ToastContainer } from '../common/ToastContainer'
import ModalConfirmarAccion from '../common/ModalConfirmarAccion'
import FloatingField from '../ui/FloatingField'
import {
  listarFaltantesUNP,
  listarFaltantesFloresta,
  agregarFaltante,
  eliminarFaltante,
  marcarFaltanteInventariado,
  eliminarTodosFaltantes,
  buscarCoincidenciasPlaca,
  type Faltante,
  type TipoFaltante,
  type CoincidenciaPlaca,
} from '../../services/faltantesService'
import { florestaCargaMasiva, florestaBuscarPorPlaca, type RegistroFlorestaExcel } from '../../services/florestaService'
import './GestionFaltantes.css'

type SubPestana = 'faltantes-unp' | 'faltantes-floresta' | 'carga-masiva'

export function GestionFaltantes() {
  const [subPestana, setSubPestana] = useState<SubPestana>('faltantes-unp')
  const toast = useToast()

  return (
    <div className="gestion-faltantes">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Sub-navegación pill */}
      <div style={{ display: 'flex', gap: '0.25rem', padding: '4px', background: 'rgba(48, 61, 80, 0.05)', borderRadius: '12px', width: 'fit-content', marginBottom: '1.25rem', marginInline: 'auto' }}>
        <button type="button"
          style={{ padding: '0.45rem 1rem', border: 'none', borderRadius: '9px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', background: subPestana === 'faltantes-unp' ? '#303d50' : 'transparent', color: subPestana === 'faltantes-unp' ? '#fff' : '#5c6474' }}
          onClick={() => setSubPestana('faltantes-unp')}>
          Faltantes UNP
        </button>
        <button type="button"
          style={{ padding: '0.45rem 1rem', border: 'none', borderRadius: '9px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', background: subPestana === 'faltantes-floresta' ? '#303d50' : 'transparent', color: subPestana === 'faltantes-floresta' ? '#fff' : '#5c6474' }}
          onClick={() => setSubPestana('faltantes-floresta')}>
          Faltantes Floresta
        </button>
        <button type="button"
          style={{ padding: '0.45rem 1rem', border: 'none', borderRadius: '9px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', background: subPestana === 'carga-masiva' ? '#303d50' : 'transparent', color: subPestana === 'carga-masiva' ? '#fff' : '#5c6474' }}
          onClick={() => setSubPestana('carga-masiva')}>
          Carga Masiva
        </button>
      </div>

      {subPestana === 'faltantes-unp' && <PanelFaltantes tipo="unp" toast={toast} />}
      {subPestana === 'faltantes-floresta' && <PanelFaltantes tipo="floresta" toast={toast} />}
      {subPestana === 'carga-masiva' && <PanelCargaMasivaFloresta toast={toast} />}
    </div>
  )
}


// ─── PANEL: CARGA MASIVA DATOS FLORESTA ────────────────────────────────────────

function PanelCargaMasivaFloresta({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [registrosExcel, setRegistrosExcel] = useState<RegistroFlorestaExcel[]>([])
  const [limpiarAntes, setLimpiarAntes] = useState(false)
  const [cargandoMasiva, setCargandoMasiva] = useState(false)
  const [mostrarModalConfirmar, setMostrarModalConfirmar] = useState(false)
  const [archivoInfo, setArchivoInfo] = useState<{ nombre: string; tamano: number } | null>(null)
  const [progreso, setProgreso] = useState<{ loteActual: number; totalLotes: number; porcentaje: number } | null>(null)
  const [resumenCarga, setResumenCarga] = useState<{
    placas_unicas: number; bienes_creados: number; bienes_actualizados: number
    movimientos_insertados: number; movimientos_omitidos: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formatearTamano = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const procesarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setArchivoInfo({ nombre: archivo.name, tamano: archivo.size })
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const filas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const registros: RegistroFlorestaExcel[] = []
        for (const fila of filas) {
          const get = (nombres: string[]): string => {
            for (const n of nombres) {
              for (const key of Object.keys(fila)) {
                if (key.trim().toLowerCase().replace(/[_\s]/g, '') === n.toLowerCase().replace(/[_\s]/g, ''))
                  return String(fila[key] ?? '').trim()
              }
            }
            return ''
          }
          const placa = get(['PLACA', 'placa'])
          const key = get(['KEY', 'key'])
          if (!placa && !key) continue
          let fecha = get(['FECHA', 'fecha'])
          const fechaRaw = fila['FECHA'] ?? fila['fecha'] ?? ''
          if (typeof fechaRaw === 'number') {
            const d = XLSX.SSF.parse_date_code(fechaRaw)
            if (d) fecha = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
          }
          const idMovRaw = get(['ID_MOV', 'IDMOV', 'id_mov'])
          const idMov = idMovRaw ? parseInt(idMovRaw, 10) : null
          registros.push({
            fecha,
            descripcion: get(['DESCRIPCION', 'DESCRIPCIÓN', 'descripcion', 'DESCRIPTION']),
            placa,
            tipo_mov: get(['TIPO_MOV', 'TIPOMOV', 'tipo_mov', 'TIPO']),
            origen: get(['ORIGEN', 'origen']),
            cc_origen: get(['CC_ORIGEN', 'CCORIGEN', 'cc_origen']),
            destino: get(['DESTINO', 'destino']),
            cc_destino: get(['CC_DESTINO', 'CCDESTINO', 'cc_destino']),
            ubicacion: get(['UBICACION', 'UBICACIÓN', 'ubicacion', 'ubicación']),
            fuente: get(['FUENTE', 'fuente']),
            key: key || placa,
            id_mov: isNaN(idMov as number) ? null : idMov,
          })
        }
        if (registros.length === 0) { toast.error('No se encontraron registros válidos.'); setArchivoInfo(null); return }
        setRegistrosExcel(registros)
        setResumenCarga(null)
        toast.success(`${registros.length} registros cargados del Excel.`)
      } catch { toast.error('Error al leer el archivo.'); setArchivoInfo(null) }
    }
    reader.readAsArrayBuffer(archivo)
    e.target.value = ''
  }

  const ejecutarCargaMasiva = async () => {
    if (registrosExcel.length === 0) return
    setMostrarModalConfirmar(false)
    setCargandoMasiva(true)
    setResumenCarga(null)
    setProgreso({ loteActual: 0, totalLotes: 1, porcentaje: 0 })
    try {
      const res = await florestaCargaMasiva(registrosExcel, limpiarAntes, (p) => setProgreso(p))
      if (res.ok && res.resumen) {
        setResumenCarga(res.resumen)
        toast.success(`Carga exitosa: ${res.resumen.placas_unicas} placas, ${res.resumen.movimientos_insertados} movimientos.`)
        setRegistrosExcel([])
        setArchivoInfo(null)
      } else { toast.error(res.mensaje ?? 'Error en la carga masiva') }
    } catch { toast.error('Error de conexión.') }
    finally { setCargandoMasiva(false); setProgreso(null) }
  }

  const limpiar = () => {
    setRegistrosExcel([])
    setArchivoInfo(null)
    setResumenCarga(null)
    setLimpiarAntes(false)
  }

  const placasUnicas = new Set(registrosExcel.map(r => r.placa)).size

  const columnasEsperadas = ['FECHA', 'PLACA', 'DESCRIPCION', 'TIPO_MOV', 'ORIGEN', 'CC_ORIGEN', 'DESTINO', 'CC_DESTINO', 'UBICACION', 'FUENTE', 'KEY', 'ID_MOV']

  return (
    <div className="transferencia-page__bloque-tab">
      {/* Modal de confirmación */}
      <ModalConfirmarAccion
        isOpen={mostrarModalConfirmar}
        titulo="Confirmar carga masiva"
        mensaje={limpiarAntes
          ? `Se eliminarán TODOS los bienes y movimientos Floresta existentes y se cargarán ${registrosExcel.length} registros nuevos.`
          : `Se cargarán ${registrosExcel.length} registros (${placasUnicas} placas únicas). Los bienes existentes se actualizarán.`}
        destacado={limpiarAntes ? 'Esta acción eliminará los datos actuales antes de cargar' : undefined}
        advertencia={limpiarAntes ? 'Esta operación no se puede deshacer.' : undefined}
        textoConfirmar={cargandoMasiva ? 'Procesando...' : 'Confirmar carga'}
        color={limpiarAntes ? '#d13c47' : '#365072'}
        loading={cargandoMasiva}
        onConfirmar={ejecutarCargaMasiva}
        onCancelar={() => setMostrarModalConfirmar(false)}
      />

      {/* Encabezado */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem', color: '#303d50', fontSize: '1.1rem' }}>Carga masiva de datos Floresta</h4>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.84rem', color: '#666' }}>
          Suba un archivo Excel con el historial de movimientos de bienes Floresta.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {columnasEsperadas.map(col => (
            <span key={col} style={{
              fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem',
              background: '#e8eef5', color: '#365072', borderRadius: '4px',
              fontFamily: 'monospace', letterSpacing: '0.02em',
            }}>{col}</span>
          ))}
        </div>
      </div>

      {/* Zona de carga de archivo */}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={procesarExcel} />

      {!archivoInfo ? (
        <div
          onClick={() => !cargandoMasiva && fileInputRef.current?.click()}
          style={{
            border: '2px dashed #c5d3e0', borderRadius: '12px', padding: '2rem 1.5rem',
            textAlign: 'center', cursor: cargandoMasiva ? 'default' : 'pointer',
            background: '#f8fafc', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { if (!cargandoMasiva) { e.currentTarget.style.borderColor = '#365072'; e.currentTarget.style.background = '#f0f5fa' } }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#c5d3e0'; e.currentTarget.style.background = '#f8fafc' }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem', opacity: 0.5 }}>&#128196;</div>
          <p style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 600, color: '#303d50' }}>
            Haga clic para seleccionar un archivo
          </p>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#888' }}>
            Formatos aceptados: .xlsx, .xls, .csv
          </p>
        </div>
      ) : (
        <div style={{
          border: '1.5px solid #c3e6cb', borderRadius: '12px', padding: '1.25rem 1.5rem',
          background: '#f6fdf8', display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          {/* Icono archivo */}
          <div style={{
            width: '48px', height: '48px', borderRadius: '10px', background: '#1d6f42',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: '1.5rem', color: '#fff' }}>&#128196;</span>
          </div>
          {/* Info del archivo */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 0.2rem', fontSize: '0.92rem', fontWeight: 600, color: '#303d50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {archivoInfo.nombre}
            </p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>
              {formatearTamano(archivoInfo.tamano)} &middot; {registrosExcel.length.toLocaleString()} registros &middot; {placasUnicas.toLocaleString()} placas únicas
            </p>
          </div>
          {/* Botón cambiar archivo */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={cargandoMasiva}
            style={{
              background: 'none', border: '1.5px solid #ccc', borderRadius: '8px',
              padding: '0.4rem 0.75rem', fontSize: '0.78rem', color: '#555',
              cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
            }}
          >
            Cambiar
          </button>
          {/* Botón quitar */}
          <button
            onClick={limpiar}
            disabled={cargandoMasiva}
            style={{
              background: 'none', border: 'none', fontSize: '1.3rem',
              color: '#999', cursor: 'pointer', padding: '0.25rem', lineHeight: 1,
            }}
            aria-label="Quitar archivo"
          >
            &times;
          </button>
        </div>
      )}

      {/* Opciones y acciones */}
      {registrosExcel.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          {/* Toggle limpiar datos */}
          <div
            onClick={() => setLimpiarAntes(!limpiarAntes)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.85rem 1rem', borderRadius: '10px', cursor: 'pointer',
              background: limpiarAntes ? '#fef2f2' : '#f8fafc',
              border: `1.5px solid ${limpiarAntes ? '#fca5a5' : '#e2e8f0'}`,
              transition: 'all 0.2s',
            }}
          >
            {/* Toggle switch */}
            <div style={{
              width: '40px', height: '22px', borderRadius: '11px', position: 'relative',
              background: limpiarAntes ? '#d13c47' : '#cbd5e1', transition: 'background 0.25s',
              flexShrink: 0,
            }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                position: 'absolute', top: '2px', left: limpiarAntes ? '20px' : '2px',
                transition: 'left 0.25s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
            <div>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: limpiarAntes ? '#b91c1c' : '#475569' }}>
                Limpiar datos existentes antes de cargar
              </span>
              {limpiarAntes && (
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#dc2626' }}>
                  Se eliminarán todos los bienes y movimientos Floresta actuales
                </p>
              )}
            </div>
          </div>

          {/* Botones de acción */}
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              className="floresta-busqueda__btn"
              onClick={() => setMostrarModalConfirmar(true)}
              disabled={cargandoMasiva}
              style={{ background: '#365072', padding: '0.65rem 1.5rem', fontSize: '0.9rem' }}
            >
              {cargandoMasiva ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Procesando...
                </span>
              ) : 'Ejecutar carga masiva'}
            </button>
            <button
              className="floresta-busqueda__btn"
              onClick={limpiar}
              disabled={cargandoMasiva}
              style={{ background: '#6c757d', padding: '0.65rem 1.25rem', fontSize: '0.9rem' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Barra de progreso */}
      {progreso && cargandoMasiva && (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#365072' }}>
              Enviando lote {progreso.loteActual} de {progreso.totalLotes}...
            </span>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#303d50' }}>
              {progreso.porcentaje}%
            </span>
          </div>
          <div style={{
            width: '100%', height: '10px', background: '#e2e8f0',
            borderRadius: '5px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', background: 'linear-gradient(90deg, #365072, #4a90d9)',
              borderRadius: '5px', width: `${progreso.porcentaje}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#666' }}>
            {Math.min(progreso.loteActual * 2000, registrosExcel.length).toLocaleString()} de {registrosExcel.length.toLocaleString()} registros procesados
          </p>
        </div>
      )}

      {/* Resumen de carga exitosa */}
      {resumenCarga && (
        <div style={{
          marginTop: '1.5rem', padding: '1.25rem', background: '#f0fdf4',
          borderRadius: '12px', border: '1.5px solid #86efac',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.2rem' }}>&#9989;</span>
            <strong style={{ fontSize: '0.95rem', color: '#166534' }}>Carga completada exitosamente</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {[
              { label: 'Placas únicas', valor: resumenCarga.placas_unicas },
              { label: 'Bienes creados', valor: resumenCarga.bienes_creados },
              { label: 'Bienes actualizados', valor: resumenCarga.bienes_actualizados },
              { label: 'Movimientos insertados', valor: resumenCarga.movimientos_insertados },
              ...(resumenCarga.movimientos_omitidos > 0 ? [{ label: 'Omitidos (duplicados)', valor: resumenCarga.movimientos_omitidos }] : []),
            ].map(item => (
              <div key={item.label} style={{
                padding: '0.6rem 0.85rem', background: '#fff', borderRadius: '8px',
                border: '1px solid #d1fae5',
              }}>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{item.label}</p>
                <p style={{ margin: '0.15rem 0 0', fontSize: '1.15rem', fontWeight: 700, color: '#14532d' }}>{item.valor.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


// ─── PANEL: FALTANTES (UNP o FLORESTA) ────────────────────────────────────────

function PanelFaltantes({ tipo, toast }: { tipo: TipoFaltante; toast: ReturnType<typeof useToast> }) {
  const [faltantes, setFaltantes] = useState<Faltante[]>([])
  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [mostrarModalAgregar, setMostrarModalAgregar] = useState(false)
  const [confirmacion, setConfirmacion] = useState<{ accion: 'eliminar' | 'inventariar'; placa: string } | null>(null)
  const [confirmarEliminarTodos, setConfirmarEliminarTodos] = useState(false)
  const [eliminandoTodos, setEliminandoTodos] = useState(false)

  useEffect(() => { cargar() }, [tipo])

  const cargar = async () => {
    setCargando(true)
    try {
      const data = tipo === 'unp' ? await listarFaltantesUNP() : await listarFaltantesFloresta()
      setFaltantes(data)
    } catch { toast.error(`Error al cargar faltantes`) }
    finally { setCargando(false) }
  }

  const confirmarAccion = async () => {
    if (!confirmacion) return
    try {
      if (confirmacion.accion === 'eliminar') {
        await eliminarFaltante(tipo, confirmacion.placa)
        toast.success(`Placa ${confirmacion.placa} eliminada`)
      } else {
        await marcarFaltanteInventariado(tipo, confirmacion.placa)
        toast.success(`Placa ${confirmacion.placa} marcada como inventariada`)
      }
      await cargar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error')
    } finally { setConfirmacion(null) }
  }

  const handleEliminarTodos = async () => {
    setEliminandoTodos(true)
    try {
      const res = await eliminarTodosFaltantes(tipo)
      toast.success(res.message)
      await cargar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al eliminar')
    } finally {
      setEliminandoTodos(false)
      setConfirmarEliminarTodos(false)
    }
  }

  const faltantesFiltrados = busqueda
    ? faltantes.filter(f => {
        const q = busqueda.toLowerCase()
        return f.placa.toLowerCase().includes(q) ||
          f.descripcion.toLowerCase().includes(q) ||
          f.responsable_nombre.toLowerCase().includes(q) ||
          f.responsable_cedula.toLowerCase().includes(q) ||
          (f.serial ?? '').toLowerCase().includes(q)
      })
    : faltantes

  const esUNP = tipo === 'unp'

  return (
    <div className="transferencia-page__bloque-tab">
      {/* Modal confirmar acción individual */}
      <ModalConfirmarAccion
        isOpen={!!confirmacion}
        titulo={confirmacion?.accion === 'eliminar' ? 'Eliminar faltante' : 'Marcar inventariado'}
        mensaje={confirmacion?.accion === 'eliminar'
          ? `¿Eliminar la placa ${confirmacion?.placa} de la lista de faltantes?`
          : `¿Marcar la placa ${confirmacion?.placa} como inventariada?`}
        textoConfirmar={confirmacion?.accion === 'eliminar' ? 'Eliminar' : 'Marcar inventariado'}
        color={confirmacion?.accion === 'eliminar' ? '#d13c47' : '#1a7a3a'}
        onConfirmar={confirmarAccion}
        onCancelar={() => setConfirmacion(null)}
      />

      {/* Modal confirmar eliminar todos */}
      <ModalConfirmarAccion
        isOpen={confirmarEliminarTodos}
        titulo="Eliminar todos los faltantes"
        mensaje={`¿Está seguro de eliminar TODOS los faltantes ${esUNP ? 'UNP' : 'Floresta'}?`}
        destacado={`${faltantes.length} faltantes serán eliminados`}
        advertencia="Esta acción no se puede deshacer."
        textoConfirmar="Sí, eliminar todos"
        color="#d13c47"
        loading={eliminandoTodos}
        onConfirmar={handleEliminarTodos}
        onCancelar={() => setConfirmarEliminarTodos(false)}
      />

      {/* Modal agregar faltante */}
      {mostrarModalAgregar && (
        <ModalAgregarFaltante
          tipo={tipo}
          onSuccess={async (msg) => { toast.success(msg); setMostrarModalAgregar(false); await cargar() }}
          onError={(msg) => toast.error(msg)}
          onClose={() => setMostrarModalAgregar(false)}
        />
      )}

      {/* Barra de acciones */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por placa, descripción, serial o responsable..."
          style={{ flex: 1, padding: '0.4rem 0.7rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem', background: 'white' }}
        />
        <span style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap' }}>
          {faltantesFiltrados.length} faltante{faltantesFiltrados.length !== 1 ? 's' : ''}
        </span>
        <div style={{ height: '20px', width: '1px', background: '#e2e8f0' }} />
        <button className="floresta-busqueda__btn" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }} onClick={() => setMostrarModalAgregar(true)}>
          + Agregar
        </button>
        <button className="floresta-busqueda__btn" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', background: '#6c757d' }} onClick={cargar} disabled={cargando}>
          Recargar
        </button>
        {faltantes.length > 0 && (
          <button className="floresta-busqueda__btn" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', background: '#d13c47' }} onClick={() => setConfirmarEliminarTodos(true)}>
            Eliminar todos
          </button>
        )}
      </div>

      {/* Tabla */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Cargando faltantes...</div>
      ) : faltantesFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
          {busqueda ? 'No se encontraron resultados' : 'No hay faltantes registrados'}
        </div>
      ) : (
        <div className="bienes-table-wrap">
          <div style={{ marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: '2rem', padding: '0.2rem 0.6rem',
              fontSize: '0.95rem', fontWeight: 700, color: '#fff',
              background: faltantesFiltrados.length > 0 ? '#d13c47' : '#1a7a3a',
              borderRadius: '999px', lineHeight: 1.2,
              animation: faltantesFiltrados.length > 0 ? 'pulse-badge 2s infinite' : undefined,
            }}>
              {faltantesFiltrados.length}
            </span>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#303d50' }}>
              faltante{faltantesFiltrados.length !== 1 ? 's' : ''}
              {busqueda && <span style={{ fontWeight: 400, color: '#888' }}> de {faltantes.length} totales</span>}
            </span>
          </div>
          <div className="bienes-table-frame">
            <table className="bienes-table bienes-table--head">
              <colgroup>
                <col style={{ width: '9%' }} />
                <col />
                {esUNP && <col style={{ width: '11%' }} />}
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '13%' }} />
              </colgroup>
              <thead><tr>
                <th>Placa</th><th>Descripción</th>
                {esUNP && <th>Serial</th>}
                <th>Ubicación</th><th>Responsable</th><th>Cédula</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr></thead>
            </table>
            <div className="bienes-table-scroll">
              <table className="bienes-table bienes-table--body">
                <colgroup>
                  <col style={{ width: '9%' }} />
                  <col />
                  {esUNP && <col style={{ width: '11%' }} />}
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '13%' }} />
                </colgroup>
                <tbody>
                  {faltantesFiltrados.map((f, idx) => (
                    <tr key={f.id} style={{ background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                      <td className="bienes-table__placa" title={f.placa}>{f.placa}</td>
                      <td title={f.descripcion || ''}>{f.descripcion || '—'}</td>
                      {esUNP && <td title={f.serial || ''}><small>{f.serial || '—'}</small></td>}
                      <td title={f.ubicacion || ''}>{f.ubicacion || '—'}</td>
                      <td title={f.responsable_nombre || ''}>{f.responsable_nombre || '—'}</td>
                      <td title={f.responsable_cedula || ''}><small className="floresta-detalle__cc">{f.responsable_cedula || '—'}</small></td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button className="floresta-tabla__btn-accion--inventariar"
                            onClick={() => setConfirmacion({ accion: 'inventariar', placa: f.placa })}>
                            ✓ Inventariado
                          </button>
                          <button className="floresta-tabla__btn-accion--eliminar"
                            onClick={() => setConfirmacion({ accion: 'eliminar', placa: f.placa })}>
                            ✕ Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── MODAL: AGREGAR FALTANTE (con tabs: Individual / Carga masiva) ────────────

type TabModal = 'individual' | 'masiva'

interface ResultadoCargaMasiva {
  placa: string
  ok: boolean
  mensaje: string
}

function ModalAgregarFaltante({ tipo, onSuccess, onError, onClose }: {
  tipo: TipoFaltante
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
  onClose: () => void
}) {
  const [tabModal, setTabModal] = useState<TabModal>('individual')
  // ── Estado Individual ──
  const [placa, setPlaca] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [serial, setSerial] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [responsableNombre, setResponsableNombre] = useState('')
  const [responsableCedula, setResponsableCedula] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [coincidencias, setCoincidencias] = useState<CoincidenciaPlaca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  const [seleccionado, setSeleccionado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busquedaIdRef = useRef(0)

  // ── Estado Carga Masiva ──
  const [placasMasivas, setPlacasMasivas] = useState('')
  const [procesandoMasiva, setProcesandoMasiva] = useState(false)
  const [progresoMasiva, setProgresoMasiva] = useState(0)
  const [totalMasiva, setTotalMasiva] = useState(0)
  const [resultadosMasiva, setResultadosMasiva] = useState<ResultadoCargaMasiva[]>([])
  const [cargaMasivaFinalizada, setCargaMasivaFinalizada] = useState(false)

  const esUNP = tipo === 'unp'

  // Cerrar con Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Buscar coincidencias cuando cambia la placa (debounce)
  const buscarPlaca = (valor: string) => {
    setPlaca(valor)
    setSeleccionado(false)
    setCoincidencias([])
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (valor.trim().length < 3) { setMostrarLista(false); return }

    debounceRef.current = setTimeout(async () => {
      const idBusqueda = ++busquedaIdRef.current
      setBuscando(true)
      try {
        if (esUNP) {
          // UNP: buscar en Firebird por placa o serial
          const results = await buscarCoincidenciasPlaca(valor.trim(), 'unp')
          if (idBusqueda !== busquedaIdRef.current) return
          if (results.length === 1) {
            seleccionarCoincidencia(results[0])
          } else {
            setCoincidencias(results)
            setMostrarLista(results.length > 0)
          }
        } else {
          // Floresta: buscar directamente por placa exacta
          const bien = await florestaBuscarPorPlaca(valor.trim())
          if (idBusqueda !== busquedaIdRef.current) return
          if (bien) {
            seleccionarCoincidencia({
              placa: bien.placa,
              descripcion: bien.descripcion ?? '',
              responsable_nombre: bien.responsable_nombre ?? '',
              responsable_cedula: bien.responsable_cedula ?? '',
              ubicacion: bien.ubicacion ?? '',
            })
          } else {
            // Intentar búsqueda parcial
            const results = await buscarCoincidenciasPlaca(valor.trim(), 'floresta')
            if (idBusqueda !== busquedaIdRef.current) return
            if (results.length === 1) {
              seleccionarCoincidencia(results[0])
            } else {
              setCoincidencias(results)
              setMostrarLista(results.length > 0)
            }
          }
        }
      } catch { /* silenciar */ }
      finally { if (idBusqueda === busquedaIdRef.current) setBuscando(false) }
    }, 400)
  }

  const seleccionarCoincidencia = (item: CoincidenciaPlaca) => {
    setPlaca(item.placa)
    setDescripcion(item.descripcion)
    setSerial(item.serial ?? '')
    setUbicacion(item.ubicacion)
    setResponsableNombre(item.responsable_nombre)
    setResponsableCedula(item.responsable_cedula)
    setSeleccionado(true)
    setMostrarLista(false)
    setCoincidencias([])
  }

  const guardar = async () => {
    if (!placa.trim()) { onError('Ingrese una placa'); return }
    setGuardando(true)
    try {
      await agregarFaltante(
        tipo,
        placa.trim().toUpperCase(),
        descripcion.trim() || undefined,
        ubicacion.trim() || undefined,
        responsableNombre.trim() || undefined,
        responsableCedula.trim() || undefined,
        esUNP ? (serial.trim() || undefined) : undefined,
      )
      onSuccess(`Placa ${placa} agregada a faltantes`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Error al agregar')
    } finally { setGuardando(false) }
  }

  // Submit con Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && placa.trim() && !guardando) {
      e.preventDefault()
      void guardar()
    }
  }

  // ── Carga masiva ──
  const placasParseadas = placasMasivas
    .split(/[\n,;]+/)
    .map(p => p.trim().toUpperCase())
    .filter(p => p.length > 0)
  const placasUnicasMasiva = [...new Set(placasParseadas)]

  const ejecutarCargaMasiva = async () => {
    if (placasUnicasMasiva.length === 0) return
    setProcesandoMasiva(true)
    setCargaMasivaFinalizada(false)
    setResultadosMasiva([])
    setProgresoMasiva(0)
    setTotalMasiva(placasUnicasMasiva.length)

    const resultados: ResultadoCargaMasiva[] = []
    for (let i = 0; i < placasUnicasMasiva.length; i++) {
      const p = placasUnicasMasiva[i]
      try {
        if (esUNP) {
          // UNP: buscar en Firebird por placa o serial
          const coincidencias = await buscarCoincidenciasPlaca(p, 'unp')
          const coincidenciaExacta = coincidencias.find(c => c.placa === p || (c.serial ?? '').toUpperCase() === p) ?? coincidencias[0]

          if (coincidenciaExacta) {
            await agregarFaltante(
              tipo,
              coincidenciaExacta.placa,
              coincidenciaExacta.descripcion || undefined,
              coincidenciaExacta.ubicacion || undefined,
              coincidenciaExacta.responsable_nombre || undefined,
              coincidenciaExacta.responsable_cedula || undefined,
              coincidenciaExacta.serial || undefined,
            )
            resultados.push({ placa: coincidenciaExacta.placa, ok: true, mensaje: 'Agregada con datos de TNS' })
          } else {
            await agregarFaltante(tipo, p)
            resultados.push({ placa: p, ok: true, mensaje: 'Agregada (sin datos en TNS)' })
          }
        } else {
          // Floresta: buscar en tabla FlorestaBien por placa exacta
          const bien = await florestaBuscarPorPlaca(p)
          if (bien) {
            await agregarFaltante(
              tipo,
              bien.placa,
              bien.descripcion || undefined,
              bien.ubicacion ?? undefined,
              bien.responsable_nombre || undefined,
              bien.responsable_cedula || undefined,
            )
            resultados.push({ placa: bien.placa, ok: true, mensaje: 'Agregada con datos de Floresta' })
          } else {
            await agregarFaltante(tipo, p)
            resultados.push({ placa: p, ok: true, mensaje: 'Agregada (sin datos en Floresta)' })
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido'
        resultados.push({ placa: p, ok: false, mensaje: msg })
      }
      setProgresoMasiva(i + 1)
      setResultadosMasiva([...resultados])
    }

    setCargaMasivaFinalizada(true)
    setProcesandoMasiva(false)
    const exitosas = resultados.filter(r => r.ok).length
    if (exitosas > 0) {
      onSuccess(`${exitosas} de ${placasUnicasMasiva.length} placas agregadas correctamente`)
    }
  }

  const resetMasiva = () => {
    setPlacasMasivas('')
    setResultadosMasiva([])
    setCargaMasivaFinalizada(false)
    setProgresoMasiva(0)
    setTotalMasiva(0)
  }

  return (
    <div className="inventario-fisico__modal-overlay">
      <div className="inventario-fisico__modal" style={{ maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="inventario-fisico__modal-header" style={{ background: '#303d50', justifyContent: 'space-between' }}>
          <h5 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 600, textAlign: 'center', flex: 1 }}>
            Agregar faltante {esUNP ? 'UNP' : 'Floresta'}
          </h5>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1, padding: '0.25rem' }} aria-label="Cerrar">×</button>
        </div>

        {/* Tabs dentro del modal */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', background: '#f8f9fa' }}>
          <button type="button" onClick={() => setTabModal('individual')}
            style={{ flex: 1, padding: '0.7rem 1rem', border: 'none', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, background: tabModal === 'individual' ? '#fff' : 'transparent', color: tabModal === 'individual' ? '#303d50' : '#888', borderBottom: tabModal === 'individual' ? '2.5px solid #365072' : '2.5px solid transparent', transition: 'all 0.2s' }}>
            Individual
          </button>
          <button type="button" onClick={() => setTabModal('masiva')}
            style={{ flex: 1, padding: '0.7rem 1rem', border: 'none', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, background: tabModal === 'masiva' ? '#fff' : 'transparent', color: tabModal === 'masiva' ? '#303d50' : '#888', borderBottom: tabModal === 'masiva' ? '2.5px solid #365072' : '2.5px solid transparent', transition: 'all 0.2s' }}>
            Carga masiva
          </button>
        </div>

        {/* ─── TAB INDIVIDUAL ─── */}
        {tabModal === 'individual' && (
        <>
        <div className="inventario-fisico__modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem', overflowY: 'auto', flex: 1 }}>
          {/* Placa o Serial */}
          <div style={{ position: 'relative' }}>
            <FloatingField label={esUNP ? 'Placa o Serial' : 'Placa'} required tieneValor={!!placa}>
              <input
                type="text"
                value={placa}
                onChange={e => buscarPlaca(e.target.value.toUpperCase())}
                className="floresta-busqueda__input"
                style={{ width: '100%', border: '1.5px solid #dce6f0', borderRadius: '8px', padding: '0.75rem' }}
                placeholder=" "
                autoFocus
              />
            </FloatingField>
            {buscando && <small style={{ color: '#666', display: 'block', marginTop: '0.25rem' }}>Buscando...</small>}
            {seleccionado && <small style={{ color: '#1a7a3a', fontWeight: 600, display: 'block', marginTop: '0.25rem' }}>✓ Datos cargados</small>}

            {/* Lista desplegable de coincidencias */}
            {mostrarLista && coincidencias.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: '#fff', border: '1.5px solid #dce6f0', borderRadius: '0 0 8px 8px',
                boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: '200px', overflowY: 'auto',
              }}>
                {coincidencias.map((item) => (
                  <button
                    key={item.placa}
                    type="button"
                    onClick={() => seleccionarCoincidencia(item)}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: '0.1rem',
                      width: '100%', padding: '0.6rem 0.85rem', border: 'none',
                      background: 'transparent', textAlign: 'left', cursor: 'pointer',
                      borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f7ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#303d50' }}>{item.placa}</span>
                    <span style={{ fontSize: '0.78rem', color: '#666' }}>
                      {item.descripcion || 'Sin descripción'} — {item.responsable_nombre || 'Sin responsable'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Descripción */}
          <FloatingField label="Descripción" tieneValor={!!descripcion}>
            <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)}
              className="floresta-busqueda__input" style={{ width: '100%', border: '1.5px solid #dce6f0', borderRadius: '8px', padding: '0.75rem' }} placeholder=" " />
          </FloatingField>

          {/* Fila 2 columnas: Serial + Ubicación */}
          <div style={{ display: 'grid', gridTemplateColumns: esUNP ? '1fr 1fr' : '1fr', gap: '0.85rem' }}>
            {esUNP && (
              <FloatingField label="Serial" tieneValor={!!serial}>
                <input type="text" value={serial} onChange={e => setSerial(e.target.value)}
                  className="floresta-busqueda__input" style={{ width: '100%', border: '1.5px solid #dce6f0', borderRadius: '8px', padding: '0.75rem' }} placeholder=" " />
              </FloatingField>
            )}
            <FloatingField label="Ubicación" tieneValor={!!ubicacion}>
              <input type="text" value={ubicacion} onChange={e => setUbicacion(e.target.value)}
                className="floresta-busqueda__input" style={{ width: '100%', border: '1.5px solid #dce6f0', borderRadius: '8px', padding: '0.75rem' }} placeholder=" " />
            </FloatingField>
          </div>

          {/* Fila 2 columnas: Responsable + Cédula */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <FloatingField label="Nombre responsable" tieneValor={!!responsableNombre}>
              <input type="text" value={responsableNombre} onChange={e => setResponsableNombre(e.target.value)}
                className="floresta-busqueda__input" style={{ width: '100%', border: '1.5px solid #dce6f0', borderRadius: '8px', padding: '0.75rem' }} placeholder=" " />
            </FloatingField>
            <FloatingField label="Cédula responsable" tieneValor={!!responsableCedula}>
              <input type="text" value={responsableCedula} onChange={e => setResponsableCedula(e.target.value)}
                className="floresta-busqueda__input" style={{ width: '100%', border: '1.5px solid #dce6f0', borderRadius: '8px', padding: '0.75rem' }} placeholder=" " inputMode="numeric" />
            </FloatingField>
          </div>
        </div>

        <div className="inventario-fisico__modal-footer" style={{ justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb' }}>
          <button className="floresta-busqueda__btn" onClick={onClose} style={{ background: '#6c757d' }}>
            Cancelar
          </button>
          <button className="floresta-busqueda__btn" onClick={guardar} disabled={guardando || !placa.trim()} style={{ background: '#365072' }}>
            {guardando ? 'Guardando...' : 'Agregar'}
          </button>
        </div>
        </>
        )}

        {/* ─── TAB CARGA MASIVA ─── */}
        {tabModal === 'masiva' && (
        <>
        <div className="inventario-fisico__modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flex: 1 }}>
          {!cargaMasivaFinalizada && !procesandoMasiva && (
            <>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>
                Ingrese las placas o seriales a agregar como faltantes, una por línea (también acepta separadas por coma o punto y coma). Se consultará TNS para obtener los datos del bien.
              </p>
              <textarea
                value={placasMasivas}
                onChange={e => setPlacasMasivas(e.target.value)}
                placeholder={"Ej:\nABC123\nDEF456\nSN12345"}
                rows={8}
                style={{ width: '100%', border: '1.5px solid #dce6f0', borderRadius: '8px', padding: '0.75rem', fontSize: '0.9rem', fontFamily: 'monospace', resize: 'vertical' }}
              />
              {placasUnicasMasiva.length > 0 && (
                <small style={{ color: '#365072', fontWeight: 600 }}>
                  {placasUnicasMasiva.length} valor{placasUnicasMasiva.length !== 1 ? 'es' : ''} único{placasUnicasMasiva.length !== 1 ? 's' : ''} detectado{placasUnicasMasiva.length !== 1 ? 's' : ''}
                </small>
              )}
            </>
          )}

          {/* Barra de progreso */}
          {(procesandoMasiva || cargaMasivaFinalizada) && totalMasiva > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#303d50', fontWeight: 600 }}>
                <span>{procesandoMasiva ? 'Procesando...' : 'Finalizado'}</span>
                <span>{progresoMasiva} / {totalMasiva}</span>
              </div>
              <div style={{ width: '100%', height: '10px', background: '#e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${(progresoMasiva / totalMasiva) * 100}%`, height: '100%', background: procesandoMasiva ? '#365072' : '#1a7a3a', transition: 'width 0.3s ease', borderRadius: '6px' }} />
              </div>
            </div>
          )}

          {/* Reporte final */}
          {cargaMasivaFinalizada && resultadosMasiva.length > 0 && (
            <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <div style={{ padding: '0.75rem 1rem', background: '#f0f7ff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 1 }}>
                <strong style={{ color: '#1a7a3a' }}>{resultadosMasiva.filter(r => r.ok).length} exitosas</strong>
                {resultadosMasiva.filter(r => !r.ok).length > 0 && (
                  <span> &nbsp;|&nbsp; <strong style={{ color: '#d13c47' }}>{resultadosMasiva.filter(r => !r.ok).length} fallidas</strong></span>
                )}
              </div>
              <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Placa</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Estado</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadosMasiva.map((r, i) => (
                    <tr key={i} style={{ background: r.ok ? '#f6fef9' : '#fef6f6' }}>
                      <td style={{ padding: '0.35rem 0.75rem', fontWeight: 600, fontFamily: 'monospace', borderBottom: '1px solid #f0f0f0' }}>{r.placa}</td>
                      <td style={{ padding: '0.35rem 0.75rem', borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ color: r.ok ? '#1a7a3a' : '#d13c47', fontWeight: 600 }}>{r.ok ? '✓' : '✕'}</span>
                      </td>
                      <td style={{ padding: '0.35rem 0.75rem', color: '#666', borderBottom: '1px solid #f0f0f0' }}>{r.mensaje}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="inventario-fisico__modal-footer" style={{ justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb' }}>
          {cargaMasivaFinalizada ? (
            <>
              <button className="floresta-busqueda__btn" onClick={resetMasiva} style={{ background: '#6c757d' }}>
                Nueva carga
              </button>
              <button className="floresta-busqueda__btn" onClick={onClose} style={{ background: '#365072' }}>
                Cerrar
              </button>
            </>
          ) : (
            <>
              <button className="floresta-busqueda__btn" onClick={onClose} disabled={procesandoMasiva} style={{ background: '#6c757d' }}>
                Cancelar
              </button>
              <button className="floresta-busqueda__btn" onClick={ejecutarCargaMasiva} disabled={procesandoMasiva || placasUnicasMasiva.length === 0} style={{ background: '#365072' }}>
                {procesandoMasiva ? `Procesando ${progresoMasiva}/${totalMasiva}...` : `Agregar ${placasUnicasMasiva.length} item${placasUnicasMasiva.length !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  )
}
