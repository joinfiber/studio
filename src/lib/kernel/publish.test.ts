import { describe, it, expect } from 'vitest';
import { toOffsetIso } from './publish.js';

describe('toOffsetIso', () => {
	it('appends the DST offset for a summer wall-clock time (EDT, -04:00)', () => {
		expect(toOffsetIso('2026-05-21T19:00:00', 'America/New_York')).toBe(
			'2026-05-21T19:00:00-04:00',
		);
	});

	it('appends the standard offset for a winter wall-clock time (EST, -05:00)', () => {
		expect(toOffsetIso('2026-01-15T19:00:00', 'America/New_York')).toBe(
			'2026-01-15T19:00:00-05:00',
		);
	});

	it('treats a date-only value as local midnight', () => {
		expect(toOffsetIso('2026-07-04', 'America/New_York')).toBe('2026-07-04T00:00:00-04:00');
	});

	it('converts a UTC (Z) instant into the target zone wall-clock', () => {
		// 23:00Z = 19:00 EDT
		expect(toOffsetIso('2026-05-21T23:00:00Z', 'America/New_York')).toBe(
			'2026-05-21T19:00:00-04:00',
		);
	});

	it('produces a positive offset for an eastern zone', () => {
		expect(toOffsetIso('2026-05-21T12:00:00', 'Europe/Berlin')).toBe('2026-05-21T12:00:00+02:00');
	});

	it('is correct in the hour after a spring-forward transition (no 1h drift)', () => {
		// US DST 2026 springs forward 2026-03-08 (02:00 EST → 03:00 EDT).
		// 03:01 is the first valid EDT minute; a one-pass offset guess returned 04:01.
		expect(toOffsetIso('2026-03-08T03:01:00', 'America/New_York')).toBe(
			'2026-03-08T03:01:00-04:00',
		);
	});

	it('keeps the standard offset just before the spring-forward', () => {
		expect(toOffsetIso('2026-03-08T01:30:00', 'America/New_York')).toBe(
			'2026-03-08T01:30:00-05:00',
		);
	});
});

// ---------------------------------------------------------------------------
// publishEventCandidate — the provenance-enforcing write boundary
// ---------------------------------------------------------------------------

import { vi } from 'vitest';
import { publishEventCandidate, resolveOrganizerId } from './publish.js';
import type { EventCandidate } from './candidate.js';

type AnySdk = Parameters<typeof publishEventCandidate>[0];

function fakeSdk(overrides: Partial<{ POST: unknown; GET: unknown }> = {}): {
	sdk: AnySdk;
	post: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
} {
	const post = vi.fn(async () => ({ data: { event: { id: 'evt-1' } }, response: { status: 201 } }));
	const get = vi.fn(async () => ({ data: { organizations: [] }, response: { status: 200 } }));
	const sdk = { POST: overrides.POST ?? post, GET: overrides.GET ?? get } as unknown as AnySdk;
	return { sdk, post, get };
}

function candidate(
	dataOverrides: Record<string, unknown> = {},
	id = 'cal-ab12cd-0',
): EventCandidate {
	return {
		id,
		kind: 'event',
		status: 'pending',
		source_tool: 'calendar',
		source_uri: 'https://example.com/cal.ics',
		created_at: '2026-06-01T12:00:00.000Z',
		data: {
			name: 'Bake Sale',
			start: '2026-06-20T10:00:00',
			timezone: 'America/New_York',
			end: null,
			category: 'food-drink',
			description: null,
			location: { name: 'Community Hall', address: null, lat: null, lng: null },
			organizer_name: 'Friends Group',
			image_url: null,
			source_method: 'proxied',
			source_feed_url: 'https://example.com/cal.ics',
			...dataOverrides,
		},
	} as EventCandidate;
}

describe('publishEventCandidate provenance enforcement', () => {
	it('publishes a proxied candidate carrying its source URL', async () => {
		const { sdk, post } = fakeSdk();
		const res = await publishEventCandidate(sdk, candidate(), 'org-1');
		expect(res.ok).toBe(true);
		const body = post.mock.calls[0][1].body;
		expect(body.source_method).toBe('proxied');
		expect(body.source_feed_url).toBe('https://example.com/cal.ics');
		expect(body.external_id).toBe('cal-ab12cd-0');
	});

	it('refuses a proxied candidate without a usable source URL (Golden Rule #5)', async () => {
		const { sdk, post } = fakeSdk();
		const res = await publishEventCandidate(sdk, candidate({ source_feed_url: null }), 'org-1');
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/source URL/);
		expect(post).not.toHaveBeenCalled();
	});

	it('refuses an unknown provenance method', async () => {
		const { sdk, post } = fakeSdk();
		const res = await publishEventCandidate(
			sdk,
			candidate({ source_method: 'scraped' as never }),
			'org-1',
		);
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/provenance/i);
		expect(post).not.toHaveBeenCalled();
	});

	it('omits source_feed_url for self-asserted events', async () => {
		const { sdk, post } = fakeSdk();
		const res = await publishEventCandidate(
			sdk,
			candidate({ source_method: 'self_asserted', source_feed_url: null }),
			'org-1',
		);
		expect(res.ok).toBe(true);
		expect('source_feed_url' in post.mock.calls[0][1].body).toBe(false);
	});

	it('refuses a candidate id unusable as external_id (control chars / length)', async () => {
		const { sdk, post } = fakeSdk();
		const evil = 'id' + String.fromCharCode(10) + 'x';
		const res = await publishEventCandidate(sdk, candidate({}, evil), 'org-1');
		expect(res.ok).toBe(false);
		const res2 = await publishEventCandidate(sdk, candidate({}, 'y'.repeat(201)), 'org-1');
		expect(res2.ok).toBe(false);
		expect(post).not.toHaveBeenCalled();
	});

	it('normalizes kebab categories to underscore at the boundary', async () => {
		const { sdk, post } = fakeSdk();
		await publishEventCandidate(sdk, candidate({ category: 'food-drink' }), 'org-1');
		expect(post.mock.calls[0][1].body.category).toBe('food_drink');
	});

	it('surfaces a Commons error message instead of throwing', async () => {
		const post = vi.fn(async () => ({
			data: undefined,
			error: { error: { code: 'NOT_LINKED', message: 'Key not linked to org.' } },
			response: { status: 403 },
		}));
		const { sdk } = fakeSdk({ POST: post });
		const res = await publishEventCandidate(sdk, candidate(), 'org-1');
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Key not linked to org.');
	});
});

describe('resolveOrganizerId', () => {
	it('returns the exact case-insensitive match when present', async () => {
		const get = vi.fn(async () => ({
			data: { organizations: [{ id: 'org-9', name: 'friends GROUP' }] },
			response: { status: 200 },
		}));
		const { sdk, post } = fakeSdk({ GET: get });
		expect(await resolveOrganizerId(sdk, 'Friends Group')).toBe('org-9');
		expect(post).not.toHaveBeenCalled();
	});

	it('creates the organizer when no exact match exists', async () => {
		const get = vi.fn(async () => ({
			data: { organizations: [{ id: 'org-8', name: 'Friends Group Annex' }] },
			response: { status: 200 },
		}));
		const post = vi.fn(async () => ({
			data: { organization: { id: 'org-new' } },
			response: { status: 201 },
		}));
		const { sdk } = fakeSdk({ GET: get, POST: post });
		expect(await resolveOrganizerId(sdk, 'Friends Group')).toBe('org-new');
		expect(post).toHaveBeenCalledWith('/service/organizations', {
			body: { name: 'Friends Group' },
		});
	});

	it('throws on an empty organizer name', async () => {
		const { sdk } = fakeSdk();
		await expect(resolveOrganizerId(sdk, '   ')).rejects.toThrow(/required/);
	});
});

describe('toOffsetIso input guards', () => {
	it('throws a usable error for an unknown timezone (not an opaque RangeError)', () => {
		expect(() => toOffsetIso('2026-06-01T19:00:00', 'Eastern Standard Time')).toThrow(
			/Unknown timezone/,
		);
	});

	it('throws a usable error for a malformed date instead of emitting NaN-NaN-NaN', () => {
		expect(() => toOffsetIso('2026-13-99T19:00:00', 'America/New_York')).toThrow(/Unusable date/);
		expect(() => toOffsetIso('not a date', 'America/New_York')).toThrow(/Unusable date/);
	});
});
