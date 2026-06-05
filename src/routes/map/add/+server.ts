import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createVenue } from '$lib/kernel/venues.js';
import type { VenueCandidate } from '$lib/tools/venues/overpass.js';

/**
 * Add an OSM venue (gray dot) to the Commons — creates the org + place. The
 * dot turns yellow on success. Same-origin only (Origin-checked by SvelteKit).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { commons } = locals;
	if (!commons.configured || !commons.sdk) {
		return json({ error: 'Commons isn’t configured on this instance.' }, { status: 400 });
	}

	let body: { venue?: Partial<VenueCandidate> & { openingHours?: unknown[] } };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}
	const v = body.venue;
	if (!v?.name || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) {
		return json({ error: 'Invalid venue.' }, { status: 400 });
	}

	const result = await createVenue(commons.sdk, {
		name: v.name,
		lat: v.lat as number,
		lng: v.lng as number,
		address: v.address,
		website: v.website,
		phone: v.phone,
		sameAs: v.sameAs,
		tags: v.category ? [v.category] : undefined,
		openingHours: v.openingHours,
		osmType: v.osmType,
		osmId: v.osmId,
		method: 'proxied', // relayed from OpenStreetMap, a public source
	});
	if (result.error) return json({ error: result.error }, { status: 400 });
	return json({ orgId: result.orgId });
};
