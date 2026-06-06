# Extending Studio

How to add a new ingestion tool to your Studio deployment.

## Anatomy of a tool

A tool is a folder under `src/lib/tools/` (clone-baseline) or `src/lib/operator/` (admin-only). At minimum it exports:

1. A **candidate producer** — function that fetches/extracts/generates candidates from a source.
2. A **publish handler** — function that takes an approved candidate and writes it to Commons via the kernel's `commons-client`.

Optional:

- A **per-tool configuration UI** — a Svelte route under `src/routes/tools/your-tool/` for source setup (e.g., adding a newsletter subscription).
- A **dedup hook** — type-specific dedup logic (e.g., venue dedup by name+address fuzzy; event dedup by venue+time).

## Example: a minimal newsletter tool

```
src/lib/tools/newsletter/
├── README.md           — what this tool does
├── produce.ts          — fetch + extract candidates from subscribed newsletters
├── publish.ts          — publish approved candidates via the kernel client
└── types.ts            — local types (NewsletterCandidate, etc.)
```

The candidate producer outputs `Candidate[]` (defined in `src/lib/kernel/candidate.ts`). The review surface picks them up automatically — no per-tool UI changes needed for the queue.

## Wiring the publish flow

Publishing goes through the kernel's `commons-client`. For events, that's the SDK's event-create call with the four-role frame:

- `organizer_org_id` (required) — the org running the event
- `place_id` or `location.{name, address, lat, lng}` — the venue
- `source_method` — `self_asserted` | `proxied` | `witnessed`
- `source_feed_url` — when method is `proxied`

See the Commons [four-roles doctrine](https://neighborhood-commons.org/docs/four-roles) for which method applies to your tool.

## Scrapers & custom adapters (the AI-authoring case)

Studio ships a **generic scraper** (`src/lib/tools/scrape/`): fetch a page → strip to text → run the shared LLM extractor → candidates. It works for many listings pages out of the box, and it's the worked example for writing your own.

When the generic pass isn't good enough for a specific site (it misses a structured table, a custom date format, a JS-rendered list), write a **site-specific produce()**:

1. Create `src/lib/tools/your-site/produce.ts` exporting `produce(config) → Promise<Candidate[]>`.
2. Fetch the page (use `assertSafeUrl` from `$lib/kernel/tool`).
3. Extract however the site demands — a targeted regex/selector pass, or hand the cleaned text to `extractEventsFromText` from `$lib/tools/extract/llm` and post-process.
4. Map to `EventCandidate` with `source_method: 'proxied'` and `source_feed_url` = the page URL.
5. Add a route under `src/routes/sources/your-site/` mirroring `scrape/` (server action → review → `publishBatch`).

This is the ~3–4-hour "wire your own contribution with an AI assistant" path: the kernel (review, edit, publish, organizer resolution, provenance) is done; you write the fetch + extraction for your one source. Point your assistant at `tools/scrape/produce.ts` and `tools/calendar/produce.ts` as templates.

## Adding an operator-only tool

If your tool requires an admin Commons key — e.g., it acts on organizations across the whole Commons, not just the ones your key is linked to — put it in `src/lib/operator/`. Gate any routes behind:

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

Pure logic is unit-tested with vitest — run `pnpm test:run`. Coverage includes the parsers (iCal, CSV, RSS/Atom), Calendar/Sheets URL normalization, tz→offset conversion, the OSM contact/Overpass mapping, capability readiness, and the candidate store. Add tests alongside your tool's producer — see the existing `*.test.ts` files (e.g. `tools/calendar/ical.test.ts`, `tools/venues/overpass.test.ts`).
