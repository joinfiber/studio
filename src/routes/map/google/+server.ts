import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchGoogleDetails } from '$lib/kernel/google-details.js';
import { googlePlacesConfigured } from '$lib/kernel/google-places.js';

/**
 * Reference lookup for the curation panel: Google's data for a venue, shown
 * next to OSM's. Display-only — nothing here is stored (see google-details.ts).
 * Same-origin only (Origin-checked by SvelteKit).
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!googlePlacesConfigured()) {
		return json({ error: 'Google Places isn’t configured on this instance.' }, { status: 400 });
	}

	let body: { name?: string; lat?: number; lng?: number };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}
	const name = body.name?.trim();
	if (!name) return json({ error: 'Missing venue name.' }, { status: 400 });

	const bias =
		Number.isFinite(body.lat) && Number.isFinite(body.lng)
			? { lat: body.lat as number, lng: body.lng as number }
			: undefined;

	const details = await fetchGoogleDetails(name, bias);
	if (!details) return json({ details: null }); // no match — panel stays OSM-only
	return json({ details });
};
