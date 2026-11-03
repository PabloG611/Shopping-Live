import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export interface CabeceraFiltrosCaja {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Velo sobre la primera fila del `<thead>` (títulos): posición y detección de
 * puntero solo en esa fila (la fila de buscadores no muestra el botón).
 */
export function useTheadFiltrosCabecal(activo: boolean, deps: unknown[]) {
  /** Contenedor externo (sin overflow-x): ancla el velo sin inflar el scroll de la tabla */
  const hostRef = useRef<HTMLDivElement>(null)
  /** Panel con scroll horizontal de la tabla; solo existe si `activo` */
  const paneRef = useRef<HTMLDivElement>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const [sobreCabecera, setSobreCabecera] = useState(false)
  const [caja, setCaja] = useState<CabeceraFiltrosCaja>({ top: 0, left: 0, width: 0, height: 0 })

  const elementoScroll = useCallback(() => {
    if (activo && paneRef.current) return paneRef.current
    return hostRef.current
  }, [activo])

  const actualizarCaja = useCallback(() => {
    const scroll = elementoScroll()
    const th = theadRef.current
    if (!scroll || !th) return
    /** Solo la fila de títulos: el botón y el velo no incluyen la fila de inputs de filtros. */
    const filaTitulos = th.querySelector('tr')
    const objetivo = filaTitulos ?? th
    const hr = scroll.getBoundingClientRect()
    const tr = objetivo.getBoundingClientRect()
    setCaja({
      top: tr.top - hr.top + scroll.scrollTop,
      left: tr.left - hr.left + scroll.scrollLeft,
      width: tr.width,
      height: tr.height,
    })
  }, [elementoScroll])

  useLayoutEffect(() => {
    if (!activo) {
      setSobreCabecera(false)
      return
    }
    actualizarCaja()
    const scroll = elementoScroll()
    if (!scroll) return
    const ro = new ResizeObserver(() => actualizarCaja())
    ro.observe(scroll)
    const th = theadRef.current
    if (th) {
      ro.observe(th)
      const fila0 = th.querySelector('tr')
      if (fila0) ro.observe(fila0)
    }
    const onScroll = () => actualizarCaja()
    scroll.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', actualizarCaja)
    return () => {
      ro.disconnect()
      scroll.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', actualizarCaja)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps controlan re-medición
  }, [activo, actualizarCaja, elementoScroll, ...deps])

  const punteroDentroFilaTitulos = useCallback((clientX: number, clientY: number) => {
    const th = theadRef.current
    if (!th) return false
    const filaTitulos = th.querySelector('tr')
    if (!filaTitulos) return false
    const r = filaTitulos.getBoundingClientRect()
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
  }, [])

  const onMovimientoHost = useCallback(
    (e: React.MouseEvent) => {
      if (!activo) return
      const dentro = punteroDentroFilaTitulos(e.clientX, e.clientY)
      setSobreCabecera(dentro)
      if (dentro) requestAnimationFrame(actualizarCaja)
    },
    [activo, punteroDentroFilaTitulos, actualizarCaja],
  )

  const onEntrarThead = useCallback(
    (e: React.MouseEvent) => {
      if (!activo) return
      if (!punteroDentroFilaTitulos(e.clientX, e.clientY)) return
      setSobreCabecera(true)
      requestAnimationFrame(actualizarCaja)
    },
    [activo, punteroDentroFilaTitulos, actualizarCaja],
  )

  const onSalidaHost = useCallback(() => {
    setSobreCabecera(false)
  }, [])

  return { hostRef, paneRef, theadRef, sobreCabecera, caja, onMovimientoHost, onEntrarThead, onSalidaHost, actualizarCaja }
}
