import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVenue, type VenueInput } from './create.js';

// Stub google-places so tests never touch env or network.
vi.mock('./google-places.js', () => ({
	googlePlacesConfigured: vi.fn(() => false),
	findGooglePlaceId: vi.fn(async () => null),
}));

import { googlePlacesConfigured, findGooglePlaceId } from './google-places.js';

const okPlace = { data: { place: { id: 'place-1' } }, response: { status: 201 } };
const okOrg = { data: { organization: { id: 'org-1' } }, response: { status: 201 } };
const conflict409 = { data: undefined, error: undefined, response: { status: 409 } };
const placeErr = {
	data: undefined,
	error: { error: { message: 'place rejected' } },
	response: { status: 422 },
};

function makeSdk(placeResult: unknown = okPlace, orgResult: unknown = okOrg) {
	const post = vi.fn().mockResolvedValueOnce(placeResult).mockResolvedValueOnce(orgResult);
	return { POST: post } as unknown as Parameters<typeof createVenue>[0];
}

const base: VenueInput = { name: 'Test Venue', lat: 40.0, lng: -75.0 };

beforeEach(() => {
	vi.mocked(googlePlacesConfigured).mockReturnValue(false);
	vi.mocked(findGooglePlaceId).mockResolvedValue(null);
});

describe('createVenue — name validation', () => {
	it('returns error for empty name', async () => {
		const sdk = makeSdk();
		const r = await createVenue(sdk, { ...base, name: '' });
		expect(r.error).toBeTruthy();
		expect(sdk.POST).not.toHaveBeenCalled();
	});

	it('returns error for whitespace-only name', async () => {
		const sdk = makeSdk();
		const r = await createVenue(sdk, { ...base, name: '   ' });
		expect(r.error).toBeTruthy();
		expect(sdk.POST).not.toHaveBeenCalled();
	});

	it('returns error for name of 201 characters', async () => {
		const sdk = makeSdk();
		const r = await createVenue(sdk, { ...base, name: 'a'.repeat(201) });
		expect(r.error).toBeTruthy();
		expect(sdk.POST).not.toHaveBeenCalled();
	});

	it('accepts a name of exactly 200 characters', async () => {
		const sdk = makeSdk();
		const r = await createVenue(sdk, { ...base, name: 'a'.repeat(200) });
		expect(r.error).toBeUndefined();
	});
});

describe('createVenue — coordinate validation', () => {
	it('returns error for lat > 90', async () => {
		const sdk = makeSdk();
		const r = await createVenue(sdk, { ...base, lat: 91 });
		expect(r.error).toMatch(/coordinates/i);
		expect(sdk.POST).not.toHaveBeenCalled();
	});

	it('returns error for lng > 180', async () => {
		const sdk = makeSdk();
		const r = await createVenue(sdk, { ...base, lng: 181 });
		expect(r.error).toMatch(/coordinates/i);
		expect(sdk.POST).not.toHaveBeenCalled();
	});

	it('returns error for NaN lat', async () => {
		const sdk = makeSdk();
		const r = await createVenue(sdk, { ...base, lat: NaN });
		expect(r.error).toMatch(/coordinates/i);
		expect(sdk.POST).not.toHaveBeenCalled();
	});

	it('accepts boundary values lat=90/lng=180 and lat=-90/lng=-180', async () => {
		expect((await createVenue(makeSdk(), { ...base, lat: 90, lng: 180 })).error).toBeUndefined();
		expect((await createVenue(makeSdk(), { ...base, lat: -90, lng: -180 })).error).toBeUndefined();
	});
});

describe('createVenue — array cap validation', () => {
	it('rejects sameAs/tags over 25 and openingHours over 60', async () => {
		expect(
			(await createVenue(makeSdk(), { ...base, sameAs: Array(26).fill('https://x.com') })).error,
		).toBeTruthy();
		expect(
			(await createVenue(makeSdk(), { ...base, tags: Array(26).fill('tag') })).error,
		).toBeTruthy();
		expect(
			(await createVenue(makeSdk(), { ...base, openingHours: Array(61).fill({}) })).error,
		).toBeTruthy();
	});

	it('accepts sameAs/tags of 25 and openingHours of 60', async () => {
		const r = await createVenue(makeSdk(), {
			...base,
			sameAs: Array(25).fill('https://x.com'),
			tags: Array(25).fill('tag'),
			openingHours: Array(60).fill({}),
		});
		expect(r.error).toBeUndefined();
	});
});

describe('createVenue — externalId fallback', () => {
	it('uses osm:type/id when Google is not configured', async () => {
		const sdk = makeSdk();
		await createVenue(sdk, { ...base, osmType: 'node', osmId: 123 });
		const placeBody = (sdk.POST as ReturnType<typeof vi.fn>).mock.calls[0][1].body;
		expect(placeBody.googlePlaceId).toBe('osm:node/123');
	});

	it('omits externalId when osmId is not finite', async () => {
		const sdk = makeSdk();
		await createVenue(sdk, { ...base, osmType: 'node', osmId: NaN });
		const placeBody = (sdk.POST as ReturnType<typeof vi.fn>).mock.calls[0][1].body;
		expect(placeBody.googlePlaceId).toBeUndefined();
	});

	it('prefers the Google place_id over the OSM ref when Google is configured', async () => {
		vi.mocked(googlePlacesConfigured).mockReturnValue(true);
		vi.mocked(findGooglePlaceId).mockResolvedValue('ChIJ_google');
		const sdk = makeSdk();
		await createVenue(sdk, { ...base, osmType: 'node', osmId: 999 });
		const placeBody = (sdk.POST as ReturnType<typeof vi.fn>).mock.calls[0][1].body;
		expect(placeBody.googlePlaceId).toBe('ChIJ_google');
	});
});

describe('createVenue — SDK error handling', () => {
	it('surfaces the place POST error message (no org attempt)', async () => {
		const sdk = makeSdk(placeErr, okOrg);
		const r = await createVenue(sdk, base);
		expect(r.error).toBe('place rejected');
		expect((sdk.POST as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1); // org never attempted
	});

	it('returns orgId and placeId on success', async () => {
		const sdk = makeSdk();
		const r = await createVenue(sdk, base);
		expect(r.orgId).toBe('org-1');
		expect(r.placeId).toBe('place-1');
		expect(r.error).toBeUndefined();
	});
});

describe('createVenue — orphaned-Place honesty (no place-delete endpoint)', () => {
	it('on org 409 with no external id, flags the stray Place and returns its id', async () => {
		const sdk = makeSdk(okPlace, conflict409);
		const r = await createVenue(sdk, base); // no Google, no osm → no externalId
		expect(r.error).toMatch(/already exists/);
		expect(r.error).toMatch(/no external id/i);
		expect(r.placeId).toBe('place-1');
	});

	it('on org 409 with an external id, notes the Place is dedup-keyed (retry reuses it)', async () => {
		const sdk = makeSdk(okPlace, conflict409);
		const r = await createVenue(sdk, { ...base, osmType: 'way', osmId: 42 });
		expect(r.error).toMatch(/already exists/);
		expect(r.error).toMatch(/osm:way\/42/);
		expect(r.placeId).toBe('place-1');
	});

	it('on a thrown org POST (network/timeout), still reports the committed Place', async () => {
		const post = vi
			.fn()
			.mockResolvedValueOnce(okPlace)
			.mockRejectedValueOnce(new Error('socket hang up'));
		const sdk = { POST: post } as unknown as Parameters<typeof createVenue>[0];
		const r = await createVenue(sdk, base);
		expect(r.error).toMatch(/socket hang up/);
		expect(r.placeId).toBe('place-1');
	});
});
