import { describe, it, expect } from 'vitest';
import { pickOrgPatch, methodLabel, mapOrganization } from './organizations.js';
import type { Organization } from 'neighborhood-commons';

describe('pickOrgPatch (the only guard on the privileged org PATCH)', () => {
	it('keeps every editable field', () => {
		const patch = {
			name: 'New Name',
			url: 'https://x.com',
			telephone: '555',
			email: 'a@b.com',
			description: 'd',
			logo: 'https://x.com/l.png',
			sameAs: ['https://x.com'],
			tags: ['bar'],
			commercial: true,
			openingHoursSpecification: [{ dayOfWeek: 'Monday' }],
		};
		expect(pickOrgPatch(patch)).toEqual(patch);
	});

	it('drops fields the operator must not set (identity, provenance, injected keys)', () => {
		const out = pickOrgPatch({
			name: 'Keep',
			id: 'forged-id',
			slug: 'forged-slug',
			method: 'self_asserted', // provenance is Commons-owned
			verified: true,
			primaryPlaceId: 'place-x',
			__proto__: { admin: true },
			arbitrary: 'nope',
		});
		expect(out).toEqual({ name: 'Keep' });
		expect('id' in out).toBe(false);
		expect('method' in out).toBe(false);
		expect('verified' in out).toBe(false);
		expect('primaryPlaceId' in out).toBe(false);
	});

	it('returns an empty object when nothing editable is present', () => {
		expect(pickOrgPatch({ id: 'x', method: 'proxied' })).toEqual({});
	});

	it('preserves falsy-but-intentional values (empty string, false)', () => {
		const out = pickOrgPatch({ description: '', commercial: false });
		expect(out).toEqual({ description: '', commercial: false });
	});
});

describe('methodLabel', () => {
	it('labels known provenance methods and passes unknown ones through', () => {
		expect(methodLabel('self_asserted')).toBe('first-party');
		expect(methodLabel('seeded')).toBe('imported');
		expect(methodLabel('proxied')).toBe('proxied');
		expect(methodLabel('witnessed')).toBe('witnessed');
		expect(methodLabel('something_new')).toBe('something_new');
	});
});

describe('mapOrganization', () => {
	it('flattens a venue (org with a primary place) into LiveOrg', () => {
		const org = {
			id: 'o1',
			name: 'The Pub',
			slug: 'the-pub',
			method: 'seeded',
			verified: true,
			tags: ['bar'],
			location: {
				name: 'The Pub',
				geo: { latitude: 40, longitude: -75 },
				address: {
					streetAddress: '1 Main St',
					addressLocality: 'Philadelphia',
					addressRegion: 'PA',
				},
			},
		} as unknown as Organization;
		const live = mapOrganization(org);
		expect(live.hasPlace).toBe(true);
		expect(live.city).toBe('Philadelphia');
		expect(live.address).toBe('1 Main St, Philadelphia, PA');
		expect(live.verified).toBe(true);
	});

	it('handles a placeless org', () => {
		const org = {
			id: 'o2',
			name: 'Placeless Org',
			slug: 'placeless',
			method: 'self_asserted',
		} as unknown as Organization;
		const live = mapOrganization(org);
		expect(live.hasPlace).toBe(false);
		expect(live.address).toBeNull();
		expect(live.city).toBeNull();
	});
});
