/**
 * Google Places (New) details fetch — REFERENCE DISPLAY ONLY.
 *
 * This powers the map curation panel's "compare with Google" column: the
 * operator sees Google's name/address/phone/website/hours next to OSM's, decides
 * the truth, and types/confirms it. The returned data is shown ephemerally and
 * MUST NOT be persisted — the only Google field Studio ever stores is the
 * `place_id` (see google-places.ts). What lands in the Commons is the operator's
 * own curated assertion (from OSM, openly licensed, plus their edits).
 *
 * Bring-your-own key (GOOGLE_PLACES_API_KEY). Server-only.
 */

import { env } from '$env/dynamic/private';
import type { GooglePeriod } from './hours.js';

export interface GoogleDetails {
	placeId: string;
	name: string | null;
	address: string | null;
	phone: string | null;
	website: string | null;
	/** Human-readable weekday lines, e.g. "Monday: 9:00 AM – 5:00 PM". */
	hoursText: string[];
	/** Structured periods for the hours editor (Sunday-indexed). */
	hoursPeriods: GooglePeriod[];
	googleMapsUri: string | null;
}

interface SearchTextResponse {
	places?: Array<{
		id?: string;
		displayName?: { text?: string };
		formattedAddress?: string;
		nationalPhoneNumber?: string;
		internationalPhoneNumber?: string;
		websiteUri?: string;
		googleMapsUri?: string;
		regularOpeningHours?: { periods?: GooglePeriod[]; weekdayDescriptions?: string[] };
	}>;
}

// Everything we display. None of it is stored — see the file header.
const FIELD_MASK = [
	'places.id',
	'places.displayName',
	'places.formattedAddress',
	'places.nationalPhoneNumber',
	'places.internationalPhoneNumber',
	'places.websiteUri',
	'places.googleMapsUri',
	'places.regularOpeningHours',
].join(',');

/**
 * Resolve Google's best match for a venue query, biased to its coordinates.
 * Returns null on no key, no match, or any error — the panel degrades to
 * OSM-only and the operator can still curate by hand.
 */
export async function fetchGoogleDetails(
	query: string,
	bias?: { lat: number; lng: number },
): Promise<GoogleDetails | null> {
	const key = env.GOOGLE_PLACES_API_KEY;
	if (!key || !query.trim()) return null;

	const body: Record<string, unknown> = { textQuery: query.trim(), maxResultCount: 1 };
	if (bias) {
		body.locationBias = {
			circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 400 },
		};
	}

	try {
		const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': key,
				'X-Goog-FieldMask': FIELD_MASK,
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(15000),
		});
		if (!res.ok) {
			console.warn(`[google-details] lookup returned ${res.status}`);
			return null;
		}
		const data = (await res.json()) as SearchTextResponse;
		const p = data.places?.[0];
		if (!p?.id) return null;
		return {
			placeId: p.id,
			name: p.displayName?.text ?? null,
			address: p.formattedAddress ?? null,
			phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
			website: p.websiteUri ?? null,
			hoursText: p.regularOpeningHours?.weekdayDescriptions ?? [],
			hoursPeriods: p.regularOpeningHours?.periods ?? [],
			googleMapsUri: p.googleMapsUri ?? null,
		};
	} catch (err) {
		console.warn('[google-details] lookup failed:', err);
		return null;
	}
}
