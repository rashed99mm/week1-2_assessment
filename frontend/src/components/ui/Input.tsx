import { cn } from '../../lib/cn'
import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'

const fieldClasses =
  'block w-full rounded-lg border-0 bg-panel px-3.5 py-2.5 text-sm text-white ring-1 ring-inset ring-line placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-accent focus:outline-none'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  const fieldId = id ?? props.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-slate-200">
          {label}
        </label>
      )}
      <input
        id={fieldId}
        className={cn(fieldClasses, error && 'ring-accent focus:ring-accent')}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-accent-soft">{error}</p>}
    </div>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export function Select({ label, error, className, id, children, ...props }: SelectProps) {
  const fieldId = id ?? props.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-slate-200">
          {label}
        </label>
      )}
      <select
        id={fieldId}
        className={cn(fieldClasses, error && 'ring-accent focus:ring-accent')}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-accent-soft">{error}</p>}
    </div>
  )
}
