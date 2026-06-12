import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// DNS is mocked so safeFetch's resolution check is deterministic and offline.
// Hostname → resolved address fixtures (see table below).
vi.mock('node:dns/promises', () => ({
	lookup: vi.fn(async (host: string) => {
		const table: Record<string, string[]> = {
			'public.example': ['93.184.216.34'],
			'metadata.example': ['169.254.169.254'], // cloud metadata behind a public name
			'intranet.example': ['10.1.2.3'],
			'cgnat.example': ['100.70.0.1'],
			'dual.example': ['93.184.216.34', '192.168.0.10'], // any private address taints it
			'redirect.example': ['93.184.216.34'],
		};
		const addrs = table[host];
		if (!addrs) throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
		return addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
	}),
}));

import { assertSafeUrl, isPrivateIp, safeFetch, readTextCapped } from './safe-fetch.js';

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

	it('rejects the CGNAT range 100.64.0.0/10 but not its neighbours', () => {
		expect(() => assertSafeUrl('http://100.64.0.1/x')).toThrow(/private or internal/);
		expect(() => assertSafeUrl('http://100.127.255.254/x')).toThrow(/private or internal/);
		expect(assertSafeUrl('http://100.63.255.254/x').hostname).toBe('100.63.255.254');
		expect(assertSafeUrl('http://100.128.0.1/x').hostname).toBe('100.128.0.1');
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

describe('isPrivateIp', () => {
	it('flags every private/special IPv4 range', () => {
		for (const ip of [
			'0.0.0.0',
			'10.0.0.1',
			'100.64.0.1',
			'100.127.255.254',
			'127.0.0.1',
			'169.254.169.254',
			'172.16.0.1',
			'172.31.255.255',
			'192.168.0.1',
			'198.18.0.1',
			'224.0.0.1',
			'255.255.255.255',
		]) {
			expect(isPrivateIp(ip), ip).toBe(true);
		}
	});

	it('passes ordinary public IPv4', () => {
		for (const ip of ['93.184.216.34', '8.8.8.8', '100.63.0.1', '100.128.0.1', '172.32.0.1']) {
			expect(isPrivateIp(ip), ip).toBe(false);
		}
	});

	it('flags private IPv6 (loopback, link-local, ULA, v4-mapped)', () => {
		for (const ip of ['::1', '::', 'fe80::1', 'febf::1', 'fc00::1', 'fd12:3456::1']) {
			expect(isPrivateIp(ip), ip).toBe(true);
		}
		expect(isPrivateIp('::ffff:192.168.0.1')).toBe(true);
		expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
	});

	it('passes public IPv6', () => {
		expect(isPrivateIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
	});

	it('treats malformed input as private (fail closed)', () => {
		expect(isPrivateIp('999.1.1.1')).toBe(true);
	});
});

describe('safeFetch DNS + redirect re-validation', () => {
	const realFetch = global.fetch;
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	afterEach(() => {
		global.fetch = realFetch;
	});

	function mockFetch(handler: (url: string) => Response) {
		const spy = vi.fn(async (input: RequestInfo | URL) => handler(String(input)));
		global.fetch = spy as unknown as typeof fetch;
		return spy;
	}

	it('fetches a public host that resolves publicly', async () => {
		const spy = mockFetch(() => new Response('ok', { status: 200 }));
		const res = await safeFetch('https://public.example/feed');
		expect(res.status).toBe(200);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('refuses a public hostname that resolves to cloud metadata', async () => {
		const spy = mockFetch(() => new Response('never', { status: 200 }));
		await expect(safeFetch('https://metadata.example/latest')).rejects.toThrow(
			/resolves to a private/,
		);
		expect(spy).not.toHaveBeenCalled();
	});

	it('refuses hostnames resolving to RFC1918 or CGNAT space', async () => {
		mockFetch(() => new Response('never', { status: 200 }));
		await expect(safeFetch('https://intranet.example/x')).rejects.toThrow(/private/);
		await expect(safeFetch('https://cgnat.example/x')).rejects.toThrow(/private/);
	});

	it('refuses when ANY resolved address is private (multi-A taint)', async () => {
		const spy = mockFetch(() => new Response('never', { status: 200 }));
		await expect(safeFetch('https://dual.example/x')).rejects.toThrow(/private/);
		expect(spy).not.toHaveBeenCalled();
	});

	it('surfaces unresolvable hosts as a clean error', async () => {
		mockFetch(() => new Response('never', { status: 200 }));
		await expect(safeFetch('https://nope.example/x')).rejects.toThrow(/Could not resolve/);
	});

	it('re-validates every redirect hop and blocks a 3xx into private space', async () => {
		const spy = mockFetch((url) =>
			url.startsWith('https://redirect.example')
				? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
				: new Response('never', { status: 200 }),
		);
		await expect(safeFetch('https://redirect.example/start')).rejects.toThrow(
			/private or internal/,
		);
		expect(spy).toHaveBeenCalledTimes(1); // the private hop was never fetched
	});

	it('blocks a redirect to a public name that resolves privately', async () => {
		const spy = mockFetch((url) =>
			url.startsWith('https://redirect.example')
				? new Response(null, {
						status: 302,
						headers: { location: 'https://metadata.example/latest' },
					})
				: new Response('never', { status: 200 }),
		);
		await expect(safeFetch('https://redirect.example/start')).rejects.toThrow(
			/resolves to a private/,
		);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('follows a safe redirect chain to completion', async () => {
		const spy = mockFetch((url) =>
			url === 'https://redirect.example/start'
				? new Response(null, { status: 301, headers: { location: 'https://public.example/end' } })
				: new Response('done', { status: 200 }),
		);
		const res = await safeFetch('https://redirect.example/start');
		expect(res.status).toBe(200);
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('gives up after too many redirects', async () => {
		mockFetch(
			() =>
				new Response(null, { status: 302, headers: { location: 'https://public.example/loop' } }),
		);
		await expect(safeFetch('https://public.example/loop')).rejects.toThrow(/Too many redirects/);
	});
});

describe('readTextCapped', () => {
	it('reads a normal body', async () => {
		expect(await readTextCapped(new Response('hello'))).toBe('hello');
	});

	it('throws when the streamed body exceeds the cap', async () => {
		const big = new Response('x'.repeat(2048));
		await expect(readTextCapped(big, 1024)).rejects.toThrow(/too large/i);
	});

	it('rejects early on a Content-Length over the cap', async () => {
		const res = new Response('tiny', { headers: { 'content-length': '999999999' } });
		await expect(readTextCapped(res, 1024)).rejects.toThrow(/too large/i);
	});

	it('decodes multi-byte UTF-8 correctly across the cap boundary check', async () => {
		const s = 'héllo wörld — ünïcode';
		expect(await readTextCapped(new Response(s), 1024)).toBe(s);
	});
});
