/**
 * Generic web scraper — fetch a page, strip it to text, run the shared LLM
 * extractor. The "works for many sites out of the box" path.
 *
 * For sites the generic pass can't handle, the pattern is: write a
 * site-specific produce() against the IngestionTool interface (the
 * AI-authoring case — see docs/extending.md). This module is both the
 * generic tool and the worked template.
 *
 * Provenance is `proxied` (the page is a relayed source; source_feed_url is
 * the page URL). Needs the LLM extraction capability.
 */

import type { EventCandidate } from '$lib/kernel/candidate.js';
import { assertSafeUrl, safeFetch } from '$lib/kernel/tool.js';
import { extractEventsFromText } from '$lib/tools/extract/llm.js';
import { candidatesFromExtracted } from '$lib/tools/extract/produce.js';
import { commonsUserAgent } from '$lib/kernel/commons-client.js';
import { decodeEntities } from '$lib/kernel/html.js';

export function htmlToText(html: string): string {
	const stripped = html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, ' ');
	return decodeEntities(stripped)
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export async function scrapeAndExtract(
	rawUrl: string,
	timezone: string,
): Promise<EventCandidate[]> {
	const url = assertSafeUrl(rawUrl).toString();
	const res = await safeFetch(url, {
		headers: {
			'User-Agent': commonsUserAgent(),
			Accept: 'text/html, application/xhtml+xml, */*',
		},
		signal: AbortSignal.timeout(25000),
	});
	if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

	const html = await res.text();
	const text = htmlToText(html);
	if (text.length < 40) throw new Error('No readable text found on that page.');

	const extracted = await extractEventsFromText(text);
	return candidatesFromExtracted(extracted, { sourceUrl: url, timezone });
}
