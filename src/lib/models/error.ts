import { z } from 'zod'

/** The body of every error from every route. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export type ApiErrorBody = z.infer<typeof ApiErrorSchema>
