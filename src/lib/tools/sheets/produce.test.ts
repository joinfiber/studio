import { describe, it, expect } from 'vitest';
import { normalizeSheetUrl, candidatesFromRows, type SheetMapping } from './produce.js';

describe('normalizeSheetUrl', () => {
	it('turns a Google Sheets edit URL into a CSV export URL with gid', () => {
		expect(normalizeSheetUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=42')).toBe(
			'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=42',
		);
	});

	it('defaults gid to 0 when absent', () => {
		expect(normalizeSheetUrl('https://docs.google.com/spreadsheets/d/ABC123/edit')).toBe(
			'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=0',
		);
	});

	it('passes through a URL that already targets /export', () => {
		const u = 'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=7';
		expect(normalizeSheetUrl(u)).toBe(u);
	});

	it('passes through a non-Google CSV URL', () => {
		expect(normalizeSheetUrl('https://example.com/data.csv')).toBe('https://example.com/data.csv');
	});
});

describe('candidatesFromRows', () => {
	const mapping: SheetMapping = {
		name: 'Name',
		date: 'Date',
		time: 'Time',
		venue: 'Venue',
		category: 'Category',
	};
	const opts = { sourceUrl: 'https://docs.example/x', timezone: 'America/New_York' };

	it('maps a row to an event candidate with proxied provenance', () => {
		const { candidates, skipped } = candidatesFromRows(
			[
				{
					Name: 'Open Mic',
					Date: '2026-05-21',
					Time: '7pm',
					Venue: 'Cafe Walnut',
					Category: 'open_mic',
				},
			],
			mapping,
			opts,
		);
		expect(skipped).toBe(0);
		expect(candidates).toHaveLength(1);
		const c = candidates[0];
		expect(c.kind).toBe('event');
		expect(c.data.name).toBe('Open Mic');
		expect(c.data.start).toBe('2026-05-21T19:00:00');
		expect(c.data.timezone).toBe('America/New_York');
		expect(c.data.location.name).toBe('Cafe Walnut');
		expect(c.data.category).toBe('open_mic');
		expect(c.data.source_method).toBe('proxied');
		expect(c.data.source_feed_url).toBe(opts.sourceUrl);
	});

	it('skips rows missing a name or an unparseable date, and counts them', () => {
		const { candidates, skipped } = candidatesFromRows(
			[
				{ Name: '', Date: '2026-05-21' },
				{ Name: 'No date', Date: 'whenever' },
				{ Name: 'Good', Date: '5/21/2026' },
			],
			mapping,
			opts,
		);
		expect(candidates).toHaveLength(1);
		expect(candidates[0].data.name).toBe('Good');
		expect(skipped).toBe(2);
	});

	it('falls back to the community category when unmapped', () => {
		const { candidates } = candidatesFromRows(
			[{ Name: 'X', Date: '2026-05-21' }],
			{ name: 'Name', date: 'Date' },
			opts,
		);
		expect(candidates[0].data.category).toBe('community');
	});
});
