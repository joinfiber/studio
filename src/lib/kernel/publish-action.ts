/**
 * The shared `publish` form action behind every ingestion source route
 * (calendar, sheets, rss, extract, scrape). One implementation so the trust
 * boundary — parsing and validating the form's candidates JSON — can't
 * drift between sources, and a new source gets the validated path for free.
 */

import { fail, type RequestEvent } from '@sveltejs/kit';
import { publishBatch, type BatchResult } from './publish.js';
import { parseEventCandidatesJson } from './candidate-parse.js';
import type { EventCandidate } from './candidate.js';

export type PublishActionResult =
	| ReturnType<typeof fail<{ error: string }>>
	| { publishResult: { organizer: string } & BatchResult };

export async function publishSourceAction(event: RequestEvent): Promise<PublishActionResult> {
	const { commons } = event.locals;
	if (!commons.configured || !commons.sdk) {
		return fail(400, { error: 'Commons isn’t configured on this instance.' });
	}

	const data = await event.request.formData();
	const organizer = String(data.get('organizer') ?? '').trim();
	if (!organizer) return fail(400, { error: 'Name the organizer for these events first.' });

	let candidates: EventCandidate[];
	try {
		candidates = parseEventCandidatesJson(String(data.get('candidates') ?? '[]'));
	} catch (err) {
		return fail(400, {
			error: err instanceof Error ? err.message : 'Could not read the candidate payload.',
		});
	}

	try {
		const result = await publishBatch(commons.sdk, candidates, organizer);
		return { publishResult: { organizer, ...result } };
	} catch (err) {
		return fail(400, {
			error: err instanceof Error ? err.message : 'Could not resolve the organizer.',
		});
	}
}
