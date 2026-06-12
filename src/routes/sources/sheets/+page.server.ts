import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { assertSafeUrl, safeFetch, readTextCapped } from '$lib/kernel/safe-fetch.js';
import { parseCsv } from '$lib/tools/sheets/csv.js';
import { normalizeSheetUrl } from '$lib/tools/sheets/produce.js';
import { publishSourceAction } from '$lib/kernel/publish-action.js';

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
			const res = await safeFetch(url, { signal: AbortSignal.timeout(20000) });
			if (!res.ok) {
				return fail(400, {
					error: `Fetch failed: ${res.status}. Is the sheet published / link-shared?`,
				});
			}
			const text = await readTextCapped(res);
			if (/^\s*<(?:!doctype|html)/i.test(text)) {
				return fail(400, {
					error:
						'That returned a web page, not CSV — the sheet probably isn\'t shared. In the sheet: Share → General access → "Anyone with the link" (Viewer), then paste the link again.',
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

	publish: publishSourceAction,
};
