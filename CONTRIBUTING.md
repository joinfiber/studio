# Contributing to Studio

Thanks for your interest. Studio is an open-source operator GUI for the
[Neighborhood Commons](https://neighborhood-commons.org). Issues and pull
requests are welcome.

## Getting set up

```bash
cp .env.example .env   # set COMMONS_SERVICE_KEY (register at neighborhood-commons.org/developers)
pnpm install
pnpm dev               # http://localhost:5273
```

One key (`COMMONS_SERVICE_KEY`) gets you the full core tool. Everything else is
progressive — the **Settings** page shows what each additional key unlocks. See
[docs/deploying.md](docs/deploying.md) for the full configuration.

## Before you open a PR

```bash
pnpm format       # prettier — formats the code
pnpm typecheck    # svelte-check; must be 0 errors
pnpm test:run     # vitest
pnpm build        # adapter-node production build
```

CI runs `format:check`, `typecheck`, `test:run`, and `build` on every push and PR.

## Adding an ingestion tool

The kernel/tools seam is built for this — a new source is a folder under
`src/lib/tools/`. See [docs/extending.md](docs/extending.md) and
[docs/architecture.md](docs/architecture.md).

## Conventions

- TypeScript + Svelte 5 runes. Match the surrounding patterns; Prettier handles formatting.
- Server secrets are read via `$env/dynamic/private` only — never exposed to the client.
- The Commons contract is canonical upstream. Studio reads and writes through the
  published `neighborhood-commons` SDK and never reaches into Commons internals;
  if you need something the SDK doesn't expose, open an issue on the Commons repo.

## Reporting issues

Open a GitHub issue with steps to reproduce. For Commons-contract questions, link
the [Commons repo](https://github.com/joinfiber/neighborhood-commons).
