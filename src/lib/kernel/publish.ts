/**
 * Publish adapter — the shared path that turns an approved EventCandidate
 * into a real Commons event. Every ingestion tool (calendar, sheets,
 * newsletter, scraper) and the Add → Event form reuse this.
 *
 * Three responsibilities:
 *  1. Resolve the organizer org (search-or-create) → organizerOrganizationId.
 *  2. Map EventCandidate → ServiceEventInput (incl. tz → offset on `start`).
 *  3. Carry the candidate's honest provenance (source_method + source_feed_url).
 *
 * Provenance: we send the candidate's own source_method — imports are
 * 'proxied' (relayed third-party data, with source_feed_url), manual entries
 * 'self_asserted'. 'proxied' needs proxy_authority (admin keys bypass) +
 * source_feed_url, and that pairing is ENFORCED here (Golden Rule #5): a
 * proxied candidate without a usable source URL is refused, not relabeled
 * and not quietly sent with its lineage missing.
 */

import type { Client } from 'openapi-fetch';
import type { paths, components } from 'neighborhood-commons';
import type { EventCandidate, SourceMethod } from './candidate.js';
import { normalizeCategoryKey } from './categories.js';

type Sdk = Client<paths>;
type ServiceEventInput = components['schemas']['ServiceEventInput'];

export interface PublishResult {
	ok: boolean;
	id?: string;
	error?: string;
}

// --- timezone → offset ---------------------------------------------------

/** Offset (minutes) of `tz` at the given instant. */
function offsetMinutes(date: Date, tz: string): number {
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
	const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
	const asUtc = Date.UTC(
		Number(p.year),
		Number(p.month) - 1,
		Number(p.day),
		Number(p.hour),
		Number(p.minute),
		Number(p.second),
	);
	return Math.round((asUtc - date.getTime()) / 60000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Convert a candidate `start`/`end` (wall-clock-in-tz `YYYY-MM-DDTHH:MM:SS`,
 * UTC `…Z`, or date-only `YYYY-MM-DD`) into ISO 8601 with the tz's offset,
 * which is what ServiceEventInput wants. The `timezone` field stays
 * authoritative for DST; a one-iteration offset is fine here.
 */
export function toOffsetIso(value: string, tz: string): string {
	// Fail with a usable message instead of an opaque RangeError (bad zone) or
	// a silent 'NaN-NaN-NaN…' ISO string (malformed date) — producer input is
	// messy by nature and this error is shown per-event at publish.
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
	} catch {
		throw new Error(`Unknown timezone "${tz}" — use an IANA name like America/New_York.`);
	}

	let local = value;
	if (/^\d{4}-\d{2}-\d{2}$/.test(local)) local = `${local}T00:00:00`; // all-day → midnight

	const probe = new Date(/Z$/.test(local) ? local : `${local}Z`);
	if (Number.isNaN(probe.getTime())) {
		throw new Error(`Unusable date/time "${value}" — expected ISO like 2026-06-20T19:00:00.`);
	}

	let instant: Date;
	if (/Z$/.test(local)) {
		instant = new Date(local);
	} else {
		const guess = new Date(`${local}Z`); // treat wall-clock as UTC
		// Two passes: the offset can differ between the guess and the true
		// instant across a DST boundary (e.g. the spring-forward gap), so refine
		// using the offset at the first-pass instant. One pass is wrong by an
		// hour for wall-clock times adjacent to a transition.
		const firstPass = new Date(guess.getTime() - offsetMinutes(guess, tz) * 60000);
		instant = new Date(guess.getTime() - offsetMinutes(firstPass, tz) * 60000);
	}

	const off = offsetMinutes(instant, tz);
	const wall = new Date(instant.getTime() + off * 60000); // wall-clock as UTC fields
	const sign = off >= 0 ? '+' : '-';
	const ao = Math.abs(off);
	const offStr = `${sign}${pad(Math.floor(ao / 60))}:${pad(ao % 60)}`;
	return (
		`${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
		`T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}${offStr}`
	);
}

// --- organizer resolution ------------------------------------------------

/** Find an org by exact (case-insensitive) name, else create it. Returns id. */
export async function resolveOrganizerId(sdk: Sdk, name: string): Promise<string> {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Organizer name is required.');

	// The Commons search is a substring match ordered by recency; we then pick
	// the exact (case-insensitive) name. A generous limit avoids missing the
	// exact org when a common token has many substring hits (which would
	// otherwise create a duplicate org). Residual risk only if >100 orgs share
	// the substring AND the exact one isn't among the most recent 100.
	const search = await sdk.GET('/organizations', {
		params: { query: { q: trimmed, limit: 100 } },
	});
	const match = search.data?.organizations?.find(
		(o) => o.name.toLowerCase() === trimmed.toLowerCase(),
	);
	if (match) return match.id;

	const created = await sdk.POST('/service/organizations', { body: { name: trimmed } });
	if (created.data?.organization) return created.data.organization.id;
	throw new Error(
		`Couldn't resolve or create organizer "${trimmed}" (Commons returned ${created.response.status}).`,
	);
}

// --- publish -------------------------------------------------------------

/** Publish one approved event candidate under the given organizer org. */
export async function publishEventCandidate(
	sdk: Sdk,
	candidate: EventCandidate,
	organizerOrgId: string,
): Promise<PublishResult> {
	const d = candidate.data;
	try {
		// The provenance pairing is enforced, not just carried: an unknown
		// method or a proxied event without its source URL is refused here, at
		// the single write boundary, regardless of which path produced the
		// candidate. Category keys are underscore in the Commons (kebab is
		// read-side only); normalize at the boundary.
		const method: SourceMethod = d.source_method;
		if (method !== 'self_asserted' && method !== 'proxied' && method !== 'witnessed') {
			return { ok: false, error: `Unknown provenance method "${String(method)}".` };
		}
		if (method === 'proxied' && !/^https?:\/\//.test(d.source_feed_url ?? '')) {
			return {
				ok: false,
				error:
					'Relayed (proxied) events must carry their source URL — re-import from the source or fix source_feed_url.',
			};
		}
		// external_id is the cross-source identity key; bound it rather than
		// mass-assigning whatever string arrived as candidate.id.
		let idUsable = candidate.id.length >= 1 && candidate.id.length <= 200;
		for (const ch of candidate.id) {
			const cp = ch.codePointAt(0) as number;
			if (cp < 32 || cp === 127) idUsable = false; // control characters
		}
		if (!idUsable) {
			return { ok: false, error: 'Candidate id is not usable as an external id.' };
		}

		const body: ServiceEventInput = {
			organizerOrganizationId: organizerOrgId,
			source_method: method,
			...(method === 'proxied' ? { source_feed_url: d.source_feed_url ?? undefined } : {}),
			name: d.name,
			start: toOffsetIso(d.start, d.timezone),
			end: d.end ? toOffsetIso(d.end, d.timezone) : undefined,
			timezone: d.timezone,
			category: normalizeCategoryKey(d.category) ?? d.category.replace(/-/g, '_'),
			location: {
				name: d.location.name || d.name,
				address: d.location.address ?? undefined,
				lat: d.location.lat ?? undefined,
				lng: d.location.lng ?? undefined,
			},
			description: d.description ?? undefined,
			image_url: d.image_url ?? undefined,
			external_id: candidate.id,
			status: 'published',
		};

		const res = await sdk.POST('/service/events', { body });
		if (res.data) {
			return { ok: true };
		}
		const code = res.error?.error?.code;
		const msg = res.error?.error?.message;
		return {
			ok: false,
			error: msg ?? code ?? `Commons returned ${res.response.status}.`,
		};
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : 'Publish failed.' };
	}
}

export interface BatchResult {
	published: number;
	failedCount: number;
	failed: { name: string; error: string }[];
}

/**
 * Resolve the organizer once, then publish each candidate under it. Shared
 * by every importer's publish action. Throws if the organizer can't be
 * resolved (caller surfaces it); per-event failures are collected, not thrown.
 */
export async function publishBatch(
	sdk: Sdk,
	candidates: EventCandidate[],
	organizerName: string,
): Promise<BatchResult> {
	const organizerOrgId = await resolveOrganizerId(sdk, organizerName);
	const failed: { name: string; error: string }[] = [];
	let published = 0;
	for (const candidate of candidates) {
		const result = await publishEventCandidate(sdk, candidate, organizerOrgId);
		if (result.ok) published += 1;
		else
			failed.push({ name: candidate.data?.name ?? candidate.id, error: result.error ?? 'failed' });
	}
	return { published, failedCount: failed.length, failed: failed.slice(0, 10) };
}
