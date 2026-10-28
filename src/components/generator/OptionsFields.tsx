'use client'

import { Controller, useWatch, type UseFormReturn } from 'react-hook-form'

import { Input } from '@/components/ui/input'
import {
  LIST_FORMATS,
  MAX_LIST_COUNT,
  MIN_LIST_COUNT,
  type ListFormat,
  type ListRequestInput,
  type ListSessionType,
} from '@/lib/models/residential'
import { cn } from '@/lib/utils'

import { ChoiceGroup, type Choice } from './ChoiceGroup'
import { CONTROL_CLASS, Field, FieldNote } from './Field'

/** `list_format` is the protocol; each card previews the line it produces. */
const FORMAT_CHOICES: ReadonlyArray<Choice<ListFormat>> = LIST_FORMATS.map(
  (format) => ({
    value: format,
    label: format,
    hint: `${format}://username:password@ip:port`,
    mono: true,
  }),
)

const SESSION_CHOICES: ReadonlyArray<Choice<ListSessionType>> = [
  { value: 'rotating', label: 'Rotating', hint: 'New IP per request' },
  { value: 'sticky', label: 'Sticky', hint: 'Fixed IP for session' },
]

export function OptionsFields({
  form,
}: {
  form: UseFormReturn<ListRequestInput, unknown, unknown>
}) {
  const { errors } = form.formState
  const sessionType = useWatch({
    control: form.control,
    name: 'list_session_type',
  })

  return (
    <>
      <Field
        id="list_count"
        label="List count"
        labelHint={`(max ${MAX_LIST_COUNT})`}
        error={errors.list_count?.message}
      >
        <Input
          id="list_count"
          type="number"
          inputMode="numeric"
          min={MIN_LIST_COUNT}
          max={MAX_LIST_COUNT}
          step={1}
          aria-invalid={Boolean(errors.list_count)}
          className={cn(CONTROL_CLASS, 'aria-invalid:border-red-500')}
          // The shared schema expects a number, not the input's string.
          {...form.register('list_count', { valueAsNumber: true })}
        />
      </Field>

      <Controller
        control={form.control}
        name="list_format"
        render={({ field }) => (
          <Field id="list_format" label="Format" error={errors.list_format?.message}>
            <ChoiceGroup
              name="list_format"
              value={field.value}
              onChange={field.onChange}
              choices={FORMAT_CHOICES}
            />
          </Field>
        )}
      />

      <Controller
        control={form.control}
        name="list_session_type"
        render={({ field }) => (
          <Field
            id="list_session_type"
            label="Session type"
            error={errors.list_session_type?.message}
          >
            <ChoiceGroup
              name="list_session_type"
              value={field.value}
              onChange={field.onChange}
              choices={SESSION_CHOICES}
              columns={2}
            />

            {sessionType === 'rotating' ? (
              <FieldNote>
                Rotating lists have no session ID, so all lines are identical.
                The count is there so you can paste the list straight into a
                client that expects one line per connection.
              </FieldNote>
            ) : null}
          </Field>
        )}
      />
    </>
  )
}
