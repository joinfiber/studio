import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import type { Organization } from 'neighborhood-commons';
import { getCapability } from '$lib/kernel/capabilities.js';
import { googlePlacesConfigured } from '$lib/venues/google-places.js';
import { listReviewedOrgIds, reviewWarning } from '$lib/kernel/db.js';

export interface OrgPoint {
	id: string;
	name: string;
	lat: number;
	lng: number;
	verified: boolean;
	method: string;
	/** Operator-local: has this venue been vetted in the cleanup pass. */
	reviewed: boolean;
}

const CHUNK = 200; // the Commons caps `limit` at 200 — 250 returns HTTP 400, zero orgs
const MAX_POINTS = 3000;
const MAX_OFFSET = 6000;

export const load: PageServerLoad = async ({ locals }) => {
	const { commons } = locals;
	const capability = getCapability('map');
	const googleReady = googlePlacesConfigured();
	const reviewedSet = new Set<string>(await listReviewedOrgIds().catch(() => []));
	const reviewWarn = reviewWarning(); // after init, so it reflects a failed file open
	const styleUrl = env.MAPTILER_API_KEY
		? `https://api.maptiler.com/maps/dataviz/style.json?key=${env.MAPTILER_API_KEY}`
		: null;

	if (!commons.configured || !commons.sdk) {
		return {
			live: false as const,
			mapReady: !!styleUrl,
			styleUrl,
			capability,
			googleReady,
			reviewWarning: reviewWarn,
			points: [] as OrgPoint[],
		};
	}

	const points: OrgPoint[] = [];
	let offset = 0;
	let truncated = false;
	try {
		// Page through the org list, collecting those with a geocoded primary place.
		while (points.length < MAX_POINTS && offset < MAX_OFFSET) {
			const r = await commons.sdk.GET('/organizations', {
				params: { query: { limit: CHUNK, offset } },
			});
			const orgs = (r.data?.organizations ?? []) as Organization[];
			for (const o of orgs) {
				const geo = o.location?.geo;
				if (geo && Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude)) {
					points.push({
						id: o.id,
						name: o.name,
						lat: geo.latitude,
						lng: geo.longitude,
						verified: o.verified ?? false,
						method: o.method,
						reviewed: reviewedSet.has(o.id),
					});
				}
			}
			if (orgs.length < CHUNK) break; // last page
			offset += CHUNK;
			if (points.length >= MAX_POINTS || offset >= MAX_OFFSET) truncated = true;
		}
	} catch (err) {
		return {
			live: true as const,
			mapReady: !!styleUrl,
			styleUrl,
			capability,
			googleReady,
			reviewWarning: reviewWarn,
			points,
			truncated,
			error: err instanceof Error ? err.message : 'Failed to load organizations.',
		};
	}

	return {
		live: true as const,
		mapReady: !!styleUrl,
		styleUrl,
		capability,
		googleReady,
		reviewWarning: reviewWarn,
		points,
		truncated,
		error: null as string | null,
	};
};
