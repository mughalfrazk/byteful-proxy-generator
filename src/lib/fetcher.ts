import { ApiErrorSchema } from '@/lib/models/error'

/** An error carrying the `message` the API chose, ready to render inline. */
export class RequestError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'RequestError'
    this.code = code
    this.status = status
  }
}

/**
 * Turns any non-OK response into a `RequestError` whose message is the one the
 * API wrote. The UI renders that message, so it never has to branch on codes.
 */
async function toRequestError(response: Response): Promise<RequestError> {
  let code = 'internal_error'
  let message = 'Something went wrong. Try again.'

  try {
    const parsed = ApiErrorSchema.safeParse(await response.json())
    if (parsed.success) {
      code = parsed.data.error
      message = parsed.data.message
    }
  } catch {
    // A non-JSON failure (a proxy error page, say) keeps the default message.
  }

  return new RequestError(code, message, response.status)
}

/** The SWR fetcher: GET, parse, throw the API's message on failure. */
export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw await toRequestError(response)
  return (await response.json()) as T
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw await toRequestError(response)
  return (await response.json()) as T
}
