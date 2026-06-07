/**
 * Shared transport for the Google Places (New) searchText endpoint. Two callers
 * use it — google-places.ts (stores only the place_id) and google-details.ts
 * (shows a reference, never stored). This is just the request; each caller picks
 * its own field mask and shapes the result. Server-only (the key is sent in a
 * header). Best-effort: returns null on no key / no match / any error.
 */

import { env } from '$env/dynamic/private';

const LOCATION_BIAS_RADIUS = 500; // metres — "this venue near these coordinates"

export async function searchTextPlaces<T>(
	query: string,
	bias: { lat: number; lng: number } | undefined,
	fieldMask: string,
	logTag: string,
): Promise<T[] | null> {
	const key = env.GOOGLE_PLACES_API_KEY;
	if (!key || !query.trim()) return null;

	const body: Record<string, unknown> = { textQuery: query.trim(), maxResultCount: 1 };
	if (bias) {
		body.locationBias = {
			circle: {
				center: { latitude: bias.lat, longitude: bias.lng },
				radius: LOCATION_BIAS_RADIUS,
			},
		};
	}

	try {
		const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': key,
				'X-Goog-FieldMask': fieldMask,
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(15000),
		});
		if (!res.ok) {
			console.warn(`[${logTag}] searchText returned ${res.status}`);
			return null;
		}
		const data = (await res.json()) as { places?: T[] };
		return data.places ?? [];
	} catch (err) {
		console.warn(`[${logTag}] searchText failed:`, err);
		return null;
	}
}
