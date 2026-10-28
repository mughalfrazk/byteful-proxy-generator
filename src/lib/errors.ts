import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'

import type { ApiErrorBody } from '@/lib/models/error'

/**
 * Every error code the API returns, with its HTTP status. All bad parameters
 * share `invalid_parameter`, with the detail in `message`.
 */
export const ERROR_STATUS = {
  invalid_json: 400,
  invalid_parameter: 400,
  payload_too_large: 413,
  upstream_error: 502,
  upstream_invalid_response: 502,
  lookup_unavailable: 503,
  server_misconfigured: 500,
  internal_error: 500,
} as const satisfies Record<string, number>

export type ErrorCode = keyof typeof ERROR_STATUS

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  invalid_json: 'The request body is not valid JSON.',
  invalid_parameter: 'One or more parameters are invalid.',
  payload_too_large: 'The request body is too large.',
  upstream_error: 'The location service returned an unexpected error.',
  upstream_invalid_response:
    'The location service returned data in an unexpected format.',
  lookup_unavailable:
    'Location search is busy right now. Try again in a moment.',
  server_misconfigured:
    'The server is not configured correctly. Contact the administrator.',
  internal_error: 'Something went wrong. Try again.',
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  /** Logged server-side only; never sent to the client. */
  readonly logContext?: Record<string, unknown>

  constructor(
    code: ErrorCode,
    message?: string,
    logContext?: Record<string, unknown>,
  ) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'AppError'
    this.code = code
    this.status = ERROR_STATUS[code]
    this.logContext = logContext
  }
}

/** Turns a zod error into one `invalid_parameter` message listing each issue. */
export function invalidParameter(error: z.ZodError): AppError {
  const message = error.issues
    .map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')

  return new AppError('invalid_parameter', message || undefined)
}

/**
 * Turns anything thrown in a route handler into the error body. Request
 * bodies are never logged: they contain the proxy password.
 */
export function toErrorResponse(err: unknown): Response {
  const appError = normalise(err)

  if (appError.status >= 500 || appError.code === 'lookup_unavailable') {
    console.error('[api]', appError.code, appError.message, {
      ...appError.logContext,
    })
  }

  const body: ApiErrorBody = {
    error: appError.code,
    message: appError.message,
  }

  return Response.json(body, { status: appError.status })
}

function normalise(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof z.ZodError) return invalidParameter(err)

  return new AppError('internal_error', undefined, {
    cause: err instanceof Error ? err.message : String(err),
  })
}

/** Wraps a route handler so every throw goes through `toErrorResponse`. */
export function withErrorHandling<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args)
    } catch (err) {
      // Let Next's own control-flow throws (redirect, bailouts) through.
      unstable_rethrow(err)
      return toErrorResponse(err)
    }
  }
}
