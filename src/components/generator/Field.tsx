import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * The shared look for every control in the form rail: a white box with a
 * hairline border that turns blue on focus. Kept as one constant so the
 * inputs, the number field and the combobox triggers cannot drift apart.
 */
export const CONTROL_CLASS =
  'border-hairline text-ink placeholder:text-ink-muted/70 h-10 w-full rounded-lg border bg-white px-3 text-sm shadow-none transition-colors focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/15'

export function Field({
  id,
  label,
  labelHint,
  required = false,
  description,
  error,
  children,
}: {
  id: string
  label: string
  /** Muted text beside the label, e.g. "(max 1000)". */
  labelHint?: string
  /** Marks the field with an asterisk. The control carries `aria-required`. */
  required?: boolean
  description?: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id} className="text-ink gap-1.5 text-[13px] font-medium">
        {/*
          The asterisk sits inside the label's own span so the flex gap stays
          between the label and its hint, not between the word and the mark.
          It is decorative: `aria-required` on the control is what a screen
          reader announces.
        */}
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
      </Label>

      {children}

      {error ? (
        <p role="alert" className="text-[12px] text-red-600">
          {error}
        </p>
      ) : description ? (
        <p className="text-ink-muted text-[12px]">{description}</p>
      ) : null}
    </div>
  )
}

/** A field-level note that stands alongside, not instead of, the description. */
export function FieldNote({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'warning'
  children: ReactNode
}) {
  return (
    <p
      className={cn(
        'text-[12px]',
        tone === 'warning' ? 'text-amber-700' : 'text-ink-muted',
      )}
    >
      {children}
    </p>
  )
}
