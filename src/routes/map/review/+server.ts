import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setOrgReviewed } from '$lib/kernel/db.js';

/**
 * Toggle the operator-local "reviewed" overlay for a venue. Studio-local only —
 * never written to the Commons. Same-origin only (Origin-checked by SvelteKit).
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { orgId?: string; reviewed?: boolean };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}
	if (!body.orgId) return json({ error: 'Missing orgId.' }, { status: 400 });
	try {
		await setOrgReviewed(body.orgId, body.reviewed !== false);
		return json({ ok: true });
	} catch (err) {
		// 500 (not 502) is deliberate: this is a local libsql write, not an
		// upstream Commons call, so a proxy/gateway status would mislead.
		return json(
			{ error: err instanceof Error ? err.message : 'Could not save review state.' },
			{ status: 500 },
		);
	}
};
