/**
 * RSS / Atom ingestion — fetch a feed, parse items, map to event candidates.
 *
 * Caveat surfaced in the UI: feeds carry a *publish* date, not an event date.
 * We seed `start` from the item's date so the candidate is well-formed, but
 * the operator should verify/correct it in review. (LLM date-extraction from
 * the description is the enhancement that lands with the inference chunk.)
 *
 * Provenance is `proxied` — the feed is a relayed source.
 */

import { candidateId, type EventCandidate } from '$lib/kernel/candidate.js';
import { decodeEntities } from '$lib/kernel/html.js';
import { safeFetch } from '$lib/kernel/safe-fetch.js';
import { parseFeed } from './parse.js';

// A feed date is a real instant (RFC-822/ISO, with an offset). Keep it as a
// UTC instant; toOffsetIso() converts it to the event timezone's wall-clock at
// publish. (Previously this emitted UTC getters as a *floating* wall-clock,
// which shifted the day/time by the source offset.)
export function toInstant(dateStr: string | null): string | null {
	if (!dateStr) return null;
	const t = Date.parse(dateStr);
	if (Number.isNaN(t)) return null;
	return new Date(t).toISOString();
}

function stripHtml(s: string | null): string | null {
	if (!s) return null;
	return (
		decodeEntities(s.replace(/<[^>]+>/g, ' '))
			.replace(/\s+/g, ' ')
			.trim() || null
	);
}

export async function produceFromFeed(url: string, timezone: string): Promise<EventCandidate[]> {
	const res = await safeFetch(url, {
		headers: {
			Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
		},
		signal: AbortSignal.timeout(20000),
	});
	if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
	const xml = await res.text();

	const items = parseFeed(xml);
	if (items.length === 0) {
		throw new Error('No feed items found — is that an RSS or Atom feed?');
	}

	const now = new Date().toISOString();
	const fallbackStart = `${now.slice(0, 10)}T00:00:00`;

	return items
		.filter((it) => it.title)
		.map((it, i) => ({
			id: candidateId('rss', i, it.title, toInstant(it.date)),
			kind: 'event' as const,
			status: 'pending' as const,
			source_tool: 'rss',
			source_uri: url,
			created_at: now,
			data: {
				name: it.title as string,
				start: toInstant(it.date) ?? fallbackStart,
				timezone,
				end: null,
				category: 'community',
				description: stripHtml(it.description),
				location: { name: '', address: null, lat: null, lng: null },
				organizer_name: null,
				image_url: null,
				source_method: 'proxied',
				source_feed_url: url,
			},
		}));
}
