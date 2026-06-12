/**
 * TOTP second factor (otplib, env-var secret).
 *
 * STUDIO_TOTP_SECRET holds the base32 seed. When set, login requires a
 * 6-digit code after the password. When unset, MFA is not enforced and the
 * operator is nudged to enroll (see /enroll) — enrollment generates a
 * secret server-side, shows it once, and instructs setting the env var.
 *
 * Persistence note: the secret lives in env (not a DB) so it survives
 * redeploys without a volume. The cost is that enrollment ends with a
 * "set env var + redeploy" step. Full in-app persistence would need a
 * persistent volume + DB.
 */

import { authenticator } from 'otplib';
import { env } from '$env/dynamic/private';

export function totpEnabled(): boolean {
	return !!env.STUDIO_TOTP_SECRET;
}

/**
 * Accepted codes are single-use: re-presenting the same code while it could
 * still be valid is rejected (RFC 6238 §5.2 — blocks replay of a shoulder-
 * surfed or intercepted code). In-process state; a restart forgets it, but a
 * restart also outlives the 30s code window.
 */
let lastAccepted: { code: string; at: number } | null = null;
const REPLAY_WINDOW_MS = 90_000; // covers the step ± otplib's check window

/** Verify a code against the configured STUDIO_TOTP_SECRET. */
export function verifyTotp(code: string): boolean {
	const secret = env.STUDIO_TOTP_SECRET;
	if (!secret) return false;
	const trimmed = code.trim();
	if (
		lastAccepted &&
		lastAccepted.code === trimmed &&
		Date.now() - lastAccepted.at < REPLAY_WINDOW_MS
	) {
		return false;
	}
	try {
		const ok = authenticator.check(trimmed, secret);
		if (ok) lastAccepted = { code: trimmed, at: Date.now() };
		return ok;
	} catch {
		return false;
	}
}

/** Verify a code against an arbitrary secret (used during enrollment, before
 *  the secret is committed to env). */
export function checkCode(code: string, secret: string): boolean {
	try {
		return authenticator.check(code.trim(), secret);
	} catch {
		return false;
	}
}

/** Generate a fresh base32 TOTP secret. */
export function generateSecret(): string {
	return authenticator.generateSecret();
}

/** otpauth:// URI for QR rendering. */
export function authUrl(secret: string, account = 'operator', issuer = 'Studio'): string {
	return authenticator.keyuri(account, issuer, secret);
}
