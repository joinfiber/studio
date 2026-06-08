# AGENTS.md

Orientation for AI coding assistants (Claude Code, Cursor, etc.) working in this
repo. Studio is an open-source operator GUI for the **Neighborhood Commons** — it
fetches events/venues from various sources, lets an operator review them, and
publishes them to the Commons over its public API. SvelteKit + TypeScript +
Svelte 5 (runes).

If you're here to **add an ingestion source**, jump to [Add a source](#add-a-source) —
that's the path this codebase is designed for.

## Commands

```bash
pnpm dev          # dev server → http://localhost:5273
pnpm typecheck    # svelte-check — MUST be 0 errors before you're done
pnpm test:run     # vitest
pnpm build        # adapter-node production build
pnpm format       # prettier (run before finishing)
```

Always finish with `pnpm typecheck && pnpm test:run`. CI runs `format:check`,
`typecheck`, `test:run`, and `build` on every push.

## Golden rules (don't violate these)

1. **Secrets are server-only.** Read them exclusively via `import { env } from '$env/dynamic/private'`. Never put a key in client code, in a `load` return, in a JSON response, or in a `PUBLIC_` var. The only key that legitimately reaches the browser is the MapTiler basemap key (it has to, for map tiles).
2. **The Commons is reached only through the SDK.** Use the configured client on `event.locals.commons` (a typed wrapper around the published `neighborhood-commons` SDK). Never hand-roll a fetch to a Commons URL or reach into Commons internals. If the SDK doesn't expose something you need, that's an upstream gap — note it, don't work around it with a raw call.
3. **Capability checks are presence-only.** `capabilities.ts` checks `!!env.X`, never the value. Keep it that way — the Settings UI shows _whether_ a key is set, never the key.
4. **Categories: underscore on write, kebab on read.** Store/write `live_music`; the public API renders `live-music`. Normalize at the boundary; never compare the two raw.
5. **Provenance must be honest.** An event's `source_method` is `self_asserted` | `proxied` | `witnessed`. Relaying someone else's listing (a calendar, a feed, a scraped page) is `proxied`, and you set `source_feed_url` to the page. Don't mislabel a relayed source as first-party.
6. **Match the surrounding patterns.** TypeScript, Svelte 5 runes (`$state`/`$derived`/`$props` — no Riverpod/Provider/store libraries), the `r.error?.error?.message` Commons-error idiom, `fail(4xx, { error })` from actions, Prettier formatting. Tests live next to the module (`*.test.ts`).

## Where things go

```
src/lib/
  kernel/     shared substrate every deployment uses — the SDK wrapper
              (commons-client), the candidate primitive, the publish path
              (publish.ts), the access gate (session/hooks), geocoding,
              safe-fetch (SSRF guard), shared UI (chrome/)
  tools/      pluggable ingestion sources, one folder each
              (calendar, rss, sheets, extract, scrape, submissions)
  venues/     the venue/map feature's domain logic (create, overpass, hours,
              google-*) — its own folder because it spans 3 surfaces
  instance/   read-models of the Commons (LiveOrg/LiveEvent for Venues/Library)
  operator/   reserved admin-only seam (baseline ships none)
src/routes/   SvelteKit routes: / (review queue), /sources/*, /add, /map,
              /venues, /library, /settings, /guide, /login, /enroll
```

The **kernel never imports from tools/routes/instance** — it's a leaf. Tools build
on the kernel. Keep that direction.

## Add a source

The canonical template is **`src/lib/tools/calendar/`** + **`src/routes/sources/calendar/`**.
Copy its shape. To add a source named `mysource`:

1. **Producer** — `src/lib/tools/mysource/produce.ts` exports a function returning
   `Promise<EventCandidate[]>` (`EventCandidate` is from `$lib/kernel/candidate.js`).
   Existing producers vary in signature (a config object, a URL) — match what fits
   your source; there's no enforced interface. For each item, build the candidate:

   ```ts
   {
     id: candidateId('mysource', i, name, startIso, venueName), // stable content hash
     kind: 'event',
     status: 'pending',
     source_tool: 'mysource',          // matches the folder name
     source_uri: sourceUrl,
     created_at: new Date().toISOString(),
     data: {
       name, start: startIso, timezone, end, category: 'community',
       description, location: { name: venue, address, lat, lng },
       organizer_name: null, image_url: null,
       source_method: 'proxied',       // relayed source → proxied
       source_feed_url: sourceUrl,
     },
   }
   ```

2. **Fetch user URLs safely.** For any operator-supplied URL, use `assertSafeUrl` /
   `safeFetch` from `$lib/kernel/safe-fetch.js` (blocks private/internal hosts and
   re-checks redirects).

3. **Route** — `src/routes/sources/mysource/+page.server.ts` with two actions,
   mirroring calendar's: a `fetch` action that runs your producer and returns the
   candidates, and a `publish` action that calls `publishBatch` from
   `$lib/kernel/publish.js`. Add `+page.svelte` for the UI (copy calendar's).

4. **List it** — add the source to the `/sources` index page.

5. **Test it** — add `src/lib/tools/mysource/*.test.ts` for the parser/producer
   (pure logic; see `tools/calendar/ical.test.ts`).

Everything downstream — the review queue, inline editing, organizer resolution,
provenance, the actual Commons write — is shared kernel. You only write the
fetch + extraction for your one source.

## Anti-patterns (will get flagged in review)

- Exposing a secret to the client, or reading env outside `$env/dynamic/private`.
- A raw `fetch` to a Commons endpoint instead of the SDK client.
- Adding a state-management library (use runes).
- A new write endpoint that forwards an arbitrary client object to a privileged
  Commons write — allowlist the fields.
- Dishonest provenance to make a write "go through."
- Finishing without `pnpm typecheck && pnpm test:run` passing.

## Doctrine docs

- [docs/architecture.md](docs/architecture.md) — the layers and the seam
- [docs/extending.md](docs/extending.md) — the human walkthrough of adding a source
- [docs/deploying.md](docs/deploying.md) — running an instance + the access gate
