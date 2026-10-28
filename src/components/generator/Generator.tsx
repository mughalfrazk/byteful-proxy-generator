'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Image from 'next/image'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

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

/** Owns the form. It validates with the same schema as the API route. */
export function Generator() {
  const [result, setResult] = useState<ResultState>({ status: 'idle' })

  const form = useForm<ListRequestInput, unknown, ListRequest>({
    resolver: zodResolver(ListRequestSchema),
    // Validate on first blur, then on every change, so errors clear as soon
    // as the value is fixed.
    mode: 'onTouched',
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

  // Watched directly: under `onTouched`, `formState.isValid` ignores fields
  // that have not been blurred yet.
  const [proxyUserId, proxyUserPassword] = useWatch({
    control: form.control,
    name: ['proxy_user_id', 'proxy_user_password'],
  })
  const hasCredentials = Boolean(proxyUserId) && Boolean(proxyUserPassword)
  const credentialsValid =
    ListRequestSchema.shape.proxy_user_id.safeParse(proxyUserId).success &&
    ListRequestSchema.shape.proxy_user_password.safeParse(proxyUserPassword)
      .success

  // The values the shown list came from, so editing the form afterwards marks
  // the list as outdated.
  const [generatedFrom, setGeneratedFrom] = useState<string | null>(null)
  const values = useWatch({ control: form.control })
  const isStale =
    result.status === 'success' && generatedFrom !== JSON.stringify(values)

  const onSubmit = form.handleSubmit(async (request) => {
    setResult({ status: 'loading' })
    setGeneratedFrom(JSON.stringify(form.getValues()))

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
      {/* From `lg` up the form scrolls on its own, keeping the result in view. */}
      <aside className="bg-panel border-hairline w-full shrink-0 border-b px-7 py-9 lg:sticky lg:top-0 lg:h-screen lg:w-[25rem] lg:overflow-y-auto lg:border-r lg:border-b-0">
        <header>
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

          <div className="grid gap-2">
            <Button
              type="submit"
              disabled={isSubmitting || !credentialsValid}
              className="bg-brand hover:bg-brand-hover h-11 w-full rounded-lg text-sm font-semibold text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Generating…' : 'Generate list'}
            </Button>

            {/* Says why the button is disabled. */}
            {!credentialsValid ? (
              <p
                aria-live="polite"
                className="text-ink-muted text-center text-[12px]"
              >
                {hasCredentials
                  ? 'Your proxy user ID and password can only contain letters and numbers.'
                  : 'Enter your proxy user ID and password to generate a list.'}
              </p>
            ) : null}
          </div>
        </form>
      </aside>

      {/* `min-w-0` lets the flex item shrink below its content's width. */}
      <main className="bg-canvas min-w-0 flex-1 px-6 py-9 sm:px-10 lg:px-12">
        <ResultPanel
          state={result}
          isStale={isStale}
          onRetry={() => void onSubmit()}
        />
      </main>
    </div>
  )
}
