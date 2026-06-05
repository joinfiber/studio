import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setOrgReviewed } from '$lib/kernel/db.js';

/**
 * Toggle the operator-local "reviewed" overlay for a venue. Studio-local only —
 * never written to the Commons. Same-origin (Origin-checked by SvelteKit).
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { orgId?: string; reviewed?: boolean };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}
	if (!body.orgId) return json({ error: 'Missing orgId.' }, { status: 400 });
	await setOrgReviewed(body.orgId, body.reviewed !== false);
	return json({ ok: true });
};
