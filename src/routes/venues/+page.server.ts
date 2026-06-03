import type { PageServerLoad } from './$types';
import type { Organization } from 'neighborhood-commons';
import { mapOrganization, type LiveOrg } from '$lib/instance/organizations.js';

type VerifiedFilter = 'all' | 'verified';
type OwnerFilter = 'all' | 'mine';
const PAGE_SIZE = 60;

export const load: PageServerLoad = async ({ locals, url }) => {
	const { commons } = locals;

	const search = (url.searchParams.get('q') ?? '').trim();
	const verified: VerifiedFilter = url.searchParams.get('verified') === 'verified' ? 'verified' : 'all';
	const owner: OwnerFilter = url.searchParams.get('owner') === 'mine' ? 'mine' : 'all';
	const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0));
	const contributorSlug = commons.contributorSlug ?? null;

	const filters = { search, verified, owner, offset, pageSize: PAGE_SIZE };

	if (!commons.configured || !commons.sdk) {
		return { live: false as const, filters, contributorSlug };
	}

	// Public org read: all published orgs, searchable. verified/created_by_contributor
	// are server-side; finer facets (city, has-location) are applied client-side.
	const query: {
		limit: number;
		offset: number;
		q?: string;
		verified?: boolean;
		created_by_contributor?: string;
	} = { limit: PAGE_SIZE, offset };
	if (search) query.q = search;
	if (verified === 'verified') query.verified = true;
	if (owner === 'mine' && contributorSlug) query.created_by_contributor = contributorSlug;

	const result = await commons.sdk.GET('/organizations', { params: { query } });

	if (!result.data) {
		return {
			live: true as const,
			filters,
			contributorSlug,
			orgs: [] as LiveOrg[],
			total: 0,
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
		error: null as string | null,
	};
};
