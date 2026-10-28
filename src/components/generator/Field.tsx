import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label'

/** Shared styling for every input and combobox trigger in the form. */
export const CONTROL_CLASS =
  'border-hairline text-ink placeholder:text-ink-muted/70 h-10 w-full rounded-lg border bg-white px-3 text-sm shadow-none transition-colors focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/15'

export function Field({
  id,
  label,
  labelHint,
  labelChip,
  required = false,
  description,
  error,
  children,
}: {
  id: string
  label: string
  /** Muted text beside the label, e.g. "(max 1000)". */
  labelHint?: string
  /** A small pill after the label, e.g. how many options there are. */
  labelChip?: ReactNode
  /** Marks the field with an asterisk. The control carries `aria-required`. */
  required?: boolean
  description?: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id} className="text-ink gap-1.5 text-[13px] font-medium">
        {/* Decorative; the control's `aria-required` is what is announced. */}
        <span>
          {label}
          {required ? (
            <span aria-hidden className="text-red-500">
              *
            </span>
          ) : null}
        </span>
        {labelHint ? (
          <span className="text-ink-muted font-normal">{labelHint}</span>
        ) : null}
        {labelChip ? (
          <span className="bg-ink/5 text-ink-muted rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums">
            {labelChip}
          </span>
        ) : null}
      </Label>

      {children}

      {error ? (
        // Schema messages have no field name; the label supplies it.
        <p role="alert" className="text-[12px] text-red-600 first-letter:uppercase">
          {error}
        </p>
      ) : description ? (
        <p className="text-ink-muted text-[12px]">{description}</p>
      ) : null}
    </div>
  )
}

/** A field-level note that stands alongside, not instead of, the description. */
export function FieldNote({ children }: { children: ReactNode }) {
  return <p className="text-ink-muted text-[12px]">{children}</p>
}
