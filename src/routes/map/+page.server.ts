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
const PAGE_POOL = 5; // concurrent org-list pages (don't stampede the Commons)

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
	let truncated = false;
	const collect = (orgs: Organization[]) => {
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
	};

	try {
		// Page 0 tells us the total; fetch the rest concurrently instead of
		// ~30 sequential round-trips blocking first paint.
		const first = await commons.sdk.GET('/organizations', {
			params: { query: { limit: CHUNK, offset: 0 } },
		});
		const firstOrgs = (first.data?.organizations ?? []) as Organization[];
		collect(firstOrgs);
		const total = first.data?.meta?.total ?? firstOrgs.length;

		const offsets: number[] = [];
		for (let off = CHUNK; off < total && off < MAX_OFFSET; off += CHUNK) offsets.push(off);
		if (total > MAX_OFFSET) truncated = true;

		if (firstOrgs.length === CHUNK && offsets.length > 0) {
			let next = 0;
			const worker = async () => {
				while (next < offsets.length && points.length < MAX_POINTS) {
					const off = offsets[next++];
					const r = await commons.sdk!.GET('/organizations', {
						params: { query: { limit: CHUNK, offset: off } },
					});
					collect((r.data?.organizations ?? []) as Organization[]);
				}
			};
			await Promise.all(Array.from({ length: Math.min(PAGE_POOL, offsets.length) }, worker));
		}

		if (points.length > MAX_POINTS) {
			points.length = MAX_POINTS;
			truncated = true;
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
