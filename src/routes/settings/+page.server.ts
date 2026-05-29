import type { PageServerLoad } from './$types';
import type { ContributorProfile } from 'neighborhood-commons';
import { fixtureConsumers } from '$lib/instance/analytics.js';
import { getCapabilities } from '$lib/kernel/capabilities.js';

export const load: PageServerLoad = async ({ locals }) => {
	let profile: ContributorProfile | null = null;
	let profileError: string | null = null;

	const { commons } = locals;

	if (commons.configured && commons.sdk && commons.contributorSlug) {
		const result = await commons.sdk.GET('/contributors/{idOrSlug}', {
			params: { path: { idOrSlug: commons.contributorSlug } },
		});
		if (result.data) {
			profile = result.data.contributor;
		} else {
			profileError =
				result.error?.error?.message ??
				`Commons returned ${result.response.status} fetching the contributor profile.`;
		}
	}

	return {
		isAdmin: locals.isAdmin,
		commonsBaseUrl: commons.baseUrl,
		commonsConfigured: commons.configured,
		contributorSlug: commons.contributorSlug,
		profile,
		profileError,
		consumers: fixtureConsumers,
		capabilities: getCapabilities(),
	};
};
