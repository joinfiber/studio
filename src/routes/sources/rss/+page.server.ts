import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { produceFromFeed } from '$lib/tools/rss/produce.js';
import { publishSourceAction } from '$lib/kernel/publish-action.js';

export const actions: Actions = {
	fetch: async ({ request }) => {
		const data = await request.formData();
		const url = String(data.get('url') ?? '').trim();
		const timezone = String(data.get('timezone') ?? 'America/New_York').trim();
		if (!url) return fail(400, { error: 'Paste an RSS or Atom feed URL.' });

		try {
			const candidates = await produceFromFeed(url, timezone);
			return { candidates, sourceUrl: url };
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Could not read that feed.',
			});
		}
	},

	publish: publishSourceAction,
};
