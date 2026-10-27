'use client'

import { ChevronDownIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { CONTROL_CLASS } from './Field'

/**
 * How many rows are painted at once. Enough that the untyped list looks
 * complete for every country, small enough that opening and typing stay
 * instant on the worldwide ASN list.
 */
const MAX_VISIBLE_OPTIONS = 100

export type ComboboxOption = {
  value: string
  label: string
  nodeCount?: number
}

type Props = {
  id: string
  /** Used for the clear button's accessible name. */
  label: string
  placeholder: string
  searchPlaceholder: string
  options: ComboboxOption[]
  /** The selected value, i.e. what the form holds. */
  value: string | undefined
  onChange: (value: string | undefined) => void
  isLoading?: boolean
  error?: Error
  onRetry?: () => void
  disabled?: boolean
  emptyLabel: (search: string) => string
}

/**
 * A select with a search box, not a free-text input.
 *
 * The distinction matters for correctness, not only for looks:
 *
 *   - **Only `onSelect` writes to the form field.** Typing never does.
 *   - **Unselected text is discarded**: closing the popover clears the search
 *     and the trigger falls back to the selected option's label.
 *
 * Together those mean the only values that can reach
 * `POST /api/residential/list` from this page are ones that came back from a
 * lookup for the country currently selected.
 */
export function LocationCombobox({
  id,
  label,
  placeholder,
  searchPlaceholder,
  options,
  value,
  onChange,
  isLoading = false,
  error,
  onRetry,
  disabled = false,
  emptyLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const [searchText, setSearchText] = useState('')

  /**
   * Matching is done here rather than by cmdk so the rendered list can be
   * capped. cmdk keeps every item mounted and rescores all of them per
   * keystroke, which the worldwide ASN list (15,077 entries) turns into a
   * ~3s open and ~1.7s per character. Searching still covers the whole list —
   * only what is painted is limited.
   */
  const matches = searchText
    ? options.filter((option) =>
        option.label.toLowerCase().includes(searchText.toLowerCase()),
      )
    : options

  const visible = matches.slice(0, MAX_VISIBLE_OPTIONS)
  const hiddenCount = matches.length - visible.length

  // The selected label has to survive a search that no longer returns it, so
  // the chosen option is remembered rather than looked up in the current
  // options. It is stored with its value, so when the parent clears or changes
  // the field the remembered label stops matching and falls away on its own —
  // no effect needed to reset it.
  const [lastSelected, setLastSelected] = useState<ComboboxOption | null>(null)

  const remembered =
    value !== undefined && lastSelected?.value === value ? lastSelected : null

  const matchingLabel =
    options.find((option) => option.value === value)?.label ??
    remembered?.label

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setSearchText('')
  }

  function handleSelect(option: ComboboxOption) {
    onChange(option.value)
    setLastSelected(option)
    handleOpenChange(false)
  }

  function handleClear() {
    onChange(undefined)
    setLastSelected(null)
  }

  const canClear = value !== undefined && !disabled

  return (
    // The clear control is a sibling of the trigger, positioned over it: a
    // button inside a button would not be valid HTML.
    <div className="relative min-w-0">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            // No explicit `role="combobox"`: the search input lives inside the
            // popup rather than on the trigger, so this is a button that opens
            // a listbox, and that is what Base UI's trigger announces — it
            // supplies aria-haspopup, aria-expanded and aria-controls itself.
            <button
              id={id}
              type="button"
              disabled={disabled}
              className={cn(
                CONTROL_CLASS,
                'flex items-center justify-between text-left disabled:cursor-not-allowed disabled:opacity-60',
                canClear ? 'pr-16' : 'pr-9',
              )}
            />
          }
        >
          {/*
            `min-w-0` is what actually lets `truncate` work here: without it a
            long option label (an ASN name, say) sets the button's intrinsic
            width and pushes the whole rail wider than its column.
          */}
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              !matchingLabel && 'text-ink-muted/70',
            )}
          >
            {matchingLabel ?? placeholder}
          </span>
        </PopoverTrigger>

        <PopoverContent
          className="border-hairline w-(--anchor-width) min-w-64 p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={searchText}
              onValueChange={setSearchText}
            />
            <CommandList>
              {error ? (
                <div className="p-3 text-sm">
                  <p className="text-red-600">{error.message}</p>
                  {onRetry ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={onRetry}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              ) : isLoading && options.length === 0 ? (
                <div className="text-ink-muted p-3 text-sm">Loading…</div>
              ) : (
                <>
                  {visible.length === 0 ? (
                    <div className="text-ink-muted p-3 text-sm">
                      {emptyLabel(searchText)}
                    </div>
                  ) : null}
                  {visible.map((option) => (
                    <CommandItem
                      key={option.value}
                      // cmdk identifies an item by `value`, so this has to be
                      // the unique one (an alias, not a label): two cities can
                      // share a name, and a duplicate value would make keyboard
                      // selection pick the wrong row.
                      value={option.value}
                      onSelect={() => handleSelect(option)}
                      className={cn(
                        option.value === value && 'text-brand font-medium',
                      )}
                    >
                      <span className="flex-1 truncate">{option.label}</span>
                      {option.nodeCount !== undefined ? (
                        <span className="text-ink-muted text-xs tabular-nums">
                          {option.nodeCount.toLocaleString()}
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}

                  {/*
                    Silently truncating would read as "that is everything".
                    Saying how many are left over tells the user that typing
                    will reach them.
                  */}
                  {hiddenCount > 0 ? (
                    <p
                      aria-live="polite"
                      className="text-ink-muted border-hairline border-t px-3 py-2 text-xs"
                    >
                      {hiddenCount.toLocaleString()} more — keep typing to
                      narrow.
                    </p>
                  ) : null}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <ChevronDownIcon
        aria-hidden
        className="text-ink-muted pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />

      {canClear ? (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={handleClear}
          className="text-ink-muted hover:text-ink absolute top-1/2 right-9 -translate-y-1/2 rounded p-0.5 focus-visible:ring-[3px] focus-visible:ring-brand/30 focus-visible:outline-none"
        >
          <XIcon className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
