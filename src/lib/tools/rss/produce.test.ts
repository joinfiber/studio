import { describe, it, expect } from 'vitest';
import { toInstant } from './produce.js';

describe('toInstant (RSS feed date → instant)', () => {
	it('preserves the true instant from a date with an offset (no day/time drift)', () => {
		// 8pm EDT is midnight UTC the next day — kept as the instant, NOT
		// re-emitted as a floating 00:00 wall-clock on the wrong day.
		expect(toInstant('Thu, 21 May 2026 20:00:00 -0400')).toBe('2026-05-22T00:00:00.000Z');
	});

	it('passes a UTC instant through unchanged', () => {
		expect(toInstant('2026-05-21T19:00:00Z')).toBe('2026-05-21T19:00:00.000Z');
	});

	it('returns null for missing or unparseable dates', () => {
		expect(toInstant(null)).toBeNull();
		expect(toInstant('not a date')).toBeNull();
	});
});
