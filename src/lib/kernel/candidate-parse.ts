/**
 * Runtime validation for candidates crossing the trust boundary.
 *
 * Candidates arrive from the client in three places: the /api/queue JSON
 * body ("Save to queue"), every source's publish form, and the review
 * queue's inline editor. A TypeScript cast checks nothing at runtime; this
 * parser does — required fields, bounds, enum membership — and rebuilds the
 * object field-by-field, so unknown keys never ride along into the DB or
 * toward a privileged Commons write (mass-assignment guard).
 *
 * Provenance honesty (Golden Rule #5) is *enforced* at the publish boundary
 * in publish.ts; this parser guarantees shape so that check can be exact.
 */

import type { EventCandidate, CandidateStatus, SourceMethod } from './candidate.js';

/** Upper bound on one request's candidate array (memory/abuse guard). */
export const MAX_CANDIDATES_PER_REQUEST = 500;

const STATUSES: CandidateStatus[] = ['pending', 'approved', 'rejected', 'published'];
const METHODS: SourceMethod[] = ['self_asserted', 'proxied', 'witnessed'];

/** ISO date or date-time prefix — full calendar validity is checked at publish. */
const DATEISH = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

class ParseError extends Error {}

function fail(label: string, reason: string): never {
	throw new ParseError(`${label}: ${reason}`);
}

function reqString(v: unknown, label: string, max: number, min = 1): string {
	if (typeof v !== 'string') fail(label, 'must be a string');
	const s = v.trim();
	if (s.length < min) fail(label, 'is required');
	if (s.length > max) fail(label, `is too long (max ${max} characters)`);
	// eslint-disable-next-line no-control-regex
	if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)) fail(label, 'contains control characters');
	return s;
}

function optString(v: unknown, label: string, max: number): string | null {
	if (v === undefined || v === null || v === '') return null;
	return reqString(v, label, max);
}

function optHttpUrl(v: unknown, label: string): string | null {
	const s = optString(v, label, 2000);
	if (s === null) return null;
	let u: URL;
	try {
		u = new URL(s);
	} catch {
		fail(label, 'must be a valid URL');
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') fail(label, 'must be http(s)');
	return s;
}

function optCoord(v: unknown, label: string, bound: number): number | null {
	if (v === undefined || v === null) return null;
	if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > bound) {
		fail(label, 'is out of range');
	}
	return v;
}

/** Validate one client-supplied candidate and rebuild it allowlist-style. */
export function parseEventCandidate(input: unknown, label = 'candidate'): EventCandidate {
	if (typeof input !== 'object' || input === null || Array.isArray(input)) {
		fail(label, 'must be an object');
	}
	const c = input as Record<string, unknown>;
	if (c.kind !== 'event') fail(`${label}.kind`, 'must be "event"');

	const status = (c.status ?? 'pending') as CandidateStatus;
	if (!STATUSES.includes(status)) fail(`${label}.status`, 'is not a known status');

	if (typeof c.data !== 'object' || c.data === null) fail(`${label}.data`, 'must be an object');
	const d = c.data as Record<string, unknown>;

	const method = d.source_method as SourceMethod;
	if (!METHODS.includes(method)) {
		fail(`${label}.data.source_method`, 'must be self_asserted, proxied, or witnessed');
	}

	const start = reqString(d.start, `${label}.data.start`, 40);
	if (!DATEISH.test(start)) fail(`${label}.data.start`, 'must be an ISO date or date-time');
	const end = optString(d.end, `${label}.data.end`, 40);
	if (end !== null && !DATEISH.test(end)) {
		fail(`${label}.data.end`, 'must be an ISO date or date-time');
	}

	if (typeof d.location !== 'object' || d.location === null) {
		fail(`${label}.data.location`, 'must be an object');
	}
	const loc = d.location as Record<string, unknown>;

	let submitter: EventCandidate['submitter'] = null;
	if (c.submitter !== undefined && c.submitter !== null) {
		if (typeof c.submitter !== 'object') fail(`${label}.submitter`, 'must be an object');
		const s = c.submitter as Record<string, unknown>;
		submitter = {
			display_name: reqString(s.display_name, `${label}.submitter.display_name`, 120),
			avatar_url: optHttpUrl(s.avatar_url, `${label}.submitter.avatar_url`),
		};
	}

	// Rebuilt field-by-field: anything not named here is dropped.
	return {
		id: reqString(c.id, `${label}.id`, 200),
		kind: 'event',
		status,
		source_tool: reqString(c.source_tool, `${label}.source_tool`, 60),
		source_uri: optString(c.source_uri, `${label}.source_uri`, 2000),
		created_at: optString(c.created_at, `${label}.created_at`, 40) ?? new Date().toISOString(),
		data: {
			name: reqString(d.name, `${label}.data.name`, 300),
			start,
			timezone: reqString(d.timezone, `${label}.data.timezone`, 64),
			end,
			category: reqString(d.category, `${label}.data.category`, 80),
			description: optString(d.description, `${label}.data.description`, 8000),
			location: {
				name: optString(loc.name, `${label}.data.location.name`, 300) ?? '',
				address: optString(loc.address, `${label}.data.location.address`, 500),
				lat: optCoord(loc.lat, `${label}.data.location.lat`, 90),
				lng: optCoord(loc.lng, `${label}.data.location.lng`, 180),
			},
			organizer_name: optString(d.organizer_name, `${label}.data.organizer_name`, 200),
			organizer_org_id: optString(d.organizer_org_id, `${label}.data.organizer_org_id`, 80),
			image_url: optHttpUrl(d.image_url, `${label}.data.image_url`),
			source_method: method,
			source_feed_url: optHttpUrl(d.source_feed_url, `${label}.data.source_feed_url`),
		},
		submitter,
	};
}

/** Validate a client-supplied candidates array (bounded). */
export function parseEventCandidates(
	input: unknown,
	max = MAX_CANDIDATES_PER_REQUEST,
): EventCandidate[] {
	if (!Array.isArray(input)) throw new ParseError('candidates must be an array.');
	if (input.length === 0) throw new ParseError('No candidates provided.');
	if (input.length > max) {
		throw new ParseError(`Too many candidates in one request (max ${max}).`);
	}
	return input.map((c, i) => parseEventCandidate(c, `candidates[${i}]`));
}

/** Parse + validate a JSON form field carrying a candidates array. */
export function parseEventCandidatesJson(
	json: string,
	max = MAX_CANDIDATES_PER_REQUEST,
): EventCandidate[] {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		throw new ParseError('Could not read the candidate payload.');
	}
	return parseEventCandidates(raw, max);
}
