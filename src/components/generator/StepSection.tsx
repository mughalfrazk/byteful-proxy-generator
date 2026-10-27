import type { ReactNode } from 'react'

/**
 * One numbered step in the form rail, with the connector line that runs from
 * this step's badge down to the next one.
 */
export function StepSection({
  step,
  title,
  description,
  isLast = false,
  children,
}: {
  step: number
  title: string
  description?: string
  isLast?: boolean
  children: ReactNode
}) {
  return (
    <fieldset className="relative pl-10">
      <span
        aria-hidden
        className="bg-brand absolute top-0 left-0 flex size-6 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      >
        {step}
      </span>

      {/* The rail between badges. Decorative, so it is hidden from the tree. */}
      {isLast ? null : (
        <span
          aria-hidden
          className="bg-hairline absolute top-7 bottom-0 left-[11.5px] w-px"
        />
      )}

      <legend className="sr-only">{title}</legend>
      <p aria-hidden className="text-ink pt-0.5 text-sm font-semibold">
        {title}
      </p>
      {description ? (
        <p className="text-ink-muted mt-0.5 text-[12px]">{description}</p>
      ) : null}

      <div className="mt-4 grid min-w-0 gap-4 pb-2">{children}</div>
    </fieldset>
  )
}
