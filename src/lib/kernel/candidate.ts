/**
 * The generic candidate primitive.
 *
 * A "candidate" is something the operator might publish to Commons but
 * hasn't yet. Every tool produces candidates of some type; the review
 * surface displays them uniformly with consistent keyboard chrome.
 *
 * Candidate types correspond loosely to the Commons primitives (Event,
 * Organization, Place, Broadcast, List) plus tool-specific shapes that
 * resolve to a Commons primitive at publish time.
 *
 * Adding a new candidate type means:
 *   1. Extend the CandidateKind union here
 *   2. Add a per-kind interface (extends CandidateBase)
 *   3. Implement a publish handler that maps it to a Commons SDK call
 *   4. Optionally: implement a dedup hook for that kind
 */

export type CandidateKind = 'event' | 'organization' | 'place' | 'broadcast' | 'list';

export type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'published';

/** Provenance method — mirrors Commons four-roles vocabulary. */
export type SourceMethod = 'self_asserted' | 'proxied' | 'witnessed';

export interface CandidateBase {
	id: string;
	kind: CandidateKind;
	status: CandidateStatus;
	source_tool: string; // which tool produced this (folder name in lib/tools or lib/operator)
	source_uri?: string | null; // original source if applicable (URL, file path, etc.)
	created_at: string;
	reviewed_at?: string | null;
	reviewer_notes?: string | null;
}

/**
 * Optional submitter metadata for witnessed UGC. The Commons never sees
 * individual users — this is the consuming app's overlay (e.g., an app
 * surfaces "via {user}" as a social signal). The operator sees the submitter
 * on the review card; the Commons never does.
 */
export interface SubmitterInfo {
	display_name: string;
	avatar_url?: string | null;
}

export interface EventCandidate extends CandidateBase {
	kind: 'event';
	data: {
		name: string;
		start: string; // ISO 8601 with offset
		timezone: string; // IANA
		end?: string | null;
		category: string; // Commons category key, underscore form (e.g. 'live_music'); kebab is read-side only
		description?: string | null;
		location: {
			name: string;
			address?: string | null;
			lat?: number | null;
			lng?: number | null;
		};
		organizer_name?: string | null;
		organizer_org_id?: string | null;
		image_url?: string | null;
		source_method: SourceMethod;
		source_feed_url?: string | null;
	};
	submitter?: SubmitterInfo | null;
}

// Other candidate kinds (Organization, Place, Broadcast, List) land as
// their respective tools are built.
export type Candidate = EventCandidate; // expand to discriminated union as kinds land

/** Small deterministic string hash (djb2-xor) → base36. */
function shortHash(seed: string): string {
	let h = 5381;
	for (let i = 0; i < seed.length; i++) h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0;
	return h.toString(36);
}

/**
 * A candidate id that's stable, content-derived, and unique across imports.
 *
 * Positional ids (`ical-0`, `sheet-0`) collided across separate imports, which
 * meant distinct real-world events shared an `external_id` on publish. This
 * keys on the candidate's content (so two sources never collide and a
 * re-import of the same source stays idempotent) plus the within-batch index
 * (so two identical rows in one import still get distinct ids).
 */
export function candidateId(
	tool: string,
	index: number,
	...seedParts: (string | null | undefined)[]
): string {
	return `${tool}-${shortHash(seedParts.map((p) => p ?? '').join('|'))}-${index}`;
}
