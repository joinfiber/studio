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

/**
 * Baseline security headers on every response. Studio is an admin surface
 * with a privileged key behind it, so the defaults are deny-shaped:
 *
 * - X-Frame-Options + CSP frame-ancestors: no framing → no clickjacking the
 *   logged-in operator into privileged writes (belt & braces: older browsers
 *   honour X-Frame-Options, modern ones the CSP directive).
 * - X-Content-Type-Options: no MIME sniffing.
 * - Referrer-Policy: never leak the deployment URL to third parties.
 * - HSTS: https only, so local HTTP dev isn't poisoned.
 *
 * A full script-src CSP is deferred: maplibre-gl needs worker-src blob: (and
 * friends) mapped out first; frame-ancestors alone can't break anything.
 */
function applySecurityHeaders(headers: Headers, protocol: string): void {
	headers.set('X-Frame-Options', 'DENY');
	headers.set('Content-Security-Policy', "frame-ancestors 'none'");
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('Referrer-Policy', 'no-referrer');
	if (protocol === 'https:') {
		headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
	}
}

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
			const headers = new Headers({ 'content-type': 'text/plain' });
			applySecurityHeaders(headers, event.url.protocol);
			return new Response(UNCONFIGURED, { status: 503, headers });
		}
		event.locals.authed = true;
	}

	const response = await resolve(event);
	applySecurityHeaders(response.headers, event.url.protocol);
	return response;
};
