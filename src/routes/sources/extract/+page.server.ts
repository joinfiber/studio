import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { EventCandidate } from '$lib/kernel/candidate.js';
import { getCapability } from '$lib/kernel/capabilities.js';
import { extractEventsFromText } from '$lib/tools/extract/llm.js';
import { candidatesFromExtracted } from '$lib/tools/extract/produce.js';
import { publishBatch } from '$lib/kernel/publish.js';

export const load: PageServerLoad = () => {
	return { capability: getCapability('llm') };
};

export const actions: Actions = {
	extract: async ({ request }) => {
		if (!getCapability('llm')?.ready) {
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

	publish: async ({ request, locals }) => {
		const { commons } = locals;
		if (!commons.configured || !commons.sdk) {
			return fail(400, { error: 'Commons isn’t configured on this instance.' });
		}
		const data = await request.formData();
		const organizer = String(data.get('organizer') ?? '').trim();
		if (!organizer) return fail(400, { error: 'Name the organizer for these events first.' });

		let candidates: EventCandidate[];
		try {
			candidates = JSON.parse(String(data.get('candidates') ?? '[]')) as EventCandidate[];
		} catch {
			return fail(400, { error: 'Could not read the candidate payload.' });
		}
		if (candidates.length === 0) return fail(400, { error: 'Nothing to publish.' });

		try {
			const result = await publishBatch(commons.sdk, candidates, organizer);
			return { publishResult: { organizer, ...result } };
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Could not resolve the organizer.',
			});
		}
	},
};
