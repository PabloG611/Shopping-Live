/**
 * Indicador animado de "en proceso" — gatito corriendo.
 * Reutilizable en cualquier componente que necesite indicar movimiento/proceso.
 */
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import './WalkingIndicator.css'

const LOTTIE_URL = 'https://lottie.host/404b8931-4819-4d43-a20b-24f5afe420a0/QADB0y0Oxx.json'

interface WalkingIndicatorProps {
  size?: number
}

export function WalkingIndicator({ size = 32 }: WalkingIndicatorProps) {
  return (
    <span className="walking-indicator">
      <DotLottieReact src={LOTTIE_URL} loop autoplay style={{ width: size, height: size }} />
    </span>
  )
}
