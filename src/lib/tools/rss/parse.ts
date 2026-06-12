/**
 * RSS 2.0 + Atom feed parser (via fast-xml-parser). Normalizes both into a
 * flat FeedItem list. Used by the RSS ingestion tool.
 */

import { XMLParser } from 'fast-xml-parser';

export interface FeedItem {
	title: string | null;
	link: string | null;
	description: string | null;
	/** Raw date string (RFC 822 for RSS, ISO 8601 for Atom). */
	date: string | null;
}

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	trimValues: true,
	// Keep values as strings: the default coercion turns a title of "007"
	// into the number 7 and a title of "true" into a boolean (then dropped).
	parseTagValue: false,
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
	if (v === undefined || v === null) return [];
	return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string | null {
	if (v == null) return null;
	if (typeof v === 'string') return v.trim() || null;
	if (typeof v === 'number') return String(v);
	if (typeof v === 'object') {
		const t = (v as Record<string, unknown>)['#text'];
		if (t != null) return String(t).trim() || null;
	}
	return null;
}

export function parseFeed(xml: string): FeedItem[] {
	const obj = parser.parse(xml) as Record<string, any>;

	// RSS 2.0
	const channel = obj?.rss?.channel;
	if (channel) {
		return asArray(channel.item).map((it: Record<string, unknown>) => ({
			title: text(it.title),
			link: text(it.link),
			description: text(it.description) ?? text(it['content:encoded']),
			date: text(it.pubDate) ?? text(it['dc:date']),
		}));
	}

	// Atom
	if (obj?.feed) {
		return asArray(obj.feed.entry).map((e: Record<string, any>) => {
			const links = asArray(e.link);
			const alt = links.find((l) => l?.['@_rel'] === 'alternate') ?? links[0];
			const link = alt ? (alt['@_href'] ?? text(alt)) : null;
			return {
				title: text(e.title),
				link,
				description: text(e.summary) ?? text(e.content),
				date: text(e.published) ?? text(e.updated),
			};
		});
	}

	return [];
}
