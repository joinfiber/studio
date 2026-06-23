/**
 * Geocoding — turn a street address into coordinates (and a structured
 * address) so manual Place publishing can satisfy PlaceInput.geo.
 *
 * Out of the box this calls OpenStreetMap's public Nominatim directly from the
 * server — no key, nothing hosted by us. That endpoint is a courtesy service
 * with a strict usage policy (~1 req/s, must identify the app via User-Agent,
 * no bulk), which is fine for occasional manual entry. For volume, set
 * GEOCODER_API_URL to a self-hosted Nominatim or a Nominatim-compatible host
 * (and GEOCODER_API_KEY if it needs one). The request/response shape is the
 * Nominatim `/search` API; a different provider (Google/Mapbox) needs its own
 * adapter (see docs/extending.md).
 *
 * Server-only: it sets a User-Agent (forbidden in the browser, fine in Node).
 */

import { env } from '$env/dynamic/private';
import { commonsUserAgent } from '$lib/kernel/commons-client.js';

export interface GeocodedAddress {
	streetAddress?: string;
	addressLocality?: string;
	addressRegion?: string;
	postalCode?: string;
	addressCountry: string;
}

export interface GeocodeResult {
	lat: number;
	lng: number;
	address?: GeocodedAddress;
	displayName: string;
}

interface NominatimResult {
	lat: string;
	lon: string;
	display_name: string;
	name?: string;
	osm_type?: string;
	osm_id?: number;
	boundingbox?: string[]; // [south, north, west, east] as strings
	namedetails?: { name?: string };
	extratags?: Record<string, string>;
	address?: {
		house_number?: string;
		road?: string;
		city?: string;
		town?: string;
		village?: string;
		hamlet?: string;
		state?: string;
		postcode?: string;
		country_code?: string;
	};
}

const DEFAULT_BASE = 'https://nominatim.openstreetmap.org';

/**
 * One Nominatim /search call — base URL, optional key, the OSM-policy User-Agent,
 * and a timeout. Callers pass their query params and shape the results themselves.
 */
async function nominatimSearch(params: Record<string, string>): Promise<NominatimResult[]> {
	const base = (env.GEOCODER_API_URL || DEFAULT_BASE).replace(/\/$/, '');
	const url = new URL(`${base}/search`);
	url.searchParams.set('format', 'jsonv2');
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	if (env.GEOCODER_API_KEY) url.searchParams.set('key', env.GEOCODER_API_KEY);
	// OSM usage policy: identify the application. Settable server-side (Node).
	const res = await fetch(url, {
		headers: { 'User-Agent': commonsUserAgent(), Accept: 'application/json' },
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) throw new Error(`Geocoder returned ${res.status} ${res.statusText}.`);
	return ((await res.json()) as NominatimResult[]) ?? [];
}

/** Geocode a free-text address. Returns null when nothing matches. Throws on a transport/endpoint error. */
export async function geocode(query: string): Promise<GeocodeResult | null> {
	const q = query.trim();
	if (!q) return null;

	const results = await nominatimSearch({ q, limit: '1', addressdetails: '1' });
	const r = results[0];
	if (!r) return null;

	const lat = Number(r.lat);
	const lng = Number(r.lon);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

	return { lat, lng, address: toPostalAddress(r.address), displayName: r.display_name };
}

function toPostalAddress(a?: NominatimResult['address']): GeocodedAddress | undefined {
	if (!a) return undefined;
	const out: GeocodedAddress = {
		addressCountry: a.country_code ? a.country_code.toUpperCase() : 'US',
	};
	const street = [a.house_number, a.road].filter(Boolean).join(' ').trim();
	if (street) out.streetAddress = street;
	const locality = a.city || a.town || a.village || a.hamlet;
	if (locality) out.addressLocality = locality;
	if (a.state) out.addressRegion = a.state;
	if (a.postcode) out.postalCode = a.postcode;
	return out;
}

export interface PlaceCandidate {
	name: string;
	displayName: string;
	lat: number;
	lng: number;
	osmType: string;
	osmId: number;
	address?: GeocodedAddress;
	/** Openly-licensed contact tags from OSM, for enriching the venue's org. */
	website?: string;
	phone?: string;
	/** Social/identity URLs (Instagram, Facebook, X) → Organization.sameAs. */
	sameAs: string[];
}

/** A bare OSM handle/URL → a canonical profile URL for Organization.sameAs. */
function socialUrl(platform: 'instagram' | 'facebook' | 'twitter', value: string): string | null {
	const v = value.trim();
	if (!v) return null;
	if (/^https?:\/\//i.test(v)) return v;
	const handle = v.replace(/^@/, '');
	const host =
		platform === 'instagram' ? 'instagram.com' : platform === 'facebook' ? 'facebook.com' : 'x.com';
	return `https://${host}/${handle}`;
}

/** Pull the openly-licensed contact tags from an OSM tag map (extratags or
 *  raw element tags). Shared by Nominatim search and Overpass parsing. */
export function contactFromOsmTags(tags?: Record<string, string>): {
	website?: string;
	phone?: string;
	sameAs: string[];
} {
	const sameAs: string[] = [];
	if (!tags) return { sameAs };
	const website = tags.website || tags['contact:website'] || undefined;
	const phone = tags.phone || tags['contact:phone'] || undefined;
	for (const [platform, key] of [
		['instagram', 'contact:instagram'],
		['facebook', 'contact:facebook'],
		['twitter', 'contact:twitter'],
	] as const) {
		const raw = tags[key];
		if (raw) {
			const u = socialUrl(platform, raw);
			if (u) sameAs.push(u);
		}
	}
	return { website, phone, sameAs };
}

/**
 * Search OSM by name for venue candidates (multiple results) — the data behind
 * the Add → Place picker. Same endpoint/policy as `geocode`; returns the OSM
 * element id alongside each result, which `createVenue` commits as the place's
 * external dedup key (`osm:type/id` → `googlePlaceId`).
 */
export async function searchPlaces(query: string, limit = 5): Promise<PlaceCandidate[]> {
	const q = query.trim();
	if (!q) return [];

	const results = await nominatimSearch({
		q,
		limit: String(limit),
		addressdetails: '1',
		namedetails: '1',
		extratags: '1', // website / phone / socials
	});
	const out: PlaceCandidate[] = [];
	for (const r of results) {
		const lat = Number(r.lat);
		const lng = Number(r.lon);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		const contact = contactFromOsmTags(r.extratags);
		out.push({
			name: r.namedetails?.name || r.name || r.display_name.split(',')[0].trim(),
			displayName: r.display_name,
			lat,
			lng,
			osmType: r.osm_type ?? '',
			osmId: r.osm_id ?? 0,
			address: toPostalAddress(r.address),
			website: contact.website,
			phone: contact.phone,
			sameAs: contact.sameAs,
		});
	}
	return out;
}

export interface AreaBBox {
	south: number;
	west: number;
	north: number;
	east: number;
	displayName: string;
}

/**
 * Geocode an area name (neighborhood, city, ZIP) to a bounding box — the input
 * to a bulk Overpass venue query. Returns null when nothing matches.
 */
export async function geocodeArea(query: string): Promise<AreaBBox | null> {
	const q = query.trim();
	if (!q) return null;

	const results = await nominatimSearch({ q, limit: '1' });
	const r = results[0];
	const bb = r?.boundingbox;
	if (!bb || bb.length < 4) return null;
	const [south, north, west, east] = bb.map(Number);
	if ([south, north, west, east].some((n) => !Number.isFinite(n))) return null;
	return { south, west, north, east, displayName: r.display_name };
}
