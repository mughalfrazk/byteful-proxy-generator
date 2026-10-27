'use client'

import { cn } from '@/lib/utils'

export type Choice<T extends string> = {
  value: T
  label: string
  hint?: string
}

/**
 * A stack (or pair) of selectable cards — the blue-when-chosen control from
 * the design.
 *
 * It wraps real `<input type="radio">` elements rather than buttons with
 * `role="radio"`: that gets arrow-key navigation, the roving tab stop and
 * form semantics from the browser instead of from hand-written key handlers.
 */
export function ChoiceGroup<T extends string>({
  name,
  value,
  onChange,
  choices,
  columns = 1,
}: {
  name: string
  value: T | undefined
  onChange: (value: T) => void
  choices: ReadonlyArray<Choice<T>>
  columns?: 1 | 2
  }) {
  return (
    <div className={cn('grid gap-2', columns === 2 && 'grid-cols-2')}>
      {choices.map((choice) => {
        const selected = choice.value === value

        return (
          <label
            key={choice.value}
            className={cn(
              'flex cursor-pointer flex-col justify-center rounded-lg border px-3 py-2.5 text-sm transition-colors',
              'has-[:focus-visible]:ring-brand/30 has-[:focus-visible]:ring-[3px]',
              selected
                ? 'border-brand bg-brand text-white'
                : 'border-hairline text-ink hover:border-ink-muted/40 bg-white',
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={choice.value}
              checked={selected}
              onChange={() => onChange(choice.value)}
            />
            <span className={cn('font-medium', !choice.hint && 'font-mono')}>
              {choice.label}
            </span>
            {choice.hint ? (
              <span
                className={cn(
                  'mt-0.5 text-[12px]',
                  selected ? 'text-white/75' : 'text-ink-muted',
                )}
              >
                {choice.hint}
              </span>
            ) : null}
          </label>
        )
      })}
    </div>
  )
}
