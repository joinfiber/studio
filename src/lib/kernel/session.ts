/**
 * Access gate — a single-password (+ optional TOTP) session for the
 * operator's deployment.
 *
 * Studio is the operator's power tool with (potentially admin-level) Commons
 * access. A public deployment must not be open to anyone with the URL.
 *
 * Model: one shared password (STUDIO_PASSWORD env). On correct entry the
 * server issues a signed, expiring cookie. The cookie is a stateless signed
 * token (HMAC-SHA256 over `expiry:level`) — no session store needed, can't
 * be forged without the signing key. With SESSION_SECRET set, sessions also
 * survive restarts; without it the key is a per-process random value and a
 * restart/redeploy signs everyone out.
 *
 * Two levels:
 * - 'password' — password verified, awaiting TOTP (short-lived). Only used
 *   between the two login steps when MFA is enabled.
 * - 'full'     — fully authenticated. The gate requires this.
 *
 * Gate behavior:
 * - STUDIO_PASSWORD set   → gate ON. All routes require a 'full' session.
 * - STUDIO_PASSWORD unset, request to localhost → gate OFF (local-dev
 *   convenience), with a loud one-time warning.
 * - STUDIO_PASSWORD unset, request to a non-local host → FAIL CLOSED (the hook
 *   returns 503 for every route), so a public deploy that forgot the password
 *   serves nothing instead of an open admin surface. An operator who genuinely
 *   wants an open instance opts in with STUDIO_ALLOW_OPEN=true.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export const COOKIE_NAME = 'studio_session';
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const PARTIAL_TTL_SECONDS = 5 * 60; // 5 min for the password→TOTP step

export type SessionLevel = 'password' | 'full';

let warnedOpen = false;

let runtimeSecret: string | null = null;

/**
 * HMAC key for session tokens: SESSION_SECRET, else a random per-process key.
 *
 * The login password is deliberately NOT a fallback — signing with it would
 * let anyone who knows (or brute-forces) the password mint a 'full' token
 * directly, silently bypassing TOTP. And an empty key would make tokens
 * forgeable by anyone. The cost of the ephemeral fallback is only that a
 * restart/redeploy signs the operator out.
 */
function secret(): string {
	if (env.SESSION_SECRET) return env.SESSION_SECRET;
	if (runtimeSecret === null) {
		runtimeSecret = randomBytes(32).toString('hex');
		if (env.STUDIO_PASSWORD) {
			console.warn(
				'[auth] SESSION_SECRET is not set — sessions are signed with a per-process ' +
					'random key and reset on every restart/redeploy. Set SESSION_SECRET to a ' +
					'distinct high-entropy value (e.g. `openssl rand -hex 32`) for stable sessions.',
			);
		}
	}
	return runtimeSecret;
}

export function gateEnabled(): boolean {
	const enabled = !!env.STUDIO_PASSWORD;
	if (!enabled && !warnedOpen) {
		console.warn(
			'[auth] STUDIO_PASSWORD is not set — the access gate is OFF and this ' +
				'instance is open to anyone who can reach it. Set STUDIO_PASSWORD on ' +
				'any public deployment.',
		);
		warnedOpen = true;
	}
	return enabled;
}

function constantTimeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function checkPassword(input: string): boolean {
	const expected = env.STUDIO_PASSWORD ?? '';
	if (!expected) return false;
	return constantTimeEqual(input, expected);
}

/** Issue a signed session token: base64(`expiryMs:level`).hexHmac */
export function issueToken(level: SessionLevel = 'full', ttlSeconds = MAX_AGE_SECONDS): string {
	const payload = `${Date.now() + ttlSeconds * 1000}:${level}`;
	const sig = createHmac('sha256', secret()).update(payload).digest('hex');
	return `${Buffer.from(payload).toString('base64')}.${sig}`;
}

/** Verify a token: signature valid, not expired, and level satisfies the
 *  requirement ('full' satisfies any; 'password' satisfies only 'password'). */
export function verifyToken(
	token: string | undefined,
	requiredLevel: SessionLevel = 'full',
): boolean {
	if (!token) return false;
	const dot = token.indexOf('.');
	if (dot < 1) return false;
	const b64 = token.slice(0, dot);
	const sig = token.slice(dot + 1);

	let payload: string;
	try {
		payload = Buffer.from(b64, 'base64').toString();
	} catch {
		return false;
	}

	const expected = createHmac('sha256', secret()).update(payload).digest('hex');
	if (!constantTimeEqual(sig, expected)) return false;

	const sep = payload.indexOf(':');
	if (sep < 1) return false;
	const expiry = Number(payload.slice(0, sep));
	const level = payload.slice(sep + 1) as SessionLevel;

	if (!Number.isFinite(expiry) || Date.now() >= expiry) return false;

	if (requiredLevel === 'full') return level === 'full';
	return level === 'password' || level === 'full';
}

/**
 * Loopback host → local dev. The only context where the gate may be off without
 * a password (besides an explicit STUDIO_ALLOW_OPEN opt-in). A forged Host of
 * "localhost" against a public deploy is the residual edge; the practical footgun
 * this guards is deploying to a real domain without setting STUDIO_PASSWORD.
 */
export function isLoopback(hostname: string): boolean {
	const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
	return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
}
