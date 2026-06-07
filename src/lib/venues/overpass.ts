/**
 * Bulk venue discovery via the OpenStreetMap Overpass API.
 *
 * Overpass (NOT Nominatim) is the right tool for "every venue in this area":
 * one query by bounding box + tags returns all matching POIs with their tags.
 * We map each to a venue candidate — an Organization-at-a-Place — carrying the
 * openly-licensed facts OSM exposes (address, website, phone, socials).
 *
 * Good-citizen notes: one query per run (not per item), a descriptive
 * User-Agent, a generous timeout, and a hard result cap. The public endpoint
 * has its own load limits; a heavy operator should self-host or set
 * OVERPASS_API_URL. Server-only.
 */

import { env } from '$env/dynamic/private';
import { contactFromOsmTags, type GeocodedAddress, type AreaBBox } from '$lib/kernel/geocode.js';
import { commonsUserAgent } from '$lib/kernel/commons-client.js';

const DEFAULT_OVERPASS = 'https://overpass-api.de/api/interpreter';

/** A tag filter: value matches `regex`, or (no regex) the key just exists. */
interface TagFilter {
	key: string;
	regex?: string;
}

export interface CategoryGroup {
	id: string;
	label: string;
	hint: string;
	filters: TagFilter[];
}

/** Selectable venue categories. Event-likely groups default on; retail is broad. */
export const CATEGORY_GROUPS: CategoryGroup[] = [
	{
		id: 'music_nightlife',
		label: 'Music & nightlife',
		hint: 'bars, pubs, clubs, music venues',
		filters: [{ key: 'amenity', regex: 'bar|pub|nightclub|music_venue|biergarten' }],
	},
	{
		id: 'arts_culture',
		label: 'Arts & culture',
		hint: 'theaters, cinemas, galleries, museums',
		filters: [
			{ key: 'amenity', regex: 'theatre|cinema|arts_centre' },
			{ key: 'tourism', regex: 'museum|gallery' },
		],
	},
	{
		id: 'food_drink',
		label: 'Food & drink',
		hint: 'restaurants, cafes, food halls',
		filters: [{ key: 'amenity', regex: 'restaurant|cafe|fast_food|food_court|ice_cream' }],
	},
	{
		id: 'community',
		label: 'Community',
		hint: 'community centers, libraries, places of worship',
		filters: [
			{ key: 'amenity', regex: 'community_centre|library|social_centre|place_of_worship|townhall' },
		],
	},
	{
		id: 'outdoors',
		label: 'Outdoors & markets',
		hint: 'parks, gardens, marketplaces',
		filters: [
			{ key: 'leisure', regex: 'park|garden' },
			{ key: 'amenity', regex: 'marketplace' },
		],
	},
	{
		id: 'retail',
		label: 'Retail (broad)',
		hint: 'every shop — large; best for prospecting, not event-likely',
		filters: [{ key: 'shop' }],
	},
];

export interface VenueCandidate {
	name: string;
	lat: number;
	lng: number;
	address?: GeocodedAddress;
	website?: string;
	phone?: string;
	sameAs: string[];
	/** Raw OSM `opening_hours` tag, if present — parsed in the curation panel. */
	openingHoursRaw?: string;
	/** Descriptive OSM tag value (e.g. "bar", "cafe") → Organization tag. */
	category: string;
	osmType: string;
	osmId: number;
}

export interface OverpassElement {
	type: string;
	id: number;
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	tags?: Record<string, string>;
}

function buildQuery(bbox: AreaBBox, filters: TagFilter[], limit: number): string {
	const a = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
	const clauses: string[] = [];
	for (const f of filters) {
		const sel = f.regex ? `["${f.key}"~"^(${f.regex})$"]` : `["${f.key}"]`;
		for (const t of ['node', 'way', 'relation']) clauses.push(`  ${t}${sel}${a};`);
	}
	return `[out:json][timeout:90];\n(\n${clauses.join('\n')}\n);\nout center tags ${limit};`;
}

/** Resolve category group ids to a tag-filtered Overpass query. '' if none. */
export function buildVenueQuery(bbox: AreaBBox, groupIds: string[], limit: number): string {
	const filters = groupIds.flatMap((id) => CATEGORY_GROUPS.find((g) => g.id === id)?.filters ?? []);
	if (filters.length === 0) return '';
	return buildQuery(bbox, filters, limit);
}

function addressFromTags(t: Record<string, string>): GeocodedAddress | undefined {
	const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ').trim();
	const locality = t['addr:city'];
	const region = t['addr:state'];
	const postcode = t['addr:postcode'];
	if (!street && !locality && !region && !postcode) return undefined;
	const out: GeocodedAddress = {
		addressCountry: t['addr:country'] ? t['addr:country'].toUpperCase() : 'US',
	};
	if (street) out.streetAddress = street;
	if (locality) out.addressLocality = locality;
	if (region) out.addressRegion = region;
	if (postcode) out.postalCode = postcode;
	return out;
}

function categoryOf(t: Record<string, string>): string {
	return t.amenity || t.shop || t.leisure || t.tourism || 'venue';
}

export interface VenueQueryResult {
	venues: VenueCandidate[];
	truncated: boolean;
}

/** Map raw Overpass elements → venue candidates (pure). Skips unnamed and
 *  un-located POIs, dedups by element, caps at `limit`, flags `truncated`. */
export function mapOverpassElements(elements: OverpassElement[], limit: number): VenueQueryResult {
	const venues: VenueCandidate[] = [];
	const seen = new Set<string>();
	for (const el of elements) {
		const tags = el.tags;
		if (!tags?.name) continue; // unnamed POIs aren't useful venues
		const lat = el.lat ?? el.center?.lat;
		const lng = el.lon ?? el.center?.lon;
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		const dedupeKey = `${el.type}/${el.id}`;
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);

		const contact = contactFromOsmTags(tags);
		venues.push({
			name: tags.name,
			lat: lat as number,
			lng: lng as number,
			address: addressFromTags(tags),
			website: contact.website,
			phone: contact.phone,
			sameAs: contact.sameAs,
			openingHoursRaw: tags.opening_hours || undefined,
			category: categoryOf(tags),
			osmType: el.type,
			osmId: el.id,
		});
		if (venues.length >= limit) break;
	}
	return { venues, truncated: elements.length > limit };
}

/**
 * Query Overpass for venues in `bbox` across the selected category groups.
 * `limit` caps the candidates returned; `truncated` flags that more existed.
 */
export async function queryVenues(
	bbox: AreaBBox,
	groupIds: string[],
	limit = 120,
): Promise<VenueQueryResult> {
	const query = buildVenueQuery(bbox, groupIds, limit + 1); // +1 to detect truncation
	if (!query) return { venues: [], truncated: false };

	const base = env.OVERPASS_API_URL || DEFAULT_OVERPASS;

	const res = await fetch(base, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': commonsUserAgent(),
		},
		body: `data=${encodeURIComponent(query)}`,
		signal: AbortSignal.timeout(95000),
	});
	if (!res.ok) throw new Error(`Overpass returned ${res.status} ${res.statusText}.`);

	const json = (await res.json()) as { elements?: OverpassElement[] };
	return mapOverpassElements(json.elements ?? [], limit);
}
