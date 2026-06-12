import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getCapability, capabilityReady } from '$lib/kernel/capabilities.js';
import { scrapeAndExtract } from '$lib/tools/scrape/produce.js';
import { publishSourceAction } from '$lib/kernel/publish-action.js';

export const load: PageServerLoad = () => {
	return { capability: getCapability('llm') };
};

export const actions: Actions = {
	scrape: async ({ request }) => {
		if (!capabilityReady('llm')) {
			return fail(400, { error: 'LLM extraction isn’t configured (set INFERENCE_API_KEY).' });
		}
		const data = await request.formData();
		const url = String(data.get('url') ?? '').trim();
		const timezone = String(data.get('timezone') ?? 'America/New_York').trim();
		if (!url) return fail(400, { error: 'Paste a page URL to scrape.' });

		try {
			const candidates = await scrapeAndExtract(url, timezone);
			if (candidates.length === 0) {
				return fail(400, { error: 'No events with a clear date were found on that page.' });
			}
			return { candidates };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Scrape failed.' });
		}
	},

	publish: publishSourceAction,
};
