/**
 * Calendar ingestion tool — fetch an iCal/Google-Calendar URL, parse VEVENTs,
 * and map them to event candidates for review.
 *
 * Provenance: importing someone else's calendar is `proxied` — we relay a
 * third-party source under attribution to its URL. We set that honestly in
 * the candidate (source_method='proxied', source_feed_url=url). The publish
 * adapter handles the current Commons limitation on caller-set proxied.
 */

import { candidateId, type EventCandidate } from '$lib/kernel/candidate.js';
import { assertSafeUrl, safeFetch, readTextCapped } from '$lib/kernel/safe-fetch.js';
import { parseIcal, type ParsedVEvent } from './ical.js';

export interface CalendarConfig {
	url: string;
	/** Default IANA tz for events with floating times (no TZID/Z). */
	defaultTimezone?: string;
}

const GCAL_HOST = 'calendar.google.com';

/** Shown when a Google Calendar link can't be turned into an iCal feed. */
export const GCAL_HELP =
	'That looks like a Google Calendar view link, not its iCal feed. In Google ' +
	'Calendar, open Settings → your calendar → "Integrate calendar" and copy the ' +
	'"Public address in iCal format" (it ends in .ics). Paste that here.';

function icalFeed(calendarId: string): string {
	let id = calendarId;
	try {
		id = decodeURIComponent(calendarId);
	} catch {
		// not valid percent-encoding — use as-is
	}
	return `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`;
}

/** Decode a ?cid= value (base64 / base64url of the calendar id). */
function decodeCid(cid: string): string | null {
	try {
		let b64 = cid.replace(/-/g, '+').replace(/_/g, '/');
		while (b64.length % 4) b64 += '=';
		const decoded = atob(b64);
		if (/@/.test(decoded) || /\.calendar\.google\.com/.test(decoded)) return decoded;
		return null;
	} catch {
		return null;
	}
}

/**
 * Normalize a calendar URL to a fetchable feed. A Google Calendar *view* link
 * (?cid= or /embed?src=) becomes its public .ics feed; an .ics passes through,
 * as does any non-Google URL. Throws GCAL_HELP for a Google link we can't
 * convert (a private calendar, or an app link with no id).
 */
export function toIcalUrl(raw: string): string {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return raw.trim(); // let downstream fetch/validation report the bad URL
	}
	if (u.hostname.toLowerCase() !== GCAL_HOST) return u.toString();
	if (u.pathname.includes('/ical/') && u.pathname.endsWith('.ics')) return u.toString();
	const src = u.searchParams.get('src');
	if (src) return icalFeed(src);
	const cid = u.searchParams.get('cid');
	if (cid) {
		const id = decodeCid(cid);
		if (id) return icalFeed(id);
	}
	throw new Error(GCAL_HELP);
}

export async function produceFromIcal(config: CalendarConfig): Promise<EventCandidate[]> {
	const url = assertSafeUrl(toIcalUrl(config.url)).toString();
	const defaultTz = config.defaultTimezone ?? 'America/New_York';

	const res = await safeFetch(url, {
		headers: { Accept: 'text/calendar, text/plain, */*' },
		signal: AbortSignal.timeout(20000),
	});
	if (!res.ok) {
		throw new Error(
			`Couldn't fetch that calendar (${res.status}). If it's a Google Calendar, only "public" calendars expose an iCal feed.`,
		);
	}
	const text = await readTextCapped(res);
	if (!text.includes('BEGIN:VCALENDAR')) {
		throw new Error(
			"That URL didn't return an iCalendar feed. If it's a Google Calendar, use the " +
				'"Public address in iCal format" from Settings → "Integrate calendar" (it ends in .ics).',
		);
	}

	return vEventsToCandidates(parseIcal(text), { url, defaultTz });
}

/**
 * iCal all-day DTEND is EXCLUSIVE (a one-day event on the 4th carries DTEND
 * of the 5th). Convert to the inclusive last day; a span that collapses to
 * the start date becomes no end at all.
 */
function inclusiveAllDayEnd(endIso: string, startIso: string): string | null {
	const d = new Date(`${endIso}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return endIso; // malformed — surfaced at review/publish
	d.setUTCDate(d.getUTCDate() - 1);
	const inclusive = d.toISOString().slice(0, 10);
	return inclusive <= startIso.slice(0, 10) ? null : inclusive;
}

/** Pure mapper from parsed VEVENTs to candidates (exported for tests). */
export function vEventsToCandidates(
	events: ParsedVEvent[],
	opts: { url: string; defaultTz: string },
): EventCandidate[] {
	const now = new Date().toISOString();

	return events
		.filter((v) => v.summary && v.start)
		.map((v, i) => ({
			// Content-hashed, not the raw UID: RFC 5545 recurrence instances share
			// a UID, and a raw-UID id became a colliding external_id on publish —
			// the exact bug candidateId() exists to prevent. The UID still seeds
			// the hash so re-imports stay stable.
			id: candidateId('calendar', i, v.uid, v.summary, v.start?.iso, v.location),
			kind: 'event' as const,
			status: 'pending' as const,
			source_tool: 'calendar',
			source_uri: opts.url,
			created_at: now,
			data: {
				name: v.summary as string,
				start: (v.start as NonNullable<typeof v.start>).iso,
				timezone: (v.start as NonNullable<typeof v.start>).tz ?? opts.defaultTz,
				end:
					v.end?.allDay && v.start
						? inclusiveAllDayEnd(v.end.iso, v.start.iso)
						: (v.end?.iso ?? null),
				category: 'community', // operator re-categorizes in review
				description: v.description,
				location: {
					name: v.location ?? '',
					address: null,
					lat: null,
					lng: null,
				},
				organizer_name: null,
				image_url: null,
				source_method: 'proxied' as const,
				source_feed_url: opts.url,
			},
		}));
}
