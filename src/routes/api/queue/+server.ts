import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveCandidates } from '$lib/kernel/db.js';
import type { EventCandidate } from '$lib/kernel/candidate.js';

/**
 * Save imported candidates to the persistent review queue. Called by the
 * Sources import flows ("Save to queue") so tidied-but-unpublished candidates
 * survive navigation/restart. Same-origin only (Origin-checked by SvelteKit).
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { candidates?: unknown; organizer?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body.' }, { status: 400 });
	}

	const candidates = Array.isArray(body.candidates) ? (body.candidates as EventCandidate[]) : [];
	const organizer = typeof body.organizer === 'string' ? body.organizer : undefined;
	if (candidates.length === 0) return json({ error: 'No candidates to save.' }, { status: 400 });

	try {
		const saved = await saveCandidates(candidates, organizer);
		return json({ saved });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Save failed.' }, { status: 500 });
	}
};
