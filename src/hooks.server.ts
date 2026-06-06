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
import { env } from '$env/dynamic/private';
import { createCommonsClient, type CommonsClient } from '$lib/kernel/commons-client';
import { isAdminInstance } from '$lib/kernel/auth';
import { gateEnabled, verifyToken, isLoopback, COOKIE_NAME } from '$lib/kernel/session';

let commonsClient: CommonsClient | null = null;
let isAdminFlag: boolean | null = null;

const UNCONFIGURED =
	'Studio is not configured for public access. Set STUDIO_PASSWORD to enable the access ' +
	'gate (or STUDIO_ALLOW_OPEN=true to intentionally run open). Refusing to serve an open ' +
	'admin surface on a public host.';

export const handle: Handle = async ({ event, resolve }) => {
	if (commonsClient === null) commonsClient = createCommonsClient();
	if (isAdminFlag === null) isAdminFlag = isAdminInstance();
	event.locals.commons = commonsClient;
	event.locals.isAdmin = isAdminFlag;

	const path = event.url.pathname;
	const isAsset = path.startsWith('/_app/') || path.startsWith('/favicon');

	if (gateEnabled()) {
		if (!isAsset) {
			const authed = verifyToken(event.cookies.get(COOKIE_NAME));
			event.locals.authed = authed;
			if (!authed && path !== '/login') {
				throw redirect(303, '/login');
			}
			if (authed && path === '/login') {
				throw redirect(303, '/');
			}
		} else {
			event.locals.authed = false; // asset under gate; value unused
		}
	} else {
		// No password configured. Open only for local dev (loopback host) or an
		// explicit opt-in; otherwise fail CLOSED rather than serve an open
		// privileged surface to the internet.
		const openOk = isLoopback(event.url.hostname) || env.STUDIO_ALLOW_OPEN === 'true';
		if (!openOk && !isAsset) {
			return new Response(UNCONFIGURED, { status: 503, headers: { 'content-type': 'text/plain' } });
		}
		event.locals.authed = true;
	}

	return resolve(event);
};
