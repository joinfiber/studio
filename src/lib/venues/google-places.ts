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
import { searchTextPlaces } from './google-search.js';

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
	// Field mask 'places.id' — the only field we want, and the only one Google's
	// terms permit storing indefinitely.
	const places = await searchTextPlaces<{ id?: string }>(query, bias, 'places.id', 'google-places');
	return places?.[0]?.id ?? null;
}
