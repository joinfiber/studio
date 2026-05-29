import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchPlaces, type PlaceCandidate } from '$lib/kernel/geocode.js';

/**
 * Typeahead for the Add flow. Server-proxied so the Commons key stays private.
 *
 * Both kinds return OSM candidates (a venue is an Organization at a Place, so
 * picking a real OSM venue feeds either). The `commons` list differs:
 * - kind=organization → existing Commons orgs (dedup awareness).
 * - kind=place        → existing Commons places (dedup awareness).
 *
 * OSM candidates carry geo + address + openly-licensed contact tags (website,
 * phone, socials) so a pick can autofill the venue's place AND its org links.
 */

function fmtAddr(
	a:
		| {
				streetAddress?: string | null;
				addressLocality?: string | null;
				addressRegion?: string | null;
		  }
		| null
		| undefined,
): string | null {
	if (!a) return null;
	const parts = [a.streetAddress, a.addressLocality, a.addressRegion].filter(Boolean);
	return parts.length ? parts.join(', ') : null;
}

function serializeOsm(c: PlaceCandidate) {
	return {
		name: c.name,
		displayName: c.displayName,
		lat: c.lat,
		lng: c.lng,
		osmType: c.osmType,
		osmId: c.osmId,
		addressJson: JSON.stringify(c.address ?? null),
		website: c.website ?? '',
		phone: c.phone ?? '',
		sameAsJson: JSON.stringify(c.sameAs ?? []),
	};
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const kind = url.searchParams.get('kind') ?? '';
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json({ commons: [], osm: [] });

	const sdk = locals.commons.configured ? locals.commons.sdk : null;

	let osm: ReturnType<typeof serializeOsm>[] = [];
	try {
		osm = (await searchPlaces(q, 5)).map(serializeOsm);
	} catch {
		osm = [];
	}

	if (kind === 'organization') {
		let commons: { id: string; name: string; slug: string }[] = [];
		if (sdk) {
			const r = await sdk.GET('/organizations', { params: { query: { q, limit: 6 } } });
			commons = (r.data?.organizations ?? []).map((o) => ({ id: o.id, name: o.name, slug: o.slug }));
		}
		return json({ commons, osm });
	}

	if (kind === 'place') {
		let commons: { id: string; name: string; address: string | null }[] = [];
		if (sdk) {
			const r = await sdk.GET('/places', { params: { query: { q, limit: 6 } } });
			commons = (r.data?.places ?? []).map((p) => ({
				id: p.id,
				name: p.name,
				address: fmtAddr(p.address),
			}));
		}
		return json({ commons, osm });
	}

	return json({ commons: [], osm: [] });
};
