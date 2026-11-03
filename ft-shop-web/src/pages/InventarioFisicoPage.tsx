import { useEffect, useRef, useState } from 'react'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/common/ToastContainer'
import ModalColaboradores from '../components/common/ModalColaboradores'
import type { BienInventario, EstadoBien } from '../services/inventarioFisicoService'
import {
  cargarBienesDesdeStorage,
  consultarBienPorPlaca,
  descargarPDF,
  generarFormatoInventario,
  guardarBienesEnStorage,
  limpiarInventarioStorage,
} from '../services/inventarioFisicoService'

import './ConsultaBienesPage.css'
import './TransferenciaBienesPage.css'
import './InventarioFisicoPage.css'

const LOGO_UNP = '/sg/gag/logo-unp-gris.png'

export default function InventarioFisicoPage() {
  const toast = useToast()
  const [bienes, setBienes] = useState<BienInventario[]>([])
  const [placaInput, setPlacaInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Cargar bienes desde localStorage al montar
  const yaMostroToastRecuperacion = useRef(false)
  useEffect(() => {
    const bienesGuardados = cargarBienesDesdeStorage()
    if (bienesGuardados.length > 0) {
      setBienes(bienesGuardados)
      if (!yaMostroToastRecuperacion.current) {
        yaMostroToastRecuperacion.current = true
        toast.info(`Se recuperaron ${bienesGuardados.length} bienes del inventario anterior`)
      }
    }
  }, [toast])

  // Escanear/buscar bien
  const escanearBien = async (placa: string) => {
    if (!placa.trim()) return

    setLoading(true)
    try {
      // Verificar si ya fue escaneado
      const yaExiste = bienes.some((b) => b.placa === placa.trim())
      if (yaExiste) {
        toast.warning('Este bien ya fue escaneado')
        setPlacaInput('')
        inputRef.current?.focus()
        return
      }

      // Consultar bien en Firebird
      const bien = await consultarBienPorPlaca(placa.trim())

      // Crear objeto de bien
      const nuevoBien: BienInventario = {
        placa: bien.codigo,
        descripcion: bien.desmat || '',
        serial: bien.serial || 'N/A',
        estado: 'B', // Por defecto Bueno
        cedula_responsable: bien.cedulaResponsable || '',
        nombre_responsable: bien.responsable || '',
        ubicacion: bien.dependencia || '',
        timestamp: new Date().toISOString(),
      }

      // Agregar a la lista
      const nuevaLista = [...bienes, nuevoBien]
      setBienes(nuevaLista)

      // Guardar en localStorage
      guardarBienesEnStorage(nuevaLista)

      toast.success(`Bien ${placa} agregado`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `No se encontró el bien con placa ${placa}`)
    } finally {
      setLoading(false)
      setPlacaInput('')
      inputRef.current?.focus()
    }
  }

  // Manejar Enter en input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && placaInput.trim()) {
      e.preventDefault()
      void escanearBien(placaInput)
    }
  }

  // Editar serial
  const editarSerial = (index: number, nuevoSerial: string) => {
    const nuevaLista = [...bienes]
    nuevaLista[index].serial = nuevoSerial
    setBienes(nuevaLista)
    guardarBienesEnStorage(nuevaLista)
  }

  // Editar estado
  const editarEstado = (index: number, nuevoEstado: EstadoBien) => {
    const nuevaLista = [...bienes]
    nuevaLista[index].estado = nuevoEstado
    setBienes(nuevaLista)
    guardarBienesEnStorage(nuevaLista)
  }

  // Eliminar bien
  const eliminarBien = (index: number) => {
    if (confirm('¿Está seguro de eliminar este bien del inventario?')) {
      const nuevaLista = bienes.filter((_, i) => i !== index)
      setBienes(nuevaLista)
      guardarBienesEnStorage(nuevaLista)
      toast.info('Bien eliminado')
    }
  }

  // Limpiar inventario
  const limpiarInventario = () => {
    if (confirm('¿Está seguro de limpiar todos los registros? Esta acción no se puede deshacer.')) {
      setBienes([])
      limpiarInventarioStorage()
      toast.success('Inventario limpiado')
    }
  }

  // Generar formato
  const handleGenerarFormato = async (colaborador1: any, colaborador2: any) => {
    setGenerandoPDF(true)
    try {
      // Obtener sede y ubicación del usuario (puedes ajustar según tu lógica)
      const sede = 'Sede Principal' // TODO: Obtener de sesionUsuario o configuración
      const ubicacion = 'Almacén General' // TODO: Obtener de sesionUsuario o configuración
      
      const resultado = await generarFormatoInventario(colaborador1, colaborador2, bienes, sede, ubicacion)
      const nombreArchivo = `Inventario_Fisico_${new Date().toISOString().split('T')[0]}.pdf`
      descargarPDF(resultado.blob, nombreArchivo)
      toast.success('Formato generado exitosamente')
      setModalOpen(false)
      
      // Opcional: Limpiar inventario después de generar
      // limpiarInventario()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error generando formato')
    } finally {
      setGenerandoPDF(false)
    }
  }

  return (
    <div className="consulta-page consulta-page--resultados transferencia-page">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      
      <div className="consulta-container">
        <header className="consulta-cabecera">
          <img className="consulta-logo consulta-logo--compacto" src={LOGO_UNP} alt="UNP" width={280} height={230} />
          <div className="consulta-cabecera__titulo-vista">
            <p className="consulta-cabecera__titulo-vista-texto">Inventario Físico - Lectura de Códigos de Barras</p>
          </div>
        </header>

        {/* Info */}
        <div className="inventario-info-banner">
          <p>
            Escanee o ingrese el código de barras de cada bien. El sistema verificará automáticamente su estado en las bases de datos.
          </p>
        </div>

        {/* Input de escaneo */}
        <div className="inventario-scanner">
          <div className="inventario-scanner__input-row">
            <label htmlFor="placa-input" className="inventario-scanner__label">
              CÓDIGO DE BARRAS / PLACA <span className="required">*</span>
            </label>
            <input
              id="placa-input"
              ref={inputRef}
              className="inventario-scanner__input"
              type="text"
              value={placaInput}
              onChange={(e) => setPlacaInput(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="ESCANEE O ESCRIBA EL CÓDIGO..."
              autoFocus
              disabled={loading}
            />
            <button 
              className="inventario-scanner__btn-procesar" 
              onClick={() => void escanearBien(placaInput)}
              disabled={loading || !placaInput.trim()}
            >
              {loading ? 'Procesando...' : 'Procesar'}
            </button>
          </div>
        </div>

        {/* Resumen */}
        <div className="inventario-resumen">
          <div className="inventario-resumen__item inventario-resumen__item--total">
            <span className="inventario-resumen__num">{bienes.length}</span>
            <span className="inventario-resumen__label">Bienes procesados</span>
          </div>
        </div>

        {/* Tabla de bienes */}
        {bienes.length > 0 && (
          <div className="inventario-lecturas">
            <div className="inventario-lecturas__header">
              <h4>Bienes procesados ({bienes.length})</h4>
              <div className="inventario-lecturas__actions">
                <button className="btn-danger-outline" onClick={limpiarInventario}>
                  Limpiar registros
                </button>
                <button className="btn-primary" onClick={() => setModalOpen(true)}>
                  Generar Formato de Inventario
                </button>
              </div>
            </div>

            <div className="bienes-table-frame">
              <div className="bienes-table-scroll" style={{ maxHeight: '500px' }}>
                <table className="bienes-table bienes-table--body inventario-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>PLACA</th>
                      <th>DESCRIPCIÓN</th>
                      <th>SERIAL</th>
                      <th>ESTADO</th>
                      <th>CÉDULA</th>
                      <th>RESPONSABLE</th>
                      <th>UBICACIÓN</th>
                      <th>FECHA/HORA</th>
                      <th>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bienes.map((bien, index) => (
                      <tr key={index}>
                        <td className="inventario-table__num">{index + 1}</td>
                        <td className="bienes-table__placa">{bien.placa}</td>
                        <td>{bien.descripcion || '—'}</td>
                        <td>
                          <input
                            type="text"
                            className="inventario-table__input-serial"
                            value={bien.serial}
                            onChange={(e) => editarSerial(index, e.target.value)}
                            placeholder="N/A"
                          />
                        </td>
                        <td>
                          <select
                            className={`inventario-table__select-estado inventario-table__select-estado--${bien.estado}`}
                            value={bien.estado}
                            onChange={(e) => editarEstado(index, e.target.value as EstadoBien)}
                          >
                            <option value="B">Bueno</option>
                            <option value="R">Regular</option>
                            <option value="M">Malo</option>
                          </select>
                        </td>
                        <td>{bien.cedula_responsable || '—'}</td>
                        <td>{bien.nombre_responsable || '—'}</td>
                        <td>{bien.ubicacion || '—'}</td>
                        <td className="inventario-table__timestamp">
                          {new Date(bien.timestamp).toLocaleString('es-CO', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td>
                          <button
                            className="inventario-table__btn-eliminar"
                            onClick={() => eliminarBien(index)}
                            title="Eliminar"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Mensaje si no hay bienes */}
        {bienes.length === 0 && (
          <div className="inventario-empty">
            <p>No hay bienes escaneados. Comience escaneando o ingresando códigos de barras.</p>
          </div>
        )}
      </div>

      {/* Modal de colaboradores */}
      <ModalColaboradores
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onGenerar={handleGenerarFormato}
        totalBienes={bienes.length}
        loading={generandoPDF}
      />
    </div>
  )
}
