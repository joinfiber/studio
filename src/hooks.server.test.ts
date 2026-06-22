/**
 * Access-gate unit tests for hooks.server.ts.
 *
 * Exercises the six security-critical branches in the `handle` function:
 *
 *  1. Gate ON + no/invalid cookie + non-/login path → redirect(303, '/login')
 *  2. Gate ON + valid 'full' cookie + path '/login' → redirect(303, '/')
 *  3. Gate ON + valid 'full' cookie + normal path   → resolve called, authed true
 *  4. Gate OFF + non-loopback host + no ALLOW_OPEN  → 503 UNCONFIGURED
 *  5. Gate OFF + loopback host                      → resolve called, authed true
 *  6. Gate OFF + STUDIO_ALLOW_OPEN='true' + public host → resolve called, authed true
 *
 * The module under test reads env through the $env/dynamic/private alias that
 * vitest.config.ts maps to src/lib/test/env-stub.ts, so env is controllable.
 * createCommonsClient and isAdminInstance are mocked so the hook never touches
 * the real Commons SDK or live configuration.
 *
 * NOTE: hooks.server.ts uses module-level lazy-init vars (commonsClient,
 * isAdminFlag). Because vitest resets mocks but NOT module state between tests
 * in the same suite, we rely on those lazy vars being set on the first call and
 * staying inert for subsequent calls (they are only written once). This is safe
 * because the tests only exercise the gate logic, not the commons / admin paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { env, clearEnv } from '$lib/test/env-stub.js';

// Stub out commons-client and auth so the hook never needs real env keys.
vi.mock('$lib/kernel/commons-client.js', () => ({
	createCommonsClient: vi.fn(() => ({ _stub: true })),
}));
vi.mock('$lib/kernel/auth.js', () => ({
	isAdminInstance: vi.fn(() => false),
}));

// Import AFTER the mocks are registered.
import { handle } from './hooks.server.js';
import { issueToken } from '$lib/kernel/session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the minimal RequestEvent that `handle` inspects. The client address
 *  defaults to loopback (the genuine local-dev case). */
function makeEvent(
	pathname: string,
	hostname: string,
	cookieValue?: string,
	clientAddress = '127.0.0.1',
): Parameters<typeof handle>[0]['event'] {
	return {
		url: new URL(`http://${hostname}${pathname}`),
		cookies: {
			get: (_name: string) => cookieValue,
		},
		getClientAddress: () => clientAddress,
		locals: {},
		// The real RequestEvent has many more fields; handle only touches the above.
	} as unknown as Parameters<typeof handle>[0]['event'];
}

/** A resolve spy that returns a dummy 200. */
function makeResolve() {
	return vi.fn(async () => new Response('ok', { status: 200 }));
}

beforeEach(clearEnv);

// ---------------------------------------------------------------------------
// Gate ON (STUDIO_PASSWORD is set)
// ---------------------------------------------------------------------------

describe('gate ON', () => {
	beforeEach(() => {
		env.STUDIO_PASSWORD = 'test-password';
		env.SESSION_SECRET = 'test-secret';
	});

	it('unauthenticated request to a normal path redirects to /login', async () => {
		const event = makeEvent('/dashboard', 'example.com', undefined);
		const resolve = makeResolve();

		await expect(handle({ event, resolve })).rejects.toMatchObject({
			status: 303,
			location: '/login',
		});
		expect(resolve).not.toHaveBeenCalled();
	});

	it('invalid cookie on a normal path redirects to /login', async () => {
		const event = makeEvent('/dashboard', 'example.com', 'garbage-token');
		const resolve = makeResolve();

		await expect(handle({ event, resolve })).rejects.toMatchObject({
			status: 303,
			location: '/login',
		});
		expect(resolve).not.toHaveBeenCalled();
	});

	it('authenticated request to /login redirects to /', async () => {
		const token = issueToken('full');
		const event = makeEvent('/login', 'example.com', token);
		const resolve = makeResolve();

		await expect(handle({ event, resolve })).rejects.toMatchObject({
			status: 303,
			location: '/',
		});
		expect(resolve).not.toHaveBeenCalled();
	});

	it('authenticated request to a normal path calls resolve with authed=true', async () => {
		const token = issueToken('full');
		const event = makeEvent('/queue', 'example.com', token);
		const resolve = makeResolve();

		const response = await handle({ event, resolve });
		expect(resolve).toHaveBeenCalledOnce();
		expect(event.locals.authed).toBe(true);
		expect(response.status).toBe(200);
	});

	it('static assets bypass the gate logic (authed stays false for assets)', async () => {
		const event = makeEvent('/_app/chunks/main.js', 'example.com', undefined);
		const resolve = makeResolve();

		// No redirect thrown — assets are exempt from the gate.
		const response = await handle({ event, resolve });
		expect(resolve).toHaveBeenCalledOnce();
		expect(event.locals.authed).toBe(false);
		expect(response.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// Gate OFF (STUDIO_PASSWORD unset) — fail-closed posture
// ---------------------------------------------------------------------------

describe('gate OFF', () => {
	it('non-loopback host + no ALLOW_OPEN returns 503 UNCONFIGURED', async () => {
		const event = makeEvent('/dashboard', 'example.com', undefined);
		const resolve = makeResolve();

		const response = await handle({ event, resolve });
		expect(response.status).toBe(503);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('loopback host (localhost) calls resolve with authed=true', async () => {
		const event = makeEvent('/dashboard', 'localhost', undefined);
		const resolve = makeResolve();

		const response = await handle({ event, resolve });
		expect(resolve).toHaveBeenCalledOnce();
		expect(event.locals.authed).toBe(true);
		expect(response.status).toBe(200);
	});

	it('loopback IPv4 (127.0.0.1) calls resolve with authed=true', async () => {
		const event = makeEvent('/dashboard', '127.0.0.1', undefined);
		const resolve = makeResolve();

		const response = await handle({ event, resolve });
		expect(resolve).toHaveBeenCalledOnce();
		expect(event.locals.authed).toBe(true);
	});

	it('forged Host: localhost from a REMOTE client still returns 503', async () => {
		// The attack: a public, password-less deploy reached with a spoofed Host
		// header. The loopback host alone used to open the gate.
		const event = makeEvent('/dashboard', 'localhost', undefined, '203.0.113.7');
		const resolve = makeResolve();

		const response = await handle({ event, resolve });
		expect(response.status).toBe(503);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('loopback host with a non-loopback client (e.g. Docker bridge) fails closed', async () => {
		const event = makeEvent('/dashboard', 'localhost', undefined, '172.17.0.1');
		const resolve = makeResolve();
		const response = await handle({ event, resolve });
		expect(response.status).toBe(503);
	});

	it('accepts IPv4-mapped-IPv6 loopback client (::ffff:127.0.0.1)', async () => {
		const event = makeEvent('/dashboard', 'localhost', undefined, '::ffff:127.0.0.1');
		const resolve = makeResolve();
		const response = await handle({ event, resolve });
		expect(resolve).toHaveBeenCalledOnce();
		expect(response.status).toBe(200);
	});

	it('STUDIO_ALLOW_OPEN=true opens even a remote client on a public host', async () => {
		env.STUDIO_ALLOW_OPEN = 'true';
		const event = makeEvent('/dashboard', 'example.com', undefined, '203.0.113.7');
		const resolve = makeResolve();

		const response = await handle({ event, resolve });
		expect(resolve).toHaveBeenCalledOnce();
		expect(event.locals.authed).toBe(true);
		expect(response.status).toBe(200);
	});

	it('static assets on a non-loopback host are NOT blocked by the 503 guard', async () => {
		// Assets (/_app/*) skip the openOk check entirely; the resolve is called.
		const event = makeEvent('/_app/immutable/main.js', 'example.com', undefined);
		const resolve = makeResolve();

		const response = await handle({ event, resolve });
		expect(resolve).toHaveBeenCalledOnce();
		expect(response.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

describe('security headers', () => {
	it('every resolved response carries the baseline header set', async () => {
		env.STUDIO_ALLOW_OPEN = 'true';
		const event = makeEvent('/dashboard', 'example.com', undefined);

		const response = await handle({ event, resolve: makeResolve() });
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		// http request → no HSTS (don't poison local HTTP dev)
		expect(response.headers.get('Strict-Transport-Security')).toBeNull();
	});

	it('HSTS is set on https responses', async () => {
		env.STUDIO_PASSWORD = 'test-password';
		env.SESSION_SECRET = 'test-secret';
		const token = issueToken('full');
		const event = makeEvent('/queue', 'example.com', token);
		event.url = new URL('https://example.com/queue');

		const response = await handle({ event, resolve: makeResolve() });
		expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=');
	});

	it('the fail-closed 503 also carries the headers', async () => {
		const event = makeEvent('/dashboard', 'example.com', undefined);

		const response = await handle({ event, resolve: makeResolve() });
		expect(response.status).toBe(503);
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});
});
