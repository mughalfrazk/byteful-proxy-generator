# Residential Proxy Generator

A Next.js app that builds residential proxy lists with optional country, city
and ASN targeting.

- `POST /api/residential/list` builds the list locally — no network call.
- `GET /api/lookup/{country,city,asn}` proxy Byteful's search endpoints, so the
  API key never reaches the browser.
- The result can be copied or downloaded as `.txt`.

## Running the app

```bash
yarn install
cp .env.example .env.local   # then fill in both keys
yarn dev                     # http://localhost:3000
```

Two environment variables, both **server-only** — neither is `NEXT_PUBLIC_`,
and both are read in exactly one file (`src/lib/byteful/client.ts`):

| Variable | Required | Purpose |
|---|---|---|
| `BYTEFUL_PUBLIC_KEY` | yes | `X-API-Public-Key` on Byteful lookup calls |
| `BYTEFUL_PRIVATE_KEY` | yes | `X-API-Private-Key` on Byteful lookup calls |

Get both from [dashboard.byteful.com/developer/api-key](https://dashboard.byteful.com/developer/api-key).
The generator itself works without them; only the three targeting dropdowns
need them.

```bash
yarn test    # vitest, no network
yarn lint
yarn build
```

## Assumptions

- **No existence check on `city_alias` or `asn_id`.** The list endpoint
  validates shape, not whether a value exists in Byteful's data — that would
  need a lookup call on every generate. Through the page an invalid combination
  cannot be built: only selecting an option writes to the form, typed-but-
  unselected text is discarded, and changing country clears the city and ASN.
- **`country_id` is lowercased**, so `US` and `us` are the same request.
- **Unknown keys are rejected**, so `country` instead of `country_id` errors
  rather than silently producing an untargeted list.
- **Any non-empty password is accepted**, per the spec. One containing `@`, `:`
  or `/` produces a URL most clients cannot parse, so the form warns inline
  rather than blocking.
- **Rotating lists repeat one identical line** `list_count` times, since they
  carry no session ID. That is what the spec asks for; the UI notes it so it
  does not read as a bug.
- **Spec defaults over Byteful's real ones**: `http` rather than `standard`,
  and no `_m_general` segment.
- **Countries and ASNs with no nodes are hidden; cities are not.** Byteful
  reports `city_node_count: 0` for the only city in some countries that do have
  nodes (Singapore has 4,798 country nodes and one city, at 0), so a floor there
  emptied those dropdowns. Every option shows its node count instead.
- **`city/search` has no country filter.** Passing `country_id` is accepted and
  silently ignored — it returns the whole world. The country lives in
  `subdivision_id` (`gb-lnd`), so the filter is a prefix match:
  `like_subdivision_id=gb%`.

## Errors

Every error from every route has the same body, and only this body:

```json
{ "error": "invalid_parameter", "message": "list_count must be from 1 to 1000" }
```

| HTTP | `error` | When |
|---|---|---|
| 400 | `invalid_json` | the body isn't valid JSON |
| 400 | `invalid_parameter` | a missing, mistyped, out-of-range or unknown field; `city_alias` without `country_id` |
| 502 | `upstream_error` | Byteful returned an unexpected 4xx/5xx |
| 502 | `upstream_invalid_response` | the Byteful response failed schema validation |
| 503 | `lookup_unavailable` | Byteful rate-limited (after one retry), timed out, or was unreachable |
| 500 | `server_misconfigured` | API keys missing, or Byteful returned 401/403 |
| 500 | `internal_error` | anything unexpected |

One code covers every bad parameter, with the detail in `message`: all
validation failures come from the same zod issue list, and the client renders
the message rather than branching on codes. Upstream failures stay separate
because they carry different statuses and different advice.

A Byteful 401/403 is treated as *our* misconfiguration, not a user error.
Byteful's `api_request_id` is logged server-side and never returned. Request
bodies are never logged — they contain the proxy password.

On success the list endpoint returns the spec's shape, plus a `count` for
consumers reading the body by hand:

```json
{
  "data": ["http://alice_c_gb_city_norwich_s_DDINPY7TQ0781XEO:secretpass@residential.byteful.com:8000"],
  "message": "Residential list successfully generated.",
  "count": 1
}
```
