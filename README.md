# Studio

[![CI](https://github.com/joinfiber/studio/actions/workflows/ci.yml/badge.svg)](https://github.com/joinfiber/studio/actions/workflows/ci.yml)

Open-source GUI on top of the [Neighborhood Commons](https://neighborhood-commons.org).

Studio is the operator-facing tool for cataloging neighborhood public facts — venues, events, programs, civic data. It's the third iteration of the tool, built clean against the stable Commons 3.x contract and a tidy kernel/tools seam.

## Two ways to use this

**As the operator's daily tool.** Run with an admin service key. Full access to the substrate: ingest from many sources, moderate user-contributed events, manage venue and event data across the whole graph.

**As a starting point for your own ingestion project.** Clone the repo, get a standard service key from the [Commons developer portal](https://neighborhood-commons.org/developers), and have a working ingestion/management UI on day one. Build your own tools on top of the kernel.

## What it does

- **Ingest from many sources** — events from an iCal / Google Calendar, a Google Sheet or CSV, an RSS/Atom feed, pasted text (LLM extraction), or a scraped page. Each lands as a reviewable candidate.
- **Bulk-import venues** — pull venues in an area from OpenStreetMap and publish them as organizations, each linked to its place.
- **Add directly** — manually create organizations, events, and places, with typeahead dedup against the Commons and OpenStreetMap autofill.
- **Review queue** — stage candidates, tidy them inline, then publish or reject. Persists across restarts.
- **Manage your catalog** — browse, filter, and inline-edit everything your key can see in the Commons.
- **Moderate community submissions** *(optional)* — review user-generated events from an app you operate and publish what you approve.

## Architecture, one paragraph

The **kernel** (`src/lib/kernel/`) is what every Studio deployment shares: a typed Commons SDK wrapper, a generic candidate primitive, the auth-tier check, and shared UX components (keyboard nav, candidate cards, toast). The **tools** (`src/lib/tools/`) are pluggable ingestion programs that produce candidates and ship in every clone. The **operator** modules (`src/lib/operator/`) are the reserved admin-only seam (an admin key bypasses per-key scoping); the baseline ships none. The review surface (`src/routes/+page.svelte`) has two tabs — **Submissions** (moderate UGC from an app you operate) and **Ingested** (the persistent candidate queue, where you tidy imported candidates inline and publish them).

See [docs/architecture.md](docs/architecture.md) for more.

## Quick start

```bash
cp .env.example .env
# Edit .env: set COMMONS_SERVICE_KEY (register at neighborhood-commons.org/developers)
pnpm install
pnpm dev
```

Open http://localhost:5273.

## Documentation

- [docs/architecture.md](docs/architecture.md) — kernel/tools/operator seam, service-key tier model
- [docs/extending.md](docs/extending.md) — adding a new ingestion tool
- [docs/deploying.md](docs/deploying.md) — running your own instance

## License

MIT. See [LICENSE](LICENSE).

## Status

v0.3 — reads and writes the Commons end to end (ingestion, manual entry, venue import, a persistent review queue, and library management). A few capabilities depend on Commons-side work still landing upstream (caller-set `proxied` provenance, a key-capabilities endpoint).
