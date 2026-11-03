import { useEffect, useRef, useState } from 'react'
import { FaSearch } from 'react-icons/fa'
import type { SingleValue } from 'react-select'

import { SelectField } from '../ui/SelectField'
import {
  buscarReceptorPorDocumento,
  obtenerOpcionesReceptorCatalogo,
  buscarTerceroPorNombreOCedula,
  buscarReceptorCombinado,
  type OpcionSelect,
  type TerceroFirebird,
} from '../../services/receptorCatalogoService'
import type { Persona } from '../../types'
import { sanitizarCedula } from '../../utils/sanitizarCedula'

import './ReceptorTransferenciaForm.css'

const OPCIONES_TIPO_DOC: OpcionSelect[] = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PA', label: 'Pasaporte' },
  { value: 'NIT', label: 'NIT' },
]
const TIPO_DOC_DEFECTO = 'CC' as const
const MIN_DIGITOS_BUSQUEDA = 5
const MAX_OTROS_NUMERICOS = 16

function normalizarNumeroDoc(tipo: string, raw: string): string {
  if (tipo === 'PA') return raw.replace(/[^\w-]/gi, '').slice(0, 24)
  if (tipo === 'CC') return sanitizarCedula(raw)
  return raw.replace(/\D/g, '').slice(0, MAX_OTROS_NUMERICOS)
}

interface ReceptorTransferenciaFormProps {
  valor: Persona
  onChange: (p: Persona) => void
  idPrefijo: string
  disabled?: boolean
  camposError?: string[]
}

export function ReceptorTransferenciaForm({ valor, onChange, idPrefijo, disabled = false, camposError = [] }: ReceptorTransferenciaFormProps) {
  const tieneError = (campo: string) => camposError.includes(campo)

  const [deps, setDeps] = useState<OpcionSelect[]>([])
  const [grupos, setGrupos] = useState<OpcionSelect[]>([])
  const [sedes, setSedes] = useState<OpcionSelect[]>([])
  const [buscando, setBuscando] = useState(false)
  const [cargandoGrupos, setCargandoGrupos] = useState(false)
  /** null: aún no hubo búsqueda manual; true tras respuesta (encontrado indica si hubo match) */
  const [huboBusqueda, setHuboBusqueda] = useState<boolean | null>(() => valor.nombreCompleto ? true : null)
  const [encontrado, setEncontrado] = useState(() => !!valor.nombreCompleto)
  /** Clave tipo|número de la última consulta exitosa; si el usuario edita el documento, se ocultan resultados hasta una nueva búsqueda */
  const [claveConsultada, setClaveConsultada] = useState<string | null>(() => valor.numeroIdentificacion ? `${valor.tipoIdentificacion}|${valor.numeroIdentificacion}` : null)
  /** Bandera para indicar que el formulario fue llenado por búsqueda automática */
  const [datosDesdeBackend, setDatosDesdeBackend] = useState(false)
  /** Búsqueda por nombre */
  const [busquedaNombre, setBusquedaNombre] = useState('')
  const [resultadosNombre, setResultadosNombre] = useState<TerceroFirebird[]>([])
  const [buscandoNombre, setBuscandoNombre] = useState(false)
  const [mostrarDropdown, setMostrarDropdown] = useState(false)
  const dropdownContainerRef = useRef<HTMLDivElement>(null)
  /** Indica que ya se seleccionó un receptor y el input está bloqueado */
  const [receptorBloqueado, setReceptorBloqueado] = useState(() => !!valor.nombreCompleto)

  // Cerrar dropdown al hacer click fuera del contenedor
  useEffect(() => {
    if (!mostrarDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target as Node)) {
        setMostrarDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mostrarDropdown])

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const o = await obtenerOpcionesReceptorCatalogo()
        if (!cancel) {
          setDeps(o.dependencias)
          setGrupos(o.grupos)
          setSedes(o.sedes)
        }
      } catch {
        if (!cancel) {
          setDeps([])
          setGrupos([])
          setSedes([])
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [])

  // Recargar grupos cuando cambie la dependencia
  useEffect(() => {
    // NO recargar si no hay dependencia seleccionada
    if (!valor.dependencia) {
      return
    }
    
    // NO recargar si los datos vienen del backend (búsqueda por cédula)
    // El backend ya trae dependencia + grupo correctos
    if (datosDesdeBackend && valor.grupo) {
      return
    }
    
    let cancel = false
    setCargandoGrupos(true)
    
    // Buscar el ID de la dependencia por su nombre
    const depEncontrada = deps.find(d => d.label === valor.dependencia)
    if (!depEncontrada) {
      setCargandoGrupos(false)
      return
    }
    
    void (async () => {
      try {
        const o = await obtenerOpcionesReceptorCatalogo(depEncontrada.value)
        if (!cancel) {
          setGrupos(o.grupos)
          // Limpiar grupo seleccionado si ya no está en la lista
          if (valor.grupo && !datosDesdeBackend) {
            const grupoExiste = o.grupos.some(g => g.label === valor.grupo)
            if (!grupoExiste) {
              onChange({ ...valor, grupo: '' })
            }
          }
        }
      } catch {
        if (!cancel) {
          setGrupos([])
        }
      } finally {
        if (!cancel) {
          setCargandoGrupos(false)
        }
      }
    })()
    
    return () => {
      cancel = true
    }
  }, [valor.dependencia, deps, datosDesdeBackend])

  const tipo = valor.tipoIdentificacion
  const numero = valor.numeroIdentificacion
  const numNorm = normalizarNumeroDoc(tipo, numero)
  const numLimpio = tipo === 'PA' ? numero.trim() : numero.replace(/\D/g, '')
  const puedeBuscar =
    Boolean(tipo) && (tipo === 'PA' ? numero.trim().length >= 4 : numLimpio.length >= MIN_DIGITOS_BUSQUEDA)
  const claveActual = `${tipo}|${numNorm}`

  useEffect(() => {
    if (claveConsultada === null) return
    if (claveActual !== claveConsultada) {
      setHuboBusqueda(null)
      setEncontrado(false)
    }
  }, [claveActual, claveConsultada])

  const ejecutarBusqueda = async () => {
    if (!puedeBuscar || buscando) return
    setBuscando(true)
    try {
      const hit = await buscarReceptorPorDocumento(tipo, numero)
      setHuboBusqueda(true)
      setEncontrado(!!hit)
      setClaveConsultada(claveActual)
      if (hit) {
        setDatosDesdeBackend(true) // Marcar que los datos vienen del backend
        setReceptorBloqueado(true)
        const nuevoValor = {
          ...hit,
          tipoIdentificacion: tipo,
          numeroIdentificacion: numNorm,
        }
        onChange(nuevoValor)
      } else {
        setDatosDesdeBackend(false)
        setReceptorBloqueado(true)
        onChange({
          nombreCompleto: '',
          tipoIdentificacion: tipo,
          numeroIdentificacion: numNorm,
          cargo: '',
          dependencia: '',
          grupo: '',
          sede: '',
          numeroContrato: '',
          primerNombre: '',
          segundoNombre: '',
          primerApellido: '',
          segundoApellido: '',
        })
      }
    } catch {
      setHuboBusqueda(true)
      setEncontrado(false)
      setClaveConsultada(claveActual)
      setDatosDesdeBackend(false)
    } finally {
      setBuscando(false)
    }
  }

  // Búsqueda por nombre en Firebird
  const buscarPorNombre = async (query: string) => {
    setBusquedaNombre(query)
    if (query.trim().length < 3) {
      setResultadosNombre([])
      setMostrarDropdown(false)
      return
    }
    setBuscandoNombre(true)
    const resultados = await buscarTerceroPorNombreOCedula(query)
    if (resultados.length === 1) {
      // Única coincidencia: seleccionar automáticamente
      setBuscandoNombre(false)
      void seleccionarTercero(resultados[0])
    } else {
      setResultadosNombre(resultados)
      setMostrarDropdown(resultados.length > 0)
      setBuscandoNombre(false)
    }
  }

  // Al seleccionar un tercero del dropdown
  const seleccionarTercero = async (tercero: TerceroFirebird) => {
    setMostrarDropdown(false)
    setBusquedaNombre('')
    setResultadosNombre([])
    
    // Poner la cédula en el campo de documento
    onChange({ ...valor, tipoIdentificacion: 'CC', numeroIdentificacion: tercero.cedula })
    
    // Buscar datos completos con la cédula
    setBuscando(true)
    try {
      const hit = await buscarReceptorCombinado(tercero.cedula)
      setHuboBusqueda(true)
      setClaveConsultada(`CC|${tercero.cedula}`)
      if (hit) {
        setEncontrado(true)
        setDatosDesdeBackend(true)
        setReceptorBloqueado(true)
        onChange({ ...hit, tipoIdentificacion: 'CC', numeroIdentificacion: tercero.cedula })
      } else {
        // Al menos poner el nombre de Firebird
        setEncontrado(false)
        setDatosDesdeBackend(false)
        setReceptorBloqueado(true)
        onChange({
          nombreCompleto: tercero.nombre,
          tipoIdentificacion: 'CC',
          numeroIdentificacion: tercero.cedula,
          cargo: '',
          dependencia: '',
          grupo: '',
          sede: '',
          numeroContrato: '',
          primerNombre: '',
          segundoNombre: '',
          primerApellido: '',
          segundoApellido: '',
        })
      }
    } catch {
      setHuboBusqueda(true)
      setEncontrado(false)
      setDatosDesdeBackend(false)
    } finally {
      setBuscando(false)
    }
  }

  const limpiarReceptor = () => {
    setReceptorBloqueado(false)
    setHuboBusqueda(null)
    setEncontrado(false)
    setClaveConsultada(null)
    setDatosDesdeBackend(false)
    setBusquedaNombre('')
    setResultadosNombre([])
    setMostrarDropdown(false)
    onChange({
      nombreCompleto: '',
      tipoIdentificacion: 'CC',
      numeroIdentificacion: '',
      cargo: '',
      dependencia: '',
      grupo: '',
      sede: '',
      numeroContrato: '',
      primerNombre: '',
      segundoNombre: '',
      primerApellido: '',
      segundoApellido: '',
    })
  }

  const depValue = deps.find((o) => {
    const valorLimpio = valor.dependencia?.trim().toLowerCase() || ''
    const labelLimpio = o.label.trim().toLowerCase()
    const nombreLimpio = (o.nombre || '').trim().toLowerCase()
    
    return labelLimpio === valorLimpio || 
           nombreLimpio === valorLimpio ||
           labelLimpio.endsWith(`: ${valorLimpio}`) ||
           labelLimpio.includes(valorLimpio)
  }) ?? null
  
  const onDepChange = (opt: SingleValue<OpcionSelect>) => {
    setDatosDesdeBackend(false) // Usuario está cambiando manualmente
    onChange({ ...valor, dependencia: opt?.label ?? '', grupo: '' })
  }

  const MAX_CEDULA_NOMBRE = 50
const tipoValue = OPCIONES_TIPO_DOC.find((o) => o.value === tipo) ?? OPCIONES_TIPO_DOC[0]
  
  const grupoValue = grupos.find((o) => {
    const valorLimpio = (valor.grupo ?? '').trim().toLowerCase()
    const labelLimpio = o.label.trim().toLowerCase()
    
    return labelLimpio === valorLimpio || 
           labelLimpio.includes(valorLimpio) ||
           valorLimpio.includes(labelLimpio)
  }) ?? null
  
  const sedeValue = sedes.find((o) => o.value === (valor.sede ?? '')) ?? null

  // Efecto para limpiar la bandera cuando el usuario edita el grupo manualmente
  const onGrupoChange = (opt: SingleValue<OpcionSelect>) => {
    setDatosDesdeBackend(false)
    onChange({ ...valor, grupo: opt?.label ?? '' })
  }

  return (
    <fieldset className="receptor-trx" disabled={disabled}>
      <legend className="receptor-trx__legend">Quien recibe</legend>

      {disabled && (
        <div style={{
          marginBottom: '12px',
          padding: '10px 12px',
          backgroundColor: '#f0f0f0',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '14px',
          color: '#666'
        }}>
          ⚠️ No puedes llenar este formulario porque no tienes bienes para transferir.
        </div>
      )}

      <div className={`receptor-trx__doc-row${tieneError('documento') || tieneError('nombre') ? ' receptor-trx__doc-row--error' : ''}`}>
        <div className="receptor-trx__field receptor-trx__field--tipo-doc">
          <SelectField<OpcionSelect>
            id={`${idPrefijo}-tipo`}
            label="Tipo de documento"
            required
            options={OPCIONES_TIPO_DOC}
            value={tipoValue}
            onChange={(opt) => {
              const next = opt?.value ?? TIPO_DOC_DEFECTO
              // Limpiar datos previos cuando cambia el tipo de documento
              setReceptorBloqueado(false)
              setHuboBusqueda(null)
              setEncontrado(false)
              setClaveConsultada(null)
              setDatosDesdeBackend(false)
              setBusquedaNombre('')
              setResultadosNombre([])
              setMostrarDropdown(false)
              
              // Actualizar solo el tipo de documento con cédula y nombre vacíos
              onChange({
                nombreCompleto: '',
                tipoIdentificacion: next,
                numeroIdentificacion: '',
                cargo: '',
                dependencia: '',
                grupo: '',
                sede: '',
                numeroContrato: '',
                primerNombre: '',
                segundoNombre: '',
                primerApellido: '',
                segundoApellido: '',
              })
            }}
            placeholder="Tipo…"
            isClearable={false}
            isSearchable={false}
          />
        </div>
        <div className="receptor-trx__field" style={{ position: 'relative' }} ref={dropdownContainerRef}>
          <label className="receptor-trx__label" htmlFor={`${idPrefijo}-numero`}>
            Cédula o nombre <span className="receptor-trx__req">*</span>
          </label>
          <div className="receptor-trx__doc-input-wrap">
            {receptorBloqueado ? (
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  id={`${idPrefijo}-numero`}
                  className="receptor-trx__input"
                  type="text"
                  readOnly
                  value={valor.nombreCompleto || ''}
                  style={{ background: '#f0f7ff', fontWeight: 600, paddingRight: '2.5rem', width: '100%' }}
                />
                <button
                  type="button"
                  onClick={limpiarReceptor}
                  style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: '1.2rem', color: '#6c757d', cursor: 'pointer', lineHeight: 1, padding: '0.25rem' }}
                  aria-label="Limpiar selección"
                  title="Cambiar persona"
                >
                  ×
                </button>
              </div>
            ) : (
            <>
            <input
              id={`${idPrefijo}-numero`}
              className="receptor-trx__input"
              type="text"
              autoComplete="off"
              placeholder="Cédula o nombre (mín. 3 caracteres)..."
              value={busquedaNombre || numero}
              maxLength={MAX_CEDULA_NOMBRE}
              onChange={(e) => {
                const val = e.target.value
                if (val === '') {
                  setBusquedaNombre('')
                  onChange({ ...valor, numeroIdentificacion: '' })
                  setMostrarDropdown(false)
                  setResultadosNombre([])
                  return
                }

                const onlyDigits = val.replace(/\D/g, '')
                const onlyLetters = val.replace(/[^A-Za-zÀ-ÿ\s'-]/g, '')

                // Decide si el usuario está escribiendo dígitos o texto según el último carácter
                const last = val.slice(-1)
                const lastIsDigit = /\d/.test(last)

                if (onlyDigits.length === val.length || (onlyDigits.length > 0 && lastIsDigit)) {
                  // Tratar como cédula
                  setBusquedaNombre('')
                  const norm = normalizarNumeroDoc(tipo, onlyDigits)
                  onChange({ ...valor, numeroIdentificacion: norm })
                  if (onlyDigits.length >= 5) {
                    void buscarPorNombre(onlyDigits)
                  } else {
                    setMostrarDropdown(false)
                    setResultadosNombre([])
                  }
                } else {
                  // Tratar como nombre (solo letras/espacios/apóstrofe/guion)
                  const safe = onlyLetters
                  setBusquedaNombre(safe)
                  onChange({ ...valor, numeroIdentificacion: '' })
                  void buscarPorNombre(safe)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (busquedaNombre) {
                    // Si hay texto, forzar búsqueda
                    void buscarPorNombre(busquedaNombre)
                  } else {
                    void ejecutarBusqueda()
                  }
                }
              }}
              onFocus={() => { if (resultadosNombre.length > 0 && !receptorBloqueado) setMostrarDropdown(true) }}
              onBlur={() => { setTimeout(() => setMostrarDropdown(false), 200) }}
            />
            <button
              type="button"
              className="receptor-trx__buscar"
              onClick={() => {
                if (busquedaNombre) {
                  void buscarPorNombre(busquedaNombre)
                } else {
                  void ejecutarBusqueda()
                }
              }}
              disabled={(!puedeBuscar && !busquedaNombre) || buscando || buscandoNombre}
              aria-label="Buscar persona"
            >
              <FaSearch aria-hidden />
            </button>
            </>
            )}
          </div>
          {/* Dropdown de resultados Firebird */}
          {mostrarDropdown && resultadosNombre.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #dee2e6', borderRadius: '0 0 8px 8px', boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)', maxHeight: '220px', overflowY: 'auto', zIndex: 100 }}>
              {resultadosNombre.map((t, i) => (
                <div
                  key={i}
                  onMouseDown={() => void seleccionarTercero(t)}
                  style={{ padding: '0.6rem 0.85rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '0.85rem' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f4ff' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
                >
                  <div style={{ fontWeight: 600, color: '#303d50' }}>{t.nombre}</div>
                </div>
              ))}
            </div>
          )}
          {buscandoNombre && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #dee2e6', borderRadius: '0 0 8px 8px', padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', color: '#6c757d', zIndex: 100 }}>
              Buscando...
            </div>
          )}
        </div>
      </div>

      {buscando && <p className="receptor-trx__hint receptor-trx__hint--loading">Buscando en el catálogo…</p>}
      {!buscando && huboBusqueda === null && tipo === 'PA' && (
        <p className="receptor-trx__hint">Ingrese el documento y pulse la lupa para consultar el catálogo.</p>
      )}

      {huboBusqueda && !buscando && encontrado && (
        <div className="receptor-trx__bloque">
          <div className="receptor-trx__grid">
            {/* Fila 1: Nombre | Grupo */}
            <div className="receptor-trx__field">
              <span className="receptor-trx__label">Nombre completo</span>
              <p className="receptor-trx__readonly">{valor.nombreCompleto}</p>
            </div>
            <div className={`receptor-trx__field${tieneError('grupo') ? ' receptor-trx__field--error' : ''}`}>
              <SelectField<OpcionSelect>
                id={`${idPrefijo}-grupo`}
                label="Grupo"
                required
                options={grupos}
                value={grupoValue}
                onChange={onGrupoChange}
                placeholder={cargandoGrupos ? "Cargando grupos..." : "Seleccione…"}
                isDisabled={cargandoGrupos || !valor.dependencia}
              />
            </div>
            {/* Fila 2: Cargo | Sede */}
            <div className="receptor-trx__field">
              <label className="receptor-trx__label" htmlFor={`${idPrefijo}-cargo`}>
                Cargo <span className="receptor-trx__req">*</span>
              </label>
              <input
                id={`${idPrefijo}-cargo`}
                className={`receptor-trx__input${tieneError('cargo') ? ' receptor-trx__input--error' : ''}`}
                type="text"
                maxLength={20}
                value={valor.cargo ?? ''}
                onChange={(e) => {
                  const filtered = e.target.value.replace(/[^A-Za-zÀ-ÿ\s'-]/g, '')
                  onChange({ ...valor, cargo: filtered })
                }}
              />
            </div>
            <div className={`receptor-trx__field${tieneError('sede') ? ' receptor-trx__field--error' : ''}`}>
              <SelectField<OpcionSelect>
                id={`${idPrefijo}-sede`}
                label="Sede"
                required
                options={sedes}
                value={sedeValue}
                onChange={(opt) => onChange({ ...valor, sede: opt?.value ?? '' })}
                placeholder="Seleccione…"
              />
            </div>
            {/* Fila 3: Dependencia | Contrato */}
            <div className={`receptor-trx__field${tieneError('dependencia') ? ' receptor-trx__field--error' : ''}`}>
              <SelectField<OpcionSelect>
                id={`${idPrefijo}-dependencia`}
                label="Dependencia"
                required
                options={deps}
                value={depValue}
                onChange={onDepChange}
                placeholder="Seleccione dependencia…"
                isClearable={false}
              />
            </div>
            {(valor.cargo ?? '').toLowerCase().includes('contratista') ? (
            <div className="receptor-trx__field">
              <label className="receptor-trx__label" htmlFor={`${idPrefijo}-contrato`}>
                No. de contrato
              </label>
              <input
                id={`${idPrefijo}-contrato`}
                className="receptor-trx__input"
                type="text"
                autoComplete="off"
                maxLength={8}
                value={valor.numeroContrato ?? ''}
                onChange={(e) => onChange({ ...valor, numeroContrato: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            ) : <div />}
          </div>
        </div>
      )}

      {huboBusqueda && !buscando && !encontrado && (
        <div className="receptor-trx__bloque">
          <p className="receptor-trx__hint" style={{ marginBottom: '0.75rem' }}>
            No hay registro previo para este documento. Diligencie los datos de la persona que recibe.
          </p>
          <div className="receptor-trx__grid">
            <div className="receptor-trx__field">
              <label className="receptor-trx__label" htmlFor={`${idPrefijo}-pn`}>
                Primer nombre <span className="receptor-trx__req">*</span>
              </label>
              <input
                id={`${idPrefijo}-pn`}
                className="receptor-trx__input"
                type="text"
                autoComplete="off"
                value={valor.primerNombre ?? ''}
                onChange={(e) => onChange({ ...valor, primerNombre: e.target.value, nombreCompleto: '' })}
              />
            </div>
            <div className="receptor-trx__field">
              <label className="receptor-trx__label" htmlFor={`${idPrefijo}-sn`}>
                Segundo nombre
              </label>
              <input
                id={`${idPrefijo}-sn`}
                className="receptor-trx__input"
                type="text"
                autoComplete="off"
                value={valor.segundoNombre ?? ''}
                onChange={(e) => onChange({ ...valor, segundoNombre: e.target.value, nombreCompleto: '' })}
              />
            </div>
            <div className="receptor-trx__field">
              <label className="receptor-trx__label" htmlFor={`${idPrefijo}-pa`}>
                Primer apellido <span className="receptor-trx__req">*</span>
              </label>
              <input
                id={`${idPrefijo}-pa`}
                className="receptor-trx__input"
                type="text"
                autoComplete="off"
                value={valor.primerApellido ?? ''}
                onChange={(e) => onChange({ ...valor, primerApellido: e.target.value, nombreCompleto: '' })}
              />
            </div>
            <div className="receptor-trx__field">
              <label className="receptor-trx__label" htmlFor={`${idPrefijo}-sa`}>
                Segundo apellido
              </label>
              <input
                id={`${idPrefijo}-sa`}
                className="receptor-trx__input"
                type="text"
                autoComplete="off"
                value={valor.segundoApellido ?? ''}
                onChange={(e) => onChange({ ...valor, segundoApellido: e.target.value, nombreCompleto: '' })}
              />
            </div>
          </div>
          <div className="receptor-trx__grid" style={{ marginTop: '1rem' }}>
            <div className="receptor-trx__field receptor-trx__grid--full">
              <label className="receptor-trx__label" htmlFor={`${idPrefijo}-cargo-n`}>
                Cargo <span className="receptor-trx__req">*</span>
              </label>
              <input
                id={`${idPrefijo}-cargo-n`}
                className="receptor-trx__input"
                type="text"
                maxLength={20}
                value={valor.cargo ?? ''}
                onChange={(e) => {
                  const filtered = e.target.value.replace(/[^A-Za-zÀ-ÿ\s'-]/g, '')
                  onChange({ ...valor, cargo: filtered })
                }}
              />
            </div>
            <div className="receptor-trx__field receptor-trx__grid--full">
              <SelectField<OpcionSelect>
                id={`${idPrefijo}-dependencia-n`}
                label="Dependencia"
                required
                options={deps}
                value={depValue}
                onChange={onDepChange}
                placeholder="Seleccione dependencia…"
              />
            </div>
            <div className="receptor-trx__field">
              <SelectField<OpcionSelect>
                id={`${idPrefijo}-grupo-n`}
                label="Grupo"
                required
                options={grupos}
                value={grupoValue}
                onChange={onGrupoChange}
                placeholder={cargandoGrupos ? "Cargando grupos..." : "Seleccione…"}
                isDisabled={cargandoGrupos || !valor.dependencia}
              />
            </div>
            <div className="receptor-trx__field">
              <SelectField<OpcionSelect>
                id={`${idPrefijo}-sede-n`}
                label="Sede"
                required
                options={sedes}
                value={sedeValue}
                onChange={(opt) => onChange({ ...valor, sede: opt?.value ?? '' })}
                placeholder="Seleccione…"
              />
            </div>
            {(valor.cargo ?? '').toLowerCase().includes('contratista') && (
            <div className="receptor-trx__field receptor-trx__grid--full">
              <label className="receptor-trx__label" htmlFor={`${idPrefijo}-contrato-n`}>
                No. de contrato
              </label>
              <input
                id={`${idPrefijo}-contrato-n`}
                className="receptor-trx__input"
                type="text"
                maxLength={8}
                value={valor.numeroContrato ?? ''}
                onChange={(e) => onChange({ ...valor, numeroContrato: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            )}
          </div>
        </div>
      )}
    </fieldset>
  )
}
