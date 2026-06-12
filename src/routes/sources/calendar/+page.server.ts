import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { produceFromIcal } from '$lib/tools/calendar/produce.js';
import { publishSourceAction } from '$lib/kernel/publish-action.js';

export const actions: Actions = {
	fetch: async ({ request }) => {
		const data = await request.formData();
		const url = String(data.get('url') ?? '').trim();
		const defaultTimezone = String(data.get('timezone') ?? 'America/New_York').trim();

		if (!url) {
			return fail(400, { error: 'Paste a calendar URL.' });
		}

		try {
			const candidates = await produceFromIcal({ url, defaultTimezone });
			return { candidates, sourceUrl: url };
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Could not import that calendar.',
			});
		}
	},

	publish: publishSourceAction,
};
