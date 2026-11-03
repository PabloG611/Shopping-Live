/**
 * StepperInline — Stepper reutilizable con efecto líquido.
 * Reemplaza al StepperV2 de la librería.
 * - Ir atrás: siempre libre, sin validación.
 * - Ir adelante: ejecuta handleNextClick del paso actual (si existe).
 * - Se puede meter donde quieras (no renderiza contenido, eso lo manejas afuera).
 */
import { useCallback } from 'react'
import { FaCheck } from 'react-icons/fa6'
import type { IconType } from 'react-icons'
import './StepperInline.css'

export interface StepperInlineStep {
  label: string
  icon: IconType
  handleNextClick?: () => boolean | Promise<boolean>
}

interface StepperInlineProps {
  steps: StepperInlineStep[]
  currentStep: number
  onStepChange: (index: number) => void
  pageProgress?: number
}

export function StepperInline({ steps, currentStep, onStepChange, pageProgress = 100 }: StepperInlineProps) {
  const handleClick = useCallback(async (index: number) => {
    if (index === currentStep) return

    // Ir hacia atrás: siempre libre
    if (index < currentStep) {
      onStepChange(index)
      return
    }

    // Ir hacia adelante: validar paso actual
    const handler = steps[currentStep]?.handleNextClick
    if (handler) {
      const result = await handler()
      if (result === false) return
    }
    // Solo avanzar un paso a la vez
    onStepChange(currentStep + 1)
  }, [currentStep, steps, onStepChange])

  return (
    <div className="stepper-inline">
      <ul className="stepper-inline__progress">
        {steps.map((step, index) => {
          const isCurrent = index === currentStep
          const isCompleted = index < currentStep
          const Icon = step.icon

          const circleStyle: React.CSSProperties = isCurrent
            ? { '--page-progress': pageProgress } as React.CSSProperties
            : {}

          let lineFillerStyle: React.CSSProperties = {}
          if (isCompleted) lineFillerStyle = { width: '100%' }
          else if (isCurrent) lineFillerStyle = { width: `${pageProgress}%` }

          let className = 'stepper-inline__step'
          if (isCurrent) className += ' is-active'
          if (isCompleted) className += ' is-completed'
          if (index === 0) className += ' is-first'
          if (index === steps.length - 1) className += ' is-last'

          return (
            <li
              key={index}
              className={className}
              onClick={() => handleClick(index)}
              role="button"
              tabIndex={0}
              aria-label={`${step.label}${isCurrent ? ' (actual)' : isCompleted ? ' (completado)' : ''}`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(index) } }}
            >
              <div className="stepper-inline__connector">
                <div className="stepper-inline__connector-filler" style={lineFillerStyle} />
              </div>
              <div className="stepper-inline__circle" style={circleStyle}>
                {isCompleted ? <FaCheck size={14} /> : <Icon size={16} />}
              </div>
              <span className="stepper-inline__label">{step.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
