import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
// Import the stub directly: under vitest, `$env/dynamic/private` is aliased to
// this same file, so the `env` object here IS the one session.ts reads.
import { env, clearEnv } from '$lib/test/env-stub.js';
import {
	issueToken,
	verifyToken,
	checkPassword,
	gateEnabled,
	isLoopback,
} from './session.js';

beforeEach(clearEnv);

/** Forge a token signed with an arbitrary HMAC key (issueToken is public code). */
function forgeToken(key: string, level = 'full', ttlMs = 60_000): string {
	const payload = `${Date.now() + ttlMs}:${level}`;
	const sig = createHmac('sha256', key).update(payload).digest('hex');
	return `${Buffer.from(payload).toString('base64')}.${sig}`;
}

describe('issueToken / verifyToken', () => {
	it('round-trip: a freshly issued full token verifies with SESSION_SECRET set', () => {
		env.SESSION_SECRET = 'test-secret-abc';
		const token = issueToken('full');
		expect(verifyToken(token, 'full')).toBe(true);
	});

	it('round-trip: a freshly issued password token verifies', () => {
		env.SESSION_SECRET = 'test-secret-abc';
		const token = issueToken('password');
		expect(verifyToken(token, 'password')).toBe(true);
	});

	it('rejects undefined / empty token', () => {
		env.SESSION_SECRET = 'test-secret-abc';
		expect(verifyToken(undefined)).toBe(false);
		expect(verifyToken('')).toBe(false);
	});

	it('tamper: flipping a character in the signature invalidates the token', () => {
		env.SESSION_SECRET = 'test-secret-abc';
		const token = issueToken('full');
		const dot = token.indexOf('.');
		const sig = token.slice(dot + 1);
		const flipped = sig[0] === 'a' ? 'b' : 'a';
		const tampered = token.slice(0, dot + 1) + flipped + sig.slice(1);
		expect(verifyToken(tampered, 'full')).toBe(false);
	});

	it('tamper: flipping a character in the base64 payload invalidates the token', () => {
		env.SESSION_SECRET = 'test-secret-abc';
		const token = issueToken('full');
		const dot = token.indexOf('.');
		const b64 = token.slice(0, dot);
		const perturbed = b64.slice(0, -1) + (b64.endsWith('A') ? 'B' : 'A');
		const tampered = perturbed + token.slice(dot);
		expect(verifyToken(tampered, 'full')).toBe(false);
	});

	it('expiry: an already-expired token (negative TTL) is rejected', () => {
		env.SESSION_SECRET = 'test-secret-abc';
		const token = issueToken('full', -1);
		expect(verifyToken(token, 'full')).toBe(false);
	});

	it('expiry: a token with NaN expiry is rejected', () => {
		env.SESSION_SECRET = 'test-secret-abc';
		const payload = 'abc:full'; // Number('abc') === NaN
		const sig = createHmac('sha256', 'test-secret-abc').update(payload).digest('hex');
		const token = Buffer.from(payload).toString('base64') + '.' + sig;
		expect(verifyToken(token, 'full')).toBe(false);
	});

	it('expiry: a token with Infinity expiry is rejected', () => {
		env.SESSION_SECRET = 'test-secret-abc';
		const payload = `1e400:full`; // Number('1e400') === Infinity
		const sig = createHmac('sha256', 'test-secret-abc').update(payload).digest('hex');
		const token = Buffer.from(payload).toString('base64') + '.' + sig;
		expect(verifyToken(token, 'full')).toBe(false);
	});
});

describe('level hierarchy', () => {
	it("a 'password'-level token satisfies only 'password', not 'full'", () => {
		env.SESSION_SECRET = 'test-secret-abc';
		const token = issueToken('password');
		expect(verifyToken(token, 'password')).toBe(true);
		expect(verifyToken(token, 'full')).toBe(false);
	});

	it("a 'full'-level token satisfies both 'full' and 'password'", () => {
		env.SESSION_SECRET = 'test-secret-abc';
		const token = issueToken('full');
		expect(verifyToken(token, 'full')).toBe(true);
		expect(verifyToken(token, 'password')).toBe(true);
	});
});

describe('signing key is never empty and never the password', () => {
	it('without SESSION_SECRET, tokens still round-trip (per-process random key)', () => {
		const token = issueToken('full');
		expect(verifyToken(token, 'full')).toBe(true);
	});

	it('a token forged with an empty HMAC key is rejected even with no secrets set', () => {
		expect(verifyToken(forgeToken(''), 'full')).toBe(false);
	});

	it('a token forged with the login password is rejected (knowing the password must not bypass TOTP)', () => {
		env.STUDIO_PASSWORD = 'hunter2';
		expect(verifyToken(forgeToken('hunter2'), 'full')).toBe(false);
	});

	it('with SESSION_SECRET set, forgeries with other keys are rejected', () => {
		env.SESSION_SECRET = 'real-secret';
		env.STUDIO_PASSWORD = 'hunter2';
		expect(verifyToken(forgeToken(''), 'full')).toBe(false);
		expect(verifyToken(forgeToken('hunter2'), 'full')).toBe(false);
		expect(verifyToken(forgeToken('real-secret'), 'full')).toBe(true);
	});
});

describe('gateEnabled', () => {
	it('returns false when STUDIO_PASSWORD is not set', () => {
		expect(gateEnabled()).toBe(false);
	});

	it('returns true when STUDIO_PASSWORD is set', () => {
		env.STUDIO_PASSWORD = 'hunter2';
		expect(gateEnabled()).toBe(true);
	});

	it('SESSION_SECRET alone does not enable the gate (gate keys off STUDIO_PASSWORD)', () => {
		env.SESSION_SECRET = 'some-secret';
		expect(gateEnabled()).toBe(false);
	});
});

describe('checkPassword', () => {
	it('returns false when STUDIO_PASSWORD is not set', () => {
		expect(checkPassword('anything')).toBe(false);
	});

	it('returns true for the correct password', () => {
		env.STUDIO_PASSWORD = 'correct-horse';
		expect(checkPassword('correct-horse')).toBe(true);
	});

	it('returns false for an incorrect password', () => {
		env.STUDIO_PASSWORD = 'correct-horse';
		expect(checkPassword('wrong')).toBe(false);
	});

	it('returns false for an empty input even when password is set', () => {
		env.STUDIO_PASSWORD = 'correct-horse';
		expect(checkPassword('')).toBe(false);
	});
});

describe('isLoopback', () => {
	it('recognises localhost and its subdomains', () => {
		expect(isLoopback('localhost')).toBe(true);
		expect(isLoopback('LOCALHOST')).toBe(true);
		expect(isLoopback('app.localhost')).toBe(true);
	});

	it('recognises IPv4 and IPv6 loopback', () => {
		expect(isLoopback('127.0.0.1')).toBe(true);
		expect(isLoopback('::1')).toBe(true);
		expect(isLoopback('[::1]')).toBe(true);
	});

	it('rejects non-loopback hostnames', () => {
		expect(isLoopback('localhost.evil.com')).toBe(false);
		expect(isLoopback('notlocalhost')).toBe(false);
		expect(isLoopback('example.com')).toBe(false);
		expect(isLoopback('192.168.1.1')).toBe(false);
	});
});
