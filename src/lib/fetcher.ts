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

/** Turns a non-OK response into a `RequestError` with the API's message. */
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

/** Replaces the browser's "Failed to fetch" with an actionable message. */
async function send(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new RequestError(
      'network_error',
      'Could not reach the server. Check your connection and try again.',
      0,
    )
  }
}

/**
 * A 200 that isn't JSON comes from something in between, such as a Wi-Fi
 * login page; the parser's own message would mean nothing to the user.
 */
async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new RequestError(
      'internal_error',
      'Something went wrong. Try again.',
      response.status,
    )
  }
}

/** The SWR fetcher: GET, parse, throw the API's message on failure. */
export async function fetcher<T>(url: string): Promise<T> {
  const response = await send(url)
  if (!response.ok) throw await toRequestError(response)
  return readJson<T>(response)
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await send(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw await toRequestError(response)
  return readJson<T>(response)
}
