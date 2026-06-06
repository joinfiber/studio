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
import { assertSafeUrl, safeFetch } from '$lib/kernel/tool.js';
import { parseIcal } from './ical.js';

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
	const text = await res.text();
	if (!text.includes('BEGIN:VCALENDAR')) {
		throw new Error(
			"That URL didn't return an iCalendar feed. If it's a Google Calendar, use the " +
				'"Public address in iCal format" from Settings → "Integrate calendar" (it ends in .ics).',
		);
	}

	const now = new Date().toISOString();

	return parseIcal(text)
		.filter((v) => v.summary && v.start)
		.map((v, i) => ({
			id: v.uid?.trim() || candidateId('calendar', i, v.summary, v.start?.iso, v.location),
			kind: 'event' as const,
			status: 'pending' as const,
			source_tool: 'calendar',
			source_uri: url,
			created_at: now,
			data: {
				name: v.summary as string,
				start: (v.start as NonNullable<typeof v.start>).iso,
				timezone: (v.start as NonNullable<typeof v.start>).tz ?? defaultTz,
				end: v.end?.iso ?? null,
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
				source_method: 'proxied',
				source_feed_url: url,
			},
		}));
}
