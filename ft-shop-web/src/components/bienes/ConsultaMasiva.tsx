import { useState } from 'react'
import { FaFileExcel, FaTrashAlt, FaSearch, FaUserSlash, FaBoxOpen, FaUsers } from 'react-icons/fa'
import * as XLSX from 'xlsx'

import { consultarBienesMasivo, type ResultadoConsultaMasiva } from '../../services/consultaBienesService'
import { sanitizarCedula } from '../../utils/sanitizarCedula'
import ModalNombreExcel from '../common/ModalNombreExcel'

import './ConsultaMasiva.css'

interface Props {
  onError: (msg: string) => void
  onWarning?: (msg: string) => void
}

export function ConsultaMasiva({ onError, onWarning }: Props) {
  const [cedulasTexto, setCedulasTexto] = useState('')
  const [resultados, setResultados] = useState<ResultadoConsultaMasiva[]>([])
  const [cargando, setCargando] = useState(false)
  const [progreso, setProgreso] = useState({ completadas: 0, total: 0 })
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const [modalExcelAbierto, setModalExcelAbierto] = useState(false)

  const parsearCedulas = (texto: string): string[] => {
    // Soporta separadores: salto de línea, coma, punto y coma, tabulación, espacio
    const partes = texto.split(/[\n,;\t\s]+/).filter(Boolean)
    const unicas = new Set<string>()
    for (const p of partes) {
      const limpia = sanitizarCedula(p)
      if (limpia) unicas.add(limpia)
    }
    return Array.from(unicas)
  }

  /** Solo permite números y separadores (saltos de línea, comas, espacios) */
  const filtrarEntrada = (valor: string): string => {
    return valor.replace(/[^0-9\n,;\s]/g, '')
  }

  const consultar = async () => {
    const cedulas = parsearCedulas(cedulasTexto)
    if (cedulas.length === 0) {
      onError('Ingrese al menos una cédula válida.')
      return
    }
    if (cedulas.length > 100) {
      onError('Máximo 100 cédulas por consulta masiva.')
      return
    }

    setCargando(true)
    setResultados([])
    setProgreso({ completadas: 0, total: cedulas.length })
    setExpandidas(new Set())

    try {
      const res = await consultarBienesMasivo(cedulas, (completadas, total) => {
        setProgreso({ completadas, total })
      })
      setResultados(res)
      const conBienes = res.filter(r => r.bienesNormal.length > 0 || r.bienesFloresta.length > 0)
      if (conBienes.length === 0) {
        onWarning?.('Ninguna de las cédulas consultadas tiene bienes asociados.')
      }
    } catch {
      onError('Error al realizar la consulta masiva.')
    } finally {
      setCargando(false)
    }
  }

  const exportarExcel = (nombreArchivo: string) => {
    if (resultados.length === 0) return

    // Determinar el estado correcto de un bien (misma lógica que BienesTable)
    const obtenerEstado = (b: { pendienteInventario?: boolean; ultimoPrefijo?: string }): string => {
      if (b.ultimoPrefijo === 'BJ') return 'BJ - Proceso de Baja'
      if (b.ultimoPrefijo === 'CB') return 'CB - Baja Confirmada'
      if (b.pendienteInventario) return 'Faltante'
      return 'Inventariado'
    }

    // Construir datos directamente como array 2D (más fiable que objeto intermedio)
    const encabezados = ['#', 'Cédula', 'Responsable', 'Clasificación', 'Placa', 'Descripción', 'Serial', 'Dependencia', 'Estado']
    const datosSheet: (string | number)[][] = [encabezados]
    let contadorFila = 0

    for (const r of resultados) {
      const nombre = r.persona?.nombreCompleto ?? ''
      const cc = r.cedula
      const totalBienesPersona = r.bienesNormal.length + r.bienesFloresta.length

      if (totalBienesPersona === 0) {
        // Persona sin bienes o tercero no creado
        const terceroNoCreado = !r.persona
        contadorFila++
        datosSheet.push([
          contadorFila,
          cc,
          terceroNoCreado ? '*** TERCERO NO CREADO ***' : nombre,
          '',
          '',
          terceroNoCreado
            ? 'La cédula no existe como tercero en el sistema'
            : 'Tercero existe pero no tiene bienes asignados',
          '',
          '',
          terceroNoCreado ? 'NO REGISTRADO' : 'SIN BIENES',
        ])
      } else {
        // Exportar TODOS los bienes UNP
        for (const b of r.bienesNormal) {
          contadorFila++
          datosSheet.push([
            contadorFila,
            cc,
            nombre,
            'UNP',
            b.placa,
            b.descripcion,
            b.serial ?? '',
            b.nombreDependencia ?? '',
            obtenerEstado(b),
          ])
        }

        // Exportar TODOS los bienes Floresta
        for (const b of r.bienesFloresta) {
          contadorFila++
          datosSheet.push([
            contadorFila,
            cc,
            nombre,
            'Floresta',
            b.placa,
            b.descripcion,
            b.serial ?? '',
            b.nombreDependencia ?? '',
            obtenerEstado(b),
          ])
        }
      }

      // Fila separadora entre personas
      datosSheet.push([])
    }

    // Crear hoja principal de datos
    const ws = XLSX.utils.aoa_to_sheet(datosSheet)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Consulta Masiva')

    // Hoja de resumen para verificación cruzada
    const resumenData: (string | number)[][] = [
      ['RESUMEN DE EXPORTACIÓN'],
      [],
      ['Cédula', 'Responsable', 'Bienes UNP', 'Bienes Floresta', 'Total Bienes'],
    ]
    let totalGeneralBienes = 0
    for (const r of resultados) {
      const totalP = r.bienesNormal.length + r.bienesFloresta.length
      totalGeneralBienes += totalP
      resumenData.push([
        r.cedula,
        r.persona?.nombreCompleto ?? (r.persona === null ? 'NO CREADO' : 'Sin nombre'),
        r.bienesNormal.length,
        r.bienesFloresta.length,
        totalP,
      ])
    }
    resumenData.push([])
    resumenData.push(['', '', '', 'TOTAL GENERAL:', totalGeneralBienes])
    resumenData.push(['', '', '', 'Filas de datos exportadas:', contadorFila])

    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

    // Ajustar ancho de columnas en hoja principal
    ws['!cols'] = encabezados.map((_col, idx) => {
      const maxLen = Math.max(
        ...datosSheet.map(row => String(row[idx] ?? '').length),
        String(encabezados[idx]).length,
      )
      return { wch: Math.min(maxLen + 2, 50) }
    })

    // Ajustar ancho de columnas en resumen
    wsResumen['!cols'] = [
      { wch: 15 }, { wch: 35 }, { wch: 12 }, { wch: 15 }, { wch: 12 },
    ]

    XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
  }

  // Nombre por defecto sugerido para el archivo
  const nombreExcelPorDefecto = `consulta_masiva_bienes_${new Date().toISOString().slice(0, 10)}`

  const toggleExpandida = (cedula: string) => {
    setExpandidas(prev => {
      const copia = new Set(prev)
      if (copia.has(cedula)) copia.delete(cedula)
      else copia.add(cedula)
      return copia
    })
  }

  const limpiar = () => {
    setCedulasTexto('')
    setResultados([])
    setExpandidas(new Set())
  }

  const cedulasParsed = parsearCedulas(cedulasTexto)
  const totalBienes = resultados.reduce((s, r) => s + r.bienesNormal.length + r.bienesFloresta.length, 0)
  const tercerosNoCreados = resultados.filter(r => !r.persona).length
  const sinBienes = resultados.filter(r => r.persona && r.bienesNormal.length === 0 && r.bienesFloresta.length === 0).length
  const conBienes = resultados.filter(r => r.bienesNormal.length > 0 || r.bienesFloresta.length > 0).length

  return (
    <div className="consulta-masiva">
      {/* Zona de entrada */}
      {resultados.length === 0 && (
        <div className="consulta-masiva__entrada">
          <div className="consulta-masiva__entrada-card">
            <div className="consulta-masiva__entrada-icono">
              <FaUsers style={{ fontSize: '1.5rem', color: '#365072' }} />
            </div>
            <h4 className="consulta-masiva__entrada-titulo">Consulta masiva por cédula</h4>
            <p className="consulta-masiva__instruccion">
              Pegue los números de cédula separados por saltos de línea, comas o espacios.
              Se consultarán los bienes UNP y Floresta de cada persona.
            </p>

            <textarea
              className="consulta-masiva__textarea"
              placeholder={"1234567890\n9876543210\n1122334455"}
              rows={6}
              inputMode="numeric"
              value={cedulasTexto}
              onChange={(e) => setCedulasTexto(filtrarEntrada(e.target.value))}
              onPaste={(e) => {
                e.preventDefault()
                const pegado = e.clipboardData.getData('text')
                setCedulasTexto(prev => filtrarEntrada(prev + pegado))
              }}
              disabled={cargando}
            />

            <div className="consulta-masiva__pie-input">
              <span className="consulta-masiva__contador">
                {cedulasParsed.length > 0
                  ? <><strong>{cedulasParsed.length}</strong> cédula{cedulasParsed.length !== 1 ? 's' : ''} detectada{cedulasParsed.length !== 1 ? 's' : ''} <span className="consulta-masiva__limite">(máx. 100)</span></>
                  : 'Ingrese al menos una cédula'}
              </span>
              <div className="consulta-masiva__pie-acciones">
                {cedulasTexto && (
                  <button
                    type="button"
                    className="consulta-masiva__btn-limpiar"
                    onClick={limpiar}
                    disabled={cargando}
                  >
                    <FaTrashAlt /> Limpiar
                  </button>
                )}
                <button
                  type="button"
                  className="consulta-masiva__btn-consultar"
                  onClick={() => void consultar()}
                  disabled={cargando || cedulasParsed.length === 0}
                >
                  {cargando ? `Consultando…` : <><FaSearch /> Consultar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra de progreso durante consulta */}
      {cargando && progreso.total > 0 && (
        <div className="consulta-masiva__progreso">
          <div className="consulta-masiva__progreso-info">
            <span className="consulta-masiva__progreso-texto">
              Consultando cédulas...
            </span>
            <span className="consulta-masiva__progreso-nums">
              {progreso.completadas} / {progreso.total}
            </span>
          </div>
          <div className="consulta-masiva__progreso-barra">
            <div
              className="consulta-masiva__progreso-fill"
              style={{ width: `${(progreso.completadas / progreso.total) * 100}%` }}
            />
          </div>
          <span className="consulta-masiva__progreso-porcentaje">
            {Math.round((progreso.completadas / progreso.total) * 100)}% completado
          </span>
        </div>
      )}

      {/* Resultados */}
      {resultados.length > 0 && !cargando && (
        <div className="consulta-masiva__resultados">
          <div className="consulta-masiva__resultados-header">
            <div className="consulta-masiva__resumen">
              <div className="consulta-masiva__resumen-stat">
                <span className="consulta-masiva__resumen-num">{resultados.length}</span>
                <span className="consulta-masiva__resumen-label">consultadas</span>
              </div>
              <div className="consulta-masiva__resumen-stat consulta-masiva__resumen-stat--ok">
                <span className="consulta-masiva__resumen-num">{conBienes}</span>
                <span className="consulta-masiva__resumen-label">con bienes</span>
              </div>
              <div className="consulta-masiva__resumen-stat consulta-masiva__resumen-stat--warn">
                <span className="consulta-masiva__resumen-num">{sinBienes}</span>
                <span className="consulta-masiva__resumen-label">sin bienes</span>
              </div>
              <div className="consulta-masiva__resumen-stat consulta-masiva__resumen-stat--error">
                <span className="consulta-masiva__resumen-num">{tercerosNoCreados}</span>
                <span className="consulta-masiva__resumen-label">no creados</span>
              </div>
              <div className="consulta-masiva__resumen-stat">
                <span className="consulta-masiva__resumen-num">{totalBienes}</span>
                <span className="consulta-masiva__resumen-label">bienes total</span>
              </div>
            </div>
            <div className="consulta-masiva__resultados-acciones">
              <button
                type="button"
                className="consulta-masiva__btn-exportar"
                onClick={() => setModalExcelAbierto(true)}
              >
                <FaFileExcel /> Exportar a Excel
              </button>
              <button
                type="button"
                className="consulta-masiva__btn-limpiar"
                onClick={limpiar}
              >
                <FaSearch /> Nueva consulta
              </button>
            </div>
          </div>

          <div className="consulta-masiva__lista">
            {resultados.map((r) => {
              const totalPersona = r.bienesNormal.length + r.bienesFloresta.length
              const expandida = expandidas.has(r.cedula)
              const terceroNoCreado = !r.persona
              return (
                <div key={r.cedula} className={`consulta-masiva__item ${terceroNoCreado ? 'consulta-masiva__item--no-creado' : totalPersona === 0 ? 'consulta-masiva__item--sin-bienes' : ''}`}>
                  <button
                    type="button"
                    className={`consulta-masiva__item-header ${expandida ? 'consulta-masiva__item-header--expandido' : ''}`}
                    onClick={() => totalPersona > 0 && toggleExpandida(r.cedula)}
                    aria-expanded={expandida}
                    style={{ cursor: totalPersona > 0 ? 'pointer' : 'default' }}
                  >
                    <div className="consulta-masiva__item-info">
                      <span className="consulta-masiva__item-nombre">
                        {terceroNoCreado ? (
                          <span className="consulta-masiva__nombre-no-creado">
                            <FaUserSlash style={{ fontSize: '0.8rem' }} /> Tercero no creado
                          </span>
                        ) : r.persona?.nombreCompleto ?? 'Sin nombre'}
                      </span>
                      <span className="consulta-masiva__item-cc">CC {r.cedula}</span>
                    </div>
                    <div className="consulta-masiva__item-badges">
                      {r.bienesNormal.length > 0 && (
                        <span className="consulta-masiva__badge consulta-masiva__badge--unp">
                          UNP: {r.bienesNormal.length}
                        </span>
                      )}
                      {r.bienesFloresta.length > 0 && (
                        <span className="consulta-masiva__badge consulta-masiva__badge--floresta">
                          Floresta: {r.bienesFloresta.length}
                        </span>
                      )}
                      {totalPersona === 0 && terceroNoCreado && (
                        <span className="consulta-masiva__badge consulta-masiva__badge--no-creado">
                          No registrado
                        </span>
                      )}
                      {totalPersona === 0 && !terceroNoCreado && (
                        <span className="consulta-masiva__badge consulta-masiva__badge--sin-bienes">
                          <FaBoxOpen style={{ fontSize: '0.65rem' }} /> Sin bienes
                        </span>
                      )}
                      {totalPersona > 0 && (
                        <span className="consulta-masiva__item-chevron">{expandida ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </button>

                  {expandida && totalPersona > 0 && (
                    <div className="consulta-masiva__item-detalle">
                      {r.bienesNormal.length > 0 && (
                        <div className="consulta-masiva__seccion">
                          <h4 className="consulta-masiva__seccion-titulo">Bienes UNP ({r.bienesNormal.length})</h4>
                          <table className="consulta-masiva__tabla">
                            <thead>
                              <tr>
                                <th>Placa</th>
                                <th>Descripción</th>
                                <th>Serial</th>
                                <th>Dependencia</th>
                                <th>Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.bienesNormal.filter(b => b.ultimoPrefijo !== 'BJ' && b.ultimoPrefijo !== 'CB').map((b) => (
                                <tr key={b.id}>
                                  <td className="consulta-masiva__td-placa">{b.placa}</td>
                                  <td>{b.descripcion}</td>
                                  <td>{b.serial ?? '—'}</td>
                                  <td>{b.nombreDependencia ?? '—'}</td>
                                  <td>
                                    {b.pendienteInventario
                                      ? <span className="consulta-masiva__estado consulta-masiva__estado--faltante">Faltante</span>
                                      : <span className="consulta-masiva__estado consulta-masiva__estado--ok">Inventariado</span>
                                    }
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {/* Bienes en proceso de baja - separados abajo */}
                          {r.bienesNormal.filter(b => b.ultimoPrefijo === 'BJ' || b.ultimoPrefijo === 'CB').length > 0 && (
                            <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.75rem', background: 'linear-gradient(135deg, #fef2f2 0%, #fff5f5 100%)', borderRadius: '8px', border: '1px solid #fecaca' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem' }}>⚠️</span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                  En proceso de baja ({r.bienesNormal.filter(b => b.ultimoPrefijo === 'BJ' || b.ultimoPrefijo === 'CB').length})
                                </span>
                              </div>
                              <table className="consulta-masiva__tabla" style={{ fontSize: '0.78rem' }}>
                                <tbody>
                                  {r.bienesNormal.filter(b => b.ultimoPrefijo === 'BJ' || b.ultimoPrefijo === 'CB').map((b) => (
                                    <tr key={b.id} style={{ opacity: 0.75 }}>
                                      <td className="consulta-masiva__td-placa">{b.placa}</td>
                                      <td>{b.descripcion}</td>
                                      <td>{b.serial ?? '—'}</td>
                                      <td>{b.nombreDependencia ?? '—'}</td>
                                      <td>
                                        <span className={`consulta-masiva__estado consulta-masiva__estado--${b.ultimoPrefijo === 'CB' ? 'baja-conf' : 'baja'}`}>
                                          {b.ultimoPrefijo === 'CB' ? 'Baja Confirmada' : 'Proceso de Baja'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {r.bienesFloresta.length > 0 && (
                        <div className="consulta-masiva__seccion">
                          <h4 className="consulta-masiva__seccion-titulo">Bienes Floresta ({r.bienesFloresta.length})</h4>
                          <table className="consulta-masiva__tabla">
                            <thead>
                              <tr>
                                <th>Placa</th>
                                <th>Descripción</th>
                                <th>Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.bienesFloresta.map((b) => (
                                <tr key={b.id}>
                                  <td className="consulta-masiva__td-placa">{b.placa}</td>
                                  <td>{b.descripcion}</td>
                                  <td>
                                    {b.pendienteInventario
                                      ? <span className="consulta-masiva__estado consulta-masiva__estado--faltante">Faltante</span>
                                      : <span className="consulta-masiva__estado consulta-masiva__estado--ok">Inventariado</span>
                                    }
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ModalNombreExcel
        isOpen={modalExcelAbierto}
        nombrePorDefecto={nombreExcelPorDefecto}
        onCancelar={() => setModalExcelAbierto(false)}
        onConfirmar={(nombre) => { exportarExcel(nombre); setModalExcelAbierto(false) }}
      />
    </div>
  )
}
