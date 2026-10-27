'use client'

import { CheckIcon, CopyIcon, DownloadIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ListRequest } from '@/lib/models/residential'
import { cn } from '@/lib/utils'

export type ResultState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; proxies: string[]; request: ListRequest }

/**
 * A generated list is never empty, because `list_count` is at least 1. The
 * spec's "empty result" state is therefore the idle one — nothing generated
 * yet — and a separate empty branch would be dead code.
 */
function buildFilename(request: ListRequest): string {
  const parts = [
    'byteful',
    request.country_id,
    request.city_alias,
    request.asn_id ? `as${request.asn_id}` : undefined,
    request.list_session_type,
    String(request.list_count),
  ].filter((part): part is string => Boolean(part))

  return `${parts.join('-').replace(/[^a-zA-Z0-9._-]+/g, '_')}.txt`
}

const ACTION_CLASS =
  'border-hairline text-ink h-9 rounded-lg border bg-white px-3.5 text-[13px] font-medium shadow-xs hover:bg-white'

export function ResultPanel({
  state,
  onRetry,
}: {
  state: ResultState
  onRetry: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  function handleDownload(text: string, filename: string) {
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (state.status === 'idle') {
    return (
      <Shell title="Generated proxy list" meta="Nothing generated yet.">
        <Placeholder>
          Fill in your credentials on the left and press{' '}
          <span className="text-ink font-medium">Generate list</span>. The list
          will appear here, ready to copy or download.
        </Placeholder>
      </Shell>
    )
  }

  if (state.status === 'loading') {
    return (
      <Shell
        title="Generated proxy list"
        meta="Building the list…"
        badge={<Badge tone="busy">Working</Badge>}
      >
        <div className="bg-terminal text-terminal-dim rounded-xl p-5 font-mono text-[13px]">
          Generating…
        </div>
      </Shell>
    )
  }

  if (state.status === 'error') {
    return (
      <Shell
        title="Generated proxy list"
        meta="The list could not be generated."
        badge={<Badge tone="failed">Failed</Badge>}
      >
        <div className="border-hairline rounded-xl border bg-white p-5">
          <p role="alert" className="text-sm text-red-600">
            {state.message}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onRetry}
            className={cn(ACTION_CLASS, 'mt-4')}
          >
            Try again
          </Button>
        </div>
      </Shell>
    )
  }

  const text = state.proxies.join('\n')
  const filename = buildFilename(state.request)
  const lines = state.proxies.length

  return (
    <Shell
      title="Generated proxy list"
      meta={`${lines.toLocaleString()} ${lines === 1 ? 'line' : 'lines'} ready`}
      badge={<Badge tone="success">Success</Badge>}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleCopy(text)}
            className={ACTION_CLASS}
          >
            {copied ? (
              <CheckIcon className="size-4" />
            ) : (
              <CopyIcon className="size-4" />
            )}
            {copied ? 'Copied' : 'Copy all'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDownload(text, filename)}
            className={ACTION_CLASS}
          >
            <DownloadIcon className="size-4" />
            Download .txt
          </Button>
        </>
      }
    >
      <Textarea
        readOnly
        aria-label="Generated proxy list"
        value={text}
        spellCheck={false}
        onFocus={(event) => event.currentTarget.select()}
        className="bg-terminal text-terminal-ink focus-visible:ring-brand/40 h-[28rem] w-full resize-none rounded-xl border-0 p-5 font-mono text-[13px] leading-6 shadow-sm focus-visible:ring-[3px]"
      />
    </Shell>
  )
}

function Shell({
  title,
  meta,
  badge,
  actions,
  children,
}: {
  title: string
  meta: string
  badge?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mx-auto w-full max-w-4xl">
      <p className="text-ink-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
        Output
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-ink text-2xl font-semibold tracking-tight">
          {title}
        </h2>
        {badge}
        {actions ? (
          <div className="flex gap-2 sm:ml-auto">{actions}</div>
        ) : null}
      </div>

      <p className="text-ink-muted mt-2 text-[13px]">{meta}</p>

      <div className="mt-5">{children}</div>
    </section>
  )
}

function Badge({
  tone,
  children,
}: {
  tone: 'success' | 'failed' | 'busy'
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-[12px] font-medium',
        tone === 'success' && 'bg-green-100 text-green-800',
        tone === 'failed' && 'bg-red-100 text-red-700',
        tone === 'busy' && 'bg-ink/5 text-ink-muted',
      )}
    >
      {children}
    </span>
  )
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="border-hairline text-ink-muted rounded-xl border border-dashed bg-white/60 p-8 text-sm">
      {children}
    </div>
  )
}
