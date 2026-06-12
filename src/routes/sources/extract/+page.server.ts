import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getCapability, capabilityReady } from '$lib/kernel/capabilities.js';
import { extractEventsFromText } from '$lib/tools/extract/llm.js';
import { candidatesFromExtracted } from '$lib/tools/extract/produce.js';
import { publishSourceAction } from '$lib/kernel/publish-action.js';

export const load: PageServerLoad = () => {
	return { capability: getCapability('llm') };
};

export const actions: Actions = {
	extract: async ({ request }) => {
		if (!capabilityReady('llm')) {
			return fail(400, { error: 'LLM extraction isn’t configured (set INFERENCE_API_KEY).' });
		}
		const data = await request.formData();
		const text = String(data.get('text') ?? '').trim();
		const sourceUrl = String(data.get('sourceUrl') ?? '').trim() || null;
		const timezone = String(data.get('timezone') ?? 'America/New_York').trim();
		if (text.length < 20) {
			return fail(400, { error: 'Paste some text with events first.' });
		}

		try {
			const extracted = await extractEventsFromText(text);
			const candidates = candidatesFromExtracted(extracted, { sourceUrl, timezone });
			if (candidates.length === 0) {
				return fail(400, { error: 'No events with a clear date were found in that text.' });
			}
			return { candidates };
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Extraction failed.',
			});
		}
	},

	publish: publishSourceAction,
};
