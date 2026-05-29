import { describe, it, expect } from 'vitest';
import { parseFeed } from './parse.js';

describe('parseFeed', () => {
	it('parses RSS 2.0 items', () => {
		const xml = `<?xml version="1.0"?>
			<rss version="2.0"><channel>
				<title>Feed</title>
				<item>
					<title>Show One</title>
					<link>https://ex.com/1</link>
					<description>First</description>
					<pubDate>Tue, 21 May 2026 19:00:00 GMT</pubDate>
				</item>
			</channel></rss>`;
		const items = parseFeed(xml);
		expect(items).toHaveLength(1);
		expect(items[0]).toEqual({
			title: 'Show One',
			link: 'https://ex.com/1',
			description: 'First',
			date: 'Tue, 21 May 2026 19:00:00 GMT',
		});
	});

	it('parses Atom entries, preferring the alternate link', () => {
		const xml = `<?xml version="1.0"?>
			<feed xmlns="http://www.w3.org/2005/Atom">
				<entry>
					<title>Atom Show</title>
					<link rel="self" href="https://ex.com/self"/>
					<link rel="alternate" href="https://ex.com/alt"/>
					<summary>Summary text</summary>
					<published>2026-05-21T19:00:00Z</published>
				</entry>
			</feed>`;
		const [item] = parseFeed(xml);
		expect(item.title).toBe('Atom Show');
		expect(item.link).toBe('https://ex.com/alt');
		expect(item.description).toBe('Summary text');
		expect(item.date).toBe('2026-05-21T19:00:00Z');
	});

	it('returns [] for non-feed XML', () => {
		expect(parseFeed('<html><body>nope</body></html>')).toEqual([]);
	});
});
