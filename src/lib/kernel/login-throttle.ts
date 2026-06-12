/**
 * In-process brute-force throttle for the login gate.
 *
 * Studio has a single shared credential, so the throttle is deliberately
 * GLOBAL (per-process), not per-IP: with one account to attack, per-IP
 * buckets just invite a distributed guesser. The cost is that an attacker
 * can lock the operator out for a few minutes at a time — for an admin
 * tool, a bounded lockout beats an unthrottled credential oracle.
 *
 * Scheme: the first GRACE_FAILURES failures are free (typos), then the
 * failing request itself is delayed exponentially (a tarpit — the attacker
 * waits, the operator just sees a slow wrong-password response), then a
 * hard lockout. Any success resets, and a quiet period heals an old streak.
 *
 * State is in-memory; a restart clears it. Acceptable: restarts are rare
 * and an attacker can't trigger them.
 */

const GRACE_FAILURES = 3;
const BASE_DELAY_MS = 200;
const MAX_DELAY_MS = 30_000;
const LOCKOUT_FAILURES = 10;
const LOCKOUT_MS = 5 * 60 * 1000;

let failCount = 0;
let lastFailureAt = 0;
let lockedUntil = 0; // epoch ms; 0 = not locked

function reset(): void {
	failCount = 0;
	lastFailureAt = 0;
	lockedUntil = 0;
}

/** Gate an attempt. Call before doing any credential work. */
export function checkThrottle(): { ok: true } | { ok: false; retryAfterMs: number } {
	const now = Date.now();
	if (lockedUntil > now) {
		return { ok: false, retryAfterMs: lockedUntil - now };
	}
	// A quiet period heals an old failure streak, so a typo made next month
	// doesn't inherit this month's tarpit.
	if (failCount > 0 && now - lastFailureAt > LOCKOUT_MS) reset();
	return { ok: true };
}

/**
 * Record a failed attempt (password or TOTP). Resolves after the tarpit
 * delay, so callers just `await` it before returning the error. Call only
 * after `checkThrottle` allowed the attempt, so locked-out requests aren't
 * double-counted.
 */
export async function recordFailure(): Promise<void> {
	failCount += 1;
	lastFailureAt = Date.now();

	if (failCount >= LOCKOUT_FAILURES) {
		lockedUntil = Date.now() + LOCKOUT_MS;
		return;
	}

	if (failCount > GRACE_FAILURES) {
		const delay = Math.min(BASE_DELAY_MS * 2 ** (failCount - GRACE_FAILURES - 1), MAX_DELAY_MS);
		await new Promise<void>((resolve) => setTimeout(resolve, delay));
	}
}

/** Record a fully successful login — clears the streak and any lockout. */
export function recordSuccess(): void {
	reset();
}
