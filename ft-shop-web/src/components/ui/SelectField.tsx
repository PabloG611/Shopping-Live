import Select, { type GroupBase, type SingleValue, type StylesConfig, type Theme } from 'react-select'

import './SelectField.css'

export type SelectFieldOption = { value: string; label: string }

/** Alineado con `.receptor-trx__input` / `.receptor-trx__select` */
const BORDER = '#dce6f0'
const BORDER_INTERACCION = '#365072'
const BORDER_INVALIDO = '#dc3545'
const TEXTO = '#1a1d21'
const PLACEHOLDER = '#9ca3af'
const ALTURA_MIN = 40
const RADIO = 8
/** Ancho mínimo del menú: evita lista “aplastada” cuando el control es estrecho (p. ej. tipo de documento). */
const MENU_MIN_ANCHO = '12.5rem'

/** Tema alineado al formulario; evita que queden colores/sombras por defecto de react-select en el listado. */
function temaSelect(tema: Theme): Theme {
  return {
    ...tema,
    borderRadius: RADIO,
    spacing: {
      ...tema.spacing,
      controlHeight: ALTURA_MIN,
      menuGutter: 4,
    },
    colors: {
      ...tema.colors,
      primary: BORDER_INTERACCION,
      primary75: '#4a6788',
      primary50: '#c5d0e0',
      primary25: '#eef2f8',
      neutral0: '#ffffff',
      neutral5: '#f8fafc',
      neutral20: '#9ca3af',
    },
  }
}

function estilosSelect<Option extends SelectFieldOption>(
  isInvalid: boolean,
): StylesConfig<Option, false, GroupBase<Option>> {
  const borde = (state: { isFocused: boolean; isDisabled: boolean }) => {
    if (state.isDisabled) return BORDER
    if (isInvalid) return BORDER_INVALIDO
    if (state.isFocused) return BORDER_INTERACCION
    return BORDER
  }

  return {
    control: (base, state) => ({
      ...base,
      minHeight: ALTURA_MIN,
      borderRadius: RADIO,
      borderWidth: 2,
      borderStyle: 'solid',
      borderColor: borde(state),
      boxShadow: 'none',
      backgroundColor: '#fff',
      fontSize: '0.9rem',
      color: TEXTO,
      cursor: state.isDisabled ? 'not-allowed' : 'pointer',
      opacity: state.isDisabled ? 0.65 : 1,
      transition: 'border-color 0.15s ease',
      '&:hover': {
        borderColor: state.isDisabled
          ? BORDER
          : isInvalid
            ? BORDER_INVALIDO
            : BORDER_INTERACCION,
        boxShadow: 'none',
      },
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '0 0.65rem',
    }),
    placeholder: (base) => ({
      ...base,
      color: PLACEHOLDER,
      fontSize: '0.9rem',
    }),
    singleValue: (base) => ({
      ...base,
      color: TEXTO,
      fontSize: '0.9rem',
    }),
    input: (base) => ({
      ...base,
      color: TEXTO,
      fontSize: '0.9rem',
    }),
    indicatorsContainer: (base) => ({
      ...base,
      paddingRight: 4,
    }),
    indicatorSeparator: (base) => ({
      ...base,
      backgroundColor: BORDER,
    }),
    dropdownIndicator: (base, state) => ({
      ...base,
      color: state.isFocused ? BORDER_INTERACCION : '#5c6474',
      padding: '0 0.45rem',
      '&:hover': { color: BORDER_INTERACCION },
    }),
    clearIndicator: (base) => ({
      ...base,
      color: '#5c6474',
      padding: '0 0.35rem',
      '&:hover': { color: BORDER_INTERACCION },
    }),
    menu: (base) => ({
      ...base,
      minWidth: `max(100%, ${MENU_MIN_ANCHO})`,
      backgroundColor: '#fff',
      borderRadius: RADIO,
      border: `2px solid ${BORDER}`,
      boxShadow: '0 4px 12px rgb(48 61 80 / 0.1)',
      overflow: 'hidden',
    }),
    menuList: (base) => ({
      ...base,
      padding: 4,
      backgroundColor: '#fff',
    }),
    option: (base, state) => ({
      ...base,
      fontSize: '0.875rem',
      borderRadius: 6,
      cursor: 'pointer',
      padding: '8px 12px',
      color: state.isSelected ? '#fff' : TEXTO,
      backgroundColor: state.isSelected ? BORDER_INTERACCION : state.isFocused ? '#eef2f8' : 'transparent',
      '&:active': {
        backgroundColor: state.isSelected ? BORDER_INTERACCION : '#e2e8f0',
      },
    }),
  }
}

export interface SelectFieldProps<Option extends SelectFieldOption = SelectFieldOption> {
  id: string
  label: React.ReactNode
  options: Option[]
  value: SingleValue<Option>
  onChange: (selected: SingleValue<Option>) => void
  placeholder?: string
  isClearable?: boolean
  isDisabled?: boolean
  required?: boolean
  name?: string
  className?: string
  isInvalid?: boolean
  isSearchable?: boolean
}

export function SelectField<Option extends SelectFieldOption = SelectFieldOption>({
  id,
  label,
  options,
  value,
  onChange,
  placeholder,
  isClearable = true,
  isDisabled = false,
  required,
  name,
  className,
  isInvalid = false,
  isSearchable = true,
}: SelectFieldProps<Option>) {
  return (
    <div className="select-field">
      <label
        className={`select-field__label${required ? ' required' : ''}`}
        htmlFor={id}
      >
        {label}
      </label>
      <Select<Option, false>
        inputId={id}
        name={name}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        isClearable={isClearable}
        isDisabled={isDisabled}
        isSearchable={isSearchable}
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        className={`react-select-container${className ? ` ${className}` : ''}`}
        classNamePrefix="react-select"
        theme={temaSelect}
        styles={estilosSelect<Option>(isInvalid)}
        aria-invalid={isInvalid}
        aria-describedby={isInvalid ? `${id}-feedback` : undefined}
      />
    </div>
  )
}
