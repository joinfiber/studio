import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { EventCandidate } from '$lib/kernel/candidate.js';
import { assertSafeUrl } from '$lib/kernel/tool.js';
import { parseCsv } from '$lib/tools/sheets/csv.js';
import { normalizeSheetUrl } from '$lib/tools/sheets/produce.js';
import { publishBatch } from '$lib/kernel/publish.js';

export const actions: Actions = {
	fetch: async ({ request }) => {
		const data = await request.formData();
		const rawUrl = String(data.get('url') ?? '').trim();
		if (!rawUrl) return fail(400, { error: 'Paste a Google Sheets or CSV URL.' });

		let url: string;
		try {
			assertSafeUrl(rawUrl);
			url = normalizeSheetUrl(rawUrl);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Invalid URL.' });
		}

		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
			if (!res.ok) {
				return fail(400, {
					error: `Fetch failed: ${res.status}. Is the sheet published / link-shared?`,
				});
			}
			const text = await res.text();
			if (/^\s*<(?:!doctype|html)/i.test(text)) {
				return fail(400, {
					error:
						"That returned a web page, not CSV — the sheet probably isn't shared. In the sheet: Share → General access → \"Anyone with the link\" (Viewer), then paste the link again.",
				});
			}
			const { headers, rows } = parseCsv(text);
			if (headers.length === 0 || rows.length === 0) {
				return fail(400, { error: 'No rows found. Check the sheet is published as CSV.' });
			}
			return { headers, rows, sourceUrl: url };
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Could not read that sheet.',
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
