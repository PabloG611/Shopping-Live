import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { FaFileExcel, FaXmark, FaLayerGroup, FaCircleCheck } from 'react-icons/fa6'
import type { BienInventariado } from '../../services/controlSeguimientoService'
import { categorizarBien, labelCategoria } from '../../services/controlSeguimientoService'

/**
 * Modal para exportar los bienes inventariados a un archivo Excel (.xlsx).
 * El usuario selecciona TODOS o ALGUNOS servicios y se descarga UNA SOLA HOJA.
 *
 * Columnas: Servicio, Inventario, Fecha, Realizado por 1, Realizado por 2,
 * Placa, Descripción, Serial, Responsable, Cédula, Estado, Tipo, Fecha lectura.
 */

interface ModalExcelControlProps {
  isOpen: boolean
  onClose: () => void
  bienes: BienInventariado[]
  onSuccess: (mensaje: string) => void
  onError: (mensaje: string) => void
}

export default function ModalExcelControl({ isOpen, onClose, bienes, onSuccess, onError }: ModalExcelControlProps) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [generando, setGenerando] = useState(false)

  const servicios = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const b of bienes) {
      const svc = (b.sesion_servicio || b.sesion_nombre || 'Sin servicio').trim()
      mapa.set(svc, (mapa.get(svc) ?? 0) + 1)
    }
    return Array.from(mapa.entries())
      .map(([codigo, cantidad]) => ({ codigo, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
  }, [bienes])

  useEffect(() => {
    if (isOpen) setSeleccionados(new Set(servicios.map(s => s.codigo)))
  }, [isOpen, servicios])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !generando) onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, generando, onClose])

  if (!isOpen) return null

  const toggle = (codigo: string) => {
    setSeleccionados(prev => {
      const n = new Set(prev)
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo)
      return n
    })
  }

  const todosSeleccionados = seleccionados.size === servicios.length && servicios.length > 0

  const toggleTodos = () => {
    if (todosSeleccionados) setSeleccionados(new Set())
    else setSeleccionados(new Set(servicios.map(s => s.codigo)))
  }

  const bienesSeleccionados = bienes.filter(b => {
    const svc = (b.sesion_servicio || b.sesion_nombre || 'Sin servicio').trim()
    return seleccionados.has(svc)
  })

  const handleExportar = () => {
    if (bienesSeleccionados.length === 0) { onError('No hay bienes para exportar con esa selección.'); return }
    setGenerando(true)
    try {
      const filas = bienesSeleccionados.map(b => ({
        'Servicio': b.sesion_servicio || '',
        'Inventario': b.sesion_nombre || '',
        'Fecha': b.sesion_fecha || '',
        'Realizado por 1': [b.sesion_colaborador1_nombre, b.sesion_colaborador1_cargo].filter(Boolean).join(' · '),
        'Realizado por 2': [b.sesion_colaborador2_nombre, b.sesion_colaborador2_cargo].filter(Boolean).join(' · '),
        'Placa': b.placa || '',
        'Descripción': b.descripcion || '',
        'Serial': b.serial || '',
        'Responsable': b.responsable || '',
        'Cédula': b.cedula || '',
        'Estado': b.estado_bien || b.estado || 'B',
        'Tipo': labelCategoria(categorizarBien(b.placa)),
        'Fecha lectura': b.fecha_lectura || '',
      }))

      const ws = XLSX.utils.json_to_sheet(filas)
      ws['!cols'] = [
        { wch: 16 }, { wch: 34 }, { wch: 12 }, { wch: 26 }, { wch: 26 },
        { wch: 12 }, { wch: 38 }, { wch: 16 }, { wch: 26 }, { wch: 14 },
        { wch: 8 }, { wch: 12 }, { wch: 18 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Control inventario')
      const fecha = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `control-inventario-${fecha}.xlsx`)
      onSuccess(`Excel exportado: ${filas.length} bienes de ${seleccionados.size} servicio(s).`)
      onClose()
    } catch (err: any) {
      onError(err?.message || 'Error exportando a Excel')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="gi-excel-overlay" onClick={generando ? undefined : onClose}>
      <div className="gi-excel-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header con acento Excel */}
        <div className="gi-excel-header">
          <div className="gi-excel-header__icon"><FaFileExcel size={22} /></div>
          <div className="gi-excel-header__texto">
            <h5 className="gi-excel-header__titulo">Exportar a Excel</h5>
            <p className="gi-excel-header__sub">Elige los servicios a incluir en el archivo</p>
          </div>
          <button className="gi-excel-header__close" onClick={onClose} disabled={generando} aria-label="Cerrar"><FaXmark size={16} /></button>
        </div>

        {/* Resumen de la selección */}
        <div className="gi-excel-stats">
          <div className="gi-excel-stat">
            <span className="gi-excel-stat__num">{seleccionados.size}</span>
            <span className="gi-excel-stat__lbl">de {servicios.length} servicios</span>
          </div>
          <div className="gi-excel-stat gi-excel-stat--verde">
            <span className="gi-excel-stat__num">{bienesSeleccionados.length.toLocaleString()}</span>
            <span className="gi-excel-stat__lbl">bienes a exportar</span>
          </div>
        </div>

        {/* Body: lista de servicios */}
        <div className="gi-excel-body">
          <div className="gi-excel-toolbar">
            <span className="gi-excel-toolbar__title">Servicios</span>
            <button type="button" onClick={toggleTodos} className={`gi-excel-selall${todosSeleccionados ? ' is-on' : ''}`}>
              {todosSeleccionados ? <><FaCircleCheck size={12} /> Todos seleccionados</> : 'Seleccionar todos'}
            </button>
          </div>

          {servicios.length === 0 ? (
            <p className="gi-excel-empty">No hay servicios con bienes para exportar.</p>
          ) : (
            <div className="gi-excel-lista">
              {servicios.map(s => {
                const activo = seleccionados.has(s.codigo)
                return (
                  <label key={s.codigo} className={`gi-excel-item${activo ? ' is-active' : ''}`}>
                    <span className={`gi-excel-item__check${activo ? ' is-on' : ''}`}>
                      {activo && <FaCircleCheck size={16} />}
                    </span>
                    <span className="gi-excel-item__icon"><FaLayerGroup size={14} /></span>
                    <span className="gi-excel-item__nombre">{s.codigo}</span>
                    <span className="gi-excel-item__badge">{s.cantidad} bienes</span>
                    <input type="checkbox" checked={activo} onChange={() => toggle(s.codigo)} style={{ display: 'none' }} />
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="gi-excel-footer">
          <button className="gi-excel-btn gi-excel-btn--cancel" onClick={onClose} disabled={generando}>Cancelar</button>
          <button className="gi-excel-btn gi-excel-btn--go" onClick={handleExportar} disabled={generando || seleccionados.size === 0}>
            <FaFileExcel size={14} /> {generando ? 'Exportando...' : `Exportar ${bienesSeleccionados.length} bienes`}
          </button>
        </div>
      </div>
    </div>
  )
}
