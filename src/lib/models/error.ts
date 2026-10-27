import { z } from 'zod'

/** Every error from every route has this body, and only this body. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export type ApiErrorBody = z.infer<typeof ApiErrorSchema>
