'use client'

import { ChevronDownIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
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
  /** The search text. Owned by the parent only when searching is server-side. */
  search?: string
  onSearchChange?: (search: string) => void
  /** `true` for lists we hold whole (countries); `false` for server-side search. */
  filterLocally?: boolean
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
  search,
  onSearchChange,
  filterLocally = false,
  isLoading = false,
  error,
  onRetry,
  disabled = false,
  emptyLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState('')

  const searchText = search ?? localSearch
  const setSearchText = onSearchChange ?? setLocalSearch

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
          <Command shouldFilter={filterLocally}>
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
                  <CommandEmpty>{emptyLabel(searchText)}</CommandEmpty>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={filterLocally ? option.label : option.value}
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
