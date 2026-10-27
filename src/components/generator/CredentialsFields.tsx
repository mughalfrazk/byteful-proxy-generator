'use client'

import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { Input } from '@/components/ui/input'
import type { ListRequestInput } from '@/lib/models/residential'
import { cn } from '@/lib/utils'

import { CONTROL_CLASS, Field, FieldNote } from './Field'

/** Characters that break `scheme://user:password@host:port` when unescaped. */
const URL_BREAKING = /[@:/]/

export function CredentialsFields({
  form,
}: {
  form: UseFormReturn<ListRequestInput, unknown, unknown>
}) {
  const [revealed, setRevealed] = useState(false)
  const { errors } = form.formState
  const password = form.watch('proxy_user_password') ?? ''

  return (
    <>
      <Field
        id="proxy_user_id"
        label="Proxy user ID"
        error={errors.proxy_user_id?.message}
      >
        <Input
          id="proxy_user_id"
          autoComplete="username"
          placeholder="1_oGDQZ"
          aria-invalid={Boolean(errors.proxy_user_id)}
          className={cn(CONTROL_CLASS, 'aria-invalid:border-red-500')}
          {...form.register('proxy_user_id')}
        />
      </Field>

      <Field
        id="proxy_user_password"
        label="Password"
        error={errors.proxy_user_password?.message}
      >
        <div className="relative">
          <Input
            id="proxy_user_password"
            type={revealed ? 'text' : 'password'}
            autoComplete="current-password"
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

      {/*
        The spec says accept any non-empty password, so this warns instead of
        blocking: the user still gets their list, but they find out here why it
        will not parse rather than in their proxy client.
      */}
      {URL_BREAKING.test(password) ? (
        <FieldNote tone="warning">
          This password contains <code>@</code>, <code>:</code> or{' '}
          <code>/</code>, which most clients cannot read inside a proxy URL. The
          list is still generated as asked.
        </FieldNote>
      ) : null}
    </>
  )
}
