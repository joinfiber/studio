# Tools

Clone-baseline programs. Every Studio deployment ships these.

Each tool is a folder; see [../../../docs/extending.md](../../../docs/extending.md) for the anatomy and how to add one. Most tools *produce candidates* from a source; some *connect a data surface* the operator works (e.g., a submission queue to moderate).

## Currently shipped

- **`calendar/`** — import from an iCal / Google Calendar URL.
- **`sheets/`** — import from a Google Sheet or CSV, mapping columns to event fields.
- **`rss/`** — import items from an RSS / Atom feed.
- **`extract/`** — LLM extraction from pasted text.
- **`scrape/`** — fetch a page and LLM-extract events (generic; write a site adapter for tricky sources).
- **`venues/`** — bulk-import venues in an area from OpenStreetMap as organizations.
- **`submissions/`** — moderate user-generated content from an app you operate: read its queue, approve/reject from the Review → Submissions tab. The app does any downstream publish.

Calendar/sheets/rss/extract/scrape publish events as `proxied`; venues create organizations. Manual entry of organizations/events/places is the `/add` route (`self_asserted`), not a `tools/` folder.

## Operator-only

Modules that need an **admin** Commons key live in `../operator/` instead — folder-level separation so the OSS distribution can omit them cleanly. (Submissions moderation is *not* admin-only; it ships here.)
