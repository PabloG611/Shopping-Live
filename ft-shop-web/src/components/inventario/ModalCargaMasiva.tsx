/**
 * Modal para carga masiva de placas.
 * Tab 1: Pegado de texto (placas separadas por comas, saltos de línea, etc.)
 * Tab 2: Importar/exportar Excel (placa, usuario, nota)
 */
import { useState, useRef, useEffect } from 'react'
import { FaLayerGroup, FaFileArrowUp, FaFileArrowDown, FaFileLines, FaFileExcel, FaCircleCheck, FaTriangleExclamation } from 'react-icons/fa6'
import { procesarCargaMasiva, parsearPlacas, type ResultadoCargaMasiva } from '../../services/cargaMasivaService'
import type { BienInventario } from '../../services/inventarioFisicoService'
import { buscarTerceroPorNombreOCedula } from '../../services/receptorCatalogoService'
import * as XLSX from 'xlsx'
import './ModalCargaMasiva.css'

interface ModalCargaMasivaProps {
  isOpen: boolean
  onClose: () => void
  bienesYaEscaneados: BienInventario[]
  onBienesAgregados: (bienes: BienInventario[]) => void
  onSuccess?: (msg: string) => void
  onWarning?: (msg: string) => void
  onError?: (msg: string) => void
  /**
   * Placas que SÍ pertenecen al servicio/ubicación activo. Si se provee, el
   * resumen cuenta cuántas placas importadas quedan FUERA de esa lista
   * ("Novedades": bienes de otro servicio u otra ubicación). Opcional.
   */
  placasDelServicio?: Set<string>
}

type TabCarga = 'texto' | 'excel'

interface FilaExcel {
  placa: string
  usuario: string
  nota: string
  /** Estado del bien: '' = normal (B); 'M' = para baja. */
  estado: string
}

/** Desglose de lo realmente aplicado en una importación (para el resumen). */
interface DesgloseImportacion {
  agregados: number
  buenos: number
  paraBaja: number
  conNota: number
  conUsuarioNombre: number
  soloCedula: number
  sinUsuario: number
  /** Nº de placas que NO pertenecen al servicio/ubicación activo (novedades). */
  novedades: number
  /** ¿Se evaluó la pertenencia? (hay lista de placas del servicio). */
  evaluaNovedades: boolean
}

/**
 * Interpreta la columna "usuario" del Excel para asignar el custodio del bien.
 * Formatos admitidos:
 *   "JUAN PEREZ - 1234567"  → { nombre: "JUAN PEREZ", cedula: "1234567" }
 *   "1234567"               → { cedula: "1234567" }
 *   "JUAN PEREZ"            → { nombre: "JUAN PEREZ" }
 */
function parsearUsuarioExcel(valor: string): { nombre: string; cedula: string } {
  const v = (valor || '').trim()
  if (!v) return { nombre: '', cedula: '' }
  // "NOMBRE - CC" (o cualquier separador guión).
  const conGuion = v.match(/^(.*?)[-–]\s*(\d{4,})\s*$/)
  if (conGuion) {
    return { nombre: conGuion[1].trim(), cedula: conGuion[2].trim() }
  }
  // Solo dígitos → cédula.
  if (/^\d{4,}$/.test(v)) return { nombre: '', cedula: v }
  // Solo texto → nombre.
  return { nombre: v, cedula: '' }
}

export default function ModalCargaMasiva({
  isOpen,
  onClose,
  bienesYaEscaneados,
  onBienesAgregados,
  onSuccess,
  onWarning,
  onError,
  placasDelServicio,
}: ModalCargaMasivaProps) {
  const [tab, setTab] = useState<TabCarga>('texto')

  // ─── Estado tab Texto ────────────────────────────────────────────────────
  const [texto, setTexto] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoCargaMasiva | null>(null)

  // ─── Estado tab Excel ────────────────────────────────────────────────────
  const [filasExcel, setFilasExcel] = useState<FilaExcel[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [procesandoExcel, setProcesandoExcel] = useState(false)
  const [resultadoExcel, setResultadoExcel] = useState<ResultadoCargaMasiva | null>(null)
  // Desglose de lo realmente aplicado desde el Excel (para el resumen detallado).
  const [desgloseExcel, setDesgloseExcel] = useState<DesgloseImportacion | null>(null)
  const inputFileRef = useRef<HTMLInputElement>(null)

  // ─── Atajos de teclado: Escape para cerrar, Ctrl+Enter para cargar ──────
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        // Disparar el botón Cargar según la tab activa
        const btn = document.querySelector('[data-action="cargar-masivo"]') as HTMLButtonElement
        if (btn && !btn.disabled) btn.click()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const placasDetectadas = texto.trim() ? parsearPlacas(texto).length : 0

  // ─── Handlers tab Texto ──────────────────────────────────────────────────
  const handleProcesar = async () => {
    if (!texto.trim()) {
      onWarning?.('Pegue o escriba al menos una placa')
      return
    }

    setProcesando(true)
    setResultado(null)

    try {
      const res = await procesarCargaMasiva(texto, bienesYaEscaneados)

      if (res.totalAgregadas > 0) {
        onBienesAgregados(res.bienesAgregados)
        onSuccess?.(`${res.totalAgregadas} bienes cargados exitosamente`)
      }
      // SIEMPRE mostrar el resumen sin cerrar; limpiar el texto ya procesado.
      setResultado(res)
      setTexto('')
      if (res.totalAgregadas === 0 && res.placasDuplicadas.length > 0 && res.placasYaReportadas.length === 0 && res.placasNoEncontradas.length === 0) {
        onWarning?.('Todas las placas ya están en la sesión actual')
      }
    } catch (err: any) {
      onError?.(err.message || 'Error procesando carga masiva')
    } finally {
      setProcesando(false)
    }
  }

  // ─── Handlers tab Excel ──────────────────────────────────────────────────
  const handleImportarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setNombreArchivo(file.name)
    setResultadoExcel(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' })

        // Mapear columnas flexiblemente
        const filas: FilaExcel[] = jsonData.map((row: any) => {
          const placa = String(row['placa'] || row['PLACA'] || row['Placa'] || row['codigo'] || row['CODIGO'] || Object.values(row)[0] || '').trim()
          const usuario = String(row['usuario'] || row['USUARIO'] || row['Usuario'] || row['nombre'] || row['NOMBRE'] || row['Nombre'] || row['cc'] || row['CC'] || row['cedula'] || row['CEDULA'] || Object.values(row)[1] || '').trim()
          const nota = String(row['nota'] || row['NOTA'] || row['Nota'] || row['observacion'] || row['OBSERVACION'] || row['Observacion'] || row['motivo'] || row['MOTIVO'] || row['Motivo'] || '').trim()
          // Columna estado: vacío = normal; 'M' (en cualquier caja) = para baja.
          const estadoRaw = String(row['estado'] || row['ESTADO'] || row['Estado'] || '').trim().toUpperCase()
          const estado = estadoRaw === 'M' ? 'M' : ''
          return { placa, usuario, nota, estado }
        }).filter((f: FilaExcel) => f.placa.length > 0)

        setFilasExcel(filas)
        if (filas.length === 0) {
          onWarning?.('No se encontraron placas en el archivo')
        }
      } catch {
        onError?.('Error al leer el archivo Excel')
        setFilasExcel([])
      }
    }
    reader.readAsArrayBuffer(file)
    // Reset input para permitir re-seleccionar el mismo archivo
    e.target.value = ''
  }

  const handleCargarExcel = async () => {
    if (filasExcel.length === 0) return

    // La NOTA solo es obligatoria para los bienes marcados 'M' (es el motivo de
    // la baja). Para los bienes normales (estado vacío = Bueno) la nota es
    // opcional. Bloquear únicamente si hay filas 'M' sin motivo.
    const mSinMotivo = filasExcel.filter(f => f.estado === 'M' && !f.nota.trim())
    if (mSinMotivo.length > 0) {
      onError?.(`Los bienes en estado M requieren el motivo de la baja en la columna "nota". ${mSinMotivo.length} fila(s) sin motivo: ${mSinMotivo.slice(0, 5).map(f => f.placa).join(', ')}${mSinMotivo.length > 5 ? '…' : ''}`)
      return
    }

    setProcesandoExcel(true)
    setResultadoExcel(null)

    try {
      // Construir texto de placas para reusar el servicio existente
      const textoPlacas = filasExcel.map(f => f.placa).join('\n')
      const res = await procesarCargaMasiva(textoPlacas, bienesYaEscaneados)

      // Resolver NOMBRE por cédula: cuando el Excel trae en "usuario" solo una
      // cédula (sin nombre), buscamos esa persona en TERCEROS para completar el
      // nombre del custodio. Así el modal de custodio muestra nombre + cédula sin
      // obligar a escribir el nombre en el Excel. Se consultan en paralelo solo
      // las cédulas únicas que lo necesiten.
      const cedulasAResolver = Array.from(new Set(
        filasExcel
          .map(f => parsearUsuarioExcel(f.usuario || ''))
          .filter(p => p.cedula && !p.nombre)
          .map(p => p.cedula)
      ))
      const nombrePorCedula = new Map<string, string>()
      await Promise.all(cedulasAResolver.map(async (ced) => {
        try {
          const resultados = await buscarTerceroPorNombreOCedula(ced)
          const match = resultados.find(r => r.cedula === ced) || resultados[0]
          if (match?.nombre) nombrePorCedula.set(ced, match.nombre)
        } catch { /* si falla, se queda sin nombre (solo cédula) */ }
      }))

      // Enriquecer bienes agregados con la NOTA, el USUARIO y el ESTADO del Excel.
      const mapaNotas = new Map(filasExcel.map(f => [f.placa.toUpperCase(), f]))
      const bienesEnriquecidos = res.bienesAgregados.map(b => {
        const fila = mapaNotas.get(b.placa.toUpperCase())
        if (!fila) return b
        const extra: any = { ...b }
        // Nota del Excel → nota del bien (o motivo de la baja si el estado es M).
        if (fila.nota) extra.nota_excel = fila.nota
        // Estado del Excel: 'M' marca el bien para baja al importar.
        if (fila.estado === 'M') extra.estado_excel = 'M'
        // Usuario del Excel → custodio del bien. Admite "NOMBRE - CC", solo CC
        // (dígitos) o solo nombre. Se marca `custodio_desde_excel` para que el
        // consumidor sepa que este custodio LO DEFINIÓ EL EXCEL (no es el
        // responsable por defecto), y no lo pise con la persona presente.
        const u = (fila.usuario || '').trim()
        if (u) {
          const parsed = parsearUsuarioExcel(u)
          // Si vino solo cédula, usar el nombre resuelto desde TERCEROS (si se halló).
          const nombreResuelto = parsed.nombre || (parsed.cedula ? (nombrePorCedula.get(parsed.cedula) || '') : '')
          extra.custodio_nombre = nombreResuelto
          extra.custodio_cedula = parsed.cedula || ''
          extra.custodio_desde_excel = true
        }
        return extra
      })

      if (res.totalAgregadas > 0) {
        onBienesAgregados(bienesEnriquecidos)
        onSuccess?.(`${res.totalAgregadas} bienes cargados desde Excel`)
      }

      // Desglose de lo realmente aplicado (estado, nota, usuario) para un
      // resumen claro de qué entró y cómo.
      const desglose: DesgloseImportacion = {
        agregados: bienesEnriquecidos.length,
        buenos: 0, paraBaja: 0, conNota: 0, conUsuarioNombre: 0, soloCedula: 0, sinUsuario: 0,
        novedades: 0, evaluaNovedades: !!placasDelServicio,
      }
      for (const b of bienesEnriquecidos) {
        const bx = b as any
        if (bx.estado_excel === 'M') desglose.paraBaja++
        else desglose.buenos++
        if (bx.nota_excel) desglose.conNota++
        if (bx.custodio_nombre) desglose.conUsuarioNombre++
        else if (bx.custodio_cedula) desglose.soloCedula++
        else desglose.sinUsuario++
        // Novedad: la placa NO está en la lista base del servicio/ubicación.
        if (placasDelServicio && !placasDelServicio.has((bx.placa || '').toUpperCase())) desglose.novedades++
      }
      setDesgloseExcel(desglose)

      // SIEMPRE mostrar el resumen (agregadas / duplicadas / ya reportadas / no
      // encontradas) sin cerrar el modal, para que el usuario sepa qué pasó. El
      // modal se cierra con el botón "Cerrar". Se limpian las filas ya cargadas
      // para no re-importarlas si vuelve a pulsar "Cargar".
      setResultadoExcel(res)
      setFilasExcel([])
      if (res.totalAgregadas === 0 && res.placasDuplicadas.length > 0) {
        onWarning?.('Todas las placas del Excel ya están en la sesión')
      }
    } catch (err: any) {
      onError?.(err.message || 'Error procesando Excel')
    } finally {
      setProcesandoExcel(false)
    }
  }

  const handleExportarExcel = () => {
    // Exportar bienes ya escaneados con placa, usuario (nombre - CC), nota
    const datos = bienesYaEscaneados.map(b => ({
      placa: b.placa,
      usuario: b.nombre_responsable ? `${b.nombre_responsable}${b.cedula_responsable ? ` - ${b.cedula_responsable}` : ''}` : (b.cedula_responsable || ''),
      estado: (b as any).estado === 'M' ? 'M' : '',
      nota: (b as any).nota_excel || '',
    }))

    const ws = XLSX.utils.json_to_sheet(datos, { header: ['placa', 'usuario', 'estado', 'nota'] })
    // Anchos de columna
    ws['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 8 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, `inventario_bienes_${new Date().toISOString().slice(0, 10)}.xlsx`)
    onSuccess?.(`Excel exportado con ${datos.length} bienes`)
  }

  const handleDescargarPlantilla = () => {
    // estado: vacío = normal; 'M' = para baja (y la nota es el motivo de baja).
    // nota es OBLIGATORIA para todas las filas.
    const datos = [
      { placa: '2003897', usuario: 'JUAN PEREZ - 1234567', estado: '', nota: 'Bien en buen estado' },
      { placa: '2003898', usuario: '9876543', estado: 'M', nota: 'Equipo dañado, no reparable' },
      { placa: 'AANF681', usuario: 'MARIA LOPEZ', estado: '', nota: 'Sin serial visible' },
    ]
    const ws = XLSX.utils.json_to_sheet(datos, { header: ['placa', 'usuario', 'estado', 'nota'] })
    ws['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 8 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, 'plantilla_carga_masiva.xlsx')
  }

  const handleCerrar = () => {
    setTexto('')
    setResultado(null)
    setFilasExcel([])
    setNombreArchivo('')
    setResultadoExcel(null)
    setDesgloseExcel(null)
    onClose()
  }

  return (
    <div className="cm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) handleCerrar() }}>
      <div className="cm-modal">

        {/* Header */}
        <div className="cm-header">
          <div className="cm-header__icon"><FaLayerGroup /></div>
          <div className="cm-header__texts">
            <h5 className="cm-header__title">Carga masiva</h5>
            <p className="cm-header__sub">Importe múltiples placas de una vez</p>
          </div>
          <button className="cm-close" onClick={handleCerrar} aria-label="Cerrar" type="button">×</button>
        </div>

        {/* Tabs segmentados */}
        <div className="cm-tabs">
          <button
            type="button"
            className={`cm-tab${tab === 'texto' ? ' is-active' : ''}`}
            onClick={() => setTab('texto')}
          >
            <FaFileLines size={13} /> Texto
          </button>
          <button
            type="button"
            className={`cm-tab cm-tab--excel${tab === 'excel' ? ' is-active' : ''}`}
            onClick={() => setTab('excel')}
          >
            <FaFileExcel size={13} /> Excel
          </button>
        </div>

        {/* Body */}
        <div className="cm-body">

          {/* ═══ TAB TEXTO ═══ */}
          {tab === 'texto' && (
            <>
              <div className="cm-help">
                <FaFileLines className="cm-help__icon" size={14} />
                <span>Pegue las placas separadas por <strong>comas</strong>, <strong>saltos de línea</strong>, <strong>espacios</strong> o <strong>punto y coma</strong>.</span>
              </div>

              <textarea
                className="cm-textarea"
                value={texto}
                onChange={(e) => { setTexto(e.target.value); setResultado(null) }}
                placeholder={"2003897, 2003898, AANF681\n2003899\n2003900\n..."}
                rows={6}
                disabled={procesando}
                autoFocus
              />

              <div className="cm-textarea-foot">
                <span className={`cm-count${placasDetectadas > 0 ? ' is-active' : ''}`}>
                  {placasDetectadas > 0 ? `${placasDetectadas} placa${placasDetectadas > 1 ? 's' : ''} detectada${placasDetectadas > 1 ? 's' : ''}` : 'Pegue las placas arriba'}
                </span>
                {texto.trim() && (
                  <button className="cm-link-danger" onClick={() => { setTexto(''); setResultado(null) }} disabled={procesando} type="button">
                    Limpiar
                  </button>
                )}
              </div>

              {resultado && <ResultadoCarga resultado={resultado} />}
            </>
          )}

          {/* ═══ TAB EXCEL ═══ */}
          {tab === 'excel' && (
            <>
              <div className="cm-help cm-help--excel">
                <FaFileExcel className="cm-help__icon" size={14} />
                <span>Columnas: <strong>placa</strong>, <strong>usuario</strong>, <strong>estado</strong> (vacío = Bueno, <strong>M</strong> = para baja) y <strong>nota</strong> (opcional; <strong>obligatoria solo si el estado es M</strong>, donde es el motivo de la baja).</span>
              </div>

              <div className="cm-excel-actions">
                <button className="cm-btn cm-btn--import" onClick={() => inputFileRef.current?.click()} disabled={procesandoExcel} type="button">
                  <FaFileArrowUp size={13} /> Importar
                </button>
                <button className="cm-btn cm-btn--export" onClick={handleExportarExcel} disabled={bienesYaEscaneados.length === 0} type="button">
                  <FaFileArrowDown size={13} /> Exportar ({bienesYaEscaneados.length})
                </button>
                <button className="cm-btn cm-btn--ghost" onClick={handleDescargarPlantilla} type="button">
                  <FaFileLines size={13} /> Plantilla
                </button>
              </div>

              <input ref={inputFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportarExcel} style={{ display: 'none' }} />

              {nombreArchivo && (
                <div className="cm-file">
                  <FaFileExcel className="cm-file__icon" size={15} />
                  <span className="cm-file__name">{nombreArchivo}</span>
                  <span className="cm-file__rows">{filasExcel.length} fila{filasExcel.length !== 1 ? 's' : ''}</span>
                  <button className="cm-file__del" onClick={() => { setFilasExcel([]); setNombreArchivo(''); setResultadoExcel(null) }} type="button" aria-label="Quitar archivo">×</button>
                </div>
              )}

              {filasExcel.length > 0 && (
                <div className="cm-preview">
                  <div className="cm-preview__scroll">
                    <table className="cm-table">
                      <thead>
                        <tr>
                          <th className="cm-table__idx">#</th>
                          <th>Placa</th>
                          <th>Usuario</th>
                          <th>Estado</th>
                          <th>Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasExcel.slice(0, 50).map((f, i) => (
                          <tr key={i}>
                            <td className="cm-table__idx">{i + 1}</td>
                            <td className="cm-table__placa">{f.placa}</td>
                            <td>{f.usuario || '–'}</td>
                            <td>{f.estado === 'M' ? <span style={{ color: '#dc2626', fontWeight: 700 }}>M · baja</span> : <span style={{ color: '#15803d', fontWeight: 700 }}>B</span>}</td>
                            <td style={f.estado === 'M' && !f.nota.trim() ? { color: '#dc2626' } : undefined}>
                              {f.nota || (f.estado === 'M' ? '⚠ falta motivo' : '–')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filasExcel.length > 50 && (
                    <p className="cm-preview__more">Mostrando 50 de {filasExcel.length}</p>
                  )}
                </div>
              )}

              {resultadoExcel && <ResultadoCarga resultado={resultadoExcel} desglose={desgloseExcel} />}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="cm-footer">
          <button className="cm-footer__btn cm-footer__btn--cancel" onClick={handleCerrar} type="button">
            Cerrar
          </button>

          {tab === 'texto' && (
            <button
              className="cm-footer__btn cm-footer__btn--primary"
              onClick={handleProcesar}
              disabled={procesando || placasDetectadas === 0}
              data-action="cargar-masivo"
              type="button"
            >
              <FaLayerGroup size={13} /> {procesando ? 'Procesando…' : `Cargar${placasDetectadas > 0 ? ` (${placasDetectadas})` : ''}`}
            </button>
          )}

          {tab === 'excel' && (
            <button
              className="cm-footer__btn cm-footer__btn--excel"
              onClick={handleCargarExcel}
              disabled={procesandoExcel || filasExcel.length === 0}
              data-action="cargar-masivo"
              type="button"
            >
              <FaFileExcel size={13} /> {procesandoExcel ? 'Procesando…' : `Cargar${filasExcel.length > 0 ? ` (${filasExcel.length})` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Componente reutilizable para mostrar resultado de carga */
function ResultadoCarga({ resultado, desglose }: { resultado: ResultadoCargaMasiva; desglose?: DesgloseImportacion | null }) {
  const ok = resultado.totalAgregadas > 0
  const hayDescartadas = resultado.placasDuplicadas.length > 0 || resultado.placasYaReportadas.length > 0 || resultado.placasNoEncontradas.length > 0
  return (
    <div className="cm-res">
      <div className={`cm-res__head${ok ? ' is-ok' : ' is-warn'}`}>
        {ok ? <FaCircleCheck size={15} /> : <FaTriangleExclamation size={15} />}
        <span>
          {ok
            ? `${resultado.totalAgregadas} de ${resultado.totalEnviadas} agregadas`
            : 'No se agregaron placas'}
        </span>
      </div>

      {/* Resumen detallado de lo que entró, en tarjetas por sección. */}
      {desglose && desglose.agregados > 0 && (
        <div className="cm-resumen">
          <div className="cm-resumen__titulo">
            <FaLayerGroup size={13} />
            <span>Resumen de la importación</span>
            <span className="cm-resumen__total">{desglose.agregados}</span>
          </div>

          {/* Estado del bien */}
          <div className="cm-resumen__grupo">
            <span className="cm-resumen__grupo-label">Estado del bien</span>
            <div className="cm-resumen__cards">
              <div className="cm-resumen__card cm-resumen__card--ok">
                <span className="cm-resumen__card-num">{desglose.buenos}</span>
                <span className="cm-resumen__card-lbl">Buenos</span>
              </div>
              <div className={`cm-resumen__card cm-resumen__card--baja${desglose.paraBaja === 0 ? ' is-cero' : ''}`}>
                <span className="cm-resumen__card-num">{desglose.paraBaja}</span>
                <span className="cm-resumen__card-lbl">Para baja (M)</span>
              </div>
              <div className="cm-resumen__card cm-resumen__card--nota">
                <span className="cm-resumen__card-num">{desglose.conNota}</span>
                <span className="cm-resumen__card-lbl">Con nota</span>
              </div>
            </div>
          </div>

          {/* Usuario (custodio) */}
          <div className="cm-resumen__grupo">
            <span className="cm-resumen__grupo-label">Usuario (custodio)</span>
            <div className="cm-resumen__cards cm-resumen__cards--2">
              <div className="cm-resumen__card cm-resumen__card--user">
                <span className="cm-resumen__card-num">{desglose.conUsuarioNombre + desglose.soloCedula}</span>
                <span className="cm-resumen__card-lbl">Con usuario</span>
              </div>
              <div className={`cm-resumen__card cm-resumen__card--gray${desglose.sinUsuario === 0 ? ' is-cero' : ''}`}>
                <span className="cm-resumen__card-num">{desglose.sinUsuario}</span>
                <span className="cm-resumen__card-lbl">Sin usuario</span>
              </div>
            </div>
          </div>

          {/* Pertenencia: bienes de otro servicio/ubicación (novedades). */}
          {desglose.evaluaNovedades && (
            <div className="cm-resumen__grupo">
              <span className="cm-resumen__grupo-label">Pertenencia</span>
              <div className="cm-resumen__cards cm-resumen__cards--2">
                <div className="cm-resumen__card cm-resumen__card--ok">
                  <span className="cm-resumen__card-num">{desglose.agregados - desglose.novedades}</span>
                  <span className="cm-resumen__card-lbl">De este servicio</span>
                </div>
                <div className={`cm-resumen__card cm-resumen__card--novedad${desglose.novedades === 0 ? ' is-cero' : ''}`}>
                  <span className="cm-resumen__card-num">{desglose.novedades}</span>
                  <span className="cm-resumen__card-lbl">Novedades</span>
                </div>
              </div>
              {desglose.novedades > 0 && (
                <p className="cm-resumen__nota-novedad">
                  {desglose.novedades} bien(es) no pertenecen al servicio/ubicación actual (otro servicio u otra ubicación).
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {hayDescartadas && (
        <div className="cm-res__body">
          {resultado.placasDuplicadas.length > 0 && (
            <div className="cm-res__line">
              <span className="cm-res__dot cm-res__dot--warn" />
              <span><strong>{resultado.placasDuplicadas.length}</strong> ya estaban en esta sesión</span>
            </div>
          )}
          {resultado.placasYaReportadas.length > 0 && (
            <div className="cm-res__line">
              <span className="cm-res__dot cm-res__dot--gray" />
              <span><strong>{resultado.placasYaReportadas.length}</strong> ya reportadas en inventarios anteriores</span>
            </div>
          )}
          {resultado.placasNoEncontradas.length > 0 && (
            <div>
              <div className="cm-res__line">
                <span className="cm-res__dot cm-res__dot--danger" />
                <span><strong>{resultado.placasNoEncontradas.length}</strong> no encontradas en el sistema:</span>
              </div>
              <div className="cm-res__placas">{resultado.placasNoEncontradas.join(', ')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
