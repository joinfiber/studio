# Security Policy

## Reporting a vulnerability

Please report security issues **privately — do not open a public issue.**

Use GitHub's private vulnerability reporting: the repository's **Security** tab →
**Report a vulnerability**
([direct link](https://github.com/joinfiber/studio/security/advisories/new)).
We'll acknowledge the report and work with you on a fix and a disclosure timeline.

## Why this matters here

Studio is an operator console that holds a possibly-admin Neighborhood Commons
service key behind a single-password access gate, so its security surface is
real. The most relevant areas:

- the access gate and session signing — `src/hooks.server.ts`, `src/lib/kernel/session.ts`;
- the SSRF guard on operator-supplied source URLs — `src/lib/kernel/safe-fetch.ts`;
- the write-side validation that protects the Commons — `src/lib/kernel/candidate-parse.ts`, `src/lib/kernel/publish.ts`.

A public deployment **must** set `STUDIO_PASSWORD` (Studio fails closed without
it) and should set a distinct `SESSION_SECRET`. See
[docs/deploying.md](docs/deploying.md).

## Supported versions

Studio is pre-1.0 and ships from `main`; security fixes land there. Pin a tag or
commit for reproducible deploys, and update to pick up fixes.
