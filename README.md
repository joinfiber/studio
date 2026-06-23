# Studio

[![CI](https://github.com/joinfiber/studio/actions/workflows/ci.yml/badge.svg)](https://github.com/joinfiber/studio/actions/workflows/ci.yml)

**The easy way to get your neighborhood's events and venues into an open, shared database — and to manage them once they're there.**

Studio is an open-source operator console for the [Neighborhood Commons](https://neighborhood-commons.org). One person can pull events and venues out of the messy places they already live — calendars, spreadsheets, feeds, listing pages, pasted text — tidy them up, and publish them to a common, openly-licensed dataset that any app can read.

## What's the Neighborhood Commons?

A shared, open database of neighborhood public facts — events, venues, organizations, civic data — that **anyone can read and any trusted contributor can write**. Think of it as the layer underneath a dozen different local apps: instead of every app scraping and re-scraping the same listings, the facts live once, with provenance, under a CC-BY license, and the apps build experiences on top. Studio is one way in. (The full story lives at [neighborhood-commons.org](https://neighborhood-commons.org).)

## What Studio is

A fast, keyboard-friendly GUI for the unglamorous middle of contributing: **fetch → review → publish**, plus the tools to manage what's already there. There's no database to run and no infrastructure to stand up — Studio talks to the Commons over its public API and keeps only a small local queue of work-in-progress.

**Two ways to use it:**

- **As your operator console.** Run it with your Commons key and use it daily to ingest, curate, and manage a city's data.
- **As the starting point for your own project.** Clone it, bring your own free key, and you have a working ingestion-and-management UI on day one — then add your own sources on top of the kernel. See [Extend it](#extend-it).

## How it's meant to be used

The loop is the point:

1. **Pull** events or venues from a source — an iCal / Google Calendar, a Google Sheet or CSV, an RSS/Atom feed, a pasted block of text (extracted by an LLM), or a scraped page. Each becomes a _candidate_.
2. **Review** every candidate in one queue. Tidy it inline — fix a title, recategorize, correct a date — then publish or reject. The queue survives restarts, so you can work a backlog over days.
3. **Publish** to the Commons through one shared path, with honest provenance attached.

Alongside the ingest loop:

- **The map** — every known business as a dot: gray (OpenStreetMap), yellow (in the Commons), blue (claimed). Click one to add or enrich it, cross-checking against OSM and Google. Watch your city fill in.
- **Venues & Library** — browse, filter, and inline-edit the organizations and events your key can see.
- **Add** — create an org, event, or place by hand, with dedup typeahead and OpenStreetMap autofill.
- **Submissions** _(optional)_ — moderate user-generated events from an app you operate and publish what you approve.

## Quick start

```bash
cp .env.example .env
# set COMMONS_SERVICE_KEY — register a free key at neighborhood-commons.org/developers
pnpm install
pnpm dev          # → http://localhost:5273
```

**One key gets you the whole core tool.** Everything else is optional and unlocks progressively — the in-app **Settings** page shows what each adds and how to get it:

| Add this key                  | Unlocks                                                |
| ----------------------------- | ------------------------------------------------------ |
| `COMMONS_SERVICE_KEY` _(req)_ | read + publish to the Commons — the whole tool         |
| `STUDIO_PASSWORD`             | the access gate (required before any public URL)       |
| `INFERENCE_API_KEY`           | LLM extraction from pasted text + scraped pages        |
| `MAPTILER_API_KEY`            | the map basemap                                        |
| `GOOGLE_PLACES_API_KEY`       | stable venue IDs + the Google cross-check on the map   |

Geocoding works out of the box via OpenStreetMap — no key needed. Venue import (OpenStreetMap) and the venue _data_ on the map need no key either; only the basemap tiles do.

## Extend it

Adding a source is a folder, not a refactor — and it's built to be done **with an AI assistant in an afternoon**. Point your assistant (Claude Code, Cursor, …) at **[AGENTS.md](AGENTS.md)**: it lays out the architecture, the "a producer returns `Candidate[]`" convention, the publish flow, and the rules to follow. [docs/extending.md](docs/extending.md) is the human walkthrough.

## Architecture, in a paragraph

The **kernel** (`src/lib/kernel/`) is the shared substrate every deployment uses: a typed Commons SDK wrapper, the candidate primitive, the one publish path, the access gate, and shared UI (keyboard nav, candidate cards, toast). **Tools** (`src/lib/tools/`) are the pluggable ingestion sources — one folder each. **Instance** (`src/lib/instance/`) holds the read-models of the Commons (the Venues and Library views). The venue/map feature has its own folder, **`src/lib/venues/`**. **Operator** (`src/lib/operator/`) is the reserved admin-only seam; the baseline ships none. See [docs/architecture.md](docs/architecture.md).

## Documentation

- [docs/architecture.md](docs/architecture.md) — the kernel/tools/instance/operator seam + the service-key tier model
- [docs/extending.md](docs/extending.md) — adding a new ingestion source
- [docs/deploying.md](docs/deploying.md) — running your own instance
- [AGENTS.md](AGENTS.md) — orientation for AI coding assistants
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup + the pre-PR checklist

## License

MIT. See [LICENSE](LICENSE). Do what you like with it.

## Status

**v0.3.** Reads and writes the Commons end to end — ingestion, manual entry, venue import, the map, a persistent review queue, and library management. The core (events + venues) is solid; a few of the ingestion sources are earlier than others (the extract/scrape/calendar paths get more hardening as they're used). A couple of niceties wait on upstream Commons work (a key-capabilities endpoint, a place-update endpoint, and caller-set provenance on _organizations_ — events already publish with honest `proxied`/`witnessed` provenance). Issues and pull requests welcome.
