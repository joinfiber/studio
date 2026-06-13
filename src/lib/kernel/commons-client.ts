/**
 * Commons client.
 *
 * Wraps the `neighborhood-commons` SDK with deployment concerns: env config,
 * graceful fallback when COMMONS_SERVICE_KEY is missing (so a fresh clone
 * boots without a key), and the contributor slug needed to fetch this
 * instance's own profile.
 *
 * The SDK is a thin openapi-fetch wrapper around the Commons OpenAPI spec.
 * Calls look like:
 *
 *   const { data, error } = await client.sdk.GET('/contributors/{idOrSlug}', {
 *     params: { path: { idOrSlug: client.contributorSlug! } },
 *   });
 *
 * Per the rule: don't reach into Commons internals. If something can't be
 * expressed through the SDK, file an issue rather than building a side
 * channel.
 */

import { env } from '$env/dynamic/private';
import { createCommonsClient as sdkCreate, type paths } from 'neighborhood-commons';
import type { Client } from 'openapi-fetch';

/** The SDK default — matches what the unconfigured SDK uses internally. */
const DEFAULT_BASE_URL = 'https://neighborhood-commons.org/api/v1';

export interface CommonsClient {
	baseUrl: string;
	configured: boolean;
	/** Set explicitly via env (no `GET /me` endpoint exists). Required to
	 *  fetch this instance's own contributor profile. */
	contributorSlug: string | null;
	/** Null when not configured; openapi-fetch Client when configured. */
	sdk: Client<paths> | null;
}

let warnedUnconfigured = false;

/** Default ceiling on any single Commons round-trip. */
export const SDK_TIMEOUT_MS = 15_000;

/**
 * openapi-fetch middleware that bounds every request with an AbortSignal
 * timeout. Without it, one hung Commons connection blocks a request
 * indefinitely — and a single hang inside publishBatch stalls the pool.
 * Combined (not replaced) with any caller-supplied signal, so a per-call
 * abort still works.
 */
export function timeoutMiddleware(ms: number) {
	return {
		onRequest({ request }: { request: Request }): Request {
			const timeout = AbortSignal.timeout(ms);
			const signal = AbortSignal.any([request.signal, timeout]);
			return new Request(request, { signal });
		},
	};
}

export function createCommonsClient(): CommonsClient {
	const baseUrl = env.COMMONS_BASE_URL ?? DEFAULT_BASE_URL;
	const apiKey = env.COMMONS_SERVICE_KEY ?? null;
	const contributorSlug = env.COMMONS_CONTRIBUTOR_SLUG ?? null;

	if (!apiKey && !warnedUnconfigured) {
		console.warn(
			'[commons] COMMONS_SERVICE_KEY is not set — Studio boots, but every ' +
				'Commons read/write is disabled until you configure a key. Register ' +
				'at https://neighborhood-commons.org/developers',
		);
		warnedUnconfigured = true;
	}

	const sdk = apiKey ? sdkCreate({ baseUrl, apiKey }) : null;
	sdk?.use(timeoutMiddleware(SDK_TIMEOUT_MS));

	return {
		baseUrl,
		configured: apiKey !== null,
		contributorSlug,
		sdk,
	};
}

/**
 * Assert the client is configured before making a Commons call. Tool-side
 * code that actually hits the SDK should call this at the top of its
 * publish handler / loader.
 */
export function assertConfigured(client: CommonsClient): asserts client is CommonsClient & {
	configured: true;
	sdk: Client<paths>;
} {
	if (!client.configured || client.sdk === null) {
		throw new Error(
			'Commons client is not configured. Set COMMONS_SERVICE_KEY in your .env ' +
				'(register at https://neighborhood-commons.org/developers).',
		);
	}
}

/**
 * User-Agent for Studio's outbound calls to external services (OSM Nominatim /
 * Overpass, scraped pages) — identifies the app + contributor per their usage
 * policies. One source of truth so every outbound request is attributed alike.
 */
export function commonsUserAgent(): string {
	const contributor = env.COMMONS_CONTRIBUTOR_SLUG || 'unknown';
	return `neighborhood-commons Studio (contributor: ${contributor})`;
}
