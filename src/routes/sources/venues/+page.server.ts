import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Client } from 'openapi-fetch';
import type { paths } from 'neighborhood-commons';
import { geocodeArea } from '$lib/kernel/geocode.js';
import { queryVenues, CATEGORY_GROUPS, type VenueCandidate } from '$lib/tools/venues/overpass.js';
import { createVenue } from '$lib/kernel/venues.js';

type Sdk = Client<paths>;

const PUBLISH_CAP = 150; // hard bound on one publish run

export const load: PageServerLoad = ({ locals }) => ({
	configured: locals.commons.configured,
	groups: CATEGORY_GROUPS.map((g) => ({ id: g.id, label: g.label, hint: g.hint })),
	defaultGroups: ['music_nightlife', 'arts_culture', 'food_drink', 'community'],
});

// One create path for every venue (shared with the map's click-to-add): bounds,
// the osm:type/id external id, and method='proxied'. Bulk imports skip the
// per-venue Google lookup to avoid one billable call per venue.
async function createVenueOrg(
	sdk: Sdk,
	v: VenueCandidate,
): Promise<{ ok: boolean; error?: string }> {
	const r = await createVenue(sdk, {
		name: v.name,
		lat: v.lat,
		lng: v.lng,
		address: v.address,
		website: v.website,
		phone: v.phone,
		sameAs: v.sameAs,
		tags: v.category ? [v.category] : undefined,
		osmType: v.osmType,
		osmId: v.osmId,
		method: 'proxied',
		skipGoogleLookup: true,
	});
	return r.error ? { ok: false, error: r.error } : { ok: true };
}

async function publishVenues(sdk: Sdk, venues: VenueCandidate[]) {
	const failed: { name: string; error: string }[] = [];
	let published = 0;
	// Small concurrency: bound wall-time without hammering the Commons.
	for (let i = 0; i < venues.length; i += 5) {
		const chunk = venues.slice(i, i + 5);
		const results = await Promise.all(chunk.map((v) => createVenueOrg(sdk, v)));
		results.forEach((r, j) => {
			if (r.ok) published += 1;
			else failed.push({ name: chunk[j].name, error: r.error ?? 'failed' });
		});
	}
	return { published, failedCount: failed.length, failed: failed.slice(0, 15) };
}

export const actions: Actions = {
	find: async ({ request }) => {
		const data = await request.formData();
		const area = String(data.get('area') ?? '').trim();
		const groups = data.getAll('groups').map(String).filter(Boolean);
		if (!area) return fail(400, { error: 'Enter an area — a neighborhood, city, or ZIP.' });
		if (groups.length === 0) return fail(400, { error: 'Pick at least one category.' });

		try {
			const bbox = await geocodeArea(area);
			if (!bbox) {
				return fail(422, { error: `Couldn’t find “${area}”. Try a more specific area.` });
			}
			const { venues, truncated } = await queryVenues(bbox, groups, 120);
			return { venues, truncated, areaName: bbox.displayName };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Venue search failed.' });
		}
	},

	publish: async ({ request, locals }) => {
		const { commons } = locals;
		if (!commons.configured || !commons.sdk) {
			return fail(400, { error: 'Commons isn’t configured on this instance.' });
		}

		const data = await request.formData();
		let venues: VenueCandidate[];
		try {
			venues = JSON.parse(String(data.get('venues') ?? '[]')) as VenueCandidate[];
		} catch {
			return fail(400, { error: 'Could not read the selection.' });
		}
		if (venues.length === 0) return fail(400, { error: 'Nothing selected.' });

		const capped = venues.length > PUBLISH_CAP;
		const batch = capped ? venues.slice(0, PUBLISH_CAP) : venues;
		const result = await publishVenues(commons.sdk, batch);
		return { publishResult: { ...result, capped, cap: PUBLISH_CAP } };
	},
};
