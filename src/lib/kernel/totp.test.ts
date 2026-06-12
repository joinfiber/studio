import { describe, it, expect, beforeEach } from 'vitest';
import { authenticator } from 'otplib';
import { env, clearEnv } from '$lib/test/env-stub.js';
import { totpEnabled, verifyTotp, checkCode, generateSecret, authUrl } from './totp.js';

beforeEach(clearEnv);

describe('totpEnabled', () => {
	it('is false without STUDIO_TOTP_SECRET and true with it', () => {
		expect(totpEnabled()).toBe(false);
		env.STUDIO_TOTP_SECRET = generateSecret();
		expect(totpEnabled()).toBe(true);
	});
});

describe('verifyTotp', () => {
	it('rejects any code when no secret is configured', () => {
		expect(verifyTotp('123456')).toBe(false);
		expect(verifyTotp('')).toBe(false);
	});

	it('accepts a valid current code (and trims whitespace)', () => {
		const secret = generateSecret();
		env.STUDIO_TOTP_SECRET = secret;
		const code = authenticator.generate(secret);
		expect(verifyTotp(` ${code} `)).toBe(true);
	});

	it('rejects replay: the same accepted code is single-use within its window', () => {
		const secret = generateSecret();
		env.STUDIO_TOTP_SECRET = secret;
		const code = authenticator.generate(secret);
		expect(verifyTotp(code)).toBe(true);
		expect(verifyTotp(code)).toBe(false); // RFC 6238 §5.2
	});

	it('rejects a wrong code', () => {
		const secret = generateSecret();
		env.STUDIO_TOTP_SECRET = secret;
		const code = authenticator.generate(secret);
		const wrong = code === '000000' ? '000001' : '000000';
		expect(verifyTotp(wrong)).toBe(false);
	});

	it('rejects garbage input without throwing', () => {
		env.STUDIO_TOTP_SECRET = generateSecret();
		expect(verifyTotp('not-a-code')).toBe(false);
		expect(verifyTotp('')).toBe(false);
	});
});

describe('checkCode (enrollment, pre-env secret)', () => {
	it('verifies a code against an arbitrary secret', () => {
		const secret = generateSecret();
		const code = authenticator.generate(secret);
		expect(checkCode(code, secret)).toBe(true);
		expect(checkCode('000000', secret)).toBe(code === '000000');
	});
});

describe('authUrl', () => {
	it('produces an otpauth:// URI carrying issuer and secret', () => {
		const secret = generateSecret();
		const url = authUrl(secret);
		expect(url.startsWith('otpauth://totp/')).toBe(true);
		expect(url).toContain(secret);
		expect(url).toContain('Studio');
	});
});
