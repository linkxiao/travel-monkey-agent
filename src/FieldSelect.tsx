import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type FieldOption = { value: string; label: string }

function Chevron({ open }: { open?: boolean }) {
  return (
    <svg className={open ? 'field-select-chevron open' : 'field-select-chevron'} width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
      <path d="M1.5 1.5 L6 6 L10.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function FieldSelect({
  value,
  options,
  onChange,
  disabled,
  compact,
  light,
  'aria-label': ariaLabel,
}: {
  value: string
  options: FieldOption[]
  onChange: (value: string) => void
  disabled?: boolean
  compact?: boolean
  light?: boolean
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = options.find((o) => o.value === value) || options[0]
  const label = current?.label || value || '请选择'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(next: string) {
    onChange(next)
    setOpen(false)
  }

  const cls = ['field-select', compact ? 'compact' : '', light ? 'light' : ''].filter(Boolean).join(' ')

  return (
    <div className={cls} ref={rootRef}>
      <button
        type="button"
        className="field-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="field-select-value">{label}</span>
        <Chevron open={open} />
      </button>
      {open && createPortal(
        <div className="field-select-layer" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            className="field-select-sheet"
            role="listbox"
            id={listId}
            aria-label={ariaLabel}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="field-select-handle" aria-hidden="true" />
            {ariaLabel && <div className="field-select-title">{ariaLabel}</div>}
            <ul className="field-select-list">
              {options.map((o) => {
                const on = o.value === value
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={on ? 'on' : undefined}
                      onClick={() => pick(o.value)}
                    >
                      <span className="field-select-mark" aria-hidden="true" />
                      <span>{o.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
