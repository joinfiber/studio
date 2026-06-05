import { describe, it, expect } from 'vitest';
import {
	parseOsmHours,
	weekFromGooglePeriods,
	weekToSpec,
	weekFromSpec,
	hasAnyHours,
	applyToWeekdays,
	applyToAll,
	emptyWeek,
	isValidTime,
	type WeekHours,
} from './hours.js';

const open = (open: string, close: string) => ({ closed: false, open, close });
const closed = { closed: true, open: '', close: '' };

describe('parseOsmHours', () => {
	it('parses a day range with one interval, closing unlisted days', () => {
		expect(parseOsmHours('Mo-Fr 09:00-17:00')).toEqual([
			open('09:00', '17:00'),
			open('09:00', '17:00'),
			open('09:00', '17:00'),
			open('09:00', '17:00'),
			open('09:00', '17:00'),
			closed,
			closed,
		]);
	});

	it('parses multiple semicolon rules incl. explicit off', () => {
		const w = parseOsmHours('Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off')!;
		expect(w[4]).toEqual(open('09:00', '17:00'));
		expect(w[5]).toEqual(open('10:00', '14:00'));
		expect(w[6]).toEqual(closed);
	});

	it('expands 24/7 to every day', () => {
		const w = parseOsmHours('24/7')!;
		expect(w.every((d) => !d.closed && d.open === '00:00' && d.close === '24:00')).toBe(true);
	});

	it('handles comma day lists and pads single-digit hours', () => {
		const w = parseOsmHours('Mo,We,Fr 8:00-22:00')!;
		expect(w[0]).toEqual(open('08:00', '22:00'));
		expect(w[1]).toEqual(closed);
		expect(w[2]).toEqual(open('08:00', '22:00'));
	});

	it('collapses a lunch break to the open–close envelope', () => {
		const w = parseOsmHours('Mo 09:00-12:00,13:00-17:00')!;
		expect(w[0]).toEqual(open('09:00', '17:00'));
	});

	it('returns null for unparseable free text', () => {
		expect(parseOsmHours('by appointment')).toBeNull();
		expect(parseOsmHours('')).toBeNull();
	});
});

describe('weekFromGooglePeriods', () => {
	it('maps Google Sunday-indexed periods to Monday-indexed week', () => {
		// Google: Mon(1) 09:00-17:00, Sun(0) 12:00-16:00
		const w = weekFromGooglePeriods([
			{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
			{ open: { day: 0, hour: 12, minute: 0 }, close: { day: 0, hour: 16, minute: 0 } },
		]);
		expect(w[0]).toEqual(open('09:00', '17:00')); // Monday
		expect(w[6]).toEqual(open('12:00', '16:00')); // Sunday
		expect(w[1]).toEqual(closed); // Tuesday untouched
	});

	it('treats a missing close as open-24h and clamps cross-midnight', () => {
		const open24 = weekFromGooglePeriods([{ open: { day: 1, hour: 0, minute: 0 } }]);
		expect(open24[0]).toEqual(open('00:00', '24:00'));
		const overnight = weekFromGooglePeriods([
			{ open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
		]);
		expect(overnight[4]).toEqual(open('20:00', '24:00')); // Friday clamps to 24:00
	});
});

describe('weekToSpec / weekFromSpec', () => {
	it('serializes only open days to schema.org specs', () => {
		const w = emptyWeek();
		w[0] = open('09:00', '17:00');
		w[5] = open('10:00', '14:00');
		expect(weekToSpec(w)).toEqual([
			{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Monday', opens: '09:00', closes: '17:00' },
			{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '10:00', closes: '14:00' },
		]);
	});

	it('round-trips through a spec, tolerating schema.org URL dayOfWeek', () => {
		const spec = [
			{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Monday', opens: '09:00', closes: '17:00' },
		];
		const w = weekFromSpec(spec);
		expect(w[0]).toEqual(open('09:00', '17:00'));
		expect(weekToSpec(w)[0].dayOfWeek).toBe('Monday');
	});

	it('weekFromSpec ignores non-array / junk input', () => {
		expect(weekFromSpec(null)).toEqual(emptyWeek());
		expect(weekFromSpec('nope')).toEqual(emptyWeek());
	});
});

describe('helpers', () => {
	it('hasAnyHours reflects whether real intervals exist', () => {
		expect(hasAnyHours(emptyWeek())).toBe(false);
		const w = emptyWeek();
		w[2] = open('11:00', '15:00');
		expect(hasAnyHours(w)).toBe(true);
	});

	it('applyToWeekdays copies Mon onto Mon–Fri only', () => {
		const w = emptyWeek();
		w[0] = open('09:00', '17:00');
		const r = applyToWeekdays(w, 0) as WeekHours;
		expect(r.slice(0, 5).every((d) => d.open === '09:00' && d.close === '17:00')).toBe(true);
		expect(r[5]).toEqual({ closed: false, open: '', close: '' }); // Sat untouched
	});

	it('applyToAll copies one day onto all seven', () => {
		const w = emptyWeek();
		w[3] = open('07:00', '23:00');
		const r = applyToAll(w, 3) as WeekHours;
		expect(r.every((d) => d.open === '07:00' && d.close === '23:00')).toBe(true);
	});

	it('isValidTime accepts HH:MM incl. 24:00, rejects junk', () => {
		expect(isValidTime('09:00')).toBe(true);
		expect(isValidTime('24:00')).toBe(true);
		expect(isValidTime('9:00')).toBe(true);
		expect(isValidTime('25:00')).toBe(false);
		expect(isValidTime('noon')).toBe(false);
	});
});
