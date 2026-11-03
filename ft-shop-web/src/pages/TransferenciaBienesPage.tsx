import { useId, useMemo, useState } from 'react'

import { Animacion, EncabezadoV2 } from 'react-ecosistema-unp/ui'
import { FaBoxOpen, FaCheck, FaClipboardList, FaClockRotateLeft, FaFilePdf, FaFileSignature, FaUser } from 'react-icons/fa6'
import { FaSearch } from 'react-icons/fa'
import { StepperInline } from '../components/common/StepperInline'
import type { StepperInlineStep } from '../components/common/StepperInline'
import { ModalPrevisualizarPdf } from '../components/transferencia/ModalPrevisualizarPdf'
import { ReceptorTransferenciaForm } from '../components/transferencia/ReceptorTransferenciaForm'
import { notificacion } from '../services/notificacionService'
import { useTransferencias } from '../context/useTransferencias'
import { UserAvatarChip } from '../components/common/UserAvatarChip'
import { generarPdfPreview, descargarDesdeBase64 } from '../services/pdfTransferenciaService'
import type { Bien, Persona, SolicitudTransferencia, TipoBien } from '../types'
import { personaVacia } from '../utils/generarFormatoDescarga'
import { nombreCompletoEfectivo } from '../utils/persona'
import { dimensionesDesdeDataUrl } from '../utils/pdfDimensiones'

import './TransferenciaBienesPage.css'

interface PdfPendiente {
  pdfDataUrl: string
  nombreArchivo: string
  pdfBase64: string
  tipo: TipoBien
  placas: string[]
  receptorCopia: Persona
  bienesSeleccionados: Bien[]
}

function useSeleccionPorPlaca() {
  const [placas, setPlacas] = useState(() => new Set<string>())
  const toggle = (placa: string) => {
    setPlacas((prev) => {
      const next = new Set(prev)
      if (next.has(placa)) next.delete(placa)
      else next.add(placa)
      return next
    })
  }
  const clear = () => setPlacas(new Set())
  return { placas, toggle, clear }
}

type PestanaSidebar = 'normal' | 'floresta'

export default function TransferenciaBienesPage() {
  const uid = useId()
  const {
    sesionUsuario,
    sesionEstado,
    cedulaSesion,
    inventarioNormal,
    inventarioFloresta,
    crearSolicitudTransferencia,
    historialPorEmisor,
    placasEnProceso,
    placasPendientesInventario,
    transferenciasRevisando,
    solicitudes,
    cancelarSolicitud,
  } = useTransferencias()

  const selNormal = useSeleccionPorPlaca()
  const selFloresta = useSeleccionPorPlaca()
  const [receptor, setReceptor] = useState<Persona>(() => personaVacia())
  const [pestana, setPestana] = useState<PestanaSidebar>('normal')
  const [busqueda, setBusqueda] = useState('')
  const [bienSeleccionado, setBienSeleccionado] = useState<Bien | null>(null)

  // Modal de confirmación — eliminado, flujo inline
  // PDF pendiente de descarga (paso 4: visualización)
  const [pdfPendiente, setPdfPendiente] = useState<PdfPendiente | null>(null)
  const [registrandoTransferencia, setRegistrandoTransferencia] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [camposError, setCamposError] = useState<string[]>([])
  const [pasoActual, setPasoActual] = useState(0)
  // PDF desde historial (paso seguimiento)
  const [pdfHistorial, setPdfHistorial] = useState<{ pdfDataUrl: string; nombreArchivo: string } | null>(null)
  const [regenerandoPdf, setRegenerandoPdf] = useState(false)

  // Aspect-ratio real de cada PDF (detecta vertical vs horizontal desde el propio archivo)
  const aspectPdfPendiente = useMemo(
    () => (pdfPendiente ? dimensionesDesdeDataUrl(pdfPendiente.pdfDataUrl).aspectRatio : null),
    [pdfPendiente],
  )
  const aspectPdfHistorial = useMemo(
    () => (pdfHistorial ? dimensionesDesdeDataUrl(pdfHistorial.pdfDataUrl).aspectRatio : null),
    [pdfHistorial],
  )

  // ── Navegación del stepper ──
  const navegarPaso = (indice: number) => {
    if (indice === pasoActual) return
    // Ir hacia atrás: siempre libre
    if (indice < pasoActual) {
      setPasoActual(indice)
      return
    }
    // Ir hacia adelante: validar paso actual y avanzar 1
    void navegarSiguiente()
  }

  const navegarSiguiente = async () => {
    // Sin bienes transferibles: no se puede iniciar el flujo desde el paso inicial.
    if (todosEnTramite) {
      notificacion.error('Todos tus bienes están en trámite de transferencia. Cancela primero la transferencia activa desde "Mis transferencias".')
      return
    }
    // Validar según el paso actual
    let puedePasar = true
    if (pasoActual === 0) puedePasar = validarPaso1()
    else if (pasoActual === 1) puedePasar = validarPaso2()
    else if (pasoActual === 2) puedePasar = await validarPaso3()
    if (!puedePasar) return
    if (pasoActual < 3) setPasoActual(pasoActual + 1)
  }

  const navegarAnterior = () => {
    if (pasoActual > 0) {
      if (pasoActual === 1) {
        selNormal.clear()
        selFloresta.clear()
      }
      setPasoActual(pasoActual - 1)
    }
  }

  // Bienes filtrados por búsqueda (por tipo). El tab "Bienes" muestra ambos.
  const filtrarPorBusqueda = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (lista: Bien[]) => {
      if (!q) return lista
      return lista.filter(
        (b) =>
          b.placa.toLowerCase().includes(q) ||
          b.descripcion.toLowerCase().includes(q) ||
          (b.serial ?? '').toLowerCase().includes(q) ||
          b.codigo.toLowerCase().includes(q),
      )
    }
  }, [busqueda])

  const normalFiltrados = useMemo(() => filtrarPorBusqueda(inventarioNormal), [filtrarPorBusqueda, inventarioNormal])
  const florestaFiltrados = useMemo(() => filtrarPorBusqueda(inventarioFloresta), [filtrarPorBusqueda, inventarioFloresta])
  const totalBienesFiltrados = normalFiltrados.length + florestaFiltrados.length

  const historial = useMemo(
    () => (sesionUsuario ? historialPorEmisor(sesionUsuario.numeroIdentificacion) : []),
    [historialPorEmisor, sesionUsuario],
  )

  function getEstadoBien(bien: Bien) {
    if (bien.ultimoPrefijo === 'BJ') return { label: 'Baja', clase: 'tb-card__estado--baja' }
    if (bien.pendienteInventario || placasPendientesInventario.has(bien.placa))
      return { label: 'Faltante', clase: 'tb-card__estado--faltante' }
    if (placasEnProceso.has(bien.placa))
      return { label: 'En trámite de transferencia', clase: 'tb-card__estado--proceso' }
    return { label: 'Inventariado', clase: 'tb-card__estado--ok' }
  }

  function estaSeleccionado(bien: Bien): boolean {
    return bien.tipo === 'normal' ? selNormal.placas.has(bien.placa) : selFloresta.placas.has(bien.placa)
  }

  function toggleSeleccion(bien: Bien) {
    if (bien.tipo === 'normal') selNormal.toggle(bien.placa)
    else selFloresta.toggle(bien.placa)
  }

  function estaDeshabilitado(bien: Bien): boolean {
    return placasEnProceso.has(bien.placa) || placasPendientesInventario.has(bien.placa) || bien.ultimoPrefijo === 'BJ'
  }

  const totalSeleccionado = selNormal.placas.size + selFloresta.placas.size
  const totalBienes = inventarioNormal.length + inventarioFloresta.length

  // Bienes para el resumen (paso 3) — separados por tipo
  const bienesParaResumen = useMemo(() => {
    const bienesN = inventarioNormal.filter((b) => selNormal.placas.has(b.placa))
    const bienesF = inventarioFloresta.filter((b) => selFloresta.placas.has(b.placa))
    return [...bienesN, ...bienesF]
  }, [selNormal.placas, selFloresta.placas, inventarioNormal, inventarioFloresta])

  // Bienes para la selección (paso 2) — ambos tipos, separados por sección
  const totalParaSeleccion = inventarioNormal.length + inventarioFloresta.length
  const todosEnTramite = totalParaSeleccion > 0 && [...inventarioNormal, ...inventarioFloresta].every(b => estaDeshabilitado(b))
  // Hay bienes que aún se pueden transferir (al menos uno no deshabilitado)
  const hayBienesDisponibles = [...inventarioNormal, ...inventarioFloresta].some(b => !estaDeshabilitado(b))

  // ── Validación para handleNextClick del stepper ──
  // Retorna boolean + muestra toast indicando qué falta.
  const validarPaso1 = (): boolean => {
    const faltantes: string[] = []
    const nombre = nombreCompletoEfectivo(receptor)
    if (!nombre) faltantes.push('nombre')
    if (!receptor.numeroIdentificacion?.trim()) faltantes.push('documento')
    if (!receptor.cargo?.trim()) faltantes.push('cargo')
    if (!receptor.dependencia?.trim()) faltantes.push('dependencia')
    if (!receptor.grupo?.trim()) faltantes.push('grupo')
    if (!receptor.sede?.trim()) faltantes.push('sede')

    setCamposError(faltantes)
    if (faltantes.length > 0) {
      // Si no se ha seleccionado a nadie (todos vacíos), mensaje genérico
      if (faltantes.length === 6) {
        notificacion.error('Busque por cédula o nombre, seleccione una coincidencia y complete los datos del receptor.')
      } else {
        const labels: Record<string, string> = { nombre: 'Nombre', documento: 'Identificación', cargo: 'Cargo', dependencia: 'Dependencia', grupo: 'Grupo', sede: 'Sede' }
        notificacion.error(`Complete los campos faltantes: ${faltantes.map(f => labels[f]).join(', ')}`)
      }
      return false
    }
    return true
  }

  const validarPaso2 = (): boolean => {
    if (totalSeleccionado === 0) {
      if (todosEnTramite) {
        notificacion.error('No puedes continuar. Todos tus bienes están en trámite de transferencia.')
      } else {
        notificacion.error('Seleccione al menos un bien para transferir.')
      }
      return false
    }
    return true
  }

  const validarPaso3 = async (): Promise<boolean> => {
    const faltantes: string[] = []
    const nombre = nombreCompletoEfectivo(receptor)
    if (!nombre) faltantes.push('Nombre')
    if (!receptor.numeroIdentificacion?.trim()) faltantes.push('Identificación')
    if (!receptor.cargo?.trim()) faltantes.push('Cargo')
    if (!receptor.dependencia?.trim()) faltantes.push('Dependencia')
    if (!receptor.grupo?.trim()) faltantes.push('Grupo')
    if (!receptor.sede?.trim()) faltantes.push('Sede')
    if (faltantes.length > 0) {
      setCamposError(faltantes.map(f => f.toLowerCase()))
      notificacion.error(`Complete los datos de quien recibe: ${faltantes.join(', ')}`)
      return false
    }
    if (totalSeleccionado === 0) {
      if (todosEnTramite) {
        notificacion.error('No puedes continuar. Todos tus bienes están en trámite de transferencia.')
      } else {
        notificacion.error('Seleccione al menos un bien para transferir.')
      }
      return false
    }
    // Generar PDF solo si no existe ya
    if (!pdfPendiente) {
      const tipo: TipoBien = selNormal.placas.size > 0 ? 'normal' : 'floresta'
      await generarPdfDirecto(tipo)
    }
    return true
  }


  // ── Generar PDF directamente (sin modal) ──
  const generarPdfDirecto = async (tipo: TipoBien): Promise<boolean> => {
    if (!sesionUsuario) return false
    setGenerandoPdf(true)

    const placas = tipo === 'normal' ? [...selNormal.placas] : [...selFloresta.placas]
    const lista = tipo === 'normal' ? inventarioNormal : inventarioFloresta
    const bienesSeleccionados = lista.filter((b) => placas.includes(b.placa))
    const receptorCopia = { ...receptor }

    try {
      notificacion.info('Generando PDF, por favor espere...')
      const prefijoTemp = tipo === 'floresta' ? 'TRF-F' : 'TRF'
      const codigoTemp = `${prefijoTemp}-${new Date().getFullYear()}-PREV`
      const result = await generarPdfPreview(codigoTemp, sesionUsuario, receptorCopia, bienesSeleccionados)
      const pdfBase64 = result.pdfDataUrl.replace('data:application/pdf;base64,', '')
      setPdfPendiente({ pdfDataUrl: result.pdfDataUrl, nombreArchivo: result.nombreArchivo, pdfBase64, tipo, placas, receptorCopia, bienesSeleccionados })
      setTimeout(() => { notificacion.exito('PDF generado correctamente') }, 100)
      return true
    } catch (e) {
      notificacion.error(e instanceof Error ? e.message : 'Error generando PDF')
      return false
    } finally {
      setGenerandoPdf(false)
    }
  }

  const descargarYRegistrar = async () => {
    if (!pdfPendiente) return
    setRegistrandoTransferencia(true)
    try {
      const res = await crearSolicitudTransferencia(pdfPendiente.tipo, pdfPendiente.placas, pdfPendiente.receptorCopia, { pdfBase64: pdfPendiente.pdfBase64, nombreArchivoPdf: pdfPendiente.nombreArchivo })
      if (!res.ok) { notificacion.error('mensaje' in res ? res.mensaje : 'Error al registrar'); setRegistrandoTransferencia(false); return }
      const codigoReal = 'codigo' in res ? res.codigo : null
      if (codigoReal && sesionUsuario) {
        try { const pdfFinal = await generarPdfPreview(codigoReal, sesionUsuario, pdfPendiente.receptorCopia, pdfPendiente.bienesSeleccionados); descargarDesdeBase64(pdfFinal.pdfDataUrl, pdfFinal.nombreArchivo) }
        catch { descargarDesdeBase64(pdfPendiente.pdfDataUrl, pdfPendiente.nombreArchivo) }
      } else { descargarDesdeBase64(pdfPendiente.pdfDataUrl, pdfPendiente.nombreArchivo) }
      if (pdfPendiente.tipo === 'normal') selNormal.clear(); else selFloresta.clear()
      setPdfPendiente(null)
      setPasoActual(0) // reiniciar el stepper al primer paso
      setVistaActual('detalle-bien')
      setBienSeleccionado(null)
      setReceptor(personaVacia())
      notificacion.exito('Transferencia registrada correctamente. PDF descargado.')
    } catch (e) { notificacion.error(e instanceof Error ? e.message : 'Error registrando transferencia') }
    finally { setRegistrandoTransferencia(false) }
  }

  const abrirPdfHistorial = async (solicitud: SolicitudTransferencia) => {
    if (regenerandoPdf) return
    if (solicitud.pdfBase64) { setPdfHistorial({ pdfDataUrl: `data:application/pdf;base64,${solicitud.pdfBase64}`, nombreArchivo: solicitud.nombreArchivoPdf || `Transferencia-${solicitud.codigo}.pdf` }); return }
    setRegenerandoPdf(true)
    notificacion.info('Regenerando PDF...')
    try {
      const resultado = await generarPdfPreview(solicitud.codigo, solicitud.emisor, solicitud.receptor, solicitud.bienes)
      setPdfHistorial({ pdfDataUrl: resultado.pdfDataUrl, nombreArchivo: resultado.nombreArchivo })
      setTimeout(() => { notificacion.exito('PDF listo') }, 100)
    } catch { notificacion.error('No se pudo generar el PDF.') }
    finally { setRegenerandoPdf(false) }
  }

  const descargarPdfHistorial = () => { if (pdfHistorial) descargarDesdeBase64(pdfHistorial.pdfDataUrl, pdfHistorial.nombreArchivo) }
  const cerrarPdfHistorial = () => { setPdfHistorial(null) }

  function formatFecha(iso: string): string { return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  function etiquetaEstado(estado: string): string { switch (estado) { case 'pendiente': return 'En proceso'; case 'aceptada': return 'Aceptada'; case 'rechazada': return 'Rechazada'; default: return estado } }

  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState<SolicitudTransferencia | null>(null)

  // Card de un bien en el panel izquierdo (reutilizable para UNP y Floresta)
  const renderBienCard = (bien: Bien) => {
    const estado = getEstadoBien(bien)
    const isSelected = bienSeleccionado?.placa === bien.placa
    const isChecked = estaSeleccionado(bien)
    const disabled = estaDeshabilitado(bien)
    return (
      <button key={bien.placa} type="button" className={`tb-card${isSelected ? ' is-selected' : ''}${isChecked ? ' is-checked' : ''}${disabled ? ' is-disabled' : ''}`} onClick={() => { setBienSeleccionado(bien); setVistaActual('detalle-bien') }}>
        <div className="tb-card__data">
          <span className="tb-card__placa">{bien.placa}</span>
          <span className="tb-card__desc">{bien.descripcion}</span>
          <div className="tb-card__meta">
            <span>{bien.serial || 'Sin serial'}</span>
          </div>
        </div>
        <span className={`tb-card__estado ${estado.clase}`}>{estado.label}</span>
      </button>
    )
  }

  // Item de selección (paso 2), reutilizable para UNP y Floresta
  const renderSeleccionItem = (bien: Bien) => {
    const selected = estaSeleccionado(bien)
    const disabled = estaDeshabilitado(bien)
    return (
      <div key={bien.placa} className={`tb-seleccion-item${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`} onClick={() => { if (!disabled) toggleSeleccion(bien) }} role="checkbox" aria-checked={selected} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !disabled) { e.preventDefault(); toggleSeleccion(bien) } }}>
        <span className="tb-seleccion-item__check">{selected && <FaCheck size={11} />}</span>
        <div className="tb-seleccion-item__info">
          <span className="tb-seleccion-item__placa">{bien.placa}</span>
          <span className="tb-seleccion-item__desc">{bien.descripcion}</span>
          <span className="tb-seleccion-item__meta">{bien.serial || 'Sin serial'}</span>
          {disabled && <span className="tb-seleccion-item__bloqueado">{getEstadoBien(bien).label}</span>}
        </div>
      </div>
    )
  }

  // ── Panel Izquierdo: tabs "Bienes" (UNP + Floresta) / "Mis transferencias" ──
  const panelIzquierdo = (
    <aside className="transferencia-panel tb-sidebar">
      <div className="tb-sidebar__top">
        <h2 className="tb-sidebar__heading">{pestana === 'floresta' ? 'Mis transferencias' : 'Inventario por responsable'}</h2>
        <span className="tb-sidebar__count">{pestana === 'floresta' ? historial.length : totalBienesFiltrados}</span>
      </div>

      {/* Tabs Bienes / Mis transferencias */}
      <div className="tb-sidebar__tabs">
        <button type="button" className={`tb-sidebar__tab${pestana === 'normal' ? ' is-active' : ''}`} onClick={() => { setPestana('normal'); setBienSeleccionado(null) }}>
          Bienes <span className="tb-sidebar__tab-count">{totalBienes}</span>
        </button>
        <button type="button" className={`tb-sidebar__tab${pestana === 'floresta' ? ' is-active' : ''}`} onClick={() => { setPestana('floresta'); setBienSeleccionado(null) }}>
          Mis transferencias <span className="tb-sidebar__tab-count">{historial.length}</span>
        </button>
      </div>

      {pestana === 'normal' ? (
        <>
          <div className="tb-sidebar__search">
            <div className="tb-sidebar__search-control">
              <FaSearch className="tb-sidebar__search-icon" />
              <input className="tb-sidebar__search-input" type="search" placeholder="Buscar placa, descripción..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoComplete="off" />
            </div>
          </div>

          <div className="tb-sidebar__list">
            {totalBienesFiltrados === 0 ? (
              <div className="tb-empty"><p className="tb-empty__desc">No se encontraron bienes.</p></div>
            ) : (
              <>
                {normalFiltrados.length > 0 && (
                  <>
                    <div className="tb-sidebar__section-header">
                      <span>UNP</span>
                      <span className="tb-sidebar__section-count">{normalFiltrados.length}</span>
                    </div>
                    {normalFiltrados.map(renderBienCard)}
                  </>
                )}
                {florestaFiltrados.length > 0 && (
                  <>
                    <div className="tb-sidebar__section-header tb-sidebar__section-header--floresta">
                      <span>Floresta</span>
                      <span className="tb-sidebar__section-count">{florestaFiltrados.length}</span>
                    </div>
                    {florestaFiltrados.map(renderBienCard)}
                  </>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="tb-sidebar__list tb-sidebar__list--historial">
          {historial.length === 0 ? (
            <div className="tb-empty">
              <div className="tb-empty__icon"><FaClockRotateLeft /></div>
              <strong className="tb-empty__title">Sin transferencias</strong>
              <p className="tb-empty__desc">Cuando registre una transferencia aparecerá aquí.</p>
            </div>
          ) : (
            <div className="tb-timeline">
              {[...historial].sort((a, b) => new Date(b.fechaISO).getTime() - new Date(a.fechaISO).getTime()).map((s) => {
                const esRevisando = transferenciasRevisando?.has(s.codigo)
                const isActive = solicitudSeleccionada?.codigo === s.codigo
                return (
                  <div key={s.codigo} className={`tb-timeline__item tb-timeline__item--clickable${s.estado === 'rechazada' ? ' tb-timeline__item--rechazada' : ''}${s.estado === 'aceptada' ? ' tb-timeline__item--aceptada' : ''}${isActive ? ' tb-timeline__item--active' : ''}`} onClick={() => { setSolicitudSeleccionada(s); setVistaActual('seguimiento') }}>
                    <span className={`tb-timeline__dot tb-timeline__dot--${esRevisando ? 'revisando' : s.estado}`} />
                    <div className="tb-timeline__codigo">{s.codigo}</div>
                    <div className="tb-timeline__fecha">{formatFecha(s.fechaISO)}</div>
                    {esRevisando ? (
                      <span className="tb-timeline__estado tb-timeline__estado--revisando tb-timeline__estado--corner">Revisando<span className="tb-timeline__typing-dots"><span>.</span><span>.</span><span>.</span></span></span>
                    ) : (
                      <span className={`tb-timeline__estado tb-timeline__estado--${s.estado} tb-timeline__estado--corner`}>{etiquetaEstado(s.estado)}</span>
                    )}
                    <div className="tb-timeline__receptor">→ {s.receptor.nombreCompleto}</div>
                    <div className="tb-timeline__bienes-count">{s.bienes.length} bien{s.bienes.length > 1 ? 'es' : ''} · {s.tipoBien === 'floresta' ? 'Floresta' : 'UNP'}</div>
                    {s.emisor.dependencia && <div className="tb-timeline__bienes-count">{s.emisor.dependencia}</div>}
                    {s.consecutivoTns && <div className="tb-timeline__tns">TNS: {s.consecutivoTns}</div>}
                    {s.observacionRechazo && <div className="tb-timeline__obs-rechazo">{s.observacionRechazo}</div>}
                    {s.estado === 'pendiente' && !esRevisando && (
                      <button type="button" className="tb-timeline__btn-cancelar" onClick={(e) => { e.stopPropagation(); void handleCancelar(s.codigo) }}>Cancelar trans.</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  )

  // ── Stepper visual (componente reutilizable dentro del panel central) ──
  const pasosInfo: StepperInlineStep[] = [
    { label: 'Quien recibe', icon: FaUser },
    { label: 'Selección', icon: FaClipboardList },
    { label: 'Confirmar', icon: FaFileSignature },
    { label: 'Formato PDF', icon: FaFilePdf },
  ]
  const stepperVisual = <StepperInline steps={pasosInfo} currentStep={pasoActual} onStepChange={navegarPaso} />

  // ── StepperV2 steps con validación handleNextClick ──
  const pasosProceso = [
    {
      label: 'Quien recibe',
      icon: FaUser,
      handleNextClick: validarPaso1,
      content: (
        <div className="transferencia-layout">
          {panelIzquierdo}
          <main className="transferencia-panel tb-central">
            {stepperVisual}
            {todosEnTramite ? (
              /* Sin bienes transferibles: avisar de inmediato, sin permitir
                 iniciar el flujo. Los paneles laterales siguen disponibles. */
              <>
                <div className="tb-central__header">
                  <div>
                    <h3 className="tb-central__title">No puedes iniciar una transferencia</h3>
                    <p className="tb-central__subtitle">Revisa el estado de tus bienes antes de continuar.</p>
                  </div>
                </div>
                <div className="tb-central__body">
                  <div className="tb-empty">
                    <div className="tb-empty__icon"><FaBoxOpen /></div>
                    <strong className="tb-empty__title" style={{ fontSize: '1.1rem' }}>Todos tus bienes están en trámite</strong>
                    <p className="tb-empty__desc" style={{ maxWidth: '440px', lineHeight: 1.7, fontSize: '0.95rem' }}>
                      Actualmente todos tus bienes se encuentran en un proceso de transferencia activo.
                    </p>
                    <p className="tb-empty__desc" style={{ maxWidth: '440px', lineHeight: 1.7, fontSize: '0.95rem', marginTop: '0.5rem' }}>
                      Si necesitas enviar un bien a otra persona, primero cancela la transferencia vigente desde el panel{' '}
                      <strong
                        style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                        onClick={() => { setPestana('floresta'); setBienSeleccionado(null) }}
                        onMouseEnter={() => {
                          const tab = document.querySelector('.tb-sidebar__tab:nth-child(2)') as HTMLElement
                          if (tab) { tab.style.transition = 'all 0.3s'; tab.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.4)'; tab.style.transform = 'scale(1.05)' }
                        }}
                        onMouseLeave={() => {
                          const tab = document.querySelector('.tb-sidebar__tab:nth-child(2)') as HTMLElement
                          if (tab) { tab.style.boxShadow = ''; tab.style.transform = '' }
                        }}
                      >
                        "Mis transferencias" ←
                      </strong>
                      {' '}y luego inicia una nueva.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="tb-central__header">
                  <div>
                    <h3 className="tb-central__title">Datos de quien recibe</h3>
                    <p className="tb-central__subtitle">Complete la información de la persona que recibirá los bienes.</p>
                  </div>
                </div>
                <div className="tb-central__body">
                  <ReceptorTransferenciaForm idPrefijo={`${uid}-rec`} valor={receptor} onChange={(p) => { setReceptor(p); if (camposError.length > 0) setCamposError([]) }} camposError={camposError} />
                </div>
                <div className="tb-central__footer">
                  <button type="button" className="tb-btn tb-btn--primary" onClick={() => void navegarSiguiente()}>Siguiente</button>
                </div>
              </>
            )}
          </main>
        </div>
      ),
    },
    {
      label: 'Selección',
      icon: FaClipboardList,
      handleNextClick: () => {
        if (totalSeleccionado === 0) {
          if (todosEnTramite) {
            notificacion.error('Todos tus bienes están en trámite de transferencia. Si necesitas transferir a otra persona, cancela primero la transferencia activa desde "Mis transferencias".')
          } else {
            notificacion.error('Seleccione al menos un bien para transferir.')
          }
          return false
        }
        return true
      },
      content: (
        <div className="transferencia-layout">
          {panelIzquierdo}
          <main className="transferencia-panel tb-central">
            {stepperVisual}
            <div className="tb-central__header">
              <div>
                <h3 className="tb-central__title">Seleccionar bienes</h3>
                <p className="tb-central__subtitle">
                  Seleccione los bienes UNP y/o Floresta que desea transferir.
                  {' '}Seleccionados: <strong>{totalSeleccionado}</strong>
                </p>
              </div>
            </div>
            <div className="tb-central__body">
              {totalParaSeleccion === 0 ? (
                <div className="tb-empty">
                  <div className="tb-empty__icon"><FaBoxOpen /></div>
                  <strong className="tb-empty__title">Sin bienes</strong>
                  <p className="tb-empty__desc">No tienes bienes para transferir.</p>
                </div>
              ) : todosEnTramite ? (
                <div className="tb-empty">
                  <div className="tb-empty__icon"><FaBoxOpen /></div>
                  <strong className="tb-empty__title" style={{ fontSize: '1.1rem' }}>Todos tus bienes están en trámite</strong>
                  <p className="tb-empty__desc" style={{ maxWidth: '440px', lineHeight: 1.7, fontSize: '0.95rem' }}>
                    Actualmente todos tus bienes se encuentran en un proceso de transferencia activo.
                  </p>
                  <p className="tb-empty__desc" style={{ maxWidth: '440px', lineHeight: 1.7, fontSize: '0.95rem', marginTop: '0.5rem' }}>
                    Si necesitas enviar un bien a otra persona, primero cancela la transferencia vigente desde el panel{' '}
                    <strong
                      style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                      onClick={() => { setPestana('floresta'); setBienSeleccionado(null) }}
                      onMouseEnter={() => {
                        const tab = document.querySelector('.tb-sidebar__tab:nth-child(2)') as HTMLElement
                        if (tab) { tab.style.transition = 'all 0.3s'; tab.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.4)'; tab.style.transform = 'scale(1.05)' }
                      }}
                      onMouseLeave={() => {
                        const tab = document.querySelector('.tb-sidebar__tab:nth-child(2)') as HTMLElement
                        if (tab) { tab.style.boxShadow = ''; tab.style.transform = '' }
                      }}
                    >
                      "Mis transferencias" ←
                    </strong>
                    {' '}y luego inicia una nueva.
                  </p>
                </div>
              ) : (
                <>
                  {inventarioNormal.length > 0 && (
                    <>
                      <div className="tb-seleccion-section-title">UNP <span>{inventarioNormal.length}</span></div>
                      <div className="tb-seleccion-grid">
                        {inventarioNormal.map((bien) => renderSeleccionItem(bien))}
                      </div>
                    </>
                  )}
                  {inventarioFloresta.length > 0 && (
                    <>
                      <div className="tb-seleccion-section-title tb-seleccion-section-title--floresta">Floresta <span>{inventarioFloresta.length}</span></div>
                      <div className="tb-seleccion-grid">
                        {inventarioFloresta.map((bien) => renderSeleccionItem(bien))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="tb-central__footer">
              <button type="button" className="tb-btn tb-btn--secondary" onClick={navegarAnterior}>Anterior</button>
              <button type="button" className="tb-btn tb-btn--primary" onClick={() => void navegarSiguiente()} disabled={todosEnTramite}>Siguiente</button>
            </div>
          </main>
        </div>
      ),
    },

    {
      label: 'Confirmar',
      icon: FaFileSignature,
      handleNextClick: () => {
        // Validar receptor y bienes, luego generar PDF
        const faltantes: string[] = []
        const nombre = nombreCompletoEfectivo(receptor)
        if (!nombre) faltantes.push('Nombre')
        if (!receptor.numeroIdentificacion?.trim()) faltantes.push('Identificación')
        if (!receptor.cargo?.trim()) faltantes.push('Cargo')
        if (!receptor.dependencia?.trim()) faltantes.push('Dependencia')
        if (!receptor.grupo?.trim()) faltantes.push('Grupo')
        if (!receptor.sede?.trim()) faltantes.push('Sede')
        if (faltantes.length > 0) {
          setCamposError(faltantes.map(f => f.toLowerCase()))
          notificacion.error(`Complete los datos de quien recibe: ${faltantes.join(', ')}`)
          return false
        }
        if (totalSeleccionado === 0) {
          if (todosEnTramite) {
            notificacion.error('No puedes continuar. Todos tus bienes están en trámite de transferencia.')
          } else {
            notificacion.error('Seleccione al menos un bien para transferir.')
          }
          return false
        }
        // Generar PDF solo si no existe ya
        if (!pdfPendiente) {
          const tipo: TipoBien = selNormal.placas.size > 0 ? 'normal' : 'floresta'
          void generarPdfDirecto(tipo)
        }
        return true
      },
      content: (
        <div className="transferencia-layout">
          {panelIzquierdo}
          <main className="transferencia-panel tb-central">
            {stepperVisual}
            <div className="tb-central__header">
              <div>
                <h3 className="tb-central__title">Confirmar solicitud de transferencia</h3>
                <p className="tb-central__subtitle">Verifique los datos antes de confirmar.</p>
              </div>
            </div>
            <div className="tb-central__body">
              {/* Stats cards visuales */}
              <div className="tb-confirmar__stats">
                <div className="tb-confirmar__stat-card tb-confirmar__stat-card--tipo">
                  <div className="tb-confirmar__stat-icon"><FaClipboardList size={18} /></div>
                  <div className="tb-confirmar__stat-data">
                    <span className="tb-confirmar__stat-value">{selNormal.placas.size > 0 && selFloresta.placas.size > 0 ? 'UNP + Floresta' : selFloresta.placas.size > 0 ? 'Floresta' : 'UNP'}</span>
                    <span className="tb-confirmar__stat-label">Tipo de bienes</span>
                  </div>
                </div>
                <div className="tb-confirmar__stat-card tb-confirmar__stat-card--cantidad">
                  <div className="tb-confirmar__stat-icon"><FaBoxOpen size={18} /></div>
                  <div className="tb-confirmar__stat-data">
                    <span className="tb-confirmar__stat-value">{bienesParaResumen.length}</span>
                    <span className="tb-confirmar__stat-label">Bienes seleccionados</span>
                  </div>
                </div>
                {selNormal.placas.size > 0 && selFloresta.placas.size > 0 && (
                  <>
                    <div className="tb-confirmar__stat-card tb-confirmar__stat-card--unp">
                      <div className="tb-confirmar__stat-data">
                        <span className="tb-confirmar__stat-value">{selNormal.placas.size}</span>
                        <span className="tb-confirmar__stat-label">UNP</span>
                      </div>
                    </div>
                    <div className="tb-confirmar__stat-card tb-confirmar__stat-card--floresta">
                      <div className="tb-confirmar__stat-data">
                        <span className="tb-confirmar__stat-value">{selFloresta.placas.size}</span>
                        <span className="tb-confirmar__stat-label">Floresta</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Personas: tarjetas visuales */}
              <div className="tb-confirmar__personas">
                <div className="tb-confirmar__persona tb-confirmar__persona--emisor">
                  <div className="tb-confirmar__persona-badge">
                    <FaUser size={14} />
                  </div>
                  <h4 className="tb-confirmar__persona-titulo">Entregado por (usted)</h4>
                  <p className="tb-confirmar__persona-nombre">{sesionUsuario?.nombreCompleto ?? '—'}</p>
                  <p className="tb-confirmar__persona-doc">{sesionUsuario?.tipoIdentificacion} {sesionUsuario?.numeroIdentificacion}</p>
                  <div className="tb-confirmar__persona-datos">
                    {sesionUsuario?.cargo && <span><strong>Cargo:</strong> {sesionUsuario.cargo}</span>}
                    {sesionUsuario?.dependencia && <span><strong>Dependencia:</strong> {sesionUsuario.dependencia}</span>}
                    {sesionUsuario?.grupo && <span><strong>Grupo:</strong> {sesionUsuario.grupo}</span>}
                  </div>
                </div>
                <div className="tb-confirmar__persona-arrow">→</div>
                <div className="tb-confirmar__persona tb-confirmar__persona--receptor">
                  <div className="tb-confirmar__persona-badge">
                    <FaUser size={14} />
                  </div>
                  <h4 className="tb-confirmar__persona-titulo">Quien recibe</h4>
                  <p className="tb-confirmar__persona-nombre">{nombreCompletoEfectivo(receptor) || '—'}</p>
                  <p className="tb-confirmar__persona-doc">{receptor.tipoIdentificacion} {receptor.numeroIdentificacion}</p>
                  <div className="tb-confirmar__persona-datos">
                    {receptor.cargo && <span><strong>Cargo:</strong> {receptor.cargo}</span>}
                    {receptor.dependencia && <span><strong>Dependencia:</strong> {receptor.dependencia}</span>}
                    {receptor.grupo && <span><strong>Grupo:</strong> {receptor.grupo}</span>}
                    {receptor.sede && <span><strong>Sede:</strong> {receptor.sede}</span>}
                  </div>
                </div>
              </div>

              {/* Bienes como cards */}
              <div className="tb-confirmar__bienes">
                <h4 className="tb-confirmar__bienes-titulo">Bienes incluidos ({bienesParaResumen.length})</h4>
                <div className="tb-confirmar__bienes-grid">
                  {bienesParaResumen.map((b) => (
                    <div key={b.placa} className="tb-confirmar__bien-card">
                      <div className="tb-confirmar__bien-card-header">
                        <code className="tb-confirmar__bien-card-placa">{b.placa}</code>
                        <span className={`tb-confirmar__bien-card-tipo ${b.tipo === 'floresta' ? 'tb-confirmar__bien-card-tipo--floresta' : ''}`}>{b.tipo === 'floresta' ? 'Floresta' : 'UNP'}</span>
                      </div>
                      <p className="tb-confirmar__bien-card-desc">{b.descripcion}</p>
                      <div className="tb-confirmar__bien-card-meta">
                        {b.serial && <span>Serial: {b.serial}</span>}
                        {b.nombreDependencia && <span>{b.nombreDependencia}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer con botones como el modal */}
            {/* Footer sin botones — el PDF se genera al dar Siguiente */}
            <div className="tb-central__footer">
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                {selNormal.placas.size > 0 && selFloresta.placas.size > 0
                  ? `Se generarán 2 formatos independientes: UNP (${selNormal.placas.size}) y Floresta (${selFloresta.placas.size})`
                  : `Al continuar se generará el formato ${selFloresta.placas.size > 0 ? 'Floresta' : 'UNP'} con ${bienesParaResumen.length} bienes`
                }
              </p>
            </div>
            <div className="tb-central__footer">
              <button type="button" className="tb-btn tb-btn--secondary" onClick={navegarAnterior}>Anterior</button>
              <button type="button" className="tb-btn tb-btn--primary" onClick={() => void navegarSiguiente()}>Siguiente</button>
            </div>
          </main>
        </div>
      ),
    },
    {
      label: 'Formato PDF',
      icon: FaFilePdf,
      content: (
        <div className="transferencia-layout">
          {panelIzquierdo}
          <main className="transferencia-panel tb-central">
            {stepperVisual}
            <div className="tb-central__header">
              <div>
                <h3 className="tb-central__title">Visualización del formato</h3>
                <p className="tb-central__subtitle">Revise el PDF generado y confirme para registrar la transferencia.</p>
              </div>
            </div>
            <div className="tb-central__body tb-central__body--pdf">
              {generandoPdf ? (
                <div className="tb-empty">
                  <Animacion type="loading_duck" width={140} />
                  <strong className="tb-empty__title">Generando formato...</strong>
                  <p className="tb-empty__desc">Esto puede tomar unos segundos.</p>
                </div>
              ) : !pdfPendiente ? (
                <div className="tb-empty">
                  <div className="tb-empty__icon"><FaFilePdf /></div>
                  <strong className="tb-empty__title">PDF no disponible</strong>
                  <p className="tb-empty__desc">Genere el formato para continuar.</p>
                  <button type="button" className="tb-btn tb-btn--primary" style={{ marginTop: 10 }} onClick={() => void generarPdfDirecto(selNormal.placas.size > 0 ? 'normal' : 'floresta')} disabled={totalSeleccionado === 0 || generandoPdf}>
                    {generandoPdf ? 'Generando...' : 'Generar formato'}
                  </button>
                </div>
              ) : (
                <div className="tb-pdf-inline">
                  <div className="tb-pdf-inline__frame" style={aspectPdfPendiente ? { aspectRatio: String(aspectPdfPendiente) } : undefined}>
                    <iframe src={`${pdfPendiente.pdfDataUrl}#toolbar=0&navpanes=0&view=FitH`} title="Vista previa del formato de transferencia" />
                  </div>
                </div>
              )}
            </div>
            <div className="tb-central__footer">
              <button type="button" className="tb-btn tb-btn--secondary" onClick={navegarAnterior}>Anterior</button>
              {pdfPendiente && (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button type="button" className="tb-btn tb-btn--confirm" onClick={() => void descargarYRegistrar()} disabled={registrandoTransferencia}
                      onMouseEnter={(e) => {
                        const tooltip = e.currentTarget.nextElementSibling as HTMLElement
                        if (tooltip) tooltip.style.opacity = '1'
                      }}
                      onMouseLeave={(e) => {
                        const tooltip = e.currentTarget.nextElementSibling as HTMLElement
                        if (tooltip) tooltip.style.opacity = '0'
                      }}
                    >
                      {registrandoTransferencia ? 'Registrando...' : 'Registrar transferencia'}
                    </button>
                    <span style={{
                      position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
                      background: '#1e293b', color: '#fff', fontSize: '0.75rem', fontWeight: 500,
                      padding: '0.5rem 0.85rem', borderRadius: '8px', whiteSpace: 'nowrap',
                      opacity: 0, transition: 'opacity 0.2s ease', pointerEvents: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}>
                      Se descargará el PDF y quedará registrada tu transferencia
                      <span style={{
                        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                        border: '6px solid transparent', borderTopColor: '#1e293b',
                      }} />
                    </span>
                  </div>
              )}
            </div>
          </main>
        </div>
      ),
    },
  ]

  const [vistaActual, setVistaActual] = useState<'stepper' | 'seguimiento' | 'detalle-bien'>('stepper')

  // Contenido de Seguimiento — detalle de solicitud seleccionada
  // Posición en cola: basada en código secuencial TRF-YYYY-NNNNN
  function posicionEnCola(sol: SolicitudTransferencia): number | null {
    if (sol.estado !== 'pendiente') return null
    // Extraer número secuencial del código (TRF-2026-00020 → 20)
    const match = sol.codigo.match(/(\d+)$/)
    if (!match) return null
    const miNumero = parseInt(match[1], 10)

    // Buscar la última transferencia procesada (aceptada/rechazada) con mayor número
    let ultimoProcesado = 0
    for (const s of solicitudes) {
      if (s.estado === 'aceptada' || s.estado === 'rechazada') {
        const m = s.codigo.match(/(\d+)$/)
        if (m) {
          const n = parseInt(m[1], 10)
          if (n > ultimoProcesado) ultimoProcesado = n
        }
      }
    }

    const pendientesAntes = miNumero - ultimoProcesado
    return pendientesAntes > 0 ? pendientesAntes : 1
  }

  const handleCancelar = async (codigo: string) => {
    const res = await cancelarSolicitud(codigo)
    if (res.ok) {
      notificacion.exito('Transferencia cancelada correctamente.')
      setSolicitudSeleccionada(null)
      setVistaActual('stepper')
    } else {
      notificacion.error(res.mensaje || 'No se pudo cancelar.')
    }
  }

  const contenidoSeguimiento = (
    <div className="tb-central__body">
      {pdfHistorial ? (
        <div className="tb-pdf-inline">
          <div className="tb-pdf-inline__frame" style={aspectPdfHistorial ? { aspectRatio: String(aspectPdfHistorial) } : undefined}>
            <iframe src={`${pdfHistorial.pdfDataUrl}#toolbar=0&navpanes=0&view=FitH`} title="PDF de transferencia" />
          </div>
          <div className="tb-pdf-inline__actions">
            <button type="button" className="tb-btn tb-btn--secondary" onClick={() => setPdfHistorial(null)}>Volver al detalle</button>
            <button type="button" className="tb-btn tb-btn--secondary" onClick={descargarPdfHistorial}>Descargar PDF</button>
          </div>
        </div>
      ) : regenerandoPdf ? (
        <div className="tb-empty">
          <Animacion type="loading_duck" width={120} />
          <strong className="tb-empty__title">Cargando PDF...</strong>
        </div>
      ) : solicitudSeleccionada ? (() => {
        const esRevisando = transferenciasRevisando?.has(solicitudSeleccionada.codigo)
        const cola = posicionEnCola(solicitudSeleccionada)
        return (
          <div className="tb-resumen">
            {/* Stats: código, bienes, estado, cola */}
            <div className="tb-confirmar__stats">
              <div className="tb-confirmar__stat-card tb-confirmar__stat-card--tipo">
                <div className="tb-confirmar__stat-data">
                  <span className="tb-confirmar__stat-label">Código</span>
                  <span className="tb-confirmar__stat-value">{solicitudSeleccionada.codigo}</span>
                </div>
              </div>
              <div className="tb-confirmar__stat-card tb-confirmar__stat-card--cantidad">
                <div className="tb-confirmar__stat-data">
                  <span className="tb-confirmar__stat-label">Bienes</span>
                  <span className="tb-confirmar__stat-value">{solicitudSeleccionada.bienes.length}</span>
                </div>
              </div>
              <div className="tb-confirmar__stat-card">
                <div className="tb-confirmar__stat-data">
                  <span className="tb-confirmar__stat-label">Estado</span>
                  {esRevisando ? (
                    <span className="tb-timeline__estado tb-timeline__estado--revisando">Revisando<span className="tb-timeline__typing-dots"><span>.</span><span>.</span><span>.</span></span></span>
                  ) : (
                    <span className={`tb-timeline__estado tb-timeline__estado--${solicitudSeleccionada.estado}`}>{etiquetaEstado(solicitudSeleccionada.estado)}</span>
                  )}
                </div>
              </div>
              {cola !== null && (
                <div className="tb-confirmar__stat-card tb-confirmar__stat-card--cola">
                  <div className="tb-confirmar__stat-data">
                    <span className="tb-confirmar__stat-label">En cola</span>
                    <span className="tb-confirmar__stat-value">#{cola}</span>
                  </div>
                </div>
              )}
              {solicitudSeleccionada.consecutivoTns && (
                <div className="tb-confirmar__stat-card tb-confirmar__stat-card--cantidad">
                  <div className="tb-confirmar__stat-data">
                    <span className="tb-confirmar__stat-label">Consecutivo TNS</span>
                    <span className="tb-confirmar__stat-value">{solicitudSeleccionada.consecutivoTns}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Personas */}
            <div className="tb-confirmar__personas">
              <div className="tb-confirmar__persona tb-confirmar__persona--emisor">
                <div className="tb-confirmar__persona-badge"><FaUser size={14} /></div>
                <h4 className="tb-confirmar__persona-titulo">Entregado por</h4>
                <p className="tb-confirmar__persona-nombre">{solicitudSeleccionada.emisor.nombreCompleto}</p>
                <p className="tb-confirmar__persona-doc">{solicitudSeleccionada.emisor.tipoIdentificacion} {solicitudSeleccionada.emisor.numeroIdentificacion}</p>
              </div>
              <div className="tb-confirmar__persona-arrow">→</div>
              <div className="tb-confirmar__persona tb-confirmar__persona--receptor">
                <div className="tb-confirmar__persona-badge"><FaUser size={14} /></div>
                <h4 className="tb-confirmar__persona-titulo">Quien recibe</h4>
                <p className="tb-confirmar__persona-nombre">{solicitudSeleccionada.receptor.nombreCompleto}</p>
                <p className="tb-confirmar__persona-doc">{solicitudSeleccionada.receptor.tipoIdentificacion} {solicitudSeleccionada.receptor.numeroIdentificacion}</p>
              </div>
            </div>

            {/* Bienes */}
            <div className="tb-confirmar__bienes">
              <h4 className="tb-confirmar__bienes-titulo">Bienes ({solicitudSeleccionada.bienes.length})</h4>
              <div className="tb-confirmar__bienes-grid">
                {solicitudSeleccionada.bienes.map((b) => (
                  <div key={b.placa} className="tb-confirmar__bien-card">
                    <div className="tb-confirmar__bien-card-header">
                      <code className="tb-confirmar__bien-card-placa">{b.placa}</code>
                      <span className={`tb-confirmar__bien-card-tipo${b.tipo === 'floresta' ? ' tb-confirmar__bien-card-tipo--floresta' : ''}`}>{b.tipo === 'floresta' ? 'Floresta' : 'UNP'}</span>
                    </div>
                    <p className="tb-confirmar__bien-card-desc">{b.descripcion}</p>
                    <div className="tb-confirmar__bien-card-meta">
                      <span>Serial: {b.serial || 'N/A'}</span>
                      <span>Grupo: {b.nombreDependencia || 'N/A'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Acciones */}
            <div className="tb-seguimiento-actions">
              <button type="button" className="tb-btn tb-btn--confirm" onClick={() => void abrirPdfHistorial(solicitudSeleccionada)} disabled={regenerandoPdf}>
                <FaFilePdf size={12} /> Ver / Regenerar PDF
              </button>
              {solicitudSeleccionada.estado === 'pendiente' && !esRevisando && (
                <button type="button" className="tb-btn tb-btn--danger" onClick={() => void handleCancelar(solicitudSeleccionada.codigo)}>
                  Cancelar transferencia
                </button>
              )}
              {hayBienesDisponibles && (
                <button type="button" className="tb-btn tb-btn--secondary" onClick={() => { setPasoActual(0); setPestana('normal'); setBienSeleccionado(null); setVistaActual('stepper'); setPdfHistorial(null) }}>
                  Iniciar transferencia
                </button>
              )}
            </div>

            {/* Observación de rechazo */}
            {solicitudSeleccionada.observacionRechazo && (
              <div className="tb-seguimiento-rechazo">
                <strong>Motivo del rechazo:</strong> {solicitudSeleccionada.observacionRechazo}
              </div>
            )}
          </div>
        )
      })() : (
        <div className="tb-empty">
          <div className="tb-empty__icon"><FaClockRotateLeft /></div>
          <strong className="tb-empty__title">Mis transferencias</strong>
          <p className="tb-empty__desc">Selecciona una transferencia de la lista de la izquierda para ver su detalle.</p>
        </div>
      )}
    </div>
  )

  if (sesionEstado === 'cargando') {
    return (<div className="transferencia-shell"><div className="tb-loading"><Animacion type="loading_duck" width={250} /><p className="tb-loading__text">Cargando datos de sesión…</p></div></div>)
  }

  if (sesionEstado === 'error') {
    return (<div className="transferencia-shell"><div className="tb-loading"><Animacion type="no_info" width={200} /><p className="tb-loading__text">No se pudo cargar la sesión. Intente recargar la página.</p></div></div>)
  }

  const sinBienes = sesionUsuario === null || totalBienes === 0
  if (sinBienes) {
    return (
      <div className="transferencia-shell">

        <div className="transferencia-shell__header">
          <EncabezadoV2 eyebrow="Direccion Logistica y Financiera" title="Gestión de Bienes" subtitle="Consulta, Gestión y Transferencia de Bienes." hasMargin={false} />
          <div className="transferencia-shell__avatar"><UserAvatarChip /></div>
        </div>
        <div className="tb-empty-state-page"><div className="tb-empty-state-card">
          <Animacion type="colibri" width={180} />
          <h2 style={{ fontSize: '1.2rem', marginTop: '1rem', color: '#1a1d21' }}>No tienes bienes para transferir</h2>
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '0.5rem' }}>No hay activos registrados bajo la cédula <strong>{sesionUsuario?.numeroIdentificacion || cedulaSesion}</strong>.</p>
        </div></div>
        {pdfHistorial && <ModalPrevisualizarPdf pdfDataUrl={pdfHistorial.pdfDataUrl} nombreArchivo={pdfHistorial.nombreArchivo} modo="history" onDescargar={descargarPdfHistorial} onCerrar={cerrarPdfHistorial} />}
      </div>
    )
  }



  return (
    <div className="transferencia-shell">


      <div className="transferencia-shell__header">
        <EncabezadoV2 eyebrow="Direccion Logistica y Financiera" title="Gestión de Bienes" subtitle="Consulta, Gestión y Transferencia de Bienes." hasMargin={false} />
        <div className="transferencia-shell__avatar"><UserAvatarChip /></div>
      </div>

      <div className={`transferencia-shell__stepper-area${generandoPdf || registrandoTransferencia ? ' is-processing' : ''}`}>
        {/* Renderizar contenido del paso actual */}
        {vistaActual === 'stepper' && pasosProceso[pasoActual]?.content}

        {vistaActual === 'detalle-bien' ? (
          <div className="transferencia-layout">
            {panelIzquierdo}
            <main className="transferencia-panel tb-central">
              {bienSeleccionado ? (
                <>
                  <div className="tb-central__header">
                    <div>
                      <h3 className="tb-central__title">Detalle del bien</h3>
                      <p className="tb-central__subtitle">Información del activo seleccionado</p>
                    </div>
                  </div>
                  <div className="tb-central__body">
                    <div className="tb-detalle-bien">
                      <div className="tb-detalle-bien__hero">
                        <span className="tb-detalle-bien__placa">{bienSeleccionado.placa}</span>
                      </div>
                      <h2 className="tb-detalle-bien__titulo">{bienSeleccionado.descripcion}</h2>
                      <div className="tb-detalle-bien__campos">
                        <div className="tb-detalle-bien__campo">
                          <span className="tb-detalle-bien__campo-label">Serial</span>
                          <span className="tb-detalle-bien__campo-valor">{bienSeleccionado.serial || 'N/A'}</span>
                        </div>
                        <div className="tb-detalle-bien__campo">
                          <span className="tb-detalle-bien__campo-label">Código dependencia</span>
                          <span className="tb-detalle-bien__campo-valor">{bienSeleccionado.codigo}</span>
                        </div>
                        <div className="tb-detalle-bien__campo">
                          <span className="tb-detalle-bien__campo-label">Grupo interno</span>
                          <span className="tb-detalle-bien__campo-valor">{bienSeleccionado.nombreDependencia || 'N/A'}</span>
                        </div>
                        <div className="tb-detalle-bien__campo">
                          <span className="tb-detalle-bien__campo-label">Tipo de bien</span>
                          <span className="tb-detalle-bien__campo-valor">{bienSeleccionado.tipo === 'floresta' ? 'Bien Floresta (inmueble)' : 'Bien UNP'}</span>
                        </div>
                        <div className="tb-detalle-bien__campo">
                          <span className="tb-detalle-bien__campo-label">Responsable</span>
                          <span className="tb-detalle-bien__campo-valor">{sesionUsuario?.nombreCompleto ?? 'N/A'}</span>
                        </div>
                        <div className="tb-detalle-bien__campo">
                          <span className="tb-detalle-bien__campo-label">Identificación</span>
                          <span className="tb-detalle-bien__campo-valor">CC {cedulaSesion}</span>
                        </div>
                      </div>
                      <div className="tb-detalle-bien__acciones">
                        {estaDeshabilitado(bienSeleccionado) ? (
                          <p className="tb-empty__desc" style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                            Este bien está en trámite de transferencia y no puede iniciarse una nueva.
                          </p>
                        ) : (
                          <button type="button" className="tb-btn tb-btn--primary" onClick={() => { setPasoActual(0); setVistaActual('stepper') }}>
                            Iniciar transferencia
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="tb-central__header">
                    <div>
                      <h3 className="tb-central__title">Transferencia registrada</h3>
                      <p className="tb-central__subtitle">Ahora debes imprimir, firmar y entregar en Almacén.</p>
                    </div>
                  </div>
                  <div className="tb-central__body">
                    <div className="tb-empty">
                      <Animacion type="colibri" width={250} />
                      <strong className="tb-empty__title" style={{ fontSize: '1.2rem' }}>Transferencia registrada correctamente</strong>
                      <p className="tb-empty__desc" style={{ maxWidth: '420px', lineHeight: 1.6, fontSize: '0.92rem', marginTop: '0.75rem' }}>
                        El formato fue descargado en tu equipo.<br /><br />
                        <strong>Paso siguiente:</strong> Imprime el documento, fírmalo junto con la persona que recibe los bienes (ambos responsables deben firmar) y entrégalo al grupo de Almacén para completar el trámite.
                      </p>
                      {hayBienesDisponibles ? (
                        <button type="button" className="tb-btn tb-btn--primary" style={{ marginTop: 16 }} onClick={() => { setPasoActual(0); setVistaActual('stepper') }}>
                          Nueva transferencia
                        </button>
                      ) : (
                        <>
                          <p className="tb-empty__desc" style={{ maxWidth: '420px', fontSize: '0.85rem', marginTop: '0.75rem', color: '#64748b' }}>
                            No tienes más bienes disponibles para transferir.
                          </p>
                          <button
                            type="button"
                            className="tb-btn tb-btn--primary"
                            style={{ marginTop: 16 }}
                            onClick={() => {
                              const reciente = [...historial].sort((a, b) => new Date(b.fechaISO).getTime() - new Date(a.fechaISO).getTime())[0]
                              if (reciente) setSolicitudSeleccionada(reciente)
                              setPestana('floresta') // activar la pestaña "Mis transferencias" del panel izquierdo
                              setVistaActual('seguimiento')
                            }}
                          >
                            Ver mis transferencias
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </main>
          </div>
        ) : vistaActual === 'seguimiento' ? (
          <div className="transferencia-layout">
            {panelIzquierdo}
            <main className="transferencia-panel tb-central">
              <div className="tb-central__header">
                <div>
                  <h3 className="tb-central__title">Detalle de transferencia</h3>
                  <p className="tb-central__subtitle">Visualizando formato PDF de la solicitud.</p>
                </div>
              </div>
              {contenidoSeguimiento}
            </main>
          </div>
        ) : null}
      </div>
    </div>
  )
}
