# Changelog

Notable changes to Studio. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project aims for
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Hardening and polish toward a public release. No breaking changes.

### Security

- Session cookies are signed with `SESSION_SECRET` or a per-process random key — never the login password, never an empty key.
- Both login steps are throttled (grace → exponential tarpit → lockout); TOTP codes are single-use within their window.
- Baseline security headers on every response (`X-Frame-Options`, CSP `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS on https).
- The SSRF guard resolves DNS and rejects private/CGNAT/cloud-metadata addresses per redirect hop; operator-supplied response bodies are size-capped.
- Client-supplied candidates are runtime-validated at every ingress; provenance (`source_method`/`source_feed_url`) and `external_id` are enforced at the publish boundary.
- A forged `Host: localhost` can no longer open a password-less public deploy — the loopback bypass now also requires a loopback client address.

### Added

- Server-side proximity filter (near + radius) on the Venues page, replacing a page-scoped city facet.
- A one-time warning when a TLS proxy will break login via an http-computed origin (points operators at `PROTOCOL_HEADER`).
- `railway.json` sets `PROTOCOL_HEADER=x-forwarded-proto`, so a Railway deploy logs in out of the box.

### Changed

- `Referrer-Policy` is `strict-origin-when-cross-origin` (not `no-referrer`, which nulled the form `Origin` and broke login behind a TLS proxy).
- Commons calls carry a request timeout; `publishBatch` and the map's org paging run with bounded concurrency.
- The map guards viewport queries against concurrent/redundant Overpass calls and updates a single feature in place instead of rebuilding the collection.

### Fixed

- Login behind a TLS-terminating proxy ("Cross-site POST form submissions are forbidden").
- Ingestion data-loss bugs: CSV stray-quote swallow, non-IANA iCal TZIDs, out-of-range dates, RSS value coercion, double-decoded HTML entities.
- Honest queue/Commons feedback: no false "Publish failed", no silently-forked duplicate organizers, orphaned-Place reporting, durable per-row queue reads.

### Docs

- Reverse-proxy / origin configuration documented in `docs/deploying.md` and `.env.example`.
- Corrected stale comments and docs to match the code.

## [0.3.0] — 2026-06-08

Initial public baseline. Reads and writes the Neighborhood Commons end to end.

### Added

- Ingestion sources: calendar (iCal / Google Calendar), Google Sheets / CSV, RSS / Atom, paste-text LLM extraction, and page scraping.
- A persistent review queue (libsql) with inline candidate editing and one shared publish path.
- Manual entry (Add) for organizations, events, and places, with dedup typeahead and OpenStreetMap autofill.
- Venues and Library — read-models of the Commons with inline editing.
- The map: Commons venues + OpenStreetMap businesses, click-to-add / enrich, and a Google cross-check.
- Optional community-submissions moderation.
- The access gate (single password + optional TOTP), failing closed on a password-less public host.

[Unreleased]: https://github.com/joinfiber/studio/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/joinfiber/studio/releases/tag/v0.3.0
