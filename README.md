# Residential Proxy Generator

A Next.js app that builds residential proxy lists with optional country, city and ASN targeting.

- `POST /api/residential/list` builds the list **locally**. It makes no network call.
- `GET /api/lookup/{country,city,asn}` proxy Byteful's search endpoints, so the API key never reaches the browser.
- The result can be copied or downloaded as `.txt`.

Byteful is used **only for lookups**. Its location data is the source of truth for valid `country_id`, `city_alias` and `asn_id` values.

## Setup

```bash
yarn install
cp .env.example .env.local   # then fill in both keys
yarn dev                     # http://localhost:3000
```

`.env.local`:

```
BYTEFUL_PUBLIC_KEY=...
BYTEFUL_PRIVATE_KEY=...
```

Neither is `NEXT_PUBLIC_`, and neither is read outside `src/lib/byteful/client.ts`.

```bash
yarn test    # vitest
yarn lint
yarn build
```

The generator works without keys — it makes no network call. Only the three lookup dropdowns need them; without keys they show `server_misconfigured` inline, with a retry.

> **Dev-server caveat.** Turbopack in Next 16.4 caches the compiled stylesheet
> across restarts, so edits to the CSS custom properties in `globals.css` (the
> palette and the font variables) can keep serving the old values. If a token
> change does not show up, `rm -rf .next` and restart.

## Layers

Four layers, one-way dependencies, no layer that only wraps another:

```
UI (app/page.tsx, components/, hooks/)
  -> API routes (app/api/**/route.ts)       thin: parse, call lib, map result/error to HTTP
    -> business logic (lib/residential)     pure, framework-agnostic, no HTTP
    -> data layer (lib/byteful/client.ts)   'server-only'; the only caller of api.byteful.com
      -> models (lib/models)                zod schemas; types via z.infer
```

`page.tsx` stays a Server Component rendering `<Generator />` (`'use client'`). The UI calls only this app's `/api/*` routes, because the spec asks for lookup routes that the page uses.

## Output format

```
<format>://<username>:<password>@residential.byteful.com:8000
```

The username is `<proxy_user_id>`, plus one segment per active targeting field, plus `_s_<session_id>` when the list is sticky:

```
1_oGDQZ_c_gb_city_london_asn_5089_s_JMU3EF0JKZUNA4OS
```

**Sticky** lists get a unique 16-character `[A-Z0-9]` session ID per line, built with `crypto.randomInt`. A `Set` guarantees uniqueness: with 36^16 possible IDs a collision inside a 1000-item list is unreachable in practice, so the loop makes the spec's uniqueness rule structural rather than probabilistic.

**Rotating** lists have no session ID, so all `list_count` lines are identical. That is what the spec asks for, so it ships as specified — with a hint under the field, so nobody reads the repetition as a bug.

## Extending targeting

`src/lib/residential/targeting.ts` is a declarative, ordered table and the single place to extend targeting:

```ts
export const TARGETING_SEGMENTS = [
  { field: 'country_id', prefix: 'c' },
  { field: 'city_alias', prefix: 'city', requires: 'country_id' },
  { field: 'asn_id',     prefix: 'asn' },
] as const
```

`buildUsername()` walks it, and `ListRequestSchema` reads the `requires` rules from it, so the cross-field validation cannot drift from the username format. Adding a zip code (`zip_code_id`) or a US state (`subdivision_id`), both of which Byteful's real endpoint supports, means **one table entry, one schema field and one form field**.

## One shared schema

`ListRequestSchema` validates the form (through the react-hook-form resolver) and the `POST` body. Client and server rules cannot drift. Zod ships to the client; that is the accepted trade-off.

| Field | Rule |
|---|---|
| `proxy_user_id` | required, trimmed, non-empty; underscores allowed |
| `proxy_user_password` | required, non-empty |
| `list_count` | integer 1–1000, default 100 |
| `list_format` | `http \| https \| socks5 \| socks5h`, default `http` |
| `list_session_type` | `sticky \| rotating`, default `sticky` |
| `country_id` | optional; trimmed, lowercased, must match `^[a-z]{2}$` |
| `city_alias` | optional, non-empty; **requires `country_id`** |
| `asn_id` | optional positive integer |
| unknown keys | rejected (`strictObject`) |

One schema plus HTML inputs needs care: `<input type="number">` hands RHF a *string*, or `NaN` when empty, so the count field registers with `valueAsNumber: true`. If more numeric fields ever made that awkward, the fallback would be a form schema that coerces in front of an API schema that does not — but not for one field.

## The list response

```json
{
  "data": [
    "http://alice_c_gb_city_norwich_s_DDINPY7TQ0781XEO:secretpass@residential.byteful.com:8000"
  ],
  "message": "Residential list successfully generated.",
  "count": 1
}
```

`data` and `message` are the spec's contract. `count` is an addition: it makes a
truncated or empty response obvious without counting lines, which matters for a
body that can carry 1000 of them. Byteful's own API carries a `message` on every
response (`"ASN search successful."`), so this matches the house convention too.

The response is sent with `Cache-Control: no-store` — the body carries the proxy
password, and the session IDs must be new on every request.

## Errors

Every error from every route has the same body: `{ "error": string, "message": string }`. Every handler is wrapped so that nothing escapes as a default Next error page or a stack trace.

| HTTP | `error` | When |
|---|---|---|
| 400 | `invalid_json` | the body isn't valid JSON |
| 400 | `invalid_parameter` | a missing, mistyped, out-of-range or unknown field; `city_alias` without `country_id` |
| 502 | `upstream_error` | Byteful returned an unexpected 4xx/5xx |
| 502 | `upstream_invalid_response` | the Byteful response failed schema validation |
| 503 | `lookup_unavailable` | Byteful rate-limited (after one retry), timed out, or was unreachable |
| 500 | `server_misconfigured` | API keys missing, or Byteful returned 401/403 |
| 500 | `internal_error` | anything unexpected |

**One code for every bad parameter**, with the detail in `message`. Every validation failure comes out of the same zod issue list, and the client renders the message rather than branching on the code, so splitting 400s into `missing_parameter` / `unknown_parameter` / `invalid_parameter` would only buy an issue-code mapping that nothing reads. The upstream failures stay separate because they carry different HTTP statuses and different advice.

A **Byteful 401/403 is treated as server misconfiguration**, not a user error: a rejected key is our problem.

Byteful's `api_request_id` is logged server-side and never returned to the client. **Request bodies are never logged** — they contain the proxy password.

## Caching

| Layer | Where | TTL |
|---|---|---|
| in-process TTL cache | server, in `lib/byteful/cache.ts` | countries 1h; cities/ASNs 10 min |
| `Cache-Control` | browser | 5 min |
| SWR | browser memory, keyed by URL | session (dedupes, keeps previous data) |

The server layer also **shares in-flight requests**, so N users typing the same query produce one upstream call, and it **caches only successes**, so a rate-limited lookup is not pinned in place for ten minutes.

It is a plain in-process map rather than Next's `use cache`. With `cacheComponents` enabled, values crossing the `use cache` boundary are serialised — and so is anything thrown, which turns a typed `AppError` back into a plain `Error` with a redacted production message and collapses `upstream_error`, `lookup_unavailable` and `server_misconfigured` into one `internal_error`. The error table above is part of the contract, so the cache lives on our side of the throw. The cost is that it is per-instance; a shared cache (Redis) is the production answer.

## The city/country/ASN combobox

`LocationCombobox` is a select with a search box, not a free-text input. The distinction is about correctness, not looks:

| | Search text | Selected value |
|---|---|---|
| What it is | whatever the user types, e.g. "nor" | the `id` / `city_alias` of an option they chose |
| Where it lives | local state in `LocationCombobox` | the react-hook-form field |
| Sent to lookup routes | yes, as `query` | no |
| Sent to `/api/residential/list` | **never** | yes |

1. **Only `onSelect` writes to the form field.** Typing never calls `setValue`.
2. **Unselected text is discarded.** Closing the popover clears the search and the trigger falls back to the selected option's label.
3. **A country change clears the city and the ASN**, so a stale selection cannot reach the request.

Together these mean **invalid combinations are impossible through the page**. Country loads once and filters client-side; city and ASN search server-side, debounced at 300ms. City is disabled until a country is chosen. Each option shows its node count.

## Assumptions

- **No existence check on `city_alias` or `asn_id`.** The list endpoint validates shape, not whether a value exists in Byteful's data or belongs to the given country — that would need a Byteful call on every generate. Hand-crafted requests (curl, Postman) can therefore send well-formed but non-existent combinations; that cannot be prevented for any public endpoint, Byteful's own included, and the user gets exactly what they asked for. Through the page it cannot happen (see above). With more time I would validate against the already-cached lookup data.
- **`country_id` is lowercased**, so `US` and `us` are the same request.
- **Unknown keys are rejected.** A typo such as `country` instead of `country_id` returns an error rather than silently producing an untargeted list.
- **Password characters.** The spec says accept any non-empty string, so any non-empty string is accepted. A password containing `@`, `:` or `/` produces a proxy URL most clients cannot parse, so the form warns inline instead of blocking — the user still gets their list, but finds out here rather than in their proxy client. With more time I would percent-encode it or reject those characters outright.
- **Spec defaults over Byteful's real ones**: `http` rather than `standard`, and no `_m_general` segment.
- **Options with no nodes are hidden** from all three lookups — `min_country_node_count`, `min_city_node_count` and `min_asn_node_count` are each set to 1, verified to be honoured — so users cannot target a location with no IPs. Node counts are shown next to every option.
- **An empty city/ASN query shows the top results by node count** rather than an empty box.
- The submit button stays enabled with an invalid form; pressing it surfaces inline field errors. Disabling it until valid hides *why* nothing happens on a form whose required fields start empty.

## The Byteful lookup API

Verified against the live API. All three lookups sit under
`https://api.byteful.com/1.0/public/user/`:

| Lookup | Path | Key parameters |
|---|---|---|
| Countries | `country/search` | `min_country_node_count=1`, `per_page=100`, `page` |
| Cities | `city/search` | `like_subdivision_id=<cc>%`, `like_city_name=%q%`, `min_city_node_count=1` |
| ASNs | `asn/search` | `country_id`, `like_asn_name=%q%`, `min_asn_node_count=1` |

Three things about this API are worth knowing before changing the client:

- **There is no country filter on `city/search`.** Passing `country_id` is
  accepted and silently ignored — it returns the whole world, which looks like
  a working filter until you notice German cities in a UK search. The country
  lives in `subdivision_id` (an ISO 3166-2 code such as `gb-lnd`), so the
  filter is a prefix match: `like_subdivision_id=gb%`. The `%` is passed raw
  and `URLSearchParams` encodes it exactly once, to `gb%25`; pre-encoding it
  would send `gb%2525` and match nothing.
- **`sort_by` defaults to descending, and a `-` prefix means ascending.** That
  is the opposite of the usual convention, so `sort_by=city_node_count` is what
  returns the *busiest* cities and `sort_by=-city_node_count` would return the
  emptiest. There is a test pinning this down.
- **Pagination is top-level**, alongside `data`: `page`, `per_page`,
  `item_count` (rows returned) and `total_count` (rows matching). The country
  page count is derived from `total_count` rather than hardcoded, so the list
  will not silently truncate when Byteful adds a country.

As of this writing that yields 228 countries with nodes (of 250), 829 US
cities and 9,547 cities worldwide.

One data note worth knowing as a user: Byteful has no "New York" city. New York
City is modelled as its boroughs — `brooklyn`, `queens`, `the_bronx`,
`staten_island` — so searching "new york" in the US correctly returns only
"West New York", which is in New Jersey.

## Known gaps

- **The lookup routes are open**, so anyone can spend the account's shared 20
  requests/second. The in-process cache and in-flight sharing blunt this;
  per-IP rate limiting is the real fix.
- No auth is in scope. If accounts were added, the checks would live in each
  route and the session read would be memoized.

## Testing

`yarn test` — 69 tests, no network.

- **`buildProxyList`**: defaults; rotating gives N identical strings; sticky session IDs unique, 16 chars, `[A-Z0-9]`; every targeting combination in table order; every format.
- **Validation**: counts 0/1/1000/1001, `"10"`, `10.5`; bad enums; `US` → `us`; `usa` rejected; `city_alias` without `country_id`; unknown keys; empty ID or password.
- **The list route**: `invalid_json` for a malformed body, `invalid_parameter` for every validation failure, an identical `{ error, message }` shape across them, and `Cache-Control: no-store`.
- **The Byteful client**: the whole error table against a mocked `fetch`; the 429 retry; `api_request_id` kept out of client messages; page merging derived from `total_count`; the city filter using `like_subdivision_id` rather than the ignored `country_id`; `gb%` encoded exactly once (not `gb%2525`); the descending `sort_by`; cache hits, keying, in-flight sharing, and that failures are not cached.

## Theme

The palette is sampled directly from `public/byteful-logo.webp` rather than
picked by eye, so the UI and the mark cannot drift apart:

| Token | Value | Source |
|---|---|---|
| `--brand` | `#6a5cec` | mid-tone of the mark's violet gradient (`#685aec` → `#9182eb`) |
| `--ink` | `#0e1127` | the wordmark's navy |
| `--terminal` | `#0b0e20` | a shade off that navy, so the output panel reads as brand rather than generic black |

`--brand` on white measures 4.8:1, which clears WCAG AA for body text, so it is
safe for the "Show" link as well as for white-on-brand buttons and badges.

The logo appears in the form rail's header, and `src/app/icon.png` is its mark
cropped square, so the browser tab carries it too. Every colour is defined once
in `globals.css` — re-pointing `--brand` re-themes the whole screen.

## Design notes

- **Models.** Each Byteful entity has one schema — the upstream shape it is parsed against — plus a narrow function and a plain `type` for the app shape the routes return. The app shape is a type, not a second schema: nothing re-parses our own output. Fields Byteful adds later cannot leak through, because the narrow function names what it keeps.
- **Why SWR rather than TanStack Query.** The app has three read-only, URL-keyed lookups and one imperative POST. SWR covers that in a few lines with no provider boilerplate beyond the fetcher; TanStack Query's mutation and invalidation machinery would be unused weight.
- **No toast layer.** Field errors render on the field, submit and network errors render in the result panel. A toast dependency plus a provider plus a rule for which errors go where would buy nothing.
- **The Server Component prefetch alternative.** `page.tsx` could fetch countries straight from `lib/byteful` and pass them as props, saving a round trip. Deliberately skipped: the spec calls for lookup routes that the page uses.

## Future work

- **Saved presets**: store a validated `ListRequest` in `localStorage` and re-parse it on load.
- **Per-IP rate limiting** on the lookup routes.
- **Percent-encode the password**, or reject `@ : /` outright instead of only warning.
- **Validate `city_alias` / `asn_id` against the cached lookup data** on the list route.
- **Virtualised lists** if result sizes grow.
- **Error monitoring**: Sentry.
