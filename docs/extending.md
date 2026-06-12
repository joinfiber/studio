# Extending Studio

How to add a new ingestion tool to your Studio deployment. (This is the human
walkthrough; [AGENTS.md](../AGENTS.md) is the same path written for an AI
coding assistant — the two agree, point your assistant at either.)

## Anatomy of a tool

A tool is a folder under `src/lib/tools/` (clone-baseline) or
`src/lib/operator/` (admin-only) plus a route under `src/routes/sources/`.
The canonical template is `src/lib/tools/calendar/` +
`src/routes/sources/calendar/`.

1. A **producer** — `src/lib/tools/your-source/produce.ts` exporting a
   function that fetches/extracts candidates from the source and returns
   `Promise<EventCandidate[]>` (`EventCandidate` is in
   `src/lib/kernel/candidate.ts`). Producers vary in signature — a config
   object, a URL — match what fits your source; there's no enforced interface.
2. A **route** — `src/routes/sources/your-source/+page.server.ts` with two
   actions: a `fetch` action that runs your producer and returns the
   candidates, and `publish: publishSourceAction` (the shared, validated
   publish path from `$lib/kernel/publish-action.js`). Copy calendar's
   `+page.svelte` for the UI.

That's the whole surface. Everything downstream — the review queue, inline
editing, organizer resolution, provenance enforcement, the actual Commons
write — is shared kernel; you write only the fetch + extraction.

## Wiring the publish flow

Publishing goes through the kernel (`publishBatch` →
`publishEventCandidate`), which maps your candidate onto the SDK's
`ServiceEventInput`:

- `organizerOrganizationId` (required) — resolved for you from the organizer
  name (search-or-create)
- `location.{name, address, lat, lng}` — the venue
- `source_method` — `self_asserted` | `proxied` | `witnessed`
- `source_feed_url` — required when method is `proxied`; the kernel refuses a
  proxied candidate without it

See the Commons [four-roles doctrine](https://neighborhood-commons.org/docs/four-roles)
for which method applies to your tool. Relayed sources (a calendar, a feed, a
scraped page) are `proxied` with `source_feed_url` set to the page — that's
Golden Rule #5, and it's enforced at the write boundary, not just documented.

## Scrapers & custom adapters (the AI-authoring case)

Studio ships a **generic scraper** (`src/lib/tools/scrape/`): fetch a page →
strip to text → run the shared LLM extractor → candidates. It works for many
listings pages out of the box, and it's the worked example for writing your
own.

When the generic pass isn't good enough for a specific site (it misses a
structured table, a custom date format, a JS-rendered list), write a
**site-specific producer**:

1. Create `src/lib/tools/your-site/produce.ts` exporting a producer that
   returns `Promise<EventCandidate[]>`.
2. Fetch the page with `safeFetch` from `$lib/kernel/safe-fetch.js` (SSRF
   guard: blocks private hosts, re-checks redirects and DNS) and read the body
   with `readTextCapped`.
3. Extract however the site demands — a targeted regex/selector pass, or hand
   the cleaned text to `extractEventsFromText` from `$lib/tools/extract/llm`
   and post-process.
4. Map to `EventCandidate` with `source_method: 'proxied'` and
   `source_feed_url` = the page URL, using `candidateId()` for stable ids.
5. Add `src/routes/sources/your-site/` mirroring `scrape/`'s route (fetch
   action + `publish: publishSourceAction`).

This is the "wire your own source with an AI assistant in an afternoon" path.
Point your assistant at `tools/scrape/produce.ts` and
`tools/calendar/produce.ts` as templates.

## Adding an operator-only tool

If your tool requires an admin Commons key — e.g., it acts on organizations
across the whole Commons, not just the ones your key is linked to — put it in
`src/lib/operator/`. Gate any routes behind:

```typescript
import { error } from '@sveltejs/kit';
import { isAdminInstance } from '$lib/kernel/auth';

export const load = () => {
	if (!isAdminInstance()) throw error(404);
	// ...
};
```

A 404 (not 403) avoids leaking admin-feature existence to non-admin instances.

## Tests

Pure logic is unit-tested with vitest — run `pnpm test:run`. Coverage includes
the parsers (iCal, CSV, RSS/Atom), URL normalization, tz→offset conversion,
the candidate validator, the access gate (session, TOTP, hooks, login
throttle), the SSRF guard, the publish boundary, the OSM contact/Overpass
mapping, capability readiness, and the candidate store. Add tests alongside
your tool's producer — see the existing `*.test.ts` files (e.g.
`src/lib/tools/calendar/ical.test.ts`, `src/lib/venues/overpass.test.ts`).
