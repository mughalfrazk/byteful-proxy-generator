'use client'

import { cn } from '@/lib/utils'

export type Choice<T extends string> = {
  value: T
  label: string
  hint?: string
  /**
   * Renders the label and hint in the mono face, for choices whose value is
   * literal syntax (a scheme, a URL template) rather than prose.
   */
  mono?: boolean
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
            <span className={cn('font-medium', choice.mono && 'font-mono')}>
              {choice.label}
            </span>
            {choice.hint ? (
              // `truncate` is the safety net: these cards sit in a fixed-width
              // rail, so a long hint must ellipsize rather than widen the column.
              <span
                className={cn(
                  'mt-0.5 truncate',
                  choice.mono
                    ? 'font-mono text-[10px] tracking-tight'
                    : 'text-[12px]',
                  // The mono hint is smaller, so it gets a little more contrast
                  // back to stay legible on the selected card.
                  selected
                    ? choice.mono
                      ? 'text-white/80'
                      : 'text-white/75'
                    : 'text-ink-muted/70',
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
