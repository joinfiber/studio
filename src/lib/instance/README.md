# Instance

Instance-level data — facts about THIS Studio deployment's standing in the Commons ecosystem.

Distinct from `tools/` (per-feature ingestion programs) and `kernel/` (shared chrome). This folder is for cross-cutting "about this instance" data: contributor profile (in the future, fetched from Commons), downstream-consumer analytics, deployment health, etc.

Currently:

- **`analytics.ts`** — types + fixtures for downstream consumers (apps that read from this contributor's published data). Surfaces in the Settings route.

Real data wires in when Commons exposes a downstream-consumers endpoint (see `memory/reference_commons_polish_opportunities.md`).
