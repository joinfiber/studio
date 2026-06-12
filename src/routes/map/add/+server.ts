import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createVenue, type OpeningHoursEntry } from '$lib/venues/create.js';
import type { GeocodedAddress } from '$lib/kernel/geocode.js';

/**
 * Add an OSM venue (gray dot) to the Commons — creates the org + place. The
 * dot turns yellow on success. Same-origin only (Origin-checked by SvelteKit).
 *
 * The body is client-supplied, so every field is rebuilt allowlist-style —
 * nothing the client sends is forwarded whole into the privileged write.
 */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME = /^\d{2}:\d{2}$/;

function str(v: unknown, max: number): string | undefined {
	if (typeof v !== 'string') return undefined;
	const s = v.trim();
	return s && s.length <= max ? s : undefined;
}

function strArray(v: unknown, maxItems: number, maxLen: number): string[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out = v.filter((x): x is string => typeof x === 'string' && x.length <= maxLen);
	return out.length ? out.slice(0, maxItems) : undefined;
}

/** Keep only the GeocodedAddress fields, as strings. */
function pickAddress(v: unknown): GeocodedAddress | undefined {
	if (typeof v !== 'object' || v === null) return undefined;
	const a = v as Record<string, unknown>;
	const out: GeocodedAddress = {
		streetAddress: str(a.streetAddress, 300),
		addressLocality: str(a.addressLocality, 120),
		addressRegion: str(a.addressRegion, 120),
		postalCode: str(a.postalCode, 20),
		addressCountry: str(a.addressCountry, 80) ?? '',
	};
	return out.streetAddress || out.addressLocality || out.addressCountry ? out : undefined;
}

/** Keep only schema.org OpeningHoursSpecification fields, validated. */
function pickHours(v: unknown): OpeningHoursEntry[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out: OpeningHoursEntry[] = [];
	for (const raw of v.slice(0, 60)) {
		if (typeof raw !== 'object' || raw === null) continue;
		const e = raw as Record<string, unknown>;
		const entry: OpeningHoursEntry = {};
		if (typeof e.dayOfWeek === 'string' && DAYS.includes(e.dayOfWeek)) {
			entry.dayOfWeek = e.dayOfWeek;
		} else if (Array.isArray(e.dayOfWeek)) {
			const days = e.dayOfWeek.filter(
				(d): d is (typeof DAYS)[number] => typeof d === 'string' && DAYS.includes(d),
			);
			if (days.length) entry.dayOfWeek = days as OpeningHoursEntry['dayOfWeek'];
		}
		if (typeof e.opens === 'string' && TIME.test(e.opens)) entry.opens = e.opens;
		if (typeof e.closes === 'string' && TIME.test(e.closes)) entry.closes = e.closes;
		if (entry.dayOfWeek || entry.opens || entry.closes) out.push(entry);
	}
	return out.length ? out : undefined;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { commons } = locals;
	if (!commons.configured || !commons.sdk) {
		return json({ error: 'Commons isn’t configured on this instance.' }, { status: 400 });
	}

	let body: { venue?: Record<string, unknown> };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}
	const v = body.venue;
	const name = str(v?.name, 200);
	const lat = typeof v?.lat === 'number' && Number.isFinite(v.lat) ? v.lat : null;
	const lng = typeof v?.lng === 'number' && Number.isFinite(v.lng) ? v.lng : null;
	if (!v || !name || lat === null || lng === null) {
		return json({ error: 'Invalid venue.' }, { status: 400 });
	}

	const tags =
		strArray(v.tags, 25, 60) ?? (str(v.category, 60) ? [str(v.category, 60)!] : undefined);

	const result = await createVenue(commons.sdk, {
		name,
		lat,
		lng,
		address: pickAddress(v.address),
		website: str(v.website, 2000),
		phone: str(v.phone, 50),
		sameAs: strArray(v.sameAs, 25, 2000),
		tags,
		openingHours: pickHours(v.openingHours),
		osmType: str(v.osmType, 20),
		osmId: typeof v.osmId === 'number' && Number.isFinite(v.osmId) ? v.osmId : undefined,
		method: 'proxied', // relayed from OpenStreetMap, a public source
	});
	if (result.error) return json({ error: result.error }, { status: 400 });
	return json({ orgId: result.orgId });
};
