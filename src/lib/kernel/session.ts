/**
 * Access gate — a single-password (+ optional TOTP) session for the
 * operator's deployment.
 *
 * Studio is the operator's power tool with (potentially admin-level) Commons
 * access. A public deployment must not be open to anyone with the URL.
 *
 * Model: one shared password (STUDIO_PASSWORD env). On correct entry the
 * server issues a signed, expiring cookie. The cookie is a stateless signed
 * token (HMAC-SHA256 over `expiry:level`) — no session store needed,
 * survives restarts, can't be forged without the secret.
 *
 * Two levels:
 * - 'password' — password verified, awaiting TOTP (short-lived). Only used
 *   between the two login steps when MFA is enabled.
 * - 'full'     — fully authenticated. The gate requires this.
 *
 * Gate behavior:
 * - STUDIO_PASSWORD set   → gate ON. All routes require a 'full' session.
 * - STUDIO_PASSWORD unset → gate OFF (local-dev convenience on localhost),
 *   with a loud one-time warning so a misconfigured public deploy is obvious.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export const COOKIE_NAME = 'studio_session';
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const PARTIAL_TTL_SECONDS = 5 * 60; // 5 min for the password→TOTP step

export type SessionLevel = 'password' | 'full';

let warnedOpen = false;

function secret(): string {
	return env.SESSION_SECRET ?? env.STUDIO_PASSWORD ?? '';
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
