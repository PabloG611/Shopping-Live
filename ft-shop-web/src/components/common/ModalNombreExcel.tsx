/**
 * Modal reutilizable para pedir el nombre del archivo antes de exportar a Excel.
 *
 * No arma el Excel: solo captura el nombre y lo entrega por callback (sin la
 * extensión .xlsx, que cada consumidor agrega o pasa a XLSX.writeFile).
 *
 * Uso típico:
 *   const [abrir, setAbrir] = useState(false)
 *   <ModalNombreExcel
 *     isOpen={abrir}
 *     nombrePorDefecto={`Reporte_${fecha}`}
 *     onCancelar={() => setAbrir(false)}
 *     onConfirmar={(nombre) => { generarExcel(nombre); setAbrir(false) }}
 *   />
 */
import { useEffect, useRef, useState } from 'react'
import { FaFileExcel } from 'react-icons/fa'

interface ModalNombreExcelProps {
  isOpen: boolean
  /** Nombre sugerido (sin extensión) que aparece prellenado en el input */
  nombrePorDefecto?: string
  /** Texto de ayuda opcional bajo el título */
  descripcion?: string
  onCancelar: () => void
  /** Recibe el nombre final ya recortado (sin .xlsx) */
  onConfirmar: (nombre: string) => void
}

export default function ModalNombreExcel({
  isOpen,
  nombrePorDefecto = '',
  descripcion = 'Ingrese el nombre del archivo (sin extensión)',
  onCancelar,
  onConfirmar,
}: ModalNombreExcelProps) {
  const [nombre, setNombre] = useState(nombrePorDefecto)
  const inputRef = useRef<HTMLInputElement>(null)

  // Al abrir, re-sincronizar con el nombre por defecto y seleccionar el texto.
  useEffect(() => {
    if (isOpen) {
      setNombre(nombrePorDefecto)
      const t = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 40)
      return () => clearTimeout(t)
    }
  }, [isOpen, nombrePorDefecto])

  // Escape para cerrar
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onCancelar])

  if (!isOpen) return null

  const confirmar = () => {
    const limpio = nombre.trim()
    if (!limpio) return
    onConfirmar(limpio)
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, padding: '1rem',
      }}
      onClick={onCancelar}
    >
      <div
        style={{
          backgroundColor: '#fff', borderRadius: '12px',
          maxWidth: '500px', width: '100%', padding: '2rem',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', color: '#303d50', fontWeight: 600 }}>
          Exportar a Excel
        </h3>
        <p style={{ margin: '0 0 1.5rem', color: '#6c757d', fontSize: '0.95rem' }}>
          {descripcion}
        </p>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#495057', fontSize: '0.9rem' }}>
            Nombre del archivo:
          </label>
          <input
            ref={inputRef}
            type="text"
            className="admin-db-field-input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmar() }}
            placeholder="Ej: Reporte_2026-05-12"
            style={{ width: '100%', fontSize: '0.95rem' }}
          />
          <small style={{ display: 'block', marginTop: '0.5rem', color: '#6c757d', fontSize: '0.85rem' }}>
            Se agregará automáticamente la extensión .xlsx
          </small>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            className="admin-db-btn-cancel"
            onClick={onCancelar}
            style={{ padding: '0.6rem 1.5rem', fontSize: '0.95rem' }}
          >
            Cancelar
          </button>
          <button
            className="admin-db-btn-save"
            onClick={confirmar}
            disabled={!nombre.trim()}
            style={{ padding: '0.6rem 1.5rem', fontSize: '0.95rem', background: '#28a745', borderColor: '#28a745', opacity: nombre.trim() ? 1 : 0.6 }}
          >
            <FaFileExcel style={{ marginRight: '0.5rem' }} />
            Exportar
          </button>
        </div>
      </div>
    </div>
  )
}
