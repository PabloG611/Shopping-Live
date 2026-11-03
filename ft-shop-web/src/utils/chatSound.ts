/**
 * Sonido de notificación para el chat — tono corto sintético estilo iOS.
 * Usa Web Audio API (sin archivos ni licencias). Reproduce dos notas rápidas
 * ascendentes, similar al "tri-tono" de mensajería de iOS, pero original.
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return null
      audioCtx = new Ctx()
    }
    // Algunos navegadores suspenden el contexto hasta una interacción del usuario.
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

/** Reproduce una nota con envolvente suave (ataque/decay) para que suene limpia. */
function tono(ctx: AudioContext, freq: number, start: number, dur: number, gainPeak = 0.18) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, start)

  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

/**
 * Reproduce el sonido de mensaje entrante (dos notas rápidas ascendentes).
 * Es fire-and-forget; si el audio no está disponible, no hace nada.
 */
export function reproducirSonidoMensaje() {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime
  // Dos notas: sol5 (~784Hz) y do6 (~1047Hz), tipo "ti-ri" corto y agudo.
  tono(ctx, 784, now, 0.13)
  tono(ctx, 1047, now + 0.11, 0.18)
}
