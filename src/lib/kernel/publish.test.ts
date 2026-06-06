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
