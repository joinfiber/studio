import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { EventCandidate } from '$lib/kernel/candidate.js';
import { produceFromFeed } from '$lib/tools/rss/produce.js';
import { publishBatch } from '$lib/kernel/publish.js';

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
