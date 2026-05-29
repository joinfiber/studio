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

	it('rejects an unparseable URL', () => {
		expect(() => assertSafeUrl('not a url')).toThrow(/Invalid URL/);
	});
});
