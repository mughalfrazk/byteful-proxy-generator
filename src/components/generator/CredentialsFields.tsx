'use client'

import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { Input } from '@/components/ui/input'
import type { ListRequestInput } from '@/lib/models/residential'
import { cn } from '@/lib/utils'

import { CONTROL_CLASS, Field } from './Field'

export function CredentialsFields({
  form,
}: {
  form: UseFormReturn<ListRequestInput, unknown, unknown>
}) {
  const [revealed, setRevealed] = useState(false)
  const { errors } = form.formState

  return (
    <>
      <Field
        id="proxy_user_id"
        label="Proxy user ID"
        required
        description="Letters and numbers only."
        error={errors.proxy_user_id?.message}
      >
        <Input
          id="proxy_user_id"
          autoComplete="username"
          placeholder="abc123"
          aria-required
          aria-invalid={Boolean(errors.proxy_user_id)}
          className={cn(CONTROL_CLASS, 'aria-invalid:border-red-500')}
          {...form.register('proxy_user_id')}
        />
      </Field>

      <Field
        id="proxy_user_password"
        label="Password"
        required
        description="Letters and numbers only."
        error={errors.proxy_user_password?.message}
      >
        <div className="relative">
          <Input
            id="proxy_user_password"
            type={revealed ? 'text' : 'password'}
            autoComplete="current-password"
            aria-required
            aria-invalid={Boolean(errors.proxy_user_password)}
            className={cn(CONTROL_CLASS, 'aria-invalid:border-red-500 pr-16')}
            {...form.register('proxy_user_password')}
          />
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            className="text-brand absolute top-1/2 right-3 -translate-y-1/2 rounded text-[13px] font-medium focus-visible:ring-[3px] focus-visible:ring-brand/30 focus-visible:outline-none"
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>
    </>
  )
}
