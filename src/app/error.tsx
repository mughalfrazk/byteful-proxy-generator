'use client'

import { Button } from '@/components/ui/button'

/** Replaces the page if rendering throws, instead of Next's blank error screen. */
export default function Error({ retry }: { retry: () => void }) {
  return (
    <main className="bg-canvas flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-ink text-xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <Button
        type="button"
        onClick={retry}
        className="bg-brand hover:bg-brand-hover h-10 rounded-lg px-5 text-sm font-semibold text-white"
      >
        Back to the generator
      </Button>
    </main>
  )
}
