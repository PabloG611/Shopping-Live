/**
 * TablaBienes — Tabla de bienes escaneados del inventario, construida sobre
 * EcoTabla (estética del ecosistema). Reemplaza a TablaInventario conservando
 * EXACTAMENTE la misma interfaz de props y todas las acciones:
 *  - Placa clicable → historial.
 *  - Estado editable inline (SelectorEstado); al pasar a M dispara onEstadoM.
 *  - Ubicación con botón editar.
 *  - Punto de observación (ObsDotTooltip) + botón de observación en acciones.
 *  - Custodio y eliminar.
 *  - Resaltado + auto-scroll del último bien agregado.
 * El filtro de búsqueda y el header (título + contador + indicador colaborador)
 * se mantienen como en la tabla anterior.
 */
import { FaLocationDot, FaRegNoteSticky, FaUserCheck, FaUserPlus, FaTrashCan } from 'react-icons/fa6'
import type { BienInventario } from '../../services/inventarioFisicoService'
import type { RegistroObservacion } from '../../services/observacionesInventarioService'
import { registroVisible } from '../../services/observacionesInventarioService'
import SelectorEstado from './SelectorEstado'
import ObsDotTooltip from '../bienes/ObsDotTooltip'
import IndicadorColaborador, { type ColaboradorInfo } from './IndicadorColaborador'
import EcoTabla, { type EcoTablaColumna } from '../common/tabla/EcoTabla'
import './IndicadorColaborador.css'
import '../bienes/BienesTable.css'

type EstadoBien = 'B' | 'R' | 'M'

export interface TablaBienesProps {
  bienes: BienInventario[]
  filtro: string
  onFiltroChange: (valor: string) => void
  ultimoBienAgregadoIndex: number | null
  colaboradores?: ColaboradorInfo[]
  registrosObsNotas: RegistroObservacion[]
  /** @deprecated El serial ya no es editable (solo lectura). */
  onEditarSerial?: (index: number, serial: string) => void
  onEditarEstado: (index: number, estado: EstadoBien) => void
  onEditarUbicacion: (placa: string, ubicacionActual: string) => void
  onAbrirObservacion: (placa: string, textoActual: string) => void
  onAbrirCustodio: (index: number) => void
  onEliminar: (index: number, placa: string) => void
  onVerHistorial: (placa: string, descripcion: string, serial?: string) => void
  /** Servicio activo: filtra el indicador de observación por servicio + usuario. */
  servicioActivo?: string
  /** Cédula del usuario activo: filtra el indicador por servicio + usuario. */
  cedulaUsuario?: string
  /** @deprecated El flujo de estado M ahora lo gobierna el padre (confirmación + motivo). */
  onEstadoM?: (placa: string) => void
  maxHeight?: string
  permitirSinPlaca?: boolean
  rowIdPrefix?: string
  /** Paginación cliente opcional (nº de filas por página). */
  pageSize?: number
  // Props de ancho conservadas por compatibilidad (ya no se usan igual).
  serialColWidth?: string
  servicioColWidth?: string
  accionesColWidth?: string
}

export default function TablaBienes({
  bienes,
  filtro,
  onFiltroChange,
  ultimoBienAgregadoIndex,
  colaboradores = [],
  registrosObsNotas,
  onEditarEstado,
  onEditarUbicacion,
  onAbrirObservacion,
  onAbrirCustodio,
  onEliminar,
  onVerHistorial,
  servicioActivo,
  cedulaUsuario,
  maxHeight = '680px',
  permitirSinPlaca = false,
  rowIdPrefix = 'bien-row',
  pageSize,
}: TablaBienesProps) {
  // Filtrar conservando el índice ORIGINAL (los callbacks usan ese índice).
  const filtradas = bienes
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => {
      if (!filtro.trim()) return true
      const q = filtro.toLowerCase()
      return (
        b.placa.toLowerCase().includes(q) ||
        (b.descripcion || '').toLowerCase().includes(q) ||
        (b.nombre_responsable || '').toLowerCase().includes(q) ||
        (b.cedula_responsable || '').includes(q)
      )
    })

  type Fila = { b: BienInventario; i: number }

  // Datos auxiliares de observación por fila.
  // El indicador se enciende ante CUALQUIER registro de la placa visible para el
  // contexto (servicio activo + cédula): observación bloqueante (pendiente/
  // en_gestion), nota manual o alerta automática. Las automáticas son visibles
  // para todos (lo resuelve registroVisible). Se usa el MISMO helper que el
  // modal de observaciones, la campana y el bloqueo de guardado para no divergir.
  const obsDeFila = (b: BienInventario) => {
    const observacionVieja = (b as any).observacion || ''
    const registrosPlaca = registrosObsNotas.filter(
      r => r.placa === b.placa && registroVisible(r, { servicio: servicioActivo, cedula: cedulaUsuario }),
    )
    const obsBloqueante = registrosPlaca.find(
      r => r.tipo === 'observacion' && (r.estado === 'pendiente' || r.estado === 'en_gestion'),
    )
    const tiene = observacionVieja.trim() !== '' || registrosPlaca.length > 0
    // Texto para el tooltip: prioriza la observación bloqueante, luego cualquier
    // otro registro visible (nota manual/automática), luego la observación vieja.
    const texto =
      obsBloqueante?.texto ||
      registrosPlaca[0]?.texto ||
      observacionVieja ||
      'Observación pendiente'
    return { tiene, texto, observacionVieja }
  }

  const columnas: EcoTablaColumna<Fila>[] = [
    {
      key: 'num', label: 'N°', width: '3.5rem',
      render: (_f, i) => <strong>{i + 1}</strong>,
    },
    {
      key: 'placa', label: 'Placa', width: '9%', align: 'left',
      render: ({ b }) => {
        const esSinPlaca = b.placa.startsWith('SP-')
        const { tiene, texto, observacionVieja } = obsDeFila(b)
        if (esSinPlaca && permitirSinPlaca) {
          return <span className="bienes-table__sin-placa">SIN PLACA</span>
        }
        return (
          <span className="bienes-table__placa-wrap">
            <button
              type="button"
              className="bienes-table__placa-btn"
              onClick={() => onVerHistorial(b.placa, b.descripcion, b.serial)}
              title={b.placa}
            >
              {b.placa}
            </button>
            {tiene && (
              <ObsDotTooltip
                texto={texto.substring(0, 140)}
                onClick={() => onAbrirObservacion(b.placa, observacionVieja)}
              />
            )}
          </span>
        )
      },
    },
    { key: 'descripcion', label: 'Descripción', width: '16%', align: 'left', render: ({ b }) => b.descripcion || '--' },
    { key: 'serial', label: 'Serial', width: '9%', render: ({ b }) => b.serial || 'N/A' },
    {
      key: 'estado', label: 'Est.', width: '5rem',
      render: ({ b, i }) => (
        <SelectorEstado
          valor={b.estado}
          onChange={(nuevoEstado) => {
            // El padre decide el flujo de M (confirmación + motivo). Aquí solo
            // notificamos el cambio; NO disparamos onEstadoM para no abrir el
            // modal de motivo antes de confirmar.
            onEditarEstado(i, nuevoEstado as EstadoBien)
          }}
        />
      ),
    },
    { key: 'cedula', label: 'Cédula', width: '8%', render: ({ b }) => b.cedula_responsable || '--' },
    { key: 'responsable', label: 'Responsable', width: '13%', align: 'left', render: ({ b }) => b.nombre_responsable || '--' },
    { key: 'servicio', label: 'Servicio', width: '12%', align: 'left', render: ({ b }) => <span className="bienes-table__cell-text bienes-table__cell-text--small">{b.servicio || '--'}</span> },
    {
      key: 'ubicacion', label: 'Ubicación', width: '11%', align: 'left',
      render: ({ b }) => (
        <div className="bienes-table__cell-with-action">
          <span className="bienes-table__cell-text">{b.ubicacion || '--'}</span>
          <button
            type="button"
            className="bienes-table__icon-btn bienes-table__icon-btn--ghost"
            onClick={() => onEditarUbicacion(b.placa, b.ubicacion || '')}
            title="Editar ubicación"
          >
            <FaLocationDot size={11} />
          </button>
        </div>
      ),
    },
    {
      key: 'fecha', label: 'Fecha', width: '9%',
      render: ({ b }) => (
        <div className="bienes-table__fecha">
          <span>{new Date(b.timestamp).toLocaleDateString('es-CO')}</span>
          <span className="bienes-table__fecha-hora">{new Date(b.timestamp).toLocaleTimeString('es-CO')}</span>
        </div>
      ),
    },
    {
      key: 'acciones', label: 'Acciones', width: '9rem',
      render: ({ b, i }) => {
        const { tiene, observacionVieja } = obsDeFila(b)
        return (
          <div className="bienes-table__acciones-wrap">
            <button
              type="button"
              className={`bienes-table__accion-btn${tiene ? ' bienes-table__accion-btn--obs-activa' : ''}`}
              onClick={() => onAbrirObservacion(b.placa, observacionVieja)}
              title={tiene ? `Ver/editar: ${observacionVieja.substring(0, 50)}` : 'Agregar observación'}
            >
              <FaRegNoteSticky size={13} />
            </button>
            <button
              type="button"
              className={`bienes-table__accion-btn${b.custodio_nombre ? ' bienes-table__accion-btn--custodio-asignado' : ''}`}
              onClick={() => onAbrirCustodio(i)}
              title={b.custodio_nombre ? `${b.custodio_nombre} (${b.custodio_cedula})` : 'Asignar usuario'}
            >
              {b.custodio_nombre ? <FaUserCheck size={13} /> : <FaUserPlus size={13} />}
            </button>
            <button
              type="button"
              className="bienes-table__accion-btn bienes-table__accion-btn--eliminar"
              onClick={() => onEliminar(i, b.placa)}
              title="Eliminar bien"
            >
              <FaTrashCan size={12} />
            </button>
          </div>
        )
      },
    },
  ]

  // Índice (dentro de la vista filtrada) de la fila a resaltar/scrollear.
  const scrollToIndexVista = (() => {
    if (ultimoBienAgregadoIndex === null) return null
    const pos = filtradas.findIndex(({ i }) => i === ultimoBienAgregadoIndex)
    return pos >= 0 ? pos : null
  })()

  return (
    <div className="bienes-table-wrap">
      {/* Header: título + contador + indicador colaborador + filtro */}
      <div className="bienes-table-wrap__header bienes-table-wrap__header--fila">
        <div className="bienes-table-wrap__titulo-row">
          <h5 className="bienes-table-wrap__titulo">Bienes escaneados</h5>
          <span className="bienes-table-wrap__badge">{bienes.length}</span>
        </div>
        <div className="bienes-table-wrap__colab-centro">
          <IndicadorColaborador colaboradores={colaboradores} />
        </div>
        <div className="bienes-table-wrap__filtro bienes-table-wrap__filtro--flex">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6c757d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="bienes-table-wrap__filtro-icon">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Buscar placa, descripción o responsable"
            value={filtro}
            onChange={(e) => onFiltroChange(e.target.value)}
            className="bienes-table-wrap__filtro-input"
          />
        </div>
      </div>

      <EcoTabla<Fila>
        columns={columnas}
        data={filtradas}
        getRowKey={({ i }) => i}
        rowIdPrefix={rowIdPrefix}
        scrollToIndex={scrollToIndexVista}
        maxHeight={maxHeight}
        pageSize={pageSize}
        emptyMessage="No hay bienes para mostrar."
        getRowClassName={({ b, i }) => {
          const { tiene } = obsDeFila(b)
          const esUltimo = i === ultimoBienAgregadoIndex
          const esSinPlaca = b.placa.startsWith('SP-')
          return [
            esUltimo ? 'inventario-ultimo-bien' : '',
            esSinPlaca && permitirSinPlaca ? 'inventario-bien-sin-placa' : '',
            tiene ? 'bienes-table__row--con-observacion' : '',
          ].filter(Boolean).join(' ') || undefined
        }}
      />
    </div>
  )
}
