import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryVenues, CATEGORY_GROUPS } from '$lib/venues/overpass.js';

/**
 * OSM businesses in the current map viewport (gray dots). Server-proxied so the
 * Overpass call (and User-Agent) stays server-side. Bounded: rejects too-large
 * boxes — the client only queries at sufficient zoom.
 */
const ALL_GROUPS = CATEGORY_GROUPS.map((g) => g.id);
const MAX_SPAN_DEG = 0.18; // ~20km; guards against city-wide queries

export const GET: RequestHandler = async ({ url }) => {
	const s = Number(url.searchParams.get('s'));
	const w = Number(url.searchParams.get('w'));
	const n = Number(url.searchParams.get('n'));
	const e = Number(url.searchParams.get('e'));
	if (![s, w, n, e].every(Number.isFinite)) {
		return json({ venues: [], error: 'Invalid bounds.' }, { status: 400 });
	}
	if (n - s > MAX_SPAN_DEG || e - w > MAX_SPAN_DEG) {
		return json({ venues: [], tooBig: true });
	}

	try {
		const { venues, truncated } = await queryVenues(
			{ south: s, west: w, north: n, east: e, displayName: '' },
			ALL_GROUPS,
			400,
		);
		return json({ venues, truncated });
	} catch (err) {
		return json(
			{ venues: [], error: err instanceof Error ? err.message : 'Overpass query failed.' },
			{ status: 502 },
		);
	}
};
