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
import { formatNodeCount } from '@/lib/format'
import { cn } from '@/lib/utils'

import { CONTROL_CLASS } from './Field'

/** Rows painted per page, so the ~13,500 worldwide ASNs open instantly. */
const OPTIONS_PER_PAGE = 100

/** Load the next page this far before the bottom, so scrolling never stalls. */
const SCROLL_THRESHOLD_PX = 600

export type ComboboxOption = {
  value: string
  label: string
  /** Muted, bracketed text after the label (an ASN number); also searched. */
  detail?: string
  nodeCount?: number
}

function searchableText(option: ComboboxOption): string {
  return option.detail ? `${option.label} ${option.detail}` : option.label
}

/** Folds case and accents, so `sao paulo` finds São Paulo. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function OptionText({ option }: { option: ComboboxOption }) {
  return (
    <>
      {option.label}
      {option.detail ? (
        <span className="text-ink-muted font-normal"> ({option.detail})</span>
      ) : null}
    </>
  )
}

type Props = {
  id: string
  /** For the clear button's accessible name. */
  label: string
  placeholder: string
  searchPlaceholder: string
  options: ComboboxOption[]
  value: string | undefined
  onChange: (value: string | undefined) => void
  isLoading?: boolean
  error?: Error
  onRetry?: () => void
  disabled?: boolean
  emptyLabel: (search: string) => string
}

/**
 * A select with a search box, not a free-text input: only picking an option
 * writes to the form, so only values from a lookup can be submitted.
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
  const [visibleCount, setVisibleCount] = useState(OPTIONS_PER_PAGE)

  // Filtered here, not by cmdk, which mounts and rescores every item: ~3s to
  // open the worldwide ASN list. Search covers all of it; only painting pages.
  const query = normalize(searchText.trim())
  const matches = query
    ? options.filter((option) =>
        normalize(searchableText(option)).includes(query),
      )
    : options

  const visible = matches.slice(0, visibleCount)
  const remaining = matches.length - visible.length

  // Arrow keys scroll the same container, so the keyboard pages too.
  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    if (remaining === 0) return

    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget
    if (scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD_PX) {
      setVisibleCount((count) => count + OPTIONS_PER_PAGE)
    }
  }

  function handleSearchChange(next: string) {
    setSearchText(next)
    setVisibleCount(OPTIONS_PER_PAGE)
  }

  // Keeps the trigger label when the options no longer contain the selection.
  // Stored with its value, so it drops out when the parent changes the field.
  const [lastSelected, setLastSelected] = useState<ComboboxOption | null>(null)

  const remembered =
    value !== undefined && lastSelected?.value === value ? lastSelected : null

  const selected =
    options.find((option) => option.value === value) ?? remembered

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setSearchText('')
      setVisibleCount(OPTIONS_PER_PAGE)
    }
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
    // The clear button sits beside the trigger: buttons cannot nest.
    <div className="relative min-w-0">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            // A button that opens a listbox; Base UI adds the ARIA attributes.
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
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              !selected && 'text-ink-muted/70',
            )}
          >
            {selected ? <OptionText option={selected} /> : placeholder}
          </span>
        </PopoverTrigger>

        {/* Capped to the viewport space Base UI reports. */}
        <PopoverContent
          className="border-hairline flex max-h-(--available-height) w-(--anchor-width) min-w-64 flex-col overflow-hidden p-0"
          align="start"
        >
          <Command shouldFilter={false} className="min-h-0 flex-1">
            <CommandInput
              placeholder={searchPlaceholder}
              value={searchText}
              onValueChange={handleSearchChange}
            />
            {/*
              Forces an always-visible scrollbar over macOS's fading overlay,
              so long lists look long. No `scrollbar-width`: Chrome then
              ignores these pseudo-elements.
            */}
            <CommandList
              onScroll={handleScroll}
              className="min-h-0 flex-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-4 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-ink-muted/40 [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-3"
            >
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
                      // Must be unique for cmdk; labels can repeat.
                      value={option.value}
                      onSelect={() => handleSelect(option)}
                      className={cn(
                        option.value === value && 'text-brand font-medium',
                      )}
                    >
                      {/* Wraps, so long ASN names can be read in full. */}
                      <span className="min-w-0 flex-1 break-words">
                        <OptionText option={option} />
                      </span>
                      {option.nodeCount !== undefined ? (
                        <span className="text-ink-muted text-xs tabular-nums">
                          {formatNodeCount(option.nodeCount)}
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}

                  {remaining > 0 ? (
                    <p
                      aria-live="polite"
                      className="text-ink-muted border-hairline border-t px-3 py-2 text-xs"
                    >
                      {remaining.toLocaleString()} more — scroll or type to
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
