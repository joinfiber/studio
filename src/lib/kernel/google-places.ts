/**
 * Google Place ID lookup — the stable cross-source identity for a venue.
 *
 * The place_id is the ONE Google Places datum the terms permit storing
 * indefinitely. We request ONLY `places.id` via field mask, so nothing else is
 * ever received — no name, address, hours, or rating to mishandle. Venue FACTS
 * (categories, address, hours) always come from OpenStreetMap, never Google.
 *
 * Bring-your-own key (GOOGLE_PLACES_API_KEY). Without it, places still publish
 * — they just dedup on geo/address instead of a shared id. Server-only.
 */

import { env } from '$env/dynamic/private';

/** Presence only — never the value. */
export function googlePlacesConfigured(): boolean {
	return !!env.GOOGLE_PLACES_API_KEY;
}

/**
 * Resolve a Google Place ID for a venue query, optionally biased to known
 * coordinates for accuracy. Best-effort: returns null on no key, no match, or
 * any error — a failed id lookup must never block the publish.
 */
export async function findGooglePlaceId(
	query: string,
	bias?: { lat: number; lng: number },
): Promise<string | null> {
	const key = env.GOOGLE_PLACES_API_KEY;
	if (!key || !query.trim()) return null;

	const body: Record<string, unknown> = { textQuery: query.trim(), maxResultCount: 1 };
	if (bias) {
		body.locationBias = {
			circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 500 },
		};
	}

	try {
		const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': key,
				// Field mask = the only field we want, and the only one we may store.
				'X-Goog-FieldMask': 'places.id',
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(15000),
		});
		if (!res.ok) {
			console.warn(`[google-places] place_id lookup returned ${res.status} (publishing without id)`);
			return null;
		}
		const data = (await res.json()) as { places?: { id?: string }[] };
		return data.places?.[0]?.id ?? null;
	} catch (err) {
		console.warn('[google-places] place_id lookup failed (publishing without id):', err);
		return null;
	}
}
