/**
 * Ingestion tool contract.
 *
 * Every tool — calendar, sheets, newsletter, scraper — converges on one
 * shape: given some config, produce candidates for the review→publish loop.
 * Config-driven tools (calendar/sheets/RSS) implement `produce` generically;
 * scrapers implement it per-site (the AI-authoring case).
 *
 * The interface is intentionally thin. It exists so a new tool author (and
 * their AI assistant) has one obvious target: "write a produce() that returns
 * Candidate[]." Everything downstream — review chrome, edit, publish — is
 * shared kernel.
 */

import type { Candidate } from './candidate.js';

export interface IngestionTool<Config = Record<string, unknown>> {
	/** Stable id, matches the candidate's source_tool. */
	id: string;
	/** Human label for the operator UI. */
	label: string;
	/** Fetch + extract candidates from the configured source. */
	produce(config: Config): Promise<Candidate[]>;
}

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
	const host = u.hostname.toLowerCase();
	const isPrivate =
		host === 'localhost' ||
		host === '0.0.0.0' ||
		host.endsWith('.local') ||
		/^127\./.test(host) ||
		/^10\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^169\.254\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host);
	if (isPrivate) {
		throw new Error('URL points to a private or internal address.');
	}
	return u;
}
