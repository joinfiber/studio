# Deploying Studio

How to run your own instance.

## Prerequisites

- Node.js 20.19+ (22 recommended; the repo's `.nvmrc` pins 22)
- pnpm (or npm/yarn — the lockfile in the source repo is pnpm)
- A Commons service key. Register at [neighborhood-commons.org/developers](https://neighborhood-commons.org/developers). Standard service keys are scoped to your own organizations; admin keys are issued only to the platform operator.

## Configuration

Copy `.env.example` to `.env` and fill in:

```bash
# Optional — defaults to https://neighborhood-commons.org/api/v1 (SDK default)
# COMMONS_BASE_URL=

COMMONS_SERVICE_KEY=your-key-here
COMMONS_CONTRIBUTOR_SLUG=your-slug   # from the developer dashboard
COMMONS_IS_ADMIN=false               # true only if you have an admin key
PORT=3000
```

The contributor slug is the lowercase-with-hyphens identifier shown in your [Commons developer dashboard](https://neighborhood-commons.org/developers/dashboard) — it's needed because Commons has no `GET /me` endpoint; Studio fetches its own profile via `GET /v1/contributors/<slug>`.

Optional:

```bash
STUDIO_DATABASE_URL=file:/data/studio.db  # local SQLite path; defaults to in-memory
```

## Local development

```bash
pnpm install
pnpm dev
```

Open http://localhost:5273.

## Production build

```bash
pnpm build
pnpm start
```

The build is a standard Node.js server (adapter-node). Deploy to Railway, Render, Fly, Vercel, or anywhere Node runs.

## Database

Studio uses local SQLite (via libsql) for staging candidates that haven't been published yet. The database is *local to your deployment* — it doesn't sync anywhere. Commons is the source of truth for published facts.

For deployment platforms with ephemeral disks, attach a persistent volume and point `STUDIO_DATABASE_URL` at it (e.g. `file:/data/studio.db` with a volume mounted at `/data`) — otherwise pending candidates and your map review progress are lost on restart. Note it's `STUDIO_DATABASE_URL`, **not** `DATABASE_URL` (the latter is Railway's reserved Postgres variable, which a libsql client can't open).

## Access gate (REQUIRED for public deployments)

Studio is the operator's power tool with potentially admin-level Commons access. A public deployment **must** set `STUDIO_PASSWORD`, or anyone who reaches the URL can use it.

```bash
STUDIO_PASSWORD=<a strong password>
SESSION_SECRET=<recommended; a distinct high-entropy value, e.g. `openssl rand -hex 32`>
```

- With `STUDIO_PASSWORD` set: every route requires a valid session. Users hit a login page; a correct password issues a signed, 7-day, HTTP-only cookie. The cookie is signed with `SESSION_SECRET`; if you don't set one, Studio generates a random signing key at boot — everything works, but every restart/redeploy signs you out. (The password is never used as the signing key.)
- Without it on **localhost**: the gate is off (local-dev convenience), with a loud startup warning.
- Without it on a **non-local host**: Studio **fails closed** — every route returns 503 — so a public deploy that forgot the password serves nothing rather than an open admin surface. Set `STUDIO_ALLOW_OPEN=true` only if you intentionally want an open instance (e.g. behind your own network auth).

The gate is single-password by design — Studio is a single-operator tool. Sign out via the header link.

### MFA (optional second factor)

Matches the current Studio's TOTP mechanism. When `STUDIO_TOTP_SECRET` is set, login requires a 6-digit authenticator code after the password.

To enroll:

1. Sign in (password only, while MFA is unset). A banner prompts you to set up MFA.
2. Go to `/enroll` → **Set up MFA** → scan the QR with your authenticator → enter a code to confirm.
3. On success the page reveals the secret. Set `STUDIO_TOTP_SECRET=<that value>` in your environment and redeploy.
4. Subsequent logins require the code.

The secret lives in env (not a DB), so it survives redeploys without a volume. The one-time "set env + redeploy" step is the cost of that simplicity.

## Operator vs clone deployments

If `COMMONS_IS_ADMIN=true`, Studio assumes admin-level Commons access and exposes operator-only features (`src/lib/operator/`). If you set this without actually holding an admin key, Commons-side writes will fail with `403 NOT_LINKED`.

Clone deployments leave this false. Operator-only routes return 404. The baseline tools (`src/lib/tools/`) work against your own org graph.

## Updating

```bash
pnpm install   # picks up new neighborhood-commons SDK versions
pnpm build
```

The SDK is additive-only within a major version, so SDK bumps within 3.x shouldn't break your deployment. Major bumps (3.x → 4.x) come with migration notes in the [Commons CHANGELOG](https://github.com/joinfiber/neighborhood-commons/blob/main/CHANGELOG.md).
