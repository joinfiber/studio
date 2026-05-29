# Kernel chrome

Shared UX primitives used across the app.

- **`CandidateCard.svelte`** — inline-editable event candidate card. Image hero (when present), title, time, category, venue, description; provenance + submitter are read-only context. Edits bind directly to the passed candidate object. Used by the Sources import previews and the Ingested review queue.
- **`Term.svelte`** — a glossary term with a hover/focus definition popover, pulled from `concepts.ts`. Teaches Commons vocabulary in place.
- **`CapabilityGuide.svelte`** — renders a capability's readiness and the env vars it needs to unlock (presence only — never values).
- **`Toast.svelte`** + **`toast.svelte.ts`** — global toast notifications. Push via `toast.push(message, type)`.

## Adding to the chrome

New shared primitives land here. The rule: if multiple surfaces would want this component or behavior, it's chrome; if only one does, it belongs in that surface's folder.
