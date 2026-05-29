/**
 * Map LLM-extracted events into event candidates. Provenance is `proxied`
 * (the pasted text is a relayed source); the operator can supply the source
 * URL it came from.
 */

import { candidateId, type EventCandidate } from '$lib/kernel/candidate.js';
import type { ExtractedEvent } from './llm.js';

export interface ExtractOptions {
	sourceUrl: string | null;
	timezone: string;
}

export function candidatesFromExtracted(
	events: ExtractedEvent[],
	opts: ExtractOptions,
): EventCandidate[] {
	const now = new Date().toISOString();
	return events
		.filter((e) => e.name && e.date)
		.map((e, i) => ({
			id: candidateId('extract', i, e.name, e.date, e.venue),
			kind: 'event' as const,
			status: 'pending' as const,
			source_tool: 'extract',
			source_uri: opts.sourceUrl,
			created_at: now,
			data: {
				name: e.name,
				start: `${e.date}T${(e.time ?? '00:00').slice(0, 5)}:00`,
				timezone: opts.timezone,
				end: null,
				category: e.category ?? 'community',
				description: e.description,
				location: { name: e.venue ?? '', address: null, lat: null, lng: null },
				organizer_name: null,
				image_url: null,
				source_method: 'proxied',
				source_feed_url: opts.sourceUrl,
			},
		}));
}
