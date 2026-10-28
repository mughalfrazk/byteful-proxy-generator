const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

/** `3341265` → `3.34M nodes`, `1` → `1 node`. */
export function formatNodeCount(count: number): string {
  return `${compact.format(count)} ${count === 1 ? 'node' : 'nodes'}`
}
