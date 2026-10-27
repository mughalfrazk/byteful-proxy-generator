import { Generator } from '@/components/generator/Generator'

/**
 * A Server Component shell around the one client island.
 *
 * It deliberately does not prefetch countries from `lib/byteful` and pass them
 * as props, even though that would save a round trip: the spec asks for lookup
 * routes that the page uses, so the page uses them. See the README.
 */
export default function Home() {
  return <Generator />
}
