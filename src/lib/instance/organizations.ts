/**
 * Organizations/Venues data — the operator's view of the Commons org graph,
 * read via the public `GET /organizations` (all published orgs, searchable).
 *
 * A "venue" is an Organization with a primary place (`location`). We surface
 * the authority signals the Commons computes — `method` and `verified` — so the
 * operator can see who is first-party (a venue that has claimed + verified
 * itself = `self_asserted`) versus imported-and-unclaimed (`seeded`/`proxied`/
 * `witnessed`). Studio reads and respects these; it never overrides them (the
 * Commons returns 403 NOT_LINKED on writes to an org this key doesn't control).
 */

import type { Organization } from 'neighborhood-commons';

export interface LiveOrg {
	id: string;
	name: string;
	slug: string;
	/** self_asserted (first-party/claimed) | proxied | witnessed | seeded */
	method: string;
	verified: boolean;
	commercial: boolean | null;
	tags: string[];
	description: string | null;
	url: string | null;
	logo: string | null;
	telephone: string | null;
	email: string | null;
	sameAs: string[];
	/** Primary place, if any (an org with one is a "venue"). */
	hasPlace: boolean;
	placeName: string | null;
	address: string | null;
	city: string | null;
	region: string | null;
}

export function mapOrganization(o: Organization): LiveOrg {
	const place = o.location ?? null;
	const addr = place?.address ?? null;
	const fullAddress = addr
		? [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean).join(', ')
		: null;
	return {
		id: o.id,
		name: o.name,
		slug: o.slug,
		method: o.method,
		verified: o.verified ?? false,
		commercial: o.commercial ?? null,
		tags: o.tags ?? [],
		description: o.description ?? null,
		url: o.url ?? null,
		logo: o.logo ?? null,
		telephone: o.telephone ?? null,
		email: o.email ?? null,
		sameAs: o.sameAs ?? [],
		hasPlace: !!place,
		placeName: place?.name ?? null,
		address: fullAddress || null,
		city: addr?.addressLocality ?? null,
		region: addr?.addressRegion ?? null,
	};
}

/**
 * Operator-facing label for a provenance method. NOTE: this is *provenance*
 * (how the data arrived), NOT the claim signal — "claimed" is driven by
 * `verified` (a business that formally claimed + was approved). The Commons
 * currently hardcodes `self_asserted` on every service-created org, so this
 * field is unreliable until that's fixed; we surface it only as raw provenance.
 */
export function methodLabel(method: string): string {
	switch (method) {
		case 'self_asserted':
			return 'first-party';
		case 'seeded':
			return 'imported';
		case 'proxied':
			return 'proxied';
		case 'witnessed':
			return 'witnessed';
		default:
			return method;
	}
}

/** Fields an operator may edit on an organization. `method` and identity are
 *  excluded — the Commons sets those. */
const EDITABLE_ORG_FIELDS = [
	'name',
	'url',
	'telephone',
	'email',
	'description',
	'logo',
	'sameAs',
	'tags',
	'commercial',
	'openingHoursSpecification',
] as const;

/**
 * Allowlist a client-supplied org update to the editable fields — so neither
 * write path forwards an arbitrary object to the privileged PATCH. Shared by the
 * Venues tab and the map edit panel.
 */
export function pickOrgPatch(patch: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k of EDITABLE_ORG_FIELDS) if (k in patch) out[k] = patch[k];
	return out;
}
