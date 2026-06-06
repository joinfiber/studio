/**
 * Persistent candidate staging (libsql / SQLite).
 *
 * Candidates imported from a source but not yet published live here, so the
 * operator's tidying work survives navigation and restarts. The store is local
 * to this deployment — Commons is the source of truth for *published* facts;
 * this is just the pre-publish queue.
 *
 * Zero-config: with no STUDIO_DATABASE_URL it runs in-memory (durable for the
 * process lifetime — survives navigation, lost on restart). Set
 * STUDIO_DATABASE_URL=file:/data/studio.db (and attach a volume on ephemeral
 * hosts like Railway) for true persistence. NB: STUDIO_DATABASE_URL, not
 * DATABASE_URL — the latter is Railway's reserved Postgres variable.
 *
 * Server-only. The client + schema init are lazily memoized.
 */

import { createClient, type Client } from '@libsql/client';
import { env } from '$env/dynamic/private';
import type { EventCandidate } from './candidate.js';

export interface StoredCandidate {
	/** DB row id — globally unique (candidate.id from a tool is not). */
	id: number;
	kind: string;
	source_tool: string;
	organizer: string | null;
	status: string;
	created_at: string;
	candidate: EventCandidate;
}

let clientPromise: Promise<Client> | null = null;
let dbWarning: string | null = null;

const SUPPORTED_DB_SCHEME = /^(file:|libsql:|wss?:|https?:|:memory:)/;

/**
 * Resolve the libsql URL. Prefers STUDIO_DATABASE_URL — plain DATABASE_URL
 * collides with Railway's Postgres convention, and a `postgresql:` URL crashes
 * the libsql client. An unsupported scheme (or none) falls back to in-memory
 * instead of taking the store down.
 */
function resolveDbUrl(): string {
	for (const candidate of [env.STUDIO_DATABASE_URL, env.DATABASE_URL]) {
		if (!candidate) continue;
		if (SUPPORTED_DB_SCHEME.test(candidate)) return candidate;
		console.warn(
			`[db] ignoring unsupported database URL scheme "${candidate.split(':')[0]}:" — libsql supports file:/libsql:/http(s):/ws(s):. Falling back to in-memory.`,
		);
	}
	return ':memory:';
}

function initClient(): Promise<Client> {
	const url = resolveDbUrl();
	let client: Client;
	try {
		client = createClient({ url });
	} catch (err) {
		// e.g. a file: path whose directory doesn't exist (wrong volume mount).
		// Don't take the store (and every review write) down — fall back to
		// in-memory and surface a precise warning instead of a 500.
		const safe = url.replace(/\/\/[^@/]*@/, '//***@'); // redact any user:pass in the URL
		dbWarning = `couldn't open ${safe} — check the volume mount path; reviews are in-memory and won't persist`;
		console.error(`[db] ${dbWarning}:`, err);
		client = createClient({ url: ':memory:' });
	}
	return client
		.batch(
			[
				`CREATE TABLE IF NOT EXISTS candidates (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					kind TEXT NOT NULL,
					source_tool TEXT NOT NULL,
					organizer TEXT,
					status TEXT NOT NULL DEFAULT 'pending',
					data TEXT NOT NULL,
					created_at TEXT NOT NULL
				)`,
				// Operator-local "I've vetted this venue" overlay for the map cleanup
				// pass. Studio-local by design: never sent to the Commons (which holds
				// facts, not editorial state) and invisible to other clones.
				`CREATE TABLE IF NOT EXISTS org_reviews (
					org_id TEXT PRIMARY KEY,
					reviewed_at TEXT NOT NULL
				)`,
			],
			'write',
		)
		.then(() => client);
}

function getClient(): Promise<Client> {
	if (!clientPromise) clientPromise = initClient();
	return clientPromise;
}

function rowToStored(row: Record<string, unknown>): StoredCandidate {
	return {
		id: Number(row.id),
		kind: String(row.kind),
		source_tool: String(row.source_tool),
		organizer: row.organizer == null ? null : String(row.organizer),
		status: String(row.status),
		created_at: String(row.created_at),
		candidate: JSON.parse(String(row.data)) as EventCandidate,
	};
}

/**
 * Persist candidates as `pending`. An optional `organizer` is stamped onto each
 * (overriding the candidate's own) so the queued item is publishable later.
 * Returns the number saved.
 */
export async function saveCandidates(
	candidates: EventCandidate[],
	organizer?: string,
): Promise<number> {
	if (candidates.length === 0) return 0;
	const client = await getClient();
	const now = new Date().toISOString();
	const stmts = candidates.map((cand) => {
		const org = (organizer ?? cand.data.organizer_name ?? '').trim() || null;
		const stored: EventCandidate = { ...cand, data: { ...cand.data, organizer_name: org } };
		return {
			sql: `INSERT INTO candidates (kind, source_tool, organizer, status, data, created_at)
			      VALUES (?, ?, ?, 'pending', ?, ?)`,
			args: [cand.kind, cand.source_tool, org, JSON.stringify(stored), now],
		};
	});
	await client.batch(stmts, 'write');
	return stmts.length;
}

export async function listCandidates(status = 'pending'): Promise<StoredCandidate[]> {
	const client = await getClient();
	const res = await client.execute({
		sql: `SELECT id, kind, source_tool, organizer, status, data, created_at
		      FROM candidates WHERE status = ? ORDER BY created_at ASC, id ASC`,
		args: [status],
	});
	return res.rows.map((r) => rowToStored(r as unknown as Record<string, unknown>));
}

export async function getCandidate(id: number): Promise<StoredCandidate | null> {
	const client = await getClient();
	const res = await client.execute({
		sql: `SELECT id, kind, source_tool, organizer, status, data, created_at
		      FROM candidates WHERE id = ?`,
		args: [id],
	});
	const row = res.rows[0];
	return row ? rowToStored(row as unknown as Record<string, unknown>) : null;
}

export async function setCandidateStatus(id: number, status: string): Promise<void> {
	const client = await getClient();
	await client.execute({ sql: `UPDATE candidates SET status = ? WHERE id = ?`, args: [status, id] });
}

/** Replace a queued candidate's payload after an inline edit in review. */
export async function updateCandidate(id: number, candidate: EventCandidate): Promise<void> {
	const client = await getClient();
	const organizer = (candidate.data.organizer_name ?? '').trim() || null;
	await client.execute({
		sql: `UPDATE candidates SET data = ?, organizer = ?, kind = ?, source_tool = ? WHERE id = ?`,
		args: [JSON.stringify(candidate), organizer, candidate.kind, candidate.source_tool, id],
	});
}

export async function deleteCandidate(id: number): Promise<void> {
	const client = await getClient();
	await client.execute({ sql: `DELETE FROM candidates WHERE id = ?`, args: [id] });
}

export async function countCandidates(status = 'pending'): Promise<number> {
	const client = await getClient();
	const res = await client.execute({
		sql: `SELECT COUNT(*) AS n FROM candidates WHERE status = ?`,
		args: [status],
	});
	return Number(res.rows[0]?.n ?? 0);
}

// ── Org review overlay (map cleanup pass) ──────────────────────────────────

/**
 * A user-facing warning about review-state durability, or null when it persists.
 * Accurate only after the client has initialized (e.g. after a query like
 * listReviewedOrgIds), since a failed file open is detected at connect time.
 */
export function reviewWarning(): string | null {
	if (dbWarning) return dbWarning;
	if (resolveDbUrl() === ':memory:') {
		return 'review state is in-memory — set STUDIO_DATABASE_URL to a persistent volume to keep it across restarts';
	}
	return null;
}

/** All org ids the operator has marked reviewed. */
export async function listReviewedOrgIds(): Promise<string[]> {
	const client = await getClient();
	const res = await client.execute(`SELECT org_id FROM org_reviews`);
	return res.rows.map((r) => String((r as unknown as Record<string, unknown>).org_id));
}

/** Mark (or unmark) a venue reviewed. Idempotent. */
export async function setOrgReviewed(orgId: string, reviewed: boolean): Promise<void> {
	const client = await getClient();
	if (reviewed) {
		await client.execute({
			sql: `INSERT INTO org_reviews (org_id, reviewed_at) VALUES (?, ?)
			      ON CONFLICT(org_id) DO UPDATE SET reviewed_at = excluded.reviewed_at`,
			args: [orgId, new Date().toISOString()],
		});
	} else {
		await client.execute({ sql: `DELETE FROM org_reviews WHERE org_id = ?`, args: [orgId] });
	}
}
