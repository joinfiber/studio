# Architecture

Studio has four layers: **kernel**, **tools**, **instance**, **operator**.

## The kernel (`src/lib/kernel/`)

What every Studio deployment shares.

- **commons-client.ts** — a typed wrapper around the published `neighborhood-commons` SDK. Reads `COMMONS_SERVICE_KEY` and `COMMONS_BASE_URL` from env; returns a configured client. All Commons reads and writes go through here.
- **auth.ts** — detects whether this deployment is the admin (operator) instance or a standard service-key clone. Reads `COMMONS_IS_ADMIN` env var (honor-system; if set wrong, Commons-side writes fail with `403 NOT_LINKED`). Other code calls `isAdminInstance()` to gate features.
- **candidate.ts** — the generic candidate primitive. A candidate is "something the operator might publish to Commons." Each tool produces candidates of one or more types; the review surface displays them uniformly.
- **chrome/** — shared UX components: the inline-editable candidate card, the concept glossary (`Term`), the capability guide, and toasts.

The kernel doesn't know about specific ingestion sources, and it doesn't know about any particular consuming app. It's the substrate on top of which tools and operator modules are built.

## The tools (`src/lib/tools/`)

Clone-baseline programs that ship in every deployment. Each tool:

1. Produces candidates of some type (events, organizations, places, broadcasts, lists).
2. Optionally surfaces a per-tool UI for source configuration (e.g., "manage subscribed newsletters").
3. Hands off to the kernel for publishing.

Add a tool by creating `src/lib/tools/your-tool-name/` with a candidate producer. See [extending.md](extending.md).

Baseline tools: `calendar/`, `sheets/`, `rss/`, `extract/`, `scrape/`, `submissions/`. (The bulk venue importer lives with the rest of the venue feature in `src/lib/venues/` — see below. Manual entry of orgs/events/places is the `/add` route, not a `tools/` folder; library management is `/library`.)

## The instance (`src/lib/instance/`)

The operator's read-models of the Commons, plus facts about this deployment's own standing. Where `tools/` *produce* candidates to publish, `instance/` *reads* the Commons back: `mapOrganization` → `LiveOrg` (the Venues route), `mapServiceEvent` → `LiveEvent` (the Library route), and downstream-consumer analytics (the Settings route). Depends only on the Commons SDK types — never on a tool or a route.

## The operator (`src/lib/operator/`)

Admin-only modules — anything that needs an admin service key (`api_keys.is_admin=true`) on the Commons side, which bypasses per-key scoping and acts across the whole Commons.

The operator folder is structurally separate from `tools/` so the seam is folder-level:

- **Open-source distribution** can omit `src/lib/operator/` entirely.
- **Operator deployment** ships the folder and gates routes behind `isAdminInstance()`.

The baseline ships no operator modules — the folder is the reserved seam for genuinely admin-only tools. (Moderating an app's user submissions is *not* admin-only: it needs only a shared key to that app, so it lives in `tools/submissions/`.)

## The venue feature (`src/lib/venues/`)

The one feature with enough domain logic to earn its own folder. Venues span three surfaces — the map, the Venues tab, and the bulk importer — so their shared pieces stay together instead of scattered through the kernel: `create.ts` (create an org + place), `overpass.ts` (OSM venue search), `hours.ts` (the opening-hours model), and the Google enrichment (`google-places` / `google-details` / `google-search`). Like a tool it builds on the kernel; unlike a tool it writes to the Commons directly rather than producing review candidates. (`geocode.ts` stays in the kernel — manual Place entry uses it too.)

## The review surface (`src/routes/+page.svelte`)

Two tabs, not a tab-per-source:

- **Submissions** — moderate user-generated content from an app you operate (optional; wired via `SUBMISSIONS_API_*`).
- **Ingested** — the persistent candidate queue. Imported candidates land here; the operator tidies each inline (the editable `CandidateCard`) and publishes or rejects. Backed by libsql so pending work survives restarts.

This is deliberate: **no per-tool review tab.** Imported candidates from every source converge in one queue.

## Service-key tier model

Studio respects the two tiers Commons defines:

| Tier | Capability | Studio deployment |
|------|-----------|-------------------|
| **Admin key** (`is_admin=true`) | Bypasses scoping; full Commons access | Operator's instance |
| **Standard service key** | Scoped to linked orgs via `api_key_organization_links`; `403 NOT_LINKED` on unlinked writes | Cloned instances |

When `isAdminInstance()` is false, operator-only routes return 404 (not 403 — don't leak admin-feature existence to non-admin instances). The clone still works against its own org graph using the baseline tools.

## What this design optimizes for

- **Operator speed** — dense, fast, no novice hand-holding.
- **Open-source clonability** — folder-level seam means scrubbing for release is structural, not surgical.
- **Composability** — adding a new tool is a folder, not a refactor.
- **Restraint** — review stays two tabs (Submissions + Ingested) rather than a tab per source.
