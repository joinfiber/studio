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
import {
	createCommonsClient as sdkCreate,
	type paths,
} from 'neighborhood-commons';
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

export function createCommonsClient(): CommonsClient {
	const baseUrl = env.COMMONS_BASE_URL ?? DEFAULT_BASE_URL;
	const apiKey = env.COMMONS_SERVICE_KEY ?? null;
	const contributorSlug = env.COMMONS_CONTRIBUTOR_SLUG ?? null;

	if (!apiKey && !warnedUnconfigured) {
		console.warn(
			'[commons] COMMONS_SERVICE_KEY is not set. Studio is running in ' +
				'fixture-only mode; any Commons read/write will fail until you ' +
				'configure a key. Register at https://neighborhood-commons.org/developers',
		);
		warnedUnconfigured = true;
	}

	const sdk = apiKey ? sdkCreate({ baseUrl, apiKey }) : null;

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
