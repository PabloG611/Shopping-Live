/**
 * Modal para editar un inventario vehicular existente.
 * Permite modificar todos los datos: presentador, elaborador,
 * datos del vehículo, checklist completo, observaciones, km.
 * Soporta formato carro (GABS-FT-60-V4) y moto (GABS-FT-81-V4).
 */

import { useState, useEffect } from 'react'
import {
  editarInventarioVehiculo,
  detalleInventarioVehiculo,
  generarFormatoVehiculo,
  listarDocumentacionVehiculos,
  buscarTerceroVehiculo,
  esMoto,
  CHECKLIST_SECCIONES,
  CHECKLIST_MOTO_SECCIONES,
  crearChecklistInicial,
  type ChecklistVehiculo,
  type EditarInventarioPayload,
  type InventarioResumen,
} from '../../services/vehiculosService'
import { uploadFileToSharepoint, verificarConexionSharepoint, listarArchivosCarpeta } from '../../services/graphUploadService'
import { getSpAccessToken, getSharepointStatus } from '../../services/msalSharepointService'
import JSZip from 'jszip'
import { ModalPrevisualizarPdf } from '../transferencia/ModalPrevisualizarPdf'
import type { useToast } from '../../hooks/useToast'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface Props {
  inventario: InventarioResumen
  isOpen: boolean
  onClose: () => void
  onGuardado: () => void
  toast: ReturnType<typeof useToast>
}

type SeccionActiva = 'presenta' | 'elabora' | 'vehiculo' | 'checklist' | 'observaciones' | 'fotos'

interface DatosPresenta {
  nombre: string; cedula: string; cargo: string; grupo: string; telefono: string
}

interface DatosElabora {
  nombre: string; cedula: string; cargo: string; dependencia: string; grupo: string
}

interface DatosVehiculo {
  blindado: string; modelo: string; color: string; combustible: string
  licencia: string; linea: string; cilindraje: string; motor: string
  soat: string; fechaSoat: string; rtm: string; fechaRtm: string
  marca: string; n_serie: string
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export default function ModalEditarInventarioVehiculo({ inventario, isOpen, onClose, onGuardado, toast }: Props) {
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [seccion, setSeccion] = useState<SeccionActiva>('presenta')

  // Datos editables
  const [presenta, setPresenta] = useState<DatosPresenta>({ nombre: '', cedula: '', cargo: '', grupo: '', telefono: '' })
  const [elabora, setElabora] = useState<DatosElabora>({ nombre: '', cedula: '', cargo: '', dependencia: '', grupo: '' })
  const [idVehiculo, setIdVehiculo] = useState<DatosVehiculo>({
    blindado: '', modelo: '', color: '', combustible: '',
    licencia: '', linea: '', cilindraje: '', motor: '',
    soat: '', fechaSoat: '', rtm: '', fechaRtm: '', marca: '', n_serie: '',
  })
  const [checklist, setChecklist] = useState<ChecklistVehiculo>(crearChecklistInicial())
  const [kilometraje, setKilometraje] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [ciudad, setCiudad] = useState('')

  // Buscadores de tercero para Quien Presenta y Quien Elabora
  const [busqPresenta, setBusqPresenta] = useState('')
  const [resultPresenta, setResultPresenta] = useState<{ nombre: string; cedula: string }[]>([])
  const [buscandoPresenta, setBuscandoPresenta] = useState(false)
  const [busqElabora, setBusqElabora] = useState('')
  const [resultElabora, setResultElabora] = useState<{ nombre: string; cedula: string }[]>([])
  const [buscandoElabora, setBuscandoElabora] = useState(false)

  // PDF preview
  const [pdfPreview, setPdfPreview] = useState<{ pdfDataUrl: string; nombreArchivo: string } | null>(null)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  // Detalle completo cargado (para acceder a servicio_codigo en datos_formato)
  const [detalleCargado, setDetalleCargado] = useState<any>(null)

  // ─── Tab "Fotos": subir el ZIP de respaldo a SharePoint ───
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [subiendoZip, setSubiendoZip] = useState(false)
  const [progresoZip, setProgresoZip] = useState<string>('')
  const [resultadoZip, setResultadoZip] = useState<{ ok: boolean; mensaje: string } | null>(null)

  // Búsqueda con debounce para quien presenta
  useEffect(() => {
    if (busqPresenta.length < 3) { setResultPresenta([]); return }
    setBuscandoPresenta(true)
    const t = setTimeout(async () => {
      const res = await buscarTerceroVehiculo(busqPresenta)
      setResultPresenta(res)
      setBuscandoPresenta(false)
    }, 300)
    return () => clearTimeout(t)
  }, [busqPresenta])

  // Búsqueda con debounce para quien elabora
  useEffect(() => {
    if (busqElabora.length < 3) { setResultElabora([]); return }
    setBuscandoElabora(true)
    const t = setTimeout(async () => {
      const res = await buscarTerceroVehiculo(busqElabora)
      setResultElabora(res)
      setBuscandoElabora(false)
    }, 300)
    return () => clearTimeout(t)
  }, [busqElabora])

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  // Cargar datos existentes del inventario
  useEffect(() => {
    if (!isOpen) return
    const cargar = async () => {
      setCargando(true)
      const { ok, inventario: detalle } = await detalleInventarioVehiculo(inventario.id_inventario)
      if (ok && detalle) {
        setDetalleCargado(detalle)
        const df = detalle.datos_formato

        if (df && df.presenta) {
          // Inventario con datos_formato completo
          setPresenta(df.presenta)
          setElabora(df.elabora || { nombre: '', cedula: '', cargo: '', dependencia: '', grupo: '' })
          setIdVehiculo(df.idVehiculo || {
            blindado: '', modelo: '', color: '', combustible: '',
            licencia: '', linea: '', cilindraje: '', motor: '',
            soat: '', fechaSoat: '', rtm: '', fechaRtm: '', marca: '', n_serie: '',
          })
          setChecklist(df.checklist || crearChecklistInicial())
          setCiudad(df.ciudad || '')
        } else {
          // Fallback para inventarios sin datos_formato
          setElabora({
            nombre: detalle.realizado_por_nombre || '',
            cedula: detalle.realizado_por_cedula || '',
            cargo: '', dependencia: '', grupo: '',
          })
          setPresenta({
            nombre: (detalle as any).responsable_nombre || '',
            cedula: (detalle as any).responsable_cedula || '',
            cargo: '', grupo: '', telefono: '',
          })
          setCiudad(detalle.regional || '')

          // Checklist del modelo
          const cm = (detalle as any).checklist_modelo
          if (cm && Object.keys(cm).length > 0) {
            setChecklist(prev => ({ ...prev, ...cm }))
          }

          // Cargar documentación del vehículo para prellenar datos técnicos
          try {
            const { documentacion } = await listarDocumentacionVehiculos(inventario.placa_vehiculo)
            const doc = documentacion.find(d => d.placa.toUpperCase() === inventario.placa_vehiculo.toUpperCase())
            if (doc) {
              setIdVehiculo({
                blindado: doc.blindaje || '',
                modelo: doc.modelo || '',
                color: doc.color || '',
                combustible: doc.combustible || '',
                licencia: doc.licencia || '',
                linea: doc.linea || '',
                cilindraje: doc.cilindraje || '',
                motor: doc.motor || '',
                soat: doc.soat || '',
                fechaSoat: doc.fecha_soat || '',
                rtm: '', fechaRtm: '',
                marca: doc.marca || '',
                n_serie: doc.n_serie || '',
              })
            }
          } catch { /* no bloquear */ }
        }

        setKilometraje(detalle.kilometraje != null ? String(detalle.kilometraje) : '')
        setObservaciones(detalle.observaciones || '')
      } else {
        toast.error('No se pudo cargar el detalle del inventario')
      }
      setCargando(false)
    }
    cargar()
  }, [isOpen, inventario.id_inventario])

  const handleGuardar = async () => {
    setGuardando(true)
    const payload: EditarInventarioPayload = {
      kilometraje: (kilometraje && kilometraje !== 'N/A') ? parseInt(kilometraje) : null,
      observaciones: observaciones.trim(),
      estado_general: (() => {
        const vals = Object.values(checklist)
        if (vals.some(v => v === 'malo' || v === 'no')) return 'malo'
        if (vals.some(v => v === 'regular')) return 'regular'
        return 'bueno'
      })(),
      regional: ciudad.trim() || inventario.regional,
      realizado_por_nombre: elabora.nombre,
      realizado_por_cedula: elabora.cedula,
      datos_formato: {
        ciudad,
        presenta,
        elabora,
        idVehiculo,
        checklist,
      },
    }

    const res = await editarInventarioVehiculo(inventario.id_inventario, payload)
    setGuardando(false)

    if (res.ok) {
      toast.success(res.mensaje || 'Inventario actualizado')
      onGuardado()
    } else {
      toast.error(res.mensaje || 'Error al guardar')
    }
  }

  const handleGenerarPdf = async () => {
    setGenerandoPdf(true)
    try {
      const formato = await generarFormatoVehiculo({
        placa: inventario.placa_vehiculo,
        regional: ciudad.trim() || inventario.regional,
        tipo: esMoto(inventario.placa_vehiculo) ? 'moto' : 'carro',
        elabora: {
          nombre: elabora.nombre,
          cedula: elabora.cedula,
          cargo: elabora.cargo,
          dependencia: elabora.dependencia,
          grupo: elabora.grupo,
        },
        presenta: {
          nombre: presenta.nombre,
          cedula: presenta.cedula,
          cargo: presenta.cargo,
          grupo: presenta.grupo,
          telefono: presenta.telefono,
        },
        checklist,
        blindado: idVehiculo.blindado,
        modelo: idVehiculo.modelo,
        color: idVehiculo.color,
        combustible: idVehiculo.combustible,
        kilometraje: kilometraje || '',
        licencia: idVehiculo.licencia,
        linea: idVehiculo.linea,
        cilindraje: idVehiculo.cilindraje,
        motor: idVehiculo.motor,
        soat: idVehiculo.soat,
        fecha_soat: idVehiculo.fechaSoat,
        rtm: idVehiculo.rtm,
        fecha_rtm: idVehiculo.fechaRtm,
        marca: idVehiculo.marca,
        n_serie: idVehiculo.n_serie,
        observaciones: observaciones.trim(),
      })
      if (formato.ok && formato.pdf_base64) {
        const pdfDataUrl = `data:application/pdf;base64,${formato.pdf_base64}`
        setPdfPreview({ pdfDataUrl, nombreArchivo: formato.nombre_archivo || `Inventario_${inventario.placa_vehiculo}.pdf` })
      } else {
        toast.error(formato.error || 'Error generando PDF')
      }
    } catch {
      toast.error('Error de conexión al generar PDF')
    }
    setGenerandoPdf(false)
  }

  const descargarPdf = async () => {
    if (!pdfPreview) return
    const parts = pdfPreview.pdfDataUrl.split(',')
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf'
    const bstr = atob(parts[1])
    const u8arr = new Uint8Array(bstr.length)
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
    const blob = new Blob([u8arr], { type: mime })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = pdfPreview.nombreArchivo
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
    toast.success('PDF descargado')

    // Subir PDF editado a SharePoint (sobreescribe el anterior)
    if (getSharepointStatus().authenticated) {
      try {
        const token = await getSpAccessToken()
        if (token) {
          // Usar el código de servicio original para que la ruta en SharePoint
          // coincida con la del registro inicial. Fallback: nombre de regional.
          const codigoServicio = inventario.servicio_codigo
            || (detalleCargado?.datos_formato as any)?.servicio_codigo
            || inventario.regional
            || ''
          const regional = (inventario.regional || 'sin_regional').replace(/[\s/]+/g, '_').slice(0, 40)
          const nombrePdf = `${regional}_${inventario.placa_vehiculo}.pdf`
          const pdfBase64 = parts[1]
          const spUrl = await uploadFileToSharepoint({
            token,
            base64: pdfBase64,
            placa: inventario.placa_vehiculo,
            servicio: codigoServicio,
            nombreArchivo: nombrePdf,
          })
          if (spUrl) {
            toast.success('PDF actualizado en SharePoint')
          } else {
            toast.warning('PDF descargado pero no se pudo actualizar en SharePoint')
          }
        }
      } catch (err) {
        console.error('[SharePoint] Error subiendo PDF editado:', err)
        toast.warning('PDF descargado pero falló la subida a SharePoint')
      }
    }

    setPdfPreview(null)
  }

  // Código de servicio para la ruta en SharePoint (misma que el registro inicial).
  const codigoServicioSP = (): string =>
    inventario.servicio_codigo
    || (detalleCargado?.datos_formato as any)?.servicio_codigo
    || inventario.regional
    || ''

  // Sube el ZIP de respaldo (fotos) + el formato PDF a la carpeta del vehículo
  // en SharePoint ({servicio}/{placa}; Graph crea la carpeta si no existe).
  // Flujo seguro contra pérdidas:
  //   1. Verifica CONEXIÓN real a SharePoint antes de empezar.
  //   2. Descomprime el ZIP y filtra las imágenes.
  //   3. Sube cada imagen y VALIDA webUrl.
  //   4. Genera el formato PDF y lo sube a la misma carpeta.
  //   5. VERIFICA listando la carpeta que fotos + PDF quedaron realmente.
  const subirZipASharepoint = async () => {
    if (!zipFile) return
    setResultadoZip(null)

    if (!getSharepointStatus().authenticated) {
      setResultadoZip({ ok: false, mensaje: 'Conéctese a SharePoint antes de subir las fotos.' })
      return
    }

    setSubiendoZip(true)
    try {
      const token = await getSpAccessToken()
      if (!token) {
        setResultadoZip({ ok: false, mensaje: 'No se obtuvo el token de SharePoint. Reconecte e intente de nuevo.' })
        setSubiendoZip(false)
        return
      }

      // 1. CONEXIÓN real
      setProgresoZip('Verificando conexión…')
      const hayConexion = await verificarConexionSharepoint(token)
      if (!hayConexion) {
        setResultadoZip({ ok: false, mensaje: 'Sin conexión a SharePoint. Conéctese a una red e intente de nuevo.' })
        setSubiendoZip(false)
        return
      }

      // 2. Descomprimir ZIP y extraer imágenes
      setProgresoZip('Leyendo el archivo ZIP…')
      const zip = await JSZip.loadAsync(zipFile)
      const entradasImg = Object.values(zip.files).filter(
        (f) => !f.dir && /\.(jpe?g|png|webp)$/i.test(f.name),
      )
      if (entradasImg.length === 0) {
        setResultadoZip({ ok: false, mensaje: 'El ZIP no contiene imágenes (.jpg/.png).' })
        setSubiendoZip(false)
        return
      }

      const placa = inventario.placa_vehiculo
      const servicio = codigoServicioSP()

      // 3. Subir cada imagen y validar webUrl
      const nombresSubidos: string[] = []
      let fallidas = 0
      for (let i = 0; i < entradasImg.length; i++) {
        const entrada = entradasImg[i]
        // Nombre base del archivo (sin ruta de carpetas internas del ZIP).
        const nombreArchivo = (entrada.name.split('/').pop() || entrada.name).replace(/[\s#%]/g, '_')
        setProgresoZip(`Subiendo ${i + 1}/${entradasImg.length}: ${nombreArchivo}…`)
        const base64 = await entrada.async('base64')
        const webUrl = await uploadFileToSharepoint({ token, base64, placa, servicio, nombreArchivo })
        if (webUrl) nombresSubidos.push(nombreArchivo.toLowerCase())
        else fallidas++
      }

      if (fallidas > 0) {
        setResultadoZip({ ok: false, mensaje: `Subieron ${nombresSubidos.length} de ${entradasImg.length}. ${fallidas} fallaron. Reintente.` })
        setSubiendoZip(false)
        return
      }

      // 4. Generar el formato PDF y subirlo a la MISMA carpeta del vehículo.
      //    El ZIP solo trae fotos, así que el PDF se genera aquí con los datos
      //    actuales del modal (igual que "Generar formato").
      setProgresoZip('Generando el formato PDF…')
      const regional = (inventario.regional || 'sin_regional').replace(/[\s/]+/g, '_').slice(0, 40)
      const nombrePdf = `${regional}_${placa}.pdf`
      let nombrePdfSubido: string | null = null
      try {
        const formato = await generarFormatoVehiculo({
          placa,
          regional: ciudad.trim() || inventario.regional,
          tipo: esMoto(placa) ? 'moto' : 'carro',
          elabora: {
            nombre: elabora.nombre,
            cedula: elabora.cedula,
            cargo: elabora.cargo,
            dependencia: elabora.dependencia,
            grupo: elabora.grupo,
          },
          presenta: {
            nombre: presenta.nombre,
            cedula: presenta.cedula,
            cargo: presenta.cargo,
            grupo: presenta.grupo,
            telefono: presenta.telefono,
          },
          checklist,
          blindado: idVehiculo.blindado,
          modelo: idVehiculo.modelo,
          color: idVehiculo.color,
          combustible: idVehiculo.combustible,
          kilometraje: kilometraje || '',
          licencia: idVehiculo.licencia,
          linea: idVehiculo.linea,
          cilindraje: idVehiculo.cilindraje,
          motor: idVehiculo.motor,
          soat: idVehiculo.soat,
          fecha_soat: idVehiculo.fechaSoat,
          rtm: idVehiculo.rtm,
          fecha_rtm: idVehiculo.fechaRtm,
          marca: idVehiculo.marca,
          n_serie: idVehiculo.n_serie,
          observaciones: observaciones.trim(),
        })
        if (!formato.ok || !formato.pdf_base64) {
          setResultadoZip({ ok: false, mensaje: `Fotos subidas, pero falló generar el PDF: ${formato.error || 'error desconocido'}. Reintente.` })
          setSubiendoZip(false)
          return
        }
        setProgresoZip('Subiendo el formato PDF…')
        const pdfUrl = await uploadFileToSharepoint({
          token,
          base64: formato.pdf_base64,
          placa,
          servicio,
          nombreArchivo: nombrePdf,
        })
        if (!pdfUrl) {
          setResultadoZip({ ok: false, mensaje: 'Fotos subidas, pero no se pudo subir el PDF a SharePoint. Reintente.' })
          setSubiendoZip(false)
          return
        }
        nombrePdfSubido = nombrePdf.toLowerCase()
      } catch (errPdf) {
        console.error('[SharePoint ZIP] Error generando/subiendo PDF:', errPdf)
        setResultadoZip({ ok: false, mensaje: 'Fotos subidas, pero falló generar o subir el PDF. Reintente.' })
        setSubiendoZip(false)
        return
      }

      // 5. VERIFICACIÓN FUERTE: listar la carpeta y confirmar fotos + PDF.
      setProgresoZip('Verificando en SharePoint…')
      const archivosEnCarpeta = await listarArchivosCarpeta({ token, placa, servicio })
      if (!archivosEnCarpeta) {
        setResultadoZip({ ok: false, mensaje: 'No se pudo verificar la carpeta en SharePoint. Reintente.' })
        setSubiendoZip(false)
        return
      }
      const esperados = [...nombresSubidos, ...(nombrePdfSubido ? [nombrePdfSubido] : [])]
      const faltantes = esperados.filter((n) => !archivosEnCarpeta.has(n))
      if (faltantes.length > 0) {
        setResultadoZip({ ok: false, mensaje: `Verificación fallida: faltan ${faltantes.length} archivo(s) en SharePoint. Reintente.` })
        setSubiendoZip(false)
        return
      }

      setResultadoZip({ ok: true, mensaje: `✓ ${nombresSubidos.length} foto(s) y el formato PDF subidos y verificados en la carpeta ${servicio}/${placa}.` })
      toast.success(`${nombresSubidos.length} foto(s) y el PDF subidos y verificados en SharePoint`)
      setZipFile(null)
    } catch (err) {
      console.error('[SharePoint ZIP] Error:', err)
      setResultadoZip({ ok: false, mensaje: 'Error procesando el ZIP o subiendo a SharePoint. Reintente.' })
    } finally {
      setSubiendoZip(false)
      setProgresoZip('')
    }
  }

  if (!isOpen) return null

  const placa = inventario.placa_vehiculo
  const secciones = esMoto(placa) ? CHECKLIST_MOTO_SECCIONES : CHECKLIST_SECCIONES

  const TABS: { key: SeccionActiva; label: string }[] = [
    { key: 'presenta', label: 'Quien Presenta' },
    { key: 'elabora', label: 'Quien Elabora' },
    { key: 'vehiculo', label: 'Datos Vehículo' },
    { key: 'checklist', label: 'Checklist' },
    { key: 'observaciones', label: 'Observaciones' },
    { key: 'fotos', label: 'Fotos' },
  ]

  return (
    <>
      <div className="vehiculos-modal-overlay">
        <div className="vehiculos-modal-editar">
          {/* Header */}
          <div className="vehiculos-modal-editar__header">
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>
                Editar Inventario — {placa}
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {esMoto(placa) ? 'Moto' : 'Carro'} · {inventario.regional || 'Sin regional'}
              </span>
            </div>
            <button className="vehiculos-modal-editar__cerrar" onClick={onClose}>&times;</button>
          </div>

          {/* Tabs */}
          <div className="vehiculos-modal-editar__tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`vehiculos-modal-editar__tab ${seccion === tab.key ? 'vehiculos-modal-editar__tab--activo' : ''}`}
                onClick={() => setSeccion(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="vehiculos-modal-editar__body">
            {cargando ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Cargando datos...</div>
            ) : (
              <>
                {/* SECCION: Quien presenta */}
                {seccion === 'presenta' && (
                  <div className="vehiculos-modal-editar__seccion">
                    {/* Buscador de tercero */}
                    <div className="vehiculos-modal-editar__campo vehiculos-modal-editar__campo--full" style={{ marginBottom: '0.5rem', position: 'relative' }}>
                      <label className="vehiculos-modal-editar__label">Buscar por cédula o nombre</label>
                      <input
                        className="vehiculos-modal-editar__input"
                        value={busqPresenta}
                        onChange={(e) => setBusqPresenta(e.target.value)}
                        placeholder="Escriba cédula o nombre (mín. 3 caracteres)..."
                        autoComplete="off"
                      />
                      {buscandoPresenta && <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem', display: 'block' }}>Buscando…</span>}
                      {resultPresenta.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '1px solid #dee2e6', borderRadius: '8px', boxShadow: '0 6px 18px rgba(0,0,0,0.1)', maxHeight: '180px', overflowY: 'auto' }}>
                          {resultPresenta.map((t) => (
                            <button key={t.cedula} type="button"
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'white', cursor: 'pointer', fontSize: '0.82rem', color: '#1e293b' }}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setPresenta(p => ({ ...p, nombre: t.nombre, cedula: t.cedula }))
                                setBusqPresenta('')
                                setResultPresenta([])
                              }}>
                              <strong>{t.nombre}</strong> <span style={{ color: '#64748b' }}>· {t.cedula}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <InputField label="Nombres y Apellidos" value={presenta.nombre}
                      onChange={(v) => setPresenta(p => ({ ...p, nombre: v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').toUpperCase() }))} />
                    <InputField label="N° Cédula" value={presenta.cedula}
                      onChange={(v) => setPresenta(p => ({ ...p, cedula: v.replace(/\D/g, '').slice(0, 10) }))} />
                    <InputField label="Cargo" value={presenta.cargo}
                      onChange={(v) => setPresenta(p => ({ ...p, cargo: v }))} />
                    <InputField label="Grupo interno de trabajo" value={presenta.grupo}
                      onChange={(v) => setPresenta(p => ({ ...p, grupo: v }))} />
                    <InputField label="Teléfono de contacto" value={presenta.telefono}
                      onChange={(v) => setPresenta(p => ({ ...p, telefono: v.replace(/\D/g, '').slice(0, 10) }))} />
                  </div>
                )}

                {/* SECCION: Quien elabora */}
                {seccion === 'elabora' && (
                  <div className="vehiculos-modal-editar__seccion">
                    {/* Buscador de tercero */}
                    <div className="vehiculos-modal-editar__campo vehiculos-modal-editar__campo--full" style={{ marginBottom: '0.5rem', position: 'relative' }}>
                      <label className="vehiculos-modal-editar__label">Buscar por cédula o nombre</label>
                      <input
                        className="vehiculos-modal-editar__input"
                        value={busqElabora}
                        onChange={(e) => setBusqElabora(e.target.value)}
                        placeholder="Escriba cédula o nombre (mín. 3 caracteres)..."
                        autoComplete="off"
                      />
                      {buscandoElabora && <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem', display: 'block' }}>Buscando…</span>}
                      {resultElabora.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '1px solid #dee2e6', borderRadius: '8px', boxShadow: '0 6px 18px rgba(0,0,0,0.1)', maxHeight: '180px', overflowY: 'auto' }}>
                          {resultElabora.map((t) => (
                            <button key={t.cedula} type="button"
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'white', cursor: 'pointer', fontSize: '0.82rem', color: '#1e293b' }}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setElabora(p => ({ ...p, nombre: t.nombre, cedula: t.cedula }))
                                setBusqElabora('')
                                setResultElabora([])
                              }}>
                              <strong>{t.nombre}</strong> <span style={{ color: '#64748b' }}>· {t.cedula}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <InputField label="Nombres y Apellidos" value={elabora.nombre}
                      onChange={(v) => setElabora(p => ({ ...p, nombre: v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').toUpperCase() }))} />
                    <InputField label="N° Cédula" value={elabora.cedula}
                      onChange={(v) => setElabora(p => ({ ...p, cedula: v.replace(/\D/g, '').slice(0, 10) }))} />
                    <InputField label="Cargo" value={elabora.cargo}
                      onChange={(v) => setElabora(p => ({ ...p, cargo: v }))} />
                    <InputField label="Dependencia" value={elabora.dependencia}
                      onChange={(v) => setElabora(p => ({ ...p, dependencia: v }))} />
                    <InputField label="Grupo interno de trabajo" value={elabora.grupo}
                      onChange={(v) => setElabora(p => ({ ...p, grupo: v }))} />
                  </div>
                )}

                {/* SECCION: Datos vehículo */}
                {seccion === 'vehiculo' && (
                  <div className="vehiculos-modal-editar__seccion">
                    <InputField label="Ciudad" value={ciudad}
                      onChange={(v) => setCiudad(v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').toUpperCase())} />
                    <div className="vehiculos-modal-editar__campo">
                      <label className="vehiculos-modal-editar__label">Convencional / Blindado</label>
                      <select className="vehiculos-modal-editar__select" value={idVehiculo.blindado}
                        onChange={(e) => setIdVehiculo(p => ({ ...p, blindado: e.target.value }))}>
                        <option value="">—</option>
                        <option value="NO">Convencional</option>
                        <option value="SI">Blindado</option>
                      </select>
                    </div>
                    <InputField label="Modelo (año)" value={idVehiculo.modelo}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, modelo: v }))} />
                    <InputField label="Color" value={idVehiculo.color}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, color: v }))} />
                    <div className="vehiculos-modal-editar__campo">
                      <label className="vehiculos-modal-editar__label">Combustible</label>
                      <select className="vehiculos-modal-editar__select" value={idVehiculo.combustible}
                        onChange={(e) => setIdVehiculo(p => ({ ...p, combustible: e.target.value }))}>
                        <option value="">—</option>
                        <option value="GASOLINA">Gasolina</option>
                        <option value="DIESEL">Diesel</option>
                        <option value="GAS">Gas</option>
                        <option value="ELECTRICO">Eléctrico</option>
                        <option value="HIBRIDO">Híbrido</option>
                      </select>
                    </div>
                    <InputField label="Kilometraje" value={kilometraje}
                      onChange={(v) => {
                        let val = v.toUpperCase()
                        if (val === 'N') val = 'N/'
                        if (val === '' || val === 'N/' || val === 'N/A' || /^\d+$/.test(val)) setKilometraje(val)
                      }} />
                    <InputField label="Marca" value={idVehiculo.marca}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, marca: v }))} />
                    <InputField label="Línea" value={idVehiculo.linea}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, linea: v }))} />
                    <InputField label="Cilindraje" value={idVehiculo.cilindraje}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, cilindraje: v }))} />
                    <InputField label="Licencia de Tránsito N°" value={idVehiculo.licencia}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, licencia: v }))} />
                    <InputField label="N° Motor" value={idVehiculo.motor}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, motor: v }))} />
                    <InputField label="SOAT N°" value={idVehiculo.soat}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, soat: v }))} />
                    <InputField label="Fecha Vencimiento SOAT" value={idVehiculo.fechaSoat}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, fechaSoat: v }))} placeholder="DD/MM/YYYY" />
                    <InputField label="Certificado RTM N°" value={idVehiculo.rtm}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, rtm: v }))} />
                    <InputField label="Fecha Vencimiento RTM" value={idVehiculo.fechaRtm}
                      onChange={(v) => setIdVehiculo(p => ({ ...p, fechaRtm: v }))} placeholder="DD/MM/YYYY o N/A" />
                  </div>
                )}

                {/* SECCION: Checklist */}
                {seccion === 'checklist' && (
                  <div className="vehiculos-modal-editar__seccion vehiculos-modal-editar__seccion--checklist">
                    {secciones.map((sec) => (
                      <fieldset key={sec.titulo} className="vehiculos-modal-editar__fieldset">
                        <legend className="vehiculos-modal-editar__legend">{sec.titulo}</legend>
                        <div className="vehiculos-modal-editar__checklist-grid">
                          {sec.items.map((item) => {
                            const tieneEstado = 'tieneEstado' in item && item.tieneEstado
                            return (
                              <div key={item.key} className="vehiculos-modal-editar__checklist-item">
                                <span className="vehiculos-modal-editar__checklist-label">{item.label}</span>
                                <div className="vehiculos-modal-editar__checklist-btns">
                                  {tieneEstado ? (
                                    (['bueno', 'regular', 'malo', 'na'] as const).map((est) => (
                                      <button key={est} type="button"
                                        className={`vehiculos-estado-btn vehiculos-estado-btn--${est} ${checklist[item.key] === est ? 'vehiculos-estado-btn--seleccionado' : ''}`}
                                        onClick={() => setChecklist(p => ({ ...p, [item.key]: est }))}
                                      >
                                        {est === 'bueno' ? 'B' : est === 'regular' ? 'R' : est === 'malo' ? 'M' : 'N/A'}
                                      </button>
                                    ))
                                  ) : (
                                    (['si', 'no', 'na'] as const).map((est) => (
                                      <button key={est} type="button"
                                        className={`vehiculos-estado-btn vehiculos-estado-btn--${est} ${checklist[item.key] === est ? 'vehiculos-estado-btn--seleccionado' : ''}`}
                                        onClick={() => setChecklist(p => ({ ...p, [item.key]: est }))}
                                      >
                                        {est === 'si' ? '✓' : est === 'no' ? 'X' : 'N/A'}
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                )}

                {/* SECCION: Observaciones */}
                {seccion === 'observaciones' && (
                  <div className="vehiculos-modal-editar__seccion">
                    <div className="vehiculos-modal-editar__campo vehiculos-modal-editar__campo--full">
                      <label className="vehiculos-modal-editar__label">Observaciones generales</label>
                      <textarea
                        className="vehiculos-modal-editar__textarea"
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value.toUpperCase().slice(0, 300))}
                        rows={4}
                        maxLength={300}
                        placeholder="OBSERVACIONES SOBRE EL ESTADO DEL VEHICULO..."
                      />
                      <div style={{ textAlign: 'right', fontSize: '0.7rem', color: observaciones.length > 270 ? '#d13c47' : '#94a3b8' }}>
                        {observaciones.length}/300
                      </div>
                    </div>
                  </div>
                )}

                {/* SECCION: Fotos — subir el ZIP de respaldo a SharePoint */}
                {seccion === 'fotos' && (() => {
                  const spConectado = getSharepointStatus().authenticated
                  const puedeSubir = !!zipFile && !subiendoZip && spConectado
                  return (
                    <div className="vehiculos-modal-editar__seccion">
                      <div className="vehiculos-modal-editar__campo vehiculos-modal-editar__campo--full" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                        {/* Encabezado explicativo + chip de estado SharePoint */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '0.85rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                          <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>📦</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                              Subir fotos de respaldo
                            </p>
                            <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
                              Si el inventario quedó registrado pero las fotos no llegaron a SharePoint, suba el
                              <strong> .zip de respaldo</strong>. Se subirán a la carpeta de <strong>{inventario.placa_vehiculo}</strong> y
                              se verificará que quedaron guardadas.
                            </p>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
                              padding: '3px 10px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700,
                              background: spConectado ? '#dcfce7' : '#fef3c7',
                              color: spConectado ? '#15803d' : '#92400e',
                            }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: spConectado ? '#16a34a' : '#d97706' }} />
                              {spConectado ? 'SharePoint conectado' : 'SharePoint sin conexión'}
                            </span>
                          </div>
                        </div>

                        {/* Dropzone / selector del ZIP */}
                        <label
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: 8, padding: '1.5rem 1rem', borderRadius: 12, textAlign: 'center',
                            border: `2px dashed ${zipFile ? '#86efac' : '#cbd5e1'}`,
                            background: zipFile ? '#f0fdf4' : '#fcfdfe',
                            cursor: subiendoZip ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{zipFile ? '🗂️' : '⬆️'}</span>
                          {zipFile ? (
                            <>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#15803d' }}>{zipFile.name}</span>
                              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{(zipFile.size / 1024 / 1024).toFixed(1)} MB · Toque para cambiar</span>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Seleccione el archivo ZIP</span>
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Solo archivos .zip de respaldo de fotos</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept=".zip,application/zip"
                            disabled={subiendoZip}
                            onChange={(e) => {
                              setResultadoZip(null)
                              setZipFile(e.target.files?.[0] ?? null)
                            }}
                            style={{ display: 'none' }}
                          />
                        </label>

                        {/* Botón subir */}
                        <button
                          type="button"
                          onClick={() => void subirZipASharepoint()}
                          disabled={!puedeSubir}
                          style={{
                            width: '100%', padding: '0.7rem', fontSize: '0.86rem', fontWeight: 700,
                            border: 'none', borderRadius: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            cursor: puedeSubir ? 'pointer' : 'not-allowed',
                            background: puedeSubir ? '#16a34a' : '#e2e8f0',
                            color: puedeSubir ? '#fff' : '#94a3b8',
                            boxShadow: puedeSubir ? '0 2px 8px rgba(22,163,74,0.3)' : 'none',
                            transition: 'all 0.15s',
                          }}
                        >
                          {subiendoZip
                            ? <><span className="gi-contadores-spinner" style={{ width: 15, height: 15 }} /> Subiendo…</>
                            : <>⬆️ Subir fotos a SharePoint</>}
                        </button>

                        {/* Progreso */}
                        {subiendoZip && progresoZip && (
                          <div style={{ padding: '0.6rem 0.85rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, fontSize: '0.78rem', color: '#1d4ed8', fontWeight: 600, textAlign: 'center' }}>
                            {progresoZip}
                          </div>
                        )}

                        {/* Resultado */}
                        {resultadoZip && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '0.75rem 0.95rem', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600,
                            background: resultadoZip.ok ? '#f0fdf4' : '#fef2f2',
                            border: `1.5px solid ${resultadoZip.ok ? '#86efac' : '#fca5a5'}`,
                            color: resultadoZip.ok ? '#15803d' : '#dc2626',
                          }}>
                            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{resultadoZip.ok ? '✅' : '⚠️'}</span>
                            <span style={{ flex: 1 }}>{resultadoZip.mensaje}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </div>

          {/* Footer con acciones */}
          <div className="vehiculos-modal-editar__footer">
            <button className="vehiculos-btn vehiculos-btn--secundario" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            <button
              className="vehiculos-btn vehiculos-btn--primary"
              onClick={handleGenerarPdf}
              disabled={guardando || generandoPdf || cargando}
            >
              {generandoPdf ? 'Generando...' : 'Previsualizar PDF'}
            </button>
            <button
              className="vehiculos-btn vehiculos-btn--guardar"
              onClick={handleGuardar}
              disabled={guardando || cargando}
            >
              {guardando ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal PDF preview */}
      {pdfPreview && (
        <ModalPrevisualizarPdf
          pdfDataUrl={pdfPreview.pdfDataUrl}
          nombreArchivo={pdfPreview.nombreArchivo}
          modo="transfer"
          procesando={false}
          onDescargar={descargarPdf}
          onCerrar={() => setPdfPreview(null)}
        />
      )}
    </>
  )
}


// ─── SUBCOMPONENTE: Campo de input reutilizable ───────────────────────────────

function InputField({ label, value, onChange, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="vehiculos-modal-editar__campo">
      <label className="vehiculos-modal-editar__label">{label}</label>
      <input
        className="vehiculos-modal-editar__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || ''}
      />
    </div>
  )
}
