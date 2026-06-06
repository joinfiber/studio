import { describe, it, expect } from 'vitest';
import { contactFromOsmTags } from './geocode.js';

describe('contactFromOsmTags', () => {
	it('reads website, preferring website over contact:website', () => {
		expect(
			contactFromOsmTags({ website: 'https://a.com', 'contact:website': 'https://b.com' }).website,
		).toBe('https://a.com');
		expect(contactFromOsmTags({ 'contact:website': 'https://b.com' }).website).toBe(
			'https://b.com',
		);
	});

	it('reads phone from either phone or contact:phone', () => {
		expect(contactFromOsmTags({ phone: '+1 215 555 0100' }).phone).toBe('+1 215 555 0100');
		expect(contactFromOsmTags({ 'contact:phone': '+1 215 555 0199' }).phone).toBe(
			'+1 215 555 0199',
		);
	});

	it('turns a social handle into a canonical profile URL', () => {
		expect(contactFromOsmTags({ 'contact:instagram': 'examplevenue' }).sameAs).toEqual([
			'https://instagram.com/examplevenue',
		]);
		expect(contactFromOsmTags({ 'contact:instagram': '@examplevenue' }).sameAs).toEqual([
			'https://instagram.com/examplevenue',
		]);
	});

	it('passes through a full social URL unchanged', () => {
		expect(contactFromOsmTags({ 'contact:facebook': 'https://facebook.com/x' }).sameAs).toEqual([
			'https://facebook.com/x',
		]);
	});

	it('collects multiple platforms into sameAs', () => {
		const { sameAs } = contactFromOsmTags({
			'contact:instagram': 'ig',
			'contact:facebook': 'fb',
			'contact:twitter': 'tw',
		});
		expect(sameAs).toEqual([
			'https://instagram.com/ig',
			'https://facebook.com/fb',
			'https://x.com/tw',
		]);
	});

	it('returns an empty sameAs for no tags', () => {
		expect(contactFromOsmTags(undefined)).toEqual({ sameAs: [] });
		expect(contactFromOsmTags({}).sameAs).toEqual([]);
	});
});
