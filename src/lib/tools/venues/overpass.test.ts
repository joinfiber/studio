import { describe, it, expect } from 'vitest';
import {
	buildVenueQuery,
	mapOverpassElements,
	CATEGORY_GROUPS,
	type OverpassElement,
} from './overpass.js';

const bbox = { south: 39.96, west: -75.14, north: 39.98, east: -75.12, displayName: 'Fishtown' };

describe('buildVenueQuery', () => {
	it('emits node/way/relation clauses with the bbox and tag regex', () => {
		const q = buildVenueQuery(bbox, ['music_nightlife'], 120);
		expect(q).toContain('[out:json]');
		expect(q).toContain('(39.96,-75.14,39.98,-75.12)');
		expect(q).toMatch(/node\["amenity"~"\^\(bar\|pub\|nightclub\|music_venue\|biergarten\)\$"\]/);
		expect(q).toContain('way["amenity"');
		expect(q).toContain('relation["amenity"');
		expect(q.trimEnd().endsWith('out center tags 120;')).toBe(true);
	});

	it('uses a key-exists selector for retail (no value regex)', () => {
		const q = buildVenueQuery(bbox, ['retail'], 50);
		expect(q).toContain('node["shop"](');
		expect(q).not.toContain('shop"~');
	});

	it('returns empty string when no groups selected or unknown', () => {
		expect(buildVenueQuery(bbox, [], 120)).toBe('');
		expect(buildVenueQuery(bbox, ['nope'], 120)).toBe('');
	});

	it('CATEGORY_GROUPS each have an id, label, and at least one filter', () => {
		for (const g of CATEGORY_GROUPS) {
			expect(g.id).toBeTruthy();
			expect(g.label).toBeTruthy();
			expect(g.filters.length).toBeGreaterThan(0);
		}
	});
});

describe('mapOverpassElements', () => {
	const els: OverpassElement[] = [
		{
			type: 'node',
			id: 1,
			lat: 39.97,
			lon: -75.13,
			tags: {
				name: 'Kung Fu Necktie',
				amenity: 'nightclub',
				website: 'https://kfn.com',
				'addr:housenumber': '1248',
				'addr:street': 'N Front St',
				'addr:city': 'Philadelphia',
				'contact:instagram': 'kungfunecktie',
			},
		},
		{ type: 'way', id: 2, center: { lat: 39.975, lon: -75.135 }, tags: { name: 'North Bowl', amenity: 'bar' } },
		{ type: 'node', id: 3, lat: 39.97, lon: -75.13, tags: { amenity: 'bar' } }, // unnamed → skip
		{ type: 'node', id: 4, tags: { name: 'No coords', amenity: 'pub' } }, // no lat/lng → skip
	];

	it('maps named, located elements and carries OSM facts', () => {
		const { venues } = mapOverpassElements(els, 120);
		expect(venues.map((v) => v.name)).toEqual(['Kung Fu Necktie', 'North Bowl']);
		const kfn = venues[0];
		expect(kfn.category).toBe('nightclub');
		expect(kfn.website).toBe('https://kfn.com');
		expect(kfn.sameAs).toEqual(['https://instagram.com/kungfunecktie']);
		expect(kfn.address?.streetAddress).toBe('1248 N Front St');
		expect(kfn.address?.addressLocality).toBe('Philadelphia');
		// way uses center coords
		expect(venues[1].lat).toBeCloseTo(39.975);
	});

	it('dedups repeated elements and flags truncation against the limit', () => {
		const dup = [els[0], els[0], els[1]];
		const { venues, truncated } = mapOverpassElements(dup, 1);
		expect(venues).toHaveLength(1); // capped at limit
		expect(truncated).toBe(true); // 3 raw > limit 1
	});
});
