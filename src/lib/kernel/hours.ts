/**
 * Opening-hours model + converters.
 *
 * The editor model is one interval per day (`WeekHours`) — the common case, and
 * fast to hand-edit. OSM and Google can carry multiple intervals per day (e.g. a
 * lunch break); those collapse to the first interval, which the operator can
 * adjust. Serializes to schema.org `OpeningHoursSpecification` for the Commons
 * (`Organization.openingHoursSpecification`). Pure — no I/O, fully testable.
 */

export const DAYS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday',
] as const;

/** One day. `open`/`close` are "HH:MM" (24h); empty when unset. */
export interface DayHours {
	closed: boolean;
	open: string;
	close: string;
}
/** Length 7, index 0 = Monday … 6 = Sunday. */
export type WeekHours = DayHours[];

export interface OpeningHoursSpec {
	'@type': 'OpeningHoursSpecification';
	dayOfWeek: string;
	opens: string;
	closes: string;
}

export function emptyWeek(): WeekHours {
	return DAYS.map(() => ({ closed: false, open: '', close: '' }));
}

const HHMM = /^([01]?\d|2[0-4]):([0-5]\d)$/;
export function isValidTime(s: string): boolean {
	return HHMM.test(s.trim());
}
function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/** Some real hours exist (an open day with both ends set). */
export function hasAnyHours(week: WeekHours): boolean {
	return week.some((d) => !d.closed && isValidTime(d.open) && isValidTime(d.close));
}

/** Editor convenience: copy day `from` onto every weekday (Mon–Fri). */
export function applyToWeekdays(week: WeekHours, from: number): WeekHours {
	const src = week[from];
	return week.map((d, i) => (i <= 4 ? { ...src } : d));
}
/** Editor convenience: copy day `from` onto all seven days. */
export function applyToAll(week: WeekHours, from: number): WeekHours {
	const src = week[from];
	return week.map(() => ({ ...src }));
}

// ── OSM `opening_hours` → WeekHours ────────────────────────────────────────
// Pragmatic subset of the OSM spec: semicolon-separated rules of
// `<days> <times>`, day codes Mo,Tu,We,Th,Fr,Sa,Su (ranges + comma lists),
// `HH:MM-HH:MM` times (multiple collapse to earliest open–latest close), `24/7`,
// and `off`/`closed`. OSM
// treats unlisted days as closed, so a successful parse closes the rest.
// Anything it can't read returns null (don't guess — let the operator type).

const OSM_DAY: Record<string, number> = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };
const OSM_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function parseDayCodes(spec: string): number[] | null {
	const out = new Set<number>();
	for (const part of spec.split(',')) {
		const p = part.trim();
		const range = p.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/);
		if (range) {
			const a = OSM_ORDER.indexOf(range[1]);
			const b = OSM_ORDER.indexOf(range[2]);
			if (a < 0 || b < 0) return null;
			// Inclusive range, wrapping (e.g. Sa-Mo).
			for (let i = a; ; i = (i + 1) % 7) {
				out.add(i);
				if (i === b) break;
			}
		} else if (p in OSM_DAY) {
			out.add(OSM_DAY[p]);
		} else {
			return null;
		}
	}
	return [...out];
}

function parseTimeRange(spec: string): { open: string; close: string } | null {
	// Several comma-separated intervals (e.g. a lunch break, "09:00-12:00,
	// 13:00-17:00") collapse to the day's envelope: earliest open → latest close.
	// The single-interval model can't hold a gap; the envelope is the most useful
	// starting point for the operator to adjust.
	let open: string | null = null;
	let close: string | null = null;
	for (const part of spec.split(',')) {
		const m = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
		if (!m) continue;
		const o = `${pad(+m[1])}:${m[2]}`;
		const c = `${pad(+m[3])}:${m[4]}`;
		if (!isValidTime(o) || !isValidTime(c)) continue;
		if (open === null) open = o;
		close = c;
	}
	return open && close ? { open, close } : null;
}

export function parseOsmHours(raw: string): WeekHours | null {
	const text = raw.trim();
	if (!text) return null;
	if (text === '24/7') {
		return DAYS.map(() => ({ closed: false, open: '00:00', close: '24:00' }));
	}

	const week = DAYS.map(() => ({ closed: true, open: '', close: '' }));
	let matchedAny = false;

	for (const rawRule of text.split(';')) {
		const rule = rawRule.trim();
		if (!rule) continue;
		// Split into the leading day spec and the remainder (times or off).
		const m = rule.match(/^([A-Za-z,\- ]+?)\s+(.+)$/);
		if (!m) continue;
		const days = parseDayCodes(m[1].replace(/\s+/g, ''));
		if (!days) continue;
		const rest = m[2].trim().toLowerCase();

		if (rest === 'off' || rest === 'closed') {
			for (const d of days) week[d] = { closed: true, open: '', close: '' };
			matchedAny = true;
			continue;
		}
		const times = parseTimeRange(m[2]);
		if (!times) continue;
		for (const d of days) week[d] = { closed: false, open: times.open, close: times.close };
		matchedAny = true;
	}

	return matchedAny ? week : null;
}

// ── Google Places (New) regularOpeningHours.periods → WeekHours ─────────────
// Google day: 0=Sunday … 6=Saturday. A period with an open and no close means
// "open 24 hours". A cross-midnight close (e.g. Fri 20:00 → Sat 02:00) keeps its
// real time on the open day — schema.org reads `closes < opens` as next-day.

export interface GooglePeriodPoint {
	day?: number;
	hour?: number;
	minute?: number;
}
export interface GooglePeriod {
	open?: GooglePeriodPoint;
	close?: GooglePeriodPoint;
}

function googleDayToIndex(d: number): number {
	return (d + 6) % 7; // Sun(0)->6, Mon(1)->0, … Sat(6)->5
}
function pointTime(p?: GooglePeriodPoint): string | null {
	if (!p || !Number.isFinite(p.hour)) return null;
	return `${pad(p.hour ?? 0)}:${pad(p.minute ?? 0)}`;
}

export function weekFromGooglePeriods(periods: GooglePeriod[]): WeekHours {
	// Google encodes a 24/7 venue as a single period opening Sunday 00:00 with no
	// close — expand it to all seven days (otherwise only Sunday would fill).
	const only = periods.length === 1 ? periods[0] : null;
	if (only && only.open?.day === 0 && (only.open?.hour ?? 0) === 0 && !only.close) {
		return DAYS.map(() => ({ closed: false, open: '00:00', close: '24:00' }));
	}

	const week = DAYS.map(() => ({ closed: true, open: '', close: '' }));
	for (const period of periods) {
		const od = period.open?.day;
		if (!Number.isFinite(od)) continue;
		const idx = googleDayToIndex(od as number);
		if (!week[idx].closed) continue; // first interval for the day wins
		const open = pointTime(period.open) ?? '00:00';
		// No close → open 24h. A cross-midnight close keeps its real time (a venue
		// open 16:00–02:00 stores close 02:00, not a clamped 24:00).
		const close = pointTime(period.close) ?? '24:00';
		week[idx] = { closed: false, open, close };
	}
	return week;
}

// ── WeekHours ↔ schema.org OpeningHoursSpecification ────────────────────────

export function weekToSpec(week: WeekHours): OpeningHoursSpec[] {
	const out: OpeningHoursSpec[] = [];
	week.forEach((d, i) => {
		if (d.closed || !isValidTime(d.open) || !isValidTime(d.close)) return;
		out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAYS[i], opens: d.open, closes: d.close });
	});
	return out;
}

export function weekFromSpec(spec: unknown): WeekHours {
	const week = emptyWeek();
	if (!Array.isArray(spec)) return week;
	for (const raw of spec) {
		const e = raw as { dayOfWeek?: unknown; opens?: unknown; closes?: unknown };
		const dows = Array.isArray(e.dayOfWeek) ? e.dayOfWeek : [e.dayOfWeek];
		for (const dow of dows) {
			if (typeof dow !== 'string') continue;
			const name = dow.split('/').pop() ?? dow; // tolerate schema.org URLs
			const i = DAYS.indexOf(name as (typeof DAYS)[number]);
			if (i < 0) continue;
			const open = typeof e.opens === 'string' ? e.opens.slice(0, 5) : '';
			const close = typeof e.closes === 'string' ? e.closes.slice(0, 5) : '';
			week[i] = { closed: !(open && close), open, close };
		}
	}
	return week;
}
