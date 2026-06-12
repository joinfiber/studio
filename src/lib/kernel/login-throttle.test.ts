import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkThrottle, recordFailure, recordSuccess } from './login-throttle.js';

// Module state is per-process; recordSuccess() is the documented reset.
beforeEach(() => {
	vi.useFakeTimers();
	recordSuccess();
});
afterEach(() => {
	vi.useRealTimers();
});

/** Drive recordFailure() to completion under fake timers. */
async function failOnce(): Promise<void> {
	const p = recordFailure();
	await vi.runAllTimersAsync();
	await p;
}

describe('login throttle', () => {
	it('allows attempts with a clean slate', () => {
		expect(checkThrottle().ok).toBe(true);
	});

	it('the first three failures are free (no tarpit delay)', async () => {
		for (let i = 0; i < 3; i++) {
			let done = false;
			recordFailure().then(() => (done = true));
			await vi.advanceTimersByTimeAsync(0);
			expect(done).toBe(true); // resolved without any timer wait
		}
		expect(checkThrottle().ok).toBe(true);
	});

	it('failures past the grace zone are tarpitted with growing delay', async () => {
		for (let i = 0; i < 3; i++) await failOnce();

		// 4th failure: ~200ms delay
		let done = false;
		const p = recordFailure();
		p.then(() => (done = true));
		await vi.advanceTimersByTimeAsync(199);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await p;
		expect(done).toBe(true);

		// 5th failure: ~400ms delay
		done = false;
		const p2 = recordFailure();
		p2.then(() => (done = true));
		await vi.advanceTimersByTimeAsync(399);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await p2;
		expect(done).toBe(true);
	});

	it('locks out after 10 failures and reports retry time', async () => {
		for (let i = 0; i < 10; i++) await failOnce();
		const res = checkThrottle();
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.retryAfterMs).toBeGreaterThan(0);
			expect(res.retryAfterMs).toBeLessThanOrEqual(5 * 60 * 1000);
		}
	});

	it('the lockout expires on its own', async () => {
		for (let i = 0; i < 10; i++) await failOnce();
		expect(checkThrottle().ok).toBe(false);
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
		expect(checkThrottle().ok).toBe(true);
	});

	it('a success resets the streak (next failure is free again)', async () => {
		for (let i = 0; i < 6; i++) await failOnce();
		recordSuccess();
		let done = false;
		recordFailure().then(() => (done = true));
		await vi.advanceTimersByTimeAsync(0);
		expect(done).toBe(true); // back in the grace zone
	});

	it('a quiet period heals an old streak', async () => {
		for (let i = 0; i < 6; i++) await failOnce();
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
		expect(checkThrottle().ok).toBe(true); // also resets the stale streak
		let done = false;
		recordFailure().then(() => (done = true));
		await vi.advanceTimersByTimeAsync(0);
		expect(done).toBe(true);
	});
});
