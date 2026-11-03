import { useState, useEffect, useRef } from 'react'
import { FaWarehouse, FaLocationDot, FaUsers, FaFloppyDisk, FaCircleCheck, FaLock, FaTriangleExclamation } from 'react-icons/fa6'
import type { Colaborador } from '../../services/inventarioFisicoService'
import SelectorCoordinador from '../inventario/SelectorCoordinador'
import type { TerceroFirebird } from '../inventario/SelectorCoordinador'
import { buscarTerceroPorNombreOCedula } from '../../services/receptorCatalogoService'
import './ModalColaboradores.css'

/** ¿El valor parece una cédula real (numérica, 4+ dígitos)? */
function esCedulaReal(cedula: string): boolean {
  return /^\d{4,}$/.test((cedula || '').trim())
}

/**
 * Formatea un nombre propio en "Title Case": primera letra de cada palabra en
 * mayúscula y el resto en minúscula (ej. "GAMBOA PRIETO PABLO" → "Gamboa Prieto
 * Pablo"). Así ambos responsables se ven igual, sin importar si el dato llegó en
 * MAYÚSCULAS (TNS) o capitalizado (Microsoft Graph).
 */
function aTitleCase(nombre: string): string {
  return (nombre || '')
    .toLocaleLowerCase('es-CO')
    .replace(/\b[\p{L}]/gu, (c) => c.toLocaleUpperCase('es-CO'))
}

/** Normaliza un nombre a conjunto de palabras (sin tildes, minúsculas). */
function palabrasNombre(nombre: string): string[] {
  return (nombre || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2)
}

/**
 * Intenta resolver la cédula real de una persona a partir de su NOMBRE,
 * reutilizando el buscador de terceros (no crea APIs nuevas).
 *
 * OJO: el nombre del usuario (Microsoft Graph) viene en orden nombres→apellidos
 * ("Pablo Emilio Gamboa Prieto"), pero TNS guarda TERCEROS.NOMBRE en orden
 * apellidos→nombres ("GAMBOA PRIETO PABLO EMILIO"). Por eso NO se busca la frase
 * completa (no coincide) ni se compara por igualdad de string: se busca por el
 * token más distintivo y se compara por CONJUNTO de palabras (sin importar orden).
 */
async function resolverCedulaPorNombre(nombre: string): Promise<string> {
  const palabras = palabrasNombre(nombre)
  if (palabras.length < 2) return ''
  try {
    // Token de búsqueda: la palabra más larga (suele ser un apellido distintivo)
    // con al menos 3 letras, para respetar el mínimo del endpoint.
    const tokenBusqueda = [...palabras].sort((a, b) => b.length - a.length).find(w => w.length >= 3)
    if (!tokenBusqueda) return ''
    const resultados = await buscarTerceroPorNombreOCedula(tokenBusqueda)
    const candidatos = resultados.filter(r => esCedulaReal(r.cedula))
    if (candidatos.length === 0) return ''

    const buscado = new Set(palabras)
    // Mejor candidato: aquel cuyo conjunto de palabras CONTIENE todas las del
    // nombre buscado (match completo sin importar el orden).
    const conTodas = candidatos.filter(r => {
      const set = new Set(palabrasNombre(r.nombre))
      return [...buscado].every(w => set.has(w))
    })
    if (conTodas.length === 1) return conTodas[0].cedula
    // Si hay varios que contienen todas, preferir el de nombre con la MISMA
    // cantidad de palabras (coincidencia más ajustada).
    if (conTodas.length > 1) {
      const exacto = conTodas.find(r => palabrasNombre(r.nombre).length === palabras.length)
      if (exacto) return exacto.cedula
    }
    return ''
  } catch {
    return ''
  }
}

/** Sedes disponibles para la toma de inventario (lista fija por ahora). */
const SEDES = [
  'SEDE PRINCIPAL',
  'SEDE AMERICAS',
  'SEDE NORTE',
  'ARCHIVOS DEL ESTADO',
  'DATA CENTER (TRIARA)',
]

interface ModalColaboradoresProps {
  isOpen: boolean
  onClose: () => void
  onGenerar: (colaborador1: Colaborador, colaborador2: Colaborador, sede: string, ubicacion: string) => void
  totalBienes: number
  loading?: boolean
  sedeInicial?: string
  ubicacionInicial?: string
  colaborador1Inicial?: Colaborador
  colaborador2Inicial?: Colaborador
  /**
   * Si es true, la Sede NO se elige de la lista fija: queda fija con el valor
   * de `sedeInicial` (p. ej. el Servicio Regional seleccionado). Se usa en la
   * toma de inventario regional, donde la sede es la regional, no una de las
   * sedes de Bogotá. En la toma de inventario principal se deja en false y se
   * muestra el selector de sedes.
   */
  sedeBloqueada?: boolean
  /** Etiqueta del campo Sede (p. ej. "Sede" o "Regional"). Default: "Sede". */
  etiquetaSede?: string
}

/** Sub-componente para un colaborador */
function CampoColaborador({ colaborador, onChange, numero, obligatorio, disabled, intentoGuardar }: {
  colaborador: Colaborador
  onChange: (c: Colaborador) => void
  numero: 1 | 2
  obligatorio: boolean
  disabled: boolean
  intentoGuardar?: boolean
}) {
  const handleSeleccionar = (t: TerceroFirebird) => {
    // Normalizar el nombre a Title Case para que se vea igual que el del auth.
    onChange({ nombre: aTitleCase(t.nombre), cedula: t.cedula, cargo: colaborador.cargo })
  }

  const yaSeleccionado = colaborador.nombre.trim().length > 0
  // Si el nombre vino del selector completo (nombre + cédula) se bloquea la edición.
  const esDesdeSelector = yaSeleccionado && colaborador.cedula.trim().length > 0
  // Caso del bug: viene nombre pero SIN cédula (p.ej. usuario del ecosistema sin
  // cédula). En ese caso la cédula debe quedar EDITABLE para poder completarla.
  const faltaCedula = yaSeleccionado && colaborador.cedula.trim().length === 0
  const cedulaBloqueada = esDesdeSelector

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: obligatorio ? '#303d50' : '#adb5bd', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
          {numero}
        </span>
        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#303d50' }}>
          Responsable {numero} {obligatorio ? '' : '(opcional)'}
        </span>
        {yaSeleccionado && (
          <button
            type="button"
            onClick={() => onChange({ nombre: '', cedula: '', cargo: '' })}
            style={{ marginLeft: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.72rem', background: 'white', color: '#dc3545', border: '1px solid #dc3545', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
            disabled={disabled}
          >
            Cambiar
          </button>
        )}
      </div>

      {!yaSeleccionado ? (
        <SelectorCoordinador
          valor=""
          onChange={() => {}}
          onSeleccionar={handleSeleccionar}
          placeholder="Buscar por cédula o nombre..."
          permitirManual={true}
        />
      ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.2rem' }}>Nombre</label>
            <input
              type="text"
              value={colaborador.nombre}
              onChange={(e) => onChange({ ...colaborador, nombre: e.target.value })}
              onBlur={(e) => onChange({ ...colaborador, nombre: aTitleCase(e.target.value) })}
              style={{ width: '100%', padding: '0.45rem 0.6rem', border: `1px solid ${intentoGuardar && obligatorio && !colaborador.nombre.trim() ? '#dc3545' : '#dee2e6'}`, borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500, outline: 'none', background: esDesdeSelector ? '#f8f9fa' : 'white' }}
              disabled={disabled || esDesdeSelector}
            />
            {intentoGuardar && obligatorio && !colaborador.nombre.trim() && (
              <span style={{ fontSize: '0.68rem', color: '#dc3545' }}>Requerido</span>
            )}
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.2rem' }}>Cédula {obligatorio ? '*' : ''}</label>
            <input
              type="text"
              inputMode="numeric"
              value={colaborador.cedula}
              onChange={(e) => onChange({ ...colaborador, cedula: e.target.value.replace(/\D/g, '') })}
              placeholder="N° de cédula"
              style={{ width: '100%', padding: '0.45rem 0.6rem', border: `1px solid ${intentoGuardar && obligatorio && !colaborador.cedula.trim() ? '#dc3545' : (faltaCedula ? '#f59e0b' : '#dee2e6')}`, borderRadius: '6px', fontSize: '0.85rem', outline: 'none', background: cedulaBloqueada ? '#f8f9fa' : 'white' }}
              disabled={disabled || cedulaBloqueada}
            />
            {intentoGuardar && obligatorio && !colaborador.cedula.trim() && (
              <span style={{ fontSize: '0.68rem', color: '#dc3545' }}>Requerido</span>
            )}
            {!intentoGuardar && faltaCedula && (
              <span style={{ fontSize: '0.68rem', color: '#b45309' }}>Falta la cédula, complétela</span>
            )}
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6c757d', display: 'block', marginBottom: '0.2rem' }}>Cargo *</label>
            <input
              type="text"
              value={colaborador.cargo}
              onChange={(e) => onChange({ ...colaborador, cargo: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '') })}
              onBlur={(e) => onChange({ ...colaborador, cargo: aTitleCase(e.target.value) })}
              placeholder="Funcionario"
              style={{ width: '100%', padding: '0.45rem 0.6rem', border: `1px solid ${intentoGuardar && obligatorio && !colaborador.cargo.trim() ? '#dc3545' : '#dee2e6'}`, borderRadius: '6px', fontSize: '0.85rem', outline: 'none' }}
              disabled={disabled}
            />
            {intentoGuardar && obligatorio && !colaborador.cargo.trim() && (
              <span style={{ fontSize: '0.68rem', color: '#dc3545' }}>Requerido</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ModalColaboradores({
  isOpen,
  onClose,
  onGenerar,
  totalBienes,
  loading = false,
  sedeInicial = '',
  ubicacionInicial = '',
  colaborador1Inicial,
  colaborador2Inicial,
  sedeBloqueada = false,
  etiquetaSede = 'Sede',
}: ModalColaboradoresProps) {
  const [colaborador1, setColaborador1] = useState<Colaborador>(colaborador1Inicial || { nombre: '', cedula: '', cargo: '' })
  const [colaborador2, setColaborador2] = useState<Colaborador>(colaborador2Inicial || { nombre: '', cedula: '', cargo: '' })
  const [sede, setSede] = useState(sedeInicial)
  const [ubicacion, setUbicacion] = useState(ubicacionInicial)
  const [errorMsg, setErrorMsg] = useState('')
  const [intentoGuardar, setIntentoGuardar] = useState(false)
  const prevIsOpenRef = useRef(false)

  // Solo restaurar datos iniciales cuando el modal se ABRE (transición false→true)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setSede(sedeInicial)
      setUbicacion(ubicacionInicial)
      // Solo restaurar colaboradores si los actuales están vacíos o si los iniciales tienen datos completos.
      // El nombre se normaliza a Title Case para que ambos responsables se vean igual.
      if (colaborador1Inicial && colaborador1Inicial.nombre.trim()) {
        setColaborador1(prev => {
          // Si el estado actual ya tiene nombre (usuario lo completó antes), no sobreescribir
          if (prev.nombre.trim() && prev.cedula.trim()) return prev
          return { ...colaborador1Inicial, nombre: aTitleCase(colaborador1Inicial.nombre), cargo: aTitleCase(colaborador1Inicial.cargo) }
        })
      }
      if (colaborador2Inicial && colaborador2Inicial.nombre.trim()) {
        setColaborador2(prev => {
          if (prev.nombre.trim() && prev.cedula.trim()) return prev
          return { ...colaborador2Inicial, nombre: aTitleCase(colaborador2Inicial.nombre), cargo: aTitleCase(colaborador2Inicial.cargo) }
        })
      }
      setIntentoGuardar(false)
      setErrorMsg('')
    }
    prevIsOpenRef.current = isOpen
  }, [isOpen, sedeInicial, ubicacionInicial])

  // Auto-resolver cédula por NOMBRE al abrir: si un responsable tiene nombre pero
  // NO una cédula real (p.ej. el auth trae id_busuario, o el WS trae un id), se
  // busca en TNS por su nombre y se completa la cédula. Si no hay match, el campo
  // queda editable (modo manual). Cubre trabajo colaborativo y no colaborativo.
  useEffect(() => {
    if (!isOpen) return
    let cancelado = false
    ;(async () => {
      // Responsable 1
      if (colaborador1.nombre.trim() && !esCedulaReal(colaborador1.cedula)) {
        const ced = await resolverCedulaPorNombre(colaborador1.nombre)
        if (!cancelado && ced) {
          setColaborador1(prev => (esCedulaReal(prev.cedula) ? prev : { ...prev, cedula: ced }))
        }
      }
      // Responsable 2 (si existe)
      if (colaborador2.nombre.trim() && !esCedulaReal(colaborador2.cedula)) {
        const ced = await resolverCedulaPorNombre(colaborador2.nombre)
        if (!cancelado && ced) {
          setColaborador2(prev => (esCedulaReal(prev.cedula) ? prev : { ...prev, cedula: ced }))
        }
      }
    })()
    return () => { cancelado = true }
  }, [isOpen, colaborador1.nombre, colaborador2.nombre]) // eslint-disable-line react-hooks/exhaustive-deps

  // Limpiar error después de 5 segundos
  useEffect(() => {
    if (!errorMsg) return
    const t = setTimeout(() => setErrorMsg(''), 5000)
    return () => clearTimeout(t)
  }, [errorMsg])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setIntentoGuardar(true)
    if (!colaborador1.nombre.trim() || !colaborador1.cedula.trim() || !colaborador1.cargo.trim()) {
      setErrorMsg('El Responsable 1 es obligatorio. Complete nombre, cédula y cargo.')
      return
    }
    if (!sede.trim() || !ubicacion.trim()) {
      setErrorMsg('La Sede y la Ubicación son obligatorias.')
      return
    }
    const col2Completo = colaborador2.nombre.trim() && colaborador2.cedula.trim() && colaborador2.cargo.trim()
    const col2Vacio = !colaborador2.nombre.trim() && !colaborador2.cedula.trim() && !colaborador2.cargo.trim()
    if (!col2Completo && !col2Vacio) {
      setErrorMsg('Si ingresa datos del Responsable 2, debe completar todos sus campos.')
      return
    }
    onGenerar(colaborador1, colaborador2, sede, ubicacion)
  }

  if (!isOpen) return null

  const bienesReales = totalBienes
  const sedeLista = !!sede.trim()
  const ubicacionLista = !!ubicacion.trim()

  return (
    <div className="modal-overlay">
      <div className="modal-content mc-modal">
        {/* Header con degradado de marca */}
        <div className="mc-header">
          <div className="mc-header__icon"><FaWarehouse /></div>
          <div className="mc-header__texts">
            <h2 className="mc-header__title">Guardar inventario</h2>
            <p className="mc-header__sub">Confirma la información antes de generar el formato</p>
          </div>
          <span className="mc-header__chip">
            <FaCircleCheck />
            {bienesReales} bien{bienesReales !== 1 ? 'es' : ''}
          </span>
          <button className="mc-close" onClick={() => !loading && onClose()} disabled={loading} aria-label="Cerrar" type="button">×</button>
        </div>

        {/* Body */}
        <div className="mc-body">
          {errorMsg && (
            <div className="mc-error">
              <FaTriangleExclamation />
              <span>{errorMsg}</span>
            </div>
          )}
          <form onSubmit={handleSubmit}>
            {/* Ubicación del inventario */}
            <section className="mc-section">
              <h4 className="mc-section__title"><FaLocationDot /> Ubicación del inventario</h4>
              <div className="mc-grid-2">
                <div className="mc-field">
                  <label className="mc-label">{etiquetaSede} *</label>
                  {sedeBloqueada ? (
                    <div className="mc-fixed" title="La sede se toma del servicio regional seleccionado">
                      <FaLock className="mc-fixed__icon" />
                      <span className="mc-fixed__value">{sede || '—'}</span>
                      <span className="mc-fixed__badge">Automático</span>
                    </div>
                  ) : (
                    <>
                      <select
                        value={sede}
                        onChange={(e) => setSede(e.target.value)}
                        required
                        disabled={loading}
                        className={`mc-input mc-select${intentoGuardar && !sedeLista ? ' mc-input--error' : ''}`}
                      >
                        <option value="">Seleccione una sede…</option>
                        {SEDES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {intentoGuardar && !sedeLista && <span className="mc-hint-error">Requerido</span>}
                    </>
                  )}
                </div>
                <div className="mc-field">
                  <label className="mc-label">Ubicación *</label>
                  <input
                    type="text"
                    value={ubicacion}
                    onChange={(e) => setUbicacion(e.target.value.toUpperCase())}
                    placeholder="OFICINA ALMACEN"
                    required
                    disabled={loading}
                    className={`mc-input${intentoGuardar && !ubicacionLista ? ' mc-input--error' : ''}`}
                  />
                  {intentoGuardar && !ubicacionLista && <span className="mc-hint-error">Requerido</span>}
                </div>
              </div>
            </section>

            {/* Responsables */}
            <section className="mc-section">
              <h4 className="mc-section__title"><FaUsers /> Responsables del inventario</h4>

              <CampoColaborador
                colaborador={colaborador1}
                onChange={setColaborador1}
                numero={1}
                obligatorio={true}
                disabled={loading}
                intentoGuardar={intentoGuardar}
              />

              <CampoColaborador
                colaborador={colaborador2}
                onChange={setColaborador2}
                numero={2}
                obligatorio={false}
                disabled={loading}
                intentoGuardar={intentoGuardar}
              />
            </section>

            {/* Botones */}
            <div className="mc-actions">
              <button type="button" className="mc-btn mc-btn--ghost" onClick={() => !loading && onClose()} disabled={loading}>
                Cancelar
              </button>
              <button type="submit" className="mc-btn mc-btn--primary" disabled={loading}>
                {loading ? (
                  <>
                    <span className="mc-spinner" /> Guardando…
                  </>
                ) : (
                  <>
                    <FaFloppyDisk /> Guardar inventario
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
