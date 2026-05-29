/**
 * Persistent candidate staging (libsql / SQLite).
 *
 * Candidates imported from a source but not yet published live here, so the
 * operator's tidying work survives navigation and restarts. The store is local
 * to this deployment — Commons is the source of truth for *published* facts;
 * this is just the pre-publish queue.
 *
 * Zero-config: with no DATABASE_URL it runs in-memory (durable for the process
 * lifetime — survives navigation, lost on restart). Set DATABASE_URL=file:./studio.db
 * (and attach a volume on ephemeral hosts) for true persistence.
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

function initClient(): Promise<Client> {
	const url = env.DATABASE_URL || ':memory:';
	const client = createClient({ url });
	return client
		.execute(
			`CREATE TABLE IF NOT EXISTS candidates (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				kind TEXT NOT NULL,
				source_tool TEXT NOT NULL,
				organizer TEXT,
				status TEXT NOT NULL DEFAULT 'pending',
				data TEXT NOT NULL,
				created_at TEXT NOT NULL
			)`,
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
