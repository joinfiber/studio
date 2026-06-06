import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Organization, components } from 'neighborhood-commons';
import { mapOrganization, type LiveOrg } from '$lib/instance/organizations.js';

type OrgInput = components['schemas']['OrganizationInput'];

type VerifiedFilter = 'all' | 'verified';
type OwnerFilter = 'all' | 'mine';
const PAGE_SIZE = 60;

export const load: PageServerLoad = async ({ locals, url }) => {
	const { commons } = locals;

	const search = (url.searchParams.get('q') ?? '').trim();
	const verified: VerifiedFilter =
		url.searchParams.get('verified') === 'verified' ? 'verified' : 'all';
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
		if (Object.keys(patch).length === 0) return { ok: true, id, noop: true as const };

		const result = await commons.sdk.PATCH('/service/organizations/{id}', {
			params: { path: { id } },
			body: patch as OrgInput,
		});

		if (result.error) {
			const status = result.response.status;
			if (status === 403) {
				return fail(403, {
					error: 'Not linked to this organization — only its owner (or an admin key) can edit it.',
				});
			}
			return fail(status, { error: result.error?.error?.message ?? `Commons returned ${status}.` });
		}
		return { ok: true, id };
	},
};
