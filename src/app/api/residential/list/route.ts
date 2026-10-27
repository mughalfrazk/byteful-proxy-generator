import { AppError, invalidParameter, withErrorHandling } from '@/lib/errors'
import {
  LIST_SUCCESS_MESSAGE,
  ListRequestSchema,
  type ListResponse,
} from '@/lib/models/residential'
import { buildProxyList } from '@/lib/residential/buildProxyList'

/**
 * `POST /api/residential/list`
 *
 * Builds the proxy list locally. It deliberately makes no network call: the
 * username format and the session IDs are all that is needed, so there is
 * nothing to ask Byteful.
 */
export const POST = withErrorHandling(async (request: Request) => {
  let body: unknown
  try {
    body = await request.json()
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

  // Never cached: the body carries a password and the session IDs must be new
  // on every request.
  return Response.json(response, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
})
