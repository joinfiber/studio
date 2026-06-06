import { describe, it, expect } from 'vitest';
import { assertSafeUrl } from './tool.js';

describe('assertSafeUrl', () => {
	it('accepts http and https URLs', () => {
		expect(assertSafeUrl('https://example.com/feed').hostname).toBe('example.com');
		expect(assertSafeUrl('http://example.com').protocol).toBe('http:');
	});

	it('rejects non-http(s) schemes', () => {
		expect(() => assertSafeUrl('ftp://example.com')).toThrow(/http or https/);
		expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(/http or https/);
	});

	it('rejects loopback and private ranges (SSRF)', () => {
		for (const u of [
			'http://localhost/x',
			'http://127.0.0.1/x',
			'http://10.0.0.5/x',
			'http://192.168.1.1/x',
			'http://169.254.1.1/x',
			'http://172.16.0.1/x',
			'http://printer.local/x',
		]) {
			expect(() => assertSafeUrl(u), u).toThrow(/private or internal/);
		}
	});

	it('rejects IPv6 loopback / link-local / unique-local and IPv4-mapped', () => {
		for (const u of [
			'http://[::1]/x',
			'http://[fe80::1]/x',
			'http://[fc00::1]/x',
			'http://[fd12:3456::1]/x',
			'http://[::ffff:127.0.0.1]/x',
		]) {
			expect(() => assertSafeUrl(u), u).toThrow(/private or internal/);
		}
	});

	it('rejects non-dotted numeric IP encodings (decimal / hex)', () => {
		expect(() => assertSafeUrl('http://2130706433/x')).toThrow(/private or internal/); // 127.0.0.1
		expect(() => assertSafeUrl('http://0x7f000001/x')).toThrow(/private or internal/);
	});

	it('still accepts ordinary public hosts', () => {
		expect(assertSafeUrl('https://docs.google.com/spreadsheets/d/abc/export').hostname).toBe(
			'docs.google.com',
		);
	});

	it('rejects an unparseable URL', () => {
		expect(() => assertSafeUrl('not a url')).toThrow(/Invalid URL/);
	});
});
