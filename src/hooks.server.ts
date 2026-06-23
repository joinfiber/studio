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
import {
	gateEnabled,
	verifyToken,
	isLoopback,
	isLoopbackAddress,
	COOKIE_NAME,
} from '$lib/kernel/session';

let commonsClient: CommonsClient | null = null;
let isAdminFlag: boolean | null = null;
let warnedProxyOrigin = false;

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
 * - Referrer-Policy: strict-origin-when-cross-origin — send only the origin
 *   (not the path) cross-origin, full URL same-origin, nothing on downgrade.
 *   NOT `no-referrer`: per the Fetch spec that serializes the `Origin` header
 *   as `null` on form POSTs, which breaks SvelteKit's same-origin CSRF check
 *   (login returns "Cross-site POST forbidden"). This policy also lets
 *   referrer-restricted keys (e.g. MapTiler) see the origin they gate on.
 * - HSTS: https only, so local HTTP dev isn't poisoned.
 *
 * A full script-src CSP is deferred: maplibre-gl needs worker-src blob: (and
 * friends) mapped out first; frame-ancestors alone can't break anything.
 */
function applySecurityHeaders(headers: Headers, protocol: string): void {
	headers.set('X-Frame-Options', 'DENY');
	headers.set('Content-Security-Policy', "frame-ancestors 'none'");
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	if (protocol === 'https:') {
		headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
	}
}

/**
 * A TLS proxy is forwarding https, but adapter-node computed an http origin —
 * so SvelteKit's CSRF check will reject the login POST ("Cross-site POST
 * forbidden"). Means PROTOCOL_HEADER / ORIGIN is unset. See docs/deploying.md.
 */
export function proxyOriginLikelyMisconfigured(
	forwardedProto: string | null,
	computedProtocol: string,
): boolean {
	return forwardedProto === 'https' && computedProtocol === 'http:';
}

export const handle: Handle = async ({ event, resolve }) => {
	if (commonsClient === null) commonsClient = createCommonsClient();
	if (isAdminFlag === null) isAdminFlag = isAdminInstance();
	event.locals.commons = commonsClient;
	event.locals.isAdmin = isAdminFlag;

	// One-time nudge: behind a TLS proxy that forwards https while we computed an
	// http origin, login POSTs will 403. Point operators at the fix before they
	// hit the cryptic CSRF error. (Railway is handled by railway.json already.)
	if (
		!warnedProxyOrigin &&
		proxyOriginLikelyMisconfigured(
			event.request.headers.get('x-forwarded-proto'),
			event.url.protocol,
		)
	) {
		warnedProxyOrigin = true;
		console.warn(
			'[origin] Requests arrive with x-forwarded-proto=https but this server computed an http ' +
				'origin — logins will fail with "Cross-site POST form submissions are forbidden". Set ' +
				'PROTOCOL_HEADER=x-forwarded-proto (or ORIGIN=https://your-domain). See docs/deploying.md.',
		);
	}

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
		// No password configured. Open only for local dev — which requires BOTH a
		// loopback Host AND a loopback client address, so a forged `Host: localhost`
		// from a remote client can't slip past the fail-closed guard — or an
		// explicit opt-in. Otherwise fail CLOSED rather than serve an open
		// privileged surface to the internet.
		let clientLoopback = false;
		try {
			clientLoopback = isLoopbackAddress(event.getClientAddress());
		} catch {
			clientLoopback = false; // address unavailable → treat as non-local
		}
		const openOk =
			(isLoopback(event.url.hostname) && clientLoopback) || env.STUDIO_ALLOW_OPEN === 'true';
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
