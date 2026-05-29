/**
 * Server-side request hooks.
 *
 * Two jobs:
 * 1. Access gate — when STUDIO_PASSWORD is set, every route except /login
 *    (and static assets) requires a valid session cookie. See
 *    $lib/kernel/session.
 * 2. Wire the Commons client + admin-tier flag onto event.locals so route
 *    handlers share one configured client.
 *
 * Lazy-init so module load doesn't throw before env is configured — a
 * clone can `pnpm install && pnpm build` without any keys.
 */

import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { createCommonsClient, type CommonsClient } from '$lib/kernel/commons-client';
import { isAdminInstance } from '$lib/kernel/auth';
import { gateEnabled, verifyToken, COOKIE_NAME } from '$lib/kernel/session';

let commonsClient: CommonsClient | null = null;
let isAdminFlag: boolean | null = null;

export const handle: Handle = async ({ event, resolve }) => {
	if (commonsClient === null) commonsClient = createCommonsClient();
	if (isAdminFlag === null) isAdminFlag = isAdminInstance();
	event.locals.commons = commonsClient;
	event.locals.isAdmin = isAdminFlag;

	const path = event.url.pathname;
	const isAsset = path.startsWith('/_app/') || path.startsWith('/favicon');

	if (gateEnabled() && !isAsset) {
		const authed = verifyToken(event.cookies.get(COOKIE_NAME));
		event.locals.authed = authed;
		if (!authed && path !== '/login') {
			throw redirect(303, '/login');
		}
		if (authed && path === '/login') {
			throw redirect(303, '/');
		}
	} else {
		// Gate off (local dev) — treat as authed so UI doesn't show a stale
		// "sign out" affordance.
		event.locals.authed = true;
	}

	return resolve(event);
};
