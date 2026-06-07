/**
 * SSRF-safe fetch for user-supplied source URLs. The ingestion tools (calendar,
 * RSS, sheets, scraper) fetch URLs the operator pastes; these guards keep those
 * server-side fetches from reaching private/internal hosts.
 */

/**
 * Guard a user-supplied source URL before server-side fetch (basic SSRF
 * defense). http(s) only; reject loopback/private/link-local hosts. Not a
 * substitute for DNS-resolution checks, but reasonable for a single-operator
 * tool. Tighten if a deployment exposes ingestion to untrusted users.
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
 * Assert + fetch a user-supplied URL with MANUAL redirect handling, re-checking
 * every hop against assertSafeUrl — so a public URL can't 3xx-redirect into a
 * private/internal one (the SSRF gap a one-shot host check misses). Bounded
 * hops; returns the final Response. (DNS-rebinding remains out of scope.)
 */
export async function safeFetch(
	rawUrl: string,
	init?: RequestInit,
	maxHops = 4,
): Promise<Response> {
	let url = assertSafeUrl(rawUrl).toString();
	for (let hop = 0; hop <= maxHops; hop++) {
		const res = await fetch(url, { ...init, redirect: 'manual' });
		if (res.status < 300 || res.status >= 400) return res;
		const loc = res.headers.get('location');
		if (!loc) return res;
		url = assertSafeUrl(new URL(loc, url).toString()).toString(); // re-check each redirect target
	}
	throw new Error('Too many redirects.');
}
