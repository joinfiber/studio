import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveCandidates } from '$lib/kernel/db.js';
import { parseEventCandidates } from '$lib/kernel/candidate-parse.js';

/**
 * Save imported candidates to the persistent review queue. Called by the
 * Sources import flows ("Save to queue") so tidied-but-unpublished candidates
 * survive navigation/restart. Same-origin only (Origin-checked by SvelteKit).
 *
 * The body is client-supplied: candidates are runtime-validated and rebuilt
 * allowlist-style (and the array is bounded) before touching the store.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { candidates?: unknown; organizer?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body.' }, { status: 400 });
	}

	let candidates;
	try {
		candidates = parseEventCandidates(body.candidates);
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Invalid candidates.' },
			{ status: 400 },
		);
	}
	const organizer = typeof body.organizer === 'string' ? body.organizer : undefined;

	try {
		const saved = await saveCandidates(candidates, organizer);
		return json({ saved });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Save failed.' }, { status: 500 });
	}
};
