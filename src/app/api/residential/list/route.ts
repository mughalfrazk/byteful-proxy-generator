import { AppError, invalidParameter, withErrorHandling } from '@/lib/errors'
import {
  LIST_SUCCESS_MESSAGE,
  ListRequestSchema,
  type ListResponse,
} from '@/lib/models/residential'
import { buildProxyList } from '@/lib/residential/buildProxyList'

/**
 * Caps credential length: a multi-megabyte user ID times `list_count: 1000`
 * would build gigabytes of strings.
 */
const MAX_BODY_BYTES = 16 * 1024

/** Reads the body, stopping once it passes the cap. Chunked bodies have no Content-Length. */
async function readBody(request: Request): Promise<string> {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) {
    throw new AppError('payload_too_large')
  }
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new AppError('payload_too_large')
    }
    chunks.push(value)
  }

  return new Blob(chunks).text()
}

/** `POST /api/residential/list`. Builds the list locally, with no network call. */
export const POST = withErrorHandling(async (request: Request) => {
  const text = await readBody(request)

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new AppError('invalid_json')
  }

  const parsed = ListRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw invalidParameter(parsed.error)
  }

  const data = buildProxyList(parsed.data)
  const response: ListResponse = {
    data,
    message: LIST_SUCCESS_MESSAGE,
    count: data.length,
  }

  // The body carries a password, and session IDs must be fresh.
  return Response.json(response, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
})
