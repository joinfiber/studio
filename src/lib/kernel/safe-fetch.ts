/**
 * SSRF-safe fetch for user-supplied source URLs. The ingestion tools (calendar,
 * RSS, sheets, scraper) fetch URLs the operator pastes; these guards keep those
 * server-side fetches from reaching private/internal hosts.
 */

import { lookup } from 'node:dns/promises';

/**
 * Guard a user-supplied source URL before server-side fetch (basic SSRF
 * defense). http(s) only; reject loopback/private/link-local/CGNAT hosts by
 * string shape. This is the fast, synchronous screen — `safeFetch` adds the
 * authoritative DNS-resolution check on top.
 */
export function assertSafeUrl(raw: string): URL {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		throw new Error('Invalid URL.');
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') {
		throw new Error('URL must be http or https.');
	}
	const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
	const isPrivate =
		host === 'localhost' ||
		host === '0.0.0.0' ||
		host === '::1' ||
		host === '::' ||
		host.endsWith('.local') ||
		host.endsWith('.localhost') ||
		/^127\./.test(host) ||
		/^10\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^169\.254\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
		/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || // CGNAT 100.64.0.0/10
		/^fe80:/.test(host) || // IPv6 link-local
		/^f[cd][0-9a-f]{2}:/.test(host) || // IPv6 unique-local (fc00::/7)
		/^::ffff:/.test(host) || // IPv4-mapped IPv6
		/^\d+$/.test(host) || // bare decimal IP (e.g. 2130706433 = 127.0.0.1)
		/^0x[0-9a-f]+$/.test(host); // hex IP
	if (isPrivate) {
		throw new Error('URL points to a private or internal address.');
	}
	return u;
}

/**
 * Is this RESOLVED address private/internal? Authoritative complement to
 * assertSafeUrl's string screen: it runs on what DNS actually returned, so a
 * public hostname pointing at 169.254.169.254 (cloud metadata), RFC1918, or
 * CGNAT space is caught here. Unparseable input counts as private.
 */
export function isPrivateIp(ip: string): boolean {
	const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (v4) {
		const octets = v4.slice(1).map(Number);
		if (octets.some((n) => n > 255)) return true;
		const [a, b] = octets;
		return (
			a === 0 || // "this network"
			a === 10 || // RFC1918
			a === 127 || // loopback
			(a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
			(a === 169 && b === 254) || // link-local / cloud metadata
			(a === 172 && b >= 16 && b <= 31) || // RFC1918
			(a === 192 && b === 168) || // RFC1918
			(a === 198 && (b === 18 || b === 19)) || // benchmarking
			a >= 224 // multicast, reserved, broadcast
		);
	}
	const h = ip.toLowerCase();
	if (h === '::' || h === '::1') return true;
	if (h.startsWith('::ffff:')) {
		const mapped = h.slice(7);
		// Dotted-quad mapped v4 recurses; hex-form mapped v4 is rejected outright.
		return mapped.includes('.') ? isPrivateIp(mapped) : true;
	}
	if (/^fe[89ab]/.test(h)) return true; // link-local fe80::/10
	if (/^f[cd]/.test(h)) return true; // unique-local fc00::/7
	return false;
}

function isIpLiteral(host: string): boolean {
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/**
 * Resolve the host and reject URLs whose addresses land in private space.
 * Throws the same shaped error as assertSafeUrl.
 */
async function assertResolvesPublic(u: URL): Promise<void> {
	const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
	if (isIpLiteral(host)) {
		if (isPrivateIp(host)) throw new Error('URL points to a private or internal address.');
		return;
	}
	let addrs: { address: string }[];
	try {
		addrs = await lookup(host, { all: true });
	} catch {
		throw new Error(`Could not resolve host "${host}".`);
	}
	if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
		throw new Error('URL resolves to a private or internal address.');
	}
}

/**
 * Assert + fetch a user-supplied URL with MANUAL redirect handling, re-checking
 * every hop — string screen AND DNS resolution — so a public URL can't 3xx or
 * CNAME its way into a private/internal target (incl. cloud metadata). Bounded
 * hops; returns the final Response.
 *
 * Residual gap, accepted for a single-operator tool: the address is checked
 * and then fetch() resolves again to connect (a resolve-then-connect TOCTOU —
 * a DNS rebinder with a ~0s TTL could swap answers between the two lookups).
 * Closing it means pinning the connection to the validated IP via a custom
 * undici dispatcher; tighten this if a deployment exposes ingestion to
 * untrusted users.
 */
export async function safeFetch(
	rawUrl: string,
	init?: RequestInit,
	maxHops = 4,
): Promise<Response> {
	let url = assertSafeUrl(rawUrl);
	for (let hop = 0; hop <= maxHops; hop++) {
		await assertResolvesPublic(url);
		const res = await fetch(url.toString(), { ...init, redirect: 'manual' });
		if (res.status < 300 || res.status >= 400) return res;
		const loc = res.headers.get('location');
		if (!loc) return res;
		url = assertSafeUrl(new URL(loc, url).toString()); // re-screen each redirect target
	}
	throw new Error('Too many redirects.');
}

/** Default body cap for operator-supplied sources (feeds, pages, CSVs). */
export const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MiB

/**
 * Read a response body as text, refusing past `maxBytes` — so a hostile or
 * misconfigured source can't OOM the server with an unbounded body.
 */
export async function readTextCapped(res: Response, maxBytes = MAX_BODY_BYTES): Promise<string> {
	const tooLarge = () =>
		new Error(`Response too large (over ${Math.round(maxBytes / (1024 * 1024))} MB).`);

	const declared = Number(res.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
	if (!res.body) return '';

	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => {});
			throw tooLarge();
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}
