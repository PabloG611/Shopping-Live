/**
 * Componente de Documentación de Vehículos.
 * Permite cargar Excel con datos técnicos, buscar por placa y gestionar documentación vehicular.
 * Extraído de InventarioVehiculos para uso en Gestión UNP.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import {
  cargarDocumentacionVehiculos,
  listarDocumentacionVehiculos,
  limpiarDocumentacionVehiculos,
  type DocumentacionVehiculoDTO,
} from '../../services/vehiculosService'
import type { useToast } from '../../hooks/useToast'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface VehiculoDocumento {
  blindaje: string
  capacidad: string
  carroceria: string
  chasis: string
  cilindraje: string
  color: string
  combustible: string
  fecha_soat: string
  licencia: string
  linea: string
  marca: string
  modelo: string
  motor: string
  n_serie: string
  placa: string
  potencia: string
  soat: string
  tipo_vehiculo: string
  traccion: string
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

interface Props {
  toast: ReturnType<typeof useToast>
}

export function DocumentacionVehiculos({ toast }: Props) {
  const [datos, setDatos] = useState<VehiculoDocumento[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(false)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estado para búsqueda directa por placa en BD
  const [placaBuscar, setPlacaBuscar] = useState('')
  const [buscandoPlaca, setBuscandoPlaca] = useState(false)
  const [resultadoPlaca, setResultadoPlaca] = useState<VehiculoDocumento | null>(null)
  const [placaNoEncontrada, setPlacaNoEncontrada] = useState(false)

  const buscarPorPlaca = async () => {
    const placa = placaBuscar.trim().toUpperCase()
    if (!placa || placa.length < 3) {
      toast.error('Ingrese al menos 3 caracteres de la placa')
      return
    }
    setBuscandoPlaca(true)
    setResultadoPlaca(null)
    setPlacaNoEncontrada(false)
    try {
      const { documentacion } = await listarDocumentacionVehiculos(placa)
      const encontrado = documentacion.find(d => d.placa.toUpperCase() === placa)
      if (encontrado) {
        setResultadoPlaca({
          placa: encontrado.placa, marca: encontrado.marca, linea: encontrado.linea,
          modelo: encontrado.modelo, color: encontrado.color, tipo_vehiculo: encontrado.tipo_vehiculo,
          blindaje: encontrado.blindaje, combustible: encontrado.combustible,
          cilindraje: encontrado.cilindraje, potencia: encontrado.potencia,
          traccion: encontrado.traccion, capacidad: encontrado.capacidad,
          carroceria: encontrado.carroceria, fecha_soat: encontrado.fecha_soat,
          soat: encontrado.soat, licencia: encontrado.licencia,
          motor: encontrado.motor, chasis: encontrado.chasis, n_serie: encontrado.n_serie,
        })
      } else {
        setPlacaNoEncontrada(true)
      }
    } catch {
      toast.error('Error al consultar la placa')
    }
    setBuscandoPlaca(false)
  }

  // Cargar datos desde la BD al montar
  useEffect(() => {
    const cargarDesdeDB = async () => {
      setCargando(true)
      const { documentacion } = await listarDocumentacionVehiculos()
      if (documentacion.length > 0) {
        setDatos(documentacion.map(d => ({
          placa: d.placa, marca: d.marca, linea: d.linea, modelo: d.modelo,
          color: d.color, tipo_vehiculo: d.tipo_vehiculo, blindaje: d.blindaje,
          combustible: d.combustible, cilindraje: d.cilindraje, potencia: d.potencia,
          traccion: d.traccion, capacidad: d.capacidad, carroceria: d.carroceria,
          fecha_soat: d.fecha_soat, soat: d.soat, licencia: d.licencia,
          motor: d.motor, chasis: d.chasis, n_serie: d.n_serie,
        })))
      }
      setCargando(false)
    }
    cargarDesdeDB()
  }, [])

  const procesarExcel = useCallback(async (file: File) => {
    setCargando(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })

        // Buscar la hoja correcta: la que contiene "PLACA" en alguna celda
        let sheet = null
        let sheetName = ''
        for (const name of workbook.SheetNames) {
          const candidateSheet = workbook.Sheets[name]
          const preview = XLSX.utils.sheet_to_json<string[]>(candidateSheet, { header: 1, defval: '' })
          const tieneHeaders = preview.slice(0, 20).some(row =>
            row.some(cell => String(cell).trim().toUpperCase() === 'PLACA')
          )
          if (tieneHeaders) {
            sheet = candidateSheet
            sheetName = name
            break
          }
        }

        if (!sheet) {
          sheetName = workbook.SheetNames[workbook.SheetNames.length - 1]
          sheet = workbook.Sheets[sheetName]
        }

        // Detectar la fila de encabezados reales
        const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
        let headerRowIndex = -1
        for (let i = 0; i < Math.min(rawData.length, 20); i++) {
          const row = rawData[i]
          if (row && row.some(cell => String(cell).trim().toUpperCase() === 'PLACA')) {
            headerRowIndex = i
            break
          }
        }

        let jsonData: Record<string, any>[]
        if (headerRowIndex >= 0) {
          const headers = rawData[headerRowIndex].map(h => String(h).trim())
          jsonData = rawData.slice(headerRowIndex + 1)
            .filter(row => row.some(cell => String(cell).trim() !== ''))
            .map(row => {
              const obj: Record<string, any> = {}
              headers.forEach((header, idx) => {
                if (header) obj[header] = row[idx] !== undefined ? row[idx] : ''
              })
              return obj
            })
        } else {
          jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' })
        }

        // Helper: convierte número serial de Excel a fecha legible (DD/MM/YYYY)
        const excelDateToString = (value: any): string => {
          if (!value) return ''
          const str = String(value).trim()
          if (/^\d{4,6}$/.test(str)) {
            const serial = parseInt(str, 10)
            const date = new Date((serial - 25569) * 86400 * 1000)
            if (!isNaN(date.getTime())) {
              const dd = String(date.getUTCDate()).padStart(2, '0')
              const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
              const yyyy = date.getUTCFullYear()
              return `${dd}/${mm}/${yyyy}`
            }
          }
          return str
        }

        // Helper: busca un valor en el row probando múltiples variantes de la clave
        const getVal = (row: Record<string, any>, ...keys: string[]): string => {
          for (const k of keys) {
            if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim()
          }
          const normalized = Object.fromEntries(
            Object.entries(row).map(([key, val]) => [
              key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '_'),
              val
            ])
          )
          for (const k of keys) {
            const norm = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '_')
            if (normalized[norm] !== undefined && normalized[norm] !== '') return String(normalized[norm]).trim()
          }
          return ''
        }

        const registros: VehiculoDocumento[] = jsonData.map((row) => ({
          placa: getVal(row, 'PLACA', 'placa', 'Placa', 'PLACA_VEHICULO', 'placa_vehiculo'),
          marca: getVal(row, 'MARCA', 'marca', 'Marca'),
          linea: getVal(row, 'LÍNEA', 'LINEA', 'linea', 'línea', 'Linea', 'Línea', 'LINEA/MODELO'),
          modelo: getVal(row, 'MODELO', 'modelo', 'Modelo', 'AÑO', 'año', 'ANO', 'AÑO MODELO'),
          color: getVal(row, 'COLOR', 'color', 'Color'),
          tipo_vehiculo: getVal(row, 'TIPO_VEHICULO', 'tipo_vehiculo', 'TIPO', 'tipo', 'Tipo', 'TIPO VEHICULO', 'TIPO DE VEHICULO', 'CLASE'),
          blindaje: getVal(row, 'BLINDAJE', 'blindaje', 'Blindaje', 'BLINDADO'),
          combustible: getVal(row, 'COMBUSTIBLE', 'combustible', 'Combustible'),
          cilindraje: getVal(row, 'CILINDRAJE', 'cilindraje', 'Cilindraje', 'CC', 'cc', 'C.C.'),
          potencia: getVal(row, 'POTENCIA', 'potencia', 'Potencia', 'HP', 'hp'),
          traccion: getVal(row, 'TRACCIÓN', 'TRACCION', 'traccion', 'tracción', 'Traccion', 'Tracción'),
          capacidad: getVal(row, 'CAPACIDAD', 'capacidad', 'Capacidad', 'PASAJEROS', 'pasajeros'),
          carroceria: getVal(row, 'CARROCERIA', 'CARROCERÍA', 'carroceria', 'carrocería', 'Carroceria', 'CARROCERÍA'),
          fecha_soat: excelDateToString(getVal(row, 'FECHA_SOAT', 'fecha_soat', 'VENCIMIENTO_SOAT', 'SOAT_VENCE', 'FECHA SOAT', 'VENCIMIENTO SOAT', 'VTO SOAT')),
          soat: getVal(row, 'SOAT', 'soat', 'N_SOAT', 'NUMERO_SOAT', 'numero_soat', 'No. SOAT', 'N° SOAT', 'No SOAT', 'NRO SOAT'),
          licencia: getVal(row, 'LICENCIA', 'licencia', 'Licencia', 'LICENCIA_TRANSITO', 'LICENCIA DE TRANSITO', 'LIC. TRANSITO', 'NRO LICENCIA'),
          motor: getVal(row, 'MOTOR', 'motor', 'Motor', 'N_MOTOR', 'NUMERO_MOTOR', 'No. MOTOR', 'N° MOTOR', 'NRO MOTOR', 'No MOTOR'),
          chasis: getVal(row, 'CHASIS', 'chasis', 'Chasis', 'VIN', 'vin', 'NRO CHASIS', 'No CHASIS'),
          n_serie: getVal(row, 'N_SERIE', 'n_serie', 'SERIE', 'serie', 'NUMERO_SERIE', 'No. SERIE', 'N° SERIE', 'NRO SERIE'),
        }))

        const validos = registros.filter(r => r.placa)
        setNombreArchivo(file.name)

        if (validos.length === 0) {
          const colsDetectadas = Object.keys(jsonData[0] || {}).join(', ')
          toast.error(`No se encontraron registros con placa válida. Hoja: "${sheetName}". Columnas detectadas: ${colsDetectadas}`)
          setCargando(false)
          return
        }

        // Guardar en la base de datos
        setGuardando(true)
        const resultado = await cargarDocumentacionVehiculos(validos as DocumentacionVehiculoDTO[])
        setGuardando(false)

        if (resultado.ok) {
          toast.success(`${resultado.creados ?? 0} nuevos, ${resultado.actualizados ?? 0} actualizados — guardados en BD`)
          const { documentacion } = await listarDocumentacionVehiculos()
          setDatos(documentacion.map(d => ({
            placa: d.placa, marca: d.marca, linea: d.linea, modelo: d.modelo,
            color: d.color, tipo_vehiculo: d.tipo_vehiculo, blindaje: d.blindaje,
            combustible: d.combustible, cilindraje: d.cilindraje, potencia: d.potencia,
            traccion: d.traccion, capacidad: d.capacidad, carroceria: d.carroceria,
            fecha_soat: d.fecha_soat, soat: d.soat, licencia: d.licencia,
            motor: d.motor, chasis: d.chasis, n_serie: d.n_serie,
          })))
        } else {
          toast.error(resultado.mensaje ?? 'Error guardando en la base de datos')
          setDatos(validos)
        }
      } catch (err) {
        toast.error('Error al procesar el archivo Excel')
        console.error(err)
      }
      setCargando(false)
    }
    reader.readAsArrayBuffer(file)
  }, [toast])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarExcel(file)
    e.target.value = ''
  }

  const exportarExcel = () => {
    if (datos.length === 0) return
    const ws = XLSX.utils.json_to_sheet(datosFiltrados.map(d => ({
      PLACA: d.placa, MARCA: d.marca, LÍNEA: d.linea, MODELO: d.modelo,
      COLOR: d.color, TIPO_VEHICULO: d.tipo_vehiculo, BLINDAJE: d.blindaje,
      COMBUSTIBLE: d.combustible, CILINDRAJE: d.cilindraje, POTENCIA: d.potencia,
      TRACCIÓN: d.traccion, CAPACIDAD: d.capacidad, CARROCERIA: d.carroceria,
      FECHA_SOAT: d.fecha_soat, SOAT: d.soat, LICENCIA: d.licencia,
      MOTOR: d.motor, CHASIS: d.chasis, N_SERIE: d.n_serie,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Documentación')
    XLSX.writeFile(wb, `documentacion_vehiculos_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Archivo exportado correctamente')
  }

  const limpiarDatos = async () => {
    setCargando(true)
    const resultado = await limpiarDocumentacionVehiculos()
    if (resultado.ok) {
      setDatos([])
      setNombreArchivo('')
      setBusqueda('')
      toast.success(resultado.mensaje ?? 'Datos eliminados')
    } else {
      toast.error(resultado.mensaje ?? 'Error al limpiar')
    }
    setCargando(false)
  }

  const datosFiltrados = datos.filter(d => {
    if (!busqueda.trim()) return true
    const q = busqueda.trim().toLowerCase()
    return d.placa.toLowerCase().includes(q)
      || d.marca.toLowerCase().includes(q)
      || d.linea.toLowerCase().includes(q)
      || d.color.toLowerCase().includes(q)
      || d.tipo_vehiculo.toLowerCase().includes(q)
  })

  return (
    <div className="vehiculos-documentacion">
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.04); }
        }
      `}</style>
      {/* Header */}
      <div className="vehiculos-documentacion__header" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h4 className="vehiculos-documentacion__titulo">Documentación de Vehículos</h4>
          <p className="vehiculos-documentacion__descripcion">
            Consulte datos técnicos de los vehículos de la UNP o cargue un archivo Excel para actualizar la base de datos.
          </p>
        </div>
      </div>

      {/* Buscador por placa - diseño centrado y atractivo */}
      <div style={{ maxWidth: '520px', margin: '0 auto 1.5rem', padding: '1.5rem 2rem', background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(48, 61, 80, 0.06)' }}>
        <p style={{ textAlign: 'center', fontSize: '0.82rem', fontWeight: 700, color: '#303d50', margin: '0 0 0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Consulta rápida por placa</p>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '280px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Ingrese placa (ej: LTL642)"
              value={placaBuscar}
              onChange={(e) => {
                setPlacaBuscar(e.target.value.toUpperCase())
                setResultadoPlaca(null)
                setPlacaNoEncontrada(false)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') buscarPorPlaca() }}
              maxLength={10}
              style={{ width: '100%', padding: '0.7rem 0.85rem 0.7rem 2.4rem', border: '2px solid #cbd5e1', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700, letterSpacing: '1.5px', background: 'white', outline: 'none', transition: 'border-color 0.2s' }}
            />
          </div>
          <button
            className="vehiculos-documentacion__btn vehiculos-documentacion__btn--buscar"
            onClick={buscarPorPlaca}
            disabled={buscandoPlaca || placaBuscar.trim().length < 3}
            style={{ padding: '0.7rem 1.4rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700 }}
          >
            {buscandoPlaca ? 'Buscando...' : 'Consultar'}
          </button>
          {resultadoPlaca && (
            <button onClick={() => { setResultadoPlaca(null); setPlacaBuscar('') }} style={{ padding: '0.5rem 0.9rem', fontSize: '0.78rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontWeight: 500 }}>Limpiar</button>
          )}
        </div>
      </div>

      {/* Resultado de búsqueda por placa - reorganizado */}
      {resultadoPlaca && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', background: '#303d50', color: 'white' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '1px' }}>{resultadoPlaca.placa}</span>
            <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>{resultadoPlaca.marca} {resultadoPlaca.linea} — {resultadoPlaca.tipo_vehiculo || 'Vehículo'}</span>
            <span style={{ marginLeft: 'auto' }}>
              {resultadoPlaca.blindaje === 'SI'
                ? <span style={{ background: '#dc2626', color: 'white', padding: '0.2rem 0.7rem', borderRadius: '5px', fontSize: '0.72rem', fontWeight: 700, animation: 'pulse 1.5s ease-in-out infinite', boxShadow: '0 0 8px rgba(220,38,38,0.5)' }}>BLINDADO</span>
                : <span style={{ background: '#16a34a', color: 'white', padding: '0.2rem 0.7rem', borderRadius: '5px', fontSize: '0.72rem', fontWeight: 700, animation: 'pulse 1.5s ease-in-out infinite', boxShadow: '0 0 8px rgba(22,163,74,0.4)' }}>CONVENCIONAL</span>
              }
            </span>
          </div>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem 1.5rem' }}>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Marca</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.marca || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Línea</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.linea || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Modelo</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.modelo || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Color</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.color || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Carrocería</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.carroceria || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Combustible</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.combustible || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Cilindraje</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.cilindraje ? `${resultadoPlaca.cilindraje} cc` : '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Potencia</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.potencia ? `${resultadoPlaca.potencia} HP` : '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Tracción</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.traccion || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Capacidad</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.capacidad ? `${resultadoPlaca.capacidad} pasajeros` : '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Venc. SOAT</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.fecha_soat || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>N° SOAT</span><span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#1e293b', fontFamily: 'monospace', wordBreak: 'break-all' }}>{resultadoPlaca.soat || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Licencia Tránsito</span><span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#1e293b', fontFamily: 'monospace', wordBreak: 'break-all' }}>{resultadoPlaca.licencia || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>N° Motor</span><span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#1e293b', fontFamily: 'monospace', wordBreak: 'break-all' }}>{resultadoPlaca.motor || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Chasis / VIN</span><span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#1e293b', fontFamily: 'monospace', wordBreak: 'break-all' }}>{resultadoPlaca.chasis || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>N° Serie</span><span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#1e293b', fontFamily: 'monospace', wordBreak: 'break-all' }}>{resultadoPlaca.n_serie || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Tipo Vehículo</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{resultadoPlaca.tipo_vehiculo || '-'}</span></div>
              <div><span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Blindaje</span><span style={{ fontSize: '0.88rem', fontWeight: 600, color: resultadoPlaca.blindaje === 'SI' ? '#dc2626' : '#16a34a' }}>{resultadoPlaca.blindaje === 'SI' ? 'Sí' : 'No'}</span></div>
            </div>
          </div>
        </div>
      )}

      {placaNoEncontrada && (
        <div className="vehiculos-documentacion__no-encontrada">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>No se encontró documentación para la placa <strong>{placaBuscar}</strong></span>
        </div>
      )}

      <hr className="vehiculos-documentacion__separador" />

      {/* Controles */}
      <div className="vehiculos-documentacion__controles">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          className="vehiculos-documentacion__btn vehiculos-documentacion__btn--cargar"
          onClick={() => fileInputRef.current?.click()}
          disabled={cargando}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          {cargando ? 'Procesando...' : guardando ? 'Guardando...' : 'Cargar Excel'}
        </button>

        {datos.length > 0 && (
          <>
            <button className="vehiculos-documentacion__btn vehiculos-documentacion__btn--exportar" onClick={exportarExcel}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar
            </button>
            <button className="vehiculos-documentacion__btn vehiculos-documentacion__btn--limpiar" onClick={limpiarDatos}>
              Limpiar
            </button>
          </>
        )}

        {nombreArchivo && (
          <span className="vehiculos-documentacion__archivo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {nombreArchivo}
          </span>
        )}
      </div>

      {/* Buscador en tabla + conteo */}
      {datos.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '350px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Filtrar tabla por placa, marca, línea..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.7rem 0.5rem 2.1rem', border: '1.5px solid #e2e8f0', borderRadius: '7px', fontSize: '0.82rem', background: 'white', outline: 'none' }}
            />
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
            Mostrando <strong style={{ color: '#303d50' }}>{datosFiltrados.length}</strong> de <strong>{datos.length}</strong> vehículos
          </span>
        </div>
      )}

      {/* Tabla completa con todas las columnas */}
      {datos.length > 0 ? (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse', minWidth: '2100px' }}>
              <thead>
                <tr style={{ background: '#303d50', color: 'white', position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ padding: '0.55rem 0.4rem', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', minWidth: '35px' }}>#</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '75px' }}>PLACA</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '85px' }}>MARCA</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '140px' }}>LÍNEA</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', minWidth: '50px' }}>AÑO</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '100px' }}>COLOR</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '75px' }}>TIPO</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', minWidth: '50px' }}>BLIND.</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '80px' }}>COMBUSTIBLE</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', minWidth: '50px' }}>CC</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', minWidth: '40px' }}>HP</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', minWidth: '50px' }}>TRACC.</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.7rem', minWidth: '40px' }}>CAP.</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '80px' }}>CARROCERÍA</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '85px' }}>VNC. SOAT</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '120px' }}>N° SOAT</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '95px' }}>LICENCIA</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '110px' }}>MOTOR</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '160px' }}>CHASIS</th>
                  <th style={{ padding: '0.55rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', minWidth: '160px' }}>N° SERIE</th>
                </tr>
              </thead>
              <tbody>
                {datosFiltrados.map((row, i) => (
                  <tr key={`${row.placa}-${i}`} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                    <td style={{ padding: '0.4rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.7rem' }}>{i + 1}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700, color: '#1e293b', fontSize: '0.8rem' }}>{row.placa}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{row.marca || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#475569' }}>{row.linea || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', fontWeight: 600 }}>{row.modelo || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{row.color || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.72rem' }}>{row.tipo_vehiculo || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>{row.blindaje === 'SI' ? <span style={{ background: '#fef2f2', color: '#dc2626', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.66rem', fontWeight: 700, border: '1px solid #fecaca' }}>SI</span> : <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.66rem', fontWeight: 600, border: '1px solid #bbf7d0' }}>NO</span>}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{row.combustible || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>{row.cilindraje || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>{row.potencia || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>{row.traccion || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>{row.capacidad || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{row.carroceria || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{row.fecha_soat || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', fontSize: '0.72rem', color: '#475569' }}>{row.soat || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', fontSize: '0.72rem', color: '#475569' }}>{row.licencia || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', fontSize: '0.72rem', color: '#475569' }}>{row.motor || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', fontSize: '0.72rem', color: '#475569' }}>{row.chasis || '-'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', fontSize: '0.72rem', color: '#475569' }}>{row.n_serie || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="vehiculos-documentacion__vacio">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <p>Cargue un archivo Excel para ver los datos de documentación</p>
          <span className="vehiculos-documentacion__hint">Formato esperado: BLINDAJE, CAPACIDAD, CARROCERIA, CHASIS, CILINDRAJE, COLOR, COMBUSTIBLE, FECHA_SOAT, LICENCIA, LÍNEA, MARCA, MODELO, MOTOR, N_SERIE, PLACA, POTENCIA, SOAT, TIPO_VEHICULO, TRACCIÓN</span>
        </div>
      )}
    </div>
  )
}
