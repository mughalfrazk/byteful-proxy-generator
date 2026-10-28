# Residential Proxy Generator

A Next.js app that builds Byteful residential proxy lists, with optional
country, city and ASN targeting.

## Running the app

```bash
yarn install
cp .env.example .env.local   # then fill in both keys
yarn dev                     # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `BYTEFUL_PUBLIC_KEY` | `X-API-Public-Key` for the lookup calls |
| `BYTEFUL_PRIVATE_KEY` | `X-API-Private-Key` for the lookup calls |

Both are server-only: neither is `NEXT_PUBLIC_`, and both are read in one file,
`src/lib/byteful/client.ts`. Get them from
[dashboard.byteful.com/developer/api-key](https://dashboard.byteful.com/developer/api-key).
Without them the generator still works; only the targeting dropdowns need them.

## Assumptions

- **Credentials are letters and digits only.** Byteful's gateway only accepts
  alphanumeric credentials, and both go into the proxy URL unescaped, where
  `@`, `:` or `/` would break it.
- **`country_id` is case-insensitive**: `US` and `us` are the same request.
- **Unknown fields are rejected**, so `country` instead of `country_id` is an
  error rather than an untargeted list.
- **`city_alias` and `asn_id` are checked for shape, not existence**, since
  that would need a lookup on every generate. The page can only submit values
  picked from a lookup.
- **Rotating lists repeat one identical line** `list_count` times, as the spec
  says.
- **The success body adds `count`** next to the spec's `data` and `message`.
- **The lookups read `residential_availability/search`, not the three search
  endpoints the spec lists.** It is what Byteful's dashboard uses, and the
  search endpoints offer options that don't work:
  - `asn/search` files an ASN under the country it is registered in. Starlink
    (AS14593) is registered in the US, so it never appeared under Liberia,
    where it has live nodes.
  - Their node counts are not what is live. In October 2026, Singapore showed
    thousands of nodes in `country/search` and none in availability.

  Availability has no `city_alias`, so `city/search` is still used for
  aliases, filtered with `like_subdivision_id=gb%25`. The spec's literal
  `subdivision_id=gb%25` returns no cities; the `like_` operator is needed.
- **The ASN field works without a country.** Picking a country or city
  narrows the list. An ASN that is already picked is kept while the new
  country or city offers it.
- **Lookups are fetched whole and searched in the browser**, so typing never
  sends a request and needs no debounce. Each list is cached on the server and
  in the browser for five minutes.

## Errors

Every error has the same body:

```json
{ "error": "invalid_parameter", "message": "list_count: must be at most 1000" }
```

| HTTP | `error` | Returned by | When |
|---|---|---|---|
| 400 | `invalid_json` | list | the body isn't valid JSON |
| 400 | `invalid_parameter` | list, lookups | a missing, mistyped, out-of-range or unknown field; `city_alias` without `country_id` |
| 413 | `payload_too_large` | list | the body is over 16 KB |
| 500 | `internal_error` | list, lookups | anything unexpected |
| 502 | `upstream_error` | lookups | Byteful returned an unexpected 4xx/5xx |
| 502 | `upstream_invalid_response` | lookups | Byteful's response failed validation |
| 503 | `lookup_unavailable` | lookups | Byteful rate-limited (after one retry), timed out or was unreachable |
| 500 | `server_misconfigured` | lookups | API keys missing, or Byteful rejected them |

`POST /api/residential/list` makes no network call, so it can only return
the first four.

## Future work

- **A new targeting option (zip code, US state).** The username and the
  cross-field rules come from one table, `src/lib/residential/targeting.ts`:
  add an entry and a schema field, and the builder and validation pick it up.
  The build fails if the field is missing from the schema. The picker is the
  bigger part: a query in `client.ts`, a lookup route, a hook, and the field
  in `TargetingFields`.
- **Saved presets.** A preset is the form object minus the password, re-parsed
  with `ListRequestSchema` when loaded, so an outdated preset fails loudly.
- **Node count warning.** The pickers already have each option's node count;
  a sticky list of 1,000 sessions on a city with 12 nodes deserves a warning.
- **A shared cache and rate limiter.** The lookup cache is per process (see
  the TODO in `src/lib/byteful/cache.ts`). With several instances, Redis
  would share the data and Byteful's 20 requests/second budget.
