'use client'

import { Controller, type UseFormReturn } from 'react-hook-form'

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

/**
 * `list_format` is the proxy **protocol**, not a line layout: the generated
 * line is always `<format>://<username>:<password>@host:port`.
 */
const FORMAT_CHOICES: ReadonlyArray<Choice<ListFormat>> = LIST_FORMATS.map(
  (format) => ({ value: format, label: format }),
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
  const sessionType = form.watch('list_session_type')

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
          // A number input hands react-hook-form a string, or NaN when empty,
          // so the shared `z.number()` schema would reject a value the user
          // sees as a number. `valueAsNumber` is what keeps one schema working
          // for both the form and the API.
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

            {/*
              A rotating list carries no session ID, so every line is the same
              string. That is what the spec asks for, so it ships as specified
              — with a note, so nobody reads the repetition as a bug.
            */}
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
