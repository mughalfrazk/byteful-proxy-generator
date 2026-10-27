'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Image from 'next/image'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { postJson } from '@/lib/fetcher'
import {
  DEFAULT_LIST_COUNT,
  ListRequestSchema,
  type ListRequest,
  type ListRequestInput,
  type ListResponse,
} from '@/lib/models/residential'

import { CredentialsFields } from './CredentialsFields'
import { OptionsFields } from './OptionsFields'
import { ResultPanel, type ResultState } from './ResultPanel'
import { StepSection } from './StepSection'
import { TargetingFields } from './TargetingFields'

/**
 * Owns the one form instance. The resolver uses `ListRequestSchema` — the same
 * schema the API route validates with — so the client cannot accept a request
 * the server would reject, or reject one it would accept.
 */
export function Generator() {
  const [result, setResult] = useState<ResultState>({ status: 'idle' })

  const form = useForm<ListRequestInput, unknown, ListRequest>({
    resolver: zodResolver(ListRequestSchema),
    mode: 'onBlur',
    defaultValues: {
      proxy_user_id: '',
      proxy_user_password: '',
      list_count: DEFAULT_LIST_COUNT,
      list_format: 'http',
      list_session_type: 'sticky',
      country_id: undefined,
      city_alias: undefined,
      asn_id: undefined,
    },
  })

  const { isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (request) => {
    setResult({ status: 'loading' })

    try {
      const response = await postJson<ListResponse>(
        '/api/residential/list',
        request,
      )
      setResult({ status: 'success', proxies: response.data, request })
    } catch (err) {
      setResult({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Something went wrong. Try again.',
      })
    }
  })

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/*
        The rail scrolls on its own from `lg` up, so the result stays in view
        while the form is filled in. Below `lg` the two stack and the page
        scrolls normally.
      */}
      <aside className="bg-panel border-hairline w-full shrink-0 border-b px-7 py-9 lg:sticky lg:top-0 lg:h-screen lg:w-[25rem] lg:overflow-y-auto lg:border-r lg:border-b-0">
        <header>
          {/*
            The logo carries the "Byteful" wordmark, so the heading below names
            the tool rather than repeating the brand.
          */}
          <Image
            src="/byteful-logo.webp"
            alt="Byteful"
            width={356}
            height={96}
            priority
            className="h-4 w-auto"
          />
          <h1 className="text-ink mt-2 text-xl font-semibold tracking-tight">
            Proxy List Generator
          </h1>
        </header>

        <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-7">
          <StepSection step={1} title="Credentials">
            <CredentialsFields form={form} />
          </StepSection>

          <StepSection step={2} title="Options">
            <OptionsFields form={form} />
          </StepSection>

          <StepSection
            step={3}
            title="Targeting"
            description="All fields optional"
            isLast
          >
            <TargetingFields form={form} />
          </StepSection>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-brand hover:bg-brand-hover h-11 w-full rounded-lg text-sm font-semibold text-white shadow-xs"
          >
            {isSubmitting ? 'Generating…' : 'Generate list'}
          </Button>
        </form>
      </aside>

      <main className="bg-canvas flex-1 px-6 py-9 sm:px-10 lg:px-12">
        <ResultPanel state={result} onRetry={() => void onSubmit()} />
      </main>
    </div>
  )
}
