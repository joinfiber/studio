import { describe, it, expect } from 'vitest';
import {
	parseEventCandidate,
	parseEventCandidates,
	parseEventCandidatesJson,
	MAX_CANDIDATES_PER_REQUEST,
} from './candidate-parse.js';

function valid(
	overrides: Record<string, unknown> = {},
	dataOverrides: Record<string, unknown> = {},
) {
	return {
		id: 'rss-1abc2d-0',
		kind: 'event',
		status: 'pending',
		source_tool: 'rss',
		source_uri: 'https://example.com/feed.xml',
		created_at: '2026-06-01T12:00:00.000Z',
		data: {
			name: 'Porchfest',
			start: '2026-06-20T14:00:00',
			timezone: 'America/New_York',
			end: null,
			category: 'live_music',
			description: 'Music on porches.',
			location: { name: 'The Porch', address: '12 Elm St', lat: 39.95, lng: -75.16 },
			organizer_name: 'Friends of the Porch',
			image_url: 'https://example.com/p.jpg',
			source_method: 'proxied',
			source_feed_url: 'https://example.com/feed.xml',
			...dataOverrides,
		},
		...overrides,
	};
}

describe('parseEventCandidate', () => {
	it('round-trips a valid candidate', () => {
		const c = parseEventCandidate(valid());
		expect(c.id).toBe('rss-1abc2d-0');
		expect(c.kind).toBe('event');
		expect(c.data.name).toBe('Porchfest');
		expect(c.data.source_method).toBe('proxied');
		expect(c.data.location.lat).toBe(39.95);
	});

	it('drops unknown keys at every level (mass-assignment guard)', () => {
		const c = parseEventCandidate(
			valid(
				{ sneaky: 'top', reviewed_at: 'x' },
				{ admin: true, proxied_by: 'me', location: { name: 'X', evil: 1 } },
			),
		) as unknown as Record<string, unknown>;
		expect(c.sneaky).toBeUndefined();
		expect((c.data as Record<string, unknown>).admin).toBeUndefined();
		expect((c.data as Record<string, unknown>).proxied_by).toBeUndefined();
		expect(
			((c.data as Record<string, { evil?: unknown }>).location as { evil?: unknown }).evil,
		).toBeUndefined();
	});

	it('rejects non-objects and wrong kinds', () => {
		expect(() => parseEventCandidate(null)).toThrow(/object/);
		expect(() => parseEventCandidate('x')).toThrow(/object/);
		expect(() => parseEventCandidate(valid({ kind: 'organization' }))).toThrow(/kind/);
	});

	it('requires name, start, timezone, and category', () => {
		expect(() => parseEventCandidate(valid({}, { name: '' }))).toThrow(/name.*required/);
		expect(() => parseEventCandidate(valid({}, { start: undefined }))).toThrow(/start/);
		expect(() => parseEventCandidate(valid({}, { timezone: '' }))).toThrow(/timezone/);
		expect(() => parseEventCandidate(valid({}, { category: '' }))).toThrow(/category/);
	});

	it('rejects a non-ISO start or end', () => {
		expect(() => parseEventCandidate(valid({}, { start: 'next Tuesday' }))).toThrow(/ISO/);
		expect(() => parseEventCandidate(valid({}, { end: '20/06/2026' }))).toThrow(/ISO/);
	});

	it('rejects an unknown source_method', () => {
		expect(() => parseEventCandidate(valid({}, { source_method: 'scraped' }))).toThrow(
			/source_method/,
		);
		expect(() => parseEventCandidate(valid({}, { source_method: undefined }))).toThrow(
			/source_method/,
		);
	});

	it('rejects non-http(s) URLs', () => {
		expect(() => parseEventCandidate(valid({}, { image_url: 'javascript:alert(1)' }))).toThrow(
			/http/,
		);
		expect(() =>
			parseEventCandidate(valid({}, { source_feed_url: 'ftp://example.com/x' })),
		).toThrow(/http/);
	});

	it('rejects out-of-range coordinates', () => {
		expect(() =>
			parseEventCandidate(valid({}, { location: { name: 'X', lat: 91, lng: 0 } })),
		).toThrow(/lat/);
		expect(() =>
			parseEventCandidate(valid({}, { location: { name: 'X', lat: 0, lng: -181 } })),
		).toThrow(/lng/);
	});

	it('rejects oversized fields', () => {
		expect(() => parseEventCandidate(valid({}, { name: 'x'.repeat(301) }))).toThrow(/too long/);
		expect(() => parseEventCandidate(valid({ id: 'x'.repeat(201) }))).toThrow(/too long/);
	});

	it('rejects control characters in strings', () => {
		const evil = 'evil' + String.fromCharCode(0) + 'name';
		expect(() => parseEventCandidate(valid({}, { name: evil }))).toThrow(/control/);
	});

	it('keeps an allowlisted submitter and defaults optional fields', () => {
		const c = parseEventCandidate(
			valid({ submitter: { display_name: 'Sam', avatar_url: null, role: 'admin' } }),
		);
		expect(c.submitter?.display_name).toBe('Sam');
		expect((c.submitter as unknown as Record<string, unknown>).role).toBeUndefined();
		const minimal = parseEventCandidate(valid({ status: undefined, created_at: undefined }));
		expect(minimal.status).toBe('pending');
		expect(typeof minimal.created_at).toBe('string');
	});
});

describe('parseEventCandidates', () => {
	it('parses a valid array', () => {
		expect(parseEventCandidates([valid(), valid()])).toHaveLength(2);
	});

	it('rejects non-arrays, empty arrays, and oversized batches', () => {
		expect(() => parseEventCandidates({})).toThrow(/array/);
		expect(() => parseEventCandidates([])).toThrow(/No candidates/);
		const many = Array.from({ length: MAX_CANDIDATES_PER_REQUEST + 1 }, () => valid());
		expect(() => parseEventCandidates(many)).toThrow(/Too many/);
	});

	it('names the failing element in the error', () => {
		expect(() => parseEventCandidates([valid(), valid({}, { name: '' })])).toThrow(
			/candidates\[1\]/,
		);
	});
});

describe('parseEventCandidatesJson', () => {
	it('parses a JSON payload', () => {
		expect(parseEventCandidatesJson(JSON.stringify([valid()]))).toHaveLength(1);
	});

	it('reports unreadable JSON cleanly', () => {
		expect(() => parseEventCandidatesJson('{nope')).toThrow(/Could not read/);
	});
});
