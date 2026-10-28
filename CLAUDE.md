# CLAUDE.md

Byteful residential proxy generator: one Next.js 16 page plus API routes.
The README covers setup, assumptions and the error table.

## Commands

```bash
yarn dev            # http://localhost:3000
yarn test           # vitest, no network
yarn lint
yarn tsc --noEmit
yarn build
```

Yarn 4. Next 16 changed APIs; check `node_modules/next/dist/docs/` rather
than memory.

## Layout

- `src/app/api/` — thin routes: parse input, call one function, return JSON.
  Every handler is wrapped in `withErrorHandling`.
- `src/lib/byteful/` — the only code that calls Byteful or reads the API keys.
  `server-only`; cached with `cached()` in `cache.ts`.
- `src/lib/models/` — zod contracts. `ListRequestSchema` validates both the
  form and the list route. Byteful responses are parsed here and narrowed to
  the app's own types (`Country`, `City`, `Asn`).
- `src/lib/residential/` — pure logic: `targeting.ts` (segment table),
  `buildProxyList.ts`, `sessionId.ts`. No React, no network.
- `src/components/generator/`, `src/hooks/` — the page. Lookups go through
  SWR in `useLookup.ts`.

## Rules

- The API keys never leave the server: no `NEXT_PUBLIC_`, read only in
  `client.ts`. Never log request bodies; they hold the proxy password.
- Validation lives in the zod schemas, not in components or routes. Reuse
  `CountryIdSchema` and `PositiveIdSchema` from `models/common.ts`.
- Errors are thrown as `AppError` with a code from `ERROR_STATUS` and become
  `{ error, message }`. A new code needs a row in the README's error table.
- New username targeting goes in `TARGETING_SEGMENTS` first; the builder and
  the `requires` rule read it.
- Lookups read `residential_availability/search`, not the search endpoints
  the spec lists (reasons in the README). `city/search` is only used for
  aliases, filtered with `like_subdivision_id`.
- User-facing messages say what happened and what to do next.

## Style

- TypeScript, single quotes, no semicolons, 2-space indent.
- Comments are short and say why, not what. No comment restating the code.
- Commits: conventional style, e.g. `feat(lookup): …`, `fix(ui): …`.
