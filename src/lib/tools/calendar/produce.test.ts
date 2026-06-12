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

// ---------------------------------------------------------------------------
// vEventsToCandidates — id stability + all-day end handling
// ---------------------------------------------------------------------------

import { vEventsToCandidates } from './produce.js';
import type { ParsedVEvent } from './ical.js';

const OPTS = { url: 'https://example.com/cal.ics', defaultTz: 'America/New_York' };

function vevent(over: Partial<ParsedVEvent> = {}): ParsedVEvent {
	return {
		uid: 'evt-1@example.com',
		summary: 'Weekly Trivia',
		description: null,
		location: 'The Pub',
		url: null,
		start: { iso: '2026-06-01T19:00:00', tz: 'America/New_York', allDay: false },
		end: null,
		...over,
	};
}

describe('vEventsToCandidates', () => {
	it('gives recurrence instances sharing a UID distinct ids (no external_id collision)', () => {
		const [a, b] = vEventsToCandidates(
			[
				vevent(),
				vevent({ start: { iso: '2026-06-08T19:00:00', tz: 'America/New_York', allDay: false } }),
			],
			OPTS,
		);
		expect(a.id).not.toBe(b.id);
	});

	it('keeps ids stable across re-imports of identical content', () => {
		const first = vEventsToCandidates([vevent()], OPTS)[0].id;
		const second = vEventsToCandidates([vevent()], OPTS)[0].id;
		expect(first).toBe(second);
	});

	it('never uses the raw UID as the id', () => {
		const [c] = vEventsToCandidates([vevent()], OPTS);
		expect(c.id).not.toBe('evt-1@example.com');
		expect(c.id.startsWith('calendar-')).toBe(true);
	});

	it('converts the exclusive all-day DTEND to the inclusive last day', () => {
		const [c] = vEventsToCandidates(
			[
				vevent({
					start: { iso: '2026-07-04', tz: null, allDay: true },
					end: { iso: '2026-07-06', tz: null, allDay: true }, // exclusive: thru the 5th
				}),
			],
			OPTS,
		);
		expect(c.data.end).toBe('2026-07-05');
	});

	it('drops the end entirely for a single all-day day (DTEND = start + 1)', () => {
		const [c] = vEventsToCandidates(
			[
				vevent({
					start: { iso: '2026-07-04', tz: null, allDay: true },
					end: { iso: '2026-07-05', tz: null, allDay: true },
				}),
			],
			OPTS,
		);
		expect(c.data.end).toBeNull();
	});

	it('falls back to the default timezone when the event has none', () => {
		const [c] = vEventsToCandidates(
			[vevent({ start: { iso: '2026-06-01T19:00:00', tz: null, allDay: false } })],
			OPTS,
		);
		expect(c.data.timezone).toBe('America/New_York');
	});
});
