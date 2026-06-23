import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Organization, components } from 'neighborhood-commons';
import {
	mapOrganization,
	pickOrgPatch,
	NOT_LINKED_EDIT,
	type LiveOrg,
} from '$lib/instance/organizations.js';
import { geocode } from '$lib/kernel/geocode.js';

type OrgInput = components['schemas']['OrganizationInput'];

type VerifiedFilter = 'all' | 'verified';
type OwnerFilter = 'all' | 'mine';
const PAGE_SIZE = 60;
const DEFAULT_RADIUS_KM = 5;
const MAX_RADIUS_KM = 100;

/** Clamp a querystring radius to a sane range (defaults on junk input). */
function clampRadius(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return DEFAULT_RADIUS_KM;
	return Math.min(Math.round(n), MAX_RADIUS_KM);
}

export interface OrgListQueryInput {
	search: string;
	verified: VerifiedFilter;
	owner: OwnerFilter;
	contributorSlug: string | null;
	offset: number;
	/** Resolved "lat,lng" when a proximity filter is active (already geocoded). */
	near?: string;
	radiusKm?: number;
}

/**
 * Assemble the `GET /organizations` query from the page's filters. Pure (no
 * network) so it's unit-testable; geocoding the `near` address stays in `load`.
 * The Commons has no city filter — proximity (`near`+`radius_km`) is the
 * server-side location filter, so it's complete instead of page-scoped.
 */
export function _buildOrgListQuery(input: OrgListQueryInput): {
	limit: number;
	offset: number;
	q?: string;
	verified?: boolean;
	created_by_contributor?: string;
	near?: string;
	radius_km?: number;
} {
	const query = { limit: PAGE_SIZE, offset: input.offset } as ReturnType<typeof _buildOrgListQuery>;
	if (input.search) query.q = input.search;
	if (input.verified === 'verified') query.verified = true;
	if (input.owner === 'mine' && input.contributorSlug) {
		query.created_by_contributor = input.contributorSlug;
	}
	if (input.near) {
		query.near = input.near;
		query.radius_km = input.radiusKm ?? DEFAULT_RADIUS_KM;
	}
	return query;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { commons } = locals;

	const search = (url.searchParams.get('q') ?? '').trim();
	const verified: VerifiedFilter =
		url.searchParams.get('verified') === 'verified' ? 'verified' : 'all';
	const owner: OwnerFilter = url.searchParams.get('owner') === 'mine' ? 'mine' : 'all';
	const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0));
	const nearAddress = (url.searchParams.get('near') ?? '').trim();
	const radiusKm = clampRadius(url.searchParams.get('radius'));
	const contributorSlug = commons.contributorSlug ?? null;

	// `filters` echoes the *requested* values so the UI can seed its inputs.
	const filters = {
		search,
		verified,
		owner,
		offset,
		near: nearAddress,
		radius: radiusKm,
		pageSize: PAGE_SIZE,
	};

	if (!commons.configured || !commons.sdk) {
		return { live: false as const, filters, contributorSlug };
	}

	// Resolve the proximity filter server-side: geocode the typed address to
	// coordinates the Commons can filter the whole dataset by.
	let nearCoords: string | undefined;
	let nearResolved: { displayName: string; lat: number; lng: number } | null = null;
	let geocodeError: string | null = null;
	if (nearAddress) {
		const geo = await geocode(nearAddress).catch(() => null);
		if (geo) {
			nearCoords = `${geo.lat},${geo.lng}`;
			nearResolved = { displayName: geo.displayName, lat: geo.lat, lng: geo.lng };
		} else {
			geocodeError = `Couldn’t locate “${nearAddress}”. Try a more specific place name.`;
		}
	}

	const query = _buildOrgListQuery({
		search,
		verified,
		owner,
		contributorSlug,
		offset,
		near: nearCoords,
		radiusKm,
	});

	const result = await commons.sdk.GET('/organizations', { params: { query } });

	if (!result.data) {
		return {
			live: true as const,
			filters,
			contributorSlug,
			orgs: [] as LiveOrg[],
			total: 0,
			nearResolved,
			geocodeError,
			error:
				result.error?.error?.message ??
				`Commons returned ${result.response.status} listing organizations.`,
		};
	}

	const raw = (result.data.organizations ?? []) as Organization[];
	const total = (result.data.meta as { total?: number } | undefined)?.total ?? raw.length;
	return {
		live: true as const,
		filters,
		contributorSlug,
		orgs: raw.map(mapOrganization),
		total,
		nearResolved,
		geocodeError,
		error: null as string | null,
	};
};

export const actions: Actions = {
	// Edit an organization. PATCH /service/organizations/{id} is a partial merge,
	// so we send only the fields the operator changed — omitted fields are
	// preserved. `method` is not writable (the Commons sets it); only an org's
	// owner key (or an admin key) may edit it, else 403.
	update: async ({ request, locals }) => {
		const { commons } = locals;
		if (!commons.configured || !commons.sdk) {
			return fail(400, { error: 'Commons isn’t configured on this instance.' });
		}
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		if (!id) return fail(400, { error: 'Missing organization id.' });

		let patch: Partial<OrgInput>;
		try {
			patch = JSON.parse(String(data.get('patch') ?? '{}')) as Partial<OrgInput>;
		} catch {
			return fail(400, { error: 'Could not read the changes.' });
		}
		const body = pickOrgPatch(patch as Record<string, unknown>);
		if (Object.keys(body).length === 0) return { ok: true, id, noop: true as const };

		const result = await commons.sdk.PATCH('/service/organizations/{id}', {
			params: { path: { id } },
			body: body as OrgInput,
		});

		if (result.error) {
			const status = result.response.status;
			if (status === 403) {
				return fail(403, { error: NOT_LINKED_EDIT });
			}
			return fail(status, { error: result.error?.error?.message ?? `Commons returned ${status}.` });
		}
		return { ok: true, id };
	},
};
