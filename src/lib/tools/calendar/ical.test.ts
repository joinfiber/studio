import { describe, it, expect } from 'vitest';
import { parseIcal, normalizeTzid } from './ical.js';

const wrap = (body: string) => `BEGIN:VCALENDAR\nVERSION:2.0\n${body}\nEND:VCALENDAR`;

describe('parseIcal', () => {
	it('parses a basic VEVENT', () => {
		const events = parseIcal(
			wrap(
				[
					'BEGIN:VEVENT',
					'UID:abc-1',
					'SUMMARY:Open Mic Night',
					'LOCATION:Cafe Walnut',
					'DTSTART:20260521T190000Z',
					'DTEND:20260521T220000Z',
					'END:VEVENT',
				].join('\n'),
			),
		);
		expect(events).toHaveLength(1);
		const e = events[0];
		expect(e.uid).toBe('abc-1');
		expect(e.summary).toBe('Open Mic Night');
		expect(e.location).toBe('Cafe Walnut');
		expect(e.start).toEqual({ iso: '2026-05-21T19:00:00Z', tz: 'UTC', allDay: false });
		expect(e.end?.iso).toBe('2026-05-21T22:00:00Z');
	});

	it('reads TZID into the tz field (floating wall-clock)', () => {
		const [e] = parseIcal(
			wrap('BEGIN:VEVENT\nSUMMARY:Show\nDTSTART;TZID=America/New_York:20260521T190000\nEND:VEVENT'),
		);
		expect(e.start).toEqual({ iso: '2026-05-21T19:00:00', tz: 'America/New_York', allDay: false });
	});

	it('handles all-day VALUE=DATE', () => {
		const [e] = parseIcal(
			wrap('BEGIN:VEVENT\nSUMMARY:Fair\nDTSTART;VALUE=DATE:20260704\nEND:VEVENT'),
		);
		expect(e.start).toEqual({ iso: '2026-07-04', tz: null, allDay: true });
	});

	it('unfolds folded lines and unescapes text', () => {
		const [e] = parseIcal(
			wrap(
				'BEGIN:VEVENT\nSUMMARY:Long title that\n  continues here\nDESCRIPTION:Line one\\nLine two\\, with comma\nDTSTART:20260521T190000Z\nEND:VEVENT',
			),
		);
		expect(e.summary).toBe('Long title that continues here');
		expect(e.description).toBe('Line one\nLine two, with comma');
	});

	it('parses multiple VEVENTs', () => {
		const events = parseIcal(
			wrap(
				[
					'BEGIN:VEVENT\nSUMMARY:A\nDTSTART:20260521T190000Z\nEND:VEVENT',
					'BEGIN:VEVENT\nSUMMARY:B\nDTSTART:20260522T190000Z\nEND:VEVENT',
				].join('\n'),
			),
		);
		expect(events.map((e) => e.summary)).toEqual(['A', 'B']);
	});

	it('returns [] for a calendar with no events', () => {
		expect(parseIcal(wrap('PRODID:-//test//EN'))).toEqual([]);
	});
});

describe('normalizeTzid', () => {
	it('passes valid IANA zones through', () => {
		expect(normalizeTzid('America/New_York')).toBe('America/New_York');
		expect(normalizeTzid('Europe/Berlin')).toBe('Europe/Berlin');
	});

	it('maps common Windows/Exchange zone names to IANA', () => {
		expect(normalizeTzid('Eastern Standard Time')).toBe('America/New_York');
		expect(normalizeTzid('Pacific Standard Time')).toBe('America/Los_Angeles');
		expect(normalizeTzid('W. Europe Standard Time')).toBe('Europe/Berlin');
	});

	it('returns null (caller falls back to default tz) for unrecognised zones', () => {
		expect(normalizeTzid('Magic Castle Time')).toBeNull();
		expect(normalizeTzid('')).toBeNull();
		expect(normalizeTzid(undefined)).toBeNull();
	});
});

describe('parseDate range validation', () => {
	const feed = (dt: string) =>
		`BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:u1\nSUMMARY:X\nDTSTART:${dt}\nEND:VEVENT\nEND:VCALENDAR`;

	it('rejects out-of-range month/day/time instead of emitting a bogus ISO', () => {
		expect(parseIcal(feed('20261399T120000'))[0].start).toBeNull(); // month 13, day 99
		expect(parseIcal(feed('20260101T256099'))[0].start).toBeNull(); // hour 25, minute 60
	});

	it('keeps valid boundary values', () => {
		expect(parseIcal(feed('20261231T235960'))[0].start?.iso).toBe('2026-12-31T23:59:60'); // leap second
		expect(parseIcal(feed('20260101T000000'))[0].start?.iso).toBe('2026-01-01T00:00:00');
	});

	it('a non-IANA TZID no longer poisons the event (falls back to null tz)', () => {
		const withTz = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:u1\nSUMMARY:X\nDTSTART;TZID=Eastern Standard Time:20260601T190000\nEND:VEVENT\nEND:VCALENDAR`;
		expect(parseIcal(withTz)[0].start?.tz).toBe('America/New_York');
		const withJunk = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:u1\nSUMMARY:X\nDTSTART;TZID=Nonsense Zone:20260601T190000\nEND:VEVENT\nEND:VCALENDAR`;
		expect(parseIcal(withJunk)[0].start?.tz).toBeNull();
	});
});
