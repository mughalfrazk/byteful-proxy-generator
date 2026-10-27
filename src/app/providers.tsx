'use client'

import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'

import { fetcher } from '@/lib/fetcher'

/**
 * One SWR config for the whole app. Refocus revalidation is off: lookup data
 * changes slowly, and re-fetching it when the user tabs back would only cost
 * requests against the account's shared rate limit.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false }}>
      {children}
    </SWRConfig>
  )
}
