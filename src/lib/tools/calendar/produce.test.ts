import { describe, it, expect } from 'vitest';
import { toIcalUrl, GCAL_HELP } from './produce.js';

describe('toIcalUrl', () => {
	it('passes through a real Google ical feed URL', () => {
		const u =
			'https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/public/basic.ics';
		expect(toIcalUrl(u)).toBe(u);
	});

	it('derives the ical feed from an embed ?src= link', () => {
		expect(toIcalUrl('https://calendar.google.com/calendar/embed?src=abc%40gmail.com')).toBe(
			'https://calendar.google.com/calendar/ical/abc%40gmail.com/public/basic.ics',
		);
	});

	it('derives the ical feed from a ?cid= link', () => {
		const cid = Buffer.from('abc@gmail.com').toString('base64');
		expect(toIcalUrl(`https://calendar.google.com/calendar/u/0?cid=${cid}`)).toBe(
			'https://calendar.google.com/calendar/ical/abc%40gmail.com/public/basic.ics',
		);
	});

	it('passes through a non-Google feed URL', () => {
		expect(toIcalUrl('https://example.com/events.ics')).toBe('https://example.com/events.ics');
	});

	it('throws the teaching help when a Google link has no derivable id', () => {
		expect(() => toIcalUrl('https://calendar.google.com/calendar/u/0/r')).toThrow(GCAL_HELP);
	});

	it('returns the raw input for a non-URL (downstream reports it)', () => {
		expect(toIcalUrl('not a url')).toBe('not a url');
	});
});
