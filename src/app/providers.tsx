'use client'

import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'

import { fetcher } from '@/lib/fetcher'

/** Refocus revalidation is off: lookup data changes slowly and calls are rate-limited. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false }}>
      {children}
    </SWRConfig>
  )
}
